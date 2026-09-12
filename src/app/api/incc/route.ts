import { NextResponse } from "next/server";
import {
  averageWithinBounds,
  bacenUrl,
  BACEN_SERIES,
  calcAverages,
  INDEX_FALLBACKS,
  normalizeIndiceParam,
  parseBacenValues,
  SOURCE_BOUNDS,
  type IndexResult,
  type IndiceKey,
} from "@/lib/indices";

// ─── Fontes de dados por índice ───
// INCC: O Bacen SGS NÃO disponibiliza INCC-M (variação mensal).
//   Fonte principal = brasilindicadores.com.br (INCC-M oficial FGV).
//   Fallback = INCC-DI via Bacen SGS série 192 (acompanha de perto o INCC-M).
// IGPM: Bacen SGS série 189 — IGP-M variação % mensal (FGV IBRE).
// IPCA: Bacen SGS série 433 — IPCA variação % mensal (IBGE).
const BRASIL_INDICADORES_URL =
  "https://brasilindicadores.com.br/incc-m?handler=HistoricoValoresIndicadorPartial";

// ─── Cache POR ÍNDICE ───
interface CacheEntry {
  data: IndexResult | null;
  timestamp: number;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas

const caches: Record<IndiceKey, CacheEntry> = {
  incc: { data: null, timestamp: 0 },
  igpm: { data: null, timestamp: 0 },
  ipca: { data: null, timestamp: 0 },
};

// Shared in-flight promises (audit 6.3): dedupe por índice.
const inFlight: Record<IndiceKey, Promise<IndexResult> | null> = {
  incc: null,
  igpm: null,
  ipca: null,
};

// ─── Fonte 1 do INCC (principal): INCC-M via brasilindicadores.com.br ───
// Retorna os valores oficiais do INCC-M publicados pela FGV IBRE.
// Estrutura: tabela HTML com linhas por ano e colunas por mês (jan..dez + acumulado).
async function fetchINCCmFromBrasilIndicadores(): Promise<IndexResult | null> {
  try {
    const res = await fetch(BRASIL_INDICADORES_URL, {
      signal: AbortSignal.timeout(15000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    if (!res.ok) return null;

    const html = await res.text();

    // Extrair linhas da tabela: cada <tr> tem um ano e 13 colunas (jan-dez + anual)
    const rows = html.match(/<tr[^>]*>(.*?)<\/tr>/gis);
    if (!rows || rows.length === 0) return null;

    interface MonthlyEntry {
      date: Date;
      data: string;
      valor: number;
    }

    const monthlyEntries: MonthlyEntry[] = [];

    for (const row of rows) {
      const cells = row.match(/<td[^>]*>(.*?)<\/td>/gis);
      if (!cells || cells.length < 2) continue;

      // Limpar HTML das células
      const cleanCells = cells.map((c) =>
        c.replace(/<[^>]+>/g, "").trim()
      );

      // Primeira célula = ano
      const yearStr = cleanCells[0];
      if (!/^\d{4}$/.test(yearStr)) continue;

      const year = parseInt(yearStr, 10);

      // Colunas 1-12 = variação mensal de jan a dez
      for (let m = 0; m < 12; m++) {
        const valStr = cleanCells[m + 1]
          ?.replace("%", "")
          .replace(",", ".")
          .trim();

        if (!valStr || valStr === "") continue;

        const valor = parseFloat(valStr);
        if (isNaN(valor)) continue;

        monthlyEntries.push({
          date: new Date(year, m, 1),
          data: `01/${String(m + 1).padStart(2, "0")}/${year}`,
          valor,
        });
      }
    }

    if (monthlyEntries.length < 12) return null;

    // Ordenar cronologicamente (mais antigo primeiro)
    monthlyEntries.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Filtrar apenas a partir de 2011 (180 meses = 15 anos)
    const since2011 = monthlyEntries.filter(
      (e) => e.date >= new Date(2011, 0, 1)
    );
    if (since2011.length < 12) return null;

    const allValues = since2011.map((e) => e.valor);

    // Sanidade: média geral deve estar entre 0.1% e 2%
    const rawAvg = allValues.reduce((s, v) => s + v, 0) / allValues.length;
    if (!averageWithinBounds(rawAvg, SOURCE_BOUNDS.inccBrasilIndicadores.min, SOURCE_BOUNDS.inccBrasilIndicadores.max)) {
      return null;
    }

    const { avg180, avg12, avg6 } = calcAverages(allValues);
    const lastEntry = since2011[since2011.length - 1];

    return {
      avg180,
      avg12,
      avg6,
      lastUpdate: lastEntry.data,
      totalMonths: allValues.length,
      values: since2011.map((e) => ({
        data: e.data,
        valor: Math.round(e.valor * 10000) / 10000,
      })),
      source: "brasilindicadores.com.br — INCC-M (FGV IBRE)",
      indicator: "INCC-M",
    };
  } catch {
    return null;
  }
}

// ─── Fonte genérica Bacen SGS (INCC-DI 192, IGP-M 189, IPCA 433) ───
// Todas as séries são variação % mensal no mesmo formato JSON {data, valor}.
async function fetchFromBacen(key: IndiceKey): Promise<IndexResult | null> {
  try {
    const series = BACEN_SERIES[key];
    if (!series) return null;

    const url = bacenUrl(series);

    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;

    const values = parseBacenValues(await res.json());
    if (values.length < 12) return null;

    const bounds =
      key === "incc"
        ? SOURCE_BOUNDS.inccBacen
        : key === "igpm"
          ? SOURCE_BOUNDS.igpmBacen
          : SOURCE_BOUNDS.ipcaBacen;

    // Sanidade: média geral dentro da faixa esperada do índice
    const allValues = values.map((v) => v.valor);
    const rawAvg = allValues.reduce((s, v) => s + v, 0) / allValues.length;
    if (!averageWithinBounds(rawAvg, bounds.min, bounds.max)) return null;

    const { avg180, avg12, avg6 } = calcAverages(allValues);

    const meta: Record<IndiceKey, { indicator: string; source: string }> = {
      incc: {
        indicator: "INCC-DI",
        source: "Bacen SGS série 192 — INCC-DI (FGV IBRE)",
      },
      igpm: {
        indicator: "IGP-M",
        source: "Bacen SGS série 189 — IGP-M (FGV IBRE)",
      },
      ipca: {
        indicator: "IPCA",
        source: "Bacen SGS série 433 — IPCA (IBGE)",
      },
    };

    return {
      avg180,
      avg12,
      avg6,
      lastUpdate: values[values.length - 1]?.data || null,
      totalMonths: values.length,
      values: values.map((v) => ({
        data: v.data,
        valor: Math.round(v.valor * 10000) / 10000,
      })),
      source: meta[key].source,
      indicator: meta[key].indicator,
    };
  } catch {
    return null;
  }
}

// ─── Handler interno por índice ───
async function fetchFresh(key: IndiceKey): Promise<IndexResult> {
  // 1) Fonte principal do índice
  if (key === "incc") {
    const result = await fetchINCCmFromBrasilIndicadores();
    // 2) Fallback: INCC-DI via Bacen série 192 (API confiável do Banco Central)
    if (result) return result;
    const bacen = await fetchFromBacen("incc");
    // 3) Último recurso: valores estáticos verificados manualmente
    return bacen || INDEX_FALLBACKS.incc;
  }

  // igpm / ipca: Bacen é a fonte primária (série oficial), fallback estático
  const bacen = await fetchFromBacen(key);
  return bacen || INDEX_FALLBACKS[key];
}

function respond(data: IndexResult): NextResponse {
  // Public, non-personalized data (audit 6.3): CDN may serve and revalidate.
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=43200",
    },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = normalizeIndiceParam(searchParams.get("indice"));

  if (!key) {
    return NextResponse.json(
      { error: "Parâmetro 'indice' inválido. Valores aceitos: incc, igpm, ipca." },
      { status: 400 }
    );
  }

  const cache = caches[key];

  // Cache quente dentro do TTL
  if (cache.data && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return respond(cache.data);
  }

  // Deduplicar requests simultâneos em uma única busca upstream (por índice)
  if (!inFlight[key]) {
    inFlight[key] = fetchFresh(key)
      .then((result) => {
        // Só sobrescreve o cache com dados REAIS; o fallback estático não
        // apaga o último dado válido (usado como stale-safe abaixo).
        if (!result.fallback) {
          caches[key] = { data: result, timestamp: Date.now() };
        }
        return result;
      })
      .finally(() => {
        inFlight[key] = null;
      });
  }
  const result = await inFlight[key];

  // Stale-safe (audit 6.3): fontes falharam mas existe dado real vencido —
  // servir o dado obsoleto em vez do fallback estático.
  if (result.fallback && cache.data && !cache.data.fallback) {
    return respond(cache.data);
  }

  return respond(result);
}
