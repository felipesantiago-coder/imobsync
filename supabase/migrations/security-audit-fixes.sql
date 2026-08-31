-- ============================================
-- Security Audit Fixes — Issues 3, 4a
-- Execute no Supabase SQL Editor
-- ============================================

-- ── Issue 3a: Corrigir politica UPDATE da tabela units ──
-- Antes: USING (auth.role() = 'authenticated') — qualquer logado podia editar
-- Depois: apenas admin_sistema
DO $$ BEGIN
  DROP POLICY IF EXISTS "Apenas admin pode editar" ON units;
  CREATE POLICY "Apenas admin pode editar" ON units
    FOR UPDATE USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin_sistema')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Issue 3b: Isolamento de coordenadores por empreendimento ──
-- Antes: qualquer coordenador editava unidades de QUALQUER empreendimento
-- Depois: coordenador so edita unidades de empreendimentos que lhe foram atribuidos
DO $$ BEGIN
  DROP POLICY IF EXISTS "projeto_units_coordenador" ON projeto_units;
  CREATE POLICY "projeto_units_coordenador" ON projeto_units
    FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM profiles p
        JOIN coordenador_empreendimentos ce ON ce.coordenador_id = p.id
        WHERE p.id = auth.uid() AND p.role = 'coordenador'
          AND ce.empreendimento_id = projeto_units.empreendimento_id
      ) OR EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin_sistema'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Issue 4a: profiles_update_own ──
-- Permite que usuarios comuns atualizem o proprio perfil
-- Necessario para o fluxo first-login/change-password funcionar com anon client
DO $$ BEGIN
  DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
  CREATE POLICY "profiles_update_own" ON profiles
    FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Verificacao ──
SELECT policyname, tablename, cmd,
       pg_get_expr(qual, oid) as using_expr
FROM pg_policies p
JOIN pg_class c ON c.relname = p.tablename
WHERE p.tablename IN ('units', 'projeto_units', 'profiles')
ORDER BY tablename, cmd;
