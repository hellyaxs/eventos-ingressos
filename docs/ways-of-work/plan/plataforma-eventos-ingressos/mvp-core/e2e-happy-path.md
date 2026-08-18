# E2E Happy Path — Compra → Ingresso → Compartilhamento → Validação

Deliverable "Testes C" do `task-plan.md`. Fluxo principal (happy path) mapeado contra o
código-fonte de `apps/web` e `apps/api`. Todos os seletores abaixo foram verificados
diretamente no source (não são inferidos).

## Ambiente

| Item | Valor |
|---|---|
| Web | `http://localhost:5173` (Vite dev) |
| API | `http://localhost:3000` (`VITE_API_URL` default) |
| Banco | Postgres via `pnpm db:up` (seed inclui evento publicado) |
| Fila | Redis/BullMQ via `pnpm db:up` (worker processa `PAYMENT_PROCESS_JOB`, concurrency 1) |
| Cliente seed | `cliente1@eventos.local` / `secret123` |
| Evento seed | `Showcase de Verão` · `Arena Demo` · daqui a 7 dias · 80 lugares · `R$ 100,00` · `SEAT_MAP` · assentos `A1..H10` |

> O evento precisa estar `PUBLISHED`. O seed cria publicado; se o fluxo foi exercitado
> antes, usar um assento ainda disponível ou re-seedar (`pnpm db:seed`).

## Pré-condições

1. `pnpm install`
2. `pnpm db:up && pnpm db:seed`
3. `pnpm dev` (web + api) — worker do BullMQ inicia junto com a API (processa aprovação)

## Fluxo (passo a passo)

### 1. Descobrir evento publicado

```
GET /api/events
```
Pegar o primeiro item com `saleMode === 'SEAT_MAP'` e `status === 'PUBLISHED'` → `eventId`.

### 2. Login do cliente

```
goto /login
fill #login-email        -> cliente1@eventos.local
fill #login-password     -> secret123
click  .login-submit
expect URL -> /app
```

### 3. Abrir reserva

```
goto /reserve?eventId=<eventId>
```

### 4. Selecionar assento

- Grid de assentos: `[aria-label="Mapa de assentos"]`
- Botão do assento: `button` cujo texto é o label (ex.: `A1`)
- `A1` começa disponível (não `disabled`), clicar nele.
- Texto `Selecionados: A1 — R$ 100,00` deve aparecer.

### 5. Confirmar reserva

```
click "Continuar para pagamento"
expect URL -> /checkout?reservationIds=<ids>  (via window.location.assign)
```
Assertions de contrato da resposta `POST /api/events/:id/reserve`:
- `reservationIds` é array de strings (1 por assento)
- `expiresAt` está no futuro (hold de 10 min)

### 6. Checkout

- Card da reserva exibe `Showcase de Verão` e `Assento A1`.
- `Total a pagar: a confirmar`.
- Clicar `Aprovar pagamento (simulado)`.

### 7. Aguardar aprovação

- Botão vira `Aguardando aprovação...` enquanto `pollPayment` faz até
  12 × 500 ms em `GET /api/payments/:id`.
- Texto esperado: `Pagamento aprovado — total R$ 100,00. Ingressos emitidos.`

### 8. Capturar código do ingresso

- Código renderizado em `span` com estilo mono (inline).
- Deve casar com `/^CENA-[0-9A-F]{4}(-[0-9A-F]{4}){5}$/`.

### 9. Lista de ingressos

```
click "Ver meus ingressos"
expect URL -> /tickets
```
- Card mostra: título do evento, badge `ISSUED`, `Assento: A1`, código `CENA-…`
  idêntico ao capturado no passo 8.

### 10. Compartilhar

- A partir de `/tickets`, abrir `/share/<shareToken>` (shareToken vindo do card).
- Página pública renderiza `status`, `seatLabel` (`A1`), `event.title`, `event.venue`.

### 11. Validar na portaria

```
goto /gate
select #gate-event  (auto-seleciona o primeiro evento — conferir que é o correto)
fill   #gate-code   -> <código capturado>
click  "Validar ingresso"
expect "✓ Ingresso válido"
```

### 12. Reuso (já utilizado)

```
click "Validar ingresso" novamente (mesmo código)
expect "✗ Ingresso já utilizado"
```

## Asserções de contrato (backend)

| Ponto | Contrato |
|---|---|
| `POST /api/auth/login` | `{ token, user: { id, name, email, role, avatar } }`; senha errada → 401 `E-mail ou senha incorretos` |
| `POST /api/events/:id/reserve` | `{ reservationIds, expiresAt, seats }`; assento já tomado → 409 `Assento indisponível` |
| `POST /api/payments` | dedupe por `reservationId`; reserva fora de HOLD → 409; expirada → 409 `Reserva expirada`; enfileira `PAYMENT_PROCESS_JOB` |
| `GET /api/payments/:id` | inclui `reservation.seat`, `reservation.event.title`, `tickets` |
| Worker approve | payment → `APPROVED`, reservation → `CONVERTED`, emite 1 ticket por assento |
| Worker reject | payment → `REJECTED`, reservation → `CANCELLED` (hold liberado) |
| `GET /api/tickets` | só `CLIENT`; items com `{ id, eventId, paymentId, code, shareToken, status, seatLabel, usedAt, createdAt, event }` |
| `GET /api/share/:shareToken` | público; 404 `Ingresso não encontrado`; shape `{ status, seatLabel, usedAt, event: { title, venue, startsAt, posterUrl } }` |
| `POST /api/gate/:eventId/validate` | público, `@HttpCode(200)`; status `VALID` / `INVALID` / `ALREADY_USED` / `WRONG_EVENT` |

## Roteiro de smoke manual (checklist)

- [ ] Login com `org@eventos.local` → dashboard do produtor carrega evento publicado
- [ ] Login com senha errada → mensagem `E-mail ou senha incorretos`, permanece em `/login`
- [ ] `/app` sem token → redireciona para `/login`
- [ ] Reservar 2 assentos → checkout lista 2 → aprovar → 2 ingressos emitidos
- [ ] Rejeitar pagamento → `Pagamento rejeitado — a reserva foi liberada.` e assento volta a `Disponível`
- [ ] Validar na portaria um código de outro evento → `✗ Ingresso não pertence a este evento`
- [ ] Validar código inexistente → `✗ Ingresso inválido`
- [ ] `/gate` sem seleção de evento → validação não dispara (ou erro explícito)
