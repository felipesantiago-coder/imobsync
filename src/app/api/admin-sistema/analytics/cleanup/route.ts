import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// ── Retention Policies ──
const ANALYTICS_RETENTION_DAYS = 90;
const STATUS_HISTORY_RETENTION_DAYS = 365;
const LOGIN_EVENTS_RETENTION_DAYS = 365;
const WEBHOOK_EVENTS_RETENTION_DAYS = 30;

/**
 * POST /api/admin-sistema/analytics/cleanup
 *
 * Limpeza de dados antigos com retention policy.
 * Chamado pelo admin-sistema ou por cron-job.org.
 *
 * Autenticação:
 *   - Via query param ?token=CLEANUP_SECRET (para cron-job.org)
 *   - Via sessão de usuário admin_sistema (para chamada via admin panel)
 */
export async function POST(request: NextRequest) {
  const results: Record<string, { deleted: number; error?: string }> = {};

  // ── Autenticação: token de cron OU sessão admin ──
  const token = new URL(request.url).searchParams.get("token");
  const expectedToken = process.env.CLEANUP_SECRET;

  if (expectedToken && token === expectedToken) {
    // Autenticado via cron token — prosseguir
  } else {
    // Tentar autenticação via sessão
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    // Verificar se é admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if ((profile as Record<string, unknown> | null)?.role !== "admin_sistema") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }
  }

  const admin = createAdminClient();
  const now = new Date();

  // ── 1. Limpar analytics_events (90 dias) ──
  try {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - ANALYTICS_RETENTION_DAYS);

    const { count, error } = await admin
      .from("analytics_events")
      .delete()
      .lt("created_at", cutoff.toISOString());

    results.analytics_events = {
      deleted: count || 0,
      ...(error ? { error: error.message } : {}),
    };
  } catch (err: unknown) {
    results.analytics_events = {
      deleted: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // ── 2. Limpar unit_status_history (1 ano) ──
  try {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - STATUS_HISTORY_RETENTION_DAYS);

    const { count, error } = await admin
      .from("unit_status_history")
      .delete()
      .lt("created_at", cutoff.toISOString());

    results.unit_status_history = {
      deleted: count || 0,
      ...(error ? { error: error.message } : {}),
    };
  } catch (err: unknown) {
    results.unit_status_history = {
      deleted: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // ── 3. Limpar user_login_events (1 ano) ──
  try {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - LOGIN_EVENTS_RETENTION_DAYS);

    const { count, error } = await admin
      .from("user_login_events")
      .delete()
      .lt("created_at", cutoff.toISOString());

    results.user_login_events = {
      deleted: count || 0,
      ...(error ? { error: error.message } : {}),
    };
  } catch (err: unknown) {
    results.user_login_events = {
      deleted: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // ── 4. Limpar webhook_events (30 dias) ──
  try {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - WEBHOOK_EVENTS_RETENTION_DAYS);

    const { count, error } = await admin
      .from("webhook_events")
      .delete()
      .lt("created_at", cutoff.toISOString());

    results.webhook_events = {
      deleted: count || 0,
      ...(error ? { error: error.message } : {}),
    };
  } catch (err: unknown) {
    results.webhook_events = {
      deleted: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const totalDeleted = Object.values(results).reduce(
    (sum, r) => sum + r.deleted,
    0
  );
  const hasErrors = Object.values(results).some((r) => r.error);

  console.log(
    `[analytics-cleanup] Concluído: ${totalDeleted} registros removidos.`,
    results
  );

  return NextResponse.json({
    ok: !hasErrors,
    timestamp: now.toISOString(),
    retention_days: {
      analytics_events: ANALYTICS_RETENTION_DAYS,
      unit_status_history: STATUS_HISTORY_RETENTION_DAYS,
      user_login_events: LOGIN_EVENTS_RETENTION_DAYS,
      webhook_events: WEBHOOK_EVENTS_RETENTION_DAYS,
    },
    results,
    total_deleted: totalDeleted,
  });
}
