-- Simulador genérico: parcela "Única" em data livre + correção do saldo devedor pós-habite-se.
-- 1) parcela_unica_data_habilitada + parcela_unica_data: nova parcela opcional "Única"
--    paga em data escolhida pelo administrador (além da "Única Habite-se", no mês da entrega).
-- 2) indice_pos_habitese: índice de correção do saldo devedor APÓS a emissão do habite-se
--    ('igpm' | 'ipca'). Durante as obras a correção continua sempre pelo INCC.
-- 3) juros_pos_habitese: taxa de juros mensal (%) aplicada ao saldo devedor após o habite-se,
--    somada ao índice (ex.: IGPM + 1% a.m., IPCA + 0,80% a.m.).
-- Defaults preservam o comportamento atual (bullet do PDF: "IGPM + 1%").
-- Aplicar manualmente no Supabase (SQL Editor), como nas migrations anteriores.

ALTER TABLE public.simulador_configs
  ADD COLUMN IF NOT EXISTS parcela_unica_data_habilitada boolean NOT NULL DEFAULT false;

ALTER TABLE public.simulador_configs
  ADD COLUMN IF NOT EXISTS parcela_unica_data date;

ALTER TABLE public.simulador_configs
  ADD COLUMN IF NOT EXISTS indice_pos_habitese text NOT NULL DEFAULT 'igpm'
    CHECK (indice_pos_habitese IN ('igpm', 'ipca'));

ALTER TABLE public.simulador_configs
  ADD COLUMN IF NOT EXISTS juros_pos_habitese numeric NOT NULL DEFAULT 1
    CHECK (juros_pos_habitese >= 0 AND juros_pos_habitese <= 20);
