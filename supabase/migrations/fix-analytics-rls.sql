-- ============================================
-- Diagnóstico + Correção do Analytics
-- Execute no Supabase SQL Editor
-- ============================================

-- ═══ DIAGNÓSTICO ═══

-- 1. Verificar estado do RLS
SELECT
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename IN ('analytics_events', 'unit_status_history', 'daily_usage_metrics');

-- 2. Verificar policies existentes
SELECT policyname, tablename, cmd,
       pg_get_expr(qual, oid) as using_expr,
       pg_get_expr(with_check, oid) as check_expr
FROM pg_policies p
JOIN pg_class c ON c.relname = p.tablename
WHERE p.tablename IN ('analytics_events', 'unit_status_history')
ORDER BY tablename, cmd;

-- 3. Verificar se há dados
SELECT
  (SELECT COUNT(*) FROM analytics_events) as total_analytics,
  (SELECT COUNT(*) FROM unit_status_history) as total_status_history,
  (SELECT COUNT(*) FROM daily_usage_metrics) as total_daily_metrics;

-- 4. Últimos eventos (se existirem)
SELECT id, event_type, user_id, role, created_at
FROM analytics_events
ORDER BY created_at DESC
LIMIT 5;

-- ═══ CORREÇÃO ═══
-- Garantir que RLS está DESABILITADO nas tabelas de analytics.
-- Os inserts usam admin client (service_role) que bypassa RLS,
-- mas desabilitar RLS também protege contra futuros problemas.
-- As rotas de API já fazem validação de autenticação.

ALTER TABLE IF EXISTS analytics_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS unit_status_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS daily_usage_metrics DISABLE ROW LEVEL SECURITY;

-- ═══ VERIFICAÇÃO FINAL ═══
SELECT
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename IN ('analytics_events', 'unit_status_history', 'daily_usage_metrics');
