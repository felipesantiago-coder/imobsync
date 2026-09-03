import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminSistema } from "@/lib/admin-auth";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

// ─── Normalização de colunas ───────────────────────────────────────────────────
// Converte um cabeçalho Excel para uma chave normalizada usada no COLUMN_MAP.
// Ex: "Preço de Venda" → "preco_de_venda", "Área Privativa" → "area_privativa"
function normalizeColumnName(col: string): string {
  return col
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

// ─── Mapeamento de colunas (chaves já normalizadas) ───────────────────────────
// Todas as chaves estão normalizadas (sem acentos, sem espaços, tudo minúsculo).
// A função mapColumns normaliza o cabeçalho do Excel e compara com essas chaves.
const COLUMN_MAP: Record<string, string> = {
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

function mapColumns(
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

// ─── Parsers de valores ────────────────────────────────────────────────────────
function parseBrazilianNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const str = String(value).trim();
  if (str === "") return null;

  // Brazilian format: 1.234.567,89
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

function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const str = String(value).toLowerCase().trim();
  return ["sim", "s", "yes", "y", "true", "1", "x"].includes(str);
}

function parseStatus(value: unknown): string {
  if (!value || value === "" || value === null || value === undefined) return "disponivel";
  const str = String(value).toLowerCase().trim();
  if (str === "disponível" || str === "disponivel" || str === "available") return "disponivel";
  if (str === "reservada" || str === "reservado" || str === "reserved") return "reservado";
  if (str === "vendida" || str === "vendido" || str === "sold") return "vendido";
  return "disponivel";
}

// ─── Processamento de uma linha do Excel → campos do banco ────────────────────
// Retorna APENAS os campos presentes no Excel (diferente de null/undefined/vazio).
// Campos não enviados ficarão de fora para que o merge preserve os dados existentes.
function buildPartialUnitFromRow(
  row: Record<string, unknown>,
  columnMapping: Record<string, string>,
  empreendimentoId: string,
  ordem: number
): Record<string, unknown> {
  const unit: Record<string, unknown> = {
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
        unit.status = ["disponivel", "reservado", "vendido"].includes(statusVal) ? statusVal : "disponivel";
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

// ─── Tabelas dedicadas por slug de empreendimento ──────────────────────────
// Alguns empreendimentos possuem tabelas próprias
// que alimentam seus espelhos de vendas. O upload precisa sincronizar ambas.
const DEDICATED_TABLE_MAP: Record<string, {
  table: string;
  matchColumns: string[];      // colunas usadas no WHERE (ex: ["unidade"] ou ["bloco","unidade"])
  castUnidadeToInt: boolean;   // tabelas legadas usam INTEGER, não TEXT
  validSyncFields: string[];   // apenas estas colunas do commonFields serão sincronizadas
}> = {
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

// ─── Sincronização com tabela dedicada ────────────────────────────────────
async function syncToDedicatedTable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  config: { table: string; matchColumns: string[]; castUnidadeToInt: boolean; validSyncFields: string[] },
  partial: Record<string, unknown>,
  matchData: Record<string, unknown>,
) {
  // Construir update com apenas os campos presentes no partial E permitidos na tabela dedicada
  const updates: Record<string, unknown> = {};
  for (const field of config.validSyncFields) {
    if (partial[field] !== undefined) {
      updates[field] = partial[field];
    }
  }
  // area_str deve ser recalculado se area foi atualizado
  if (updates.area !== undefined && !updates.area_str) {
    updates.area_str = `${updates.area} m²`;
  }
  if (Object.keys(updates).length === 0) return;

  // Construir WHERE a partir das colunas de match usando matchData (dados mesclados)
  // Isso permite que update parcial sem a coluna 'bloco' ainda funcione,
  // pois o bloco vem do registro existente no banco via unitToSave.
  let query = supabase.from(config.table as any).update(updates);
  for (const col of config.matchColumns) {
    let val = matchData[col];
    if (val === undefined || val === null || val === "") return;
    if (config.castUnidadeToInt && col === "unidade") {
      const parsed = parseInt(String(val), 10);
      if (isNaN(parsed)) return;
      val = parsed;
    }
    query = query.eq(col, val) as any;
  }
  const { error } = await query;
  if (error) {
    console.error(`Erro ao sincronizar com ${config.table}:`, error.message);
  }
}

// ─── Endpoint POST ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const isAllowed = await requireAdminSistema();
    if (!isAllowed) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

    const supabase = await createClient();

    const formData = await request.formData();
    const empreendimentoId = formData.get("empreendimentoId") as string;
    const file = formData.get("file") as File | null;

    if (!empreendimentoId || !file) {
      return NextResponse.json(
        { error: "Campos 'empreendimentoId' e 'file' são obrigatórios" },
        { status: 400 }
      );
    }

    // Validar tipo do arquivo
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (![".xlsx", ".xls"].includes(ext)) {
      return NextResponse.json(
        { error: "O arquivo deve estar em formato Excel (.xlsx ou .xls)" },
        { status: 400 }
      );
    }

    // Parsear Excel
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

    if (rows.length === 0) {
      return NextResponse.json({ error: "O arquivo Excel está vazio" }, { status: 400 });
    }

    // Mapear colunas
    const headers = Object.keys(rows[0]);
    const { mapped: columnMapping } = mapColumns(headers);

    if (Object.keys(columnMapping).length === 0) {
      return NextResponse.json(
        {
          error: "Não foi possível identificar as colunas do Excel. Use nomes como: andar, unidade, área, quartos, vagas, valor, status, tipologia",
          detectedHeaders: headers,
        },
        { status: 400 }
      );
    }

    // Verificar se a coluna 'unidade' está presente
    const hasUnidade = Object.values(columnMapping).includes("unidade");
    if (!hasUnidade) {
      return NextResponse.json(
        {
          error: "A coluna 'unidade' é obrigatória para identificar cada unidade. Adicione uma coluna com cabeçalho 'unidade', 'apto', 'nº unidade' ou 'apartamento'.",
          detectedHeaders: headers,
        },
        { status: 400 }
      );
    }

    // Buscar dados do empreendimento (incluindo slug para tabelas dedicadas)
    const { data: emp } = await supabase
      .from("empreendimentos")
      .select("id,slug")
      .eq("id", empreendimentoId)
      .single();

    // Detectar tabela dedicada (ex: moment → moment_units)
    const dedicatedConfig = emp?.slug ? DEDICATED_TABLE_MAP[emp.slug] : null;

    // Buscar unidades existentes em lote para merge inteligente (preserva dados não presentes no Excel)
    const { data: existingUnits } = await supabase
      .from("projeto_units")
      .select("*")
      .eq("empreendimento_id", empreendimentoId);

    // Indexar por (bloco + unidade) para lookup rápido — unidades com mesmo
    // número em blocos diferentes devem ser tratadas como registros distintos.
    const existingMap = new Map<string, Record<string, unknown>>();
    if (existingUnits) {
      for (const eu of existingUnits) {
        const bloco = String((eu as Record<string, unknown>).bloco ?? "").trim();
        const unidade = String(eu.unidade ?? "").trim();
        if (unidade) {
          const key = `${bloco.toLowerCase()}|${unidade.toLowerCase()}`;
          existingMap.set(key, eu as Record<string, unknown>);
        }
      }
    }

    // Determinar se o Excel é parcial (tem apenas algumas colunas) ou completo
    const dbFieldsInExcel = new Set(Object.values(columnMapping));
    const totalKnownFields = 12; // unidade, andar, area, quartos, vagas, valor_venda, status, posicao_solar, tipologia, bloco, is_cobertura, is_garden
    const isPartialUpdate = dbFieldsInExcel.size < totalKnownFields;

    // Processar linhas com UPSERT inteligente (partial merge)
    const results = { inserted: 0, updated: 0, skipped: 0, errors: 0 };
    const errorDetails: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const partial = buildPartialUnitFromRow(row, columnMapping, empreendimentoId, i + 1);

      const unitName = String(partial.unidade ?? "").trim();
      if (!unitName) {
        results.skipped++;
        errorDetails.push(`Linha ${i + 1}: unidade vazia, ignorada`);
        continue;
      }

      // Merge com dados existentes (se a unidade já existe no mesmo bloco)
      let unitToSave: Record<string, unknown>;
      const blocoKey = String(partial.bloco ?? "").trim().toLowerCase();
      const existing = existingMap.get(`${blocoKey}|${unitName.toLowerCase()}`);

      if (existing && isPartialUpdate) {
        // Atualização parcial: preserva tudo que não veio no Excel
        unitToSave = { ...existing, ...partial };
        delete unitToSave.id; // Remove o ID para o upsert não conflitar
      } else {
        // Inserção nova ou Excel completo: usa os dados do Excel tal qual
        unitToSave = partial;
      }

      // Garantir que bloco nunca seja null (necessário para unique constraint)
      if (!unitToSave.bloco) unitToSave.bloco = "";

      // Upsert na tabela genérica: se já existir (empreendimento_id + bloco + unidade), atualiza; senão insere
      const { error: upsertErr } = await supabase
        .from("projeto_units")
        .upsert(unitToSave, {
          onConflict: "empreendimento_id,bloco,unidade",
          count: "exact",
        });

      if (upsertErr) {
        results.errors++;
        errorDetails.push(`Linha ${i + 1} (${unitName}): ${upsertErr.message}`);
        console.error(`Erro ao upsert linha ${i + 1}:`, upsertErr.message);
        continue;
      }

      // Sincronizar com tabela dedicada (se existir)
      // Passa unitToSave (dados mesclados) para o WHERE, pois pode conter
      // colunas de match (ex: bloco) ausentes do Excel mas presentes no banco.
      if (dedicatedConfig) {
        await syncToDedicatedTable(supabase, dedicatedConfig, partial, unitToSave);
      }
    }

    // Contar totais após o upsert
    const { count: totalUnits } = await supabase
      .from("projeto_units")
      .select("*", { count: "exact", head: true })
      .eq("empreendimento_id", empreendimentoId);

    return NextResponse.json({
      ...results,
      total_units: totalUnits ?? 0,
      total_rows: rows.length,
      columns: columnMapping,
      errors: errorDetails.length > 0 ? errorDetails : undefined,
    });
  } catch (err) {
    console.error("Erro no upload de Excel:", err);
    return NextResponse.json(
      { error: "Erro interno no processamento do Excel" },
      { status: 500 }
    );
  }
}
