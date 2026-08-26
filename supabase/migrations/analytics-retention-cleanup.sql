-- Limpeza automática de eventos com mais de 180 dias
-- Execute diariamente via Supabase pg_cron ou manualmente

-- Função de limpeza
CREATE OR REPLACE FUNCTION public.clean_old_analytics()
RETURNS void AS $$
BEGIN
  DELETE FROM public.analytics_events
  WHERE created_at < now() - interval '180 days';

  DELETE FROM public.unit_status_history
  WHERE created_at < now() - interval '180 days';
END;
$$ LANGUAGE plpgsql;

-- Agendar via pg_cron (se disponível no plano Supabase)
-- Executa todo dia às 03:00 UTC
SELECT cron.schedule(
  'clean-analytics-daily',
  '0 3 * * *',
  $$ SELECT public.clean_old_analytics(); $$
);
