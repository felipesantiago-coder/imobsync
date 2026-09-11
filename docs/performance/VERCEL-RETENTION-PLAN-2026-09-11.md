# ImobSync — Plano operacional de retenção de deployments (dry-run)

Data: 11/09/2026 • Complemento de: `VERCEL-OPTIMIZATION-REPORT-2026-09-11.md`
**Status (11/09/2026): EXECUTADO.** O proprietário autorizou a execução após o inventário e forneceu o VERCEL_TOKEN na mesma data; o fluxo completo (inventário → dry-run → revisão → execute) rodou com as travas abaixo — log completo em §7. Próximo passo passivo: acompanhar Usage → Deployment/Functions Storage em 24–48 h.

---

## 1. Objetivo e expectativa honesta

Reduzir o crescimento de **Functions Storage** e **Deployment Storage** controlando quantos deployments ficam retidos e quantos gatilhos geram builds. A contabilização da Vercel é GB-mês com máximos diários: **encurtar retenção não apaga consumo já registrado no período e não tem efeito instantâneo**. A produção ativa, os deployments com alias e uma janela de rollback são sempre preservados.

## 2. Inventário a coletar antes de decidir (somente leitura)

Para cada deployment dos últimos 90 dias (Deployments → filtro por ambiente):

| Campo | Onde |
|---|---|
| id / URL | coluna da lista |
| commit + mensagem | coluna / detalhe |
| data de criação | coluna |
| estado (Ready, Error, Canceled) | coluna |
| aliases (`quadra-imob-sync.vercel.app`, domínios) | detalhe |
| fonte (Git push, CLI, hook de CI) | detalhe |
| regiões | Settings → Functions |
| tamanho de output | Usage → Deployment Storage (se disponível por deployment) |

Checagens de gatilhos duplicados:
- pushes em branches não reconhecidas gerando previews redundantes;
- CLI/CI (GitHub Actions etc.) disparando build além do Git;
- redeploys manuais recorrentes;
- branches antiga/renomeada (ex.: workflow que publica duas vezes).

## 3. Política proposta (a revisar após o inventário)

| Categoria | Política proposta | Justificativa |
|---|---|---|
| Produção ativa (com alias) | **Nunca excluir** | Disponibilidade |
| Produção anterior imediata | Manter **3** (janela de rollback) | Rollback rápido |
| Produções anteriores | Manter **30 dias**; depois excluir | Equilíbrio histórico/custo |
| Previews (pr/branch) | Manter **7 dias** | Revisão de PRs ativos |
| Previews com comentário/revisão pendente | Exceção: manter até fechamento | Fluxo de review |
| Canceled/failed | Manter **2 dias** | Diagnóstico curto |
| Deployments com alias real (URLs compartilhadas/custom) | Listar e decidir caso a caso | Não quebrar links |

Nota de semântica (11/09/2026, pós-inventário): o **alias automático de git** (`*-git-<branch>-<hash>-*.vercel.app`) não é "alias legado" — é exclusivo de cada deployment, nasce e morre com ele, e todo preview recebe um. Ele **não protege** (verificado na API: consta em `automaticAliases`). A decisão caso a caso vale para aliases reais — custom/compartilhados, ex.: `fluxo-quadra.vercel.app` herdado do rename do projeto.

Exceções e limites declarados: a retenção da Vercel tem comportamento próprio (deployments recentes e com alias são protegidos; exclusão pode ser assíncrona); encurtar retenção não reduz necessariamente o Storage já faturado no ciclo corrente.

## 4. Procedimento dry-run (após coleta)

1. Gerar lista CSV dos deployments elegíveis a exclusão (tudo fora da política §3) com `id`, data, estado, aliases.
2. Conferir que a produção ativa e os 3 últimos de produção **não** aparecem na lista.
3. Estimar redução: soma dos tamanhos por deployment (quando disponível) × regiões.
4. Apresentar a lista ao proprietário com a consequência explícita (URLs antigas deixam de resolver; rollback mais antigo exige rebuild do commit).
5. Somente após autorização: excluir por lotes pequenos (10–20), reavaliando Usage em 24–48 h entre lotes.

## 5. Efeitos colaterais declarados

- URLs de preview antigas param de responder (documentar dependências externas, se houver).
- Histórico de rollback encurta para a janela definida.
- Nenhum efeito sobre dados, RLS, funções ativas, domínios com alias ou usuários.
- Nenhum job externo é criado ou alterado neste plano (o cron de usage já existe no cron-job.org; não duplicar agendamentos).

## 6. Execução autorizada — ferramenta implementada (11/09/2026)

O plano está implementado em `scripts/vercel-retention.mjs` (sem dependências; Node ≥ 18). O classificador da política §3 é puro e coberto por testes (`tests/retention-policy.test.ts`, 11 casos) e por um `selftest` embutido.

Travas de segurança implementadas:

- `dry-run` **nunca exclui**; gera `retention/to-delete-<ts>.json` com motivo por deployment.
- `execute` só aceita a lista gerada pelo próprio dry-run (marca `generatedBy`), exige `--yes`, re-checa cada deployment antes de excluir (alias real / virou produção → pulado), e opera em lotes de 10 com pausa de 2 s.
- Itens com alias REAL (custom/compartilhado) jamais entram na lista automática (ficam como `keep — decidir caso a caso`); o alias automático de git não protege (`meaningfulAliases()`).
- A listagem v6 da API NÃO expõe aliases; o `inventory` enriquece cada deployment com GET v13 individual (concorrência 5) para que dry-run e execute julguem com os mesmos dados — sem isso a re-checagem do `execute` pula itens que o dry-run marcou (falso positivo observado na 1ª execução, §7).
- Nada com menos de 24 h é elegível; builds em andamento nunca; produção ativa e as 3 últimas produções READY sempre preservadas.

Procedimento (requer token granular com escopo Deployments: Read/Write):

```bash
# 0) Validação offline da política (não usa rede):
node scripts/vercel-retention.mjs selftest

# 1) Inventário (somente leitura, últimos 90 dias):
VERCEL_TOKEN=xxx node scripts/vercel-retention.mjs inventory --project imobsync [--team TEAM_ID] [--days 90]

# 2) Dry-run — aplicar a política e gerar a lista:
VERCEL_TOKEN=xxx node scripts/vercel-retention.mjs dry-run --input retention/inventory-<ts>.json

# 3) Revisar a lista (§4 passos 2–4) e, só então, executar em lotes:
VERCEL_TOKEN=xxx node scripts/vercel-retention.mjs execute --list retention/to-delete-<ts>.json --yes

# 4) Conferir Usage → Deployment Storage em 24–48 h antes de eventual novo lote.
```

Se a listagem for feita sem `--project`, o escopo é a conta/team inteira — a captura original do proprietário pode somar mais de um projeto; confirme o escopo antes de decidir. A exclusão é assíncrona na Vercel e **não recupera GB-mês já contabilizado** no ciclo corrente; o efeito aparece na curva dos dias seguintes.

Limitação honesta: a API não expõe o tamanho por deployment, então a estimativa da redução (§4 passo 3) continua dependendo do painel (Usage → Deployment Storage).

## 7. Log de execução (11/09/2026)

Token granular fornecido pelo proprietário na data; conta pessoal (sem teams), projeto `imobsync` (`prj_ll2fsinWSxuF7Mo5vK27iDYtheNR`). Inventário dos últimos 90 dias: **200 deployments**.

| Etapa | Resultado |
|---|---|
| selftest | OK (classificador íntegro) |
| inventory 1º (v6, sem enriquecimento) | 200 deployments |
| dry-run 1º | 5 elegíveis (previews >7d); 186 prod <30d; 6 <24h; 3 rollback |
| execute 1º | **0 excluídos — 5 PULADOS** pela re-checagem: os previews têm alias automático de git (visível só no GET v13, ausente na listagem v6) → falso positivo de "ganhou alias". Travas funcionaram como projetado (falha segura) |
| Refinamento | `meaningfulAliases()` (alias real = `alias` − `automaticAliases` − padrão `*-git-*`); `inventory` enriquecido por GET v13 individual; selftest ampliado; +2 testes (11 casos); gates verdes (tsc, vitest 136/136, eslint 0/0, build) |
| inventory 2º (enriquecido) | 200 deployments; produções retêm alias real (ex.: `fluxo-quadra.vercel.app`, legado do rename do projeto) → preservadas |
| dry-run 2º | 5 elegíveis (mesmos previews: branch antiga `perf/optimization-program`, ~7,4 d, único alias = automático de git, confirmado em `automaticAliases`); 188 alias real; 6 <24h; 1 rollback |
| execute 2º | **5 excluídos, 0 falhas, 0 pulados** |
| Pós-execução | 200 → **195** deployments (90d); produção READY servindo `52b4431` (HEAD da main pós-merge) — item do checklist §8 do relatório de deps confirmado via API |

Efeito no Storage: assíncrono — acompanhar Usage → Deployment/Functions Storage nas próximas 24–48 h. Os 5 previews excluídos eram da branch antiga `perf/optimization-program` e são recriáveis a qualquer momento a partir do git; nenhuma produção, alias real ou item da janela de rollback foi tocado.

Descoberta registrada para execuções futuras: as produções retêm, como alias REAL, tanto a URL única de produção quanto aliases do nome antigo do projeto (`fluxo-quadra.*`). Com isso, a regra "produção >30d elegível" só se aplicaria a produções sem nenhum alias real — hoje todas têm, então a limpeza de produções antigas será sempre "caso a caso" (comportamento conservador, alinhado ao §3).
