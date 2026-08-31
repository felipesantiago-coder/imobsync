-- ─────────────────────────────────────────────────────────────
-- 1. Tabela de perfis com roles
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  display_name  TEXT,
  role          TEXT NOT NULL DEFAULT 'coordenador'
                CHECK (role IN ('coordenador', 'admin_sistema')),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Trigger para manter updated_at
CREATE OR REPLACE FUNCTION public.update_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_profiles_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    'coordenador'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_admin_sistema_full" ON public.profiles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin_sistema'
    )
  );

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ─────────────────────────────────────────────────────────────
-- 2. Tabela de empreendimentos
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.empreendimentos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  regiao        TEXT NOT NULL,
  imagem_url    TEXT,
  descricao     TEXT DEFAULT '',
  colunas_excel JSONB DEFAULT '{}',
  ativo         BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Trigger para manter updated_at
CREATE OR REPLACE FUNCTION public.update_empreendimentos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_empreendimentos_updated_at ON public.empreendimentos;
CREATE TRIGGER trg_empreendimentos_updated_at
  BEFORE UPDATE ON public.empreendimentos
  FOR EACH ROW EXECUTE FUNCTION public.update_empreendimentos_updated_at();

-- RLS
ALTER TABLE public.empreendimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "empreendimentos_select" ON public.empreendimentos
  FOR SELECT USING (true);

-- ─────────────────────────────────────────────────────────────
-- 3. Tabela genérica de unidades por empreendimento
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projeto_units (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empreendimento_id   UUID NOT NULL REFERENCES public.empreendimentos(id) ON DELETE CASCADE,
  andar               INTEGER,
  unidade             TEXT NOT NULL DEFAULT '',
  vagas               INTEGER DEFAULT 1,
  area                NUMERIC(10,2),
  area_str            TEXT DEFAULT '',
  quartos             INTEGER DEFAULT 1,
  valor_venda         NUMERIC(15,2),
  status              TEXT DEFAULT 'disponivel'
                      CHECK (status IN ('disponivel', 'reservado', 'vendido')),
  posicao_solar       TEXT DEFAULT '',
  tipologia           TEXT DEFAULT '',
  bloco               TEXT DEFAULT '',
  is_cobertura        BOOLEAN DEFAULT false,
  is_garden           BOOLEAN DEFAULT false,
  ordem               INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Trigger para manter updated_at
CREATE OR REPLACE FUNCTION public.update_projeto_units_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_projeto_units_updated_at ON public.projeto_units;
CREATE TRIGGER trg_projeto_units_updated_at
  BEFORE UPDATE ON public.projeto_units
  FOR EACH ROW EXECUTE FUNCTION public.update_projeto_units_updated_at();

-- RLS
ALTER TABLE public.projeto_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projeto_units_select" ON public.projeto_units
  FOR SELECT USING (true);

CREATE POLICY "projeto_units_coordenador" ON public.projeto_units
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN coordenador_empreendimentos ce ON ce.coordenador_id = p.id
      WHERE p.id = auth.uid() AND p.role = 'coordenador'
        AND ce.empreendimento_id = projeto_units.empreendimento_id
    ) OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin_sistema'
    )
  );

CREATE POLICY "projeto_units_admin_insert" ON public.projeto_units
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin_sistema'
    )
  );

-- Unique constraint para upsert no upload Excel (match por empreendimento + unidade)
CREATE UNIQUE INDEX IF NOT EXISTS idx_projeto_units_emp_unidade
  ON public.projeto_units(empreendimento_id, unidade);

-- Index
CREATE INDEX IF NOT EXISTS idx_projeto_units_empreendimento ON public.projeto_units(empreendimento_id);
CREATE INDEX IF NOT EXISTS idx_projeto_units_status ON public.projeto_units(status);
