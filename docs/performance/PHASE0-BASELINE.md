# Fase 0 — Baseline de performance e bloqueios

**Branch:** `perf/optimization-program`
**Commit base:** `482d5bb8f5d884cf17e94559ec4b2ba512a919a3` (exatamente o commit auditado — zero divergências de código; os 4 commits anteriores da `main` já estão contidos no histórico do commit auditado)
**Ambiente local:** Node v24.19.0 / npm 11.17.0 (sem credenciais de staging Supabase/Mercado Pago)

## 1. Baseline reproduzido (antes de qualquer alteração)

| Verificação | Resultado medido | Auditoria v1.0 | Divergência |
|---|---|---|---|
| `npm ci` | OK (618 pacotes) | 618 pacotes | nenhuma |
| `npx tsc --noEmit` | **176 erros em 31 arquivos** | 176 erros em 32 arquivos | contagem de arquivos: 31 vs 32 (mesma ordem de grandeza; provável diferença de versão do tsc) |
| `npm run lint` | **3 erros + 8 avisos em 9 arquivos** | 3 erros + 8 avisos em 9 arquivos | nenhuma |
| `npm run build` | **28,5 s** (com `ignoreBuildErrors`) | 36,1 s | diferença de hardware do ambiente |
| Build com type checking | **37,9 s** (após Fase 0.2) | n/a | custo esperado da checagem de tipos |
| Erros TS por código | TS2739×72, TS2322×51, TS2339×21, TS2367×7, TS2352×7, TS18046×7, TS2345×4, TS2552×2, TS2353×2, TS1501×2, TS2551×1 | n/a | — |

### Bloqueios de medição (sem staging disponível)

Conforme regra do prompt ("não invente resultados"), os itens abaixo **não foram medidos** nesta fase e permanecem bloqueados até que credenciais de staging sejam fornecidas:

- Lighthouse móvel/desktop (5 execuções por rota crítica, mediana);
- Core Web Vitals p75 (LCP/INP/CLS/TTFB);
- tamanhos gzip por rota no navegador (a auditoria fornece estimativas por manifest; reutilizo como referência até medição em staging);
- p50/p95 das APIs e `EXPLAIN (ANALYZE, BUFFERS)` (exige banco com dados representativos);
- React Profiler em grades pequena/média/grande;
- `reactStrictMode: true` — mantido **desativado** conforme estado atual; ativar exige validação de idempotência de efeitos/listeners em staging (auditado como efeito não verificável aqui).

Scripts de medição preparados: ver `docs/performance/` (este diretório).

## 2. Testes de caracterização entregues (escopo viável sem staging)

- Runner: **Vitest** (devDependency apenas; não afeta o bundle de produção).
- `tests/characterization.pure.test.ts` — 17 testes travando valores golden de:
  - `isSubscriptionActive` (todos os status, incluindo `lifetime`, datas limite);
  - `getStatusLabel` (rótulos pt-BR canônicos + verbatim para desconhecidos);
  - `getStats` de `units-data` (contagens, agregados de preço, áreas);
  - `formatCurrency`/`formatCompactCurrency` (incluindo NBSP U+00A0 do Intl pt-BR);
  - campos derivados `valorStr`/`valorFormatado` de `moment-data` (72 unidades, fallback "Consulte").

### Cobertura bloqueada (requer staging/fixtures de banco)

login/Turnstile/MFA/passkey, assinatura/checkout/webhook Mercado Pago, Realtime, upload Excel/imagem, PDFs golden dos simuladores. **Nenhum refatoramento dessas áreas deve ocorrer sem os testes de caracterização correspondentes.**

## 3. Fase 0.2 — correções aplicadas (gates de qualidade)

Categorias corrigidas (176 → 0 erros TS; 3+8 → 0 problemas ESLint):

1. **moment-data.ts (72 erros):** tipo bruto `RawMomentUnit = Omit<MomentUnit, "valorStr" | "valorFormatado">` — os campos derivados são calculados no `.map()`; a tipagem anterior mentia sobre a forma do array bruto.
2. **mercadopago.ts (11):** status `'lifetime'` adicionado a `AssinaturaDB` (é gravado no banco por `grant-lifetime` — o tipo estava dessincronizado); casts de resposta do SDK via `as unknown as Record<string, unknown>`; uso de `mpErr` tipado em vez de `err: unknown`.
3. **Simuladores ×5 (55):** cores jsPDF tipadas como tupla `[number, number, number]`; `msSaveOrOpenBlob` (API legada IE) com capability check tipado — branch preservado; comparação `inccMode === "none"` alargada para `InccMode` (falso positivo de narrowing).
4. **`err` → `error` em respostas Postgrest (6 locais):** alias `error: err` — mantém o corpo local intacto, corrige a desestruturação.
5. **server.ts (2):** import `NextResponse` faltante em `createMiddlewareClient`.
6. **tsconfig:** `target` ES2017 → **ES2020** (autorizado pelo prompt: "ES2018 ou superior"; deploy Vercel/Node 20+ suporta; resolve TS1501 das flags `s` de regex no INCC).
7. **Relações Supabase array-vs-objeto (4):** asserts tipados na fronteira com comentário — PostgREST retorna objeto em embeds N:1, mas supabase-js sem tipos gerados infere array.
8. **ReactNode/unknown (3):** `Boolean(...)` para flags de plano; `String(...)` para display_name/email.
9. **DTO explícito de cupom (PlanosPublicClient, 7 erros):** interface `CupomValidoResponse` espelhando o contrato de `/api/cupons/validate`.
10. **email `string | undefined` vs `string | null` (4):** `?? null` na fronteira (GoTrue usa `undefined`; contratos locais usam `null`).
11. **VillaBiancoUnit.valorVenda:** `number` → `number | null` (verdade do dado; todos os consumidores já protegem contra null).
12. **subscription-create:** guard defensivo `if (!assinaturaId)` — nunca dispara no fluxo atual (ambos os branches atribuem), satisfaz o contrato de `createMpPreference`.
13. **setup-storage:** `.catch()` inexistente no builder do RPC substituído por `try/await/catch` (mesmo comportamento).
14. **units-data:** comparação com status inexistente `"consultar"` documentada + cast (contador sempre 0, mantido por compatibilidade de shape).

### ⚠︎ Achado crítico de segurança/funcionalidade descoberto pela tipagem

`webhooks/mercadopago/route.ts` (2 locais): a versão instalada de `@supabase/auth-js` **ignora o parâmetro `filter` de `listUsers()`** — apenas `page`/`per_page` são enviados. O fallback de busca por `payer_email` no webhook pode, portanto, **não corresponder ao usuário real** (recebe o primeiro usuário da página 1). Comportamento **preservado como está** (regra 12 do prompt: não mudar lógica de pagamento sem staging/testes) e registrado com comentário `⚠︎ FINDING`. **Recomenda-se correção dedicada com validação em staging** — ex.: busca client-side por e-mail ou coluna `email` indexada via RPC service-role.

15. **ESLint `set-state-in-effect` (3 erros):**
    - `ProjetosClient`: `mounted` via `useSyncExternalStore` (hidratação-segura, sem setState em effect); banner MFA derivado de snapshot de store externo (localStorage) com notificação no dismiss — comportamento idêntico (banner oculto na hidratação, decisão no client);
    - `vitta-dashboard`: reset de `flipping` quando `updateMode` desativa via padrão oficial de ajuste de estado durante render (documentado em react.dev/learn/you-might-not-need-an-effect).
16. **ESLint avisos (8):** diretivas `eslint-disable` não utilizadas removidas (`--fix`).

## 4. Resultado dos gates após Fase 0.2

| Gate | Antes | Depois |
|---|---|---|
| `npx tsc --noEmit` | 176 erros | **0 erros** |
| `npm run lint` | 3 erros + 8 avisos | **0 erros, 0 avisos** |
| `npm run build` (type checking ativo) | build aceitava erros | **verde** |
| `npx vitest run` | n/a (sem infra) | **17/17 verdes** |
| `typescript.ignoreBuildErrors` | `true` | **removido** |
| `reactStrictMode` | `false` | `false` (pendente staging) |
