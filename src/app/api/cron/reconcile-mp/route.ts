import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMpSubscription } from '@/lib/mercadopago';
import { withRetry } from '@/lib/cron-retry';
import { timingSafeEqual } from 'crypto';

/**
 * GET /api/cron/reconcile-mp
 *
 * Cron Job externo (cron-job.org) — executado uma vez por dia.
 * Compara o status das assinaturas locais com o status no Mercado Pago.
 * Detecta:
 *  - Assinaturas locais 'active' mas canceladas/pausadas no MP
 *  - Assinaturas locais 'active' com preapproval que não existe mais no MP
 *  - Assinaturas locais 'active' mas com data_fim ja passou
 *
 * Segurança: acessível via ?secret= (cron-job.org) ou header Authorization.
 *
 * Hardenização (2026-09-12, pós-incidente de 500 intermitente no cron):
 *  - Query inicial com retry curto (2 tentativas extras, backoff 500ms/1s)
 *    para absorver blips transitorios de rede/Supabase.
 *  - IDs vazios do MP tambem sao ignorados (alem de null).
 *  - Falha parcial (qualquer item em errors) responde 500 — assim o
 *    cron-job.org marca a execucao como falha, retenta e notifica.
 *    A reconciliacao e idempotente: re-executar e seguro.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const querySecret = request.nextUrl.searchParams.get('secret');
  const providedSecret = authHeader?.replace('Bearer ', '') || querySecret;

  if (!cronSecret || !safeEqual(providedSecret || '', cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
    return NextResponse.json({ error: 'MP not configured.' }, { status: 503 });
  }

  try {
    const supabase = createAdminClient();
    const agora = new Date();
    const agoraISO = agora.toISOString();
    const results = {
      checked: 0,
      synced_cancelled: 0,
      synced_paused: 0,
      synced_missing: 0,
      synced_expired: 0,
      errors: [] as string[],
    };

    // Buscar todas as assinaturas locais ativas que tem ID no MP.
    // Filtro duplo: descarta null E string vazia (ID vazio geraria chamada
    // inutil ao MP que viraria erro e, agora, falha parcial -> 500).
    // Query com retry curto — blips transitorios de rede/Supabase causaram
    // 500 intermitente no cron (worklog: investigate-cron-reconcile-500).
    const activeSubs = await withRetry(
      async () => {
        const { data, error } = await supabase
          .from('assinaturas')
          .select('id, user_id, mercadopago_subscription_id, status, data_fim')
          .eq('status', 'active')
          .not('mercadopago_subscription_id', 'is', null)
          .neq('mercadopago_subscription_id', '');
        if (error) throw new Error(`Supabase: ${error.message}`);
        return data || [];
      },
      {
        retries: 2,
        baseDelayMs: 500,
        onRetry: (attempt, err) =>
          console.warn(
            `[cron/reconcile-mp] Query inicial falhou (retry ${attempt}):`,
            err instanceof Error ? err.message : err
          ),
      }
    );

    if (activeSubs.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'Nenhuma assinatura ativa com ID do MP para reconciliar.',
        ...results,
        checked_at: agoraISO,
      });
    }

    for (const sub of activeSubs) {
      results.checked++;
      const mpId = sub.mercadopago_subscription_id as string;

      try {
        const mpSub = await getMpSubscription(mpId) as unknown as Record<string, unknown>;
        const mpStatus = mpSub?.status as string;

        // Mapear status MP -> nosso status
        const statusMap: Record<string, string> = {
          cancelled: 'cancelled',
          paused: 'paused',
          // authorized/active = consistente, não precisa mudar
        };

        const newStatus = statusMap[mpStatus];

        if (newStatus) {
          const auditoria = `Reconciliado com Mercado Pago (status MP: ${mpStatus}) em ${agoraISO}.`;

          const { count, error: updateErr } = await supabase
            .from('assinaturas')
            .update({
              status: newStatus,
              motivo_cancelamento: newStatus === 'cancelled' ? auditoria : undefined,
              cancelado_em: newStatus === 'cancelled' ? agoraISO : undefined,
              proximo_ciclo_em: null,
              updated_at: agoraISO,
            })
            .eq('id', sub.id)
            .eq('status', 'active'); // CAS

          if (updateErr) {
            results.errors.push(`Sub ${sub.id}: erro ao atualizar: ${updateErr.message.slice(0, 160)}`);
            console.error(`[cron/reconcile-mp] Erro ao atualizar assinatura ${sub.id}:`, updateErr);
          } else if (count && count > 0) {
            if (newStatus === 'cancelled') results.synced_cancelled++;
            if (newStatus === 'paused') results.synced_paused++;

            const { error: profileErr } = await supabase
              .from('profiles')
              .update({ subscription_status: 'none' })
              .eq('id', sub.user_id);
            if (profileErr) {
              results.errors.push(`Sub ${sub.id}: falha ao zerar subscription_status do perfil ${sub.user_id}.`);
              console.error(`[cron/reconcile-mp] Erro ao atualizar perfil ${sub.user_id}:`, profileErr);
            }

            console.log(
              `[cron/reconcile-mp] Assinatura ${sub.id} atualizada: active -> ${newStatus} (MP: ${mpStatus})`
            );
          }
        }

        // Verificar data_fim localmente mesmo se MP diz active
        // (caso o cron de expiração ainda não rodou)
        if (!newStatus && sub.data_fim && new Date(sub.data_fim) <= agora) {
          const auditoria = `Expirada durante reconciliacao MP em ${agoraISO}. data_fim=${sub.data_fim}.`;

          const { count, error: updateErr } = await supabase
            .from('assinaturas')
            .update({
              status: 'expired',
              motivo_cancelamento: auditoria,
              proximo_ciclo_em: null,
              updated_at: agoraISO,
            })
            .eq('id', sub.id)
            .eq('status', 'active');

          if (updateErr) {
            results.errors.push(`Sub ${sub.id}: erro ao expirar (data_fim): ${updateErr.message.slice(0, 160)}`);
            console.error(`[cron/reconcile-mp] Erro ao expirar assinatura ${sub.id}:`, updateErr);
          } else if (count && count > 0) {
            results.synced_expired++;
            const { error: profileErr } = await supabase
              .from('profiles')
              .update({ subscription_status: 'none' })
              .eq('id', sub.user_id);
            if (profileErr) {
              results.errors.push(`Sub ${sub.id}: falha ao zerar subscription_status do perfil ${sub.user_id}.`);
              console.error(`[cron/reconcile-mp] Erro ao atualizar perfil ${sub.user_id}:`, profileErr);
            }

            console.log(`[cron/reconcile-mp] Assinatura ${sub.id} expirada (data_fim passou).`);
          }
        }
      } catch (mpErr: unknown) {
        const errMsg = mpErr instanceof Error ? mpErr.message : String(mpErr);

        // Detectar 404 de forma mais confiavel: status HTTP no erro
        const is404 =
          errMsg.includes('404') ||
          errMsg.includes('not_found') ||
          errMsg.includes('Not found') ||
          errMsg.includes('NOT_FOUND');

        if (is404) {
          console.warn(`[cron/reconcile-mp] Assinatura ${mpId} nao existe mais no MP.`);

          const { count, error: updateErr } = await supabase
            .from('assinaturas')
            .update({
              status: 'cancelled',
              motivo_cancelamento: `Preapproval ${mpId} nao existe mais no Mercado Pago (reconciliacao em ${agoraISO}).`,
              cancelado_em: agoraISO,
              proximo_ciclo_em: null,
              updated_at: agoraISO,
            })
            .eq('id', sub.id)
            .eq('status', 'active');

          if (updateErr) {
            results.errors.push(`Sub ${sub.id}: erro ao cancelar (preapproval ausente no MP): ${updateErr.message.slice(0, 160)}`);
            console.error(`[cron/reconcile-mp] Erro ao atualizar assinatura ${sub.id} (404 MP):`, updateErr);
          } else if (count && count > 0) {
            results.synced_missing++;
            const { error: profileErr } = await supabase
              .from('profiles')
              .update({ subscription_status: 'none' })
              .eq('id', sub.user_id);
            if (profileErr) {
              results.errors.push(`Sub ${sub.id}: falha ao zerar subscription_status do perfil ${sub.user_id}.`);
              console.error(`[cron/reconcile-mp] Erro ao atualizar perfil ${sub.user_id}:`, profileErr);
            }
          }
        } else {
          results.errors.push(`Sub ${sub.id}: erro ao verificar no MP: ${errMsg.slice(0, 160)}`);
          console.error(`[cron/reconcile-mp] Erro ao verificar assinatura ${sub.id} no MP:`, errMsg);
        }
      }

      // Rate limit: esperar 200ms entre chamadas ao MP
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const summaryLog = `[cron/reconcile-mp] Concluido: ${results.checked} verificadas, ${results.synced_cancelled} canceladas, ${results.synced_paused} pausadas, ${results.synced_missing} removidas do MP, ${results.synced_expired} expiradas por data_fim, ${results.errors.length} erro(s).`;

    // Falha parcial -> 500 para o cron-job.org marcar como falha (retenta/notifica).
    // Reconciliacao idempotente: re-execucao reavalia apenas o que seguir 'active'.
    if (results.errors.length > 0) {
      console.error(summaryLog);
      return NextResponse.json(
        {
          ok: false,
          error: `Reconciliacao concluida com ${results.errors.length} erro(s) em ${results.checked} verificadas.`,
          ...results,
          checked_at: agoraISO,
        },
        { status: 500 }
      );
    }

    console.log(summaryLog);

    return NextResponse.json({
      ok: true,
      message: `Reconciliacao concluida: ${results.checked} verificadas.`,
      ...results,
      checked_at: agoraISO,
    });
  } catch (err) {
    console.error('[cron/reconcile-mp] Erro geral:', err);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}

/**
 * Timing-safe comparison para evitar timing attacks.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  try {
    return timingSafeEqual(encoder.encode(a), encoder.encode(b));
  } catch {
    return false;
  }
}
