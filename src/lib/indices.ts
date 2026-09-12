/**
 * Helpers puros para as rotas de índices de correção (/api/incc).
 *
 * Índices suportados:
 * - incc : INCC-M (FGV, via brasilindicadores.com.br) com fallback INCC-DI (Bacen SGS 192)
 * - igpm : IGP-M variação % mensal — Bacen SGS série 189 (FGV IBRE)
 * - ipca : IPCA variação % mensal — Bacen SGS série 433 (IBGE)
 *
 * Estes helpers são puros (sem rede) para serem testáveis; a orquestração
 * de fetch/cache vive em src/app/api/incc/route.ts.
 */

export type IndiceKey = "incc" | "igpm" | "ipca";

export interface IndexMonthlyValue {
  data: string;
  valor: number;
}

export interface IndexResult {
  avg180: number;
  avg12: number;
  avg6: number;
  lastUpdate: string | null;
  totalMonths: number;
  values: IndexMonthlyValue[];
  source: string;
  indicator: string;
  fallback?: boolean;
}

export interface IndexAverages {
  avg180: number;
  avg12: number;
  avg6: number;
}

/** Séries oficiais do Bacen SGS (variação % mensal). */
export const BACEN_SERIES: Record<string, string> = {
  incc: "192", // INCC-DI (único INCC disponível no Bacen; usado como fallback)
  igpm: "189", // IGP-M (FGV IBRE)
  ipca: "433", // IPCA (IBGE)
};

const INDICE_KEYS: readonly IndiceKey[] = ["incc", "igpm", "ipca"];

/**
 * Normaliza o parâmetro ?indice= da rota.
 * - ausente (null/undefined) → "incc" (retrocompatibilidade: /api/incc sem param)
 * - valor inválido → null (rota responde 400)
 */
export function normalizeIndiceParam(value: string | null | undefined): IndiceKey | null {
  if (value === null || value === undefined || value === "") return "incc";
  const normalized = String(value).trim().toLowerCase();
  return (INDICE_KEYS as readonly string[]).includes(normalized)
    ? (normalized as IndiceKey)
    : null;
}

/** Médias 180m / 12m / 6m com arredondamento de 4 casas (mesma regra atual). */
export function calcAverages(monthlyValues: number[]): IndexAverages {
  if (monthlyValues.length === 0) return { avg180: 0, avg12: 0, avg6: 0 };

  const avg = (arr: number[]) =>
    arr.reduce((s, v) => s + v, 0) / arr.length;

  const last180 = monthlyValues.slice(-180);
  const last12 = monthlyValues.slice(-12);
  const last6 = monthlyValues.slice(-6);

  return {
    avg180: Math.round(avg(last180) * 10000) / 10000,
    avg12: Math.round(avg(last12) * 10000) / 10000,
    avg6: Math.round(avg(last6) * 10000) / 10000,
  };
}

/** Verificação de sanidade da média geral (proteção contra parsing corrompido). */
export function averageWithinBounds(avg: number, min: number, max: number): boolean {
  return avg >= min && avg <= max;
}

/** Data no formato dd/mm/yyyy usado pela API do Bacen. */
export function formatBacenDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** URL da API do Bacen para a janela de ~200 meses. */
export function bacenUrl(series: string, now: Date = new Date()): string {
  const start = new Date(now);
  start.setMonth(start.getMonth() - 200);
  return `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${series}/dados?formato=json&dataInicial=${formatBacenDate(start)}&dataFinal=${formatBacenDate(now)}`;
}

/**
 * Converte a resposta JSON do Bacen em valores numéricos, descartando
 * registros não numéricos (defensivo; a API oficial envia {data, valor}).
 */
export function parseBacenValues(raw: unknown): IndexMonthlyValue[] {
  if (!Array.isArray(raw)) return [];
  const out: IndexMonthlyValue[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as { data?: unknown; valor?: unknown };
    if (typeof rec.data !== "string") continue;
    const valor =
      typeof rec.valor === "number"
        ? rec.valor
        : parseFloat(String(rec.valor ?? ""));
    if (!Number.isFinite(valor)) continue;
    out.push({ data: rec.data, valor });
  }
  return out;
}

/**
 * Faixas de sanidade da média geral por fonte.
 * Janelas de 200 meses (≈2010+): INCC ≈0.55%, IGP-M ≈0.55% (volátil,
 * com meses negativos), IPCA ≈0.46%. Limites folgados o bastante para
 * não rejeitar dados reais, mas estreitos o bastante para rejeitar lixo.
 */
export const SOURCE_BOUNDS = {
  inccBrasilIndicadores: { min: 0.1, max: 2 },
  inccBacen: { min: 0.1, max: 3 },
  igpmBacen: { min: -0.2, max: 2.5 },
  ipcaBacen: { min: -0.1, max: 1.5 },
} as const;

/**
 * Fallbacks estáticos verificados manualmente (12/09/2026, dados Bacen SGS).
 * Usados apenas quando TODAS as fontes remotas falham.
 */
export const INDEX_FALLBACKS: Record<IndiceKey, IndexResult> = {
  incc: {
    // Verificados em 19/05/2026 (mantidos da implementação original):
    // INCC-M 12m=0.5092%, 180m=0.5570% | INCC-DI 12m=0.5158%, 180m=0.5577%
    avg180: 0.557,
    avg12: 0.5092,
    avg6: 0.5092,
    lastUpdate: null,
    totalMonths: 0,
    values: [],
    fallback: true,
    source: "Valores de referência INCC-M (FGV IBRE) — fontes indisponíveis",
    indicator: "INCC-M",
  },
  igpm: {
    // Série 189 (Bacen): 200 meses jan/2010–ago/2026
    avg180: 0.535,
    avg12: 0.1842,
    avg6: 0.3683,
    lastUpdate: null,
    totalMonths: 0,
    values: [],
    fallback: true,
    source: "Valores de referência IGP-M (FGV IBRE) — fontes indisponíveis",
    indicator: "IGP-M",
  },
  ipca: {
    // Série 433 (Bacen): 200 meses jan/2010–ago/2026
    avg180: 0.4614,
    avg12: 0.3458,
    avg6: 0.34,
    lastUpdate: null,
    totalMonths: 0,
    values: [],
    fallback: true,
    source: "Valores de referência IPCA (IBGE) — fontes indisponíveis",
    indicator: "IPCA",
  },
};

/** Rótulo curto do índice para exibição na web/PDF (padrão da lib pos-habitese). */
export function indiceShortLabel(key: IndiceKey): string {
  if (key === "ipca") return "IPCA";
  if (key === "igpm") return "IGPM";
  return "INCC";
}
