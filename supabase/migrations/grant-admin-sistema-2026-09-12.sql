-- ─────────────────────────────────────────────────────────────────────────────
-- grant-admin-sistema-2026-09-12.sql
-- Promove o administrador do sistema: profiles.role = 'admin_sistema'
--
-- CONTEXTO / CAUSA RAIZ:
--   A auditoria de segurança (commit 0697c1b, 15/08/2026) removeu o fallback
--   por email hardcoded em src/lib/admin-auth.ts (requireAdminSistema).
--   Desde então, o acesso às rotas /api/admin-sistema/* exige EXCLUSIVAMENTE
--   profiles.role = 'admin_sistema' (o CHECK da tabela só permite
--   'coordenador' | 'admin_sistema' e o DEFAULT é 'coordenador').
--   Perfis que nunca tiveram o role gravado ficaram travados em 403
--   (empreendimentos, migrate-legacy etc.) — chicken-and-egg, pois seed-admin
--   também exige um admin_sistema existente.
--
-- COMO APLICAR:
--   Supabase Dashboard → SQL Editor → colar e executar (idempotente).
--   ⚠️ Se o email de login do administrador NÃO for o do passo 2, ajuste o
--   literal no bloco de promoção (o passo 1 lista os usuários existentes).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) Diagnóstico: usuários de auth e seus roles atuais ────────────────────
SELECT u.id, u.email, u.created_at, p.role AS role_atual
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
ORDER BY u.created_at ASC;

-- ── 2) Promoção idempotente (cria o profile se faltar, promove se existir) ──
--    ⚠️ SUBSTITUA <EMAIL_DO_ADMIN> abaixo pelo email real de login do
--    administrador ANTES de executar (o passo 1 lista os usuários).
INSERT INTO public.profiles (id, email, display_name, role)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'display_name', 'Administrador do Sistema'),
  'admin_sistema'
FROM auth.users u
WHERE lower(u.email) = lower('<EMAIL_DO_ADMIN>')
ON CONFLICT (id) DO UPDATE
  SET role       = 'admin_sistema',
      updated_at = now();

-- ── 3) Verificação: deve retornar exatamente 1 linha com role admin_sistema ─
SELECT u.email, p.role, p.updated_at
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE lower(u.email) = lower('<EMAIL_DO_ADMIN>');
