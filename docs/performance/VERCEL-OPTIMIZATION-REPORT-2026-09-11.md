# ImobSync — Relatório de otimização Vercel (implementação)

Data: 11/09/2026 • Branch: `opt/vercel-2026-09-11` • Base: `main` @ `6d50841`
Faixa de commits desta entrega: `72c9fa0..80e7b3c` (7 commits pequenos, reversíveis)

Complemento operacional: `docs/performance/VERCEL-RETENTION-PLAN-2026-09-11.md` (retenção em dry-run).

---

## 1. Sumário executivo

Implementação local verificável das otimizações priorizadas pela auditoria, preservando contratos, segurança, cálculos e funcionalidades. **Nada foi publicado**: o trabalho vive na branch; merge/deploy é decisão do proprietário, e os gates integrados (Vercel, Supabase de produção) seguem pendentes por ausência de credenciais.

| Fase | Entrega | Métrica-alvo | Status |
|---|---|---|---|
| A | Baseline reproduzido + inventário de output | Diagnóstico | ✅ executado |
| F | Correção da medição interna (`record-usage` + `monitor-usage.mjs`) | Confiabilidade dos alertas | ✅ executado + 13 testes |
| D2 | Histórico de status em lotes (1 insert/100 unidades) | Chamadas ao banco | ✅ executado + 5 testes |
| D1 | Persistência em lotes na importação de Excel | Round trips + duração | ✅ executado + 10 testes |
| E2 | Polling de pagamento consciente de visibilidade | Invocações evitáveis | ✅ executado |
| E1 | Contexto de auth por request (`canReadUnits`) | Round trips de autenticação | ✅ executado + 5 testes |
| B1 | Standalone só para self-hosting | Bytes por deployment | ✅ executado (efeito na Vercel pendente de deploy) |
| B2 | 16 dependências sem uso removidas | node_modules / superfície de audit | ✅ executado (738→682 entradas no lock) |
| §9 | Webhook MP: associação inequívoca por e-mail | Correção de defeito confirmado | ✅ commit separado + 8 testes |
| D3 | Analytics: validação de `days` + paginação anti-truncamento | Corretude dos KPIs | ✅ subconjunto seguro; RPC fica pendente |

Gates locais finais: **122 testes em 10 arquivos** (78 antes → 122), `tsc --noEmit` ✅, `eslint .` ✅, `next build` ✅ (com checagem TypeScript ativa, `reactStrictMode` inalterado).

---

## 2. Baseline (Fase A)

- Instalação: `npm ci` (Node v24.19.0, npm 11.17.0). Versões resolvidas idênticas à auditoria: Next 16.1.3, React 19.2.3, Supabase JS 2.101.1, SSR 0.10.0, XLSX 0.18.5, Sharp 0.34.5, TypeScript 5.9.3, jsPDF 4.2.1.
- HEAD inicial = `6d50841` — exatamente o commit auditado; nenhum achado precisou ser revalidado por divergência de código.
- Inventário (soma de bytes, MB decimal) — script versionado `scripts/measure-output.js`:

| Artefato | Antes | Depois (branch) |
|---|---:|---:|
| `public` | 1,802 | 1,802 |
| `.next/static` | 3,427 | 3,417 |
| `.next/server` | 35,209 | 35,218 |
| `.next/standalone` | 65,669 (após cópia no `build`) | **AUSENTE** no build padrão (só em `build:standalone`) |

- Manifests `.nft.json` em `.next/server`: 95; união de arquivos citados ≈ **7,29 MB** — TypeScript e Sharp/**@img** NÃO aparecem nos traces por rota. Os ~20 MB de TypeScript e ~17 MB de Sharp/@img citados pela auditoria vivem no **standalone** (trace do servidor geral), confirmado por inspeção de `.next/standalone/node_modules`.
- **Duplo lockfile confirmado** (`package-lock.json` + `bun.lock`) e `vercel.json` vazio `{}`. Qual gerenciador a Vercel usa depende da detecção no projeto — ver §6 (campo pendente).

---

## 3. O que foi implementado (por commit)

### 3.1 `72c9fa0` — fix(monitoring) [Fase F]
- `record-usage`: (a) nega execução quando `CRON_SECRET` não está configurado (503; comparar buffers vazios não é autorização); aceita `?secret=` (compatível com o agendamento cron-job.org existente) **ou** `Authorization: Bearer`; (b) janela do dia `[00:00Z, 00:00Z do dia seguinte)` — fim exclusivo (antes perdia eventos entre 23:59:59 e 24:00); (c) elimina dupla contagem: mês usa `[início do mês, agora)`, que já inclui hoje; (d) projeção com dia corrente e dias **reais** do mês, UTC explícito (`src/lib/usage-window.ts`); (e) limite configurável via `USAGE_INVOCATIONS_LIMIT` (padrão 1.000.000 conforme captura, rotulado "confirmar na conta"); (f) resposta distingue estimativa (`analytics × 1.8`) de medição e informa `functions_storage: "não coletado"` com a fonte oficial.
- `monitor-usage.mjs`: mesmo limite configurável, rótulos honestos ("estimativa", "não é medição da Vercel"), recomendação sem promessa de plano/valor.
- Testes: `tests/usage-window.test.ts` (janela do dia, meses, bissexto, projeção, `parseDaysParam`).

### 3.2 `8bb18af` — perf(history) [Fase D2]
- `trackUnitStatusChanges()` (`src/lib/analytics.ts`): 1 cliente admin por chamada, inserts de **arrays** em chunks de 100, aguardados sequencialmente (sem promessa órfã), tratamento de **erros retornados pelo SDK** além de exceções, contagem de chunks falhados. 500 unidades → **5 requisições em vez de 500** (comparação algorítmica; medição de produção pendente).
- Granularidade preservada: uma linha por unidade **realmente atualizada**, com autor, papel, empreendimento, status anterior/novo; nenhuma linha para falhas.
- PATCHes individuais (5 rotas): histórico agora é **aguardado** antes da resposta (persistência essencial; antes era fire-and-forget, sujeito a congelamento da Function).
- `trackUnitStatusChange` (singular) segue existindo para os PATCHes, agora também tratando erro do SDK.

### 3.3 `44260be` — perf(upload-excel) [Fase D1]
- Rota reestruturada em 3 fases: **classificação pura** (idêntica ao fluxo sequencial: skip de unidade vazia, ambiguidade ignorada com detalhe, casamento exato/tolerante, precedência Excel > projeto_units > dedicada) → **upsert em lotes** (chunks de 100; chave `empreendimento_id,bloco,unidade`) → **replicação dedicada agrupada**.
- Preservação contratada verificada em testes: campos em branco/ausentes não apagam banco; zero válido é mantido; identidade composta inclui ambiguidade entre blocos; unidade ambígua não é escolhida; linhas duplicadas da planilha colapsam para a **última ocorrência** (`dedupeUpsertPayloads` — mesmo estado final do loop sequencial) e a resposta agora informa `duplicated_rows_in_sheet`; falha de chunk cai em **fallback por linha** para atribuir erros por unidade sem perder as boas; sync dedicada só replica linhas cujo upsert teve sucesso (mesma regra de antes) e agrupa payloads idênticos em `.update().in(ids)` com concorrência ≤ 6 e fallback por id.
- Limites de entrada antes do processamento oneroso: 10.000 linhas e 10 MiB (413 com mensagem).
- Contadores e detalhes da resposta: mesmas chaves (`inserted/updated/skipped/errors/sync_ok/sync_failed`, `errors[]`, `sync_details[]`); campo novo apenas **aditivo** (`duplicated_rows_in_sheet`, `total_rows` já existia).
- Não foram usadas RPC/migração — não há nome de tabela livre do cliente nem mudança de RLS.

### 3.4 `23f675e` — perf(polling) [Fase E2]
- `AguardandoPagamentoClient`: uma consulta em voo por aba (`inFlightRef`); ticks automáticos pulados quando `document.hidden` ou offline; verificação imediata em `visibilitychange`/`online`; botão manual preservado (e ignorando a pausa de visibilidade, pois a intenção é explícita); cadência de 15 s e teto de 30 min **inalterados**; respostas tardias após logout/unmount são ignoradas e a requisição em voo é abortada; comentário desatualizado (5 s) corrigido; validação do lado do servidor permanece a única fonte de confirmação.

### 3.5 `4bc8bb6` — perf(auth) [Fase E1]
- `subscription-guard.ts`: avaliação de validade extraída para função pura (`evaluateSubscriptionValidity`) e nova `hasValidSubscriptionForUser(userId)` — consulta a assinatura **agora**, sem TTL e sem estado global, preservando lazy expiration.
- `canReadUnits(user, role)`: para perfis comuns, não repete `auth.getUser()` + `profiles` (o `user.id` já foi validado por cookie nesta request pelas páginas); admin_sistema/coordenador mantêm bypass idêntico. Guard de assinatura/expiração/escopo e RLS intactos.
- Deduplicação do histórico nos PATCHes individuais (2ª consulta de user/role) ficou **pendurada** com design pronto — ver §8.

### 3.6 `6ff8117` — chore(build) [Fase B1]
- `next.config.ts`: `output` standalone **condicionado** a `NEXT_OUTPUT=standalone`; headers/CSP, `images.unoptimized` e `reactStrictMode` intactos.
- `package.json`: `build` = `next build` (output nativo); `build:standalone` = fluxo self-hosting com cópias via `scripts/copy-standalone.mjs` (cross-platform); `start` = `next start` (não aponta mais para standalone inexistente); `start:standalone` = `bun .next/standalone/server.js`.
- Medido localmente: build padrão deixou de produzir ~65,7 MB de standalone; fluxo self-hosting validado ponta a ponta (server.js + public + static).
- **Efeito na Vercel pendente**: depende de o Build Command do projeto ser `npm run build` (aí o standalone antigo era produzido e retido) ou `next build` (aí nada muda). Ver §6.

### 3.7 `c60f7b5` — chore(deps) [Fase B2]
- Removidas 16 dependências **sem nenhum import** em `src/`/`scripts/` (confirmado por varredura de imports diretos e de wrappers): `z-ai-web-dev-sdk`, `@dnd-kit/core|sortable|utilities`, `@tanstack/react-query|react-table`, `uuid`, `zustand`, `@hookform/resolvers`, `react-hook-form`, `embla-carousel-react`, `react-day-picker`, `react-resizable-panels`, `recharts`, `sonner`, `next-themes`.
- Removidos junto os wrappers shadcn órfãos que as importavam (`ui/form|chart|carousel|calendar|resizable|sonner.tsx`). `input-otp` **mantido** (MFA usa diretamente). `framer-motion`, jsPDF/AutoTable, React DOM, Sharp e plugins CSS preservados.
- Lockfile: 738 → 682 entradas; `bun.lock` regenerado com `bun install` para não divergir.
- Honestidade: `.next/server` ficou estável (~35,2 MB) — essas deps já não entravam nos traces por rota; o ganho é de instalação/manifest e de superfície de auditoria, **não** de Functions Storage comprovado.

### 3.8 `a02de4c` — fix(webhook) [§9, commit separado]
- Defeito confirmado: `listUsers({ filter: 'email.eq...' })` não aplica o filtro no SDK instalado; `users[0]` de uma página de 1 associava o pagamento a um **usuário arbitrário**. Corrigido nos dois pontos (`processPaymentEvent` e `findLocalSubscription`): associação por e-mail com correspondência exata via `profiles` (espelho 1:1 de `auth.users` pelo trigger `handle_new_user`), case-insensitive, via `.in()` exato (evita `ilike`, que trata `_` como curinga); **ambiguidade → não associa** e registra erro; HMAC, idempotência e demais validações intocadas. Nenhum pagamento real executado.

### 3.9 `80e7b3c` — perf(analytics) [Fase D3 — subconjunto seguro]
- `days` validado e limitado (1..365; default 30) — antes aceitava inteiro arbitrário.
- Paginação determinística anti-truncamento (páginas de 1.000 por `created_at desc + id`, guarda-corrente de 100 páginas): os KPIs deixam de subnotificar silenciosamente acima do limite de linhas do PostgREST. É correção funcional deliberada e documentada (campo `meta` na resposta, aditivo).
- Caracterização explícita (sem alterar): a série diária NÃO aplica `role`/`event_type` — comportamento pré-existente preservado e documentado na resposta.
- Agregações em banco (RPC/visões) e leitura de contagens em `projetos/page.tsx`/`/api/empreendimentos`: pendentes, com design no §8.

### 3.10 Scan de dependências (§9)
- `npm audit` pós-remoção: **17 entradas** (1 crítica, 10 altas, 5 moderadas, 1 baixa). Não implica 17 vulnerabilidades exploráveis.
- Crítica: cadeia de `next` via postcss/sharp — atualização de versão é mudança **separada** com testes (regra 6); não executada.
- `xlsx` (alto, sem fix upstream): usado no upload real; mitigação atual é validação estrita de entrada + limites (implementados). `sharp` (alto, libvips): com `images.unoptimized: true`, a pipeline de imagem do Next não é invocada por requisição de usuário; exposição condicional.
- Demais altos são transitivos/dev com fix disponível — propostos como manutenção separada (não executada nesta trilha).

---

## 4. O que explica o excesso de Functions Storage — e o que NÃO foi comprovado

- **Explicação mais consistente**: Functions Storage é acumulado por pacotes de função × região × deployments retidos ao longo do tempo (GB-mês). Com traces por rota leves (~7,3 MB de união), a magnitude de 29,82 GB sugere **retenção longa de deployments/previews** e/ou captura que inclui mais de um projeto — exatamente a hipótese V01 (P0) da auditoria. Sem acesso ao painel, não é possível decompor.
- **Não comprovado**: quantos deployments estão retidos, quantas regiões, se a captura é só do ImobSync, qual período, e qual Build Command efetivo. Nenhuma estimativa foi apresentada como medição.
- **O que os ajustes fazem e não fazem**: B1/B2 reduzem bytes de **novos** deployments; D1/D2/E1/E2/D3 reduzem processamento e chamadas (duração/CPU); nada apaga consumo já contabilizado — retenção é alavanca operacional (plano anexo).

## 5. Respostas às perguntas do prompt (§11)

1. **Explicação do excesso / não comprovado** — ver §4.
2. **Bytes por deploy vs processamento** — bytes: B1 (standalone não mais produzido no build padrão: −65,7 MB de artefato local medido), B2 (instalação/manifest). Processamento/chamadas: D1 (até ~2N → ~N/100 + grupos), D2 (N → N/100), E1 (−2 consultas/página de espelho), E2 (elimina ticks ocultos/offline), D3 (correção de contagem; RPC pendente).
3. **Transformações de imagem** — código já entrega origem sem transformação (`images.unoptimized: true` preservado). Hipóteses (consumo acumulado, outro projeto/versão, `/_next/image` residual) exigem telemetria — não coletado; nenhuma alteração fictícia foi feita.
4. **Ganho medido** — todos os números citados são locais (Node v24.19.0, base `6d50841`, branch `opt/vercel-2026-09-11`) e algorítmicos; nenhum ganho de conta foi medido.
5. **Ações que dependem de acesso/aprovação** — plano de retenção (dry-run anexo), confirmação de franquias/Build Command, deploy da branch, RPCs de agregação, atualização de dependências críticas.
6. **Pendências que impedem afirmar preservação funcional completa** — ver matriz §7 (linha "não testado de ponta a ponta"): login/MFA/RLS/webhooks/Realtime em produção não foram exercitados.

## 6. Campos pendentes (acesso Vercel, leitura)

| Campo | Onde obter | Por que importa |
|---|---|---|
| Projeto(s) no escopo da captura | Usage → filtro por Projects | Isolar 29,82 GB |
| Período do painel | seletor do Usage | Evitar projeção inválida |
| Commit publicado em produção | Deployments → Production | Correlacionar código↔consumo |
| Build Command efetivo | Settings → Git → Build Command | Decidir efeito real do B1 |
| Gerenciador detectado | logs de build (npm/bun/yarn/pnpm) | Padronizar lockfile |
| Fluid Compute ativo? | Settings → Functions | Interpretar CPU/duração |
| Regiões das Functions | Settings → Functions | Custos por região |
| Retenção/atraso de processamento | Settings → Deployments → Retention | Plano de retenção |
| Deployments com alias | Deployments → aliases | Exceções de retenção |
| Transformações por origem | Usage → Image Optimization | Associar a projeto/versão |
| Limite real de invocações | plano contratado | Corrigir `USAGE_INVOCATIONS_LIMIT` |

## 7. Matriz de testes (executados / pendentes)

**Executados localmente**: gates completos (test 122, lint, typecheck, build); dedupe/chunking/precedência do Excel (10 testes novos + 25 pré-existentes de `excel-mirror`); chunking de histórico (5); janelas/projeção/limites (16); validade de assinatura (5); resolução inequívoca MP (8); match de batch pré-existentes.

**Pendentes (sem ambiente integrado)** — declarados por linha da matriz do prompt: Auth/MFA e troca de usuário (produção); espelhos legados+genérico com Realtime e reconexão; Excel contra Supabase real (10/100/500 linhas, concorrência, erro real de persistência); histórico com erro de insert visível; analytics com dataset > limite e filtros; polling em dispositivos reais; upload de imagens (não alterado); simulações/PDF byte a byte (código de cálculo **não** foi tocado); pagamentos reais (proibido). Rollback: revert por commit (`git revert <hash>`), sem migrations nesta trilha — nenhuma incompatibilidade código↔banco introduzida.

## 8. Trabalho pendente com design pronto (não implementado aqui)

1. **D1 via RPC** (reduzir ainda mais round trips da sync dedicada heterogênea): função `update_units_fields(payload jsonb, ids uuid[])` com `EXECUTE` restrito, `search_path` fixo e RLS intacta; migration revisável.
2. **D3 agregações em banco**: view/RPC com `COUNT/MAX/GROUP BY` para `analytics` e contagens de `projetos/page.tsx` + `/api/empreendimentos`; decidir intenção do produto para os filtros da série diária antes de alterar.
3. **E1 nos PATCHes**: propagar `{userId, role}` do guard já executado para o histórico (evita 2ª consulta de perfil nas 5 rotas).
4. **E3 cache seletivo**: mapear consumidores de `/api/plans/public` e extrair catálogo público com invalidação nos CRUDs; INCC preservado como está (medir HIT/MISS antes de mexer em TTL).
5. **C — upload de imagem direto ao Supabase** (limite 10 MiB vs 4,5 MB de transporte): autorização de curta duração + upload direto + finalização server-side validando objeto/ownership antes de persistir `imagem_url`; alteração isolada e testada — não iniciada para não entregar fluxo de admin sem integração.
6. **B1 experimento**: converter `next.config.ts`→`.js` para retirar TypeScript do trace do standalone (relevantíssimo só para self-hosting).
7. **Atualização de dependências** (next crítica, transitivos com fix): trilha separada com testes e re-medição de bundle.
