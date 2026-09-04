# Harness de validação visual — framer-motion → CSS e content-visibility

**Data:** 05/09/2026 · **Branch:** `main` · **Dashboards:** `/espelho`, `/villa-bianco`, `/moment`, `/vitta`, `/empreendimento/[id]`

Este documento registra a metodologia e os resultados da validação que permitiu
aplicar os dois itens adiados na auditoria (`DASHBOARD-PERF-AUDIT.md` §2.4/§3):
a substituição do framer-motion por CSS nos 5 dashboards e o culling
`content-visibility` nas grades.

## 1. O que é o harness

Rota `src/app/dev-harness/[dash]` + geradores `src/lib/dev/fixtures.ts`:

- Renderiza cada dashboard **real** com fixtures sintéticas determinísticas no
  mesmo formato das linhas PostgREST (`select("*")`), passadas por `initialUnits`
  (o mesmo caminho RSC de produção). Sem Supabase, sem dado real, sem fetch.
- Volume configurável: `/dev-harness/sales?floors=30&per=10` (até 40×14).
- **Eliminada em produção:** a rota só existe quando o build roda com
  `NEXT_PUBLIC_VISUAL_HARNESS=1`. Sem a flag, responde 404 e nenhum módulo do
  harness entra no bundle de páginas reais. Fora do matcher do `src/proxy.ts`.

### Como rodar localmente

```bash
NEXT_PUBLIC_VISUAL_HARNESS=1 \
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key \
npm run build
PORT=3100 bun .next/standalone/server.js
node scripts/harness-measure.cjs before   # (script de sandbox, não versionado)
```

## 2. Métricas coletadas por dashboard

CLS e longtasks via `PerformanceObserver` injetado antes da hidratação, scroll
programático completo (ida e volta); bytes JS via `performance.resource`;
alturas de card via `getBoundingClientRect` (calibração do
`contain-intrinsic-size`); frames de entrada/colapso via screenshots em rajada
e seek determinístico (Web Animations API); interações reais (modal, barra de
lote, collapse) com verificação de DOM.

## 3. Resultados (10×8 default; estresse 30×10)

| Rota | CLS antes | CLS depois | Cards (estresse) |
|---|---|---|---|
| `/empreendimento/[id]` | 0,543 / 0,555 | **0,000** | 80 (300) |
| `/espelho` | 0,303 / 0,334 | **0,001** | 48* (60*) |
| `/moment` | 0,306 / 0,372 | **0,000** | 48* (60*) |
| `/vitta` | 0,343 / 0,406 | **0,002 / 0,000** | 80 (130) |
| `/villa-bianco` | 0,013 / 0,015 | **0,000** | 80 (300) |

\* espelho e momento têm estrutura estática de 6 andares (`floors = [1..6]`);
o estresse usa 6×14.

**Bundle JS por rota de dashboard:** 312.975 → 274.253 bytes transferidos
(**−38.722 B ≈ −38 KB gzip equivalente**, −12,4%), confirmando a estimativa da
auditoria. Nenhuma rota além das 5 foi afetada.

**Alturas medidas dos cards** (uniformes por dashboard): sales 201px,
villa/moment 238px, vitta 210px, dinâmico 262px — base do `--ims-cv-h`
(480/560/560/500/620px por grade).

## 4. Causa-raiz do CLS eliminado

O framer-motion animava `height: 0 → auto` **na montagem** de cada andar
(`AnimatePresence` + `initial={{ height: 0 }}`): cada seção nascia com altura 0
e crescia, empurrando todo o conteúdo abaixo (shifts de 0,2–0,4 aos ~300–550ms
— exatamente a janela de hidratação). O collapse CSS (`grid-template-rows
0fr↔1fr`) renderiza o estado final direto no HTML inicial e só transiciona em
interação do usuário — shifts com input recente são excluídos do CLS por
definição (`hadRecentInput`).

## 5. Bugs encontrados e corrigidos durante a validação

1. **Overlay preso após fechar o modal** (crítico): o `useCssPresence`
   comparava `event.animationName` com o nome da **classe** (`ims-overlay-out`),
   mas os keyframes se chamavam `fadeIn` → `animationend` nunca casava e o
   overlay permanecia montado interceptando cliques. Correção: keyframes
   dedicados (`imsOverlayOut`, `imsBarOut`, `imsModalCardOut`) e o hook recebe
   o nome do **keyframes**. Teste pós-fix: abre → classe de saída presente →
   desmonta do DOM ✓.
2. **Toggle `content-visibility: auto ↔ hidden` quebra a transição de
   `grid-template-rows`** (size containment muda a contribuição de altura de
   forma descontínua): medido 445→0px em 1 frame. Correção: `ims-cv` permanente
   no wrapper (andar colapsado em viewport paga layout, não paint).
3. **Clip de sombra/scaling por `overflow: hidden` do collapse**: o framer
   removia o overflow após animar; o wrapper CSS compensa com
   padding/margem-negativa na caixa de clip (sombras de hover idênticas ao
   baseline, verificado por screenshot e `boxShadow` computado).

## 6. Paridade visual verificada

- Estado settled: screenshots antes/depois idênticos (layout, badges, filtros,
  legendas, footer).
- Hover do card: `translateY(-6px) scale(1.03)` + `shadow-xl` computados ✓.
- Entrada: 32 animações `imsCardIn` ativas na montagem; rodando em CSS puro a
  partir do first paint (antes dependia de hidratação).
- Collapse/expand: 445→0→445px suave (~300ms) nos dois sentidos ✓.
- Modal e barra de lote: abrem com animação, fecham com saída animada e
  desmontam ✓. Dim de fundo (opacity 0,25) ✓.
- `prefers-reduced-motion: reduce`: animações reduzidas a 0,01ms (novidade —
  antes o framer não tratava).

## 7. Escopo e limitações

- O `-38 KB` é por rota de dashboard (chunks compartilhados); `framer-motion`
  permanece para `/planos` e `/simulador-generico`.
- Medidas em sandbox local (sem latência de rede); CLS é relativo entre estados
  e independe de latência. Lighthouse/p50-p95 em produção segue pendente
  (requer staging).
- Mutação de status não foi exercida contra API real (fixtures não persistem) —
  handlers/fluxo de mutação não foram alterados pela migração (apenas a
  apresentação).
