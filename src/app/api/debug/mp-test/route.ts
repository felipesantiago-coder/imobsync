import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPreApprovalPlanClient } from '@/lib/mercadopago';

/**
 * GET /api/debug/mp-test
 *
 * Fase final: atualiza back_url de todos os planos MP para o domínio
 * correto (quadra-imob-sync.vercel.app) e confirma o estado atual.
 *
 * REMOVER após confirmar que tudo funciona.
 */
export async function GET() {
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
  };

  const adminClient = createAdminClient();
  const { data: planos, error } = await adminClient
    .from('planos')
    .select('id, nome, periodo_meses, preco, ativo, mercadopago_plan_id, ordem')
    .eq('ativo', true)
    .order('ordem');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const planClient = getPreApprovalPlanClient();
  const newBackUrl = 'https://quadra-imob-sync.vercel.app/assinatura';
  const planUpdates: Array<Record<string, unknown>> = [];

  for (const plano of planos || []) {
    const entry: Record<string, unknown> = {
      db_nome: plano.nome,
      mp_plan_id: plano.mercadopago_plan_id,
    };

    if (!plano.mercadopago_plan_id) {
      entry.skipped = true;
      planUpdates.push(entry);
      continue;
    }

    // Buscar estado atual
    try {
      const current = await planClient.get({ preApprovalPlanId: plano.mercadopago_plan_id });
      entry.old_back_url = current.back_url;
      entry.payment_methods_allowed = current.payment_methods_allowed;
    } catch (err: unknown) {
      entry.get_error = err instanceof Error ? err.message : String(err);
      planUpdates.push(entry);
      continue;
    }

    // Atualizar back_url + garantir payment_methods_allowed
    try {
      const updated = await planClient.update({
        id: plano.mercadopago_plan_id,
        updatePreApprovalPlanRequest: {
          reason: plano.nome,
          back_url: newBackUrl,
          payment_methods_allowed: {
            payment_types: [
              { id: 'credit_card' },
              { id: 'debit_card' },
              { id: 'ticket' },
              { id: 'bank_transfer' },
            ],
          },
        },
      });
      entry.updated = true;
      entry.new_back_url = updated.back_url;
      entry.new_payment_methods = updated.payment_methods_allowed;
    } catch (err: unknown) {
      entry.updated = false;
      entry.update_error = err instanceof Error ? err.message : String(err);
    }

    planUpdates.push(entry);
  }

  results.plan_updates = planUpdates;

  return NextResponse.json(results);
}
