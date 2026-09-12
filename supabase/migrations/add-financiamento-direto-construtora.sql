-- ─────────────────────────────────────────────────────────────────────────────
-- add-financiamento-direto-construtora.sql
-- Simulador genérico: opção de FINANCIAMENTO DIRETO COM A CONSTRUTORA no pós-obra.
--
-- Quando habilitado pelo administrador, o usuário do simulador pode escolher
-- entre o cenário padrão (saldo devedor para financiamento bancário após a
-- entrega) e o cenário de financiamento direto com a construtora, no qual o
-- saldo remanescente é parcelado em N parcelas mensais fixas (sistema PRICE),
-- com taxa estimada = média do índice configurado + juros pós-habite-se.
--
-- 1) fin_direto_construtora: habilita o seletor de cenário no simulador.
-- 2) fin_direto_parcelas: nº de parcelas mensais após a entrega (1..360).
-- 3) fin_direto_captacao_pct: meta de captação durante as obras (%) para o
--    cenário de financiamento direto (barra de progresso do resumo).
-- Defaults preservam o comportamento atual (opção desligada).
-- Aplicar manualmente no Supabase (SQL Editor), como nas migrations anteriores.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.simulador_configs
  ADD COLUMN IF NOT EXISTS fin_direto_construtora boolean NOT NULL DEFAULT false;

ALTER TABLE public.simulador_configs
  ADD COLUMN IF NOT EXISTS fin_direto_parcelas integer NOT NULL DEFAULT 120
    CHECK (fin_direto_parcelas >= 1 AND fin_direto_parcelas <= 360);

ALTER TABLE public.simulador_configs
  ADD COLUMN IF NOT EXISTS fin_direto_captacao_pct numeric(5,2) NOT NULL DEFAULT 40
    CHECK (fin_direto_captacao_pct >= 0 AND fin_direto_captacao_pct <= 100);
