import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { timingSafeEqual } from "crypto";
import { withRetry } from "@/lib/cron-retry";
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
 *
 * Hardenização (2026-09-12, mesmo padrão do reconcile-mp/expire-subscriptions):
 *  - Todas as leituras e o upsert rodam com retry curto (2 tentativas extras,
 *    backoff 500ms/1s) para absorver blips transitorios de rede/Supabase.
 *  - FAIL-SAFE: nenhuma leitura pode falhar silenciosamente. Antes, o erro da
 *    leitura de user_id nem era capturado — falha virava `unique_users=0`
 *    falso gravado no snapshot. Agora qualquer leitura que falhe (após
 *    esgotar o retry) aborta ANTES do upsert: nenhum snapshot é gravado com
 *    dados incompletos.
 *  - Motivo do erro incluído na resposta 500 (até 160 chars, rota protegida
 *    por secret). A dica `sql_needed` só aparece quando o erro indica relação
 *    ausente (antes afirmava "tabela não encontrada" para qualquer falha).
 *  - Upsert idempotente (onConflict: date): re-executar sobrescreve o mesmo dia.
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

/**
 * Retry curto padrão dos crons (2 tentativas extras, backoff 500ms/1s) com
 * log por tentativa. `fn` deve lançar em falha (padrão throw).
 */
async function dbRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return withRetry(fn, {
    retries: 2,
    baseDelayMs: 500,
    onRetry: (attempt, err) =>
      console.warn(
        `[cron/record-usage] ${label} falhou (retry ${attempt}):`,
        err instanceof Error ? err.message : err
      ),
  });
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

  try {
    // Datas em UTC explícito
    const now = new Date();
    const today = utcTodayStr(now);
    const dayWindow = utcDayWindow(today);

    // 1. Contar eventos de analytics do dia: [00:00Z, 00:00Z do dia seguinte)
    const analyticsToday = await dbRetry("Contagem de eventos do dia", async () => {
      const { count, error } = await admin
        .from("analytics_events")
        .select("*", { count: "exact", head: true })
        .gte("created_at", dayWindow.gte)
        .lt("created_at", dayWindow.lt);
      if (error) throw new Error(`Supabase: ${error.message}`);
      return count || 0;
    });

    // 2. Contar usuários únicos ativos hoje (mesma janela do dia)
    //    FAIL-SAFE: erro aqui antes virava unique_users=0 falso no snapshot.
    const activeUsers = await dbRetry("Leitura de usuários do dia", async () => {
      const { data, error } = await admin
        .from("analytics_events")
        .select("user_id")
        .gte("created_at", dayWindow.gte)
        .lt("created_at", dayWindow.lt);
      if (error) throw new Error(`Supabase: ${error.message}`);
      return data || [];
    });

    const uniqueUsers = new Set(
      activeUsers.map((e: { user_id: string }) => e.user_id).filter(Boolean)
    ).size;

    // 3. Estimar invocações serverless do dia (estimativa, não medição)
    const INVOCATION_MULTIPLIER = 1.8;
    const estimatedInvocations = Math.round(analyticsToday * INVOCATION_MULTIPLIER);

    // 4. Mês corrente: [início do mês, agora) — inclui hoje; não somar de novo
    const monthStart = utcMonthStartIso(now);
    const analyticsThisMonth = await dbRetry("Contagem de eventos do mês", async () => {
      const { count, error } = await admin
        .from("analytics_events")
        .select("*", { count: "exact", head: true })
        .gte("created_at", monthStart);
      if (error) throw new Error(`Supabase: ${error.message}`);
      return count || 0;
    });

    const estimatedMonthlyInvocations = Math.round(analyticsThisMonth * INVOCATION_MULTIPLIER);

    // Projeção com número real de dias do mês (UTC explícito)
    const dayOfMonth = utcDayOfMonth(now);
    const totalDaysInMonth = daysInUtcMonth(now);
    const projectedMonthly = projectMonthlyFromMtd(
      estimatedMonthlyInvocations,
      dayOfMonth,
      totalDaysInMonth
    );

    // 5. Upsert snapshot do dia (idempotente por onConflict: date)
    try {
      await dbRetry("Upsert do snapshot", async () => {
        const { error } = await admin
          .from("daily_usage_metrics")
          .upsert(
            {
              date: today,
              analytics_events: analyticsToday,
              unique_users: uniqueUsers,
              estimated_invocations: estimatedInvocations,
              month_to_date_invocations: estimatedMonthlyInvocations,
              projected_monthly_invocations: projectedMonthly,
            },
            { onConflict: "date" }
          );
        if (error) throw new Error(`Supabase: ${error.message}`);
      });
    } catch (upsertErr) {
      const msg = upsertErr instanceof Error ? upsertErr.message : String(upsertErr);
      console.error("[cron/record-usage] Erro ao gravar snapshot:", upsertErr);
      // Dica de SQL apenas quando o erro indica relação ausente — antes a
      // mensagem afirmava "tabela não encontrada" para QUALQUER falha de escrita.
      const missingTable = /does not exist|42P01|schema cache|relation/i.test(msg);
      return NextResponse.json(
        {
          error: `Falha ao gravar snapshot em daily_usage_metrics: ${msg.slice(0, 160)}`,
          ...(missingTable
            ? { sql_needed: true, hint: "Execute o SQL de criação da tabela no Supabase." }
            : {}),
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
  } catch (err) {
    console.error("[cron/record-usage] Erro geral:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Falha no snapshot de uso: ${msg.slice(0, 160)}` },
      { status: 500 }
    );
  }
}
