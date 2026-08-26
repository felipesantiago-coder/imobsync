import { NextResponse } from 'next/server';
import { getPreApprovalPlanClient } from '@/lib/mercadopago';

/**
 * GET /api/admin-sistema/planos/debug-mp-plan
 *
 * Cria um plano de teste no MP com PIX habilitado e retorna a resposta completa.
 * Serve para diagnosticar se o MP está aceitando a configuração de PIX.
 * Depois inativa o plano criado.
 */
export async function GET() {
  try {
    const client = getPreApprovalPlanClient();
    const backUrl = `${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : process.env.NEXT_PUBLIC_APP_URL || ''}/assinatura`;

    // Criar plano de teste com PIX
    const createResponse = await client.create({
      body: {
        reason: 'Plano Diagnostico PIX',
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: 1.0,
          currency_id: 'BRL',
        },
        payment_methods_allowed: {
          payment_types: [
            { id: 'credit_card' },
            { id: 'bank_transfer' },
          ],
          payment_methods: [
            { id: 'pix' },
          ],
        },
        back_url: backUrl,
        status: 'active',
      },
    });

    const planId = createResponse.id;
    const createRaw = createResponse as Record<string, unknown>;

    // Buscar o plano de volta para ver o que o MP realmente salvou
    let getResponse = null;
    try {
      getResponse = (await client.get({ id: planId! })) as Record<string, unknown>;
    } catch (_e) {
      // ignore
    }

    // Inativar o plano de teste
    try {
      await client.update({
        id: planId!,
        updatePreApprovalPlanRequest: { status: 'inactive' },
      });
    } catch (_e) {
      // ignore
    }

    return NextResponse.json({
      plano_criado: {
        id: createRaw.id,
        init_point: createRaw.init_point,
        payment_methods_allowed: createRaw.payment_methods_allowed,
      },
      plano_buscado: getResponse
        ? {
            id: getResponse.id,
            payment_methods_allowed: getResponse.payment_methods_allowed,
          }
        : 'erro ao buscar',
      conclusao_pix: {
        enviado: { payment_types: ['credit_card', 'bank_transfer'], payment_methods: ['pix'] },
        salvo_no_criar: createRaw.payment_methods_allowed,
        salvo_no_buscar: getResponse ? getResponse.payment_methods_allowed : 'N/A',
      },
      init_point_url: createRaw.init_point || 'NÃO RETORNADO',
    });
  } catch (err) {
    return NextResponse.json(
      { erro: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
