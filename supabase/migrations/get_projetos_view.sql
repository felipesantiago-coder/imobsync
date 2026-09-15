-- ============================================
-- P3-C: get_projetos_view() — payload completo do /projetos em 1 ida ao banco
-- Execute no Supabase SQL Editor (idempotente — pode rodar de novo)
-- ============================================
-- Replica EXATAMENTE o comportamento do render server anterior:
--   * role/mfa do profiles (default 'coordenador' se ausente/erro)
--   * empreendimentos ativos ordenados por created_at ASC
--   * unit_count de projeto_units (por empreendimento, 0 se vazio)
--   * last_updated: MAX(updated_at) da tabela legada por slug
--     (units / villa_bianco_units / moment_units / vitta_units) —
--     sobrescreve o valor genérico; tabela ausente → NULL (parity com TS)
--   * coordenador: filtra aos IDs de coordenador_empreendimentos
--     (fail-closed: tabela ausente/erro → lista vazia)
-- Segurança: SECURITY DEFINER só executa com auth.uid() não-nulo
-- (retorna NULL caso contrário) — para usuários autenticados o resultado
-- é idêntico às queries com o client do usuário (SELECT sem RLS restritiva).
CREATE OR REPLACE FUNCTION public.get_projetos_view()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_role text := 'coordenador';
  v_mfa boolean := false;
  -- NULL = sem filtro de atribuição (não-coordenador); [] = coordenador sem acesso
  v_allowed uuid[];
  v_max_quattre timestamptz;
  v_max_villa timestamptz;
  v_max_moment timestamptz;
  v_max_vitta timestamptz;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    SELECT role, mfa_enabled INTO v_role, v_mfa
    FROM public.profiles WHERE id = v_uid;
    IF NOT FOUND THEN
      v_role := 'coordenador';
      v_mfa := false;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_role := 'coordenador';
    v_mfa := false;
  END;

  IF v_role = 'coordenador' THEN
    BEGIN
      SELECT COALESCE(array_agg(empreendimento_id), ARRAY[]::uuid[])
        INTO v_allowed
      FROM public.coordenador_empreendimentos
      WHERE coordenador_id = v_uid;
    EXCEPTION
      WHEN undefined_table THEN v_allowed := ARRAY[]::uuid[]; -- fail-closed
      WHEN OTHERS THEN v_allowed := ARRAY[]::uuid[];          -- fail-closed
    END;
  END IF;

  -- MAX(updated_at) dos legados, tolerando tabela ausente (parity com TS:
  -- query com erro → data null → lastUpdated null)
  BEGIN
    SELECT MAX(updated_at) INTO v_max_quattre FROM public.units;
  EXCEPTION WHEN OTHERS THEN v_max_quattre := NULL; END;
  BEGIN
    SELECT MAX(updated_at) INTO v_max_villa FROM public.villa_bianco_units;
  EXCEPTION WHEN OTHERS THEN v_max_villa := NULL; END;
  BEGIN
    SELECT MAX(updated_at) INTO v_max_moment FROM public.moment_units;
  EXCEPTION WHEN OTHERS THEN v_max_moment := NULL; END;
  BEGIN
    SELECT MAX(updated_at) INTO v_max_vitta FROM public.vitta_units;
  EXCEPTION WHEN OTHERS THEN v_max_vitta := NULL; END;

  RETURN (
    SELECT jsonb_build_object(
      'role', v_role,
      'mfa_enabled', v_mfa,
      'empreendimentos', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'id', e.id,
            'nome', e.nome,
            'slug', e.slug,
            'regiao', e.regiao,
            'imagem_url', e.imagem_url,
            'descricao', e.descricao,
            'ativo', e.ativo,
            'created_at', e.created_at,
            'unit_count', COALESCE(u.cnt, 0),
            'last_updated',
            CASE e.slug
              WHEN 'quattre-istambul'  THEN v_max_quattre
              WHEN 'villa-bianco'      THEN v_max_villa
              WHEN 'moment'            THEN v_max_moment
              WHEN 'residencial-vitta' THEN v_max_vitta
              ELSE u.max_updated
            END
          ) ORDER BY e.created_at ASC)
        FROM public.empreendimentos e
        LEFT JOIN (
          SELECT empreendimento_id,
                 COUNT(*)::int AS cnt,
                 MAX(updated_at) AS max_updated
          FROM public.projeto_units
          GROUP BY empreendimento_id
        ) u ON u.empreendimento_id = e.id
        WHERE e.ativo = true
          AND (v_allowed IS NULL OR e.id = ANY(v_allowed))
      ), '[]'::jsonb)
    )
  );
END;
$$;

-- Executável apenas por usuários autenticados
REVOKE EXECUTE ON FUNCTION public.get_projetos_view() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_projetos_view() TO authenticated;

COMMENT ON FUNCTION public.get_projetos_view() IS
'P3-C: payload do /projetos em 1 RTT (role+mfa+empreendimentos+unit_count+last_updated+filtro de coordenador). SECURITY DEFINER; exige auth.uid() não-nulo (retorna NULL).';
