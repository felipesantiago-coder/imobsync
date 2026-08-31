-- ============================================
-- Quattre Istambul - Schema do Banco de Dados
-- Execute este SQL no SQL Editor do Supabase
-- ============================================

-- 1. Criar a tabela de unidades
CREATE TABLE IF NOT EXISTS units (
  id SERIAL PRIMARY KEY,
  andar INTEGER NOT NULL,
  unidade INTEGER NOT NULL,
  vagas INTEGER NOT NULL DEFAULT 1,
  area NUMERIC(10,2) NOT NULL,
  area_str VARCHAR(20) NOT NULL,
  valor_venda NUMERIC(15,2),
  tipo_area VARCHAR(10) NOT NULL CHECK (tipo_area IN ('66m²', '67m²', '69m²', '100m²')),
  status VARCHAR(20) NOT NULL DEFAULT 'disponivel' CHECK (status IN ('disponivel', 'reservado', 'vendido')),
  posicao_solar VARCHAR(10) NOT NULL CHECK (posicao_solar IN ('Nascente', 'Poente')),
  quartos INTEGER NOT NULL DEFAULT 2 CHECK (quartos IN (2, 3)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(unidade)
);

-- 2. Habilitar Realtime na tabela
ALTER PUBLICATION supabase_realtime ADD TABLE units;

-- 3. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_units_andar ON units(andar);
CREATE INDEX IF NOT EXISTS idx_units_status ON units(status);
CREATE INDEX IF NOT EXISTS idx_units_tipo_area ON units(tipo_area);
CREATE INDEX IF NOT EXISTS idx_units_unidade ON units(unidade);

-- 4. Criar RLS (Row Level Security) - qualquer um pode ler, apenas admin edita
ALTER TABLE units ENABLE ROW LEVEL SECURITY;

-- Política: qualquer um pode LER
CREATE POLICY "Qualquer um pode ver as unidades"
ON units FOR SELECT
USING (true);

-- Política: apenas admin_sistema pode EDITAR
CREATE POLICY "Apenas admin pode editar"
ON units FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin_sistema')
);

-- 5. Criar função para atualizar o updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_updated_at
BEFORE UPDATE ON units
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();
