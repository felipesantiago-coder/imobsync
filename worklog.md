# Work Log

---
Task ID: 1
Agent: Main
Task: Implementar simulador genérico parametrizado para novos empreendimentos

Work Log:
- Explorou 5 simuladores existentes (Quattre, Venice Park, Vitta, Moment, Villa Bianco)
- Mapeou schema do banco (empreendimentos, projeto_units, perfis)
- Criou migration SQL: tabela `simulador_configs` com entrega, percentuais, tipos opcionais, taxa decoração
- Criou API admin: CRUD em `/api/admin-sistema/simulador-config`
- Criou API pública: GET em `/api/simulador-config/[empreendimentoId]`
- Criou componente `SimuladorConfigModal.tsx` com formulário completo
- Adicionou botão 'Simulador' no card de cada empreendimento no admin
- Criou simulador genérico `/simulador-generico/[id]` com 8 tipos de parcela
- Atualizou roteamento em `/empreendimento/[id]` para detectar config e redirecionar
- Corrigiu erros TypeScript (color types, INCC mode narrowing, subscription guard)

Stage Summary:
- 7 arquivos modificados/criados, 3415 linhas adicionadas
- Os 5 simuladores existentes NÃO foram alterados
- Deploy feito com sucesso via push para main
- **PENDENTE**: Executar `supabase/migration-simulador-configs.sql` no SQL Editor do Supabase

---
Task ID: 2
Agent: Main
Task: Fix parcela única date bug + Add confirmation dialogs to all admin actions

Work Log:
- Fixed parcela única date calculation: changed `totalMonths` to `totalMonths + 1` so the date lands on the delivery month instead of the month before
- Updated UI text in 3 locations from "mês anterior à entrega" to "mês da entrega"
- Added confirmation dialogs to 6 admin actions that were missing them:
  1. **Image Upload** (AdminSistemaClient.tsx): confirm before replacing empreendimento image
  2. **Excel Upload** (AdminSistemaClient.tsx): confirm before bulk unit data mutation
  3. **Edit Plano** (AssinaturasTab.tsx): confirm before updating existing plan (warns about MP sync loss)
  4. **Edit Cupom** (CuponsTab.tsx): confirm before updating existing coupon
  5. **Save Simulador Config** (SimuladorConfigModal.tsx): confirm with danger variant for legacy replacement
  6. **Save Coordenador Empreendimentos** (CoordenadorEmpreendimentosModal.tsx): confirm before replacing coordinator access list
- Build passed with zero errors

Stage Summary:
- 5 files modified across simulador fix + confirmation dialogs
- All admin modify/delete actions now have confirmation dialogs (15 with confirmations, 1 auto-fire migration excluded by design)

---
Task ID: analytics-design-research
Agent: Research
Task: Explore codebase for admin analytics dashboard design

## 1. User Roles and Authentication

### Roles (defined in `profiles.role` via CHECK constraint)
| Role | Description | Permissions |
|---|---|---|
| `admin_sistema` | System administrator | Full access to all admin-sistema features, all dashboards, bypass subscription checks, can manage users/roles/empreendimentos/assinaturas/cupons/planos |
| `coordenador` | Coordinator (limited by empreendimento assignment) | Can view/manage dashboards for assigned empreendimentos only, can update unit status, use simulators. Bypasses subscription check. |
| `comum` | Regular subscriber | Must have active subscription. Can use simulators and view dashboards. Cannot edit unit status. |

### Authentication Flow
- **Provider**: Supabase Auth (email+password)
- **MFA**: Optional but enforceable per-user (TOTP + WebAuthn/FIDO2 passkeys)
- **First login flow**: `must_change_password` → `/change-password` → `must_setup_mfa` → `/mfa-onboarding` → MFA verify `/mfa-verify`
- **Middleware** (`src/middleware.ts`): Redirects unauthenticated users, enforces first-login flow, checks MFA cookies (`mfa_pending`/`mfa_verified`), and checks subscription status cookie (5-min cache)
- **Subscription guard** (`src/lib/subscription-guard.ts`): Server-side validation on every API call; admins/coordenadores bypass; checks `assinaturas` table with lazy expiration
- **Key files**: `src/lib/admin-auth.ts`, `src/lib/api-auth.ts`, `src/lib/subscription-guard.ts`, `src/lib/coordinator-access.ts`, `src/middleware.ts`

### Coordinator Access Control
- Table `coordenador_empreendimentos` (many-to-many: profiles ↔ empreendimentos)
- `src/lib/coordinator-access.ts` provides `getCoordenadorEmpreendimentos()` and `coordenadorHasAccess()`
- Coordenadores only see their assigned empreendimentos on `/projetos` and are blocked from others

## 2. All Pages/Routes

### Public (no auth required)
| Route | Description |
|---|---|
| `/` | Landing page + login form. Handles sign-in and sign-up (signup triggers `/api/signup-subscribe`). |
| `/planos` | Public pricing plans page (`PlanosPublicClient.tsx`) — shows available plans for subscription |
| `/aguardando-pagamento` | "Awaiting payment" page after subscription creation |

### Auth Flow
| Route | Description |
|---|---|
| `/change-password` | First-login password change (enforced when `must_change_password=true`) |
| `/mfa-onboarding` | First-login MFA setup wizard |
| `/mfa-verify` | MFA verification challenge page (shown when `mfa_pending` cookie is set) |
| `/mfa-setup` | MFA management page (add/remove TOTP, WebAuthn passkeys) |

### Subscription / Payment
| Route | Description |
|---|---|
| `/assinatura` | Subscription management page (`AssinaturaClient.tsx`) — view plan, cancel, view payment history |
| `/planos-auth` | Authenticated plan selection page (`PlanosClient.tsx`) — subscribe with optional coupon |

### Main App (protected, subscription required)
| Route | Description |
|---|---|
| `/projetos` | Projects hub — lists all active empreendimentos as cards. Entry point to dashboards and simulators. |
| `/empreendimento/[id]` | Dynamic dashboard for a generic empreendimento — unit grid, status updates, filters, batch operations. Renders `DynamicDashboard` component. |
| `/espelho` | Legacy "espelho de vendas" (sales mirror) page |
| `/villa-bianco` | Villa Bianco dashboard (legacy standalone route) |
| `/moment` | Moment dashboard (legacy standalone route) |
| `/vitta` | Vitta dashboard (legacy standalone route) |

### Simulators (protected, subscription required)
| Route | Description |
|---|---|
| `/simulador` | Redirects to `/simulador-quattre-istambul` |
| `/simulador-quattre-istambul` | Quattre Istambul payment simulator (legacy hardcoded) |
| `/simulador-villa-bianco` | Villa Bianco payment simulator (legacy hardcoded) |
| `/simulador-moment` | Moment payment simulator (legacy hardcoded) |
| `/simulador-vitta` | Vitta payment simulator (legacy hardcoded) |
| `/simulador-venice-park` | Venice Park payment simulator (legacy hardcoded) |
| `/simulador-generico/[id]` | Generic parametrized simulator — reads config from `simulador_configs` table |

### Admin
| Route | Description |
|---|---|
| `/admin` | Admin dashboard hub — legacy entry (redirects from old `/admin/login`) |
| `/admin/login` | Redirects to `/` (login is now on landing page) |
| `/admin/villa-bianco` | Admin-specific Villa Bianco dashboard |
| `/admin-sistema` | System administration panel (`AdminSistemaClient.tsx`) — 4 tabs: Empreendimentos, Usuários, Assinaturas, Cupons |

## 3. Admin-Sistema Structure

### Tabs (defined by `type AdminTab = "empreendimentos" | "usuarios" | "assinaturas" | "cupons"`)

#### Tab 1: Empreendimentos
- Grid of cards showing empreendimento image, name, region, unit count, active status, creation date
- Actions per card:
  - **Upload Image** → `POST /api/admin-sistema/empreendimentos/upload-image`
  - **Upload Excel** (bulk unit import/update) → `POST /api/admin-sistema/empreendimentos/upload-excel`
  - **Simulador Config** (open `SimuladorConfigModal`) → CRUD via `/api/admin-sistema/simulador-config`
  - **Gerenciar Unidades** (navigate to units list)
  - **Delete** empreendimento → `DELETE /api/admin-sistema/empreendimentos`
- **"Novo Empreendimento"** button → create modal → `POST /api/admin-sistema/empreendimentos`
- Background: auto-migrates legacy projects on first load (`POST /api/admin-sistema/migrate-legacy`)

#### Tab 2: Usuários
- Table of all users with columns: email, display name, role, MFA status, first-login flags, creation date
- Actions:
  - **Create User** → modal with email/display name/role → `POST /api/admin-sistema/users/create`
  - **Change Role** → confirmation dialog → `PATCH /api/admin-sistema/users` (role: comum/coordenador/admin_sistema)
  - **Manage Empreendimentos** (for coordenadores) → `CoordenadorEmpreendimentosModal` → `PUT /api/admin-sistema/coordenadores/empreendimentos`
  - **Delete User** → confirmation dialog → `DELETE /api/admin-sistema/users`

#### Tab 3: Assinaturas (code-split via `AssinaturasTab.tsx`)
- Sub-table: list all subscriptions with user email, plan, status, dates
- Actions:
  - **Change Status** → dialog with status + motivo → `PATCH /api/admin-sistema/assinaturas`
  - **Activate** → `POST /api/admin-sistema/assinaturas/activate`
  - **Grant Lifetime** → `POST /api/admin-sistema/assinaturas/grant-lifetime`
  - **Fix Legacy** → `POST /api/admin-sistema/assinaturas/fix-legacy`
- Planos sub-section:
  - **Create/Edit Plano** → `POST/PUT /api/admin-sistema/planos`
  - **Delete Plano** → `DELETE /api/admin-sistema/planos`
  - **Toggle ativo** → `PUT /api/admin-sistema/planos`
  - **Sync with Mercado Pago** → `POST /api/admin-sistema/planos` (sync action)

#### Tab 4: Cupons (code-split via `CuponsTab.tsx`)
- Table of discount coupons with code, type, value, usage, validity, status
- Actions:
  - **Create Cupom** → `POST /api/admin-sistema/cupons`
  - **Edit Cupom** → `PATCH /api/admin-sistema/cupons`
  - **Delete Cupom** → `DELETE /api/admin-sistema/cupons`

### Header
- Title: "Administração do Sistema"
- Subtitle changes per active tab
- Links: "Voltar aos Projetos" (/projetos), "Segurança" (/mfa-setup), "Sair" (logout)

## 4. Key User Actions to Track

### Simulator Actions (all simulador-* pages + simulador-generico/[id])
| Action | Description |
|---|---|
| `simulador_calculate` | User runs a payment simulation (selects unit, configures payment, views results) |
| `simulador_generate_pdf` | User generates and downloads PDF of simulation result (`generatePDF()` → jsPDF) |
| `simulador_clear` | User clears form / resets simulator (`clearAll()`) |
| `simulador_change_incc_mode` | User changes INCC correction mode (none/180m/12m/6m) |
| `simulador_add_intermediary` | User adds intermediate installment to schedule |
| `simulador_select_unit` | User selects a specific unit from dropdown |

### Dashboard Actions (dynamic-dashboard, sales-dashboard, moment-dashboard, villa-bianco-dashboard, vitta-dashboard)
| Action | Description |
|---|---|
| `unit_status_change` | Change unit status (disponivel → reservado → vendido). PATCH to `/api/units`, `/api/villa-bianco-units`, `/api/moment-units`, `/api/vitta-units`, or `/api/admin-sistema/empreendimentos/[id]/units` |
| `unit_status_batch_change` | Batch status change (select multiple units, change all at once) |
| `unit_select` | User clicks/selects a unit card to view details |
| `unit_filter` | User applies filters (quartos, posição solar, vagas, status, andar) |
| `unit_sort` | User changes sort order |
| `dashboard_view` | User opens a specific empreendimento dashboard |

### Login/Logout Flow
| Action | Description |
|---|---|
| `login_success` | User logs in successfully (tracked in `user_login_events` table with IP, user agent, device fingerprint) |
| `login_failure` | Failed login attempt |
| `logout` | User clicks "Sair" |
| `signup` | New user registration via `POST /api/signup-subscribe` |
| `mfa_setup_totp` | User enables TOTP MFA |
| `mfa_setup_webauthn` | User registers a WebAuthn passkey |
| `mfa_verify` | User completes MFA challenge |
| `password_change` | First-login password change |

### Subscription / Payment Actions
| Action | API Route |
|---|---|
| `subscription_create` | `POST /api/subscriptions/create` — initiate subscription with optional coupon |
| `subscription_confirm_payment` | `POST /api/subscriptions/confirm-payment` — confirm PIX/boleto payment |
| `subscription_cancel` | `POST /api/subscriptions/cancel` — user cancels own subscription |
| `coupon_validate` | `GET /api/cupons/validate` — validate coupon code during checkout |
| `webhook_mercadopago` | `POST /api/webhooks/mercadopago` — incoming MP webhook (payment events) |

### Admin Mutation Endpoints (admin-sistema only)
| Action | API Route |
|---|---|
| `admin_empreendimento_create` | `POST /api/admin-sistema/empreendimentos` |
| `admin_empreendimento_delete` | `DELETE /api/admin-sistema/empreendimentos` |
| `admin_empreendimento_upload_excel` | `POST /api/admin-sistema/empreendimentos/upload-excel` |
| `admin_empreendimento_upload_image` | `POST /api/admin-sistema/empreendimentos/upload-image` |
| `admin_unit_status_change` | `PATCH /api/admin-sistema/empreendimentos/[id]/units` |
| `admin_user_create` | `POST /api/admin-sistema/users/create` |
| `admin_user_role_change` | `PATCH /api/admin-sistema/users` |
| `admin_user_delete` | `DELETE /api/admin-sistema/users` |
| `admin_coordenador_empreendimentos_update` | `PUT /api/admin-sistema/coordenadores/empreendimentos` |
| `admin_assinatura_status_change` | `PATCH /api/admin-sistema/assinaturas` |
| `admin_assinatura_activate` | `POST /api/admin-sistema/assinaturas/activate` |
| `admin_assinatura_grant_lifetime` | `POST /api/admin-sistema/assinaturas/grant-lifetime` |
| `admin_plano_create` | `POST /api/admin-sistema/planos` |
| `admin_plano_update` | `PUT /api/admin-sistema/planos` |
| `admin_plano_delete` | `DELETE /api/admin-sistema/planos` |
| `admin_plano_sync_mp` | `POST /api/admin-sistema/planos` (sync action) |
| `admin_cupom_create` | `POST /api/admin-sistema/cupons` |
| `admin_cupom_update` | `PATCH /api/admin-sistema/cupons` |
| `admin_cupom_delete` | `DELETE /api/admin-sistema/cupons` |
| `admin_simulador_config_save` | `POST/PUT /api/admin-sistema/simulador-config` |

### Cron / System Endpoints
| Action | API Route |
|---|---|
| `cron_expire_subscriptions` | `GET /api/cron/expire-subscriptions` (daily) |
| `cron_reconcile_mp` | `GET /api/cron/reconcile-mp` (reconcile MP payments) |

## 5. Database Structure

### Core Tables
| Table | Description | Key Columns |
|---|---|---|
| `profiles` | User profiles (1:1 with auth.users) | id, email, display_name, role (comum/coordenador/admin_sistema), subscription_status, mfa_enabled, must_change_password, must_setup_mfa, created_at, updated_at |
| `empreendimentos` | Real estate developments | id, nome, slug (unique), regiao, imagem_url, descricao, colunas_excel (JSONB), ativo, created_at, updated_at |
| `projeto_units` | Generic units per empreendimento | id, empreendimento_id (FK), andar, unidade, vagas, area, area_str, quartos, valor_venda, status (disponivel/reservado/vendido), posicao_solar, tipologia, bloco, is_cobertura, is_garden, ordem |
| `planos` | Subscription plans | id, nome, descricao, periodo_meses, preco, features (JSONB), popular, ativo, ordem, mercadopago_plan_id |
| `assinaturas` | User subscriptions | id, user_id (FK), plano_id (FK nullable), mercadopago_subscription_id, status (pending/active/cancelled/paused/expired/cancelled_by_user/lifetime), metodo_pagamento, data_inicio, data_fim, ultimo_pagamento_em, proximo_ciclo_em, cancelado_em, motivo_cancelamento |
| `pagamentos` | Payment history | id, assinatura_id (FK), user_id (FK), mercadopago_payment_id, valor, metodo_pagamento (pix/credit_card/debit_card/boleto), status (pending/approved/rejected/refunded/cancelled/in_process), data_pagamento, detalhes (JSONB) |
| `cupons` | Discount coupons | id, codigo (unique), tipo_desconto (percentual/fixo), valor_desconto, usos_maximos, usos_atuais, valido_a_partir, valido_ate, ativo, planos_ids (UUID[]) |
| `cupom_usos` | Coupon usage audit | id, cupom_id (FK), user_id (FK), assinatura_id (FK), plano_id (FK), valor_original, valor_descontado, valor_final |
| `coordenador_empreendimentos` | Many-to-many: coordinators ↔ empreendimentos | coordenador_id (PK), empreendimento_id (PK) |
| `simulador_configs` | Simulator config per empreendimento | id, empreendimento_id (FK, unique), entrega_mes, entrega_ano, percentual_sinal, percentual_captacao, semestrais/anuais/intermediarias/parcela_unica habilitados, taxa_decoracao fields |

### Security / Auth Tables
| Table | Description |
|---|---|
| `user_totp` | TOTP secrets per user (user_id unique) |
| `user_passkeys` | WebAuthn/FIDO2 credentials (user_id + credential_id unique) |
| `user_login_events` | Login event tracking (ip_address, user_agent, device_fingerprint, is_new_device, notified) |
| `role_change_audit` | Audit trail for role changes (target_user_id, actor_user_id, old_role, new_role, ip_address) |
| `webhook_events` | Mercado Pago webhook idempotency (event_id unique, event_type, processed_at) |

### Legacy Tables (being migrated to projeto_units)
| Table | Description |
|---|---|
| `units` | Quattre Istambul units (original schema) |
| `villa_bianco_units` | Villa Bianco units |
| `moment_units` | Moment units |
| `vitta_units` | Vitta units |

### Relationships Summary
```
auth.users (1) ←→ (1) profiles
profiles.role ∈ {comum, coordenador, admin_sistema}

empreendimentos (1) ←→ (N) projeto_units
empreendimentos (1) ←→ (1) simulador_configs
empreendimentos (N) ←→ (N) profiles [via coordenador_empreendimentos]

profiles (1) ←→ (N) assinaturas
planos (1) ←→ (N) assinaturas
assinaturas (1) ←→ (N) pagamentos

profiles (1) ←→ (N) user_totp
profiles (1) ←→ (N) user_passkeys
profiles (1) ←→ (N) user_login_events
profiles (1) ←→ (N) role_change_audit (target)
profiles (1) ←→ (N) role_change_audit (actor)

cupons (1) ←→ (N) cupom_usos
profiles (1) ←→ (N) cupom_usos
assinaturas (1) ←→ (0..1) cupom_usos
planos (1) ←→ (0..1) cupom_usos
```

## 6. Existing Patterns for Notifications, Logging, and Analytics

### What EXISTS
1. **`role_change_audit` table**: The only dedicated audit/log table. Records target_user_id, actor_user_id, old_role, new_role, ip_address, changed_at. Only triggered for role changes. Admin-only read access.
2. **`user_login_events` table**: Tracks login events with IP, user agent, device fingerprint, is_new_device flag. Inserted via API (currently has RLS but was initially permissive — fixed in security audit).
3. **`webhook_events` table**: Idempotency tracking for Mercado Pago webhooks. Stores event_id, event_type, processed_at. Auto-cleaned after 30 days.
4. **`cupom_usos` table**: Audit trail for coupon usage (who used which coupon, original/discounted/final amounts, timestamps).
5. **Console logging**: Extensive `console.log`/`console.error` throughout API routes (especially webhooks, signup, cron jobs). The most logged routes: webhooks/mercadopago (25), signup-subscribe (23), cron/reconcile-mp (8). This is NOT structured analytics — just debug logging.
6. **`updated_at` triggers**: Every table has auto-updated `updated_at` columns via triggers, providing basic change timestamps.
7. **Lazy subscription expiration**: `subscription-guard.ts` updates assinaturas status + motivo_cancelamento when detecting expired subscriptions.

### What does NOT exist
- **No general-purpose analytics/audit log table** — there's no `activity_log`, `event_log`, or `analytics_events` table
- **No event tracking library** — no PostHog, Mixpanel, Amplitude, GA, or any client-side analytics
- **No structured logging service** — just `console.log`/`console.error` to stdout
- **No notification system** — no in-app notifications, no email notifications for user actions (except MFA new-device detection via `user_login_events.notified`)
- **No dashboard metrics computation** — the existing admin panel shows raw lists but no aggregated stats/charts
- **No user action tracking on simulators** — PDF generation, calculations, and unit selections are not logged
- **No unit status change history** — when a unit goes from disponivel → reservado → vendido, only the current status is stored (no history trail)

### Key Gaps for Analytics Dashboard
1. **Need an `analytics_events` or `activity_log` table** to capture structured events (user_id, action, resource_type, resource_id, metadata JSONB, ip_address, created_at)
2. **Need unit status change history** — either a separate `unit_status_history` table or triggers that log old/new status on `projeto_units` updates
3. **Need to instrument simulator pages** — track calculations run, PDFs generated, units selected
4. **Need to instrument dashboard pages** — track filters applied, views, batch operations
5. **Login/logout events exist** in `user_login_events` but may need to be enriched with logout tracking
6. **Subscription/payment events exist** across `assinaturas`, `pagamentos`, `webhook_events`, `cupom_usos` — can be queried directly for revenue analytics

---