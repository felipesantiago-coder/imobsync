import { describe, expect, it } from "vitest";
import {
  averageWithinBounds,
  bacenUrl,
  BACEN_SERIES,
  calcAverages,
  INDEX_FALLBACKS,
  indiceShortLabel,
  normalizeIndiceParam,
  parseBacenValues,
  SOURCE_BOUNDS,
} from "@/lib/indices";

describe("normalizeIndiceParam", () => {
  it("retrocompatibilidade: ausente/vazio → 'incc' (rota /api/incc sem param)", () => {
    expect(normalizeIndiceParam(null)).toBe("incc");
    expect(normalizeIndiceParam(undefined)).toBe("incc");
    expect(normalizeIndiceParam("")).toBe("incc");
  });

  it("aceita as três chaves válidas, inclusive com caixa/espaços", () => {
    expect(normalizeIndiceParam("incc")).toBe("incc");
    expect(normalizeIndiceParam("igpm")).toBe("igpm");
    expect(normalizeIndiceParam("ipca")).toBe("ipca");
    expect(normalizeIndiceParam(" IPCA ")).toBe("ipca");
    expect(normalizeIndiceParam("IGPM")).toBe("igpm");
  });

  it("retorna null para valores inválidos (rota deve responder 400)", () => {
    expect(normalizeIndiceParam("selic")).toBeNull();
    expect(normalizeIndiceParam("incc-m")).toBeNull();
    expect(normalizeIndiceParam("igp")).toBeNull();
    expect(normalizeIndiceParam("1")).toBeNull();
  });
});

describe("calcAverages", () => {
  it("retorna zeros para lista vazia", () => {
    expect(calcAverages([])).toEqual({ avg180: 0, avg12: 0, avg6: 0 });
  });

  it("calcula médias 180m/12m/6m e arredonda a 4 casas", () => {
    // 12 primeiros meses com 1%, 6 finais com 2% → janela de 18 meses
    const values = [
      ...Array.from({ length: 12 }, () => 1),
      ...Array.from({ length: 6 }, () => 2),
    ];
    const { avg180, avg12, avg6 } = calcAverages(values);
    expect(avg12).toBe(1.5); // últimos 12 = 6×1 + 6×2
    expect(avg6).toBe(2); // últimos 6 = todos 2
    expect(avg180).toBeCloseTo((12 * 1 + 6 * 2) / 18, 4); // 18 < 180 → janela inteira
  });

  it("usa somente a janela solicitada quando há histórico suficiente", () => {
    const values = [
      ...Array.from({ length: 200 }, () => 0.5),
      ...Array.from({ length: 12 }, () => 0.4),
      ...Array.from({ length: 6 }, () => 0.3),
    ];
    const { avg180, avg12, avg6 } = calcAverages(values);
    expect(avg180).toBeCloseTo((162 * 0.5 + 12 * 0.4 + 6 * 0.3) / 180, 4); // janela de 180 mais recentes
    expect(avg12).toBeCloseTo((6 * 0.4 + 6 * 0.3) / 12, 4); // últimos 12 incluem os 6 finais
    expect(avg6).toBe(0.3);
  });
});

describe("averageWithinBounds", () => {
  it("aceita valores dentro da faixa (limites inclusivos)", () => {
    expect(averageWithinBounds(0.5, 0.1, 2)).toBe(true);
    expect(averageWithinBounds(0.1, 0.1, 2)).toBe(true);
    expect(averageWithinBounds(2, 0.1, 2)).toBe(true);
  });

  it("rejeita valores fora da faixa (inclusive negativos fora do permitido)", () => {
    expect(averageWithinBounds(0.05, 0.1, 2)).toBe(false);
    expect(averageWithinBounds(2.5, 0.1, 2)).toBe(false);
    expect(averageWithinBounds(-1, 0.1, 2)).toBe(false);
  });
});

describe("bacenUrl", () => {
  it("monta URL da série com formato e janela de ~200 meses", () => {
    const url = bacenUrl("433", new Date(2026, 8, 12));
    expect(url).toContain("bcdata.sgs.433/dados");
    expect(url).toContain("formato=json");
    expect(url).toContain("dataInicial=12/01/2010"); // 200 meses antes (≈16,7 anos)
    expect(url).toContain("dataFinal=12/09/2026");
  });
});

describe("parseBacenValues", () => {
  it("converte a resposta oficial {data, valor} preservando strings de data", () => {
    const out = parseBacenValues([
      { data: "01/07/2026", valor: "0.24" },
      { data: "01/08/2026", valor: 0.36 },
    ]);
    expect(out).toEqual([
      { data: "01/07/2026", valor: 0.24 },
      { data: "01/08/2026", valor: 0.36 },
    ]);
  });

  it("descarta registros não numéricos/objeto inválido (defensivo)", () => {
    const out = parseBacenValues([
      { data: "01/01/2026", valor: "abc" },
      { data: "01/02/2026", valor: null },
      { data: "01/03/2026" },
      null,
      "lixo",
      { data: 123, valor: 1 },
      { data: "01/04/2026", valor: -0.5 },
    ]);
    expect(out).toEqual([{ data: "01/04/2026", valor: -0.5 }]);
  });

  it("retorna lista vazia para entrada não-array", () => {
    expect(parseBacenValues(undefined)).toEqual([]);
    expect(parseBacenValues({ data: "01/01/2026", valor: 1 })).toEqual([]);
  });
});

describe("BACEN_SERIES", () => {
  it("mapeia as séries oficiais 192/189/433", () => {
    expect(BACEN_SERIES.incc).toBe("192");
    expect(BACEN_SERIES.igpm).toBe("189");
    expect(BACEN_SERIES.ipca).toBe("433");
  });
});

describe("SOURCE_BOUNDS", () => {
  it("faixas coerentes (min < max) e IGP-M/IPCA toleram médias levemente negativas", () => {
    expect(SOURCE_BOUNDS.inccBrasilIndicadores.min).toBeLessThan(
      SOURCE_BOUNDS.inccBrasilIndicadores.max
    );
    expect(SOURCE_BOUNDS.inccBacen.min).toBeLessThan(SOURCE_BOUNDS.inccBacen.max);
    expect(SOURCE_BOUNDS.igpmBacen.min).toBeLessThan(SOURCE_BOUNDS.igpmBacen.max);
    expect(SOURCE_BOUNDS.ipcaBacen.min).toBeLessThan(SOURCE_BOUNDS.ipcaBacen.max);
    // IGP-M tem meses de deflação fortes (-1.93% observado); média de janela
    // longa ainda assim positiva — limite inferior apenas defensivo
    expect(SOURCE_BOUNDS.igpmBacen.min).toBeLessThanOrEqual(0);
    expect(SOURCE_BOUNDS.ipcaBacen.min).toBeLessThanOrEqual(0);
  });
});

describe("INDEX_FALLBACKS", () => {
  it("fallbacks marcados com fallback:true, sem valores e com médias positivas", () => {
    for (const key of ["incc", "igpm", "ipca"] as const) {
      const fb = INDEX_FALLBACKS[key];
      expect(fb.fallback).toBe(true);
      expect(fb.values).toEqual([]);
      expect(fb.totalMonths).toBe(0);
      expect(fb.lastUpdate).toBeNull();
      expect(fb.avg180).toBeGreaterThan(0);
      expect(fb.avg12).toBeGreaterThan(0);
      expect(fb.avg6).toBeGreaterThan(0);
      expect(fb.indicator.length).toBeGreaterThan(0);
      expect(fb.source).toContain("indisponíveis");
    }
  });

  it("fallbacks IGPM/IPCA com valores verificados em 12/09/2026 (Bacen 189/433)", () => {
    expect(INDEX_FALLBACKS.igpm).toMatchObject({
      avg180: 0.535,
      avg12: 0.1842,
      avg6: 0.3683,
      indicator: "IGP-M",
    });
    expect(INDEX_FALLBACKS.ipca).toMatchObject({
      avg180: 0.4614,
      avg12: 0.3458,
      avg6: 0.34,
      indicator: "IPCA",
    });
  });

  it("fallback INCC preserva os valores originais (19/05/2026)", () => {
    expect(INDEX_FALLBACKS.incc).toMatchObject({
      avg180: 0.557,
      avg12: 0.5092,
      avg6: 0.5092,
      indicator: "INCC-M",
    });
  });
});

describe("indiceShortLabel", () => {
  it("rótulos consistentes com a lib pos-habitese", () => {
    expect(indiceShortLabel("incc")).toBe("INCC");
    expect(indiceShortLabel("igpm")).toBe("IGPM");
    expect(indiceShortLabel("ipca")).toBe("IPCA");
  });
});
