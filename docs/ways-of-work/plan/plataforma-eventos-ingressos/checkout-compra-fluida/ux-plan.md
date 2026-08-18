# UX plan — Jornada de compra fluida (listagem → ingresso)

| Campo | Valor |
|-------|--------|
| Tela crítica | `/checkout?reservationIds=…` |
| Escopo | Listagem `/events` → mapa `/reserve` → pagamento `/checkout` → `/tickets` |
| Design system | [`DESIGN.md`](../../../../../DESIGN.md) |
| Auditoria | uxui-evaluator + interface-auditor + flow-checker (`pricing` / checkout) |
| API enrich | `api_enriched: false` (sem `UXUI_API_KEY`) |

Este documento é o plano de experiência. Implementação aplicada em `checkout.tsx`, `reserve.tsx`, `events.tsx`, `tickets.tsx` e `GET /payments/by-reservation/:id`.

---

## 1. Problema

O cliente chega num checkout que parece ferramenta de QA, não uma compra:

- Dois botões do mesmo peso: **Aprovar pagamento (simulado)** e **Rejeitar pagamento (simulado)**.
- Total aparece como **“a confirmar”** *antes* de pagar.
- URL com CUIDs (`cmsxymtjh000j9w0s08ihw74k`) não comunica o pedido.
- Recarregar a URL de uma reserva já convertida dispara `POST /payments` com `approve` (`RecoverReservation`) — efeito colateral no load.
- Depois de aprovar **ou** recusar, a tela **não diz** que aquele ingresso/assento não pode ser comprado de novo.
- Não há progresso (onde estou na jornada), nem countdown do HOLD de 10 min.

A regra de negócio já existe no mapa (assento `owned` + 409). Falta **feedback no fim da decisão** e uma hierarquia de ação de comprador.

---

## 2. Auditoria (uxui-principles)

### 2.1 Evaluator — interface `checkout`

**Tipo:** `checkout` (Parts 1, 3, 4). Score estimado **46 / fair** (100 −15×3 −7×2 −3×1).

| ID | Princípio | Sev. | Violação | Remediação |
|----|-----------|------|----------|------------|
| F-1 | Cognitive Load `F.1.1.02` | critical | Pedido + aprovar + recusar + recover + erros + códigos na mesma viewport, sem um “próximo passo” óbvio | Um resumo + **um** CTA primário; recusa simulada em secundário |
| F-2 | Error Prevention `F.3.2.01` | critical | Reload da URL **compra de novo** (recover approve) | Checkout GET-only até o clique; se já pago, **recibo** |
| F-3 | Feedback Loops `F.3.2.02` | critical | Aprovar/recusar não explica duplicidade do ingresso | Banner pós-resultado + CTA “Meus ingressos” / “Outro assento” |
| F-4 | Progressive Disclosure `F.3.1.01` | warning | Jargão “simulado”, IDs de reserva, status HOLD | Linguagem de pedido; IDs só em detalhe |
| F-5 | Fitts / Hick `F.4.1.01` / `F.2.2.03` | warning | Dois CTAs opostos com o mesmo tamanho | Primário grande; recusa menor, alinhada à direita ou em `<details>` |
| F-6 | Visual Hierarchy `F.2.1.01` | suggestion | Links ouro `#e8b84b`, success `#22c55e` fora do DESIGN | Accent `#0070f3`, success `#00c853`, radius 2px |

**Forças:** exige login; poll até status final; lista assentos do hold.

**Priority fixes:** F-2 → F-1 → F-3.

### 2.2 Smells (interface-auditor)

| Smell | Sev. | Sintoma | Receita (3 passos) |
|-------|------|---------|---------------------|
| `inconsistent-actions` | warning | “Continuar para pagamento” vs “Aprovar pagamento (simulado)” vs “Ir para pagamento” | Vocabulário único: **Continuar** → **Confirmar compra** → **Ver ingressos** |
| `silent-errors` | warning | 409 de duplicidade some no checkout; recover falha com texto técnico | Mapear 409 para “Você já comprou o assento X”; CTA explícito |
| `dead-end-states` | warning | Sem `reservationIds`: “Voltar para reservas” (página vazia) | Empty state: “Escolha um evento” → `/events` |
| `mystery-navigation` | suggestion | Sem stepper; URL opaca | Stepper **Evento → Assentos → Pagamento → Pronto** |
| `click-cemetery` | suspected | `window.location.assign` recarrega o app no meio do fluxo | `navigate({ to: '/checkout', search })` SPA |

`priority_order`: silent-errors (pós-compra), inconsistent-actions, dead-end-states.

### 2.3 Flow-checker — `pricing` (compra)

**Metric target:** conversion. `api_enriched: false`.

**Preflight (o que o produto precisa ter claro):**

| # | Pergunta | Status | Decisão deste plano |
|---|----------|--------|---------------------|
| pf-1 | Qual é A ação? | answered | **Confirmar a compra dos assentos em HOLD** |
| pf-2 | O que o cliente precisa saber antes de decidir? | partial | Preço unitário × assentos = total **antes** do clique |
| pf-3 | O que acontece se recusar / expirar / já ter o ingresso? | unanswered → agora | Ver §3 política |
| pf-4 | Como retomar um HOLD aberto? | partial | Deep link ok, mas **não** auto-pagar |
| pf-5 | Onde o avaliador simula recusa sem confundir o cliente? | unanswered | Controle secundário “Simular recusa” |

**Postflight (tela atual):** `ship_ready: false`.

| Check | Sev. | Status |
|-------|------|--------|
| Preço visível antes da ação irreversível | critical | **fail** (“a confirmar”) |
| Um CTA primário de compra | critical | **fail** (aprovar = recusar) |
| Feedback do resultado + próximo passo | critical | **fail** (sem regra de duplicidade) |
| Sem side-effect no GET/load | critical | **fail** (RecoverReservation) |
| Indicador de progresso | high | **fail** |
| Expiração do hold visível e viva | high | **fail** (só data absoluta) |
| Empty/erro com ação | high | **fail** (link errado) |

---

## 3. Política de produto (copy única)

Regra: **não se compra o mesmo assento duas vezes**. Outros assentos do mesmo evento **podem**.

| Momento | O que mostrar |
|---------|----------------|
| Listagem, já tem ingresso | Badge **Você já possui ingresso** + CTA **Escolher outro assento** + labels |
| Mapa, assento `owned` | Cor warning, desabilitado, **Você já comprou este ingresso** |
| Checkout, **antes** de pagar | Nota: “Cada assento só pode ser comprado uma vez. Os selecionados ficam seus após a confirmação.” |
| Checkout, **aprovado** | “Compra confirmada. Os assentos {A1, A2} são seus — não é possível comprar estes ingressos de novo.” CTAs: Ver ingressos · Escolher outro assento |
| Checkout, **recusado** | “Pagamento não concluído. Estes assentos foram **liberados**. Você pode tentar de novo. Assentos que você **já possui** continuam bloqueados.” CTA: Voltar ao mapa |
| Checkout, **409 duplicidade** | “Você já comprou o ingresso do assento {X}.” Não repetir o POST. Ver ingressos |
| HOLD expirado | “A reserva expirou. Os assentos voltaram ao mapa.” CTA: Escolher de novo |
| Recusa **não** é duplicidade | Recusar **não** emite ingresso; o aviso de “não comprar duas vezes” só se aplica a assentos **já emitidos** |

---

## 4. Jornada alvo

```text
/events  →  /reserve?eventId=  →  /checkout  →  /tickets
  1 Evento      2 Assentos           3 Pagamento      4 Pronto
```

Stepper persistente (texto + `▸`, tokens Minimal). Passo atual em foreground; demais em secondary.

### 4.1 `/events`

- Manter badge + CTA “outro assento”.
- Card: preço visível; poster; **não** empilhar “Aprovar”.
- Clique no card inteiro (área hit grande — Fitts) vai ao mapa se `SEAT_MAP`.

### 4.2 `/reserve`

- Resumo fixo no rodapé: assentos + total + **Continuar para pagamento**.
- Navegar com router (sem full reload).
- Erro 409: manter seleção dos assentos livres; marcar owned.
- Countdown do hold se já existir HOLD do mesmo evento.

### 4.3 `/checkout` (redesenho)

Layout em **um** cartão de pedido (chunking):

```
┌ Pagamento · passo 3/4 ─────────────────────┐
│ [poster]  Título                             │
│           Local · data                       │
│           Assentos  A1, A2                   │
│           2 × R$ 100,00                      │
│           Total  R$ 200,00                   │
│           Reserva expira em  09:41           │
│                                              │
│  Cada assento só pode ser comprado uma vez.  │
│                                              │
│  [ Confirmar compra ]                        │
│  ▾ Opções de demonstração                    │
│     [ Simular recusa ]                       │
└──────────────────────────────────────────────┘
```

- Total **sempre** `n * priceCents` do evento (nunca “a confirmar”).
- `Confirmar compra` = `simulatedOutcome: approve` (avaliador ainda testa o worker).
- Após sucesso: esconder os dois botões; painel success + códigos + QR link.
- Após recusa: esconder confirmar; mostrar mapa de novo.
- IDs de reserva só em `<details>` “Detalhes técnicos”.
- Sem `RecoverReservation` no mount. Se o HOLD não existe: GET pagamento/ticket daquele id **somente leitura**.

### 4.4 `/tickets`

- Grid já planejado.
- Se veio do checkout: query `?justPaid=1` + banner “Compra feita. Estes ingressos não podem ser recomprados.”

---

## 5. Estados da tela de checkout

| Estado | UI |
|--------|----|
| Sem ids | Empty: “Nenhum pedido em andamento” → `/events` |
| Loading | Spinner “Carregando seu pedido…” |
| HOLD válido | Layout §4.3 |
| HOLD < 60s | Warning “Expira em instantes” |
| Expirado | Error + Escolher de novo |
| Já APPROVED | Recibo (não pagar de novo) + aviso de duplicidade |
| Já REJECTED | “Pedido recusado” + mapa |
| 409 owned | Banner + Ver ingressos |
| Poll timeout | “Ainda processando — atualize em instantes” + retry **idempotente** |

---

## 6. Backlog de implementação (ordem)

1. **Parar o auto-approve** no load (`RecoverReservation`).
2. **Preço + countdown + um CTA** no checkout.
3. **Banners de duplicidade** nos resultados approve / reject / 409.
4. Stepper nas 4 rotas + `navigate` SPA a partir do mapa.
5. Empty states e tokens DESIGN.md (remover ouro/verde genéricos).
6. Recibo read-only quando a reserva já foi convertida.

---

## 7. Contexto para implementação (vibe-coding / checkout)

Ao gerar o novo checkout:

- **Cognitive load:** no máximo um pedido, um total, um botão primário visível.
- **Progressive disclosure:** simular recusa e IDs técnicos recolhidos.
- **Fitts:** CTA primário full-width no mobile; alvo ≥ 44px.
- **Feedback:** todo clique muda um status visível (busy / success / error) com próximo passo.
- **A11y:** `aria-live` no countdown e no resultado; não usar só cor no assento owned.
- **Copy:** PT-BR, sem emoji, sem “simulado” no CTA principal.

---

## 8. Fora de escopo

- Gateway de pagamento real, PIX, cartão.
- Carrinho multi-evento.
- E-mail de confirmação.
- Mudar a regra de estoque no Prisma neste corte (só UX + não disparar POST no GET).
