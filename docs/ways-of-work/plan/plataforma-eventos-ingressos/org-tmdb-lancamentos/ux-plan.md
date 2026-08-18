# UX plan — Criar sessão em `/org` sem o catálogo engolir o form

| Campo | Valor |
|-------|--------|
| Tela crítica | `http://localhost:5173/org` |
| Escopo | Escolher filme (TMDb) → preencher sessão → publicar; lista “Meus eventos” |
| Design system | [`DESIGN.md`](../../../../../DESIGN.md) |
| PRD | [`prd.md`](./prd.md) (US3/US4: mesma página, **sem modal**) |
| Auditoria | uxui-evaluator + interface-auditor + flow-checker + vibe-coding-advisor |
| API enrich | `api_enriched: false` |

Este documento é o plano de experiência. Implementação prevista em `apps/web/src/routes/org.tsx`, `InfiniteSentinel.tsx` e `styles/components.css`. Sem mudança de contrato de API.

---

## 1. Problema

A tarefa primária de `/org` é **criar uma sessão**. O catálogo TMDb é um **seletor**, não o destino.

Hoje o fluxo é uma coluna só:

1. Abas + busca
2. Grade `.tmdb-grid` com `InfiniteSentinel` (`rootMargin: 240px`, root = viewport)
3. Chip “Filme associado”
4. `#event-form`
5. “Meus eventos”

O sentinel fica **acima** do form. Ao descer para preencher a sessão, o observer dispara, carrega a página seguinte, a grade cresce e o form **recua**. O usuário nunca chega nos campos. Em teclado, o Tab percorre dezenas de cards antes do primeiro input.

A US3 ainda faz `scrollIntoView` no form depois do clique — inútil enquanto o sentinel continuar ligado ao viewport da página.

---

## 2. Auditoria (uxui-principles)

### 2.1 Evaluator — interface `org` (form + picker)

**Tipo:** form / picker. Score estimado **38 / poor** (100 −15×3 −7×3).

| ID | Princípio | Sev. | Violação | Remediação |
|----|-----------|------|----------|------------|
| F-1 | Goal gradient / completion `F.3.1.02` | critical | Ação irreversível (publicar) está abaixo de um feed infinito | Form sempre alcançável: coluna própria ou passo 2 |
| F-2 | Fitts / proximity `F.4.1.01` | critical | Form longe da seleção; cada page-in empurra o alvo | Catálogo e form lado a lado (desktop); no mobile, form após seleção |
| F-3 | Progressive disclosure `F.3.1.01` | critical | Browse infinito e formulário de sessão competem no mesmo scroll | Dois papéis visuais: **Filme** (browse) vs **Sessão** (fill) |
| F-4 | Cognitive load `F.1.1.02` | warning | Vitrine + busca + form longo + lista de eventos na mesma página | “Meus eventos” abaixo do workspace; catálogo limitado em altura |
| F-5 | Keyboard / focus order `F.4.2.01` | warning | Tab atravessa N cards infinitos antes de `#org-title` | Depois de selecionar, foca o primeiro campo vazio da sessão |
| F-6 | Feedback `F.3.2.02` | suggestion | Chip de filme some no scroll; CTA desabilitado sem contexto persistente | Filme escolhido sempre visível no painel da sessão (poster + título) |
| F-7 | Visual hierarchy `F.2.1.01` | suggestion | H1 “Administrar eventos” não diz o passo | Copy: **1. Filme** / **2. Sessão** |

**Forças:** filme obrigatório; busca com debounce ≥ 3 chars; edição já esconde o catálogo.

**Priority fixes:** F-1 → F-2 → F-3.

### 2.2 Smells (interface-auditor)

| Smell | Sev. | Sintoma | Receita (3 passos) |
|-------|------|---------|---------------------|
| `unreachable-content` | critical | Form existe no DOM mas o feed empurra o viewport | Isolar o scroll do catálogo; form fora desse overflow |
| `infinite-scroll-trap` | critical | Sentinel no documento, `rootMargin` 240px | `root` = painel do catálogo; pausar load após seleção |
| `competing-primary-tasks` | warning | Browse de filmes = criar sessão = gerenciar eventos | Workspace filme+sessão; lista de eventos é seção seguinte |
| `mystery-next-step` | warning | Sem filme: CTA cinza no fundo da página | Painel da sessão visível com “Selecione um filme à esquerda” |
| `layout-shift` | warning | Novos cards empurram o form | Altura do catálogo fixa (`max-height` + overflow) |

`priority_order`: unreachable-content, infinite-scroll-trap, competing-primary-tasks.

### 2.3 Flow-checker — criar sessão

**Metric target:** task completion (publicar evento). `ship_ready: false`.

| # | Pergunta | Status | Decisão deste plano |
|---|----------|--------|---------------------|
| pf-1 | Qual é A ação? | answered | **Escolher um filme e publicar a sessão** |
| pf-2 | O que precisa estar visível para decidir? | fail | Form de sessão precisa estar na viewport **sem** vencer o catálogo |
| pf-3 | O que acontece depois de escolher o filme? | partial | Preenche título/poster; deveria **parar de paginar** e mostrar a sessão |
| pf-4 | Como trocar de filme? | unanswered | “Trocar filme” reabre o catálogo e limpa a seleção |
| pf-5 | Edição de evento já publicado? | ok | Catálogo some (`editingId`); manter |

**Postflight:**

| Check | Sev. | Status |
|-------|------|--------|
| Destino (form) alcançável sem luta contra o scroll | critical | **fail** |
| Scroll infinito só no contexto de browse | critical | **fail** (root = página) |
| Filme selecionado permanece visível ao preencher | warning | **fail** (chip acima do form, some no scroll) |
| Um CTA primário quando o form é válido | ok | pass (já existe) |
| Sem modal (PRD US4) | constraint | **respeitar** — split pane, não `NgbModal` |

### 2.4 Vibe-coding (antes de implementar)

- **Uma tela, dois papéis:** picker vs form. Não empilhar os dois no mesmo `overflow` da página.
- **Signature:** cartaz escolhido “ancorado” no painel da sessão (poster 2:3 pequeno), não um chip solto.
- **DESIGN.md:** accent `#0070f3`, surface `#1a1a1a`, radius 2px, sem modal genérico.
- **Risco a evitar:** drawer/modal que contradiz o PRD (“sem modal”, “mesma página”).
- **Mobile:** não forçar duas colunas; após seleção, o painel da sessão vem primeiro (ou sticky bar “Preencher sessão”).

---

## 3. Decisão de layout

**Escolhido: split pane na mesma página (sem modal).**

Descartado:

| Alternativa | Por que não |
|-------------|-------------|
| Só `scrollIntoView` no clique | Sentinel continua no viewport; form foge de novo |
| Paginação numérica no lugar do infinite | Pior para vitrine; o problema é o **root** do scroll, não a paginação |
| Modal de filme | Contradiz PRD US4 |
| Form acima do catálogo | Catálogo (decisão visual) fica abaixo do fold; título/poster nascem vazios |

### Desktop (≥ 900px)

```
┌─────────────────────────────────────────────────────────────┐
│ Administrar eventos                                         │
│ 1. Filme                          2. Sessão                 │
├──────────────────────────────┬──────────────────────────────┤
│ [Em cartaz] [Em breve]       │ [poster] Título herdado      │
│ Buscar (3+ chars, debounce)  │ Local · data · preço · mapa  │
│ ┌──────┐ ┌──────┐            │                              │
│ │card  │ │card  │  overflow  │ position: sticky             │
│ └──────┘ └──────┘  interno   │ [Criar e publicar evento]    │
│ InfiniteSentinel (root=pane) │ filme obrigatório visível    │
├──────────────────────────────┴──────────────────────────────┤
│ Meus eventos  (scroll da página, sem sentinel de filme)     │
└─────────────────────────────────────────────────────────────┘
```

### Depois de selecionar (os dois breakpoints)

- Catálogo **compacta**: card selecionado + botão **Trocar filme**.
- Infinite scroll **desliga** (`disabled: true`) — não há por que paginar.
- Foco vai para `#org-venue` (título já veio do TMDb).
- “Trocar filme” restaura a grade, limpa `tmdbId`/poster se o usuário não reescolher (CTA volta a bloquear).

### Mobile (< 900px)

```
[1. Filme]  grade com max-height ~ 55vh + scroll interno
            sentinel com root = esse painel

ao selecionar:
[Filme escolhido] poster + Trocar filme
[2. Sessão]       form completo (próximo na página, agora alcançável)
[Meus eventos]
```

Barra opcional só se o form ainda estiver abaixo do fold: sticky `Filme: {título} · ir à sessão` (`href="#event-form"`). Preferir compactar o catálogo para **não precisar** da barra.

---

## 4. Regras do infinite scroll

1. `InfiniteSentinel` recebe `root: RefObject<HTMLElement | null>` (o painel `.org-catalog-pane`).
2. `rootMargin` fica no painel (`120px`), não `240px` na página.
3. `disabled` quando: sem `hasNextPage`, fetching, **ou filme já selecionado**, ou edição.
4. “Meus eventos” mantém o sentinel atual (lista curta; não compete com o form).

---

## 5. Copy (pt-BR, DESIGN)

| Antes | Depois |
|-------|--------|
| Administrar eventos | Administrar eventos |
| Escolha um filme em lançamento, preencha a sessão e publique na mesma página. | Escolha o filme e preencha a sessão ao lado. |
| Selecione um filme de lançamento | Selecione um filme no catálogo |
| Filme associado: X · TMDb #id | Sessão de **{título}** (TMDb só em texto secundário, se necessário) |
| — | Trocar filme |
| — | 1. Filme / 2. Sessão |

CTA inalterado: **Criar e publicar evento** / **Salvar alterações**.

---

## 6. Implementação (quando autorizar)

1. `InfiniteSentinel`: prop opcional `root`; observer usa esse elemento.
2. CSS: `.org-workspace` grid 1fr 1fr ≥900px; `.org-catalog-pane` `max-height` + `overflow-y: auto`; `.org-session-pane` sticky top.
3. `org.tsx`: dois painéis; estado `selected` compacta o catálogo; foco em `#org-venue`; remover `scrollIntoView` como estratégia principal (opcional no mobile).
4. Acessibilidade: `aria-labelledby` nos painéis; `aria-pressed` nos cards (já existe); após compactar, um único card no tab order.
5. Playwright: `e2e/organizer-seatmap-3d.spec.ts` — após clicar o card, `#org-venue` visível **sem** scroll extra na página; form preenchível.

Fora de escopo: API TMDb, debounce da busca (já feito), modal, stepper global do app.

---

## 7. Critérios de aceite UX

- **Given** catálogo com várias páginas TMDb
- **When** o organizador rola a grade de filmes
- **Then** o form da sessão **permanece visível** no desktop (coluna direita) e o infinite scroll só ocorre **dentro** do painel do catálogo

- **Given** um filme clicado
- **When** a seleção confirma
- **Then** a grade compacta, o load da próxima página **não dispara**, e o foco está no form

- **Given** “Trocar filme”
- **When** clica
- **Then** a vitrine volta e o CTA de publicar fica bloqueado até nova seleção

- **Given** viewport estreita
- **When** seleciona um filme
- **Then** o form fica imediatamente abaixo do cartaz escolhido, alcançável sem luta contra o feed

- Tokens: accent `#0070f3`, surface, radius 2px; sem modal.
