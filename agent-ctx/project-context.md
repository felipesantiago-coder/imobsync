# ImobSync — Project Context for ZCode

> **Instrucao para o agente**: Este arquivo contem tudo que voce precisa para continuar o desenvolvimento sem historico de conversa. Leia-o inteiro antes de trabalhar.

---

## 1. Visao Geral

**ImobSync** e uma plataforma SaaS de gestao imobiliaria para construtoras.
Os usuarios (construtoras) gerenciam empreendimentos, unidades, vendas e usam simuladores de pagamento.

## 2. Stack Tecnica

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| Banco | Supabase (PostgreSQL + Auth + RLS + Storage) |
| UI | Tailwind CSS 4 + shadcn/ui + Radix + Framer Motion |
| Auth | Supabase Auth (email/senha) + MFA (TOTP + WebAuthn) |
| Pagamentos | Mercado Pago (assinaturas recorrentes / pre-approvals) |
| Protecao bot | Cloudflare Turnstile |
| Email | Resend (transacional, e.g. MFA codes) |
| Charts | Recharts |
| PDF | jsPDF + jsPDF-AutoTable |
| Excel | xlsx (SheetJS) |
| Deploy | Vercel (plano Hobby, 100K invocations/mes) |
| Repo | github.com/felipesantiago-coder/imobsync.git (branch: main) |

### Dependencias-chave
- `@supabase/ssr`, `@supabase/supabase-js` — cliente Supabase
- `mercadopago` — SDK oficial MP
- `@simplewebauthn/server`, `@simplewebauthn/browser` — WebAuthn/MFA
- `otplib` — TOTP (MFA por app)
- `resend` — envio de emails
- `recharts` — graficos
- `jspdf`, `jspdf-autotable` — geracao de PDF nos simuladores
- `xlsx` — importacao/exportacao Excel
- `z-ai-web-dev-sdk` — SDK Z.ai
- `zustand` — state management
- `zod` — validacao
- `sharp` — processamento de imagens
- `@dnd-kit/*` — drag and drop
- `react-hook-form` + `@hookform/resolvers` — formularios

## 3. Arquitetura

### 3.1 Autenticacao
- **3 clientes Supabase**:
  - `src/lib/supabase/client.ts` → `createClient()` (anon key, browser-side, RLS aplica)
  - `src/lib/supabase/server.ts` → `createClient()` (cookies, server-side, RLS aplica)
  - `src/lib/supabase/admin.ts` → `createAdminClient()` (**service_role key, bypassa RLS**)

### 3.2 Autorizacao
- `src/lib/admin-auth.ts` → `requireAdminSistema()` — verifica role=admin_sistema no profiles
- `src/lib/api-auth.ts` → `requireWriteAccess()` — para escrita (ainda tem fallback ADMIN_EMAILS — Issue 6 da auditoria)
- `src/lib/subscription-guard.ts` → `requireActiveSubscription()` — valida assinatura ativa; **coordenadores bypassam** (tratados como admin)
- `src/lib/coordinator-access.ts` → `coordenador_hasAccess(empId)` — verifica acesso por empreendimento; **fail-open se tabela nao existir** (Issue 5)

### 3.3 Middleware (`src/middleware.ts`)
- Rotas publicas: `/`, `/change-password`, `/mfa-onboarding`, `/mfa-verify`, `/mfa-setup`, `/planos`, `/aguardando-pagamento`
- **Todas rotas `/api/*` passam sem verificacao no middleware** — cada route handler faz sua propria checagem
- Rotas protegidas: `/admin*`, `/admin-sistema*`, `/empreendimento/*`, `/espelho`, `/villa-bianco`, `/moment`, `/projetos`, `/vitta`, `/assinatura`
- Define cookies de cache: `subscription_status` (5min), `mfa_pending`, `first_login_step` (falta HttpOnly/Secure)

### 3.4 Roles
- `admin_sistema` — superadmin, acesso total
- `coordenador` — acesso limitado a empreendimentos atribuidos via tabela `coordenador_empreendimentos`
- `user` — usuario comum, acesso apos assinatura ativa

### 3.5 Pagamentos (Mercado Pago)
- Fluxo: usuario escolhe plano → frontend cria preference → redireciona MP → webhook confirma → assinatura ativada
- Webhook: `src/app/api/webhooks/mercadopago/route.ts` — verifica HMAC-SHA256 (`x-signature`)
- Cancelamento: CAS (Compare-And-Swap) com `.eq("status", "active")`

### 3.6 Analytics
- `src/hooks/useTrackEvent.ts` → `navigator.sendBeacon()` com `Blob({type: "application/json"})`
- `src/lib/analytics.ts` → `trackEvent()`, `trackUnitStatusChange()` usam `createAdminClient()`
- `src/app/api/analytics/track/route.ts` → recebe eventos, insert via `createAdminClient()`
- `src/app/api/cron/record-usage/route.ts` → cron diario, agrega contagem, estima invocations (x1.8), upsert `daily_usage_metrics`
- `scripts/monitor-usage.mjs` → script local para ler metricas no terminal

### 3.7 MFA
- TOTP: `src/lib/mfa/totp.ts` + API routes em `src/app/api/mfa/totp/`
- WebAuthn: `src/lib/mfa/webauthn.ts` + API routes em `src/app/api/mfa/webauthn/`
- Email OTP: `src/lib/mfa/email.ts` (usa Resend)
- Desafios WebAuthn armazenados em `Map` na memoria (ineficaz em serverless — cold start)

### 3.8 Simuladores
- 5 simuladores de pagamento: Quattre (Istambul), Venice Park, Villa Bianco, Vitta, Moment, Generico
- Cada um gera PDF com jsPDF + autoTable
- Suporte a correcao INCC (Indice Nacional de Custo da Construcao)

## 4. Estrutura de Diretorios

```
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
│   └── api/                              # 60 route handlers
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
```
## 5. Schemas SQL Versionados

### `supabase/schema.sql` (58 linhas)
Tabelas: `profiles`, `units`, `projeto_units`
- `profiles`: id (ref auth.users), email, display_name, role, must_change_password, must_setup_mfa
- `units`: id, empreendimento, bloco, unidade, status (disponivel/reservado/vendido), metragem, valor
- `projeto_units`: juncao de units com empreendimentos
- **RLS habilitado em todas** com politicas para admin_sistema e coordenador

### `supabase/schema-admin.sql` (163 linhas)
Tabelas: `empreendimentos`, `planos`, `assinaturas`, `pagamentos`, `coordenador_empreendimentos`, `cupons`, `cupom_usos`
- Politicas RLS para admin_sistema, coordenadores (sem isolamento por empreendimento — bug)
- Tabelas de MFA: `user_totp`, `user_passkeys`

### 13 tabelas sem schema versionado (criadas via dashboard Supabase)
assinaturas, pagamentos, user_totp, user_passkeys, planos, cupons, cupom_usos, simulador_configs, webhook_events, coordenador_empreendimentos, villa_bianco_units, vitta_units, moment_units

## 6. Seguranca — Estado Atual

### Auditoria concluida (29/08/2026)
Relatorio: `docs/security-audit/relatorio-auditoria-seguranca.pdf`
Issues: `docs/security-audit/issues-github.md`

### Resumo: 24 achados em 5 categorias
| Categoria | Critica | Alta | Media | Baixa | Informativa |
|---|---|---|---|---|---|
| RLS / Banco | 2 | 3 | 3 | 2 | 1 |
| Permissao backend | 2 | 0 | 1 | 2 | 0 |
| IDOR | 0 | 0 | 0 | 0 | 1 |
| Chaves expostas | 0 | 0 | 2 | 2 | 1 |
| XSS | 0 | 1 | 2 | 0 | 0 |

### Concluido
- [x] Issue 1: 3 endpoints de debug removidos (commit d905bec)
- [x] Issue 2: SQL para reabilitar RLS em analytics_events e unit_status_history (usuario executou)

### Pendente
- [ ] **Issue 3 (ALTA)**: Corrigir politica UPDATE da tabela units (aceita qualquer autenticado) e adicionar isolamento de coordenadores por empreendimento
- [ ] **Issue 4 (ALTA)**: Criar politica `profiles_update_own` e escapar `displayName` em `src/lib/mfa/email.ts:38`
- [ ] **Issue 5 (MEDIA)**: Exportar schema completo das 13 tabelas, corrigir fail-open em coordinator-access.ts, restringir CSP (remover unsafe-inline/unsafe-eval), remover emails hardcoded do frontend
- [ ] **Issue 6 (BAIXA)**: Remover fallback ADMIN_EMAILS de api-auth.ts, corrigir timing-unsafe em record-usage, excluir db.ts morto, adicionar imobsync/ ao .gitignore
- [ ] Cookies: `subscription_status`, `mfa_pending`, `first_login_step` sem HttpOnly/Secure

## 7. Deploy e Infraestrutura

- **Vercel Hobby**: 100K invocations/mes, 1 function instance, 10s timeout
- **Pro ($20/mes)**: 1M invocations/mes — migrar quando atingir ~85K/mes
- **Estimativa**: ~300 usuarios/dia = ~225K invocations/mes (excede Hobby)
- **Cron `/api/cron/record-usage`**: Protegido por `CRON_SECRET` (mas usa `!==` timing-unsafe)
- **Crons existentes**: expire-subscriptions, reconcile-mp, cleanup-analytics, record-usage
- **Agendamento**: via cron-job.org (manual pelo usuario)

## 8. Variaveis de Ambiente (nomes, nao valores)

### Necessarias
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `CRON_SECRET`
- `TURNSTILE_SECRET_KEY`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`

### Opcionais
- `SEED_ADMIN_EMAIL` (default hardcoded: prosperosdirecional@gmail.com — Issue 5)
- `VERCEL_TOKEN` (para o script monitor-usage.mjs consultar API do Vercel)
- `ADMIN_EMAILS` (fallback em api-auth.ts — sera removido)

## 9. Conventionoes de Codigo

- **API routes**: `export async function GET/POST/PUT/DELETE()` — padrao Next.js App Router
- **Auth em APIs**: chamar `requireAdminSistema()` ou `requireWriteAccess()` no topo do handler
- **Escrita no banco (bypass RLS)**: usar `createAdminClient()` do `@/lib/supabase/admin`
- **Leitura com RLS**: usar `createClient()` do `@/lib/supabase/server`
- **Frontend Supabase**: usar `createClient()` do `@/lib/supabase/client`
- **Componentes UI**: shadcn/ui em `src/components/ui/`
- **Estilos**: Tailwind CSS 4 com `cn()` de `@/lib/utils`
- **Commits**: mensagens em PT-BR ou ingles

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
06f9ebe fix(sql): wrap all policies in DO 2436 blocks with EXCEPTION handler
59651be fix(sql): add DROP POLICY IF EXISTS before profiles_update_own
6937101 fix: implementar todas as correcoes da auditoria de seguranca (Issues 3-6)
ad5044b d2c34c47-c0e2-4a86-bb72-3ca916c7dced
9b1e2d7 chore: adicionar githooks rastreados com script de instalacao
## 11. Tarefas Manuais do Usuario

- [x] Executar `supabase/fix-analytics-and-monitoring.sql` no Supabase SQL Editor
- [x] Executar SQL de reabilitar RLS em analytics_events e unit_status_history
- [ ] Agendar `/api/cron/record-usage` em cron-job.org
- [ ] Executar SQLs dos Issues 3, 4, 5, 6 da auditoria quando os fixes forem implementados

---

*Ultima atualizacao: 2026-08-31
