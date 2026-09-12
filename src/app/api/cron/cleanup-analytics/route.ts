import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { withRetry } from '@/lib/cron-retry';

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
 *
 * Hardenização (2026-09-12, mesmo padrão do reconcile-mp/expire-subscriptions):
 *  - Cada DELETE roda com retry curto (2 tentativas extras, backoff 500ms/1s)
 *    para absorver blips transitorios de rede/Supabase.
 *  - Erros de DELETE deixam de ser descartados (antes `{ count }` nem capturava
 *    `error` — falha virava zero silencioso); agora cada falha final é
 *    registrada em errors[] com motivo (até 160 chars, rota protegida por secret).
 *  - `results` agora reporta contagem real: `.delete({ count: 'exact' })` —
 *    sem a opção, o count vinha sempre vazio e `results` exibia 0 fictício.
 *  - Falha parcial (qualquer item em errors) responde 500 — o cron-job.org
 *    marca a execução como falha, retenta e notifica. Os DELETEs são
 *    idempotentes (created_at < cutoff): re-executar é seguro.
 *  - Uma tabela com falha definitiva não aborta as demais (visibilidade
 *    completa do estado de cada tabela na resposta).
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
    const errors: string[] = [];

    // DELETE de uma tabela com retry curto. Falha definitiva não aborta as
    // tabelas seguintes: fica registrada em errors[] e a rota responde 500
    // no fim. DELETE idempotente por cutoff (created_at < limite).
    const purgeTable = async (name: string, table: string, cutoff: Date) => {
      try {
        const { count } = await withRetry(
          async () => {
            const res = await admin
              .from(table)
              .delete({ count: 'exact' })
              .lt('created_at', cutoff.toISOString());
            if (res.error) throw new Error(`Supabase: ${res.error.message}`);
            return res;
          },
          {
            retries: 2,
            baseDelayMs: 500,
            onRetry: (attempt, err) =>
              console.warn(
                `[cron/cleanup-analytics] DELETE ${table} falhou (retry ${attempt}):`,
                err instanceof Error ? err.message : err
              ),
          }
        );
        results[name] = count || 0;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${name}: ${msg.slice(0, 160)}`);
        console.error(`[cron/cleanup-analytics] Erro ao limpar ${name} (${table}):`, err);
      }
    };

    // 1. analytics_events — 90 dias
    const analyticsCutoff = new Date(now);
    analyticsCutoff.setDate(analyticsCutoff.getDate() - 90);
    await purgeTable('analytics_events_90d', 'analytics_events', analyticsCutoff);

    // 2. unit_status_history — 1 ano
    const statusCutoff = new Date(now);
    statusCutoff.setDate(statusCutoff.getDate() - 365);
    await purgeTable('unit_status_history_1y', 'unit_status_history', statusCutoff);

    // 3. user_login_events — 1 ano
    const loginCutoff = new Date(now);
    loginCutoff.setDate(loginCutoff.getDate() - 365);
    await purgeTable('user_login_events_1y', 'user_login_events', loginCutoff);

    // 4. webhook_events — 30 dias
    const webhookCutoff = new Date(now);
    webhookCutoff.setDate(webhookCutoff.getDate() - 30);
    await purgeTable('webhook_events_30d', 'webhook_events', webhookCutoff);

    const total = Object.values(results).reduce((a, b) => a + b, 0);
    const summary = `[cron/cleanup-analytics] Concluído: ${total} registros removidos, ${errors.length} erro(s).`;

    // Falha parcial -> 500 para o cron-job.org marcar como falha (retenta/notifica).
    // Idempotente: re-execução deleta novamente apenas o que seguir acima do cutoff.
    if (errors.length > 0) {
      console.error(summary, { errors });
      return NextResponse.json(
        {
          ok: false,
          error: `Limpeza concluída com ${errors.length} erro(s) em 4 tabelas.`,
          results,
          errors,
          checked_at: now.toISOString(),
        },
        { status: 500 }
      );
    }

    console.log(summary, results);

    return NextResponse.json({
      ok: true,
      message: `${total} registro(s) removido(s) com retention policy.`,
      results,
      errors,
      checked_at: now.toISOString(),
    });
  } catch (err) {
    console.error('[cron/cleanup-analytics] Erro geral:', err);
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
