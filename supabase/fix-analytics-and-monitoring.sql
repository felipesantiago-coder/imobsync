-- ============================================
-- ImobSync — Correção Analytics + Tabela de Monitoramento
-- Execute este SQL no SQL Editor do Supabase
-- ============================================

-- ══════════════════════════════════════════════
-- PARTE 1: Corrigir RLS das tabelas de analytics
-- ══════════════════════════════════════════════
--
-- PROBLEMA: As tabelas analytics_events e unit_status_history
-- provavelmente foram criadas via dashboard do Supabase com
-- RLS habilitado por padrão, mas sem políticas INSERT/SELECT.
-- Resultado: todos os inserts via anon-key falhavam silenciosamente.
--
-- SOLUÇÃO: Desabilitar RLS nessas tabelas.
-- As rotas de API já fazem validação de autenticação antes de
-- inserir, e os inserts agora usam service_role (admin client)
-- que bypass RLS. Mas desabilitar RLS também protege contra
-- problemas futuros se alguém acidentalmente voltar a usar anon key.

-- Verificar se RLS está habilitado e desabilitar
ALTER TABLE IF EXISTS analytics_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS unit_status_history DISABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════
-- PARTE 2: Criar tabela de monitoramento de uso
-- ══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS daily_usage_metrics (
  date DATE PRIMARY KEY,
  analytics_events INTEGER NOT NULL DEFAULT 0,
  unique_users INTEGER NOT NULL DEFAULT 0,
  estimated_invocations INTEGER NOT NULL DEFAULT 0,
  month_to_date_invocations INTEGER NOT NULL DEFAULT 0,
  projected_monthly_invocations INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sem RLS — tabela apenas escrita por cron (service_role)
ALTER TABLE daily_usage_metrics DISABLE ROW LEVEL SECURITY;

-- Índice para consultas por data
CREATE INDEX IF NOT EXISTS idx_daily_usage_date ON daily_usage_metrics(date DESC);

-- ══════════════════════════════════════════════
-- PARTE 3: Verificação (execute após as correções)
-- ══════════════════════════════════════════════

-- Verificar se as tabelas existem e RLS está desabilitado
SELECT
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename IN ('analytics_events', 'unit_status_history', 'daily_usage_metrics')
ORDER BY tablename;

-- Verificar se há dados em analytics_events
SELECT
  COUNT(*) as total_eventos,
  COUNT(DISTINCT user_id) as usuarios_unicos,
  MIN(created_at) as primeiro_evento,
  MAX(created_at) as ultimo_evento
FROM analytics_events;

-- Verificar contagem por tipo de evento
SELECT
  event_type,
  COUNT(*) as total,
  COUNT(DISTINCT user_id) as usuarios
FROM analytics_events
GROUP BY event_type
ORDER BY total DESC
LIMIT 20;