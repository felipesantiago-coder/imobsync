# Auditoria de performance — Dashboard de empreendimentos e espelhos de vendas

**Data:** 05/09/2026 · **Branch:** `main` · **Commit base da análise:** pós-PR #7 (`35734ef`)
**Referências:** `ImobSync_Auditoria_Performance_v1.0.md` (§P1.4, P1.5, P2.1, P2.2, P2.7), `ImobSync_Prompt_GLM_Otimizacao_Performance_v1.0.md`
**Escopo:** `/empreendimento/[id]` (dashboard dinâmico) e espelhos `/espelho`, `/villa-bianco`, `/moment`, `/vitta` (+ variantes `/admin`).

## 1. Por que essas páginas demoravam a carregar

O carregamento era um **waterfall servidor → cliente → API** com trabalho de autenticação duplicado:

```
1. Página servidor: getUser → perfil (+ empreendimento + coordenador + simulador)   2–6 RTs sequenciais
2. Stream HTML → hidratação (JS ~145 KB gzip inicial + framer-motion ~38 KB)        espera pesada
3. Cliente monta → fetch("/api/…units")                                             2ª viagem HTTP completa
4. API refaz a cadeia de auth (getUser + perfil + assinatura) e consulta unidades   3–5 RTs duplicados
5. setUnits → primeira pintura útil da grade
```

Nas rotas `/empreendimento/[id]` as consultas do servidor eram 100% sequenciais; nos espelhos legados havia ainda o "flash" dos dados estáticos embutidos (`staticUnits`) antes dos dados reais do banco chegarem. Total observado no código: ~7–10 estágios de rede sequenciais até a primeira grade, com **toda** a cadeia auth/perfil/assinatura executada duas vezes por carregamento (página + API).

## 2. O que foi aplicado (sem alterar funcionalidades nem políticas de segurança)

### 2.1 Dados iniciais server-side (audit P1.4) — `test:` + `perf:` commits
- A Server Component de cada rota pré-busca as unidades com a **mesma autorização e a mesma query/ordenação da API correspondente** (`requireReadAccess` → `requireActiveSubscription`, via novo guard `src/lib/units-read-guard.ts`) e passa as linhas brutas como prop `initialUnits`.
- O cliente inicializa o estado com esses dados (via mappers extraídos), **pula o fetch de montagem** e mantém o canal Realtime — que agora abre no mount, mais cedo que antes.
- **Segurança preservada:** a decisão de acesso é tomada pelo mesmo guard das APIs (`canReadUnits` replica exatamente a semântica: `admin_sistema`/`coordenador` → ok; demais → `requireReadAccess` completo, com lazy expiration); queries rodam com o cliente da sessão do usuário (**RLS intacta** como barreira final); nenhum cache público de dado autenticado; nenhum dado do cliente é aceito como prova de autorização (reuso de contexto somente dentro da mesma request — padrão P3.1 da auditoria).
- **Caminho de negação/erro intacto:** se a autorização falha no servidor (ou a query dá erro, ou — no Vitta — retorna vazia), `initialUnits` fica `null` e o cliente executa o fluxo original fetch → API → fallback estático/estado vazio, **byte a byte como hoje**.
- APIs de unidades **não foram alteradas** — continuam servindo refetch, mutações, fallbacks e o caminho de negação.
- `/empreendimento/[id]`: consultas independentes (empreendimento, perfil, config do simulador) agora rodam em `Promise.all` (audit P1.5); semântica fail-closed e ordem dos redirecionamentos preservadas; `key={id}` garante reset correto do estado entre empreendimentos.

### 2.2 Mappers extraídos com testes de caracterização (pré-requisito do prompt)
- `mapRowToUnit`, `mapRowToVillaBiancoUnit`, `mapRowToMomentUnit`, `mapRowToVittaUnit` (nas libs de dados) e `mapProjetoUnitRow` (nova `src/lib/projeto-units.ts`) — portas exatas dos mapeamentos inline, reutilizadas pelo fetch da API **e** pelos dados iniciais.
- 21 testes golden novos (`tests/dashboard-mappers.test.ts`), incluindo fallbacks `Consulte`, conversões `Number()` do Vitta e defaults do mapper dinâmico.

### 2.3 Skeletons por rota (audit P2.7)
- `loading.tsx` nas 5 rotas com skeleton estável (sem CLS, `aria-busy`): a navegação mostra feedback imediato enquanto o servidor prepara os dados.

### Efeito líquido esperado
- Eliminados: 1 viagem HTTP cliente→API, toda a re-autenticação na API, o flash de dados estáticos e o skeleton interno do dashboard dinâmico no caminho com acesso concedido.
- Dados críticos agora chegam **no HTML/stream inicial** (critério de aceite P1.4). Estimativa conservadora: 2–5 estágios de rede a menos e primeira pintura útil da grade ocorrendo com o próprio HTML.
- **Medição** (Lighthouse/Profiler/p50-p95) continua bloqueada pela ausência de staging — nenhuma métrica foi inventada; a contagem de estágios acima é derivada do código.

## 3. Otimizações avaliadas e NÃO aplicadas (com justificativa)

| Otimização | Motivo do adiamento |
|---|---|
| `framer-motion` → CSS nos cards (−38 KB gzip) | Altera feedback visual; auditoria exige comparação visual/`prefers-reduced-motion` validados — sem staging é regressão de percepção. |
| `content-visibility: auto` na grade | Risco de CLS/layout shift sem `contain-intrinsic-size` calibrado por card; exige validação visual. |
| Bulk update RPC transacional (P0.2 — lote de N PATCHes) | Exige migration no banco + validação de atomicidade/Realtime em staging. Não afeta o tempo de *carregamento* das páginas (escopo desta auditoria). |
| Reduzir `.select("*")` das tabelas de unidades | Dashboards consomem a linha inteira; redução exige auditoria consumidor-a-consumidor (pendência já documentada na rodada anterior). |
| Contexto de autorização tipado por request dentro do guard | Toca `subscription-guard.ts` (código crítico de pagamentos) sem staging; o guard foi mantido caixa-preta. |
| `reactStrictMode: true` | Pendente de validação de idempotência de efeitos em staging (decisão anterior mantida). |

## 4. Riscos, reversão e verificação

- **Commits isolados e reversíveis:** `git revert` individual de cada commit (mappers/tests → dados iniciais → skeletons). Nenhum depende de outro.
- **Formatação Intl durante SSR:** `valorStr`/`valorFormatado` agora também são computados no servidor (Node ICU full) e na hidratação (browser CLDR) — pt-BR BRL é estável entre os dois; em divergência hipotética o React recupera com re-render do cliente (sem crash).
- **Checklist pós-deploy:** login → abrir `/empreendimento/[id]` e cada espelho: grade aparece direto (sem flash estático), Realtime atualiza status entre duas sessões, mutações individuais/em lote funcionam, coordenador vê apenas empreendimentos atribuídos, usuário sem assinatura continua sem dados (403 → estado vazio como antes), zero requests a `/_next/image`.
