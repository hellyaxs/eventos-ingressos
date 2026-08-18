# Uso de IA — Plataforma de Eventos e Ingressos (MVP)

> Documento atende **AC-DOC-02** (registro de uso de IA e decisões relevantes) do `task-plan.md`.
> Complementa o README raiz e o `architecture.md` (ADRs).

## 1. Ferramentas e agentes de IA usados

| Ferramenta / agente | Uso |
|---------------------|-----|
| Cursor (IDE com IA) | Principal ferramenta de geração e edição de código (assistido) |
| Agentes locais (`~/.opencode`, `~/.cursor` MCP, `~/.crush`, `~/.hive`) | Automação de trabalho: microtasks, verificação, indexação de contexto |
| Claude / LLMs na autocomplete e chat | Código, docs E2E, PRD/arquitetura/plano, refactors guiados e revisões |

## 2. Partes assistidas por IA vs. manuais

| O que | Assistido | Manual |
|-------|-----------|--------|
| PRD, arquitetura, ADRs, plano de ondas (W1–W5) | Rascunho inicial gerado | Revisão, ajustes de escopo e validação de ACs |
| Scaffold do monorepo (pnpm workspaces + Turborepo) | Commands sugeridos | Execução e decisão de estrutura (ADR-001) |
| Código da API (módulos NestJS, Prisma schema, seed) | Geração assistida | Revisão de segurança, SQL de migração e contratos |
| Código web (React + Vite + TanStack) | Rotas/páginas/UI geradas | Verificação de fluxo E2E no browser |
| Testes e2e de API (`apps/api/test/*.e2e-spec.ts`) | Esqueleto gerado | Ajuste das asserções de contrato (seção abaixo) |
| Checklist smoke manual (abaixo) | Transcrito do fluxo E2E | Tem que ser executado por humano |

**Decisão relevante:** o código importado/gerado por IA durante o fluxo **sempre passa por revisão e ajuste prático** — melhorias que a IA sugeriu mas que não faziam parte do MVP foram descartadas (ex.: Nx, `apps/worker` separado, lock distribuído).

## 3. Decisões de projeto (resumo do registro)

Fonte completa: `architecture.md` §2 (ADRs) e `prd.md` §9 (decisões fechadas).

| Decisão | Escolha | Justificativa (resumo) |
|---------|---------|------------------------|
| ADR-001 | **Turborepo** + pnpm workspaces (não Nx) | Setup simples p/ `apps/api` + `apps/web` + `packages/*`; Nx = overhead no prazo |
| ADR-002 | **NestJS modular monolith** | Módulos por domínio (`Auth`, `Catalog`, `Events`, `Reservations`, `Payments`, `Tickets`, `Gate`) |
| ADR-003 | **React + Vite + TanStack** | Rotas tipadas + server state p/ fluxo reserva→pagamento→ingressos sem Redux |
| ADR-004 | **BullMQ worker serial** (`concurrency: 1`) | Pagamento simulado; serialização evita corrida no estoque (trade-off: throughput baixo) |
| ADR-005 | **PostgreSQL + Redis + Prisma** | eventos/reservas/ingressos/usuários no Postgres; Redis p/ fila BullMQ |
| Catálogo (MVP) | **TMDb** | API externa via TMDb (Ticketmaster como evolução); busca server-side |
| Reserva (MVP) | **`SEAT_MAP`** | Mapa de assentos; sem `GENERAL_ADMISSION`/`GA_QTY` no MVP |
| Pagamento | **Mock interno** | Stub em fila; sem gateway real/PIX/cartão/3DS |
| Compartilhamento | **Link com token de leitura** | Sem transferência de ownership |
| Worker | **Mesmo processo** da API | Menos ops; extração p/ `apps/worker` fica para deploy |

## 4. Checklist de smoke manual (transcrito de `e2e-happy-path.md`)

> Requer seed executado: `pnpm --filter @eventos/api prisma:seed` (senha de acesso `secret123`).

- [ ] Login com `org@eventos.local` → dashboard do produtor carrega evento publicado
- [ ] Login com senha errada → mensagem `E-mail ou senha incorretos`, permanece em `/login`
- [ ] `/app` sem token → redireciona para `/login`
- [ ] Reservar 2 assentos → checkout lista 2 → aprovar → 2 ingressos emitidos
- [ ] Rejeitar pagamento → `Pagamento rejeitado — a reserva foi liberada.` e assento volta a `Disponível`
- [ ] Validar na portaria um código de outro evento → `✗ Ingresso não pertence a este evento`
- [ ] Validar código inexistente → `✗ Ingresso inválido`
- [ ] `/gate` sem seleção de evento → validação não dispara (ou erro explícito)

## 5. Contratos da API verificados (resumo)

Fonte: `e2e-happy-path.md` §"Asserções de contrato (backend)".

- `POST /api/auth/login` → `{ token, user: { id, name, email, role, avatar } }`; senha errada → 401 `E-mail ou senha incorretos`
- `POST /api/events/:id/reserve` → `{ reservationIds, expiresAt, seats }`; assento tomado → 409 `Assento indisponível`
- `POST /api/payments` → dedupe por `reservationId`; fora de `HOLD` → 409; expirada → 409 `Reserva expirada`; enfileira `PAYMENT_PROCESS_JOB`
- `GET /api/payments/:id` → inclui `reservation.seat`, `reservation.event.title`, `tickets`
- Worker approve → payment `APPROVED`, reservation `CONVERTED`, 1 ticket por assento
- Worker reject → payment `REJECTED`, reservation `CANCELLED` (hold liberado)
- `GET /api/tickets` → só `CLIENT`; items `{ id, eventId, paymentId, code, shareToken, status, seatLabel, usedAt, createdAt, event }`
- `GET /api/share/:shareToken` → público; 404 `Ingresso não encontrado`
- `POST /api/gate/:eventId/validate` → público, `@HttpCode(200)`; status `VALID` / `INVALID` / `ALREADY_USED` / `WRONG_EVENT`

## 6. Limitações conhecidas (para o humano revisar/gabar na avaliação)

Mesmo conjunto do README raiz (seção "Limitações conhecidas / fora do escopo do MVP"), com uma correção: **a portaria tem validação por câmera** (`gate.tsx` via `QrScanner`, com os status `VALID`/`INVALID`/`ALREADY_USED`/`WRONG_EVENT`) — o fluxo manual continua disponível e o QR ainda não tem visual em "Meus ingressos". Demais limitações: pagamento simulado, sem deploy publicado, catálogo dependente do TMDb (fixtures sem chave), sem recuperação de senha/e-mail transacional, cancelamento pós-pagamento fora do escopo, sem nota fiscal, mapa de assentos estático, busca/filtro leves, aderência ao DESIGN.md em andamento (T-GAP-03).