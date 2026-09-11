# ImobSync — Trilha separada de atualização de dependências críticas

Data: 11/09/2026 • Branch: `chore/deps-security-2026-09-11` (empilhada sobre `opt/vercel-2026-09-11`)
Complemento de: `VERCEL-OPTIMIZATION-REPORT-2026-09-11.md` (§9 e pendência nº 7) e `ImobSync_Auditoria_Vercel_2026-09-11.md` (§6)

Trilha dedicada a correções de dependências, conforme a regra 6 do prompt (mudanças de segurança separadas das otimizações) e a recomendação da auditoria (§7): **nenhuma atualização foi misturada ao patch de otimização**; cada commit é reversível individualmente.

---

## 1. Resultado consolidado

| Scan `npm audit` | Antes (baseline) | Depois |
|---|---:|---:|
| Críticas | 1 | **0** |
| Altas | 10 | **0** |
| Moderadas | 5 | **0** |
| Baixas | 1 | **0** |
| **Total** | **17** | **0** |

Método: `npm install` pinado por pacote (save-exact) para os diretos; `npm audit fix` **sem `--force`** (apenas bumps semver-compatíveis) para os transitivos; regeneração do `bun.lock` após o fix (ver lição operacional §6). Zero majors forçados fora do `sharp` (o próprio audit indicava `0.35.4` como único fix, major por política de versão da lib, não da API usada).

## 2. Commits da trilha (na ordem)

| Commit | Conteúdo | Achados antes → depois |
|---|---|---|
| `c101808` | `next` 16.1.3 → **16.3.4** + `eslint-config-next` 16.3.4 | 17 → 13 (crítico 1 → 0) |
| `6985f4c` | `sharp` 0.34.5 → **0.35.4** | 13 → 12 |
| `1634bd4` | `xlsx` 0.18.5 → **0.20.3** (distribuição oficial SheetJS via CDN) + 3 smoke tests | 12 → 11 |
| `930dcdb` | 11 transitivos via `npm audit fix` + `bun.lock` regenerado | 11 → **0** |

Gates executados após **cada** commit: `tsc --noEmit`, `vitest run` (131 → 134 testes, com os 3 smoke tests novos do xlsx), `eslint .` (0 erros/0 avisos), `next build` (com checagem TypeScript ativa).

## 3. Classificação de exposição (por que cada atualização era necessária — ou prudente)

### 3.1 `next` — crítico, superfície real mesmo com imagens desotimizadas

O advisory crítico do baseline era a cadeia do `next` (30 advisories entre 16.0 e 16.2.x). A classificação honesta por cenário do ImobSync:

- **Não exploráveis aqui**: RCE em servidores Windows (hospedagem é Linux/Vercel); RCE na Image Optimization API com AVIF e DoS da mesma API (`images.unoptimized: true` — o otimizador não é invocado por requisição de usuário, confirmado na auditoria V03).
- **Superfície real na Vercel**: bypass de Middleware/Proxy via segment-prefetch e injeção de parâmetro dinâmico (o projeto tem `src/proxy.ts` com matcher ativo), envenenamento de cache em respostas RSC e de redirects do proxy, XSS com nonces CSP (o app usa CSP com nonce), SSRF em rewrites/Server Actions, DoS via Server Actions/payloads Edge. **Atualização obrigatória, não opcional.**
- O fix fecha tudo a partir de 16.3.3; foi pinado o **16.3.4** (latest 16.x) para incluir correções de follow-up do 16.3.3.

### 3.2 `sharp` — alto, exposição condicional; major testado

libvips CVE-2026-33327/33328/35590/35591 e libheif GHSA-g89c-p67h-r497/GHSA-2jg2-4ch7-h545. Com `images.unoptimized: true` a pipeline não roda por requisição, mas `sharp` permanece no trace para self-hosting (`build:standalone`). Bump major (0.34 → 0.35) validado por build + suíte; a API consumida é a interna do Next, não código do app.

### 3.3 `xlsx` — alto **sem fix pelo registry**; caminho real de upload

O registry npm congela SheetJS em 0.18.5 (prototype pollution GHSA-4r6h-8v6p-xvw6 e ReDoS GHSA-5pgg-2g8v-p4x9, com `fixAvailable: false`). A correção oficial do projeto SheetJS é a própria distribuição deles; o pacote foi fixado via tarball `cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (save-exact; integridade pinada em ambos os lockfiles). É a dependência mais relevante do lote: roda no **caminho real de importação** (`upload-excel/route.ts`), acessível por admin autenticado. As mitigações já implementadas na tarefa de otimização (validação estrita, limites de 10k linhas/10 MiB, parse em 3 fases) permanecem — a atualização elimina os vetores conhecidos na origem.

Compatibilidade garantida por 3 smoke tests novos (`tests/xlsx-smoke.test.ts`) cobrindo exatamente a superfície usada pela rota: `XLSX.read(buffer, {type:"buffer"})`, `sheet_to_json(..., {defval:""})` com células ausentes → `""`, e conversão numérica/data.

### 3.4 Transitivos — maioria dev/build; dois em runtime

| Pacote | Cadeia | Alcance no ImobSync | Correção |
|---|---|---|---|
| `ws` 8.20.0 → 8.21.3 | supabase-js → realtime-js | **Runtime** (Realtime dos espelhos) | sim |
| `dompurify` 3.3.3 → 3.4.15 | jspdf | Runtime cliente (geração de PDF no navegador) | sim |
| `fflate` 0.8.2 → 0.8.3 | jspdf | Runtime cliente (PDF) | sim |
| `browserslist`, `minimatch`, `picomatch`, `brace-expansion`, `baseline-browser-mapping` | next/build | Build/CI | sim |
| `js-yaml`, `ajv`, `flatted`, `@babel/core` | eslint/eslintrc chain | Dev apenas | sim |
| `@humanfs/node` | vitest | Dev apenas | sim |

`npm ls` foi usado para traçar cada cadeia antes de atualizar — nenhum pacote foi removido, e nenhum advisory foi assumido como explorável sem contexto (regra §9 do prompt). `React DOM`, plugins CSS e demais "ausentes de import direto" não foram tocados.

## 4. Re-medição de bundle (antes → depois, mesma máquina, build nativo sem standalone)

| Métrica | Baseline (16.1.3) | Final (16.3.4) | Δ |
|---|---:|---:|---|
| `.next/static` | 3,427 MB | 3,231 MB | **−196 KB** |
| `.next/server` | 35,209 MB | 36,810 MB | **+1,601 MB** |
| União dos traces por rota (95 manifests) | 7,29 MB | 7,78 MB | +0,49 MB |
| TypeScript na união dos traces | 0 MB | 0 MB | — |
| Sharp/@img na união dos traces | 0 MB | 0 MB | — |
| Entradas no lockfile | 682 | 678 | −4 |

**Honestidade**: as correções de segurança tiveram **custo** de ~1,6 MB no runtime do servidor por deploy (evolução do Next 16.1 → 16.3) e redução de ~196 KB no cliente. Isto não é redução de Functions Storage — é o preço de fechar 30 advisories, incluindo bypass de middleware e cache poisoning que são superfície real. A medição é local (soma de bytes); a contabilização da Vercel (pacote por função × região × retenção) continua pendente de acesso ao painel.

## 5. Rollback e compatibilidade

- Cada commit é auto-contido: `git revert <sha>` restaura versões anteriores com lockfiles coerentes.
- Nenhuma migration de banco, nenhuma mudança de código de aplicação além de: `scripts/measure-output.js` → `.mjs` (ESM; adaptação à nova regra de lint do eslint-config-next) e `handleLogout` (`dynamic-dashboard.tsx`) com `eslint-disable` pontual **documentado** — o full reload no logout é intencional (descarta cache RSC/estado do cliente; trocar por `router.push` seria regressão exatamente do risco que a auditoria mandou preservar).
- `xlsx@0.20.3` via tarball: para reverter, `npm rm xlsx && npm i xlsx@0.18.5` + regenerar bun.lock.

## 6. Lição operacional: ordem entre gerenciadores (lockfile duplo)

`npm audit fix` atualiza `package-lock.json` **e** o `node_modules`; um `bun install` posterior reinstala a partir do `bun.lock` defasado e **reverte** os transitivos no `node_modules` (detectado aqui: `npm ls` mostrava `ws@8.20.0` com audit "0"). Ordem correta:

1. `npm audit fix` (ou installs pinados) → lock npm corrigido (fonte da Vercel);
2. `rm bun.lock && bun install` → bun re-resolve e grava lock próprio alinhado;
3. Revalidar gates no tree final e conferir `npm ls` das cadeias sensíveis.

O `npm audit` lê o lockfile npm — caminho autoritativo da Vercel (npm ci); o `bun.lock` é para self-hosting e precisa acompanhar.

## 7. Pendências para validação completa

1. **Deploy da branch na Vercel** (preview ou merge) — sem credenciais aqui, gates locais não comprovam runtime; validar login/MFA, espelhos com Realtime (mudança de `ws`), upload Excel (mudança de `xlsx`), PDFs (jspdf/dompurify) e os simuladores.
2. Repetir `npm audit --production` na Vercel se ela expuser o scan; comparar bundles por região (B1 do relatório principal).
3. Após merge: monitorar `record-usage`/`monitor-usage.mjs` com os limites configuráveis — a medição corrigida (task de otimização) agora roda sobre as versões atualizadas.
