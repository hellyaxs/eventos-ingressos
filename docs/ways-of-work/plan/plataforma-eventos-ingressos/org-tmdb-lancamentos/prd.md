# PRD — Cadastro de evento a partir de lançamentos TMDb

## 1. Feature Name

**Cadastro de evento em `/org` com filme de lançamento (TMDb) e thumbnail no card**

O organizador escolhe um filme em cartaz/estreia no The Movie Database, preenche os dados da sessão e publica. O poster oficial vira a thumbnail do evento em todas as listagens.

Documento técnico complementar: [`schema-optimization.md`](./schema-optimization.md) (UUID nativo, identity, FKs indexadas, e-mail unique case-insensitive).

---

## 2. Epic

| Documento | Referência |
|-----------|------------|
| Epic PRD | [`../mvp-core/prd.md`](../mvp-core/prd.md) |
| Architecture | [`../mvp-core/architecture.md`](../mvp-core/architecture.md) |
| Task plan | [`../mvp-core/task-plan.md`](../mvp-core/task-plan.md) |
| Design system | [`../../../../../DESIGN.md`](../../../../../DESIGN.md) |
| Schema (este corte) | [`schema-optimization.md`](./schema-optimization.md) |

**Epic:** Plataforma de Eventos e Ingressos (Cena) — Desafio Elite Dev 2026.

**Tela:** `http://localhost:5173/org` (rota `/org`, papel `ORGANIZER`).

**Estado atual (gap):** `/org` já pesquisa TMDb, persiste `tmdb:{id}` em `externalRef` e envia `posterUrl` no create. Falta: vitrine de **lançamentos** (now playing / upcoming), associação **obrigatória**, poster como contrato visível no card público, e endurecimento do schema PostgreSQL (PKs em `TEXT`/CUID, FKs sem índice, timestamps sem timezone).

---

## 3. Goal

### Problem

O organizador precisa montar uma sessão de cinema a partir de um filme **real e em evidência**, não de um título digitado à mão. Hoje a tela `/org` só revela o catálogo depois de uma busca; lançamentos em cartaz não aparecem sozinhos. A associação com o TMDb ainda é frágil: `tmdbId` é opcional, `externalRef` cai em UUID opaco se o filme não for escolhido, e o poster pode faltar — o card público fica sem thumbnail ou com placeholder. No banco, IDs `cuid()` ocupam `TEXT`, FKs críticas (ex.: `Event.organizerId`) não têm índice, e o e-mail unique não é case-insensitive no Postgres.

### Solution

`/org` abre com uma grade de **filmes em lançamento** (TMDb `now_playing` + `upcoming`, `language=pt-BR`). O organizador seleciona um filme, o formulário herda título + poster + `tmdbId`, preenche local/data/preço/mapa e publica. O `posterUrl` oficial é persistido e renderizado no card de `/events` (e nas demais superfícies que já leem `posterUrl`). Em paralelo, o schema migra PKs expostas para `UUID`, tabelas de alto volume para `BIGINT IDENTITY`, e-mail unique via `lower(email)`, e índices em toda FK.

### Impact

| Métrica / resultado | Como avaliar |
|---------------------|--------------|
| Associação TMDb visível | 100% dos eventos novos têm `tmdbId` + `posterUrl` |
| Thumbnail no card | Card em `/events` mostra poster w500/w780, não só inicial |
| Tempo para criar sessão | Organizador publica sem digitar o título do filme |
| Integridade de login | Dois e-mails que só diferem em caixa não passam no unique |
| Leituras de listagem | `GET /events` e `GET /events/mine` usam índice de FK/status |

---

## 4. User Personas

### P1 — Organizador(a)

Cria sessões a partir de filmes em cartaz. Precisa ver posters, confirmar o filme certo e publicar rápido na mesma página (scroll, sem modal).

### P2 — Cliente

Na listagem pública, reconhece o evento pelo cartaz do filme, não só pelo texto.

### P3 — Avaliador(a) *(secundária)*

Percorre `/org` com seed `org@eventos.local` / `secret123`, mesmo sem `TMDB_API_KEY` (fixtures de lançamento).

---

## 5. User Stories

1. Como **organizador**, quero ver filmes de lançamento ao abrir `/org`, para escolher um cartaz sem precisar saber o título de antemão.
2. Como **organizador**, quero buscar por nome quando o filme não estiver na vitrine, para associar qualquer título do TMDb.
3. Como **organizador**, quero que ao selecionar o filme o título e a thumbnail preencham o formulário, para não copiar dados à mão.
4. Como **organizador**, quero definir local, data, preço, capacidade e grade de assentos na mesma página, para publicar a sessão com scroll vertical.
5. Como **organizador**, quero que a criação **exija** um filme associado, para nenhum evento nascer sem origem TMDb.
6. Como **cliente**, quero ver o poster do filme no card do evento em `/events`, para reconhecer a sessão de relance.
7. Como **organizador**, quero listar e editar meus eventos sem perder o poster já associado, para corrigir venue/horário/preço.
8. Como **sistema**, quero persistir `tmdbId` + URL absoluta do poster, para o card não depender de uma nova chamada ao TMDb.
9. Como **sistema**, quero IDs `UUID` nativos nas entidades expostas na API e `BIGINT IDENTITY` em assentos/scans, para o Postgres indexar e juntar mais barato que `TEXT`.
10. Como **sistema**, quero e-mail unique case-insensitive, para `Org@eventos.local` e `org@eventos.local` não virarem dois usuários.

---

## 6. Requirements

### 6.1 Functional Requirements

#### FR-ORG — Página `/org`

- **FR-ORG-01:** Acesso só com papel `ORGANIZER` (cookie httpOnly). Demais papéis veem erro de permissão, não o formulário.
- **FR-ORG-02:** Layout em página única com scroll (`DESIGN.md`): vitrine TMDb → formulário `#event-form` → lista “Meus eventos”. Sem modal de criação.
- **FR-ORG-03:** Ao selecionar um filme, a página faz `scrollIntoView` no formulário.
- **FR-ORG-04:** CTA de submit: “Criar e publicar evento”. Após sucesso, redirect para `/events`.
- **FR-ORG-05:** Lista paginada dos eventos do organizador com scroll infinito (contrato `{ items, page, limit, total, hasMore }`).

#### FR-TMDB — Catálogo de lançamentos

- **FR-TMDB-01:** `GET /api/catalog/now-playing?page=&limit=` proxyia TMDb `/movie/now_playing` (`language=pt-BR`). Key só no server.
- **FR-TMDB-02:** `GET /api/catalog/upcoming?page=&limit=` proxyia `/movie/upcoming`.
- **FR-TMDB-03:** `GET /api/catalog/search?q=&page=&limit=` permanece; usado quando o organizador busca.
- **FR-TMDB-04:** `/org` carrega **now playing** por padrão; aba/filtro “Em breve” carrega **upcoming**.
- **FR-TMDB-05:** Cada item de catálogo devolve `{ id, title, poster_path, release_date }`. `poster_path` é URL absoluta `https://image.tmdb.org/t/p/w500{path}` (cards de evento usam a mesma URL persistida).
- **FR-TMDB-06:** Sem `TMDB_API_KEY`, timeout ou HTTP ≠ 2xx: fixtures estáveis de lançamento (mín. 5 filmes com poster).
- **FR-TMDB-07:** Timeout de 4s; paginação alinhada ao contrato `{ items, page, limit, total, hasMore }` (`results` = `items` por compat).

#### FR-ASSOC — Associação filme ↔ evento

- **FR-ASSOC-01:** `POST /api/events` **exige** `tmdbId` (inteiro > 0) e `posterUrl` (URL absoluta https).
- **FR-ASSOC-02:** Persistir `tmdbId` em coluna própria `Event.tmdbId` (Int) **e** `externalRef = tmdb:{id}` (compatível com o que já existe).
- **FR-ASSOC-03:** Persistência do poster em `Event.posterUrl` no create; edição (`PATCH`) pode atualizar poster só se ainda não houver ingressos vendidos, senão mantém o original.
- **FR-ASSOC-04:** Selecionar filme preenche `title` (editável), `posterUrl` e `tmdbId` (não editáveis no form; chips “Filme associado: {title} · TMDb #{id}”).
- **FR-ASSOC-05:** Sem filme selecionado, o submit não dispara (botão desabilitado + mensagem “Selecione um filme de lançamento”).

#### FR-CARD — Thumbnail no card

- **FR-CARD-01:** Card de `/events` usa `event.posterUrl` como `<img>` de capa (altura ~22rem, `object-fit: cover`). Sem poster: fallback com inicial, mas eventos novos desta feature sempre têm poster.
- **FR-CARD-02:** O mesmo `posterUrl` aparece em `/reserve`, `/tickets`, `/share/:token` e na lista “Meus eventos” (`/org`) quando houver poster.
- **FR-CARD-03:** `alt` descritivo: `Cartaz de {title}` (acessível; sem emoji).
- **FR-CARD-04:** Imagens servidas do CDN TMDb; o app não faz upload de arquivo.

#### FR-EVENT — Dados da sessão

- **FR-EVENT-01:** Campos obrigatórios além do filme: `venue`, `startsAt` (datetime-local futuro), `capacity` ≥ 1, `priceCents` ≥ 0, `saleMode` (`SEAT_MAP` no MVP).
- **FR-EVENT-02:** `SEAT_MAP`: `rows` 1–26, `cols` ≥ 1; gerar assentos `A1…` na criação.
- **FR-EVENT-03:** Create grava `DRAFT` e a UI chama `POST /events/:id/publish` em seguida (comportamento atual). Falha de publish deve aparecer na página.

### 6.2 Non-Functional Requirements

#### NFR-UX / DESIGN

- Tokens de `DESIGN.md`: fundo `#0a0a0a`, surface `#1a1a1a`, accent `#0070f3`, erro `#ee0000`. Sem purple, sem glow, sem emoji.
- Grade de filmes: `minmax(10rem, 1fr)`; filme selecionado com borda accent.
- `/org` continua página, não modal.

#### NFR-SEC

- `TMDB_API_KEY` só no server. Front chama `/api/catalog/*`.
- Mutação de eventos exige cookie httpOnly + papel `ORGANIZER`.
- `posterUrl` validado como URL https (rejeitar `javascript:` / relativo).

#### NFR-PERF

- Catálogo: timeout 4s; vitrine inicial ≤ 12 itens.
- Listagens com `skip/take` + `count` (já padronizado).
- Poster no card é URL remota; não baixar blob no API.

#### NFR-DB — Otimização PostgreSQL *(obrigatório neste corte)*

Detalhamento e DDL em [`schema-optimization.md`](./schema-optimization.md). Resumo:

- **PKs expostas na API** (`User`, `Event`, `Reservation`, `Payment`, `Ticket`): tipo nativo `UUID`, não `TEXT` com CUID. Preferir `uuidv7()` (PG18+) ou `gen_random_uuid()` no ambiente atual.
- **PKs internas de alto volume** (`Seat`, `GateScan`): `BIGINT GENERATED ALWAYS AS IDENTITY` (índice sequencial, 8 bytes, melhor localidade que UUID aleatório).
- **E-mail:** manter unique; reforçar com índice `UNIQUE (LOWER(email))` (ou `CITEXT`) para não duplicar caixa. App continua normalizando no login.
- **FKs indexadas** (Postgres não cria sozinho): `Event.organizerId`, `Payment.userId`, `Ticket.paymentId`, `GateScan.ticketId`, `GateScan.scannedBy`.
- **Tempos:** `TIMESTAMPTZ` em todos os `DateTime`.
- **Eventos TMDb:** índice em `Event.tmdbId`; `externalRef` unique.
- **Reserva:** unique parcial `(eventId, seatId) WHERE status IN ('HOLD','CONVERTED')` para expirados não bloquearem o assento para sempre.
- Sem partição nesta fase (volume do desafio << 100M linhas). Sem RLS no MVP (autorização no Nest).

---

## 7. Acceptance Criteria

### US1 — Vitrine de lançamentos

- **Given** organizador autenticado em `/org`
- **When** a página carrega
- **Then** aparece grade de filmes `now_playing` com poster, título e data
- **And** há controle para ver `upcoming`
- **And** sem chave TMDb a grade usa fixtures, sem tela vazia

### US2 — Busca

- **Given** a vitrine visível
- **When** busca por “Inception”
- **Then** `GET /api/catalog/search?q=Inception` preenche a grade
- **And** query vazia não dispara busca (volta à vitrine)

### US3 — Preenchimento por seleção

- **Given** um filme na grade
- **When** o organizador clica no card
- **Then** título, poster e TMDb id vão para o form
- **And** o chip “Filme associado” aparece
- **And** a página rola até `#event-form`

### US4 — Publicar sessão

- **Given** filme selecionado e form válido
- **When** clica em “Criar e publicar evento”
- **Then** `POST /api/events` inclui `tmdbId` + `posterUrl`
- **And** o evento é publicado
- **And** o browser vai para `/events`

### US5 — Associação obrigatória

- **Given** form preenchido **sem** filme
- **When** tenta submeter
- **Then** a UI bloqueia com “Selecione um filme de lançamento”
- **And** a API rejeita create sem `tmdbId`/`posterUrl` (400)

### US6 — Thumbnail no card público

- **Given** evento publicado com `posterUrl`
- **When** cliente abre `/events`
- **Then** o card mostra a imagem do cartaz (não só a inicial)
- **And** o `alt` contém o título

### US7 — Edição preserva poster

- **Given** evento próprio na lista “Meus eventos”
- **When** edita venue/horário/preço
- **Then** `posterUrl` e `tmdbId` permanecem
- **And** o card público continua com o mesmo cartaz

### US8 — Schema UUID / identity / e-mail

- **Given** migration aplicada
- **When** inspecionar colunas PK de `User`/`Event`/`Ticket`
- **Then** o tipo Postgres é `uuid`, não `text`
- **And** `Seat.id` e `GateScan.id` são `bigint identity`
- **And** inserir `ORG@eventos.local` com usuário `org@eventos.local` existente falha no unique
- **And** `EXPLAIN` de `GET /events/mine` usa índice em `organizer_id`

### US9 — Fallback e erro

- **Given** TMDb fora ou timeout
- **When** `/org` pede lançamentos
- **Then** a API 200 com fixtures
- **And** o organizador ainda consegue associar um filme fixture e publicar

---

## 8. Out of Scope

- Upload próprio de imagem / CDN da aplicação
- Trailer, elenco, sinopse longa ou páginas TMDb no cliente
- Ticketmaster, `GA_QTY` como fluxo principal, multi-filme por evento
- Tradução automática além de `language=pt-BR` no proxy
- Cache Redis do TMDb (pode vir depois; NFR atual é timeout + fallback)
- Migrar PKs com downtime zero em produção multi-região (o desafio é single-node)
- Particionamento, RLS, Timescale, `pg_uuidv7` obrigatório (usar `gen_random_uuid()` se o Postgres local < 18)
- Alterar o modelo 1:1 Payment↔Reservation
- Cancelamento com devolução de estoque, mapa realtime, e-mail transacional
