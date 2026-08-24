-- Migration: simulador_configs
-- Tabela de configuração do simulador por empreendimento
-- Não altera tabelas existentes — puramente aditivo.

CREATE TABLE IF NOT EXISTS public.simulador_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empreendimento_id UUID NOT NULL REFERENCES public.empreendimentos(id) ON DELETE CASCADE UNIQUE,

  -- Data de entrega do empreendimento
  entrega_mes INTEGER NOT NULL CHECK (entrega_mes BETWEEN 1 AND 12),
  entrega_ano INTEGER NOT NULL CHECK (entrega_ano >= 2024),

  -- Percentuais padrão
  percentual_sinal NUMERIC(5,2) NOT NULL DEFAULT 5.00 CHECK (percentual_sinal > 0),
  percentual_captacao NUMERIC(5,2) NOT NULL DEFAULT 30.00 CHECK (percentual_captacao > 0),

  -- Tipos de parcela habilitados
  semestrais_habilitado BOOLEAN NOT NULL DEFAULT false,
  anuais_habilitado BOOLEAN NOT NULL DEFAULT false,
  intermediarias_habilitado BOOLEAN NOT NULL DEFAULT false,
  parcela_unica_habilitada BOOLEAN NOT NULL DEFAULT false,

  -- Taxa de decoração
  taxa_decoracao BOOLEAN NOT NULL DEFAULT false,
  taxa_decoracao_valor NUMERIC(15,2),
  taxa_decoracao_parcelas INTEGER CHECK (taxa_decoracao_parcelas > 0),
  taxa_decoracao_inicio DATE,
  taxa_decoracao_fim DATE,

  -- Metadados
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.simulador_configs ENABLE ROW LEVEL SECURITY;

-- Admin pode tudo
CREATE POLICY simulador_configs_admin_full ON public.simulador_configs
  FOR ALL USING (true) WITH CHECK (true);

-- Qualquer autenticado pode ler (necessário para o simulador funcionar)
CREATE POLICY simulador_configs_select_authenticated ON public.simulador_configs
  FOR SELECT USING (true);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.simulador_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER simulador_configs_set_updated_at
  BEFORE UPDATE ON public.simulador_configs
  FOR EACH ROW EXECUTE FUNCTION public.simulador_configs_updated_at();
