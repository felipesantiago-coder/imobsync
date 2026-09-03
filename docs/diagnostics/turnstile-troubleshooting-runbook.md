# Runbook — Diagnóstico do Cloudflare Turnstile na página de login

**Público:** mantenedores do ImobSync.
**Quando usar:** se houver suspeita de que o Turnstile (widget anti-bot do
login em `/`) não está funcionando normalmente — token não gerado, verificação
`/api/turnstile-verify` falhando, ou mensagens novas no console.
**Como usar:** siga os passos em ordem. O Passo 0 resolve a dúvida mais comum
("essas mensagens de console estão quebrando o Turnstile?") em ~2 minutos.
Cada passo termina com uma decisão: *resolver* (vai para a correção indicada)
ou *seguir* para o próximo passo.

**Contexto rápido:** o login usa widget invisível (`render=explicit`,
`size: "invisible"`, `execution: "render"`) em
`src/components/TurnstileWidget.tsx`; o token é verificado server-side em
`src/app/api/turnstile-verify/route.ts` via `siteverify` do Cloudflare. A
falha do Turnstile é **não-bloqueante por design** (defense-in-depth) — o
login em si depende do Supabase Auth (+ MFA). Triage do ruído de console
conhecido: `docs/diagnostics/login-console-errors.md`.

---

## Passo 0 — Determinar se há falha real (checagem de saúde, ~2 min)

As três mensagens de console abaixo **nunca impedem o Turnstile de
funcionar** — são ruído do próprio Cloudflare ou de extensão, já triadas e
corroboradas publicamente (ver `login-console-errors.md`):

| Mensagem | Origem | Ação |
|----------|--------|------|
| `Creating a TrustedTypePolicy named 'goog#html' …` | Extensão Google Tag Assistant | Ignorar / desativar extensão |
| `OTS parsing error: Size of decompressed WOFF 2.0 …` | Fonte do Cloudflare dentro do iframe | Ignorar (fallback de fonte) |
| `No available adapters.` | Sondagem de Private Access Tokens do runner CF | Ignorar (fallback esperado) |

**Falha REAL do Turnstile tem sinais objetivos.** Com o console e a aba
Network abertos na página de login, procure por **qualquer um** destes:

1. `[Turnstile] erro no widget: <código>` — o app agora loga o código do
   erro retornado pelo callback do widget (instrumentação em
   `TurnstileWidget.tsx`). Anote o código; ele é a chave da Passo 6.
2. `[Turnstile] script challenges.cloudflare.com não carregou em 3s` — o
   script do widget nem chegou; vá direto ao **Passo 2** (rede/CSP).
3. Na aba Network: requisições para `challenges.cloudflare.com` com status
   4xx/5xx, bloqueadas (vermelho, `blocked:other`) ou CORS; ou a chamada
   `POST /api/turnstile-verify` retornando **400/403/500**.
4. `[Login] Turnstile verification failed, proceeding with login` — warning
   do `page.tsx` confirmando que a verificação falhou no servidor.
5. No Network, dentro da resposta do `siteverify` (se visível) ou nos logs
   do servidor: `error-codes` como `invalid-input-secret`,
   `timeout-or-duplicate` etc. → **Passo 5**.

**Decisão:** nenhum sinal acima presente? O Turnstile está saudável — as
mensagens de ruído podem ser ignoradas (filtro no DevTools:
`-url:challenges.cloudflare.com` + ocultar verbose). Algum sinal presente?
Anote **qual** e vá ao passo correspondente indicado acima. Sem sinal
específico, siga na ordem (1 → 7).

---

## Passo 1 — Isolar o ambiente do navegador (~5 min)

Objetivo: descobrir se a falha é do **ambiente** (extensão, adblock, VPN,
proxy) ou do **app/config**. Repita o acesso em quatro condições:

1. **Aba anônima** (extensões desativadas por padrão).
2. **Perfil/navegador limpo**, sem extensões (ex.: Chrome novo perfil ou o
   Firefox do sistema).
3. **Aba anônima + adblock/antitracking desligado** — desative uBlock,
   AdBlock, Brave Shields, proteções "Privacy" do antivírus e filtros de DNS
   (NextDNS, Pi-hole, AdGuard DNS) para o domínio
   `challenges.cloudflare.com`. *Este é o bloqueio mais comum de todos: as
   listas de bloqueio frequentemente categorizam o domínio de desafios como
   tracker.*
4. **Sem VPN/proxy corporativo** — VPNs, inspeção SSL corporativa e proxies
   com quebra de TLS corrompem o iframe do desafio.

**Decisão:**
- Funciona no anônimo mas não na janela normal → **extensão**; isole
  desativando uma por uma (culpado típico: Tag Assistant, adblockers,
  extensões de privacidade). Nada a mudar no app.
- Funciona após desligar adblock/DNS → adicione exceção para
  `challenges.cloudflare.com` na ferramenta (usuários finais com o mesmo
  blocker terão o mesmo efeito — documente no suporte se relevante).
- Falha em **todas** as condições → o problema é rede/config/app; siga para
  o Passo 2.

---

## Passo 2 — Camada de rede (~5 min)

Com DevTools → **Network**, recarregue a página de login e filtre por
`challenges.cloudflare.com`:

1. **O iframe `invisible?lang=auto` aparece?**
   - **Não aparece e nem o script `api.js`:** o script nem foi baixado.
     Verifique: (a) bloqueio de rede/firewall (Passo 1, item 3–4);
     (b) **CSP do app** bloqueando `script-src` → Passo 3;
     (c) o warning `[Turnstile] script … não carregou em 3s` no console
     confirma este cenário.
   - **Aparece com status vermelho (4xx/5xx/blocked):** anote o status.
     403 com `blocked:other` costuma ser firewall/DNS corporativo ou
     bloqueio geográfico; teste de outra rede (ex.: hotspot do celular) para
     confirmar.
   - **Aparece 200 e a challenge executa:** a rede está OK; siga ao Passo 4
     (configuração do widget) se ainda há sinais de falha.

2. **Teste direto de conectividade** (fora do app):
   `https://challenges.cloudflare.com/turnstile/v0/api.js` deve abrir no
   navegador retornando JavaScript (começa com algo como `!function`).

---

## Passo 3 — Verificar o CSP do app (~5 min)

Se o console mostrar erro de CSP apontando para o **app** (a origem do erro
será sua própria página, não o iframe), confira em `next.config.ts` que as
três diretivas abaixo continuam incluindo o domínio do Turnstile:

```
script-src  … https://challenges.cloudflare.com
frame-src   … https://challenges.cloudflare.com
connect-src … https://challenges.cloudflare.com
```

Regras de bolso:

- **Nunca remova** `challenges.cloudflare.com` dessas diretivas — é pré-condição
  do widget.
- Se no futuro o app adotar **Trusted Types** (`trusted-types`), será preciso
  prever política compatível — hoje o app **não** define `trusted-types`, e a
  política `FHMZS9 default` vista nos logs é do iframe do Cloudflare, não sua.
- Após qualquer mudança de CSP: `npm run build`, deploy, e reexecute o
  Passo 0 para reavaliar.

---

## Passo 4 — Configuração do widget no painel Cloudflare (~10 min)

Acesse dash.cloudflare.com → **Turnstile** → selecione o widget cuja sitekey
começa com `0x4AAAAAAEeWNe8j…` e confira:

1. **Hostnames permitidos:** o domínio de produção (ex.: o domínio onde o
   login roda) está na lista? Se você testa em deploys de preview
   (Vercel Preview URLs), cada hostname de preview usado também precisa estar
   listado. Sintoma clássico de hostname ausente: código **`110200`** no
   console (`[Turnstile] erro no widget: 110200`).
2. **Modo do widget:** o modo escolhido no dashboard deve ser compatível com
   o uso invisível do código (`size: "invisible"`). Se o widget foi criado
   como "Managed", o Cloudflare pode escalar para desafio interativo quando
   detectar risco — é comportamento esperado, não bug.
3. **Sitekey no código = sitekey do dashboard:** compare a chave do painel
   com `NEXT_PUBLIC_TURNSTILE_SITE_KEY` no Vercel (Passo 5). Chaves
   trocadas geram `invalid-input-response`/`110200`.
4. **Rotação de secret:** se alguém rotacionou o secret no dashboard, a
   `TURNSTILE_SECRET_KEY` antiga no Vercel passa a falhar com
   **`invalid-input-secret`** → atualize a variável e faça **redeploy**
   (mudança de env no Vercel só vale após novo deploy).

---

## Passo 5 — Verificação server-side (`siteverify` + variáveis de ambiente)

1. **Confira as variáveis no Vercel** (Settings → Environment Variables):
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (pública, usada no browser) — presente
     no ambiente Production (e Preview, se aplicável)?
   - `TURNSTILE_SECRET_KEY` (secreta, usada na rota) — presente?
   - Lembre: alterou variável? **Redeploy** obrigatório.
2. **Health check da chave secreta com `curl`** (não precisa de token real —
   use o token dummy oficial; NUNCA exponha o secret em terminal compartilhado,
   use variável de shell):

   ```bash
   curl -s -X POST https://challenges.cloudflare.com/turnstile/v0/siteverify \
     -d "secret=$TURNSTILE_SECRET_KEY" \
     -d "response=XXXX.DUMMY.TOKEN.XXXX"
   ```

   Interpretação da resposta:

   | Resposta | Significado |
   |----------|-------------|
   | `{"success":false,"error-codes":["invalid-input-response"]}` | **Saudável**: secret aceito, conectividade OK (só o token dummy que é inválido, como esperado) |
   | `{"success":false,"error-codes":["invalid-input-secret"]}` | Secret errado/rotacionado → atualizar env + redeploy |
   | `{"success":false,"error-codes":["missing-input-secret"]}` | Env var ausente no deploy → configurar no Vercel |
   | erro de rede/DNS | Servidor do deploy sem saída para `challenges.cloudflare.com` → firewall de saída |

3. **Códigos `siteverify` que podem aparecer em produção** (o app não loga o
   corpo do 403 hoje; se necessário, inspecione temporariamente o
   `console.warn` em `turnstile-verify/route.ts`, que já imprime
   `data["error-codes"]` nos logs do servidor):

   | Código | Causa | Correção |
   |--------|-------|----------|
   | `timeout-or-duplicate` | Token com mais de **300 s** ou reutilizado (uso único) | Inofensivo aqui: o login segue; o widget gera novo token via `expired-callback`/`reset` |
   | `invalid-input-response` | Token falso/adulterado/de outro widget | Investigar origem das chamadas; ok se vier de bot |
   | `invalid-input-secret` | Secret inválido | Passo 5.1 |
   | `internal-error` | Falha transitória do Cloudflare | Retry; se persistir, status page do Cloudflare |

---

## Passo 6 — Mapa rápido: sintoma → causa provável → correção

| Sintoma (console/rede) | Causa provável | Correção |
|------------------------|----------------|----------|
| `[Turnstile] script … não carregou em 3s` | Adblock/DNS/firewall ou CSP bloqueando `script-src` | Passo 1 → Passo 2 → Passo 3 |
| Iframe do desafio não renderiza | `frame-src` sem `challenges.cloudflare.com` | Passo 3 |
| `[Turnstile] erro no widget: 110200` | Domínio não registrado na sitekey | Passo 4.1 |
| `[Turnstile] erro no widget: 600010` (ou loop de desafio) | Falha de execução do desafio (ambiente/rede interveniente) | Passo 1 e 2; se persistir em rede limpa, coletar HAR e escalar (Passo 7) |
| `/api/turnstile-verify` 400 (`Token ausente`) | Token chegou `null` no submit (widget não resolveu) | Passo 2/4; confira `[Turnstile] erro no widget` |
| `/api/turnstile-verify` 403 | Secret inválido ou token rejeitado pelo CF | Passo 5.2 + logs do servidor |
| `timeout-or-duplicate` frequente | Usuário fica >5 min na página antes de enviar | Esperado; sem ação (login não bloqueia) — se incomodar, migrar para `execution: "execute"` |
| `[Login] Turnstile verification failed` | Verificação falhou no servidor | Passo 5 (server-side) |
| Só `TrustedTypePolicy`/`OTS`/`No available adapters` | Ruído conhecido, **não é falha** | Ignorar (Passo 0) |

---

## Passo 7 — Coletar evidências e escalar ao Cloudflare

Se após os passos 1–6 a falha persistir e todos os itens do seu lado estiverem
corretos, abra um tópico em community.cloudflare.com (categoria Turnstile)
com:

1. **Sitekey** (é pública — pode ir no post) e **domínio** afetado.
2. Data/hora (com timezone), região, navegador + versão, SO.
3. `[Turnstile] erro no widget: <código>` e/ou `error-codes` do siteverify.
4. **HAR do DevTools** (Network → botão de exportar HAR) — revise antes de
   anexar para não conter cookies/tokens de sessão; se contiver, limpe ou
   anexe só os trechos de `challenges.cloudflare.com`.
5. Saída do curl do Passo 5.2 — **sem o secret** (o comando acima já o envia
   por variável; cole só o JSON de resposta).
6. Passos já executados deste runbook (evita re-perguntas).

Se suspeitar de comprometimento das chaves (ex.: secret vazou em log/chat):
Dashboard → Turnstile → **Rotate secret key** e atualize o Vercel imediatamente.

---

## Apêndice A — Instrumentação embutida no app (referência)

Logs que o próprio ImobSync emite, e o que significam:

| Log (console do navegador) | Momento | Significado |
|----------------------------|---------|-------------|
| `[Turnstile] erro no widget: <código>` | `error-callback` | O Cloudflare sinalizou falha no desafio; use o código no Passo 6 |
| `[Turnstile] token expirado antes do uso — novo desafio necessário` | `expired-callback` | Token >300 s sem consumo; o widget regenera no próximo `reset()` |
| `[Turnstile] script challenges.cloudflare.com não carregou em 3s …` | após polling de 3 s | Script do widget não chegou: rede, adblock ou CSP (Passos 1–3) |
| `[Login] Turnstile verification failed, proceeding with login` | `page.tsx` | `/api/turnstile-verify` respondeu não-ok; login segue (não-bloqueante por design) |
| `[Turnstile] Verificação falhou: <error-codes>` | log do servidor (`route.ts`) | `siteverify` recusou o token; ver Passo 5.3 |

## Apêndice B — Checklist de QA manual do fluxo completo

1. DevTools aberto, Console com filtro `-url:challenges.cloudflare.com`
   (isola o ruído conhecido) e Network filtrando `turnstile`.
2. Abrir `/` (login). **Esperado:** script `api.js` = 200; iframe do desafio
   criado; sem warnings `[Turnstile]`.
3. Preencher credenciais válidas e enviar. **Esperado:** `POST
   /api/turnstile-verify` = **200** com `{"valid":true,"bypassed":false}`;
   login prossegue.
4. Repetir com senha errada. **Esperado:** mensagem "E-mail ou senha
   incorretos" e `resetTurnstile()` acionado (novo desafio na próxima
   tentativa).
5. (Opcional) Invalidar a `TURNSTILE_SECRET_KEY` em um ambiente de teste para
   exercitar o caminho de falha: login ainda deve funcionar
   (não-bloqueante), com os warnings do Apêndice A visíveis.

## Apêndice C — Referências oficiais

- Códigos de erro client-side: developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes
- Verificação server-side (`siteverify`): developers.cloudflare.com/turnstile/get-started/server-side-validation/
- Modos e parâmetros do widget: developers.cloudflare.com/turnstile/get-started/client-side-rendering/
- Documento de triage do ruído de console deste repo:
  `docs/diagnostics/login-console-errors.md`
