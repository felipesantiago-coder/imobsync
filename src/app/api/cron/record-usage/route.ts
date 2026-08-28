import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Cron: registra snapshot diário de uso do servidor.
 * Agrega dados de analytics_events e estima invocações serverless totais.
 *
 * Agendar no cron-job.org:
 *   GET https://quadra-imob-sync.vercel.app/api/cron/record-usage?secret=SEU_CRON_SECRET
 *   Frequência: 1x por dia (ex: 23:55 UTC)
 *
 * Fórmula de estimativa:
 *   invocações_totais ≈ eventos_analytics × 1.8
 *   (cada evento de analytics representa ~1 invocação de API,
 *    mas existem page renders, middleware runs, e outras rotas
 *    que não geram eventos de analytics — fator multiplicador empírico)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Data de hoje (UTC)
  const today = new Date().toISOString().slice(0, 10);

  // 1. Contar eventos de analytics do dia
  const { count: analyticsToday, error: err1 } = await admin
    .from("analytics_events")
    .select("*", { count: "exact", head: true })
    .gte("created_at", `${today}T00:00:00Z`)
    .lt("created_at", `${today}T23:59:59Z`);

  if (err1) {
    console.error("[record-usage] Erro ao contar analytics:", err1);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  // 2. Contar usuários únicos ativos hoje
  const { data: activeUsers } = await admin
    .from("analytics_events")
    .select("user_id")
    .gte("created_at", `${today}T00:00:00Z`)
    .lt("created_at", `${today}T23:59:59Z`);

  const uniqueUsers = new Set(
    (activeUsers || []).map((e: { user_id: string }) => e.user_id).filter(Boolean)
  ).size;

  // 3. Estimar invocações serverless totais
  // Fator: cada ação do usuário gera ~1 evento de analytics + ~0.8 invocações extras
  // (page renders, subscription refresh, middleware, etc.)
  const INVOCATION_MULTIPLIER = 1.8;
  const estimatedInvocations = Math.round(
    (analyticsToday || 0) * INVOCATION_MULTIPLIER
  );

  // 4. Buscar total do mês atual para projeção
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { count: analyticsThisMonth } = await admin
    .from("analytics_events")
    .select("*", { count: "exact", head: true })
    .gte("created_at", monthStart.toISOString());

  const dayOfMonth = new Date().getDate();
  const estimatedMonthlyInvocations = Math.round(
    ((analyticsThisMonth || 0) + (analyticsToday || 0)) * INVOCATION_MULTIPLIER
  );
  const projectedMonthly = Math.round(
    (estimatedMonthlyInvocations / dayOfMonth) * 30
  );

  // 5. Upsert snapshot do dia
  const { error: upsertErr } = await admin
    .from("daily_usage_metrics")
    .upsert(
      {
        date: today,
        analytics_events: analyticsToday || 0,
        unique_users: uniqueUsers,
        estimated_invocations: estimatedInvocations,
        month_to_date_invocations: estimatedMonthlyInvocations,
        projected_monthly_invocations: projectedMonthly,
      },
      { onConflict: "date" }
    );

  if (upsertErr) {
    console.error("[record-usage] Erro ao upsert:", upsertErr);
    return NextResponse.json(
      {
        error: "Tabela daily_usage_metrics não encontrada. Execute o SQL de criação no Supabase.",
        sql_needed: true,
      },
      { status: 500 }
    );
  }

  // 6. Calcular percentual do limite Hobby
  const HOBBY_LIMIT = 100_000;
  const usagePercent = Math.round((projectedMonthly / HOBBY_LIMIT) * 100);
  const shouldUpgrade = projectedMonthly > HOBBY_LIMIT * 0.8;

  return NextResponse.json({
    date: today,
    analytics_events_today: analyticsToday,
    unique_users_today: uniqueUsers,
    estimated_invocations_today: estimatedInvocations,
    month_to_date: estimatedMonthlyInvocations,
    projected_monthly: projectedMonthly,
    hobby_limit: HOBBY_LIMIT,
    usage_percent: `${usagePercent}%`,
    status: shouldUpgrade
      ? "WARNING - proximidade do limite Hobby"
      : usagePercent > 50
        ? "ATTENTION - crescendo"
        : "OK",
  });
}
