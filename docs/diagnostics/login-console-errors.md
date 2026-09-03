# Triage — Erros de console na página de login

**Contexto:** relato de usuário (DevTools, aba Console) ao abrir a página de
login (`/`), que embute o widget invisível do Cloudflare Turnstile
(`src/components/TurnstileWidget.tsx`).

**Conclusão curta:** nenhum dos erros relatados é gerado pelo código do
ImobSync. Todos se originam no iframe de desafio do Cloudflare
(`challenges.cloudflare.com/.../invisible?lang=auto`) ou em extensão de
navegador (Google Tag Assistant). Não há ação de correção aplicável no app.

## Resumo

| # | Mensagem (console) | Origem | Impacto no usuário | Ação no app |
|---|--------------------|--------|--------------------|-------------|
| 1 | `Creating a TrustedTypePolicy named 'goog#html' violates the following Content Security policy directive: "trusted-types FHMZS9 default"` — em `content_script_bin.js` / `tag_assistant_api_bin.js` | Extensão **Google Tag Assistant** (Chrome) injetada no iframe do Turnstile | Nenhum | Nenhuma |
| 2 | `OTS parsing error: Size of decompressed WOFF 2.0 is less than compressed size` | Fonte WOFF2 servida pelo **próprio Cloudflare** dentro do iframe do desafio | Nenhum (fallback de fonte no iframe) | Nenhuma |
| 3 | `No available adapters` | Log interno do **runner de desafio do Cloudflare** | Nenhum | Nenhuma |

## Evidências e análise

### 1. TrustedTypePolicy `goog#html` bloqueada

- `content_script_bin.js` e `tag_assistant_api_bin.js` são scripts da extensão
  **Google Tag Assistant**, injetados em *todos* os frames da página — inclusive
  no iframe `https://challenges.cloudflare.com/.../invisible?lang=auto` do
  Turnstile.
- A política `trusted-types FHMZS9 default` **não vem do ImobSync**: o CSP do
  app (`next.config.ts → headers()`) não define a diretiva `trusted-types`
  (verificado por busca em todo o repositório). O nome aleatório (`FHMZS9`,
  regenerado por sessão) é imposto pelo próprio Cloudflare no documento do
  desafio.
- A extensão tenta `trustedTypes.createPolicy('goog#html', …)` — nome de
  política padrão das bibliotecas Google — e é bloqueada pela CSP do iframe.
  Isso é a defesa do Cloudflare funcionando como esperado, não um bug do app.
- O erro só aparece com a extensão instalada e não afeta o desafio nem o login.

### 2. OTS parsing error (WOFF 2.0)

- O erro é logado contra o documento do desafio (`invisible?lang=auto:1`), não
  contra a página do app.
- As fontes do ImobSync são locais e versionadas (`next/font/local` — Geist,
  `.woff2` com hash em `/_next/static/media/...`); o app não baixa nenhuma
  fonte de `challenges.cloudflare.com`.
- O OTS (OpenType Sanitizer do Chrome) rejeita o WOFF2 que o próprio Cloudflare
  serve dentro do iframe; o desafio usa fonte de fallback e segue funcionando.
  Ruído conhecido de páginas `challenges.cloudflare.com`.

### 3. "No available adapters"

- Emitido pelo script do *challenge-platform* do Cloudflare no mesmo contexto
  do iframe (`invisible?lang=auto:1`).
- É um log interno de sondagem do runner (verificação de "adapters" disponíveis
  para o ambiente atual). Benigno; não há parâmetro de integração que o
  silencie e nenhuma ação possível no app.

## Checagem do lado do app (tudo correto)

- **CSP** (`next.config.ts`): `script-src`, `frame-src` e `connect-src`
  liberam `https://challenges.cloudflare.com`. Prova funcional: o próprio log
  do usuário mostra o iframe carregando e o desafio executando — nada foi
  bloqueado pelo CSP do app.
- **Integração** (`TurnstileWidget.tsx`): `render=explicit`,
  `size: "invisible"`, `execution: "render"`, callbacks de `error` e
  `expired` resetando o token; cleanup correto no unmount. Padrão oficial.
- **Verificação server-side** (`src/app/api/turnstile-verify/route.ts`):
  valida o token via `siteverify`; falha do Turnstile é não-bloqueante por
  design (defense-in-depth — a segurança primária é Supabase Auth + MFA).

## Confirmação empírica (reteste do relator)

Reteste em **aba anônima** (extensões desativadas por padrão) confirmou a
diagnose:

- As mensagens de `content_script_bin.js` / `tag_assistant_api_bin.js`
  (TrustedTypePolicy `goog#html`) **desapareceram** — provenientes da extensão
  Google Tag Assistant, não do app.
- `No available adapters`, `OTS parsing error (WOFF 2.0)` e a linha vazia
  `invisible?lang=auto:1` **persistiram** — coerente com origem no código do
  próprio Cloudflare dentro do iframe.
- Nenhum frame das stack traces aponta para código do ImobSync: todas as
  entradas vêm de `invisible?lang=auto:1` (documento do desafio) e de workers
  `blob:https://challenges.cloudflare.com/...`.

## Corroboração pública (busca web, set/2026)

- `No available adapters` aparece em scans públicos do urlscan.io de sites
  arbitrários que usam desafios Cloudflare (ex.: trackyserver.com,
  expatguidekorea.com) — ou seja, é ruído ubíquo da plataforma, não um
  indício de má configuração do ImobSync.
- Em community.cloudflare.com (thread "Managed Turnstile checkbox challenge
  and token delay on Android", jul/2026) a mensagem surge em sequência com
  "Request for the Private Access Token challenge" — o runner sonda adapters
  (incluindo Private Access Tokens), não encontra disponíveis no ambiente e
  segue com o desafio padrão. Comportamento de fallback esperado.
- `OTS parsing error: Size of decompressed WOFF 2.0 is less than compressed
  size` é aviso genérico do sanitizador OTS do Chrome, documentado em issues
  públicas (Font-Awesome #20564, StackOverflow, fóruns Cloudflare) com
  fallback de fonte e sem impacto funcional.

## Por que não dá para "silenciar" via código do app

O iframe do desafio é um **documento de outra origem**
(`challenges.cloudflare.com`): quem escreve no console é o código do
Cloudflare executando dentro dele. A página hospedeira (ImobSync) não tem
como suprimir, capturar ou filtrar console de outro origin — isso é isolamento
de browser por design. As únicas formas de eliminar essas mensagens seriam:

1. O Cloudflare corrigir/ajustar o próprio runner (fora do nosso controle); ou
2. Não carregar o widget Turnstile (remove o iframe — e remove a camada
   anti-bot; decisão de produto/segurança, não de correção de bug).

Filtragem possível apenas no lado do observador: DevTools → Console → Filter
com `-url:challenges.cloudflare.com` (ou "Hide network"/níveis de verbose).

## Recomendações (fora do código)

1. Se o ruído atrapalha a depuração, filtrar no DevTools: Console → Filter com
   `-url:challenges.cloudflare.com`, ou desativar o Google Tag Assistant
   enquanto testa o ImobSync.
2. **Não** "resolver" os itens 1–3 via código: não há nada para corrigir, e
   afrouxar o CSP ou adicionar `trusted-types 'allow-*'`/`goog#html` para
   acomodar extensão enfraqueceria a segurança da página.

## Quando se preocupar de verdade

Sinais de problema real na integração Turnstile (nenhum presente no relato) e
o **passo a passo completo de diagnóstico/correção** estão no runbook:
`docs/diagnostics/turnstile-troubleshooting-runbook.md`. Resumo dos sinais:

- Erro de CSP apontando para o app bloqueando o iframe (`frame-src`);
- Token sempre `null` + warnings `[Login] Turnstile verification failed` no
  console em todos os logins;
- Widget visível/piscando ou erro `110200` (domínio não registrado no sitekey);
- Chamadas `/api/turnstile-verify` retornando 403 recorrentemente.
