import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { timingSafeEqual } from "crypto";
import {
  daysInUtcMonth,
  projectMonthlyFromMtd,
  utcDayOfMonth,
  utcDayWindow,
  utcMonthStartIso,
  utcTodayStr,
} from "@/lib/usage-window";

export const dynamic = "force-dynamic";

/**
 * Cron: registra snapshot diário de uso do servidor.
 * Agrega dados de analytics_events e ESTIMA invocações serverless totais.
 *
 * Agendar no cron-job.org (agendamento existente, não criar job duplicado):
 *   GET https://quadra-imob-sync.vercel.app/api/cron/record-usage?secret=SEU_CRON_SECRET
 *   Frequência: 1x por dia (ex: 23:55 UTC)
 *
 * Autenticação: exige CRON_SECRET configurado. Aceita `?secret=` (compatível
 * com o agendamento atual) ou header `Authorization: Bearer <secret>`.
 * Se CRON_SECRET não estiver configurado no servidor, a execução é NEGADA.
 *
 * ⚠️ LIMITAÇÕES DE MEDIÇÃO (honestidade dos números):
 * - `estimated_invocations` é ESTIMATIVA (analytics_events × 1.8), não medição
 *   da Vercel. O fator 1.8 é empírico e não mede bytes, CPU, memória ou
 *   transformações de imagem.
 * - Functions Storage NÃO é coletado aqui: medir pela fonte oficial
 *   (Painel Vercel → Usage → Storage → Functions, com projeto/período).
 *
 * Janelas de tempo: UTC explícito, início inclusivo e fim exclusivo.
 * A contagem do mês usa [início do mês, agora) — já inclui o dia corrente,
 * portanto o dia NUNCA é somado duas vezes.
 */
async function isAuthorized(request: NextRequest): Promise<boolean> {
  const expectedSecret = process.env.CRON_SECRET;
  // Negar execução se o segredo esperado estiver ausente: comparar dois
  // buffers vazios NÃO constitui autorização.
  if (!expectedSecret) return false;

  let provided = request.nextUrl.searchParams.get("secret");
  if (!provided) {
    const header = request.headers.get("authorization");
    if (header?.startsWith("Bearer ")) provided = header.slice(7);
  }
  if (!provided) return false;

  const expected = Buffer.from(expectedSecret, "utf8");
  const actual = Buffer.from(provided, "utf8");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    const denied = !process.env.CRON_SECRET;
    return NextResponse.json(
      {
        error: denied
          ? "CRON_SECRET não configurado no servidor — execução do cron negada"
          : "Unauthorized",
      },
      { status: denied ? 503 : 401 }
    );
  }

  const admin = createAdminClient();

  // Datas em UTC explícito
  const now = new Date();
  const today = utcTodayStr(now);
  const dayWindow = utcDayWindow(today);

  // 1. Contar eventos de analytics do dia: [00:00Z, 00:00Z do dia seguinte)
  const { count: analyticsToday, error: err1 } = await admin
    .from("analytics_events")
    .select("*", { count: "exact", head: true })
    .gte("created_at", dayWindow.gte)
    .lt("created_at", dayWindow.lt);

  if (err1) {
    console.error("[record-usage] Erro ao contar analytics:", err1);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  // 2. Contar usuários únicos ativos hoje (mesma janela do dia)
  const { data: activeUsers } = await admin
    .from("analytics_events")
    .select("user_id")
    .gte("created_at", dayWindow.gte)
    .lt("created_at", dayWindow.lt);

  const uniqueUsers = new Set(
    (activeUsers || []).map((e: { user_id: string }) => e.user_id).filter(Boolean)
  ).size;

  // 3. Estimar invocações serverless do dia (estimativa, não medição)
  const INVOCATION_MULTIPLIER = 1.8;
  const estimatedInvocations = Math.round(
    (analyticsToday || 0) * INVOCATION_MULTIPLIER
  );

  // 4. Mês corrente: [início do mês, agora) — inclui hoje; não somar de novo
  const monthStart = utcMonthStartIso(now);
  const { count: analyticsThisMonth, error: errMonth } = await admin
    .from("analytics_events")
    .select("*", { count: "exact", head: true })
    .gte("created_at", monthStart);

  if (errMonth) {
    console.error("[record-usage] Erro ao contar analytics do mês:", errMonth);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  const estimatedMonthlyInvocations = Math.round(
    (analyticsThisMonth || 0) * INVOCATION_MULTIPLIER
  );

  // Projeção com número real de dias do mês (UTC explícito)
  const dayOfMonth = utcDayOfMonth(now);
  const totalDaysInMonth = daysInUtcMonth(now);
  const projectedMonthly = projectMonthlyFromMtd(
    estimatedMonthlyInvocations,
    dayOfMonth,
    totalDaysInMonth
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

  // 6. Percentual do limite configurado da conta.
  //    Limite configurável via USAGE_INVOCATIONS_LIMIT. O padrão de 1.000.000
  //    reflete a franquia exibida na captura de 11/09/2026 — CONFIRMAR na conta.
  const limitRaw = Number(process.env.USAGE_INVOCATIONS_LIMIT);
  const usageLimit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 1_000_000;
  const limitSource = Number.isFinite(limitRaw) && limitRaw > 0 ? "env" : "default (confirmar na conta)";
  const usagePercent = Math.round((projectedMonthly / usageLimit) * 100);
  const shouldUpgrade = projectedMonthly > usageLimit * 0.8;

  return NextResponse.json({
    date: today,
    timezone: "UTC",
    analytics_events_today: analyticsToday,
    unique_users_today: uniqueUsers,
    estimated_invocations_today: estimatedInvocations,
    month_to_date: estimatedMonthlyInvocations,
    projected_monthly: projectedMonthly,
    month_days_total: totalDaysInMonth,
    usage_limit: usageLimit,
    usage_limit_source: limitSource,
    estimate_method: "analytics_events × 1.8 (estimativa interna, não é medição da Vercel)",
    functions_storage: "não coletado — medir em Vercel Usage → Storage → Functions",
    usage_percent: `${usagePercent}%`,
    status: shouldUpgrade
      ? "WARNING - proximidade do limite configurado"
      : usagePercent > 50
        ? "ATTENTION - crescendo"
        : "OK",
  });
}
