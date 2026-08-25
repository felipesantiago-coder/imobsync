-- Analytics: tabelas de rastreamento de uso do sistema

-- 1. Tabela principal de eventos
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  role text NOT NULL CHECK (role IN ('comum', 'coordenador', 'admin_sistema')),
  event_type text NOT NULL,
  resource_type text,
  resource_id text,
  metadata jsonb DEFAULT '{}',
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para consultas eficientes
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON public.analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON public.analytics_events(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type ON public.analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_resource ON public.analytics_events(resource_type, resource_id);

-- RLS: apenas admin_sistema pode ler;
-- inserts permitidos para usuários autenticados (qualquer role)
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analytics_insert_any_auth" ON public.analytics_events
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "analytics_select_admin" ON public.analytics_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin_sistema')
  );

-- 2. Histórico de status de unidades
CREATE TABLE IF NOT EXISTS public.unit_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid,
  empreendimento_id uuid NOT NULL,
  unidade text NOT NULL,
  bloco text NOT NULL DEFAULT '',
  status_anterior text,
  status_novo text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_role text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_unit_status_history_unit ON public.unit_status_history(unit_id) WHERE unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_unit_status_history_emp ON public.unit_status_history(empreendimento_id);
CREATE INDEX IF NOT EXISTS idx_unit_status_history_created ON public.unit_status_history(created_at DESC);

ALTER TABLE public.unit_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "unit_history_select_admin" ON public.unit_status_history
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin_sistema')
  );

CREATE POLICY "unit_history_insert_auth" ON public.unit_status_history
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
