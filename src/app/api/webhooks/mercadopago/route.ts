import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyWebhookSignature, getMpPayment, getMpSubscription, deleteMpPlan } from '@/lib/mercadopago';

/**
 * POST /api/webhooks/mercadopago
 *
 * Webhook receiver para eventos do Mercado Pago.
 * Processa automaticamente:
 *  - Pagamentos aprovados/rejeitados
 *  - Assinaturas ativadas/canceladas/pausadas
 *
 * SEGURANCA:
 *  - Verifica assinatura HMAC-SHA256 do x-signature (sem bypass)
 *  - Idempotencia via INSERT ON CONFLICT DO NOTHING (atomico, sem race condition)
 *  - Evento registrado ANTES do processamento (at-least-once seguro)
 */
export async function POST(request: NextRequest) {
  try {
    // 0. Verificar se webhook secret esta configurado
    if (!process.env.MERCADOPAGO_WEBHOOK_SECRET) {
      console.error('[Webhook MP] MERCADOPAGO_WEBHOOK_SECRET nao configurado. Webhook desabilitado.');
      return NextResponse.json(
        { error: 'Webhook nao configurado. Configure MERCADOPAGO_WEBHOOK_SECRET.' },
        { status: 503 }
      );
    }

    const bodyText = await request.text();
    let body: Record<string, unknown>;

    try {
      body = JSON.parse(bodyText);
    } catch {
      return NextResponse.json({ error: 'JSON invalido.' }, { status: 400 });
    }

    // 1. Verificar assinatura do webhook — OBRIGATORIO, sem bypass
    const xSignature = request.headers.get('x-signature');
    const isValid = await verifyWebhookSignature(xSignature, bodyText);

    if (!isValid) {
      console.warn('[Webhook MP] Assinatura HMAC invalida. Requisicao rejeitada.');
      return NextResponse.json({ error: 'Assinatura invalida.' }, { status: 401 });
    }

    const action = body.action as string | undefined;
    const type = body.type as string | undefined;
    const data = body.data as Record<string, string> | undefined;

    if (!data?.id) {
      return NextResponse.json({ received: true });
    }

    // Montar event_id para idempotencia
    const eventId = `${type || 'unknown'}:${data.id}`;

    const supabase = createAdminClient();

    // 2. Idempotencia ATOMICA: INSERT ON CONFLICT DO NOTHING
    //    Registra o evento ANTES de processar para evitar race conditions.
    //    Se o insert falhar por conflito, o evento ja foi processado.
    const { error: insertEventErr } = await supabase
      .from('webhook_events')
      .insert({
        event_id: eventId,
        event_type: type || 'unknown',
        action: action || null,
        mp_resource_id: data.id,
      })
      .select('id')
      .single();

    // Se insert falhou e o erro NAO e de duplicata, e um erro real
    if (insertEventErr) {
      // Verificar se e erro de chave unica (evento ja processado)
      if (insertEventErr.code === '23505') {
        // Evento ja processado — retornar 200 silenciosamente
        return NextResponse.json({ received: true, idempotent: true });
      }
      console.error('[Webhook MP] Erro ao registrar evento:', insertEventErr);
      return NextResponse.json({ error: 'Erro ao registrar evento.' }, { status: 500 });
    }

    // 3. Processar por tipo de evento
    let processingError = false;

    if (type === 'payment') {
      processingError = !(await handlePaymentEvent(supabase, data.id));
    } else if (type === 'preapproval') {
      processingError = !(await handlePreapprovalEvent(supabase, data.id, action));
    }
    // Tipo nao tratado — registrar e ignorar

    if (processingError) {
      // Retornar 500 para que o MP faca retry
      return NextResponse.json(
        { error: 'Erro ao processar evento.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[Webhook MP] Erro geral:', err);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}

// ── Maquina de Estados: transicoes validas para assinaturas ──
const VALID_TRANSITIONS: Record<string, Set<string>> = {
  pending: new Set(['pending', 'active', 'cancelled', 'rejected', 'expired']),
  active: new Set(['active', 'cancelled', 'paused', 'expired', 'cancelled_by_user']),
  paused: new Set(['paused', 'active', 'cancelled', 'expired', 'cancelled_by_user']),
  cancelled: new Set(['cancelled']),
  cancelled_by_user: new Set(['cancelled_by_user']),
  expired: new Set(['expired']),
};

function isTransitionValid(currentStatus: string, newStatus: string): boolean {
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed) return false;
  return allowed.has(newStatus);
}

// ── Handler: Pagamentos ──────────────────────────────────────

async function handlePaymentEvent(
  supabase: ReturnType<typeof createAdminClient>,
  paymentId: string
): Promise<boolean> {
  try {
    // Buscar detalhes do pagamento no MP
    const payment = await getMpPayment(paymentId);
    const paymentData = payment as unknown as Record<string, unknown>;

    const status = paymentData.status as string;
    const valor = Number(paymentData.transaction_amount) || 0;
    const metodo = paymentData.payment_method_id as string || '';
    const dateApproved = paymentData.date_approved as string | null;
    const preapprovalId = (paymentData.metadata as Record<string, unknown> | undefined)?.preapproval_id as string | undefined;
    const externalReference = paymentData.external_reference as string | undefined;
    const metadataAssinaturaId = (paymentData.metadata as Record<string, unknown> | undefined)?.assinatura_id as string | undefined;

    if (!status) {
      return true; // Sem status, nada a processar
    }

    // Sanity check: valor deve ser positivo e razoavel
    if (valor < 0 || valor > 999999.99) {
      console.error(`[Webhook MP] Valor fora do range aceitavel: R$${valor}. Pagamento ${paymentId}.`);
      return false;
    }

    // Mapear metodo de pagamento
    let metodoNorm = 'pix';
    if (metodo.includes('credit_card')) metodoNorm = 'credit_card';
    else if (metodo.includes('debit_card')) metodoNorm = 'debit_card';
    else if (metodo.includes('bolbradesco')) metodoNorm = 'boleto';

    // Buscar a assinatura pelo preapproval_id (se vier no metadata)
    let assinaturaId: string | null = null;
    let userId: string | null = null;

    if (preapprovalId) {
      const { data: ass } = await supabase
        .from('assinaturas')
        .select('id, user_id')
        .eq('mercadopago_subscription_id', preapprovalId)
        .maybeSingle();

      if (ass) {
        assinaturaId = ass.id;
        userId = ass.user_id;
      }
    }

    // Se não achou por preapproval_id, tentar pelo external_reference ou metadata.assinatura_id
    // (usado pelo fluxo Checkout Pro / Preference)
    const refId = metadataAssinaturaId || externalReference;
    if (!userId && refId) {
      // Verificar se refId é um UUID de assinatura local
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(refId)) {
        const { data: assByRef } = await supabase
          .from('assinaturas')
          .select('id, user_id')
          .eq('id', refId)
          .maybeSingle();
        if (assByRef) {
          assinaturaId = assByRef.id;
          userId = assByRef.user_id;
          console.log(`[Webhook MP] Pagamento ${paymentId} vinculado via external_reference/metadata à assinatura ${refId}`);
        }
      }
    }

    // Se não achou por preapproval_id, tentar pelo payer_email
    // (fallback para init_point flow onde o subscription pode nao estar vinculado ainda)
    if (!userId) {
      const payerEmail = (paymentData.payer as Record<string, unknown> | undefined)?.email as string | undefined;
      if (payerEmail) {
        // Buscar usuario pelo email no auth.users
        try {
          const adminAuth = createAdminClient();
          // ⚠︎ FINDING (performance program, Phase 0): the installed @supabase/auth-js
          // listUsers() only sends page/per_page — the `filter` field is ignored at
          // runtime. Behavior is preserved as-is pending owner validation with
          // staging data; do NOT treat users[0] as guaranteed to match payerEmail.
          const { data: { users } } = await adminAuth.auth.admin.listUsers({
            page: 1,
            perPage: 1,
            filter: `email.eq.${payerEmail}`,
          } as Parameters<typeof adminAuth.auth.admin.listUsers>[0] & { filter: string });
          if (users && users.length > 0) {
            userId = users[0].id;
            // Buscar assinatura pendente/ativa mais recente
            const { data: pendingAss } = await supabase
              .from('assinaturas')
              .select('id')
              .eq('user_id', userId)
              .in('status', ['pending', 'active'])
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (pendingAss) assinaturaId = pendingAss.id;
          }
        } catch {
          // Ignorar falha de busca
        }
      }
    }

    if (!userId) {
      return true; // Pagamento nao relacionado a nenhum usuario local
    }

    // Validar status do pagamento
    const validStatuses = ['pending', 'approved', 'rejected', 'refunded', 'cancelled', 'in_process'];
    const normalizedStatus = validStatuses.includes(status) ? status : 'pending';

    // Upsert pagamento (sem dados pessoais do payer)
    const { error: upsertErr } = await supabase
      .from('pagamentos')
      .upsert(
        {
          user_id: userId,
          assinatura_id: assinaturaId,
          mercadopago_payment_id: paymentId,
          mercadopago_preapproval_id: preapprovalId || null,
          valor,
          metodo_pagamento: metodoNorm,
          status: normalizedStatus,
          data_pagamento: dateApproved || null,
          detalhes: {
            mp_status: status,
            payment_method_id: metodo,
            date_created: paymentData.date_created,
          },
        },
        { onConflict: 'mercadopago_payment_id' }
      );

    if (upsertErr) {
      console.error(`[Webhook MP] Erro ao upsert pagamento ${paymentId}:`, upsertErr);
      return false;
    }

    // Se pagamento aprovado, atualizar assinatura
    if (normalizedStatus === 'approved' && assinaturaId) {
      // Buscar assinatura com status atual e plano (uma unica query)
      const { data: assinatura } = await supabase
        .from('assinaturas')
        .select('id, status, data_inicio, data_fim, plano_id, plano:planos(preco, periodo_meses)')
        .eq('id', assinaturaId)
        .single();

      if (!assinatura) return true;

      const plano = assinatura.plano as unknown as Record<string, unknown> | null;
      const isAlreadyActive = assinatura.status === 'active';

      // Para ativacao inicial: validar transicao de estado
      if (!isAlreadyActive && !isTransitionValid(assinatura.status, 'active')) {
        console.warn(
          `[Webhook MP] Transicao invalida: ${assinatura.status} -> active. Assinatura ${assinaturaId}. Ignorando.`
        );
        return true;
      }

      // FIX SEC-002: Validar valor cobrado vs preco esperado.
      // Se houver cupom vinculado, usar o valor_final do cupom_usos como referencia.
      // Caso contrario, usar preco do plano com tolerancia de 5%.
      if (plano) {
        const precoPlano = Number(plano.preco) || 0;

        // Buscar uso de cupom para esta assinatura
        let valorEsperado = precoPlano;

        // Tentar buscar por assinatura_id primeiro, depois por user_id + plano_id (fallback)
        let cupomUso = await supabase
          .from('cupom_usos')
          .select('valor_final')
          .eq('assinatura_id', assinaturaId)
          .maybeSingle();

        if (!cupomUso.data && userId) {
          cupomUso = await supabase
            .from('cupom_usos')
            .select('valor_final')
            .eq('user_id', userId)
            .eq('plano_id', assinatura.plano_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        }

        if (cupomUso.data && Number(cupomUso.data.valor_final) > 0) {
          valorEsperado = Number(cupomUso.data.valor_final);
        }

        if (valorEsperado > 0) {
          const diff = Math.abs(valor - valorEsperado) / valorEsperado;
          if (diff > 0.05) {
            // Na renovacao, o valor pode ser o preco cheio (sem cupom)
            // Logar alerta mas nao bloquear a renovacao
            if (isAlreadyActive) {
              console.warn(
                `[Webhook MP] Valor de renovacao (R$${valor}) difere do esperado (R$${valorEsperado}). ` +
                `Assinatura ${assinaturaId}. Estendendo data_fim mesmo assim (renovacao).`
              );
            } else {
              console.error(
                `[Webhook MP] ALERTA: Valor pago (R$${valor}) diverge do esperado (R$${valorEsperado}) em ${Math.round(diff * 100)}%. ` +
                `Assinatura ${assinaturaId}, Pagamento ${paymentId}. Requerer intervencao manual.`
              );
              return false;
            }
          }
        }
      }

      const agora = new Date().toISOString();
      const meses = plano ? (Number(plano.periodo_meses) || 1) : 1;

      // Calcular data_fim:
      // - Ativacao inicial: agora + N meses
      // - Renovacao (ja active): max(data_fim_atual, agora) + N meses
      let novaDataFim: string | null = null;
      if (plano) {
        const baseDate = isAlreadyActive && assinatura.data_fim
          ? new Date(Math.max(new Date(assinatura.data_fim).getTime(), Date.now()))
          : new Date();
        baseDate.setMonth(baseDate.getMonth() + meses);
        novaDataFim = baseDate.toISOString();
      }

      if (isAlreadyActive) {
        // ── RENOVACAO: estender data_fim sem mudar status ──
        const { error: renewErr } = await supabase
          .from('assinaturas')
          .update({
            data_fim: novaDataFim,
            ultimo_pagamento_em: agora,
            proximo_ciclo_em: novaDataFim,
          })
          .eq('id', assinaturaId)
          .eq('status', 'active');

        if (renewErr) {
          console.error(`[Webhook MP] Erro ao renovar assinatura ${assinaturaId}:`, renewErr);
          return false;
        }

        console.log(
          `[Webhook MP] Assinatura ${assinaturaId} renovada. Novo data_fim: ${novaDataFim}`
        );
      } else {
        // ── ATIVACAO INICIAL: pending/paused -> active ──
        const { error: updateErr } = await supabase
          .from('assinaturas')
          .update({
            status: 'active',
            data_inicio: !assinatura.data_inicio ? agora : undefined,
            data_fim: novaDataFim,
            ultimo_pagamento_em: agora,
            proximo_ciclo_em: novaDataFim,
            metodo_pagamento: metodoNorm,
          })
          .eq('id', assinaturaId)
          .in('status', ['pending', 'paused']); // CAS

        if (updateErr) {
          console.error(`[Webhook MP] Erro ao ativar assinatura ${assinaturaId}:`, updateErr);
          return false;
        }
      }

      // ── Abordagem B: Ativar subscription_status do perfil ──
      try {
        const { error: profileErr } = await supabase
          .from('profiles')
          .update({ subscription_status: 'active' })
          .eq('id', userId);
        if (profileErr) {
          console.error(`[Webhook MP] Erro ao atualizar perfil ${userId}:`, profileErr);
        }
      } catch {
        // Ignorar erro de perfil
      }
    }

    return true;
  } catch (err) {
    console.error(`[Webhook MP] Erro ao processar pagamento ${paymentId}:`, err);
    return false;
  }
}

// ── Handler: Assinaturas (Preapproval) ──────────────────────

async function handlePreapprovalEvent(
  supabase: ReturnType<typeof createAdminClient>,
  subscriptionId: string,
  action: string | undefined
): Promise<boolean> {
  try {
    // Buscar detalhes da assinatura no MP
    const subscription = await getMpSubscription(subscriptionId);
    const subData = subscription as unknown as Record<string, unknown>;

    const mpStatus = subData.status as string;
    const payerId = (subData.payer_id as string) || null;
    const payerEmail = (subData.payer_email as string) || '';
    const externalReference = (subData.external_reference as string) || '';
    const preapprovalPlanId = (subData.preapproval_plan_id as string) || '';

    // Mapear status MP -> nosso status
    const statusMap: Record<string, string> = {
      authorized: 'active',
      active: 'active',
      pending: 'pending',
      cancelled: 'cancelled',
      paused: 'paused',
    };

    const ourStatus = statusMap[mpStatus];
    if (!ourStatus) {
      console.warn(`[Webhook MP] Status MP nao mapeado: ${mpStatus} para assinatura ${subscriptionId}`);
      return true; // Status desconhecido nao e erro fatal
    }

    // Buscar assinatura local com status atual
    let assinatura = await findLocalSubscription(supabase, subscriptionId, payerEmail, externalReference);

    if (!assinatura) {
      console.warn(`[Webhook MP] Assinatura ${subscriptionId} nao encontrada localmente. External ref: ${externalReference}, email: ${payerEmail}`);
      return true;
    }

    // Se a assinatura local ainda nao tem o ID do MP, preencher agora
    if (!assinatura.mercadopago_subscription_id) {
      const { error: linkErr } = await supabase
        .from('assinaturas')
        .update({ mercadopago_subscription_id: subscriptionId })
        .eq('id', assinatura.id);
      if (linkErr) {
        console.error(`[Webhook MP] Erro ao vincular assinatura ${assinatura.id} ao MP ${subscriptionId}:`, linkErr);
      } else {
        console.log(`[Webhook MP] Assinatura local ${assinatura.id} vinculada ao MP ${subscriptionId}`);
      }
    }

    // Validar transicao de estado
    if (!isTransitionValid(assinatura.status, ourStatus)) {
      console.warn(
        `[Webhook MP] Transicao invalida: ${assinatura.status} -> ${ourStatus}. Assinatura ${assinatura.id}. Ignorando.`
      );
      return true;
    }

    // Montar dados de atualizacao
    const updateData: Record<string, unknown> = {
      status: ourStatus,
    };

    if (payerId) {
      updateData.mercadopago_payer_id = String(payerId);
    }

    if (mpStatus === 'cancelled') {
      updateData.cancelado_em = new Date().toISOString();
      updateData.motivo_cancelamento = `Cancelada via Mercado Pago (action: ${action || 'unknown'})`;
      updateData.proximo_ciclo_em = null;
    }

    if (mpStatus === 'paused') {
      updateData.proximo_ciclo_em = null;
    }

    const { error } = await supabase
      .from('assinaturas')
      .update(updateData)
      .eq('id', assinatura.id);

    if (error) {
      console.error(`[Webhook MP] Erro ao atualizar assinatura ${assinatura.id}:`, error);
      return false;
    }

    // ── Cleanup: inativar plano temporário (criado para cupom) ──
    if (preapprovalPlanId && ourStatus === 'authorized') {
      try {
        const planClient = (await import('@/lib/mercadopago')).getPreApprovalPlanClient();
        const plan = await planClient.get({ preApprovalPlanId: preapprovalPlanId });
        const planReason = (plan.reason as string) || '';
        // Planos temporários têm "(Promo" no nome
        if (planReason.includes('(Promo')) {
          await deleteMpPlan(preapprovalPlanId);
          console.log(`[Webhook MP] Plano temporário inativado: ${preapprovalPlanId}`);
        }
      } catch (err) {
        console.warn(`[Webhook MP] Falha ao verificar/inativar plano temporário:`, err);
      }
    }

    // ── Sincronizar subscription_status do perfil ──
    if (ourStatus === 'active' || ourStatus === 'cancelled') {
      try {
        const { error: profileErr } = await supabase
          .from('profiles')
          .update({ subscription_status: ourStatus === 'active' ? 'active' : 'none' })
          .eq('id', assinatura.user_id);
        if (profileErr) {
          console.error(`[Webhook MP] Erro ao atualizar perfil ${assinatura.user_id}:`, profileErr);
        }
      } catch {
        // Ignorar
      }
    }

    return true;
  } catch (err) {
    console.error(`[Webhook MP] Erro ao processar assinatura ${subscriptionId}:`, err);
    return false;
  }
}

/**
 * Busca assinatura local por (1) mercadopago_subscription_id, ou
 * (2) user_id + plano_id + status pending (fallback para init_point flow).
 */
async function findLocalSubscription(
  supabase: ReturnType<typeof createAdminClient>,
  mpSubscriptionId: string,
  payerEmail: string,
  externalReference: string
): Promise<{ id: string; user_id: string; plano_id: string; status: string; mercadopago_subscription_id: string | null } | null> {
  // 1. Buscar por mercadopago_subscription_id
  const { data: byMpId } = await supabase
    .from('assinaturas')
    .select('id, user_id, plano_id, status, mercadopago_subscription_id')
    .eq('mercadopago_subscription_id', mpSubscriptionId)
    .maybeSingle();

  if (byMpId) return byMpId;

  // 2. Fallback: buscar por external_reference (planoId) + payer_email + status pending
  if (!externalReference || !payerEmail) return null;

  // Buscar user_id pelo email no auth.users
  const admin = createAdminClient();
  let foundUserId: string | null = null;

  try {
    const { data: { users } } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1,
      // ⚠︎ See note in processPaymentEvent: SDK ignores `filter` at runtime.
      filter: `email.eq.${payerEmail}`,
    } as Parameters<typeof admin.auth.admin.listUsers>[0] & { filter: string });
    if (users && users.length > 0) {
      foundUserId = users[0].id;
    }
  } catch {
    return null;
  }

  if (!foundUserId) return null;

  const { data: byUser } = await supabase
    .from('assinaturas')
    .select('id, user_id, plano_id, status, mercadopago_subscription_id')
    .eq('user_id', foundUserId)
    .eq('plano_id', externalReference)
    .in('status', ['pending', 'paused'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return byUser || null;
}
