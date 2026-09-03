import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { PlanoDB } from '@/lib/mercadopago';

/**
 * GET /api/plans
 * Retorna todos os planos ativos, ordenados por `ordem`.
 * Qualquer usuário autenticado pode visualizar.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('planos')
      .select('id, nome, descricao, periodo_meses, preco, features, popular, maior_economia, ativo, ordem, mercadopago_plan_id')
      .eq('ativo', true)
      .order('ordem', { ascending: true });

    if (error) {
      console.error('[GET /api/plans] Erro Supabase:', error);
      return NextResponse.json({ error: 'Erro ao buscar planos.' }, { status: 500 });
    }

    // Tipar features como string[]
    const planos: PlanoDB[] = (data || []).map((p) => ({
      ...p,
      features: Array.isArray(p.features) ? p.features : [],
    }));

    return NextResponse.json({ planos });
  } catch (err) {
    console.error('[GET /api/plans] Erro inesperado:', err);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}
