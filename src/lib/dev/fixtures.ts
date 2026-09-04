/**
 * Fixtures sintéticas para o harness de validação visual (audit P1.4/P2.x).
 *
 * Gera linhas brutas no MESMO formato do PostgREST (`select("*")`) consumido
 * pelos mappers extraídos (`units-data`, `villa-bianco-data`, `moment-data`,
 * `vitta-data`, `projeto-units`). Usadas EXCLUSIVAMENTE pela rota
 * `/dev-harness/[dash]`, que só existe quando
 * `NEXT_PUBLIC_VISUAL_HARNESS === "1"` em build — em produção sem a flag a
 * rota responde 404 e este módulo não é importado por nenhuma página real.
 *
 * Determinístico por construção (sem Math.random): o mesmo input produz
 * sempre as mesmas linhas, garantindo paridade SSR/hidratação.
 */

export type FixtureOptions = {
  /** Quantidade de andares (padrão 10). */
  floors?: number;
  /** Unidades por andar (padrão 8). */
  perFloor?: number;
};

const STATUS_CYCLE = ["disponivel", "reservado", "vendido"] as const;
const SOL_CYCLE = ["Nascente", "Poente"] as const;

function clampCount(n: number, fallback: number, max: number): number {
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.round(n), max);
}

export function resolveFixtureOptions(opts?: FixtureOptions) {
  return {
    floors: clampCount(opts?.floors ?? 10, 10, 40),
    perFloor: clampCount(opts?.perFloor ?? 8, 8, 14),
  };
}

/** Linhas da tabela `units` (espelho de vendas — /espelho). *
 * A estrutura do espelho é estática: `floors = [1..6]` (units-data.ts) —
 * andares fora desse intervalo não são renderizados pelo dashboard. */
export function makeSalesRows(opts?: FixtureOptions): Record<string, unknown>[] {
  const { perFloor } = resolveFixtureOptions(opts);
  const floors = Math.min(resolveFixtureOptions(opts).floors, 6);
  const rows: Record<string, unknown>[] = [];
  for (let andar = 1; andar <= floors; andar++) {
    for (let i = 1; i <= perFloor; i++) {
      const unidade = andar * 100 + i;
      const n = andar * perFloor + i;
      // tipo_area deve ser uma chave válida de areaTypes/typeColors: 66m²/67m²/69m²/100m²
      const tipo = n % 4 === 0 ? "66m²" : n % 4 === 1 ? "67m²" : n % 4 === 2 ? "69m²" : "100m²";
      rows.push({
        andar,
        unidade,
        vagas: 1 + (n % 2),
        area: n % 3 === 0 ? "66.5" : n % 3 === 1 ? "58.2" : "72.9",
        area_str: n % 3 === 0 ? "66,5 m²" : n % 3 === 1 ? "58,2 m²" : "72,9 m²",
        valor_venda: n % 7 === 0 ? null : 900000 + n * 1500,
        tipo_area: tipo,
        status: STATUS_CYCLE[n % 3],
        posicao_solar: SOL_CYCLE[n % 2],
        quartos: 2 + (n % 2),
      });
    }
  }
  return rows;
}

/** Linhas da tabela `villa_bianco_units` (/villa-bianco). */
export function makeVillaBiancoRows(opts?: FixtureOptions): Record<string, unknown>[] {
  const { floors, perFloor } = resolveFixtureOptions(opts);
  const rows: Record<string, unknown>[] = [];
  for (let andar = 1; andar <= floors; andar++) {
    for (let i = 1; i <= perFloor; i++) {
      const unidade = andar * 100 + i;
      const n = andar * perFloor + i;
      rows.push({
        bloco: "A",
        andar,
        unidade,
        vagas: 1 + (n % 2),
        area: n % 2 === 0 ? "88.4" : "104.7",
        area_str: n % 2 === 0 ? "88,4 m²" : "104,7 m²",
        valor_venda: n % 9 === 0 ? null : 1800000 + n * 2200,
        // tipologia deve ser chave de typeColors (villa-bianco)
        tipologia:
          andar === 1 && i <= 2
            ? "Garden 3 Quartos"
            : andar === floors && i > perFloor - 2
              ? "Cobertura 4 Quartos"
              : n % 2 === 0
                ? "3 Quartos"
                : "4 Quartos",
        status: STATUS_CYCLE[n % 3],
        quartos: 2 + (n % 2),
        is_cobertura: andar === floors && i > perFloor - 2,
        is_garden: andar === 1 && i <= 2,
      });
    }
  }
  return rows;
}

/** Linhas da tabela `moment_units` (/moment). Estrutura estática: 6 andares. */
export function makeMomentRows(opts?: FixtureOptions): Record<string, unknown>[] {
  const { perFloor } = resolveFixtureOptions(opts);
  const floors = Math.min(resolveFixtureOptions(opts).floors, 6);
  const rows: Record<string, unknown>[] = [];
  for (let andar = 1; andar <= floors; andar++) {
    for (let i = 1; i <= perFloor; i++) {
      const unidade = andar * 100 + i;
      const n = andar * perFloor + i;
      rows.push({
        andar,
        unidade,
        vagas: 1 + (n % 2),
        area: n % 2 === 0 ? "72.3" : "61.8",
        area_str: n % 2 === 0 ? "72,3 m²" : "61,8 m²",
        valor_venda: n % 8 === 0 ? null : 750000 + n * 1200,
        // tipologia deve ser chave de typeColors (moment)
        tipologia:
          andar === floors && i === perFloor
            ? "Cobertura"
            : n % 3 === 0
              ? "1 Suíte"
              : n % 3 === 1
                ? "1 Suíte + 2 Semissuítes"
                : "3 Suítes",
        status: STATUS_CYCLE[n % 3],
        quartos: 2 + (n % 2),
        is_cobertura: andar === floors && i === perFloor,
        posicao_solar: n % 3 === 0 ? "Face Norte" : n % 3 === 1 ? "Face Leste" : "Face Sul",
      });
    }
  }
  return rows;
}

/** Linhas da tabela `vitta_units` (/vitta) — andar é string + andar_num. *
 * Os rótulos de andar precisam bater com `vittaAndares` (vitta-data.ts). */
const VITTA_FLOOR_LABELS = [
  "1º andar", "2º Andar", "3º Andar", "4º Andar", "5º Andar", "6º Andar",
  "7º Andar", "8º Andar", "9º Andar", "10º Andar", "11º Andar", "12º Andar", "13º Andar",
];
export function makeVittaRows(opts?: FixtureOptions): Record<string, unknown>[] {
  const { perFloor } = resolveFixtureOptions(opts);
  const floors = Math.min(resolveFixtureOptions(opts).floors, VITTA_FLOOR_LABELS.length);
  const rows: Record<string, unknown>[] = [];
  for (let andar = 1; andar <= floors; andar++) {
    for (let i = 1; i <= perFloor; i++) {
      const unidade = andar * 100 + i;
      const n = andar * perFloor + i;
      rows.push({
        bloco: "A",
        andar: VITTA_FLOOR_LABELS[andar - 1],
        andar_num: andar,
        unidade,
        area: n % 2 === 0 ? "95.1" : "118.6",
        area_str: n % 2 === 0 ? "95,1 m²" : "118,6 m²",
        valor_venda: n % 11 === 0 ? null : 1400000 + n * 2000,
        // tipologia deve ser chave de typeColors (vitta) — há fallback, mas usar válidas
        tipologia:
          n % 5 === 0
            ? "Loja"
            : n % 3 === 0
              ? "2 quartos (suíte e varanda)"
              : n % 3 === 1
                ? "2 quartos (garden)"
                : "2 quartos",
        status: STATUS_CYCLE[n % 3],
      });
    }
  }
  return rows;
}

/** Linhas da tabela `projeto_units` (dashboard dinâmico — /empreendimento/[id]). */
export function makeProjetoRows(opts?: FixtureOptions): Record<string, unknown>[] {
  const { floors, perFloor } = resolveFixtureOptions(opts);
  const rows: Record<string, unknown>[] = [];
  for (let andar = 1; andar <= floors; andar++) {
    for (let i = 1; i <= perFloor; i++) {
      const n = andar * perFloor + i;
      rows.push({
        id: `harness-${n}`,
        empreendimento_id: "dev-harness",
        andar,
        unidade: String(andar * 100 + i),
        vagas: 1 + (n % 2),
        area: n % 2 === 0 ? 120.5 : 98.4,
        area_str: n % 2 === 0 ? "120,5 m²" : "98,4 m²",
        quartos: 2 + (n % 3),
        valor_venda: n % 6 === 0 ? null : 2500000 + n * 3000,
        status: STATUS_CYCLE[n % 3],
        posicao_solar: SOL_CYCLE[n % 2],
        tipologia: n % 2 === 0 ? "Tipo A" : "Tipo B",
        bloco: "Bloco 1",
        is_cobertura: andar === floors && i === perFloor,
        is_garden: andar === 1 && i <= 2,
        ordem: n,
      });
    }
  }
  return rows;
}
