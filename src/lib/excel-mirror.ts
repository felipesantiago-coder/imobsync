/**
 * excel-mirror.ts
 *
 * Núcleo puro da importação de Excel para os espelhos de vendas
 * (rota POST /api/admin-sistema/empreendimentos/upload-excel).
 *
 * Semântica contratada (atualização parcial):
 *   - APENAS campos efetivamente preenchidos no Excel são atualizados;
 *   - campos em branco ou ausentes são IGNORADOS — o valor anterior permanece;
 *   - unidades são casadas por (bloco, unidade) com tolerância a divergência
 *     de formatação quando existe exatamente 1 candidata por unidade;
 *   - unidades existentes são atualizadas em praço (nunca duplicadas);
 *   - para empreendimentos com tabela dedicada (espelho público), os valores
 *     antigos dessa tabela preenchem lacunas quando projeto_units não os tem.
 *
 * Funções 100% puras — sem I/O — para serem testáveis (tests/excel-mirror.test.ts).
 */

export type ExcelRow = Record<string, unknown>;

// ─── Normalização de cabeçalhos ────────────────────────────────────────────────
// Converte um cabeçalho Excel para uma chave normalizada usada no COLUMN_MAP.
// Ex: "Preço de Venda" → "preco_de_venda", "Área Privativa" → "area_privativa"
export function normalizeColumnName(col: string): string {
  return col
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

// ─── Mapeamento de colunas (chaves já normalizadas) ──────────────────────────
// Todas as chaves estão normalizadas (sem acentos, sem espaços, tudo minúsculo).
export const COLUMN_MAP: Record<string, string> = {
  andar: "andar",
  pavimento: "andar",
  floor: "andar",
  unidade: "unidade",
  no_unidade: "unidade",
  numero: "unidade",
  apto: "unidade",
  apartamento: "unidade",
  area: "area",
  area_privativa: "area",
  m2: "area",
  m2_: "area",
  metragem: "area",
  quartos: "quartos",
  dormitorios: "quartos",
  quartos_dormitorios: "quartos",
  suites: "quartos",
  vagas: "vagas",
  garagem: "vagas",
  vagas_garagem: "vagas",
  vaga: "vagas",
  valor: "valor_venda",
  valor_de_venda: "valor_venda",
  valor_venda: "valor_venda",
  valor_total: "valor_venda",
  valor_da_unidade: "valor_venda",
  preco: "valor_venda",
  preco_de_venda: "valor_venda",
  preco_total: "valor_venda",
  status: "status",
  posicao_solar: "posicao_solar",
  posicao: "posicao_solar",
  solar: "posicao_solar",
  sol: "posicao_solar",
  face: "posicao_solar",
  tipologia: "tipologia",
  tipo: "tipologia",
  tipo_unidade: "tipologia",
  planta: "tipologia",
  bloco: "bloco",
  torre: "bloco",
  cobertura: "is_cobertura",
  cobertura_: "is_cobertura",
  garden: "is_garden",
  garden_: "is_garden",
};

export function mapColumns(
  headers: string[]
): { mapped: Record<string, string>; unmapped: string[] } {
  const mapped: Record<string, string> = {};
  const unmapped: string[] = [];

  for (const header of headers) {
    const normalized = normalizeColumnName(header);
    const dbField = COLUMN_MAP[normalized];
    if (dbField) {
      mapped[header] = dbField;
    } else {
      unmapped.push(header);
    }
  }

  return { mapped, unmapped };
}

// Total de campos de negócio reconhecidos (unidade, andar, area, quartos, vagas,
// valor_venda, status, posicao_solar, tipologia, bloco, is_cobertura, is_garden).
export const TOTAL_KNOWN_FIELDS = 12;

// ─── Parsers de valores ────────────────────────────────────────────────────────
export function parseBrazilianNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const str = String(value).trim();
  if (str === "") return null;

  // Formato brasileiro: 1.234.567,89
  if (str.includes(",") && str.includes(".")) {
    const cleaned = str.replace(/\./g, "").replace(",", ".");
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }
  if (str.includes(",")) {
    const cleaned = str.replace(",", ".");
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

export function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const str = String(value).toLowerCase().trim();
  return ["sim", "s", "yes", "y", "true", "1", "x"].includes(str);
}

/**
 * Mapeia o valor de status para o domínio do banco.
 * Retorna null para valores em branco OU desconhecidos — o chamador deve
 * IGNORAR o campo nesses casos (nunca sobrescrever o status existente).
 */
export function parseStatus(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).toLowerCase().trim();
  if (!str) return null;
  if (str === "disponível" || str === "disponivel" || str === "available") return "disponivel";
  if (str === "reservada" || str === "reservado" || str === "reserved") return "reservado";
  if (str === "vendida" || str === "vendido" || str === "sold") return "vendido";
  return null;
}

// ─── Processamento de uma linha do Excel → campos do banco ────────────────────
// Retorna APENAS os campos presentes e preenchidos no Excel (diferente de
// null/undefined/vazio). Campos em branco ficam de fora para que o merge
// preserve os dados existentes (semântica de atualização parcial).
export function buildPartialUnitFromRow(
  row: Record<string, unknown>,
  columnMapping: Record<string, string>,
  empreendimentoId: string,
  ordem: number
): ExcelRow {
  const unit: ExcelRow = {
    empreendimento_id: empreendimentoId,
    ordem,
  };

  for (const [header, dbField] of Object.entries(columnMapping)) {
    const value = row[header];

    if (dbField === "andar") {
      const parsed = parseBrazilianNumber(value);
      if (parsed !== null) unit.andar = parsed;
    } else if (dbField === "unidade") {
      const str = String(value ?? "").trim();
      if (str) unit.unidade = str;
    } else if (dbField === "area") {
      const areaVal = parseBrazilianNumber(value);
      if (areaVal !== null) {
        unit.area = areaVal;
        unit.area_str = `${areaVal} m²`;
      }
    } else if (dbField === "quartos") {
      const parsed = parseBrazilianNumber(value);
      if (parsed !== null) unit.quartos = parsed;
    } else if (dbField === "vagas") {
      const parsed = parseBrazilianNumber(value);
      if (parsed !== null) unit.vagas = parsed;
    } else if (dbField === "valor_venda") {
      const parsed = parseBrazilianNumber(value);
      if (parsed !== null) unit.valor_venda = parsed;
    } else if (dbField === "status") {
      const str = String(value ?? "").trim();
      if (str) {
        const statusVal = parseStatus(value);
        // Valor desconhecido → ignora (não zera para "disponivel")
        if (statusVal) unit.status = statusVal;
      }
    } else if (dbField === "posicao_solar") {
      const str = String(value ?? "").trim();
      if (str) unit.posicao_solar = str;
    } else if (dbField === "tipologia") {
      const str = String(value ?? "").trim();
      if (str) unit.tipologia = str;
    } else if (dbField === "bloco") {
      const str = String(value ?? "").trim();
      if (str) unit.bloco = str;
    } else if (dbField === "is_cobertura") {
      const str = String(value ?? "").trim();
      if (str) unit.is_cobertura = parseBoolean(value);
    } else if (dbField === "is_garden") {
      const str = String(value ?? "").trim();
      if (str) unit.is_garden = parseBoolean(value);
    }
  }

  return unit;
}

// ─── Índices de casamento de unidades ─────────────────────────────────────────
// Normaliza texto de unidade/bloco para casamento tolerante:
//   - unidade: trim + lowercase ("101 " === "101")
//   - bloco: trim + lowercase + remove a palavra "bloco"/"torre" e separadores
//     ("Bloco 1" === "1" === "bloco-1") — divergência de formatação entre
//     planilhas e banco não deve criar unidades duplicadas.
export function normalizeUnitText(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

export function normalizeBlocoText(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/bloco|torre/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function unitIndexKey(bloco: unknown, unidade: unknown): string {
  return `${normalizeBlocoText(bloco)}|${normalizeUnitText(unidade)}`;
}

export type UnitIndex = {
  byKey: Map<string, ExcelRow>;
  byUnidade: Map<string, ExcelRow[]>;
};

/**
 * Indexa linhas de unidades para casamento rápido.
 * @param withBloco true quando a chave de negócio inclui bloco
 *                  (projeto_units, villa_bianco_units, vitta_units);
 *                  false quando a chave é só a unidade (units, moment_units).
 */
export function buildUnitIndex(rows: ExcelRow[], withBloco: boolean): UnitIndex {
  const byKey = new Map<string, ExcelRow>();
  const byUnidade = new Map<string, ExcelRow[]>();

  for (const row of rows) {
    const unidade = normalizeUnitText(row.unidade);
    if (!unidade) continue;
    const key = withBloco
      ? unitIndexKey(row.bloco, row.unidade)
      : unidade;
    byKey.set(key, row);

    const list = byUnidade.get(unidade);
    if (list) list.push(row);
    else byUnidade.set(unidade, [row]);
  }

  return { byKey, byUnidade };
}

export type ExistingLookup =
  | { kind: "found"; row: ExcelRow }
  | { kind: "missing" }
  | { kind: "ambiguous"; candidates: ExcelRow[] };

/**
 * Localiza a linha existente correspondente a uma unidade do Excel.
 *
 * Ordem de casamento:
 *   1. Chave exata (bloco normalizado + unidade) — hit rápido;
 *   2. Candidatas por unidade:
 *      - exatamente 1 → assume (tolerância a divergência de bloco/andar),
 *        mesmo comportamento do casamento em lote (matchBatchTargets);
 *      - várias → desambigua comparando o bloco normalizado; se o Excel não
 *        informou bloco, ou nenhum/nenhum-único casar → ambígua (a linha é
 *        IGNORADA com detalhe, nunca inserida em duplicidade).
 */
export function findExistingUnit(
  index: UnitIndex,
  ident: { unidade: unknown; bloco?: unknown },
  withBloco: boolean
): ExistingLookup {
  const unidade = normalizeUnitText(ident.unidade);
  if (!unidade) return { kind: "missing" };

  const exactKey = withBloco ? unitIndexKey(ident.bloco, ident.unidade) : unidade;
  const exact = index.byKey.get(exactKey);
  if (exact) return { kind: "found", row: exact };

  const base = index.byUnidade.get(unidade) ?? [];

  if (base.length === 1) return { kind: "found", row: base[0] };

  if (base.length > 1) {
    const identBloco = normalizeBlocoText(ident.bloco);
    if (identBloco) {
      const matched = base.filter(
        (r) => normalizeBlocoText(r.bloco) === identBloco
      );
      if (matched.length === 1) return { kind: "found", row: matched[0] };
    }
    return { kind: "ambiguous", candidates: base };
  }

  return { kind: "missing" };
}

// ─── Tabelas dedicadas por slug de empreendimento ─────────────────────────────
// Alguns empreendimentos possuem tabelas próprias que alimentam seus espelhos
// de vendas públicos (acessados por usuários e coordenadores). O upload precisa
// sincronizar AMBAS as tabelas: projeto_units (espelho admin) e a dedicada.
export type DedicatedTableConfig = {
  table: string;
  matchColumns: string[]; // colunas usadas no casamento (ex: ["unidade"] ou ["bloco","unidade"])
  castUnidadeToInt: boolean; // tabelas legadas usam INTEGER, não TEXT
  validSyncFields: string[]; // apenas estas colunas são sincronizadas
};

export const DEDICATED_TABLE_MAP: Record<string, DedicatedTableConfig> = {
  moment: {
    table: "moment_units",
    matchColumns: ["unidade"],
    castUnidadeToInt: true,
    validSyncFields: ["valor_venda", "status", "andar", "area", "area_str", "quartos", "vagas", "posicao_solar", "tipologia", "is_cobertura"],
  },
  "villa-bianco": {
    table: "villa_bianco_units",
    matchColumns: ["bloco", "unidade"],
    castUnidadeToInt: true,
    validSyncFields: ["valor_venda", "status", "andar", "area", "area_str", "quartos", "vagas", "posicao_solar", "tipologia", "is_cobertura"],
  },
  vitta: {
    table: "vitta_units",
    matchColumns: ["bloco", "unidade"],
    castUnidadeToInt: true,
    // vitta_units NÃO possui: quartos, vagas, posicao_solar, is_cobertura, is_garden
    validSyncFields: ["valor_venda", "status", "andar", "area", "area_str", "tipologia"],
  },
  "quattre-istambul": {
    table: "units",
    matchColumns: ["unidade"],
    castUnidadeToInt: true,
    validSyncFields: ["valor_venda", "status", "andar", "area", "area_str", "quartos", "vagas", "posicao_solar", "tipologia"],
  },
};

// ALIAS CRÍTICO: o slug real do Residencial Vitta é "residencial-vitta"
// (mesmo slug usado em LEGACY_TABLE_MAP de /projetos e no migrate-legacy).
// Sem este alias, uploads de Excel nunca sincronizam com vitta_units e os
// valores não chegam ao espelho público dos usuários/coordenadores.
DEDICATED_TABLE_MAP["residencial-vitta"] = DEDICATED_TABLE_MAP.vitta;

// ─── Composição da linha final (merge de baselines + parcial do Excel) ────────
// Campos copiáveis da tabela dedicada para compor baseline de projeto_units.
// Exclui id/timestamps/ordem/empreendimento_id (identidade própria do alvo).
export const DEDICATED_BASELINE_FIELDS = [
  "andar",
  "area",
  "area_str",
  "quartos",
  "vagas",
  "valor_venda",
  "status",
  "posicao_solar",
  "tipologia",
  "is_cobertura",
  "is_garden",
] as const;

/**
 * Remove valores nulos/undefined/strings vazias — usado para que a coalescência
 * (tabela dedicada → lacunas de projeto_units) nunca descarte um valor real
 * já presente (false numérico/booleano é valor e é preservado).
 */
export function compactDefined(row: ExcelRow): ExcelRow {
  const out: ExcelRow = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    out[k] = v;
  }
  return out;
}

/**
 * Mapeia uma linha da tabela dedicada para o formato de projeto_units,
 * mantendo apenas campos úteis como baseline de valores antigos.
 */
export function pickDedicatedBaseline(row: ExcelRow): ExcelRow {
  const out: ExcelRow = {};
  for (const f of DEDICATED_BASELINE_FIELDS) {
    const v = row[f];
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    out[f] = v;
  }
  const unidade = row.unidade;
  if (unidade !== null && unidade !== undefined) out.unidade = String(unidade).trim();
  const bloco = row.bloco;
  if (bloco !== null && bloco !== undefined) out.bloco = String(bloco).trim();
  // Consistência: area sem area_str ganha a string derivada
  if (out.area !== undefined && out.area_str === undefined) {
    out.area_str = `${out.area} m²`;
  }
  return out;
}

/**
 * Compõe a linha final a ser gravada em projeto_units:
 *
 *   prioridade por campo:  Excel preenchido  >  projeto_units (não nulo)  >  tabela dedicada
 *
 * - `projetoRow` presente → a identidade da linha existente vence (bloco é
 *   preservado) para o upsert ATUALIZAR em praço e nunca duplicar;
 * - `dedicatedRow` preenche somente lacunas nulas (ex.: valor antigo perdido
 *   por upload anterior com célula em branco);
 * - `partial` (Excel) sobrepõe tudo que estiver efetivamente preenchido;
 * - brancos/ausentes no Excel → valor antigo permanece (regra contratada);
 * - id/created_at nunca são gravados; updated_at é renovado.
 */
export function composeUnitToSave(args: {
  partial: ExcelRow;
  projetoRow: ExcelRow | null;
  dedicatedRow: ExcelRow | null;
  nowIso: string;
}): ExcelRow {
  const { partial, projetoRow, dedicatedRow, nowIso } = args;

  let baseline: ExcelRow = {};
  if (dedicatedRow) baseline = { ...baseline, ...pickDedicatedBaseline(dedicatedRow) };
  if (projetoRow) baseline = { ...baseline, ...compactDefined(projetoRow) };

  const merged: ExcelRow = { ...baseline, ...partial };

  // Identidade da linha existente em projeto_units prevalece — garante que o
  // upsert (onConflict empreendimento_id+bloco+unidade) atualize a MESMA linha,
  // mesmo quando o Excel traz bloco com formatação divergente.
  if (projetoRow) {
    merged.bloco =
      projetoRow.bloco === null || projetoRow.bloco === undefined
        ? ""
        : String(projetoRow.bloco).trim();
  }

  merged.empreendimento_id = partial.empreendimento_id;
  merged.ordem = partial.ordem;

  delete merged.id;
  delete merged.created_at;
  merged.updated_at = nowIso;

  return merged;
}
