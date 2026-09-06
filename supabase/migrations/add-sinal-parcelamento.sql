-- Parcelamento do sinal ato no simulador genérico (decisão do administrador).
-- sinal_parcelavel: false = sinal ato apenas à vista (1 parcela).
-- sinal_max_parcelas: nº máximo de parcelas do sinal quando parcelável (1..12).
-- Defaults preservam o comportamento atual das configs existentes (select 1..3).
-- Aplicar manualmente no Supabase (SQL Editor), como nas migrations anteriores.

ALTER TABLE public.simulador_configs
  ADD COLUMN IF NOT EXISTS sinal_parcelavel boolean NOT NULL DEFAULT true;

ALTER TABLE public.simulador_configs
  ADD COLUMN IF NOT EXISTS sinal_max_parcelas integer NOT NULL DEFAULT 3
    CHECK (sinal_max_parcelas >= 1 AND sinal_max_parcelas <= 12);
