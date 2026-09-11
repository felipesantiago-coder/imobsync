# ImobSync — Plano operacional de retenção de deployments (dry-run)

Data: 11/09/2026 • Complemento de: `VERCEL-OPTIMIZATION-REPORT-2026-09-11.md`
**Nenhuma ação deste plano foi executada.** Alterar retenção ou excluir deployments exige lista concreta, revisão e autorização do proprietário (regra 9 do prompt).

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
| Deployments com alias legado (URLs compartilhadas) | Listar e decidir caso a caso | Não quebrar links |

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
