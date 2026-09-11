#!/usr/bin/env node
/**
 * ImobSync — Ferramenta de retenção de deployments da Vercel.
 *
 * Implementa o plano docs/performance/VERCEL-RETENTION-PLAN-2026-09-11.md:
 *   1. inventory — coleta somente leitura dos deployments (últimos N dias).
 *   2. dry-run   — aplica a política §3 e gera a lista de exclusão (nunca exclui).
 *   3. execute   — exclui SOMENTE os ids da lista gerada pelo dry-run (requer --yes).
 *   4. selftest  — valida o classificador contra uma fixture embutida (offline).
 *
 * Autorização: o proprietário autorizou a execução APÓS o inventário (2026-09-11).
 * Este script nunca inventa dados: sem VERCEL_TOKEN, apenas selftest/--help funcionam.
 *
 * ALIASES (semântica revisada na execução de 11/09/2026): apenas aliases REAIS
 * (custom/compartilhados) protegem. O alias automático de git
 * (*-git-<branch>-<hash>-*.vercel.app) é exclusivo de cada deployment e morre com ele —
 * todo preview nasce com um, então protegê-lo tornaria a política de previews inoperante.
 * A listagem v6 NÃO expõe aliases; o GET v13 sim — por isso o `inventory` enriquece
 * cada item com GET individual, para que dry-run e execute julguem com os mesmos dados.
 *
 * Uso:
 *   VERCEL_TOKEN=xxx node scripts/vercel-retention.mjs inventory [--team ID] [--project ID_OU_NOME] [--days 90] [--out retention/]
 *   VERCEL_TOKEN=xxx node scripts/vercel-retention.mjs dry-run [--input retention/inventory-<ts>.json] [--out retention/]
 *   VERCEL_TOKEN=xxx node scripts/vercel-retention.mjs execute --list retention/to-delete-<ts>.json --yes [--batch 10]
 *   node scripts/vercel-retention.mjs selftest
 *
 * Escopo do token recomendado: read/write de Deployments (granular). Nada além disso.
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const API = "https://api.vercel.com";

/** Política §3 do plano de retenção (não alterar sem revisar o documento). */
export const POLICY = {
  ROLLBACK_KEEP_PRODUCTION: 3, // últimas 3 produções READY preservadas
  PRODUCTION_MAX_AGE_DAYS: 30, // produções anteriores: manter 30 dias
  PREVIEW_MAX_AGE_DAYS: 7, // previews READY: manter 7 dias
  FAILED_MAX_AGE_DAYS: 2, // canceled/error: manter 2 dias
  MIN_AGE_HOURS: 24, // proteção extra: nada com menos de 24h é elegível
  EXECUTE_BATCH: 10, // exclusão em lotes pequenos
  EXECUTE_BATCH_PAUSE_MS: 2000,
};

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

// Fallback quando a resposta não traz `automaticAliases`: padrão do alias automático
// de git (ex.: imobsync-git-perf-opt-7dc39d-felipe-santiagos-projects-8ef42ff7.vercel.app).
const GIT_AUTO_ALIAS_RE = /-git-[^.]*\.vercel\.app$/i;

/**
 * Aliases REAIS (proteção): tudo em `alias` EXCETO os automáticos (listados em
 * `automaticAliases` ou no padrão de git acima). Retorna array (nunca null).
 */
export function meaningfulAliases(deployment) {
  if (!deployment) return [];
  const raw = Array.isArray(deployment.alias)
    ? deployment.alias.filter(Boolean)
    : deployment.alias
      ? [String(deployment.alias)]
      : [];
  const auto = new Set(
    (Array.isArray(deployment.automaticAliases) ? deployment.automaticAliases : [])
      .filter(Boolean)
      .map(String),
  );
  return raw.filter((a) => !auto.has(a) && !GIT_AUTO_ALIAS_RE.test(a));
}

/** Classificador puro. Recebe lista bruta (qualquer ordem) e retorna decisões. */
export function classifyDeployments(deployments, { now = Date.now() } = {}) {
  const sorted = [...deployments].sort((a, b) => b.created - a.created);
  let readyProductionSeen = 0;
  const decisions = [];

  for (const d of sorted) {
    const ageDays = (now - d.created) / DAY_MS;
    const ageHours = (now - d.created) / HOUR_MS;
    const state = String(d.state || "UNKNOWN").toUpperCase();
    const isProduction = d.target === "production";
    const aliases = Array.isArray(d.alias)
      ? d.alias.filter(Boolean)
      : d.alias
        ? [String(d.alias)]
        : [];
    const meta = d.meta || {};
    const customAliases = meaningfulAliases(d);
    const base = {
      id: d.uid || d.id,
      url: d.url,
      state,
      target: isProduction ? "production" : "preview",
      created: new Date(d.created).toISOString(),
      ageDays: Math.round(ageDays * 10) / 10,
      aliases,
      customAliases,
      commit: meta.githubCommitSha || meta.gitlabCommitSha || null,
      branch: meta.githubCommitRef || meta.gitlabCommitRef || meta.gitCommitRef || null,
      source: meta.githubDeployment || meta.gitlabDeployment || d.source || null,
    };

    // 1) Em andamento: nunca.
    if (!["READY", "CANCELED", "ERROR", "SUPPRESSED"].includes(state)) {
      decisions.push({ ...base, action: "keep", reason: "em andamento" });
      continue;
    }
    // 2) Muito recente (processamento assíncrono da Vercel): nunca.
    if (ageHours < POLICY.MIN_AGE_HOURS) {
      decisions.push({ ...base, action: "keep", reason: `<24h (proteção)` });
      continue;
    }
    // 3) Com alias REAL (custom/compartilhado): decisão caso a caso (plano §3).
    //    O alias automático de git NÃO protege — ver meaningfulAliases().
    if (customAliases.length > 0) {
      decisions.push({
        ...base,
        action: "keep",
        reason: "possui alias real — decidir caso a caso",
      });
      continue;
    }
    // 4) Produção: janela de rollback + retenção de 30 dias.
    if (isProduction) {
      if (state === "READY" && readyProductionSeen < POLICY.ROLLBACK_KEEP_PRODUCTION) {
        readyProductionSeen += 1;
        decisions.push({
          ...base,
          action: "keep",
          reason: `janela de rollback (produção #${readyProductionSeen})`,
        });
        continue;
      }
      if (ageDays <= POLICY.PRODUCTION_MAX_AGE_DAYS) {
        decisions.push({ ...base, action: "keep", reason: "retenção de produção (30d)" });
        continue;
      }
      decisions.push({ ...base, action: "delete", reason: "produção >30d sem alias" });
      continue;
    }
    // 5) Preview / canceled / error.
    if (state === "READY") {
      if (ageDays <= POLICY.PREVIEW_MAX_AGE_DAYS) {
        decisions.push({ ...base, action: "keep", reason: "retenção de preview (7d)" });
        continue;
      }
      decisions.push({ ...base, action: "delete", reason: "preview >7d sem alias" });
      continue;
    }
    // CANCELED / ERROR / SUPPRESSED
    if (ageDays <= POLICY.FAILED_MAX_AGE_DAYS) {
      decisions.push({ ...base, action: "keep", reason: "retenção de canceled/error (2d)" });
      continue;
    }
    decisions.push({ ...base, action: "delete", reason: "canceled/error >2d" });
  }

  return decisions;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function die(msg, code = 1) {
  console.error(`ERRO: ${msg}`);
  process.exit(code);
}

function requireToken() {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    die(
      "VERCEL_TOKEN não configurado. Crie um token granular (escopo Deployments: Read/Write) em https://vercel.com/account/settings/tokens e exporte VERCEL_TOKEN. Nada foi coletado ou alterado.",
      2,
    );
  }
  return token;
}

async function apiFetch(pathname, token, init = {}) {
  const res = await fetch(`${API}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  return res;
}

async function resolveProjectId(project, token) {
  // /v9/projects/{idOrName} aceita ambos; retorna o id canônico.
  const teamQ = process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : "";
  const res = await apiFetch(`/v9/projects/${encodeURIComponent(project)}${teamQ}`, token);
  if (res.status === 404) die(`Projeto '${project}' não encontrado (404).`);
  if (!res.ok) die(`Falha ao resolver projeto '${project}': HTTP ${res.status}`);
  const json = await res.json();
  return json.id;
}

/** Coleta paginada dos deployments (v6), do mais novo ao mais antigo, até `days` dias. */
async function collectDeployments(token, { teamId, projectId, days }) {
  const since = Date.now() - days * DAY_MS;
  const out = [];
  let until = Date.now();
  for (let page = 0; page < 100; page++) {
    const params = new URLSearchParams({
      limit: "100",
      since: String(since),
      until: String(until),
    });
    if (teamId) params.set("teamId", teamId);
    if (projectId) params.set("projectId", projectId);
    const res = await apiFetch(`/v6/deployments?${params}`, token);
    if (res.status === 403) die("HTTP 403 — token sem permissão de leitura de deployments.");
    if (!res.ok) die(`Falha na listagem de deployments: HTTP ${res.status}`);
    const json = await res.json();
    const items = json.deployments || [];
    out.push(...items);
    if (items.length < 100) break;
    until = items[items.length - 1].created - 1;
    if (until < since) break;
  }
  return out;
}

function toCsv(decisions) {
  const head = "action,id,url,state,target,created,ageDays,aliases,commit,branch,reason";
  const lines = decisions.map((d) =>
    [
      d.action,
      d.id,
      d.url || "",
      d.state,
      d.target,
      d.created,
      d.ageDays,
      d.aliases.join(";"),
      d.commit || "",
      d.branch || "",
      (d.reason || "").replaceAll(",", ";"),
    ].join(","),
  );
  return [head, ...lines].join("\n");
}

function ensureOutDir(out) {
  mkdirSync(out, { recursive: true });
  return out;
}

/**
 * Enriquece cada deployment com alias/automaticAliases/target via GET v13 individual
 * (concorrência limitada). A listagem v6 NÃO expõe aliases — sem este passo, o dry-run
 * julga sem os mesmos dados que o execute usa na re-checagem (falso positivo/negativo).
 * Falha por item é tolerada (item segue sem enriquecimento, com automaticAliases: []).
 */
async function enrichWithAliases(deployments, token, teamId) {
  if (deployments.length === 0) return deployments;
  const q = teamId ? `?teamId=${teamId}` : "";
  const out = new Array(deployments.length);
  const CONCURRENCY = 5;
  let idx = 0;
  let done = 0;
  async function worker() {
    while (idx < deployments.length) {
      const i = idx++;
      const d = deployments[i];
      try {
        const res = await apiFetch(`/v13/deployments/${d.uid}${q}`, token);
        if (res.ok) {
          const full = await res.json();
          out[i] = {
            ...d,
            target: full.target ?? d.target ?? null,
            state: full.readyState || d.state || d.readyState || "UNKNOWN",
            alias: Array.isArray(full.alias) ? full.alias : [],
            automaticAliases: Array.isArray(full.automaticAliases) ? full.automaticAliases : [],
          };
        } else {
          out[i] = { ...d, alias: Array.isArray(d.alias) ? d.alias : [], automaticAliases: [] };
        }
      } catch {
        out[i] = { ...d, alias: Array.isArray(d.alias) ? d.alias : [], automaticAliases: [] };
      }
      done += 1;
      if (done % 50 === 0) console.log(`  enriquecido ${done}/${deployments.length}...`);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, deployments.length) }, () => worker()),
  );
  console.log(
    `Aliases enriquecidos em ${deployments.length} deployments (GET v13 individual, concorrência ${CONCURRENCY}).`,
  );
  return out;
}

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------

async function cmdInventory(args) {
  const token = requireToken();
  const days = Number(args.days || 90);
  const outDir = ensureOutDir(args.out || "retention");
  const teamId = args.team || process.env.VERCEL_TEAM_ID || null;
  const projectId = args.project
    ? await resolveProjectId(args.project, token)
    : process.env.VERCEL_PROJECT_ID
      ? process.env.VERCEL_PROJECT_ID
      : null;

  console.log(
    `Coletando deployments dos últimos ${days} dias${
      projectId ? " (escopo: projeto)" : " (escopo: conta/team inteira — confirme antes de decidir)"
    }...`,
  );
  const raw = await enrichWithAliases(
    await collectDeployments(token, { teamId, projectId, days }),
    token,
    teamId,
  );
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const jsonPath = path.join(outDir, `inventory-${ts}.json`);
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generatedBy: "vercel-retention inventory",
        collectedAt: new Date().toISOString(),
        days,
        teamId,
        projectId,
        enriched: true,
        count: raw.length,
        deployments: raw,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    path.join(outDir, `inventory-${ts}.csv`),
    toCsv(
      raw.map((d) => ({
        id: d.uid,
        url: d.url,
        state: d.state,
        target: d.target,
        created: new Date(d.created).toISOString(),
        ageDays: Math.round(((Date.now() - d.created) / DAY_MS) * 10) / 10,
        aliases: Array.isArray(d.alias) ? d.alias.filter(Boolean) : [],
        commit: d.meta?.githubCommitSha || null,
        branch: d.meta?.githubCommitRef || null,
        reason: "",
        action: "inventory",
      })),
    ),
  );
  console.log(`OK: ${raw.length} deployments coletados.`);
  console.log(`  ${jsonPath}`);
  console.log(`Próximo passo: dry-run --input ${jsonPath}`);
}

async function cmdDryRun(args) {
  const outDir = ensureOutDir(args.out || "retention");
  let deployments;
  let source;
  if (args.input) {
    if (!existsSync(args.input)) die(`Arquivo de inventário não encontrado: ${args.input}`);
    const inv = JSON.parse(readFileSync(args.input, "utf8"));
    if (inv.generatedBy !== "vercel-retention inventory") {
      die("Arquivo de entrada não foi gerado por 'inventory' — abortando por segurança.");
    }
    deployments = inv.deployments;
    source = args.input;
  } else {
    const token = requireToken();
    const teamId = args.team || process.env.VERCEL_TEAM_ID || null;
    const projectId = args.project
      ? await resolveProjectId(args.project, token)
      : process.env.VERCEL_PROJECT_ID || null;
    deployments = await collectDeployments(token, {
      teamId,
      projectId,
      days: Number(args.days || 90),
    });
    source = "coleta direta da API";
  }

  const decisions = classifyDeployments(deployments);
  const toDelete = decisions.filter((d) => d.action === "delete");
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const listPath = path.join(outDir, `to-delete-${ts}.json`);
  writeFileSync(
    listPath,
    JSON.stringify(
      {
        generatedBy: "vercel-retention dry-run",
        createdAt: new Date().toISOString(),
        source,
        policy: POLICY,
        total: decisions.length,
        deleteCount: toDelete.length,
        items: toDelete,
      },
      null,
      2,
    ),
  );

  const byReason = {};
  for (const d of decisions) byReason[d.reason] = (byReason[d.reason] || 0) + 1;
  writeFileSync(path.join(outDir, `to-delete-${ts}.csv`), toCsv(decisions));

  console.log(`\nInventário analisado: ${decisions.length} deployments (fonte: ${source})`);
  console.log("\nResumo por decisão:");
  for (const [reason, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${reason}`);
  }
  console.log(`\nElegíveis à exclusão: ${toDelete.length} → ${listPath}`);
  console.log(
    "Nota: a API não expõe tamanho por deployment; estime o impacto em Usage → Deployment Storage. Encurtar retenção não apaga GB-mês já contabilizado.",
  );
  console.log(`Próximo passo (só após conferir a lista): execute --list ${listPath} --yes`);
}

async function cmdExecute(args) {
  if (!args.yes) {
    die("Execução exige --yes (e só depois de revisar a lista do dry-run).", 2);
  }
  if (!args.list) die("Informe --list retention/to-delete-<ts>.json gerado pelo dry-run.");
  const token = requireToken();
  const list = JSON.parse(readFileSync(args.list, "utf8"));
  if (list.generatedBy !== "vercel-retention dry-run") {
    die("A lista não foi gerada pelo dry-run desta ferramenta — abortando por segurança.");
  }
  const items = list.items || [];
  if (items.some((d) => d.action !== "delete" || (d.customAliases && d.customAliases.length > 0))) {
    die("A lista contém itens protegidos (alias real/keep) — regere a lista com dry-run.");
  }
  const teamQ = args.team || process.env.VERCEL_TEAM_ID;
  const batchSize = Number(args.batch || POLICY.EXECUTE_BATCH);
  console.log(
    `Excluindo ${items.length} deployments em lotes de ${batchSize} (fonte: ${args.list}).`,
  );

  let ok = 0;
  let gone = 0;
  let failed = 0;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    for (const d of batch) {
      // Re-checagem de segurança no momento da exclusão.
      const getQ = teamQ ? `?teamId=${teamQ}` : "";
      const check = await apiFetch(`/v13/deployments/${d.id}${getQ}`, token);
      if (check.status === 404) {
        gone += 1;
        console.log(`  [já inexistente] ${d.id}`);
        continue;
      }
      if (check.ok) {
        const cur = await check.json();
        const custom = meaningfulAliases(cur);
        if (custom.length > 0 || cur.target === "production") {
          failed += 1;
          console.log(
            `  [PULADO — alias real (${custom.join(", ")}) ou produção na re-checagem] ${d.id}`,
          );
          continue;
        }
      }
      const delQ = teamQ ? `?teamId=${teamQ}` : "";
      const del = await apiFetch(`/v13/deployments/${d.id}${delQ}`, token, { method: "DELETE" });
      if (del.ok || del.status === 404) {
        if (del.ok) ok += 1;
        else gone += 1;
        console.log(`  [${del.ok ? "excluído" : "já inexistente"}] ${d.id} (${d.reason})`);
      } else {
        failed += 1;
        console.log(`  [FALHOU HTTP ${del.status}] ${d.id} — verifique escopo do token`);
      }
    }
    if (i + batchSize < items.length) {
      await new Promise((r) => setTimeout(r, POLICY.EXECUTE_BATCH_PAUSE_MS));
    }
  }
  console.log(`\nConcluído: ${ok} excluídos, ${gone} já inexistentes, ${failed} falhas/pulados.`);
  console.log("Acompanhe Usage → Deployment Storage nas próximas 24-48h antes de novo lote.");
}

function cmdSelftest() {
  const now = Date.now();
  const mk = (over) => ({
    uid: over.uid,
    url: `${over.uid}.vercel.app`,
    state: over.state,
    target: over.target,
    created: now - over.ageDays * DAY_MS,
    alias: over.alias || [],
    automaticAliases: over.automaticAliases || [],
    meta: over.meta || {},
  });
  const fixture = [
    mk({ uid: "prod-ativo", state: "READY", target: "production", ageDays: 0.5, alias: ["imobsync.vercel.app"] }),
    mk({ uid: "prod-1h", state: "READY", target: "production", ageDays: 1 }),
    mk({ uid: "prod-10d", state: "READY", target: "production", ageDays: 10 }),
    mk({ uid: "prod-40d", state: "READY", target: "production", ageDays: 40 }),
    mk({ uid: "prod-60d", state: "READY", target: "production", ageDays: 60 }),
    mk({ uid: "prod-90d-alias", state: "READY", target: "production", ageDays: 90, alias: ["legado.com"] }),
    mk({ uid: "prev-1h", state: "READY", target: "preview", ageDays: 0.2 }),
    mk({ uid: "prev-3d", state: "READY", target: "preview", ageDays: 3 }),
    mk({ uid: "prev-10d", state: "READY", target: "preview", ageDays: 10 }),
    mk({
      uid: "prev-10d-auto",
      state: "READY",
      target: "preview",
      ageDays: 10,
      alias: ["imobsync-git-perf-opt-7dc39d-felipe-santiagos-projects-8ef42ff7.vercel.app"],
      automaticAliases: ["imobsync-git-perf-opt-7dc39d-felipe-santiagos-projects-8ef42ff7.vercel.app"],
    }),
    mk({ uid: "prev-12d-autoregex", state: "READY", target: "preview", ageDays: 12, alias: ["imobsync-git-fix-abc-user.vercel.app"] }),
    mk({ uid: "prev-10d-custom", state: "READY", target: "preview", ageDays: 10, alias: ["staging.imobsync.com"] }),
    mk({ uid: "canc-1d", state: "CANCELED", target: "preview", ageDays: 1 }),
    mk({ uid: "canc-5d", state: "CANCELED", target: "preview", ageDays: 5 }),
    mk({ uid: "err-10d", state: "ERROR", target: "preview", ageDays: 10 }),
    mk({ uid: "build", state: "BUILDING", target: "preview", ageDays: 90 }),
  ];
  const decisions = classifyDeployments(fixture, { now });
  const byId = Object.fromEntries(decisions.map((d) => [d.id, d]));
  const expectKeep = [
    "prod-ativo", // <24h + alias
    "prod-1h", // rollback #1
    "prod-10d", // rollback #2
    "prod-40d", // rollback #3 (idade não importa para a janela)
    "prod-90d-alias",
    "prev-1h",
    "prev-3d",
    "prev-10d-custom",
    "canc-1d",
    "build",
  ];
  const expectDelete = ["prod-60d", "prev-10d", "prev-10d-auto", "prev-12d-autoregex", "canc-5d", "err-10d"];
  let failed = 0;
  for (const id of expectKeep) {
    if (byId[id]?.action !== "keep") {
      console.error(`  FALHA: ${id} deveria ser keep (got ${byId[id]?.action} — ${byId[id]?.reason})`);
      failed += 1;
    }
  }
  for (const id of expectDelete) {
    if (byId[id]?.action !== "delete") {
      console.error(`  FALHA: ${id} deveria ser delete (got ${byId[id]?.action} — ${byId[id]?.reason})`);
      failed += 1;
    }
  }
  const delList = decisions.filter((d) => d.action === "delete");
  if (delList.some((d) => d.customAliases.length > 0)) {
    console.error("  FALHA: lista de exclusão contém item com alias real");
    failed += 1;
  }
  if (failed > 0) {
    console.error(`selftest FALHOU (${failed} verificações).`);
    process.exit(1);
  }
  console.log("selftest OK — todas as verificações da política §3 passaram.");
  console.log("\nDecisões (fixture):");
  for (const d of decisions) {
    console.log(`  ${d.action.padEnd(6)} ${d.id.padEnd(16)} ${d.reason}`);
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) args[key] = true;
      else {
        args[key] = next;
        i++;
      }
    } else {
      args._ = a;
    }
  }
  return args;
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv.find((a) => !a.startsWith("--"));
  const args = parseArgs(argv);
  switch (command) {
    case "inventory":
      await cmdInventory(args);
      break;
    case "dry-run":
      await cmdDryRun(args);
      break;
    case "execute":
      await cmdExecute(args);
      break;
    case "selftest":
      cmdSelftest();
      break;
    default:
      console.log(`Uso: node scripts/vercel-retention.mjs <comando>
Comandos:
  inventory   Coleta somente leitura (requer VERCEL_TOKEN). [--days 90] [--team ID] [--project ID_OU_NOME] [--out retention/]
  dry-run     Aplica a política e gera a lista de exclusão (não exclui). [--input inventory.json]
  execute     Exclui SOMENTE ids da lista do dry-run. [--list to-delete.json] --yes [--batch 10]
  selftest    Valida o classificador offline (sem token).

Política (plano §3): produção ativa/alias real nunca; 3 últimas produções READY; produção >30d, preview >7d,
canceled/error >2d elegíveis; nada com <24h; alias automático de git não protege (ver meaningfulAliases).`);
      process.exit(command ? 1 : 0);
  }
}

const isDirectRun =
  !!process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
  main().catch((e) => die(e?.message || String(e)));
}
