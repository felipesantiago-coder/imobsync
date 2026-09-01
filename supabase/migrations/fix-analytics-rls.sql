-- ============================================
-- Correção do Analytics — Criar tabelas + Desabilitar RLS
-- Execute no Supabase SQL Editor
-- ============================================

-- ═══ PARTE 1: Criar tabelas se não existirem ═══
-- As tabelas analytics_events e unit_status_history não tinham
-- CREATE TABLE no projeto — foram criadas manualmente (ou nunca).
-- Este SQL garante que existam com a estrutura correta.

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  role TEXT NOT NULL DEFAULT 'comum',
  event_type TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS unit_status_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_id UUID,
  empreendimento_id UUID,
  unidade TEXT NOT NULL,
  bloco TEXT NOT NULL DEFAULT '',
  status_anterior TEXT,
  status_novo TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  changed_by_role TEXT NOT NULL DEFAULT 'comum',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_usage_metrics (
  date DATE PRIMARY KEY,
  analytics_events INTEGER NOT NULL DEFAULT 0,
  unique_users INTEGER NOT NULL DEFAULT 0,
  estimated_invocations INTEGER NOT NULL DEFAULT 0,
  month_to_date_invocations INTEGER NOT NULL DEFAULT 0,
  projected_monthly_invocations INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ PARTE 2: Desabilitar RLS ═══
-- Os inserts usam admin client (service_role) que bypassa RLS,
-- mas desabilitar RLS protege contra problemas futuros.
-- As rotas de API já fazem validação de autenticação.

ALTER TABLE analytics_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE unit_status_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE daily_usage_metrics DISABLE ROW LEVEL SECURITY;

-- ═══ PARTE 3: Índices para performance ═══

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_unit_status_history_created_at ON unit_status_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_unit_status_history_emp_id ON unit_status_history(empreendimento_id);
CREATE INDEX IF NOT EXISTS idx_daily_usage_date ON daily_usage_metrics(date DESC);

-- ═══ PARTE 4: Verificação ═══

SELECT
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename IN ('analytics_events', 'unit_status_history', 'daily_usage_metrics')
ORDER BY tablename;

SELECT
  COUNT(*) as total_eventos,
  COUNT(DISTINCT user_id) as usuarios_unicos,
  MIN(created_at) as primeiro_evento,
  MAX(created_at) as ultimo_evento
FROM analytics_events;

SELECT
  event_type,
  COUNT(*) as total,
  COUNT(DISTINCT user_id) as usuarios
FROM analytics_events
GROUP BY event_type
ORDER BY total DESC
LIMIT 20;
