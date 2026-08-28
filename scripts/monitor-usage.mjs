#!/usr/bin/env node

/**
 * ImobSync — Monitor de Uso Serverless (Vercel Hobby)
 *
 * Consulta API do Vercel (dados reais) + Supabase (analytics do app)
 * e cruza os dados para projetar quando o limite Hobby será atingido.
 *
 * Uso:
 *   node scripts/monitor-usage.mjs
 *
 * Pré-requisitos:
 *   - Node.js 18+
 *   - @supabase/supabase-js instalado (npm install @supabase/supabase-js)
 *
 * Variáveis de ambiente (.env.local ou export):
 *   VERCEL_TOKEN              — Token de API do Vercel (Read Only)
 *   NEXT_PUBLIC_SUPABASE_URL  — URL do projeto Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key do Supabase
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Configuração ──────────────────────────────────────────────

const HOBBY_LIMIT = 100_000;
const PRO_LIMIT = 1_000_000;

// ── Cores para terminal ──────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

function log(label, value, color = "") {
  console.log(`  ${c.gray}│${c.reset} ${c.bold}${label}:${c.reset} ${color}${value}${c.reset}`);
}

// ── 0. Carregar .env.local ────────────────────────────────────

try {
  const envPath = resolve(process.cwd(), ".env.local");
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // .env.local não encontrado — usar variáveis do sistema
}

// ── 1. Buscar dados reais do Vercel ───────────────────────────

async function fetchVercelUsage() {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    console.log(
      `  ${c.yellow}⚠ VERCEL_TOKEN não configurado — pulando dados reais do Vercel${c.reset}`
    );
    console.log(`  ${c.gray}  Para dados reais, crie um token em:${c.reset}`);
    console.log(`  ${c.cyan}  https://vercel.com/account/tokens${c.reset}`);
    console.log(`  ${c.gray}  Escopo: Read Only  |  Adicione ao .env.local:${c.reset}`);
    console.log(`  ${c.gray}  VERCEL_TOKEN=seu_token_aqui${c.reset}`);
    return null;
  }

  try {
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    // Tentar /v2/usage (disponível na API pública)
 const res = await fetch("https://api.vercel.com/v2/usage", { headers });
    let usageData = null;
    if (res.ok) {
      usageData = await res.json();
    }

    return { raw: usageData };
  } catch (err) {
    console.log(
      `  ${c.yellow}⚠ Erro ao buscar dados do Vercel: ${err.message}${c.reset}`
    );
    return null;
  }
}

// ── 2. Buscar dados do Supabase ──────────────────────────────

async function fetchSupabaseMetrics() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.log(
      `  ${c.yellow}⚠ Supabase não configurado — usando apenas estimativas${c.reset}`
    );
    return null;
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Tentar daily_usage_metrics primeiro
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: dailyMetrics, error } = await supabase
    .from("daily_usage_metrics")
    .select("*")
    .gte("date", thirtyDaysAgo.toISOString().slice(0, 10))
    .order("date", { ascending: false });

  if (!error && dailyMetrics && dailyMetrics.length > 0) {
    return { source: "daily_usage_metrics", data: dailyMetrics };
  }

  // Fallback: buscar de analytics_events diretamente
  return await fetchFromAnalyticsEvents(supabase);
}

async function fetchFromAnalyticsEvents(supabase) {
  const periods = [
    { label: "7d", days: 7 },
    { label: "14d", days: 14 },
    { label: "30d", days: 30 },
  ];

  const results = {};
  for (const p of periods) {
    const since = new Date();
    since.setDate(since.getDate() - p.days);

    const { count } = await supabase
      .from("analytics_events")
      .select("*", { count: "exact", head: true })
      .gte("created_at", since.toISOString());

    const { data: events } = await supabase
      .from("analytics_events")
      .select("user_id, created_at")
      .gte("created_at", since.toISOString());

    const uniqueUsers = new Set(
      (events || []).map((e) => e.user_id).filter(Boolean)
    ).size;

    results[p.label] = {
      events: count || 0,
      uniqueUsers,
      estimatedInvocations: Math.round((count || 0) * 1.8),
    };
  }

  return { source: "analytics_events", data: results };
}

// ── 3. Calcular projeções ────────────────────────────────────

function calculateProjections(metrics) {
  if (!metrics)
    return { dailyAvg: null, monthlyProjection: null, daysToLimit: null, dailyUsersAvg: null };

  if (metrics.source === "daily_usage_metrics" && metrics.data.length > 0) {
    const days = metrics.data.length;
    const totalInv = metrics.data.reduce(
      (s, d) => s + (d.estimated_invocations || 0),
      0
    );
    const totalUsers = metrics.data.reduce(
      (s, d) => s + (d.unique_users || 0),
      0
    );
    const dailyAvg = Math.round(totalInv / days);
    const monthlyProjection = dailyAvg * 30;
    const remaining = HOBBY_LIMIT - monthlyProjection;
    const daysToLimit = dailyAvg > 0 ? Math.round(remaining / dailyAvg) : null;

    return {
      dailyAvg,
      monthlyProjection,
      daysToLimit: daysToLimit > 0 ? daysToLimit : 0,
      dailyUsersAvg: Math.round(totalUsers / days),
    };
  }

  if (metrics.source === "analytics_events") {
    const d30 = metrics.data["30d"];
    if (!d30)
      return { dailyAvg: null, monthlyProjection: null, daysToLimit: null, dailyUsersAvg: null };
    const dailyAvg = Math.round(d30.estimatedInvocations / 30);
    const monthlyProjection = d30.estimatedInvocations;
    const remaining = HOBBY_LIMIT - monthlyProjection;
    const daysToLimit = dailyAvg > 0 ? Math.round(remaining / dailyAvg) : null;

    return {
      dailyAvg,
      monthlyProjection,
      daysToLimit: daysToLimit > 0 ? daysToLimit : 0,
      dailyUsersAvg: Math.round(d30.uniqueUsers / 30),
    };
  }

  return { dailyAvg: null, monthlyProjection: null, daysToLimit: null, dailyUsersAvg: null };
}

// ── 4. Renderizar relatório ──────────────────────────────────

function renderReport(vercelData, supabaseMetrics, proj) {
  console.log("");
  console.log(`${c.bold}${c.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`${c.bold}${c.blue}  ImobSync — Monitor de Uso Serverless${c.reset}`);
  console.log(`${c.bold}${c.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`  ${c.gray}Data: ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} ${new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })}${c.reset}`);
  console.log("");

  // Dados Vercel
  console.log(`${c.bold}  DADOS REAIS (Vercel API)${c.reset}`);
  if (vercelData?.raw) {
    console.log(`  ${c.green}  Conectado ✓${c.reset}`);
    if (vercelData.raw?.data) {
      for (const entry of vercelData.raw.data.slice(0, 5)) {
        log(entry.period?.[1] || "", `${entry.usage || "-"} (unidade: ${entry.unit || "-"})`);
      }
    }
  } else {
    console.log(`  ${c.gray}  Não disponível (configure VERCEL_TOKEN para dados reais)${c.reset}`);
  }
  console.log("");

  // Estimativas
  console.log(`${c.bold}  ESTIMATIVAS (App Analytics × 1.8)${c.reset}`);

  if (supabaseMetrics?.source === "daily_usage_metrics") {
    const latest = supabaseMetrics.data[0];
    log("Hoje", `${latest.estimated_invocations || 0} invocações (${latest.unique_users || 0} usuários)`);
    log("Média/dia", `${proj.dailyAvg || 0} invocações (${supabaseMetrics.data.length} dias com dados)`);
  } else if (supabaseMetrics?.source === "analytics_events") {
    const d7 = supabaseMetrics.data["7d"];
    const d30 = supabaseMetrics.data["30d"];
    if (d7) log("Últimos 7d", `${d7.estimatedInvocations} invocações (${d7.uniqueUsers} usuários únicos)`);
    if (d30) log("Últimos 30d", `${d30.estimatedInvocations} invocações (${d30.uniqueUsers} usuários únicos)`);
    if (d7) log("Média/dia (7d)", `${proj.dailyAvg || 0} invocações`);
  } else {
    console.log(`  ${c.gray}  Nenhum dado disponível ainda.${c.reset}`);
    console.log(`  ${c.gray}  Após o deploy, use o app normalmente por alguns dias.${c.reset}`);
  }
  console.log("");

  // Projeção
  console.log(`${c.bold}  PROJEÇÃO DE ESCALA${c.reset}`);

  const monthly = proj.monthlyProjection;
  const percent = monthly ? Math.min(Math.round((monthly / HOBBY_LIMIT) * 100), 100) : 0;
  const barWidth = 40;
  const filled = Math.round((percent / 100) * barWidth);
  const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
  const barColor = percent >= 80 ? c.red : percent >= 50 ? c.yellow : c.green;

  console.log(`  ${c.gray}│ Plano Hobby (100K/mês):${c.reset}`);
  console.log(`  ${c.gray}│ ${barColor}${bar}${c.reset} ${c.bold}${percent}%${c.reset}`);
  console.log(`  ${c.gray}│${c.reset}`);

  if (monthly !== null && monthly > 0) {
    log("Projeção mensal", `${monthly.toLocaleString("pt-BR")} invocações`);
    log("Limite Hobby", `${HOBBY_LIMIT.toLocaleString("pt-BR")}/mês`);
    log(
      "Margem restante",
      `${Math.max(HOBBY_LIMIT - monthly, 0).toLocaleString("pt-BR")} invocações`,
      monthly >= HOBBY_LIMIT ? c.red : c.green
    );
  }

  if (proj.daysToLimit !== null && proj.dailyAvg > 0) {
    const daysColor =
      proj.daysToLimit <= 5 ? c.red : proj.daysToLimit <= 15 ? c.yellow : c.green;
    log(
      "Dias até o limite",
      proj.daysToLimit > 365
        ? "> 1 ano (seguro)"
        : `${proj.daysToLimit} dias (ao ritmo atual)`,
      daysColor
    );
  }

  if (proj.dailyUsersAvg !== null && proj.dailyUsersAvg > 0) {
    log("Usuários ativos/dia (média)", `${proj.dailyUsersAvg}`);
  }

  console.log(`  ${c.gray}│${c.reset}`);

  // Recomendação
  console.log(`${c.bold}  RECOMENDAÇÃO${c.reset}`);
  if (!monthly || monthly === 0) {
    console.log(`  ${c.cyan}  ℹ Use o app por alguns dias para gerar dados de projeção.${c.reset}`);
  } else if (percent >= 80) {
    console.log(`  ${c.red}  ⚠ MIGRE PARA VERCEL PRO (US$ 20/mês)${c.reset}`);
    console.log(`  ${c.red}  Você está usando ${percent}% do limite Hobby.${c.reset}`);
    console.log(`  ${c.red}  O Pro oferece 1.000.000 invocações (10x mais).${c.reset}`);
  } else if (percent >= 50) {
    console.log(`  ${c.yellow}  ⚡ Crescimento acelerado — monitore semanalmente.${c.reset}`);
    console.log(`  ${c.yellow}  Considere migrar ao atingir 80%.${c.reset}`);
  } else {
    console.log(`  ${c.green}  ✅ Plano Hobby suficiente para o volume atual.${c.reset}`);
    console.log(`  ${c.green}  Execute este script semanalmente para acompanhar.${c.reset}`);
  }

  console.log("");
  console.log(`${c.bold}${c.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log("");
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  const vercelData = await fetchVercelUsage();
  const supabaseData = await fetchSupabaseMetrics();
  const proj = calculateProjections(supabaseData);
  renderReport(vercelData, supabaseData, proj);
}

main().catch(console.error);
