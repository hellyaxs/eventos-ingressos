# Cena — Plataforma de Eventos e Ingressos

Monorepo Turborepo com API NestJS e frontend React (Vite + TanStack). Organizador publica eventos a partir do catálogo TMDb, cliente reserva assentos e paga (simulado), recebe ingresso com QR e a portaria valida na entrada.

## Stack

| Camada | Tecnologia |
|--------|------------|
| Monorepo | pnpm workspaces + Turborepo |
| API | NestJS 11, Prisma, BullMQ (`concurrency: 1` no pagamento) |
| Web | React 19, Vite, TanStack Router + Query |
| Infra local | Docker Compose → PostgreSQL (`localhost:5433`) + Redis (`localhost:6380`) |
| Catálogo MVP | TMDb (server-side; fallback de fixtures se `TMDB_API_KEY` ausente) |
| Reserva MVP | Mapa de assentos (`SEAT_MAP`) |

## Documentação

- [`docs/ways-of-work/plan/plataforma-eventos-ingressos/mvp-core/prd.md`](docs/ways-of-work/plan/plataforma-eventos-ingressos/mvp-core/prd.md) — produto, ACs e decisões
- [`docs/ways-of-work/plan/plataforma-eventos-ingressos/mvp-core/architecture.md`](docs/ways-of-work/plan/plataforma-eventos-ingressos/mvp-core/architecture.md) — arquitetura e ADRs
- [`docs/ways-of-work/plan/plataforma-eventos-ingressos/mvp-core/task-plan.md`](docs/ways-of-work/plan/plataforma-eventos-ingressos/mvp-core/task-plan.md) — plano de ondas (W1–W5)
- [`docs/ways-of-work/plan/plataforma-eventos-ingressos/mvp-core/e2e-happy-path.md`](docs/ways-of-work/plan/plataforma-eventos-ingressos/mvp-core/e2e-happy-path.md) — fluxo feliz E2E e contrato da API
- [`docs/ways-of-work/plan/plataforma-eventos-ingressos/mvp-core/usage-ia.md`](docs/ways-of-work/plan/plataforma-eventos-ingressos/mvp-core/usage-ia.md) — registro de uso de IA e decisões

## Pré-requisitos

- Node.js 20+
- pnpm 10+
- Docker + Docker Compose

## Setup

```bash
cp .env.example .env
# Preencha TMDB_API_KEY para usar o catálogo real; sem a chave, o backend usa fixtures locais.
# Opcionalmente troque JWT_SECRET e TICKET_HMAC_SECRET.

pnpm install
pnpm db:up

# Aplica migrações e gera o client Prisma
pnpm --filter @eventos/api prisma:migrate

# Semear dados de demonstração (usuários + 1 evento publicado com 80 assentos)
pnpm --filter @eventos/api prisma:seed

pnpm dev
```

> Postgres e Redis sobem em **5433** e **6380** para não conflitar com instâncias locais comuns nas portas padrão. O `.env` é gitignored — comece copiando `.env.example`.

## Portas e endpoints

- Web: http://localhost:5173
- API (prefixo global `/api`): http://localhost:3000
  - `GET /api/health` — healthcheck
  - `POST /api/auth/login` — login; JWT em cookie `httpOnly` (`access_token`). Resposta `{ token, user }` (token só para testes/API; o front usa o cookie).
  - `POST /api/auth/logout` — limpa o cookie
  - `GET /api/auth/me` — sessão atual (cookie ou Bearer)
  - `GET /api/catalog/search?q=...` — busca no TMDb (`language=pt-BR`). Sem `TMDB_API_KEY`, filtra fixtures pelo título.
  - `GET /api/events` e `POST /api/events` — listar/criar eventos (`tmdbId` + `posterUrl` obrigatórios no create → `externalRef: tmdb:{id}`)
  - `GET /api/events/mine` e `PATCH /api/events/:id` — gerenciar eventos do organizador
  - `POST /api/events/:id/reserve` — reservar assentos
  - `POST /api/payments` — pagamento simulado: `{ "reservationIds": ["..."], "simulatedOutcome": "approve" | "reject" }` (também aceita `reservationId` único)
  - `GET /api/tickets` — ingressos do cliente
  - `GET /api/share/:shareToken` — página pública do ingresso
  - `POST /api/gate/:eventId/validate` — validação na portaria (status `VALID` / `INVALID` / `ALREADY_USED` / `WRONG_EVENT`)

## Credenciais de demonstração (seed)

Todas as senhas são `secret123` (`DEMO_PASSWORD` em `apps/api/prisma/seed.ts`).

| Papel | E-mail |
|-------|--------|
| Organizador | `org@eventos.local` |
| Cliente | `cliente1@eventos.local` |
| Cliente | `cliente2@eventos.local` |
| Portaria | `gate@eventos.local` |

O seed cria/atualiza os 4 usuários (idempotente por e-mail) e um evento publicado: **"Showcase de Verão"** na **"Arena Demo"**, começa em +7 dias, 80 assentos (`SEAT_MAP`, fileiras A–H × colunas 1–10), preço R$ 100,00 (`priceCents: 10000`), associado ao filme TMDb `tmdb:155` (The Dark Knight / fixture). Se o evento já existir, o seed só atualiza os dados e não recria assentos.

## Testes

```bash
pnpm test                        # unit via Turborepo (Jest)
pnpm test:e2e                    # e2e da API (Jest, apps/api/test/*.e2e-spec.ts)
pnpm test:e2e:web                # Playwright (web + API já no ar, ou sobe via webServer)
```

`pnpm test:e2e` é o Jest da API (`@eventos/api`). Cobertura: `app`, `auth`, `events`, `gate` e `reservations`.
`pnpm test:e2e:web` é o Playwright (`e2e/happy-path.spec.ts`: cliente → reserva → confirmar compra → QR → share → portaria; `e2e/organizer-seatmap-3d.spec.ts`).

## Scripts úteis

```bash
pnpm dev                        # api + web
pnpm build
pnpm lint
pnpm test
pnpm test:e2e                   # Jest API
pnpm test:e2e:web               # Playwright
pnpm db:up                      # postgres + redis (docker compose)
pnpm db:down
pnpm db:logs
pnpm --filter @eventos/api dev
pnpm --filter @eventos/web dev
pnpm --filter @eventos/api prisma:generate
pnpm --filter @eventos/api prisma:migrate
pnpm --filter @eventos/api prisma:seed
```

## Estrutura do repositório

```text
/
├── apps/
│   ├── api/        # NestJS — módulos auth, catalog, events, reservations, payments, tickets, share, gate, health
│   │   ├── prisma/ # schema, migrações e seed
│   │   └── test/   # e2e specs (Jest)
│   └── web/        # React + Vite + TanStack Router/Query
├── packages/       # (reservado p/ pacotes compartilhados)
├── docs/ways-of-work/plan/plataforma-eventos-ingressos/mvp-core/
├── docker-compose.yml        # postgres (5433) + redis (6380)
├── turbo.json
├── pnpm-workspace.yaml
└── DESIGN.md       # tokens de UI (tema dark, cores, regras)
```

## Rotas (páginas)

| Rota | Quem | O quê |
|------|------|--------|
| `/` | todos | Home + CTAs por papel |
| `/login` | todos | Login. Cliente vai para `/events`; organizador `/org`; portaria `/gate` |
| `/events` | todos | Listagem 4×N + busca |
| `/org` | organizador | Vitrine TMDb (`now_playing` / `upcoming`), filme obrigatório, poster no card; criar/editar (scroll) |
| `/reserve` | cliente | Mapa 3D (ou lista) + HOLD |
| `/checkout` | cliente | Confirmar compra (simulado); não auto-aprova no reload |
| `/tickets` | cliente | QR visual + copiar/abrir share |
| `/share/:token` | público | Ingresso compartilhado |
| `/gate` | portaria | Câmera + digitação |
| `/app` | autenticado | Perfil |

## Limitações conhecidas / fora do escopo do MVP

- **Pagamento é simulado** (fila BullMQ `concurrency: 1`) — sem gateway real, PIX, cartão ou 3DS.
- **Sem deploy publicado** — roda em localhost (deploy era opcional no desafio).
- **Catálogo dependente do TMDb** — sem a chave, usa fixtures de exemplo.
- **Sem recuperação de senha nem e-mail transacional**.
- **Cancelamento pós-pagamento não re-estoca** (hold é liberado no reject).
- **Sem nota fiscal**.
- **Portaria valida QR por câmera (`qr-scanner`) e por digitação**; em Meus ingressos o QR é gerado visualmente a partir do código HMAC.
- **Sessão:** JWT em cookie `httpOnly` (não fica no `localStorage`).
- **Mapa de assentos (`SEAT_MAP`)** — modo pista/`GA_QTY` fora do MVP.
- **Busca/filtro leves** — sem busca avançada.

## Uso de IA

Artefatos de planejamento (PRD/arquitetura/plano/fluxo E2E), scaffold inicial e partes do código foram produzidos com assistência de IA (Cursor + agentes locais). O registro completo de ferramentas, o que foi assistido vs. manual e as decisões relevantes estão em [`usage-ia.md`](docs/ways-of-work/plan/plataforma-eventos-ingressos/mvp-core/usage-ia.md) (atende AC-DOC-02).