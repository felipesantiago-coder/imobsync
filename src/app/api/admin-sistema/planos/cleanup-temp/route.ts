import { NextResponse } from 'next/server';
import { requireAdminSistema } from '@/lib/admin-auth';
import { getPreApprovalPlanClient } from '@/lib/mercadopago';

/**
 * GET /api/admin-sistema/planos/cleanup-temp
 *
 * Busca TODOS os planos no Mercado Pago, identifica os temporários
 * (criados para cupons, com "(Promo" no reason) e os inativa.
 *
 * O MP não permite excluir planos, apenas inativar (status: 'inactive').
 * Chame UMA VEZ para limpar os planos de teste, depois delete este endpoint.
 */
export async function GET() {
  try {
    const isAllowed = await requireAdminSistema();
    if (!isAllowed) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }
    const client = getPreApprovalPlanClient();

    // Buscar todos os planos (sem limite explícito — o SDK retorna até 30 por página)
    const response = await client.search({});
    const plans = (response as Record<string, unknown>).results as Array<Record<string, unknown>> || [];
    const total = (response as Record<string, unknown>).total as number || plans.length;

    const tempPlans: Array<{ id: string; reason: string; status: string }> = [];
    const inactivated: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const plan of plans) {
      const reason = (plan.reason as string) || '';
      const status = (plan.status as string) || '';
      const id = String(plan.id || '');

      if (reason.includes('(Promo')) {
        tempPlans.push({ id, reason, status });

        if (status === 'active') {
          try {
            await client.update({
              id,
              updatePreApprovalPlanRequest: { status: 'inactive' },
            });
            inactivated.push(id);
          } catch (err) {
            failed.push({ id, error: err instanceof Error ? err.message : String(err) });
          }
        }
      }
    }

    return NextResponse.json({
      total_planos_mp: total,
      planos_temporarios_encontrados: tempPlans.length,
      detalhes: tempPlans,
      inativados: inactivated.length,
      ids_inativados: inactivated,
      falhas: failed,
    });
  } catch (err) {
    console.error('[cleanup-temp] Erro:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro desconhecido' },
      { status: 500 }
    );
  }
}
