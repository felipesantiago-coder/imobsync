import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { updateMpPlanPaymentMethods } from '@/lib/mercadopago';

/**
 * POST /api/admin-sistema/planos/update-mp-pix
 *
 * Atualiza todos os planos ativos no Mercado Pago para habilitar PIX.
 * Executar uma vez após deploy para corrigir planos criados sem PIX.
 */
export async function POST() {
  try {
    const adminClient = createAdminClient();

    const { data: planos, error } = await adminClient
      .from('planos')
      .select('id, nome, mercadopago_plan_id')
      .eq('ativo', true);

    if (error) {
      return NextResponse.json({ error: 'Erro ao buscar planos.' }, { status: 500 });
    }

    if (!planos || planos.length === 0) {
      return NextResponse.json({ message: 'Nenhum plano ativo encontrado.' });
    }

    const results: Array<{ nome: string; mpPlanId: string; status: string }> = [];

    for (const plano of planos) {
      if (!plano.mercadopago_plan_id) {
        results.push({ nome: plano.nome, mpPlanId: '-', status: 'sem_mp_plan_id' });
        continue;
      }
      try {
        await updateMpPlanPaymentMethods(plano.mercadopago_plan_id);
        results.push({ nome: plano.nome, mpPlanId: plano.mercadopago_plan_id, status: 'atualizado' });
      } catch (err) {
        results.push({
          nome: plano.nome,
          mpPlanId: plano.mercadopago_plan_id,
          status: 'erro: ' + (err instanceof Error ? err.message : String(err)),
        });
      }
    }

    return NextResponse.json({
      message: 'Atualização concluída.',
      resultados: results,
    });
  } catch (err) {
    console.error('[update-mp-pix] Erro:', err);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
