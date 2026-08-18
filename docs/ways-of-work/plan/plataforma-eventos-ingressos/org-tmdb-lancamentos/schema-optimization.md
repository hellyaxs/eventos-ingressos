# Schema optimization — Cena (PostgreSQL + Prisma)

Anexo técnico do PRD [`prd.md`](./prd.md). Aplica o fluxo de otimização Postgres: tipos certos, PKs, FKs indexadas, unique de e-mail, unique parcial de reserva.

**Banco alvo:** PostgreSQL 16 (Compose local). Prisma 6. Sem partição e sem RLS neste corte.

---

## 1. Assessment (estado atual)

| Problema | Onde | Efeito |
|----------|------|--------|
| PK `String @default(cuid())` → coluna `TEXT` | todas as tabelas | 25+ bytes, comparação mais cara que `uuid` (16 bytes) ou `bigint` (8) |
| CUID não é UUID | IDs na API | tipo errado no Postgres; sem `uuid` ops/`gen_random_uuid()` |
| UUIDv4-like aleatório (CUID) em PK | Event, Ticket, Reservation | inserts espalhados no índice B-tree |
| `email String @unique` em `TEXT` | `User` | unique **já existe**, mas `Org@` vs `org@` passam |
| `DateTime` sem `@db.Timestamptz` | todos os timestamps | `timestamp without time zone` |
| FK sem índice | `Event.organizerId`, `Payment.userId`, `Ticket.paymentId`, `GateScan.ticketId`, `GateScan.scannedBy` | JOIN/CASCADE em seq scan |
| Unique `(eventId, seatId)` absoluto | `Reservation` | HOLD expirado **impede** nova reserva do mesmo assento |
| `tmdbId` só em `externalRef` texto | `Event` | filtro/índice por filme frágil |
| `Seat` 80+ linhas por evento | PK TEXT | pior candidato a UUID; identity é o certo |

Pontos que **já estão ok:** `User.email` unique; `@@index([status, startsAt])` em Event; unique de assento `(eventId,row,col)` e `(eventId,label)`; `Ticket.code` unique; `Reservation @@index([userId])` e `([status, expiresAt])`.

---

## 2. Estratégia de PK (quando UUID vs identity)

Regra Postgres: **identity para tabelas internas de alto insert**; **UUID só onde o ID sai na API / é federado**.

| Tabela | PK nova | Por quê |
|--------|---------|---------|
| `User` | `UUID` | exposto em JWT `sub` |
| `Event` | `UUID` | rotas `/events/:id` |
| `Reservation` | `UUID` | checkout `reservationIds` |
| `Payment` | `UUID` | poll `/payments/:id` |
| `Ticket` | `UUID` | share/gate indireto; `code` continua unique de negócio |
| `Seat` | `BIGINT GENERATED ALWAYS AS IDENTITY` | 80–N inserts por evento; ID interno (API pode expor string decimal) |
| `GateScan` | `BIGINT GENERATED ALWAYS AS IDENTITY` | log append-only |

Prisma (UUID):

```prisma
id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
```

Prisma (identity):

```prisma
id BigInt @id @default(autoincrement()) // gera IDENTITY; documentar @db.BigInt
```

Na API HTTP, `Seat.id` passa a ser string decimal (`"1024"`) para não quebrar JSON. Front já trata `seat.id` como string.

**Não usar** `serial`. **Não manter** CUID em `TEXT`. UUIDv7 só se o cluster for PG18+ (`uuidv7()`); no Compose atual, `gen_random_uuid()` é o default aceitável para o volume do desafio.

---

## 3. E-mail unique (case-insensitive)

O `@unique` atual é *case-sensitive*. Login já faz `toLowerCase()`, mas um insert direto no banco ainda duplica.

Opção A (sem extensão) — preferida:

```sql
CREATE UNIQUE INDEX user_email_lower_idx ON "User" (LOWER(email));
-- drop unique antigo em (email) depois de backfill LOWER
```

Opção B: `CREATE EXTENSION citext` + coluna `CITEXT`.

App: continuar gravando `email.toLowerCase()`. Seed e testes usam minúsculas.

---

## 4. Tipos e colunas novas

```prisma
model Event {
  id           String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizerId  String      @db.Uuid
  tmdbId       Int
  externalRef  String      @unique // "tmdb:{id}"
  title        String
  description  String?
  posterUrl    String      // NOT NULL nos eventos novos; backfill placeholder nos seeds velhos
  venue        String
  startsAt     DateTime    @db.Timestamptz
  capacity     Int
  priceCents   Int
  // ...
  @@index([organizerId])
  @@index([tmdbId])
  @@index([status, startsAt])
}

model Seat {
  id      BigInt @id @default(autoincrement())
  eventId String @db.Uuid
  // label, row, col inalterados
  @@index([eventId])
}
```

`posterUrl` e `tmdbId` **NOT NULL** após backfill. Seeds: um filme fixture (ex. Inception / TMDb 27205) + URL de poster.

Demais `DateTime` → `@db.Timestamptz`.

---

## 5. Índices (query paths reais)

| Query | Índice |
|-------|--------|
| `Event` where `organizerId` (`GET /events/mine`) | `Event_organizerId_idx` |
| `Event` where `status, startsAt` (já existe) | manter |
| `Event` where `tmdbId` | `Event_tmdbId_idx` |
| `Payment` where `userId` | `Payment_userId_idx` |
| `Ticket` where `paymentId` | `Ticket_paymentId_idx` (FK) |
| `GateScan` where `ticketId` / `scannedBy` | dois B-trees |
| Login `LOWER(email)` | unique expression |
| Reserva ativa por assento | **partial unique** abaixo |

Unique parcial (substitui `@@unique([eventId, seatId])` absoluto):

```sql
CREATE UNIQUE INDEX reservation_active_seat_idx
  ON "Reservation" ("eventId", "seatId")
  WHERE status IN ('HOLD', 'CONVERTED');
```

Assim `EXPIRED`/`CANCELLED` não ocupam o unique. A API já marca HOLD vencido como `EXPIRED` antes de criar; o índice alinha o modelo ao fluxo.

Covering extra (`INCLUDE`) **não** neste corte — listagens já fazem `select` estreito.

---

## 6. Queries a validar com `EXPLAIN (ANALYZE, BUFFERS)`

Depois da migration, no Compose:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, title, "posterUrl", "startsAt"
FROM "Event"
WHERE status = 'PUBLISHED'
ORDER BY "startsAt" ASC
LIMIT 12;
-- esperado: Index Scan em Event_status_startsAt_idx

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, title, status
FROM "Event"
WHERE "organizerId" = $1
ORDER BY "createdAt" DESC
LIMIT 12;
-- esperado: Index Scan em Event_organizerId_idx
```

Seq Scan nesses dois caminhos = índice faltando ou estatística velha (`ANALYZE`).

---

## 7. Migration (ordem segura)

1. `CREATE EXTENSION IF NOT EXISTS pgcrypto;` (para `gen_random_uuid()` se não estiver em PG13+ built-in).
2. Adicionar colunas novas nullable (`tmdbId`, tipos novos em paralelo **não** — PKs UUID exigem rewrite).
3. **Estratégia prática no desafio (volume pequeno, seed recreável):**
   - Preferir `prisma migrate` com **reset local** (`docker compose down -v` + migrate + seed) em vez de dual-write.
   - Se houver dados de demo a preservar: tabela sombra UUID, backfill, rename (fora do prazo típico do desafio).
4. Recriar FKs apontando para UUID/bigint.
5. Unique `LOWER(email)`; dropar unique case-sensitive.
6. Unique parcial de reserva; dropar unique antigo `(eventId, seatId)`.
7. `ANALYZE` em todas as tabelas.

**Quebra de contrato:** clientes HTTP passam a ver UUID canônico (`8-4-4-4-12`) em vez de CUID. Front já trata id como string opaca. `Seat.id` vira `"123"` (bigint). Ajustar testes e2e que geram/consomem ids.

---

## 8. Fora deste corte (não fazer agora)

- `shared_buffers` / `work_mem` de produção (Compose default basta)
- Autovacuum custom, Grafana, `pg_stat_statements` obrigatório
- Partition `GateScan` por mês
- RLS por `organizer_id`
- Trocar `priceCents Int` por `NUMERIC` (centavos inteiros já são exatos)

---

## 9. Checklist

- [ ] PKs `User`/`Event`/`Reservation`/`Payment`/`Ticket` = `uuid`
- [ ] PKs `Seat`/`GateScan` = `bigint identity`
- [ ] Unique `LOWER(email)`
- [ ] FK indexes listados na §5
- [ ] `timestamptz` em timestamps
- [ ] `Event.tmdbId` + `posterUrl` NOT NULL pós-backfill
- [ ] Unique parcial de reserva ativa
- [ ] Seed com filme + poster
- [ ] `EXPLAIN` das duas queries da §6 sem Seq Scan
