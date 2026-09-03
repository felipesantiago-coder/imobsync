export interface Unit {
  andar: number;
  unidade: number;
  vagas: number;
  area: number;
  areaStr: string;
  valorVenda: number | null;
  valorStr: string;
  valorFormatado: string;
  tipoArea: "66m²" | "67m²" | "69m²" | "100m²";
  status: "disponivel" | "reservado" | "vendido";
  posicaoSolar: "Nascente" | "Poente";
  quartos: 2 | 3;
}

function parseValor(raw: string): { valor: number | null; str: string; formatado: string } {
  const cleaned = raw.replace(/[^\d.,]/g, "").trim();

  if (!cleaned) {
    return { valor: null, str: "Consulte", formatado: "Consulte o valor" };
  }

  // Check if it's a properly formatted R$ value (e.g., "R$ 812899.00")
  const fullMatch = raw.match(/R\$\s*([\d.,]+)/);
  if (fullMatch) {
    let numStr = fullMatch[1];
    // Brazilian format: 1.234.567,89 → remove dots, replace comma with dot
    if (numStr.includes(",") && numStr.includes(".")) {
      numStr = numStr.replace(/\./g, "").replace(",", ".");
    } else if (numStr.includes(",")) {
      // Only comma as decimal separator
      numStr = numStr.replace(",", ".");
    }
    // Otherwise keep as-is (US decimal format: "812899.00")
    const valor = parseFloat(numStr);
    return {
      valor,
      str: valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      formatado: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor),
    };
  }

  // Handle anomalous values like "634.21", "865.44", "638.73"
  const num = parseFloat(cleaned);
  if (!isNaN(num) && num > 100) {
    // These appear to be in thousands, convert: 634.21 -> 634210
    const valor = Math.round(num * 1000);
    return {
      valor,
      str: valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      formatado: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor),
    };
  }

  return { valor: null, str: "Consulte", formatado: "Consulte o valor" };
}

function getAreaType(areaStr: string): Unit["tipoArea"] {
  const normalized = areaStr.replace(/\s/g, "").trim();
  return normalized as Unit["tipoArea"];
}

function getStatus(valor: number | null, unidade: number): Unit["status"] {
  if (valor === null) return "disponivel";
  return "disponivel";
}

function getPosicaoSolar(unidade: number): Unit["posicaoSolar"] {
  return unidade % 2 === 0 ? "Nascente" : "Poente";
}

// Raw data from CSV
const rawData: [number, number, number, string, string][] = [
  [1, 101, 1, "100 m²", "R$ 838041.03"],
  [1, 102, 1, "100 m²", "R$ 925493.41"],
  [1, 103, 1, "66 m²", "R$ 554983.54"],
  [1, 104, 1, "67 m²", "R$ 608685.33"],
  [1, 105, 1, "67 m²", "R$ 563017.07"],
  [1, 106, 1, "69 m²", "R$ 622690.48"],
  [1, 107, 1, "69 m²", "R$ 580255.71"],
  [1, 108, 1, "69 m²", "R$ 622690.48"],
  [1, 109, 1, "66 m²", "R$ 554983.54"],
  [1, 110, 1, "67 m²", "R$ 608685.33"],
  [1, 111, 1, "100 m²", "R$ 841308.59"],
  [1, 112, 1, "100 m²", "R$ 925493.41"],
  [2, 201, 1, "100 m²", "R$ 857644.33"],
  [2, 202, 1, "100 m²", "R$ 971768.55"],
  [2, 203, 1, "66 m²", "R$ 568335.05"],
  [2, 204, 1, "67 m²", "R$ 639119.85"],
  [2, 205, 1, "67 m²", "R$ 576561.86"],
  [2, 206, 1, "69 m²", "R$ 653825.26"],
  [2, 207, 1, "69 m²", "R$ 594215.21"],
  [2, 208, 1, "69 m²", "R$ 653825.26"],
  [2, 209, 1, "66 m²", "R$ 568335.05"],
  [2, 210, 1, "67 m²", "R$ 639119.85"],
  [2, 211, 1, "100 m²", "R$ 883374.18"],
  [2, 212, 1, "100 m²", "R$ 971768.55"],
  [3, 301, 1, "100 m²", "R$ 866221.29"],
  [3, 302, 1, "100 m²", "R$ 981485.59"],
  [3, 303, 1, "66 m²", "R$ 574018.74"],
  [3, 304, 1, "67 m²", "R$ 645511.22"],
  [3, 305, 1, "67 m²", "R$ 582327.82"],
  [3, 306, 1, "69 m²", "R$ 660363.69"],
  [3, 307, 1, "69 m²", "R$ 600157.72"],
  [3, 308, 1, "69 m²", "R$ 660363.69"],
  [3, 309, 1, "66 m²", "R$ 574018.74"],
  [3, 310, 1, "67 m²", "R$ 645511.22"],
  [3, 311, 1, "100 m²", "R$ 892207.01"],
  [3, 312, 1, "100 m²", "R$ 981485.59"],
  [4, 401, 2, "100 m²", "R$ 926470.48"],
  [4, 402, 1, "100 m²", "R$ 991300.65"],
  [4, 403, 1, "66 m²", "R$ 579758.50"],
  [4, 404, 1, "67 m²", "R$ 651966.20"],
  [4, 405, 1, "67 m²", "R$ 588150.66"],
  [4, 406, 1, "69 m²", "R$ 666967.19"],
  [4, 407, 1, "69 m²", "R$ 606158.84"],
  [4, 408, 1, "69 m²", "R$ 666967.19"],
  [4, 409, 1, "66 m²", "R$ 579758.50"],
  [4, 410, 1, "67 m²", "R$ 651966.20"],
  [4, 411, 1, "100 m²", "R$ 901129.61"],
  [4, 412, 1, "100 m²", "R$ 991228.43"],
  [5, 501, 2, "100 m²", "R$ 1015015.26"],
  [5, 502, 2, "100 m²", "R$ 1029173.20"],
  [5, 503, 1, "66 m²", "R$ 585556.37"],
  [5, 504, 1, "67 m²", "R$ 658485.48"],
  [5, 505, 1, "67 m²", "R$ 594032.46"],
  [5, 506, 1, "69 m²", "R$ 673636.48"],
  [5, 507, 1, "69 m²", "R$ 612220.73"],
  [5, 508, 1, "69 m²", "R$ 673636.48"],
  [5, 509, 1, "66 m²", "R$ 585556.37"],
  [5, 510, 1, "67 m²", "R$ 658485.48"],
  [5, 511, 2, "100 m²", "R$ 1015015.49"],
  [5, 512, 2, "100 m²", "R$ 1029173.20"],
  [6, 601, 2, "100 m²", "R$ 1015015.49"],
  [6, 602, 2, "100 m²", "R$ 1029173.20"],
  [6, 603, 1, "66 m²", "R$ 591411.68"],
  [6, 604, 1, "67 m²", "R$ 665070.47"],
  [6, 605, 1, "67 m²", "R$ 599972.52"],
  [6, 606, 1, "69 m²", "R$ 680372.98"],
  [6, 607, 1, "69 m²", "R$ 618342.67"],
  [6, 608, 1, "69 m²", "R$ 680372.98"],
  [6, 609, 1, "66 m²", "R$ 591411.68"],
  [6, 610, 1, "67 m²", "R$ 665070.47"],
  [6, 611, 2, "100 m²", "R$ 1015015.49"],
  [6, 612, 2, "100 m²", "R$ 1029173.20"],
];

export const units: Unit[] = rawData.map(([andar, unidade, vagas, areaStr, valorRaw]) => {
  const parsed = parseValor(valorRaw);
  const area = parseInt(areaStr.replace(/[^\d]/g, ""), 10);
  return {
    andar,
    unidade,
    vagas,
    area,
    areaStr: areaStr.trim(),
    valorVenda: parsed.valor,
    valorStr: parsed.str,
    valorFormatado: parsed.formatado,
    tipoArea: getAreaType(areaStr),
    status: getStatus(parsed.valor, unidade),
    posicaoSolar: getPosicaoSolar(unidade),
    quartos: area >= 100 ? 3 : 2,
  };
});

export const floors = [1, 2, 3, 4, 5, 6] as const;
export const areaTypes: Unit["tipoArea"][] = ["66m²", "67m²", "69m²", "100m²"];
export const statusTypes: Unit["status"][] = ["disponivel", "reservado", "vendido"];

export function getUnitsByFloor(floor: number): Unit[] {
  return units.filter((u) => u.andar === floor);
}

export function getStats() {
  const totalUnits = units.length;
  const disponiveis = units.filter((u) => u.status === "disponivel").length;
  // "consultar" is not a DB status today; counter kept for API/shape compatibility (always 0).
  const consultar = units.filter((u) => (u.status as string) === "consultar").length;
  const validPrices = units.filter((u) => u.valorVenda !== null);
  const menorPreco = validPrices.length > 0 ? Math.min(...validPrices.map((u) => u.valorVenda!)) : 0;
  const maiorPreco = validPrices.length > 0 ? Math.max(...validPrices.map((u) => u.valorVenda!)) : 0;
  const mediaPreco = validPrices.length > 0 ? validPrices.reduce((acc, u) => acc + u.valorVenda!, 0) / validPrices.length : 0;
  const totalVGV = validPrices.reduce((acc, u) => acc + u.valorVenda!, 0);
  const areasDisponiveis = [...new Set(units.map((u) => u.tipoArea))];

  return {
    totalUnits,
    disponiveis,
    consultar,
    menorPreco,
    maiorPreco,
    mediaPreco,
    totalVGV,
    areasDisponiveis,
  };
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatCompactCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `R$ ${(value / 1_000).toFixed(0)}K`;
  }
  return formatCurrency(value);
}
