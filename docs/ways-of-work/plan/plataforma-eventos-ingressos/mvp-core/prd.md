# PRD — MVP Core: Plataforma de Eventos e Ingressos

## 1. Feature Name

**MVP Core — Plataforma de Eventos e Ingressos (Cena)**

Sistema web full-stack em que organizadores publicam eventos a partir de um catálogo externo (filmes TMDb), clientes reservam e pagam ingressos de forma simulada, e a portaria valida a entrada via QR Code.

---

## 2. Epic

| Documento | Referência |
|-----------|------------|
| Fonte do desafio | [`Desafio-Elite-Dev-2026.pdf`](../../../../../Desafio-Elite-Dev-2026.pdf) |
| Epic PRD | Este documento (raiz do epic greenfield) |
| Architecture | [`architecture.md`](./architecture.md) |
| Task plan | [`task-plan.md`](./task-plan.md) |
| Design system UI | [`DESIGN.md`](../../../../../DESIGN.md) |
| Fluxo E2E | [`e2e-happy-path.md`](./e2e-happy-path.md) |
| Uso de IA | [`usage-ia.md`](./usage-ia.md) |

**Epic:** Plataforma de Eventos e Ingressos (Desafio Elite Dev 2026 — Verzel)

**Horizonte de entrega:** Escopo **B** (MVP obrigatório + diferenciais leves: busca/filtro, testes, doc de IA). UI obrigatoriamente alinhada a `DESIGN.md`.

---

## 3. Goal

### Problem

Organizar e vender ingressos envolve vários atores com necessidades conflitantes: o **organizador** precisa montar eventos com data, local, capacidade e preço a partir de conteúdo real (shows ou filmes); o **cliente** precisa descobrir eventos, reservar sem risco de overselling, pagar e levar um comprovante confiável; a **portaria** precisa validar a entrada de forma rápida e à prova de reutilização/fraude. Soluções genéricas geradas sem decisões de produto tendem a entregar fluxos incompletos e interfaces indiferenciadas.

### Solution

Fluxo completo: catálogo TMDb → criação/publicação de evento → descoberta → reserva `SEAT_MAP` → pagamento simulado via BullMQ (`concurrency: 1`) → ingresso com código não forjável + QR → compartilhamento por link → validação na portaria (câmera + digitação), com três papéis autenticados.

### Impact

| Métrica / resultado | Como avaliar |
|---------------------|--------------|
| Fluxo E2E utilizável | Organizador → cliente → portaria sem setup além do seed |
| Confiabilidade de estoque | Zero venda duplicada do mesmo lugar / ingresso |
| Integridade na entrada | Estados claros; sem revalidação do mesmo ingresso |
| Avaliabilidade do desafio | README + seeds + commits; opcionalmente deploy (+1) |
| Clareza de decisões | Artefatos versionados + `usage-ia.md` |

---

## 4. User Personas

### P1 — Organizador(a)

Cria e publica eventos a partir do TMDb; define data, local, capacidade e preço.

### P2 — Cliente

Navega/busca eventos, reserva assento, paga (simulado), vê ingressos com QR e compartilha por link.

### P3 — Portaria

Valida entrada (câmera QR ou digitação) com retorno inequívoco.

### P4 — Avaliador(a) do desafio *(secundária)*

Clona/roda via README; precisa de seeds e documentação clara.

---

## 5. User Stories

### Autenticação e papéis

1. Como organizador/cliente/portaria, quero autenticar-me com meu papel, para acessar só o permitido.
2. Como avaliador, quero seeds (1 org, 2 clientes, 1 portaria, ≥1 evento), para percorrer o fluxo sem cadastrar tudo.

### Catálogo e eventos

3. Como organizador, quero buscar no TMDb, para montar o evento a partir de um filme real.
4. Como organizador, quero criar/publicar evento com data, local, capacidade e preço.
5. Como organizador, quero listar e gerenciar meus eventos (editar status/dados básicos).

### Descoberta

6. Como cliente, quero navegar eventos publicados (data, local, preço).
7. Como cliente, quero buscar/filtrar eventos.

### Reserva e pagamento

8. Como cliente, quero reservar via mapa de assentos.
9. Como cliente, quero que o mesmo lugar não seja vendido duas vezes.
10. Como cliente, quero pagamento simulado com confirmação **ou** recusa.

### Ingressos

11. Como cliente, quero “Meus ingressos” com **QR visual** do código.
12. Como cliente, quero **link de compartilhamento** gerado pela app (copiável/abrível).
13. Como sistema, quero códigos não forjáveis.

### Portaria

14. Como portaria, quero validar via câmera.
15. Como portaria, quero digitar o código manualmente.
16. Como portaria, quero status VALID / INVALID / ALREADY_USED / WRONG_EVENT.

### Entrega e qualidade

17. Como avaliador, quero README + limitações conhecidas.
18. Como avaliador, quero registro de uso de IA e commits descritivos.
19. Como avaliador, quero 1–2 e2e Playwright no happy path (escopo B/C de testes).

---

## 6. Requirements

### 6.1 Functional Requirements

#### FR-AUTH

- **FR-AUTH-01:** Autenticação com papéis `ORGANIZER`, `CLIENT`, `GATE`.
- **FR-AUTH-02:** Autorização por papel em rotas sensíveis.
- **FR-AUTH-03:** Seeds: 1 org, 2 clientes, 1 portaria, ≥1 evento publicado com assentos.
- **FR-AUTH-04:** *(Planejado)* JWT entregue em cookie `httpOnly` (+ `Secure` em prod, `SameSite=Lax|Strict`); front **não** persiste token em `localStorage`/JS acessível; logout limpa cookie no server.
- **FR-AUTH-05:** *(Planejado)* Pós-login redireciona por papel: `CLIENT` → `/events`; `ORGANIZER` → `/org`; `GATE` → `/gate`.

#### FR-CATALOG

- **FR-CATALOG-01:** Proxy TMDb no server (key não no client); fallback fixtures se sem chave.
- **FR-CATALOG-02:** Organizador pesquisa e seleciona item como base do evento.
- **FR-CATALOG-03:** *(Planejado)* Associação explícita filme↔evento: persistir id TMDb (ex. `externalRef = tmdb:{id}` ou coluna dedicada) + poster/título derivados do filme selecionado.

#### FR-EVENT

- **FR-EVENT-01:** Criar evento (externalRef/TMDb, título, data, local, capacidade, preço, publicação).
- **FR-EVENT-02:** Organizador lista e gerencia eventos (no mínimo: listar próprios + publicar draft).
- **FR-EVENT-02b:** *(Gap)* Editar campos básicos de evento draft/publicado (venue, startsAt, preço) sem quebrar seats já vendidos.
- **FR-EVENT-03:** Cliente vê só `PUBLISHED`.
- **FR-EVENT-04:** Busca/filtro na listagem pública.
- **FR-EVENT-05:** *(Planejado)* Grid da listagem pública **4 × N** no desktop (responsivo 4→2→1).

#### FR-NAV

- **FR-NAV-01:** *(Planejado)* Cada fluxo principal é **página com rota própria** (`/events`, `/org`, `/reserve`, `/tickets`, `/gate`, …).
- **FR-NAV-02:** *(Planejado)* Inserção/edição de dados via formulário na página com **scroll vertical** (sem modal/wizard de criação).

#### FR-RESERVE

- **FR-RESERVE-01:** Modo `SEAT_MAP` (MVP). Diferencial: mapa interativo Three.js + fallback lista.
- **FR-RESERVE-02:** Unicidade de assento (HOLD/UNIQUE + testes).
- **FR-RESERVE-03/04:** Cancelamento pós-venda e mapa realtime — **fora do escopo B**.

#### FR-PAY

- **FR-PAY-01:** Pagamento simulado (BullMQ).
- **FR-PAY-02:** Approve e reject.
- **FR-PAY-03:** Só APPROVED emite ticket utilizável; reject libera HOLD.
- **FR-PAY-04:** *(Planejado)* `POST /payments` aceita **array** `reservationIds[]` (+ `simulatedOutcome`) em **uma** chamada; checkout deixa de fazer N POSTs.

#### FR-TICKET

- **FR-TICKET-01:** Meus ingressos com **imagem QR** do código (não só texto).
- **FR-TICKET-02:** Código HMAC/assinado server-side.
- **FR-TICKET-03:** Link de share absoluto (`/share/:token`) com CTA copiar/abrir.
- **FR-TICKET-04:** Gate rejeita códigos inválidos/forjados.

#### FR-GATE

- **FR-GATE-01..05:** Tela portaria; câmera; digitação; 4 status; sem double-validate.

#### FR-UX-DESIGN *(escopo B)*

- **FR-UX-01:** UI segue `DESIGN.md` (tokens dark Minimal, accent `#0070f3`, sem emoji, sem purple genérico, bordas single-line / radius mínimo).
- **FR-UX-02:** Telas sem hardcode que violem a paleta (ex.: CTA roxo `#7c3aed`, pills arredondadas excessivas).

### 6.2 Non-Functional Requirements

#### NFR-TECH

- React (Vite) + NestJS + PostgreSQL + Redis + Turborepo (fechado).

#### NFR-DELIVERY

- README, seeds, limitações; repo GitHub público + commits; formulário Verzel; deploy opcional (+1).

#### NFR-QUALITY

- Fluxo E2E completo > feature pela metade.
- Testes API e2e nos críticos + **Playwright** 1–2 happy paths.
- Doc de uso de IA versionada.

#### NFR-SECURITY

- Secrets no server; ticket não forjável; auth por papel.
- *(Planejado)* Sessão via cookie `httpOnly` (mitiga vazamento de JWT por XSS). CORS com `credentials` + origin explícito.

#### NFR-UX

- Feedback claro em pagamento e gate; portaria usável em mobile (câmera).
- Cliente autenticado aterrissa primeiro nos eventos disponíveis.

---

## 7. Acceptance Criteria

### AC — Auth e seeds

| ID | Critério | Status |
|----|----------|--------|
| AC-AUTH-01 | Login por papel restringe áreas | **Feito** |
| AC-AUTH-02 | Seed 1 org / 2 clientes / 1 gate / ≥1 evento | **Feito** |
| AC-AUTH-03 | JWT em cookie `httpOnly`; front sem token em `localStorage` | **Planejado** |
| AC-AUTH-04 | Pós-login: CLIENT→`/events`, ORGANIZER→`/org`, GATE→`/gate` | **Planejado** |

### AC — Catálogo e eventos

| ID | Critério | Status |
|----|----------|--------|
| AC-CAT-01 | Busca TMDb (ou fixtures) | **Feito** |
| AC-CAT-02 | Evento persiste associação explícita com filme TMDb | **Planejado** |
| AC-EVT-01 | Publicar → aparece na listagem | **Feito** |
| AC-EVT-02 | Draft não aparece para cliente | **Feito** |
| AC-EVT-03 | Organizador edita dados básicos sem corromper seats vendidos | **Pendente** |
| AC-EVT-04 | Grid listagem pública 4×N (desktop) | **Planejado** |

### AC — Reserva e pagamento

| ID | Critério | Status |
|----|----------|--------|
| AC-RES-01..03 | HOLD + anti-oversell + concorrência | **Feito** (API e2e) |
| AC-PAY-01..02 | Approve emite / reject libera | **Feito** (API e2e) |
| AC-PAY-03 | Uma chamada `POST /payments` com `reservationIds[]` para N ingressos | **Planejado** |

### AC — Navegação / UX produto

| ID | Critério | Status |
|----|----------|--------|
| AC-NAV-01 | Fluxos principais em rotas-página; criar/editar com scroll (sem modal) | **Planejado** |

### AC — Ingressos e share

| ID | Critério | Status |
|----|----------|--------|
| AC-TKT-01 | Meus ingressos mostram **QR visual** do código | **Pendente** (hoje só texto do `code`) |
| AC-TKT-02 | Link `/share/:token` abrível + CTA copiar | **Parcial** (token exibido; falta URL/CTA) |
| AC-TKT-03 | Código adulterado → INVALID | **Feito** |

### AC — Portaria

| ID | Critério | Status |
|----|----------|--------|
| AC-GATE-01..04 | Câmera + manual + 4 estados | **Feito** (UI + API e2e) |

### AC — Entrega / qualidade B

| ID | Critério | Status |
|----|----------|--------|
| AC-DOC-01 | README setup + limitações | **Feito** (atualizar nota da câmera — README desatualizado) |
| AC-DOC-02 | `usage-ia.md` | **Feito** |
| AC-DOC-03 | Repo público + commits descritivos | **A confirmar na entrega** |
| AC-UX-01 | Telas aderentes a `DESIGN.md` | **Parcial** (tokens ok; drift em tickets/CTAs) |
| AC-QA-01 | Playwright: cliente→reserva→QR; portaria VALID | **Pendente** |

---

## 8. Out of Scope

- Nota fiscal, revenda, app nativo, recuperação de senha, e-mail de ingresso
- Pagamento real; Ticketmaster; modo `GA_QTY`
- Cancelamento pós-pagamento com re-estoque; mapa realtime
- Multi-tenancy / i18n completa / cupons
- Deploy *(opcional do desafio; fora do horizonte B obrigatório)*

---

## 9. Decisões fechadas

| Decisão | Escolha |
|--------|---------|
| Monorepo | Turborepo + pnpm |
| Backend | NestJS |
| Frontend | React + Vite + TanStack Query/Router |
| Pagamento | Mock + BullMQ `concurrency: 1` (mesmo processo) |
| Catálogo | TMDb (+ fixtures sem key) |
| Reserva | `SEAT_MAP` (+ mapa 3D Three.js como diferencial) |
| Share | Token de leitura (sem transferir ownership) |
| ORM/DB | Prisma + PostgreSQL + Redis |
| UI | **`DESIGN.md` Minimal** (dark `#0a0a0a`, accent `#0070f3`) |
| Escopo entrega | **B** + testes **C** (API e2e + Playwright) |
| Sessão JWT | **Cookie `httpOnly`** *(planejado; hoje: `localStorage`)* |
| Payments API | **Array `reservationIds[]`** numa chamada *(planejado; hoje: N POSTs)* |
| Navegação | Rotas-página + formulários com scroll *(sem modal de criação)* |
| Listagem | Grid **4 × N** desktop *(planejado)* |
| Redirect login CLIENT | **`/events`** *(planejado; hoje: `/app`)* |
| Associação TMDb | Persistir id do filme no evento *(planejado; hoje: `externalRef` UUID)* |
| Payment batch modelo | **Batch lógico** (1 request → N payments/jobs em série); sem mudar Prisma 1:1 Payment↔Reservation na 1ª entrega |

---

## 10. Comparativo PDF × PRD × código *(2026-08-17)*

Fonte: [`Desafio-Elite-Dev-2026.pdf`](../../../../../Desafio-Elite-Dev-2026.pdf).

| Requisito do PDF | PRD | Código | Gap |
|------------------|-----|--------|-----|
| Navegação + busca eventos (data/local/preço) | FR-EVENT-03/04 | `/events` + filtro | Grid ainda não 4×N |
| Criação e **gerenciamento** pelo organizador | FR-EVENT-02/02b | Criar/publicar em `/org`; sem editar/listar próprios | **T-GAP-05** |
| Reserva mapa **ou** quantidade | `SEAT_MAP` | Mapa 2D/3D | OK (“um dos dois”) |
| Pagamento simulado approve/reject | FR-PAY | BullMQ | OK; falta array (**T-PAY-***) |
| Meus ingressos + **QR** | FR-TICKET-01 | Texto do `code` | **T-GAP-01** |
| Portaria 4 status + câmera + digitar | FR-GATE | Feito | OK |
| API externa TMDb/Ticketmaster | FR-CATALOG | Proxy TMDb | Associação filme fraca (**T-CAT-***) |
| Auth 3 papéis | FR-AUTH | Feito | Cookie httpOnly (**T-SEC-***) |
| Anti-oversell | FR-RESERVE-02 | Feito | OK |
| Código QR não forjável | FR-TICKET-02 | HMAC | OK |
| Share por link | FR-TICKET-03 | Rota parcial | **T-GAP-02** |
| Seeds 1 org / 2 clientes / 1 gate / ≥1 evento | AC-AUTH-02 | Feito | OK |
| README + limitações | NFR-DELIVERY | Parcial | **T-GAP-06** |
| Repo público + formulário | AC-DOC-03 | — | **T-GAP-07** |
| Opcionais (filtro, Docker, testes, deploy) | Escopo B/C | Docker + API e2e; Playwright incompleto | **T-GAP-04** |

**Fora do PDF (manter out of scope):** nota fiscal, revenda, app nativo, recuperação de senha, e-mail.

---

## 11. Status de implementação *(auditoria 2026-08-17)*

### Feito (caminho crítico W0–W4 em grande parte)

| Área | Evidência |
|------|-----------|
| Scaffold monorepo | `apps/api`, `apps/web`, Turbo, Compose |
| Auth JWT + roles + guards | `auth/`, `guards/` *(token ainda em `localStorage`)* |
| Seeds | `prisma/seed.ts` (4 users + Showcase 8×10) |
| Catalog TMDb | `catalog/` + UI `org.tsx` *(associação id TMDb ainda fraca)* |
| Events create/publish/list | `events/` + UI |
| Busca/filtro listagem | `events.tsx` |
| Seat map 3D (diferencial) | `SeatMap3D` + `/reserve` |
| Reservations HOLD + UNIQUE | `reservations/` + e2e |
| Payments Prisma + worker c=1 | `payments/` + e2e *(1 reservationId por POST)* |
| Tickets HMAC + listagem | `tickets/` |
| Share GET público | `share/` + rota web |
| Gate câmera + manual + 4 status | `gate/` + `gate.tsx` (`qr-scanner`) |
| Design tokens | `styles/tokens.css` |
| Testes API e2e | `auth`, `events`, `reservations`, `gate`, `app` |
| Docs | README, PRD, architecture, task-plan, e2e-happy-path, usage-ia |

### Não feito / incompleto (bloqueia DoD do escopo B ou AC explícito)

| Gap | Impacto | Task IDs |
|-----|---------|----------|
| QR **visual** em Meus ingressos | AC-TKT-01 / FR-TICKET-01 | **T-GAP-01** |
| Link de share usável (URL + copiar/abrir) | AC-TKT-02 / FR-TICKET-03 | **T-GAP-02** |
| Aderência total `DESIGN.md` (remover purple/pills/hardcodes) | AC-UX-01 / FR-UX-* | **T-GAP-03** |
| Playwright 1–2 happy paths | AC-QA-01 | **T-GAP-04** |
| Editar/gerenciar evento (organizador) | AC-EVT-03 / FR-EVENT-02b | **T-GAP-05** |
| README: corrigir limitação “sem câmera” | AC-DOC-01 | **T-GAP-06** |
| Entrega GitHub público + formulário Verzel | AC-DOC-03 / NFR-DELIVERY | **T-GAP-07** |

### Refinamentos de produto planejados *(pedido 2026-08-17 — ainda não implementados)*

| Gap | Impacto | Task IDs |
|-----|---------|----------|
| JWT em cookie `httpOnly` | AC-AUTH-03 / FR-AUTH-04 / NFR-SECURITY | **T-SEC-01…04** |
| `POST /payments` com `reservationIds[]` | AC-PAY-03 / FR-PAY-04 | **T-PAY-01…04** |
| Rotas-página + scroll nos formulários | AC-NAV-01 / FR-NAV-* | **T-NAV-01…03** |
| Redirect login por papel (CLIENT→eventos) | AC-AUTH-04 / FR-AUTH-05 | **T-NAV-04…05** |
| Grid listagem 4×N | AC-EVT-04 / FR-EVENT-05 | **T-UX-01** |
| Associação explícita TMDb ↔ evento | AC-CAT-02 / FR-CATALOG-03 | **T-CAT-01…04** |

### Débito técnico / polish (não bloqueia E2E mínimo, mas conta no B)

| Item | Task ID |
|------|---------|
| Componentizar UI repetida (botões/inputs Minimal) | **T-GAP-08** |
| Empty/loading/error states uniformes (spinner Minimal) | **T-GAP-09** |
| Script `pnpm test:e2e:web` documentado no README | **T-GAP-10** |
| Revisar hold expirado na UI (mensagem clara pós-TTL) | **T-GAP-11** |

---

## 12. Backlog de tasks restantes

Prioridade: **P0** = fecha AC obrigatório do PDF/DoD; **P1** = escopo B + refinamentos pedidos; **P2** = polish.

### 12.1 Gaps DoD / PDF

| ID | Prioridade | Task | Depende de | Paralelo com | AC / FR |
|----|------------|------|------------|--------------|---------|
| T-GAP-01 | P0 | Gerar QR visual do `ticket.code` em `/tickets` (lib leve, ex. `qrcode`) | — | T-GAP-02, T-GAP-03 | AC-TKT-01 |
| T-GAP-02 | P0 | CTA “Copiar link” / “Abrir share” com URL absoluta `/share/:shareToken` | — | T-GAP-01 | AC-TKT-02 |
| T-GAP-03 | P0 | Audit UI vs `DESIGN.md`: trocar `#7c3aed`, pills, radii 8px, cores hardcode → tokens | T5.0 (já existe) | T-GAP-01 | AC-UX-01 |
| T-GAP-04 | P1 | Playwright: (1) login cliente → reserve → pay approve → ver QR; (2) gate VALID | T-GAP-01; ideal pós T-SEC/T-PAY | T-GAP-06 | AC-QA-01 |
| T-GAP-05 | P1 | API `PATCH /events/:id` + UI org editar/listar próprios (gerenciamento PDF) | — | T-GAP-03 | AC-EVT-03 |
| T-GAP-06 | P1 | Atualizar README limitações (câmera **existe**; listar gaps reais) | — | T-GAP-10 | AC-DOC-01 |
| T-GAP-07 | P0*(entrega)* | Publicar repo GitHub + commits descritivos + envio formulário | DoD funcional | — | AC-DOC-03 |
| T-GAP-08 | P2 | Extrair primitives UI (Button, Input, Panel) Minimal | T-GAP-03 | T-GAP-09 | FR-UX-01 |
| T-GAP-09 | P2 | Padronizar loading/erro com classes tokens | T-GAP-03 | T-GAP-08 | FR-UX-01 |
| T-GAP-10 | P2 | Documentar + script Playwright no README/package | T-GAP-04 | T-GAP-06 | AC-QA-01 |
| T-GAP-11 | P2 | UX de HOLD expirado no checkout/reserve | — | T-GAP-03 | NFR-UX-01 |

### 12.2 Refinamentos de produto *(W6 — planejado)*

| ID | Prioridade | Task | Depende de | Paralelo com | AC / FR |
|----|------------|------|------------|--------------|---------|
| T-SEC-01 | P1 | Login seta cookie `httpOnly` (+ Secure/SameSite); `POST /auth/logout` limpa | — | T-PAY-01, T-CAT-01 | AC-AUTH-03 |
| T-SEC-02 | P1 | JwtAuthGuard lê cookie (Bearer opcional só em transição) | T-SEC-01 | — | FR-AUTH-04 |
| T-SEC-03 | P1 | Front: remover `localStorage` token; `credentials: 'include'`; CORS credentials | T-SEC-02 | T-NAV-04 | AC-AUTH-03 |
| T-SEC-04 | P1 | Atualizar e2e API/auth para cookie | T-SEC-03 | T-GAP-04 | AC-AUTH-03 |
| T-PAY-01 | P1 | DTO `reservationIds: string[]` + validação (≥1, mesmo user/evento) | — | T-SEC-01 | AC-PAY-03 |
| T-PAY-02 | P1 | Service enqueue em lote (N jobs, `concurrency: 1`) → resposta `{ payments[] }` | T-PAY-01 | — | FR-PAY-04 |
| T-PAY-03 | P1 | Checkout: **um** `POST /payments` para N reservas | T-PAY-02 | T-UX-01 | AC-PAY-03 |
| T-PAY-04 | P1 | Testes e2e: N assentos → 1 chamada → N tickets | T-PAY-03 | T-GAP-04 | AC-PAY-03 |
| T-NAV-01 | P1 | Documentar mapa de rotas-página no README/PRD | — | T-NAV-02 | AC-NAV-01 |
| T-NAV-02 | P1 | Garantir criar/editar só em página com scroll (sem modal) | — | T-CAT-02 | FR-NAV-02 |
| T-NAV-03 | P1 | Após selecionar filme no `/org`, `scrollIntoView` no formulário (`#form`) | T-NAV-02 | T-CAT-02 | FR-NAV-02 |
| T-NAV-04 | P1 | Redirect pós-login por papel (CLIENT→`/events`) | T-SEC-03 preferencial | T-UX-01 | AC-AUTH-04 |
| T-NAV-05 | P1 | Home autenticada reforça CTAs por papel | T-NAV-04 | — | FR-AUTH-05 |
| T-UX-01 | P1 | Grid `/events` 4×N desktop (2/1 responsivo) + tokens Minimal | — | T-PAY-03 | AC-EVT-04 |
| T-CAT-01 | P1 | Persistir id TMDb no create (`externalRef`/`tmdbMovieId`) | — | T-SEC-01 | AC-CAT-02 |
| T-CAT-02 | P1 | UI org: seleção de filme clara como “associado ao evento” | T-CAT-01 | T-NAV-03 | FR-CATALOG-03 |
| T-CAT-03 | P1 | Listagem/cards usam poster/título do filme associado | T-CAT-01 | T-UX-01 | AC-CAT-02 |
| T-CAT-04 | P1 | Seed com filme TMDb/fixture estável associado | T-CAT-01 | — | FR-CATALOG-03 |

### Ordem sugerida de execução (multi-agente)

```text
Onda 1 — fechar PDF / DoD:
  Agente A: T-GAP-01 + T-GAP-02
  Agente B: T-GAP-03 + T-GAP-06
  Depois: T-GAP-05 (gerenciar/editar evento)

Onda 2 — refinamentos pedidos (paralelo):
  Agente A: T-SEC-01 → T-SEC-02 → T-SEC-03 → T-SEC-04
  Agente B: T-PAY-01 → T-PAY-02 → T-PAY-03 → T-PAY-04
  Agente C (ou B): T-NAV-04/05 + T-UX-01 + T-CAT-01…04 + T-NAV-01…03

Onda 3 — qualidade / entrega:
  T-GAP-04 Playwright (após cookie + payments array)
  T-GAP-10 → T-GAP-07 (GitHub + formulário)
  Polish T-GAP-08/09/11 se sobrar tempo
```

### Definição de pronto atualizada (escopo B + refinamentos)

- [x] E2E domínio: auth → catalog → event → reserve → pay → ticket → gate
- [ ] QR visual + link share usável (T-GAP-01/02)
- [ ] UI sem drift material vs `DESIGN.md` (T-GAP-03)
- [ ] Gerenciamento/edição de evento org (T-GAP-05)
- [ ] Cookie httpOnly (T-SEC-*)
- [ ] Payments com `reservationIds[]` (T-PAY-*)
- [ ] CLIENT aterra em `/events`; grid 4×N; TMDb associado (T-NAV / T-UX / T-CAT)
- [ ] Playwright happy path (T-GAP-04)
- [ ] README alinhado à realidade (T-GAP-06)
- [ ] Entrega GitHub/formulário (T-GAP-07)

---

## 13. Princípio de execução

> Faça o básico rodar de ponta a ponta e só depois agregue valor.

O E2E de domínio **já roda**. Prioridade: **fechar gaps do PDF (QR/share/gerenciar)** → **aplicar refinamentos pedidos (cookie, payments array, nav, grid, TMDb)** → **QA Playwright e entrega**.

---

## Context

- **Epic:** Plataforma de Eventos e Ingressos — Desafio Elite Dev 2026 (Verzel)
- **Feature Idea:** MVP Cena (organizador publica, cliente compra, portaria valida)
- **Target Users:** Organizador, Cliente, Portaria, Avaliador
- **Source of truth do enunciado:** `Desafio-Elite-Dev-2026.pdf`
- **Auditoria de código:** 2026-08-17 — ver §10–12
- **Plano de refinamentos:** 2026-08-17 — ver §12.2 (ainda não implementado)