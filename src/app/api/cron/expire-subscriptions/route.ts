import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { timingSafeEqual } from 'crypto';

/**
 * GET /api/cron/expire-subscriptions
 *
 * Cron Job externo (cron-job.org) — executado uma vez por dia às 05:00 UTC.
 * Encontra assinaturas ativas cujo data_fim ja passou e as expira.
 * Tambem corrige perfis com subscription_status inconsistente.
 *
 * Segurança: acessível via ?secret= (cron-job.org) ou header Authorization.
 */
export async function GET(request: NextRequest) {
  // Verificação de autorização do cron (timing-safe)
  // Aceita header Authorization (Vercel Cron legado) ou ?secret= (cron-job.org)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const querySecret = request.nextUrl.searchParams.get('secret');
  const providedSecret = authHeader?.replace('Bearer ', '') || querySecret;

  // Timing-safe comparison para evitar timing attacks
  if (!cronSecret || !safeEqual(providedSecret || '', cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const agora = new Date();
    const agoraISO = agora.toISOString();
    const results = {
      expired: 0,
      profiles_updated: 0,
      errors: [] as string[],
    };

    // 1. Encontrar assinaturas ativas com data_fim no passado
    const { data: expiredSubs, error: fetchErr } = await supabase
      .from('assinaturas')
      .select('id, user_id, status, data_fim, plano:planos(nome)')
      .eq('status', 'active')
      .not('data_fim', 'is', null)
      .lte('data_fim', agoraISO);

    if (fetchErr) {
      console.error('[cron/expire] Erro ao buscar assinaturas:', fetchErr);
      return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
    }

    if (!expiredSubs || expiredSubs.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'Nenhuma assinatura para expirar.',
        ...results,
        checked_at: agoraISO,
      });
    }

    // 2. Expirar cada assinatura com CAS
    for (const sub of expiredSubs) {
      const auditoria = `Expirada automaticamente pelo cron em ${agoraISO}. Periodo contratado (${(sub.plano as unknown as Record<string, unknown>)?.nome || 'desconhecido'}) encerrado em ${sub.data_fim}.`;

      const { count, error: updateErr } = await supabase
        .from('assinaturas')
        .update({
          status: 'expired',
          motivo_cancelamento: auditoria,
          proximo_ciclo_em: null,
          updated_at: agoraISO,
        })
        .eq('id', sub.id)
        .eq('status', 'active'); // CAS

      if (updateErr) {
        results.errors.push(`Assinatura ${sub.id}: erro ao atualizar.`);
        console.error(`[cron/expire] Erro ao expirar assinatura ${sub.id}:`, updateErr);
        continue;
      }

      if (count && count > 0) {
        results.expired++;
        console.log(`[cron/expire] Assinatura ${sub.id} do usuario ${sub.user_id} expirada.`);
      }
    }

    // 3. Corrigir perfis inconsistentes
    //    Perfis com subscription_status='active' mas sem assinatura ativa no banco
    const { data: activeProfiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('subscription_status', 'active');

    if (activeProfiles && activeProfiles.length > 0) {
      // Buscar todos os user_ids com assinatura realmente ativa ou lifetime
      const { data: realActive } = await supabase
        .from('assinaturas')
        .select('user_id')
        .in('status', ['active', 'lifetime']);

      const activeUserIds = new Set(
        (realActive || []).map((a: Record<string, unknown>) => a.user_id as string)
      );

      // Perfis com subscription_status='lifetime'
      const { data: lifetimeProfiles } = await supabase
        .from('profiles')
        .select('id')
        .eq('subscription_status', 'lifetime');
      const lifetimeUserIds = new Set(
        (lifetimeProfiles || []).map((p: Record<string, unknown>) => p.id as string)
      );

      const profilesToFix = activeProfiles.filter(
        (p: Record<string, unknown>) =>
          !activeUserIds.has(p.id as string) && !lifetimeUserIds.has(p.id as string)
      );

      if (profilesToFix.length > 0) {
        const ids = profilesToFix.map((p: Record<string, unknown>) => p.id as string);
        const { error: fixErr } = await supabase
          .from('profiles')
          .update({ subscription_status: 'none' })
          .in('id', ids);

        if (!fixErr) {
          results.profiles_updated = ids.length;
        } else {
          results.errors.push('Erro ao corrigir perfis inconsistentes.');
          console.error('[cron/expire] Erro ao corrigir perfis:', fixErr);
        }
      }
    }

    console.log(
      `[cron/expire] Concluido: ${results.expired} expiradas, ${results.profiles_updated} perfis corrigidos.`
    );

    return NextResponse.json({
      ok: true,
      message: `${results.expired} assinatura(s) expirada(s), ${results.profiles_updated} perfil(is) corrigido(s).`,
      ...results,
      checked_at: agoraISO,
    });
  } catch (err) {
    console.error('[cron/expire] Erro geral:', err);
    // NAO revelar detalhes do erro em producao
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
