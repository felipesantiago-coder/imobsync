// Moment - Dados estáticos de fallback
// Gerado a partir do Excel: Moment Atualizado.xlsx

export interface MomentUnit {
  andar: number;
  unidade: number;
  vagas: number;
  area: number;
  areaStr: string;
  valorVenda: number | null;
  valorStr: string;
  valorFormatado: string;
  tipologia: string;
  status: "disponivel" | "reservado" | "vendido";
  quartos: number;
  isCobertura: boolean;
  sol: string;
}

export const momentFloors = [1, 2, 3, 4, 5, 6] as const;
export const momentAndares = [1, 2, 3, 4, 5, 6] as const;

export const momentPavimentos: Record<number, string> = {
  1: "1º Pavimento",
  2: "2º Pavimento",
  3: "3º Pavimento",
  4: "4º Pavimento",
  5: "5º Pavimento",
  6: "6º Pavimento",
};

export const momentTipologias = ["1 Suíte", "3 Suítes", "1 Suíte + 2 Semissuítes", "Cobertura"] as const;

function fmtCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function formatMomentCurrency(value: number): string {
  return fmtCurrency(value);
}

// Raw row shape: valorStr/valorFormatado are derived from valorVenda in momentUnits below.
type RawMomentUnit = Omit<MomentUnit, "valorStr" | "valorFormatado">;

// Static fallback data
const rawData: RawMomentUnit[] = [
  { andar: 1, unidade: 101, vagas: 3, area: 112.3, areaStr: '112,3 m²', valorVenda: 2240814.84, tipologia: '1 Suíte + 2 Semissuítes', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 1, unidade: 102, vagas: 2, area: 89.34, areaStr: '89,34 m²', valorVenda: 1699023.48, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 1, unidade: 103, vagas: 2, area: 88.3, areaStr: '88,3 m²', valorVenda: 1647260.41, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Sul' },
  { andar: 1, unidade: 104, vagas: 2, area: 88.37, areaStr: '88,37 m²', valorVenda: 1680577.25, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 1, unidade: 105, vagas: 2, area: 89.33, areaStr: '89,33 m²', valorVenda: 1617936.55, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Sul' },
  { andar: 1, unidade: 106, vagas: 3, area: 104.85, areaStr: '104,85 m²', valorVenda: 2065538.37, tipologia: '3 Suítes', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 1, unidade: 107, vagas: 3, area: 104.81, areaStr: '104,81 m²', valorVenda: 2065538.37, tipologia: '3 Suítes', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 1, unidade: 108, vagas: 2, area: 88.32, areaStr: '88,32 m²', valorVenda: 1647633.60, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 1, unidade: 109, vagas: 2, area: 89.28, areaStr: '89,28 m²', valorVenda: null, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Sul' },
  { andar: 1, unidade: 110, vagas: 2, area: 89.39, areaStr: '89,39 m²', valorVenda: 1643309.45, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 1, unidade: 111, vagas: 2, area: 88.28, areaStr: '88,28 m²', valorVenda: 1622902.73, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Sul' },
  { andar: 1, unidade: 112, vagas: 3, area: 112.27, areaStr: '112,27 m²', valorVenda: 2191534.36, tipologia: '1 Suíte + 2 Semissuítes', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 2, unidade: 201, vagas: 3, area: 112.3, areaStr: '112,3 m²', valorVenda: 2307020.44, tipologia: '1 Suíte + 2 Semissuítes', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 2, unidade: 202, vagas: 2, area: 89.34, areaStr: '89,34 m²', valorVenda: 1749995.05, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 2, unidade: 203, vagas: 2, area: 88.3, areaStr: '88,3 m²', valorVenda: 1696678.02, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Sul' },
  { andar: 2, unidade: 204, vagas: 2, area: 88.37, areaStr: '88,37 m²', valorVenda: 1730993.86, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 2, unidade: 205, vagas: 2, area: 89.33, areaStr: '89,33 m²', valorVenda: 1666474.49, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Sul' },
  { andar: 2, unidade: 206, vagas: 3, area: 104.85, areaStr: '104,85 m²', valorVenda: 2126485.33, tipologia: '3 Suítes', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 2, unidade: 207, vagas: 3, area: 104.81, areaStr: '104,81 m²', valorVenda: 2126485.33, tipologia: '3 Suítes', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 2, unidade: 208, vagas: 2, area: 88.32, areaStr: '88,32 m²', valorVenda: 1697061.97, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 2, unidade: 209, vagas: 2, area: 89.28, areaStr: '89,28 m²', valorVenda: 1665542.15, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Sul' },
  { andar: 2, unidade: 210, vagas: 2, area: 89.39, areaStr: '89,39 m²', valorVenda: 1692607.70, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 2, unidade: 211, vagas: 2, area: 88.28, areaStr: '88,28 m²', valorVenda: 1671590.14, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Sul' },
  { andar: 2, unidade: 212, vagas: 3, area: 112.27, areaStr: '112,27 m²', valorVenda: 2256269.21, tipologia: '1 Suíte + 2 Semissuítes', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 3, unidade: 301, vagas: 3, area: 112.3, areaStr: '112,3 m²', valorVenda: 2329751.04, tipologia: '1 Suíte + 2 Semissuítes', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 3, unidade: 302, vagas: 2, area: 89.34, areaStr: '89,34 m²', valorVenda: null, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 3, unidade: 303, vagas: 2, area: 88.3, areaStr: '88,3 m²', valorVenda: 1699538.38, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Sul' },
  { andar: 3, unidade: 304, vagas: 2, area: 88.37, areaStr: '88,37 m²', valorVenda: 1748304.53, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 3, unidade: 305, vagas: 2, area: 89.33, areaStr: '89,33 m²', valorVenda: 1683139.88, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Sul' },
  { andar: 3, unidade: 306, vagas: 3, area: 104.85, areaStr: '104,85 m²', valorVenda: 2147411.39, tipologia: '3 Suítes', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 3, unidade: 307, vagas: 3, area: 104.81, areaStr: '104,81 m²', valorVenda: 2147411.39, tipologia: '3 Suítes', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 3, unidade: 308, vagas: 2, area: 88.32, areaStr: '88,32 m²', valorVenda: 1714032.76, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 3, unidade: 309, vagas: 2, area: 89.28, areaStr: '89,28 m²', valorVenda: 1682197.83, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Sul' },
  { andar: 3, unidade: 310, vagas: 2, area: 89.39, areaStr: '89,39 m²', valorVenda: 1709534.39, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 3, unidade: 311, vagas: 2, area: 88.28, areaStr: '88,28 m²', valorVenda: 1688306.10, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Sul' },
  { andar: 3, unidade: 312, vagas: 3, area: 112.27, areaStr: '112,27 m²', valorVenda: 2278494.88, tipologia: '1 Suíte + 2 Semissuítes', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 4, unidade: 401, vagas: 3, area: 112.3, areaStr: '112,3 m²', valorVenda: null, tipologia: '1 Suíte + 2 Semissuítes', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 4, unidade: 402, vagas: 2, area: 89.34, areaStr: '89,34 m²', valorVenda: null, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 4, unidade: 403, vagas: 2, area: 88.3, areaStr: '88,3 m²', valorVenda: 1716533.73, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Sul' },
  { andar: 4, unidade: 404, vagas: 2, area: 88.37, areaStr: '88,37 m²', valorVenda: 1765787.18, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 4, unidade: 405, vagas: 2, area: 89.33, areaStr: '89,33 m²', valorVenda: 1699970.88, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Sul' },
  { andar: 4, unidade: 406, vagas: 3, area: 104.85, areaStr: '104,85 m²', valorVenda: 2168545.09, tipologia: '3 Suítes', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 4, unidade: 407, vagas: 3, area: 104.81, areaStr: '104,81 m²', valorVenda: 2168545.09, tipologia: '3 Suítes', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 4, unidade: 408, vagas: 2, area: 88.32, areaStr: '88,32 m²', valorVenda: 1731173.48, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 4, unidade: 409, vagas: 2, area: 89.28, areaStr: '89,28 m²', valorVenda: 1699019.17, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Sul' },
  { andar: 4, unidade: 410, vagas: 2, area: 89.39, areaStr: '89,39 m²', valorVenda: 1726629.96, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 4, unidade: 411, vagas: 2, area: 88.28, areaStr: '88,28 m²', valorVenda: 1705188.74, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Sul' },
  { andar: 4, unidade: 412, vagas: 3, area: 112.27, areaStr: '112,27 m²', valorVenda: 2300943.47, tipologia: '1 Suíte + 2 Semissuítes', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 5, unidade: 501, vagas: 3, area: 112.3, areaStr: '112,3 m²', valorVenda: 2375896.22, tipologia: '1 Suíte + 2 Semissuítes', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 5, unidade: 502, vagas: 2, area: 89.34, areaStr: '89,34 m²', valorVenda: 1820001.05, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 5, unidade: 503, vagas: 2, area: 88.3, areaStr: '88,3 m²', valorVenda: 1733698.66, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Sul' },
  { andar: 5, unidade: 504, vagas: 2, area: 88.37, areaStr: '88,37 m²', valorVenda: 1800424.57, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 5, unidade: 505, vagas: 2, area: 89.33, areaStr: '89,33 m²', valorVenda: 1716970.76, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Sul' },
  { andar: 5, unidade: 506, vagas: 3, area: 104.85, areaStr: '104,85 m²', valorVenda: 2189891.69, tipologia: '3 Suítes', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 5, unidade: 507, vagas: 3, area: 104.81, areaStr: '104,81 m²', valorVenda: 2189891.69, tipologia: '3 Suítes', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 5, unidade: 508, vagas: 2, area: 88.32, areaStr: '88,32 m²', valorVenda: 1765464.56, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 5, unidade: 509, vagas: 2, area: 89.28, areaStr: '89,28 m²', valorVenda: 1716009.34, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Sul' },
  { andar: 5, unidade: 510, vagas: 2, area: 89.39, areaStr: '89,39 m²', valorVenda: 1743895.40, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 5, unidade: 511, vagas: 2, area: 88.28, areaStr: '88,28 m²', valorVenda: 1722241.27, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Sul' },
  { andar: 5, unidade: 512, vagas: 3, area: 112.27, areaStr: '112,27 m²', valorVenda: 2323616.04, tipologia: '1 Suíte + 2 Semissuítes', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 6, unidade: 601, vagas: 3, area: 112.31, areaStr: '112,31 m²', valorVenda: 2375896.22, tipologia: '1 Suíte + 2 Semissuítes', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 6, unidade: 602, vagas: 3, area: 89.31, areaStr: '89,31 m²', valorVenda: 1836980.47, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Norte' },
  { andar: 6, unidade: 603, vagas: 2, area: 88.3, areaStr: '88,3 m²', valorVenda: 1750539.38, tipologia: '1 Suíte', status: "disponivel", quartos: 3, isCobertura: false, sol: 'Face Sul' },
  { andar: 6, unidade: 604, vagas: 3, area: 186.23, areaStr: '186,23 m²', valorVenda: 2915961.53, tipologia: 'Cobertura', status: "disponivel", quartos: 3, isCobertura: true, sol: 'Face Norte' },
  { andar: 6, unidade: 605, vagas: 3, area: 197.03, areaStr: '197,03 m²', valorVenda: 2937899.59, tipologia: 'Cobertura', status: "disponivel", quartos: 3, isCobertura: true, sol: 'Face Sul' },
  { andar: 6, unidade: 606, vagas: 3, area: 210.37, areaStr: '210,37 m²', valorVenda: 3351550.17, tipologia: 'Cobertura', status: "disponivel", quartos: 3, isCobertura: true, sol: 'Face Norte' },
  { andar: 6, unidade: 607, vagas: 3, area: 210.55, areaStr: '210,55 m²', valorVenda: 3354389.18, tipologia: 'Cobertura', status: "disponivel", quartos: 3, isCobertura: true, sol: 'Face Norte' },
  { andar: 6, unidade: 608, vagas: 3, area: 194.95, areaStr: '194,95 m²', valorVenda: 2993441.59, tipologia: 'Cobertura', status: "disponivel", quartos: 3, isCobertura: true, sol: 'Face Norte' },
  { andar: 6, unidade: 609, vagas: 3, area: 182.67, areaStr: '182,67 m²', valorVenda: 2726253.37, tipologia: 'Cobertura', status: "disponivel", quartos: 3, isCobertura: true, sol: 'Face Sul' },
  { andar: 6, unidade: 610, vagas: 3, area: 178.07, areaStr: '178,07 m²', valorVenda: 2697824.16, tipologia: 'Cobertura', status: "disponivel", quartos: 3, isCobertura: true, sol: 'Face Norte' },
  { andar: 6, unidade: 611, vagas: 3, area: 175.01, areaStr: '175,01 m²', valorVenda: 2652046.82, tipologia: 'Cobertura', status: "disponivel", quartos: 3, isCobertura: true, sol: 'Face Sul' },
  { andar: 6, unidade: 612, vagas: 3, area: 261.4, areaStr: '261,4 m²', valorVenda: 4156307.72, tipologia: 'Cobertura', status: "disponivel", quartos: 3, isCobertura: true, sol: 'Face Norte' }
];

export const momentUnits: MomentUnit[] = rawData.map((u) => ({
  ...u,
  valorStr: u.valorVenda ? u.valorVenda.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "Consulte",
  valorFormatado: u.valorVenda ? fmtCurrency(u.valorVenda) : "Consulte o valor",
}));

/**
 * Transforma uma linha bruta do PostgREST (`select("*")` em `moment_units`)
 * no formato consumido pelo dashboard. Porta exata do mapeamento inline
 * anterior (audit P1.4).
 */
export function mapRowToMomentUnit(row: Record<string, unknown>): MomentUnit {
  return {
    andar: row.andar as number,
    unidade: row.unidade as number,
    vagas: row.vagas as number,
    area: Number(row.area),
    areaStr: row.area_str as string,
    valorVenda: row.valor_venda as number | null,
    valorStr: row.valor_venda ? Number(row.valor_venda).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "Consulte",
    valorFormatado: row.valor_venda ? formatMomentCurrency(Number(row.valor_venda)) : "Consulte o valor",
    tipologia: row.tipologia as MomentUnit["tipologia"],
    status: row.status as MomentUnit["status"],
    quartos: row.quartos as number,
    isCobertura: row.is_cobertura as boolean,
    sol: row.posicao_solar as string,
  };
}
