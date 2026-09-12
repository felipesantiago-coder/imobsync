-- ─────────────────────────────────────────────────────────────────────────────
-- add-parcelas-ate-entrega.sql
-- Simulador genérico: LIMITE DAS PARCELAS MENSAIS configurável pelo admin.
--
-- parcelas_ate_entrega = false (default): as parcelas mensais vão até o mês
--   ANTERIOR ao mês de entrega — comportamento histórico preservado.
-- parcelas_ate_entrega = true: as parcelas mensais vão até o PRÓPRIO MÊS DE
--   ENTREGA (inclusive).
--
-- A escolha vale para os dois cenários do simulador (padrão/bancário e
-- financiamento direto com a construtora), pois ambos derivam o cronograma
-- mensal do mesmo mês-limite. Semestrais e anuais também respeitam o limite.
-- Default preserva o comportamento atual. Aplicar manualmente no Supabase
-- (SQL Editor), como nas migrations anteriores.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.simulador_configs
  ADD COLUMN IF NOT EXISTS parcelas_ate_entrega boolean NOT NULL DEFAULT false;
