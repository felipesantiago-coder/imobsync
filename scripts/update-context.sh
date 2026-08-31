#!/usr/bin/env bash
# update-context.sh — Atualiza agent-ctx/project-context.md com dados dinamicos do projeto.
# Chamado automaticamente pelo pre-commit hook.
# Secoes atualizadas: 4 (diretorio), 10 (worklog), data da ultima atualizacao.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CTX_FILE="$PROJECT_ROOT/agent-ctx/project-context.md"

if [ ! -f "$CTX_FILE" ]; then
  echo "[update-context] ERRO: $CTX_FILE nao encontrado" >&2
  exit 0
fi

# ── 1. Coletar dados ──

TODAY=$(date +%Y-%m-%d)
SRC_COUNT=$(find "$PROJECT_ROOT/src" -type f \( -name '*.ts' -o -name '*.tsx' \) 2>/dev/null | wc -l | tr -d ' ')
ROUTE_COUNT=$(find "$PROJECT_ROOT/src/app/api" -name 'route.ts' 2>/dev/null | wc -l | tr -d ' ')
COMMITS=$(cd "$PROJECT_ROOT" && git log --oneline -5 --no-color 2>/dev/null || echo 'erro ao ler git log')

# ── 2. Gerar secoes em arquivos temp ──

DIR_FILE=$(mktemp)
WL_FILE=$(mktemp)
CTX_TMP=$(mktemp)
trap 'rm -f "$DIR_FILE" "$WL_FILE" "$CTX_TMP"' EXIT

# Seccao 4: Estrutura de Diretorios
cat > "$DIR_FILE" <<SECTION4
## 4. Estrutura de Diretorios

\`\`\`
src/
├── app/
│   ├── page.tsx                          # Landing/login publica
│   ├── layout.tsx                        # Layout raiz
│   ├── admin-sistema/                    # Painel admin (tabs: usuarios, assinaturas, metricas, cupons, config)
│   ├── admin/                            # Dashboard admin (antiga, legada)
│   ├── empreendimento/[id]/              # Pagina de empreendimento
│   ├── planos/                           # Pagina de planos (publica)
│   ├── planos-auth/                      # Planos para usuarios autenticados
│   ├── assinatura/                       # Pagina de assinatura MP
│   ├── aguardando-pagamento/             # Tela de pos-pagamento
│   ├── simulador*/                       # 6 paginas de simulador
│   ├── projetos/                         # Lista de projetos do usuario
│   ├── mfa-*/                            # Fluxos MFA (onboarding, setup, verify)
│   ├── change-password/                  # Troca de senha (first-login)
│   └── api/                              # $ROUTE_COUNT route handlers
│       ├── admin-sistema/                # ~20 rotas admin
│       ├── analytics/track/              # Tracking de eventos
│       ├── auth/                         # Set routing cookie
│       ├── cron/                         # Crons agendados
│       ├── mfa/                          # Rotas MFA (TOTP + WebAuthn)
│       ├── subscriptions/                # create, cancel, status, confirm-payment
│       ├── webhooks/mercadopago/         # Webhook MP (HMAC verificado)
│       ├── signup-subscribe/             # Signup + primeira assinatura
│       └── ...                           # units, planos, empreendimentos, download, etc.
├── components/
│   ├── ui/                               # Componentes shadcn/ui
│   ├── *-dashboard.tsx                   # Dashboards por empreendimento
│   ├── TurnstileWidget.tsx               # Cloudflare Turnstile
│   └── SubscriptionRefresher.tsx          # Refresh cookie de assinatura
├── hooks/                                # useTrackEvent, use-mobile, use-toast
├── lib/
│   ├── supabase/                         # client.ts, server.ts, admin.ts
│   ├── mfa/                              # email.ts, totp.ts, webauthn.ts
│   ├── admin-auth.ts                     # requireAdminSistema()
│   ├── api-auth.ts                       # requireWriteAccess()
│   ├── subscription-guard.ts             # requireActiveSubscription()
│   ├── coordinator-access.ts             # coordenador_hasAccess()
│   ├── analytics.ts                      # trackEvent(), trackUnitStatusChange()
│   ├── mercadopago.ts                    # Clients MP
│   └── *-data.ts                         # Dados estaticos dos empreendimentos
└── middleware.ts

supabase/                                 # Schemas SQL versionados
docs/security-audit/                       # Auditoria de seguranca (PDF + issues)
scripts/                                  # Scripts utilitarios (monitor-usage, update-context)
agent-ctx/                                # Contexto do projeto para ZCode
\`\`\`
SECTION4

# Seccao 10: Historico de Sessoes
cat > "$WL_FILE" <<SECTION10
## 10. Historico de Sessoes (worklog)

### Sessao 1 — Correcao de Analytics (concluida)
- 3 bugs encontrados e corrigidos: missing await, RLS bloqueando inserts, sendBeacon Content-Type
- Arquivos: src/app/api/analytics/track/route.ts, src/lib/analytics.ts, src/hooks/useTrackEvent.ts

### Sessao 2 — Monitoramento de Invocations (concluida)
- Script scripts/monitor-usage.mjs criado
- Endpoint cron src/app/api/cron/record-usage/route.ts criado
- SQL supabase/fix-analytics-and-monitoring.sql criado

### Sessao 3 — Auditoria de Seguranca (concluida)
- 5 categorias auditadas, 24 achados, 6 issues GitHub
- PDF: docs/security-audit/relatorio-auditoria-seguranca.pdf
- 3 endpoints de debug removidos

### Sessao 4 — Contexto automatico para ZCode (concluida)
- agent-ctx/project-context.md criado com contexto completo
- pre-commit hook + scripts/update-context.sh para atualizacao automatica

--- Ultimos commits ---
$COMMITS
SECTION10

# ── 3. Montar arquivo final usando awk com FILENAME ──

awk '
/^## 4\. Estrutura de Diretorios/ {
  while ((getline line < "'$DIR_FILE'") > 0) print line
  close("'$DIR_FILE'")
  skip=1; next
}
/^## 5\./ { skip=0 }
/^## 10\. Historico de Sessoes/ {
  while ((getline line < "'$WL_FILE'") > 0) print line
  close("'$WL_FILE'")
  skip=1; next
}
/^## 11\./ { skip=0 }
skip { next }
/\*Ultima atualizacao:/ { print "*Ultima atualizacao: '$TODAY'"; next }
{ print }
' "$CTX_FILE" > "$CTX_TMP"

mv "$CTX_TMP" "$CTX_FILE"

echo "[update-context] $CTX_FILE atualizado ($SRC_COUNT arquivos src, $ROUTE_COUNT routes)"
