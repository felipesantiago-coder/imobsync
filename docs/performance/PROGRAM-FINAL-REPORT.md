# ImobSync — Relatório final do programa de otimização de performance

**Branch:** `perf/optimization-program`
**Commit base:** `482d5bb8f5d884cf17e94559ec4b2ba512a919a3` (exatamente o commit auditado)
**Referências:** `ImobSync_Prompt_GLM_Otimizacao_Performance_v1.0.md` (revisão 1.1) e `ImobSync_Auditoria_Performance_v1.0.md` (revisão 1.1)
**Ambiente de execução:** sem credenciais de staging (Supabase/Mercado Pago) — todas as medições bloqueadas foram declaradas como tal, nenhuma foi inventada.

---

## 1. Estado antes × depois

| Gate | Antes (baseline reproduzido) | Depois (validado a cada commit) |
|---|---|---|
| `npx tsc --noEmit` | 176 erros em 31 arquivos | **0 erros** |
| `npm run lint` | 3 erros + 8 avisos em 9 arquivos | **0 erros, 0 avisos** |
| `npm run build` | verde **ignorando erros de tipo** (`ignoreBuildErrors: true`) | **verde com type checking integral** |
| Testes | nenhuma infraestrutura | **Vitest, 17 testes de caracterização verdes** |
| `typescript.ignoreBuildErrors` | `true` | **removido do `next.config.ts`** |
| `reactStrictMode` | `false` | `false` — ativação pendente de validação em staging (efeitos/listeners idempotentes) |
| `middleware.ts` | convenção obsoleta | **`src/proxy.ts` (convenção Next 16)** com matcher restrito |

Divergências do baseline da auditoria: build local 28,5 s (vs 36,1 s — hardware); erros TS em 31 arquivos (vs 32 — contagem de arquivos idêntica em ordem de grandeza). Todo o restante coincidiu.

## 2. Trabalho entregue (commits semânticos)

### `test: add performance baselines and characterization coverage`
- Vitest (devDependency) + `tests/characterization.pure.test.ts`: valores golden de `isSubscriptionActive` (incl. `lifetime`), `getStatusLabel`, `getStats`, formatação BRL (NBSP U+00A0) e campos derivados do `moment-data` (72 unidades, fallback "Consulte").
- `docs/performance/PHASE0-BASELINE.md`: baseline reproduzido, divergências e bloqueios de staging.
- Scripts `test` e `typecheck` no npm.

### `fix: restore typescript and eslint quality gates` (Fase 0 — auditado P0.1)
Correções por causa (sem `any` indiscriminado), 176 → 0:
- **`moment-data.ts` (72):** tipo bruto `Omit<MomentUnit, valorStr | valorFormatado>` — campos derivados no `.map()`.
- **`mercadopago.ts` (11):** `AssinaturaDB.status` ganha `'lifetime'` (gravado no banco por `grant-lifetime`, ausente do tipo — bug de tipo real); casts de resposta do SDK via `unknown`; `mpErr` tipado no catch.
- **Simuladores ×5 (55):** tuplas de cor jsPDF, `msSaveOrOpenBlob` com capability check tipado (branch IE preservado), alargamento `InccMode` em narrowing falso-positivo.
- **Postgrest `err` → `error` (6 locais):** alias `error: err`, corpo preservado.
- **`supabase/server.ts`:** import `NextResponse` faltante em `createMiddlewareClient`.
- **`tsconfig`:** `target` ES2017 → ES2020 (autorizado pelo prompt; resolve TS1501 das regex `s` do INCC; deploy Vercel/Node 20+).
- **Embeds array-vs-objeto (4):** asserts tipados na fronteira com comentário.
- **DTO explícito `CupomValidoResponse`** espelhando `/api/cupons/validate`.
- **email `undefined` vs `null`:** `?? null` nas fronteiras (GoTrue × contratos locais).
- **`VillaBiancoUnit.valorVenda`:** `number | null` (verdade do dado; todos os consumidores já protegem).
- **ESLint `set-state-in-effect` (3):** `mounted` + banner MFA do `ProjetosClient` via `useSyncExternalStore`; reset de `flipping` do `vitta-dashboard` via ajuste de estado em render (padrão oficial React). Comportamento preservado.

### `perf: deduplicate browser auth client and global islands` (Fase 1.1/1.2 — P1.2, P2.5, P3.1)
- **Singleton browser do Supabase** em `src/lib/supabase/client.ts` (uma instância por execução do módulo; server client continua por request).
- **Toaster global removido do layout** (zero consumidores de `use-toast`/`sonner`; AdminSistemaClient renderiza toasts inline). Módulos mantidos no repo; removidos do caminho de todas as páginas.
- **Geist via `next/font/local`** com `.woff2` versionados em `src/fonts/` (elimina dependência de rede no build; CSP mantida).
- **Asset OG `imobsync-preview.webp` criado** (referenciado pelo metadata mas inexistente — 404 para crawlers; 1200×630, 2 KB).

### `perf: drop duplicate profile query and narrow selects` (Fase 1.4 — P1.3, P1.5)
- **Consulta de perfil duplicada removida** em `projetos/page.tsx` (1 query a menos por acesso).
- **Existência com `limit(1)`** em `isCoordenadorWithAnyEmpreendimento` e `coordenadorHasAccess` — lookup pontual por índice em vez de carregar todas as atribuições; semântica fail-closed `42P01` preservada.
- **`select("*")` → colunas de contrato** onde verificável: cupons/validate, subscriptions/create, signup-subscribe, catálogos de planos (3 locais, contrato `PlanoDB`), `empreendimento/[id]`. Os demais (tabelas de unidades, CRUD admin, `simulador_configs`) são contratos de linha inteira consumidos por dashboards — redução exige auditoria consumidor-a-consumidor e ficou documentada como pendência.

### `perf: convert internal anchors to Link and replace on auth transitions` (Fase 1.3 — P2.6)
- 12 âncoras internas estáticas → `<Link>` (navegação client-side, sem reload total). Âncoras com href dinâmico e `target="_blank"` permanecem `<a>` deliberadamente.
- **Logout `push` → `replace`** (transição não deve permanecer no histórico) em 4 dashboards + 3 pontos admin. **`router.refresh()` mantido** no logout: purga o Router Cache de rotas autenticadas — razão de segurança (regra 4).
- Fluxos pós-login do `page.tsx` intencionalmente preservados para a Fase 2 (bootstrap autenticado).

### `perf: deliver presized webp assets for login screen` (Fase 6.1/6.2)
- Logo do login: 4536×1040/181 KB → **`imobsync-logo-claro-md.webp` 480×110/8 KB** (gerado do original; nitidez mantida em DPR 2; width/height explícitos contra CLS; `fetchPriority=high` — é a imagem LCP). ~173 KB a menos na rota pública.
- **Slides do carrossel:** apenas o slide LCP com `eager`/prioridade alta; demais `lazy` + `decoding=async`. Carrossel, intervalos e acessibilidade inalterados.
- Zero uso de `/_next/image`; `images.unoptimized: true` intocado; nenhum consumo da cota de Image Optimization da Vercel.

### `perf: migrate middleware to Next 16 proxy convention and narrow matcher` (Fase 8.1/8.2 — P3.2)
- `src/middleware.ts` → **`src/proxy.ts`** com `export function proxy` (convenção Next 16.1.1).
- Matcher restrito às rotas protegidas: removidas `/mfa-setup`, `/change-password`, `/mfa-onboarding`, `/planos`, `/aguardando-pagamento` (o corpo sempre devolvia `next()` — invocações de edge desperdiçadas por request).
- `/admin/login` e todas as validações reais no servidor/RLS preservadas (cookies são hint, nunca fonte de autorização).

### INCC incluído no commit do proxy (Fase 6.3 — P1.7)
- **Promessa compartilhada em voo** (cold start concorrente = uma única sequência de fetches upstream, não N).
- **Stale-safe:** falha das fontes externas não apaga mais o último dado real do cache (o fallback estático não sobrescreve); se houver dado real vencido, ele é servido em vez do estático.
- **`Cache-Control: public, s-maxage=21600, stale-while-revalidate=43200`** — dado público e não personalizado (contrato de resposta inalterado; resposta compacta opt-in fica para depois por ser quebra de contrato).

## 3. Achado crítico descoberto pela tipagem (requer decisão do proprietário)

**`webhooks/mercadopago` — `filter` de `listUsers()` ignorado em runtime.** A versão instalada de `@supabase/auth-js` só envia `page`/`per_page`; o fallback de busca por `payer_email` pode não corresponder ao usuário real (recebe o 1º usuário da página). **Comportamento preservado como está** (regra 12: não alterar lógica de pagamento sem staging/testes), marcado com comentários `⚠︎ FINDING` nos 2 locais. Recomendação: correção dedicada (busca client-side por e-mail ou RPC service-role com coluna indexada) **com validação em staging** antes de produzir.

## 4. Métricas — o que foi e não foi medido

**Medido e reproduzível localmente:** tsc (176→0), lint (11→0), build com type checking (37,9 s), testes (17/17), tamanhos dos novos assets (logo 181 KB→8 KB; OG 2 KB).

**Não medido (bloqueado sem staging, conforme regra do prompt):** Lighthouse (5 execuções/mediana), CWV p75 (LCP/INP/CLS/TTFB), gzip por rota no navegador (o Next 16/Turbopack não emite os manifests equivalentes aos usados pela auditoria — medição precisa exige `next start` + rede), p50/p95 de APIs, `EXPLAIN (ANALYZE, BUFFERS)`, React Profiler, requests/queries por jornada comparados. As estimativas da auditoria permanecem a linha de base de referência.

## 5. Fases não iniciadas nesta rodada e por quê

| Fase | Motivo do adiamento |
|---|---|
| **0.1 completa** (login/MFA/pagamentos/Realtime/upload/PDF golden) | Exige credenciais de staging e fixtures de banco; feito o subconjunto viável (funções puras). Nenhum refatoramento dessas áreas deve ocorrer antes. |
| **Fase 2** (login sem waterfall, bootstrap único) | Caminho de autenticação crítico; o prompt exige testes de caracterização dos destinos por papel/estado antes. Risco inaceitável sem staging. |
| **Fase 3** (dados iniciais server-side, contexto de autorização por request) | Toca todos os dashboards + APIs autenticadas; idem exigência de testes. |
| **Fase 4** (bulk update RPC, importação Excel em chunks) | Requer migrations aplicadas no banco + validação de atomicidade/Realtime em staging. Design já está especificado na auditoria (P0.2/P0.3). |
| **Fase 5** (view/RPC de resumo, analytics agregado, índices) | Exige `EXPLAIN (ANALYZE, BUFFERS)` em dados representativos (regra 9). Índices candidatos já listados na auditoria §5. |
| **Fase 7** (framer-motion → CSS, useMemo único, content-visibility) | Requer Profiler + comparação visual; meta 105–115 KB gzip só verificável com medição real. |
| **Fase 8 parcial** (deps mortas, Bun×npm, budgets CI) | Remoção de dependências exige grafo de importação + build validados em deploy; `otplib` pede suíte MFA isolada; budgets de Lighthouse dependem de CI com medição. Feito: proxy.ts, matcher, fontes locais. |

## 6. Riscos e reversão

- **Cada commit é isolado e reversível** (`git revert <hash>` individualmente; nenhum depende de outro para funcionar).
- **Singleton Supabase:** logout → login com outro usuário validado pela análise de fluxo (mesmo cliente, sessão trocada no GoTrue; canais continuam sendo removidos via `removeChannel`). Revalidar em staging com 2 usuários.
- **`useSyncExternalStore` (ProjetosClient):** banner MFA aparece alguns ms antes (pré-paint pós-hidratação vs pós-paint) — mesmo resultado visual; sem risco de mismatch (snapshot do servidor = 0).
- **Matcher do proxy:** se alguma rota protegida nova for criada fora da lista, ela não passará pelas checagens de cookie — as validações de servidor das páginas continuam protegendo (defesa em profundidade). Adicionar à lista ao criar rotas.
- **`Cache-Control` do INCC:** dado público; se algum consumidor futuro personalizar a resposta, remover o header.
- **Migrations/SQL:** nada foi aplicado ao banco nesta rodada.

## 7. Instruções de deploy e rollback

1. **Deploy padrão Vercel** a partir da branch (ou merge em `main` após revisão). Nenhuma variável nova é exigida; nenhuma migration é necessária.
2. **Rollback de código:** `git revert` dos commits listados na seção 2, na ordem inversa. O único artefato de infraestrutura é o proxy (convenção do próprio Next).
3. **Verificação pós-deploy (checklist):**
   - `/` renderiza com o logo nítido e sem 404 de `imobsync-preview.webp`;
   - login → destino por papel inalterado; MFA/passkey inalterados; logout → `/` sem histórico;
   - Zero requests a `/_next/image` (aba Network);
   - Coordenador: acesso apenas aos empreendimentos atribuídos;
   - Cupom válido/inválido no fluxo público de planos;
   - Webhook MP de pagamento (staging) → assinatura ativa.

## 8. Próximos passos recomendados (ordem)

1. Validar em staging e corrigir o achado do webhook (seção 3).
2. Fornecer credenciais de staging → completar Fase 0.1 (testes de caracterização de login/MFA/pagamentos/PDF) → liberar Fases 2 e 3.
3. Aplicar e medir os índices candidatos (auditoria §5) com `EXPLAIN (ANALYZE, BUFFERS)` antes/depois.
4. Implementar bulk update/Excel em chunks (Fase 4) com RPC transacional e rollback documentado.
5. Fase 7 (framer-motion → CSS, derivações únicas, `content-visibility`) com React Profiler antes/depois.
6. Ativar `reactStrictMode` após correção de efeitos não idempotentes em staging.
7. Budgets de bundle/Lighthouse no CI (Fase 8.8).
