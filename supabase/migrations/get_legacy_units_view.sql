-- ============================================
-- P3 (irmãs): get_legacy_units_view(p_slug) — dashboards legados em 1 ida ao banco
-- Serve /espelho, /villa-bianco, /moment e /residencial-vitta
-- Execute no Supabase SQL Editor (idempotente — pode rodar de novo)
-- ============================================
-- Replica EXATAMENTE a decisão das páginas atuais:
--   * role = profiles.role (NULL se profile ausente — página trata)
--   * can_read: admin_sistema/coordenador → true; demais → assinatura
--     mais recente (active/lifetime, ORDER created_at DESC LIMIT 1) válida,
--     COM lazy expiration (UPDATE CAS status='active' → expired +
--     profiles.subscription_status='none') — parity com subscription-guard.ts
--   * units: todas as colunas (to_jsonb) ordenadas como a query atual de
--     cada página (NULLS LAST default = parity com PostgREST asc);
--     NULL quando can_read=false ou tabela ausente/erro (página envia
--     initialUnits=null → cliente segue o fluxo via API, como hoje)
-- Segurança: SECURITY DEFINER só executa com auth.uid() não-nulo (retorna
-- NULL). Whitelist de slugs via CASE — nenhum identificador dinâmico.
CREATE OR REPLACE FUNCTION public.get_legacy_units_view(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_role text := NULL;
  v_can_read boolean := false;
  v_units jsonb := NULL;
  v_ass record;
  v_agora_iso text;
  v_auditoria text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;
  EXCEPTION WHEN OTHERS THEN
    v_role := NULL; -- parity: catch no TS deixa profileRole null
  END;

  IF v_role = 'admin_sistema' OR v_role = 'coordenador' THEN
    v_can_read := true;
  ELSE
    -- hasValidSubscriptionForUser (parity exata, incluindo lazy expiration)
    BEGIN
      SELECT id, status, data_fim INTO v_ass
      FROM public.assinaturas
      WHERE user_id = v_uid AND status IN ('active', 'lifetime')
      ORDER BY created_at DESC
      LIMIT 1;

      IF FOUND THEN
        IF v_ass.status = 'lifetime' OR v_ass.data_fim IS NULL OR v_ass.data_fim > now() THEN
          v_can_read := true;
        ELSE
          -- Lazy expiration: CAS como no TS (só se ainda 'active').
          -- Literais via format/%L: coerção idêntica à do PostgREST,
          -- independente do tipo real da coluna updated_at.
          v_agora_iso := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
          v_auditoria := 'Expirada automaticamente (lazy expiration) em ' || v_agora_iso || '. Periodo contratado encerrado.';
          BEGIN
            EXECUTE format(
              'UPDATE public.assinaturas SET status = %L, motivo_cancelamento = %L, proximo_ciclo_em = NULL, updated_at = %L WHERE id = %L AND status = %L',
              'expired', v_auditoria, v_agora_iso, v_ass.id, 'active'
            );
            IF FOUND THEN
              BEGIN
                UPDATE public.profiles SET subscription_status = 'none' WHERE id = v_uid;
              EXCEPTION WHEN OTHERS THEN NULL; -- parity: profileErr só loga
              END;
            END IF;
          EXCEPTION WHEN OTHERS THEN NULL; -- parity: assErr só loga, acesso negado
          END;
          v_can_read := false;
        END IF;
      ELSE
        v_can_read := false; -- no_subscription (parity: !assinatura → false)
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_can_read := false; -- parity: assErr → false
    END;
  END IF;

  -- Units: só computa se pode ler (parity: initialUnits null sem acesso)
  IF v_can_read THEN
    BEGIN
      CASE p_slug
        WHEN 'espelho' THEN
          SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.andar, t.unidade), '[]'::jsonb)
            INTO v_units FROM public.units t;
        WHEN 'villa-bianco' THEN
          SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.bloco, t.andar, t.unidade), '[]'::jsonb)
            INTO v_units FROM public.villa_bianco_units t;
        WHEN 'moment' THEN
          SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.andar, t.unidade), '[]'::jsonb)
            INTO v_units FROM public.moment_units t;
        WHEN 'residencial-vitta' THEN
          SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.andar_num, t.bloco, t.unidade), '[]'::jsonb)
            INTO v_units FROM public.vitta_units t;
        ELSE
          v_units := NULL; -- slug fora da whitelist
      END CASE;
    EXCEPTION
      WHEN undefined_table THEN v_units := NULL; -- parity: tabela ausente → data null
      WHEN OTHERS THEN v_units := NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'role', v_role,
    'can_read', v_can_read,
    'units', v_units
  );
END;
$$;

-- Executável apenas por usuários autenticados
REVOKE EXECUTE ON FUNCTION public.get_legacy_units_view(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_legacy_units_view(text) TO authenticated;

COMMENT ON FUNCTION public.get_legacy_units_view(text) IS
'P3 (irmãs): payload dos dashboards legados em 1 RTT (role+can_read+units ordenadas). SECURITY DEFINER; exige auth.uid() não-nulo (retorna NULL). Slugs: espelho, villa-bianco, moment, residencial-vitta.';
