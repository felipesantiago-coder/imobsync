// Villa Bianco - Dados das unidades (123 unidades, 4 blocos)
// Gerado automaticamente a partir da tabela de preços

export interface VillaBiancoUnit {
  bloco: "A" | "B" | "C" | "D";
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
  quartos: 2 | 3 | 4;
  isCobertura: boolean;
  isGarden: boolean;
}

export type VillaBiancoBloco = "A" | "B" | "C" | "D";

export const villaBiancoBlocos: VillaBiancoBloco[] = ["A", "B", "C", "D"];

export const villaBiancoTipologias = [
  "2 Quartos",
  "3 Quartos",
  "4 Quartos",
  "Cobertura 3 Quartos",
  "Cobertura 4 Quartos",
  "Garden 2 Quartos",
  "Garden 3 Quartos",
  "Garden 4 Quartos",
] as const;

export const villaBiancoPavimentos = [
  "Térreo", "1º pavimento", "2º pavimento", "3º pavimento",
  "4º pavimento", "5º pavimento", "6º pavimento", "7º pavimento", "8º pavimento",
] as const;

export function formatVBCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export const villaBiancoUnits: VillaBiancoUnit[] = [
  { bloco: "A", andar: 0, unidade: 1, vagas: 3, area: 247.88, areaStr: "247.88 m²", valorVenda: 3521626.21, valorStr: "3,521,626.21", valorFormatado: "R$ 3.521.626,21", tipologia: "Garden 3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: true },
  { bloco: "A", andar: 0, unidade: 2, vagas: 3, area: 260.93, areaStr: "260.93 m²", valorVenda: 3667178.31, valorStr: "3,667,178.31", valorFormatado: "R$ 3.667.178,31", tipologia: "Garden 3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: true },
  { bloco: "A", andar: 1, unidade: 101, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2181058.48, valorStr: "2,181,058.48", valorFormatado: "R$ 2.181.058,48", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 1, unidade: 102, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2170458.19, valorStr: "2,170,458.19", valorFormatado: "R$ 2.170.458,19", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 1, unidade: 103, vagas: 2, area: 88.1, areaStr: "88.10 m²", valorVenda: 1500340.12, valorStr: "1,500,340.12", valorFormatado: "R$ 1.500.340,12", tipologia: "2 Quartos", status: "disponivel" as const, quartos: 2 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 2, unidade: 201, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2234102.41, valorStr: "2,234,102.41", valorFormatado: "R$ 2.234.102,41", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 2, unidade: 202, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2223495.54, valorStr: "2,223,495.54", valorFormatado: "R$ 2.223.495,54", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 2, unidade: 203, vagas: 2, area: 86.24, areaStr: "86.24 m²", valorVenda: 1504709.39, valorStr: "1,504,709.39", valorFormatado: "R$ 1.504.709,39", tipologia: "2 Quartos", status: "disponivel" as const, quartos: 2 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 2, unidade: 204, vagas: 2, area: 104.05, areaStr: "104.05 m²", valorVenda: 1815436.72, valorStr: "1,815,436.72", valorFormatado: "R$ 1.815.436,72", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 2, unidade: 205, vagas: 2, area: 104.05, areaStr: "104.05 m²", valorVenda: 1824200.5, valorStr: "1,824,200.50", valorFormatado: "R$ 1.824.200,50", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 2, unidade: 206, vagas: 2, area: 86.24, areaStr: "86.24 m²", valorVenda: 1511957.52, valorStr: "1,511,957.52", valorFormatado: "R$ 1.511.957,52", tipologia: "2 Quartos", status: "disponivel" as const, quartos: 2 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 3, unidade: 301, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2254518.35, valorStr: "2,254,518.35", valorFormatado: "R$ 2.254.518,35", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 3, unidade: 302, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2243912.48, valorStr: "2,243,912.48", valorFormatado: "R$ 2.243.912,48", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 3, unidade: 303, vagas: 2, area: 86.24, areaStr: "86.24 m²", valorVenda: 1519200.82, valorStr: "1,519,200.82", valorFormatado: "R$ 1.519.200,82", tipologia: "2 Quartos", status: "disponivel" as const, quartos: 2 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 3, unidade: 304, vagas: 2, area: 104.05, areaStr: "104.05 m²", valorVenda: 1832746.67, valorStr: "1,832,746.67", valorFormatado: "R$ 1.832.746,67", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 3, unidade: 305, vagas: 2, area: 104.05, areaStr: "104.05 m²", valorVenda: 1841508.74, valorStr: "1,841,508.74", valorFormatado: "R$ 1.841.508,74", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 3, unidade: 306, vagas: 2, area: 86.24, areaStr: "86.24 m²", valorVenda: 1526453.55, valorStr: "1,526,453.55", valorFormatado: "R$ 1.526.453,55", tipologia: "2 Quartos", status: "disponivel" as const, quartos: 2 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 4, unidade: 401, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2276534.9, valorStr: "2,276,534.90", valorFormatado: "R$ 2.276.534,90", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 4, unidade: 402, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2265928.02, valorStr: "2,265,928.02", valorFormatado: "R$ 2.265.928,02", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 4, unidade: 403, vagas: 2, area: 86.24, areaStr: "86.24 m²", valorVenda: 1533381.45, valorStr: "1,533,381.45", valorFormatado: "R$ 1.533.381,45", tipologia: "2 Quartos", status: "disponivel" as const, quartos: 2 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 4, unidade: 404, vagas: 2, area: 104.05, areaStr: "104.05 m²", valorVenda: 1850056.61, valorStr: "1,850,056.61", valorFormatado: "R$ 1.850.056,61", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 4, unidade: 405, vagas: 2, area: 104.05, areaStr: "104.05 m²", valorVenda: 1858818.68, valorStr: "1,858,818.68", valorFormatado: "R$ 1.858.818,68", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 4, unidade: 406, vagas: 2, area: 86.24, areaStr: "86.24 m²", valorVenda: 1540957.29, valorStr: "1,540,957.29", valorFormatado: "R$ 1.540.957,29", tipologia: "2 Quartos", status: "disponivel" as const, quartos: 2 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 5, unidade: 501, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2297751.44, valorStr: "2,297,751.44", valorFormatado: "R$ 2.297.751,44", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 5, unidade: 502, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2287145.14, valorStr: "2,287,145.14", valorFormatado: "R$ 2.287.145,14", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 5, unidade: 503, vagas: 2, area: 86.24, areaStr: "86.24 m²", valorVenda: 1548195.66, valorStr: "1,548,195.66", valorFormatado: "R$ 1.548.195,66", tipologia: "2 Quartos", status: "disponivel" as const, quartos: 2 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 5, unidade: 504, vagas: 2, area: 104.05, areaStr: "104.05 m²", valorVenda: 1867366.36, valorStr: "1,867,366.36", valorFormatado: "R$ 1.867.366,36", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 5, unidade: 505, vagas: 2, area: 104.05, areaStr: "104.05 m²", valorVenda: 1876125.94, valorStr: "1,876,125.94", valorFormatado: "R$ 1.876.125,94", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 5, unidade: 506, vagas: 2, area: 86.24, areaStr: "86.24 m²", valorVenda: 1555447.6, valorStr: "1,555,447.60", valorFormatado: "R$ 1.555.447,60", tipologia: "2 Quartos", status: "disponivel" as const, quartos: 2 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 6, unidade: 601, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2312600.02, valorStr: "2,312,600.02", valorFormatado: "R$ 2.312.600,02", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 6, unidade: 602, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2301993.14, valorStr: "2,301,993.14", valorFormatado: "R$ 2.301.993,14", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 6, unidade: 603, vagas: 2, area: 86.24, areaStr: "86.24 m²", valorVenda: 1558285.05, valorStr: "1,558,285.05", valorFormatado: "R$ 1.558.285,05", tipologia: "2 Quartos", status: "disponivel" as const, quartos: 2 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 6, unidade: 604, vagas: 2, area: 104.05, areaStr: "104.05 m²", valorVenda: 1880679.34, valorStr: "1,880,679.34", valorFormatado: "R$ 1.880.679,34", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 6, unidade: 605, vagas: 2, area: 104.05, areaStr: "104.05 m²", valorVenda: 1889439.91, valorStr: "1,889,439.91", valorFormatado: "R$ 1.889.439,91", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 6, unidade: 606, vagas: 2, area: 86.24, areaStr: "86.24 m²", valorVenda: 1565613.57, valorStr: "1,565,613.57", valorFormatado: "R$ 1.565.613,57", tipologia: "2 Quartos", status: "disponivel" as const, quartos: 2 as const, isCobertura: false, isGarden: false },
  { bloco: "A", andar: 7, unidade: 701, vagas: 4, area: 167.86, areaStr: "167.86 m²", valorVenda: 3095222.27, valorStr: "3,095,222.27", valorFormatado: "R$ 3.095.222,27", tipologia: "Cobertura 3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: true, isGarden: false },
  { bloco: "A", andar: 7, unidade: 702, vagas: 4, area: 167.86, areaStr: "167.86 m²", valorVenda: 3081110.64, valorStr: "3,081,110.64", valorFormatado: "R$ 3.081.110,64", tipologia: "Cobertura 3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: true, isGarden: false },
  { bloco: "A", andar: 7, unidade: 703, vagas: 3, area: 153.33, areaStr: "153.33 m²", valorVenda: 2788693.66, valorStr: "2,788,693.66", valorFormatado: "R$ 2.788.693,66", tipologia: "Cobertura 3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: true, isGarden: false },
  { bloco: "A", andar: 7, unidade: 704, vagas: 3, area: 154.03, areaStr: "154.03 m²", valorVenda: 2814388.44, valorStr: "2,814,388.44", valorFormatado: "R$ 2.814.388,44", tipologia: "Cobertura 3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: true, isGarden: false },
  { bloco: "B", andar: 0, unidade: 1, vagas: 3, area: 267.09, areaStr: "267.09 m²", valorVenda: 3862320.89, valorStr: "3,862,320.89", valorFormatado: "R$ 3.862.320,89", tipologia: "Garden 4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: true },
  { bloco: "B", andar: 0, unidade: 2, vagas: 3, area: 267.09, areaStr: "267.09 m²", valorVenda: 3847216.73, valorStr: "3,847,216.73", valorFormatado: "R$ 3.847.216,73", tipologia: "Garden 4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: true },
  { bloco: "B", andar: 1, unidade: 101, vagas: 3, area: 147.2, areaStr: "147.20 m²", valorVenda: 2494120.81, valorStr: "2,494,120.81", valorFormatado: "R$ 2.494.120,81", tipologia: "4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: false },
  { bloco: "B", andar: 1, unidade: 102, vagas: 3, area: 147.2, areaStr: "147.20 m²", valorVenda: 2484202.89, valorStr: "2,484,202.89", valorFormatado: "R$ 2.484.202,89", tipologia: "4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: false },
  { bloco: "B", andar: 2, unidade: 201, vagas: 3, area: 147.2, areaStr: "147.20 m²", valorVenda: 2555918.9, valorStr: "2,555,918.90", valorFormatado: "R$ 2.555.918,90", tipologia: "4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: false },
  { bloco: "B", andar: 2, unidade: 202, vagas: 3, area: 147.2, areaStr: "147.20 m²", valorVenda: 2546000.8, valorStr: "2,546,000.80", valorFormatado: "R$ 2.546.000,80", tipologia: "4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: false },
  { bloco: "B", andar: 3, unidade: 301, vagas: 3, area: 147.2, areaStr: "147.20 m²", valorVenda: 2580708.01, valorStr: "2,580,708.01", valorFormatado: "R$ 2.580.708,01", tipologia: "4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: false },
  { bloco: "B", andar: 3, unidade: 302, vagas: 3, area: 147.2, areaStr: "147.20 m²", valorVenda: 2570809.04, valorStr: "2,570,809.04", valorFormatado: "R$ 2.570.809,04", tipologia: "4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: false },
  { bloco: "B", andar: 4, unidade: 401, vagas: 3, area: 147.2, areaStr: "147.20 m²", valorVenda: 2605449.51, valorStr: "2,605,449.51", valorFormatado: "R$ 2.605.449,51", tipologia: "4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: false },
  { bloco: "B", andar: 4, unidade: 402, vagas: 3, area: 147.2, areaStr: "147.20 m²", valorVenda: 2595550.87, valorStr: "2,595,550.87", valorFormatado: "R$ 2.595.550,87", tipologia: "4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: false },
  { bloco: "B", andar: 5, unidade: 501, vagas: 3, area: 147.2, areaStr: "147.20 m²", valorVenda: 2630192.64, valorStr: "2,630,192.64", valorFormatado: "R$ 2.630.192,64", tipologia: "4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: false },
  { bloco: "B", andar: 5, unidade: 502, vagas: 3, area: 147.2, areaStr: "147.20 m²", valorVenda: 2620292.78, valorStr: "2,620,292.78", valorFormatado: "R$ 2.620.292,78", tipologia: "4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: false },
  { bloco: "B", andar: 6, unidade: 601, vagas: 3, area: 147.2, areaStr: "147.20 m²", valorVenda: 2647532.4, valorStr: "2,647,532.40", valorFormatado: "R$ 2.647.532,40", tipologia: "4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: false },
  { bloco: "B", andar: 6, unidade: 602, vagas: 3, area: 147.2, areaStr: "147.20 m²", valorVenda: 2637631.94, valorStr: "2,637,631.94", valorFormatado: "R$ 2.637.631,94", tipologia: "4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: false },
  { bloco: "B", andar: 7, unidade: 701, vagas: 3, area: 147.2, areaStr: "147.20 m²", valorVenda: 2664876.39, valorStr: "2,664,876.39", valorFormatado: "R$ 2.664.876,39", tipologia: "4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: false },
  { bloco: "B", andar: 7, unidade: 702, vagas: 3, area: 147.2, areaStr: "147.20 m²", valorVenda: 2654975.13, valorStr: "2,654,975.13", valorFormatado: "R$ 2.654.975,13", tipologia: "4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: false },
  { bloco: "B", andar: 8, unidade: 801, vagas: 4, area: 295.42, areaStr: "295.42 m²", valorVenda: 5344143.91, valorStr: "5,344,143.91", valorFormatado: "R$ 5.344.143,91", tipologia: "Cobertura 4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: true, isGarden: false },
  { bloco: "C", andar: 0, unidade: 1, vagas: 3, area: 267.09, areaStr: "267.09 m²", valorVenda: 3968435.65, valorStr: "3,968,435.65", valorFormatado: "R$ 3.968.435,65", tipologia: "Garden 4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: true },
  { bloco: "C", andar: 0, unidade: 2, vagas: 3, area: 267.09, areaStr: "267.09 m²", valorVenda: 3984009.91, valorStr: "3,984,009.91", valorFormatado: "R$ 3.984.009,91", tipologia: "Garden 4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: true },
  { bloco: "C", andar: 1, unidade: 101, vagas: 3, area: 147.2, areaStr: "147.20 m²", valorVenda: 2484202.89, valorStr: "2,484,202.89", valorFormatado: "R$ 2.484.202,89", tipologia: "4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: false },
  { bloco: "C", andar: 1, unidade: 102, vagas: 3, area: 147.2, areaStr: "147.20 m²", valorVenda: 2494120.81, valorStr: "2,494,120.81", valorFormatado: "R$ 2.494.120,81", tipologia: "4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: false },
  { bloco: "C", andar: 2, unidade: 201, vagas: 3, area: 147.2, areaStr: "147.20 m²", valorVenda: 2546000.8, valorStr: "2,546,000.80", valorFormatado: "R$ 2.546.000,80", tipologia: "4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: false },
  { bloco: "C", andar: 2, unidade: 202, vagas: 3, area: 147.2, areaStr: "147.20 m²", valorVenda: 2555918.9, valorStr: "2,555,918.90", valorFormatado: "R$ 2.555.918,90", tipologia: "4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: false },
  { bloco: "C", andar: 3, unidade: 301, vagas: 3, area: 147.2, areaStr: "147.20 m²", valorVenda: 2570809.04, valorStr: "2,570,809.04", valorFormatado: "R$ 2.570.809,04", tipologia: "4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: false },
  { bloco: "C", andar: 3, unidade: 302, vagas: 3, area: 147.2, areaStr: "147.20 m²", valorVenda: 2580708.01, valorStr: "2,580,708.01", valorFormatado: "R$ 2.580.708,01", tipologia: "4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: false },
  { bloco: "C", andar: 4, unidade: 401, vagas: 3, area: 147.2, areaStr: "147.20 m²", valorVenda: 2595550.87, valorStr: "2,595,550.87", valorFormatado: "R$ 2.595.550,87", tipologia: "4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: false },
  { bloco: "C", andar: 4, unidade: 402, vagas: 3, area: 147.2, areaStr: "147.20 m²", valorVenda: 2605449.51, valorStr: "2,605,449.51", valorFormatado: "R$ 2.605.449,51", tipologia: "4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: false },
  { bloco: "C", andar: 5, unidade: 501, vagas: 3, area: 147.2, areaStr: "147.20 m²", valorVenda: 2620292.78, valorStr: "2,620,292.78", valorFormatado: "R$ 2.620.292,78", tipologia: "4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: false },
  { bloco: "C", andar: 5, unidade: 502, vagas: 3, area: 147.2, areaStr: "147.20 m²", valorVenda: 2630192.64, valorStr: "2,630,192.64", valorFormatado: "R$ 2.630.192,64", tipologia: "4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: false },
  { bloco: "C", andar: 6, unidade: 601, vagas: 3, area: 147.2, areaStr: "147.20 m²", valorVenda: 2637631.94, valorStr: "2,637,631.94", valorFormatado: "R$ 2.637.631,94", tipologia: "4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: false },
  { bloco: "C", andar: 6, unidade: 602, vagas: 3, area: 147.2, areaStr: "147.20 m²", valorVenda: 2647532.4, valorStr: "2,647,532.40", valorFormatado: "R$ 2.647.532,40", tipologia: "4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: false },
  { bloco: "C", andar: 7, unidade: 701, vagas: 3, area: 147.2, areaStr: "147.20 m²", valorVenda: 2654975.13, valorStr: "2,654,975.13", valorFormatado: "R$ 2.654.975,13", tipologia: "4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: false },
  { bloco: "C", andar: 7, unidade: 702, vagas: 3, area: 147.2, areaStr: "147.20 m²", valorVenda: 2664876.39, valorStr: "2,664,876.39", valorFormatado: "R$ 2.664.876,39", tipologia: "4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: false, isGarden: false },
  { bloco: "C", andar: 8, unidade: 801, vagas: 4, area: 295.42, areaStr: "295.42 m²", valorVenda: 5344143.91, valorStr: "5,344,143.91", valorFormatado: "R$ 5.344.143,91", tipologia: "Cobertura 4 Quartos", status: "disponivel" as const, quartos: 4 as const, isCobertura: true, isGarden: false },
  { bloco: "D", andar: 0, unidade: 1, vagas: 3, area: 229.89, areaStr: "229.89 m²", valorVenda: 3378711.77, valorStr: "3,378,711.77", valorFormatado: "R$ 3.378.711,77", tipologia: "Garden 3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: true },
  { bloco: "D", andar: 0, unidade: 2, vagas: 3, area: 351.87, areaStr: "351.87 m²", valorVenda: 4644009.54, valorStr: "4,644,009.54", valorFormatado: "R$ 4.644.009,54", tipologia: "Garden 3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: true },
  { bloco: "D", andar: 0, unidade: 3, vagas: 2, area: 181.73, areaStr: "181.73 m²", valorVenda: 2599030.48, valorStr: "2,599,030.48", valorFormatado: "R$ 2.599.030,48", tipologia: "Garden 2 Quartos", status: "disponivel" as const, quartos: 2 as const, isCobertura: false, isGarden: true },
  { bloco: "D", andar: 0, unidade: 4, vagas: 3, area: 351.87, areaStr: "351.87 m²", valorVenda: 4709302.99, valorStr: "4,709,302.99", valorFormatado: "R$ 4.709.302,99", tipologia: "Garden 3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: true },
  { bloco: "D", andar: 0, unidade: 5, vagas: 3, area: 245.52, areaStr: "245.52 m²", valorVenda: 3535624.39, valorStr: "3,535,624.39", valorFormatado: "R$ 3.535.624,39", tipologia: "Garden 3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: true },
  { bloco: "D", andar: 1, unidade: 101, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2136525.32, valorStr: "2,136,525.32", valorFormatado: "R$ 2.136.525,32", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 1, unidade: 102, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2147113.83, valorStr: "2,147,113.83", valorFormatado: "R$ 2.147.113,83", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 1, unidade: 103, vagas: 2, area: 85.71, areaStr: "85.71 m²", valorVenda: 1458002.21, valorStr: "1,458,002.21", valorFormatado: "R$ 1.458.002,21", tipologia: "2 Quartos", status: "disponivel" as const, quartos: 2 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 1, unidade: 104, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2168330.54, valorStr: "2,168,330.54", valorFormatado: "R$ 2.168.330,54", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 1, unidade: 105, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2157724.28, valorStr: "2,157,724.28", valorFormatado: "R$ 2.157.724,28", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 2, unidade: 201, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2189548.48, valorStr: "2,189,548.48", valorFormatado: "R$ 2.189.548,48", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 2, unidade: 202, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2200154.64, valorStr: "2,200,154.64", valorFormatado: "R$ 2.200.154,64", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 2, unidade: 203, vagas: 2, area: 85.71, areaStr: "85.71 m²", valorVenda: 1494026.29, valorStr: "1,494,026.29", valorFormatado: "R$ 1.494.026,29", tipologia: "2 Quartos", status: "disponivel" as const, quartos: 2 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 2, unidade: 204, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2221373.17, valorStr: "2,221,373.17", valorFormatado: "R$ 2.221.373,17", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 2, unidade: 205, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2210765.62, valorStr: "2,210,765.62", valorFormatado: "R$ 2.210.765,62", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 2, unidade: 206, vagas: 2, area: 85.71, areaStr: "85.71 m²", valorVenda: 1486781.3, valorStr: "1,486,781.30", valorFormatado: "R$ 1.486.781,30", tipologia: "2 Quartos", status: "disponivel" as const, quartos: 2 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 3, unidade: 301, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2210765.62, valorStr: "2,210,765.62", valorFormatado: "R$ 2.210.765,62", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 3, unidade: 302, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2221373.17, valorStr: "2,221,373.17", valorFormatado: "R$ 2.221.373,17", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 3, unidade: 303, vagas: 2, area: 85.71, areaStr: "85.71 m²", valorVenda: 1508424.02, valorStr: "1,508,424.02", valorFormatado: "R$ 1.508.424,02", tipologia: "2 Quartos", status: "disponivel" as const, quartos: 2 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 3, unidade: 304, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2242588.83, valorStr: "2,242,588.83", valorFormatado: "R$ 2.242.588,83", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 3, unidade: 305, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2231980.17, valorStr: "2,231,980.17", valorFormatado: "R$ 2.231.980,17", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 3, unidade: 306, vagas: 2, area: 85.71, areaStr: "85.71 m²", valorVenda: 1501224.65, valorStr: "1,501,224.65", valorFormatado: "R$ 1.501.224,65", tipologia: "2 Quartos", status: "disponivel" as const, quartos: 2 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 4, unidade: 401, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2231980.17, valorStr: "2,231,980.17", valorFormatado: "R$ 2.231.980,17", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 4, unidade: 402, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2242588.83, valorStr: "2,242,588.83", valorFormatado: "R$ 2.242.588,83", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 4, unidade: 403, vagas: 2, area: 85.71, areaStr: "85.71 m²", valorVenda: 1522814.76, valorStr: "1,522,814.76", valorFormatado: "R$ 1.522.814,76", tipologia: "2 Quartos", status: "disponivel" as const, quartos: 2 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 4, unidade: 404, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2263805.77, valorStr: "2,263,805.77", valorFormatado: "R$ 2.263.805,77", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 4, unidade: 405, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2253196.3, valorStr: "2,253,196.30", valorFormatado: "R$ 2.253.196,30", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 4, unidade: 406, vagas: 2, area: 85.71, areaStr: "85.71 m²", valorVenda: 1516411.59, valorStr: "1,516,411.59", valorFormatado: "R$ 1.516.411,59", tipologia: "2 Quartos", status: "disponivel" as const, quartos: 2 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 5, unidade: 501, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2253196.3, valorStr: "2,253,196.30", valorFormatado: "R$ 2.253.196,30", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 5, unidade: 502, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2263805.77, valorStr: "2,263,805.77", valorFormatado: "R$ 2.263.805,77", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 5, unidade: 503, vagas: 2, area: 85.71, areaStr: "85.71 m²", valorVenda: 1537221.71, valorStr: "1,537,221.71", valorFormatado: "R$ 1.537.221,71", tipologia: "2 Quartos", status: "disponivel" as const, quartos: 2 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 5, unidade: 504, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2285022.51, valorStr: "2,285,022.51", valorFormatado: "R$ 2.285.022,51", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 5, unidade: 505, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2274412.83, valorStr: "2,274,412.83", valorFormatado: "R$ 2.274.412,83", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 5, unidade: 506, vagas: 2, area: 85.71, areaStr: "85.71 m²", valorVenda: 1530238.74, valorStr: "1,530,238.74", valorFormatado: "R$ 1.530.238,74", tipologia: "2 Quartos", status: "disponivel" as const, quartos: 2 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 6, unidade: 601, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2268024.3, valorStr: "2,268,024.30", valorFormatado: "R$ 2.268.024,30", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 6, unidade: 602, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2278416.48, valorStr: "2,278,416.48", valorFormatado: "R$ 2.278.416,48", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 6, unidade: 603, vagas: 2, area: 85.71, areaStr: "85.71 m²", valorVenda: 1547366.3, valorStr: "1,547,366.30", valorFormatado: "R$ 1.547.366,30", tipologia: "2 Quartos", status: "disponivel" as const, quartos: 2 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 6, unidade: 604, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2299952.29, valorStr: "2,299,952.29", valorFormatado: "R$ 2.299.952,29", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 6, unidade: 605, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2289344.82, valorStr: "2,289,344.82", valorFormatado: "R$ 2.289.344,82", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 6, unidade: 606, vagas: 2, area: 85.71, areaStr: "85.71 m²", valorVenda: 1540543.74, valorStr: "1,540,543.74", valorFormatado: "R$ 1.540.543,74", tipologia: "2 Quartos", status: "disponivel" as const, quartos: 2 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 7, unidade: 701, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2282982.86, valorStr: "2,282,982.86", valorFormatado: "R$ 2.282.982,86", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 7, unidade: 702, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2293388.55, valorStr: "2,293,388.55", valorFormatado: "R$ 2.293.388,55", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 7, unidade: 703, vagas: 2, area: 85.71, areaStr: "85.71 m²", valorVenda: 1557514.33, valorStr: "1,557,514.33", valorFormatado: "R$ 1.557.514,33", tipologia: "2 Quartos", status: "disponivel" as const, quartos: 2 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 7, unidade: 704, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2314724.67, valorStr: "2,314,724.67", valorFormatado: "R$ 2.314.724,67", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 7, unidade: 705, vagas: 3, area: 126.22, areaStr: "126.22 m²", valorVenda: 2304115.0, valorStr: "2,304,115.00", valorFormatado: "R$ 2.304.115,00", tipologia: "3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 7, unidade: 706, vagas: 2, area: 85.71, areaStr: "85.71 m²", valorVenda: 1550370.13, valorStr: "1,550,370.13", valorFormatado: "R$ 1.550.370,13", tipologia: "2 Quartos", status: "disponivel" as const, quartos: 2 as const, isCobertura: false, isGarden: false },
  { bloco: "D", andar: 8, unidade: 801, vagas: 4, area: 173.31, areaStr: "173.31 m²", valorVenda: 3155513.68, valorStr: "3,155,513.68", valorFormatado: "R$ 3.155.513,68", tipologia: "Cobertura 3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: true, isGarden: false },
  { bloco: "D", andar: 8, unidade: 802, vagas: 4, area: 173.31, areaStr: "173.31 m²", valorVenda: 3170008.06, valorStr: "3,170,008.06", valorFormatado: "R$ 3.170.008,06", tipologia: "Cobertura 3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: true, isGarden: false },
  { bloco: "D", andar: 8, unidade: 803, vagas: 4, area: 167.86, areaStr: "167.86 m²", valorVenda: 3098484.06, valorStr: "3,098,484.06", valorFormatado: "R$ 3.098.484,06", tipologia: "Cobertura 3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: true, isGarden: false },
  { bloco: "D", andar: 8, unidade: 804, vagas: 4, area: 167.86, areaStr: "167.86 m²", valorVenda: 3084343.94, valorStr: "3,084,343.94", valorFormatado: "R$ 3.084.343,94", tipologia: "Cobertura 3 Quartos", status: "disponivel" as const, quartos: 3 as const, isCobertura: true, isGarden: false },
];

export function getVillaBiancoStats() {
  const total = villaBiancoUnits.length;
  const disponiveis = villaBiancoUnits.filter(u => u.status === "disponivel").length;
  const reservadas = villaBiancoUnits.filter(u => u.status === "reservado").length;
  const vendidas = villaBiancoUnits.filter(u => u.status === "vendido").length;
  return { total, disponiveis, reservadas, vendidas };
}

export function getVillaBiancoUnitsByBloco(bloco: VillaBiancoBloco) {
  return villaBiancoUnits.filter(u => u.bloco === bloco).sort((a, b) => a.andar - b.andar || a.unidade - b.unidade);
}

/**
 * Transforma uma linha bruta do PostgREST (`select("*")` em
 * `villa_bianco_units`) no formato consumido pelo dashboard. Porta exata do
 * mapeamento inline anterior (audit P1.4).
 */
export function mapRowToVillaBiancoUnit(row: Record<string, unknown>): VillaBiancoUnit {
  return {
    bloco: row.bloco as VillaBiancoBloco,
    andar: row.andar as number,
    unidade: row.unidade as number,
    vagas: row.vagas as number,
    area: Number(row.area),
    areaStr: row.area_str as string,
    valorVenda: row.valor_venda as number | null,
    valorStr: row.valor_venda ? Number(row.valor_venda).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "Consulte",
    valorFormatado: row.valor_venda ? formatVBCurrency(Number(row.valor_venda)) : "Consulte o valor",
    tipologia: row.tipologia as VillaBiancoUnit["tipologia"],
    status: row.status as VillaBiancoUnit["status"],
    quartos: row.quartos as 2 | 3 | 4,
    isCobertura: row.is_cobertura as boolean,
    isGarden: row.is_garden as boolean,
  };
}
