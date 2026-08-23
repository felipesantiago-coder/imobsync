import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPaymentClient } from '@/lib/mercadopago';

export const dynamic = 'force-dynamic';

/**
 * POST /api/subscriptions/confirm-payment
 *
 * Fallback ativo: consulta o MP diretamente por pagamentos aprovados
 * e ativa a assinatura local. Usado quando o webhook não processou.
 *
 * Fluxo:
 * 1. Busca assinatura pendente do usuário
 * 2. Busca pagamentos aprovados no MP (por external_reference ou payer_email)
 * 3. Se encontrado, processa igual ao webhook (upsert pagamento + ativar assinatura)
 * 4. Retorna o status atualizado
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }

    const admin = createAdminClient();

    // 1. Buscar assinatura pendente
    const { data: assinatura } = await admin
      .from('assinaturas')
      .select('id, user_id, plano_id, status, plano:planos(preco, periodo_meses)')
      .eq('user_id', user.id)
      .in('status', ['pending'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!assinatura) {
      // Sem assinatura pendente — verificar se já está ativa
      const { data: ativa } = await admin
        .from('assinaturas')
        .select('id, status')
        .eq('user_id', user.id)
        .in('status', ['active', 'lifetime'])
        .maybeSingle();

      return NextResponse.json({
        activated: false,
        reason: ativa ? 'already_active' : 'no_pending_subscription',
      });
    }

    console.error('[confirm-payment] Assinatura pendente encontrada:', assinatura.id);

    // 2. Buscar pagamentos aprovados no MP
    const paymentClient = getPaymentClient();

    // Buscar por external_reference (assinatura_id)
    try {
      const searchResponse = await paymentClient.search({
        options: {
          external_reference: assinatura.id,
          status: 'approved',
          sort: 'date_created',
          limit: 5,
        },
      });

      const results = (searchResponse as Record<string, unknown>).results as Array<Record<string, unknown>> || [];
      console.error('[confirm-payment] MP search results:', results.length, 'pagamentos aprovados');

      if (results.length === 0) {
        return NextResponse.json({
          activated: false,
          reason: 'no_approved_payment',
        });
      }

      // 3. Processar o pagamento mais recente
      const payment = results[0];
      const paymentId = String(payment.id || '');
      const valor = Number(payment.transaction_amount) || 0;
      const metodo = String(payment.payment_method_id || '');
      const dateApproved = payment.date_approved as string | null;

      if (!paymentId) {
        return NextResponse.json({ activated: false, reason: 'no_payment_id' });
      }

      // Mapear método
      let metodoNorm = 'pix';
      if (metodo.includes('credit_card')) metodoNorm = 'credit_card';
      else if (metodo.includes('debit_card')) metodoNorm = 'debit_card';
      else if (metodo.includes('bolbradesco')) metodoNorm = 'boleto';

      // 4. Upsert pagamento
      await admin.from('pagamentos').upsert(
        {
          user_id: user.id,
          assinatura_id: assinatura.id,
          mercadopago_payment_id: paymentId,
          mercadopago_preapproval_id: null,
          valor,
          metodo_pagamento: metodoNorm,
          status: 'approved',
          data_pagamento: dateApproved || new Date().toISOString(),
          detalhes: {
            mp_status: 'approved',
            payment_method_id: metodo,
            confirmed_via: 'confirm-payment-fallback',
          },
        },
        { onConflict: 'mercadopago_payment_id' }
      );

      // 5. Validar valor
      const plano = assinatura.plano as unknown as Record<string, unknown> | null;
      const precoPlano = plano ? Number(plano.preco) || 0 : 0;

      // Buscar cupom
      const { data: cupomUso } = await admin
        .from('cupom_usos')
        .select('valor_final')
        .eq('assinatura_id', assinatura.id)
        .maybeSingle();

      let valorEsperado = precoPlano;
      if (cupomUso && Number(cupomUso.valor_final) > 0) {
        valorEsperado = Number(cupomUso.valor_final);
      }

      // Aceitar se valor está dentro de 10% (mais tolerante para o fallback)
      if (valorEsperado > 0) {
        const diff = Math.abs(valor - valorEsperado) / valorEsperado;
        if (diff > 0.10) {
          console.error(
            `[confirm-payment] Valor divergente: pago R$${valor}, esperado R$${valorEsperado}. ` +
            `Diferença: ${Math.round(diff * 100)}%`
          );
          return NextResponse.json({
            activated: false,
            reason: 'amount_mismatch',
            paid: valor,
            expected: valorEsperado,
          });
        }
      }

      // 6. Ativar assinatura
      const agora = new Date().toISOString();
      const meses = plano ? (Number(plano.periodo_meses) || 1) : 1;
      const dataFim = new Date();
      dataFim.setMonth(dataFim.getMonth() + meses);

      const { error: updateErr } = await admin
        .from('assinaturas')
        .update({
          status: 'active',
          data_inicio: agora,
          data_fim: dataFim.toISOString(),
          ultimo_pagamento_em: agora,
          proximo_ciclo_em: dataFim.toISOString(),
          metodo_pagamento: metodoNorm,
        })
        .eq('id', assinatura.id)
        .in('status', ['pending', 'paused']);

      if (updateErr) {
        console.error('[confirm-payment] Erro ao ativar:', updateErr);
        return NextResponse.json({ activated: false, reason: 'db_error' });
      }

      // 7. Atualizar perfil
      await admin
        .from('profiles')
        .update({ subscription_status: 'active' })
        .eq('id', user.id);

      console.error('[confirm-payment] Assinatura ATIVADA:', assinatura.id, '| método:', metodoNorm, '| valor:', valor);

      return NextResponse.json({
        activated: true,
        paymentId,
        metodo: metodoNorm,
        valor,
      });
    } catch (mpErr) {
      console.error('[confirm-payment] Erro MP search:', mpErr);
      return NextResponse.json({
        activated: false,
        reason: 'mp_error',
        error: mpErr instanceof Error ? mpErr.message : String(mpErr),
      });
    }
  } catch (err) {
    console.error('[confirm-payment] Erro:', err);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
