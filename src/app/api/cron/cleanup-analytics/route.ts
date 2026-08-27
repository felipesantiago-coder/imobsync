import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

/**
 * GET /api/cron/cleanup-analytics
 *
 * Cron Job externo (cron-job.org) — executado uma vez por dia às 06:00 UTC.
 * Remove registros antigos de analytics com retention policy:
 *   - analytics_events: 90 dias
 *   - unit_status_history: 1 ano
 *   - user_login_events: 1 ano
 *   - webhook_events: 30 dias
 *
 * Segurança: acessível via ?secret= (cron-job.org) ou header Authorization.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const querySecret = request.nextUrl.searchParams.get('secret');
  const providedSecret = authHeader?.replace('Bearer ', '') || querySecret;

  if (!cronSecret || !safeEqual(providedSecret || '', cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();
    const now = new Date();
    const results: Record<string, number> = {};

    // 1. analytics_events — 90 dias
    const analyticsCutoff = new Date(now);
    analyticsCutoff.setDate(analyticsCutoff.getDate() - 90);
    const { count: analyticsCount } = await admin
      .from('analytics_events')
      .delete()
      .lt('created_at', analyticsCutoff.toISOString());
    results.analytics_events_90d = analyticsCount || 0;

    // 2. unit_status_history — 1 ano
    const statusCutoff = new Date(now);
    statusCutoff.setDate(statusCutoff.getDate() - 365);
    const { count: statusCount } = await admin
      .from('unit_status_history')
      .delete()
      .lt('created_at', statusCutoff.toISOString());
    results.unit_status_history_1y = statusCount || 0;

    // 3. user_login_events — 1 ano
    const loginCutoff = new Date(now);
    loginCutoff.setDate(loginCutoff.getDate() - 365);
    const { count: loginCount } = await admin
      .from('user_login_events')
      .delete()
      .lt('created_at', loginCutoff.toISOString());
    results.user_login_events_1y = loginCount || 0;

    // 4. webhook_events — 30 dias
    const webhookCutoff = new Date(now);
    webhookCutoff.setDate(webhookCutoff.getDate() - 30);
    const { count: webhookCount } = await admin
      .from('webhook_events')
      .delete()
      .lt('created_at', webhookCutoff.toISOString());
    results.webhook_events_30d = webhookCount || 0;

    const total = Object.values(results).reduce((a, b) => a + b, 0);

    console.log(
      `[cron/cleanup-analytics] Concluído: ${total} registros removidos.`,
      results
    );

    return NextResponse.json({
      ok: true,
      message: `${total} registro(s) removido(s) com retention policy.`,
      results,
      checked_at: now.toISOString(),
    });
  } catch (err) {
    console.error('[cron/cleanup-analytics] Erro:', err);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  try {
    return timingSafeEqual(encoder.encode(a), encoder.encode(b));
  } catch {
    return false;
  }
}
