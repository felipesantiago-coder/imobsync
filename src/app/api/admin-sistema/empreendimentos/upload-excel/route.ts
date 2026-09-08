import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminSistema } from "@/lib/admin-auth";
import * as XLSX from "xlsx";
import {
  buildPartialUnitFromRow,
  buildUnitIndex,
  composeUnitToSave,
  DEDICATED_TABLE_MAP,
  findExistingUnit,
  mapColumns,
  TOTAL_KNOWN_FIELDS,
  type DedicatedTableConfig,
  type ExcelRow,
} from "@/lib/excel-mirror";

export const dynamic = "force-dynamic";

// ─── Endpoint POST ─────────────────────────────────────────────────────────────
//
// Semântica contratada da importação (atualização parcial):
//   - APENAS os campos efetivamente preenchidos no Excel são atualizados;
//   - campos em branco ou ausentes são IGNORADOS — o valor anterior permanece;
//   - unidades existentes são atualizadas em praço (nunca duplicadas);
//   - a atualização é replicada à tabela dedicada do espelho público
//     (usuários/coordenadores) sempre que o empreendimento possuir uma;
//   - falhas de gravação e de replicação são REPORTADAS na resposta — nunca
//     "sucesso falso".
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

    // Detectar tabela dedicada (espelho público: moment/villa-bianco/vitta/quattre)
    const dedicatedConfig: DedicatedTableConfig | null = emp?.slug
      ? DEDICATED_TABLE_MAP[emp.slug] ?? null
      : null;

    // Buscar unidades existentes em projeto_units para casamento e merge parcial
    // (preserva dados não presentes/preenchidos no Excel)
    const { data: existingUnits } = await supabase
      .from("projeto_units")
      .select("*")
      .eq("empreendimento_id", empreendimentoId);

    // Indexar: chave de negócio (bloco+unidade) e índice por unidade para
    // tolerância a divergência de formatação entre planilhas.
    const projetoIndex = buildUnitIndex(
      (existingUnits ?? []) as ExcelRow[],
      true
    );

    // Prefetch da tabela dedicada (1 consulta): baseline de valores antigos e
    // alvo da replicação. Casamento em memória (rápido e testável).
    let dedicatedIndex: ReturnType<typeof buildUnitIndex> | null = null;
    if (dedicatedConfig) {
      const { data: dedRows } = await supabase
        .from(dedicatedConfig.table)
        .select("*");
      dedicatedIndex = buildUnitIndex(
        (dedRows ?? []) as ExcelRow[],
        dedicatedConfig.matchColumns.includes("bloco")
      );
    }

    // Informativo: quantos campos de negócio o Excel trouxe (para diagnóstico)
    const dbFieldsInExcel = new Set(Object.values(columnMapping));
    const recognizedFields = dbFieldsInExcel.size;
    const isPartialSpreadsheet = recognizedFields < TOTAL_KNOWN_FIELDS;

    // Processar linhas com UPSERT parcial (campos em branco/ausentes ignorados)
    const results = {
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      sync_ok: 0,
      sync_failed: 0,
    };
    const errorDetails: string[] = [];
    const syncDetails: string[] = [];
    const nowIso = new Date().toISOString();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const partial = buildPartialUnitFromRow(row, columnMapping, empreendimentoId, i + 1);

      const unitName = String(partial.unidade ?? "").trim();
      if (!unitName) {
        results.skipped++;
        errorDetails.push(`Linha ${i + 1}: unidade vazia, ignorada`);
        continue;
      }

      // 1) Localizar a unidade existente em projeto_units
      //    (exato → tolerante a formatação; ambíguo → ignora com detalhe)
      const projetoLookup = findExistingUnit(
        projetoIndex,
        { unidade: unitName, bloco: partial.bloco },
        true
      );
      if (projetoLookup.kind === "ambiguous") {
        results.skipped++;
        const blocos = [...new Set(projetoLookup.candidates.map((c) => String(c.bloco ?? "")))].join(", ");
        errorDetails.push(
          `Linha ${i + 1} (${unitName}): unidade existe em múltiplos blocos (${blocos}) sem correspondência exata de bloco — linha ignorada para evitar duplicidade. Inclua a coluna 'bloco' com o valor exato.`
        );
        continue;
      }
      const projetoRow = projetoLookup.kind === "found" ? projetoLookup.row : null;

      // 2) Localizar a unidade na tabela dedicada (espelho público), se houver.
      //    Se o Excel não informou bloco, usa o bloco da linha existente em
      //    projeto_units como identidade.
      let dedicatedRow: ExcelRow | null = null;
      let dedicatedMissReason: string | null = null;
      if (dedicatedConfig && dedicatedIndex) {
        const withBloco = dedicatedConfig.matchColumns.includes("bloco");
        const identBloco =
          partial.bloco !== undefined
            ? partial.bloco
            : projetoRow
              ? projetoRow.bloco
              : undefined;
        const dedLookup = findExistingUnit(
          dedicatedIndex,
          { unidade: unitName, bloco: identBloco },
          withBloco
        );
        if (dedLookup.kind === "found") {
          dedicatedRow = dedLookup.row;
        } else if (dedLookup.kind === "ambiguous") {
          dedicatedMissReason = "correspondência ambígua na tabela dedicada";
        } else {
          dedicatedMissReason = "unidade não encontrada na tabela dedicada";
        }
      }

      // 3) Compor a linha final:
      //      Excel preenchido > projeto_units (não nulo) > tabela dedicada
      //    Campos em branco/ausentes no Excel mantêm o valor anterior.
      const unitToSave = composeUnitToSave({
        partial,
        projetoRow,
        dedicatedRow,
        nowIso,
      });
      // Garantir que bloco nunca seja null (necessário para unique constraint)
      if (!unitToSave.bloco) unitToSave.bloco = "";

      // Unidade já conhecida em algum espelho → atualização; senão → inserção
      const hadBaseline = projetoRow !== null || dedicatedRow !== null;

      // Upsert na tabela genérica: se já existir (empreendimento_id + bloco + unidade),
      // atualiza; senão insere
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

      if (hadBaseline) results.updated++;
      else results.inserted++;

      // 4) Replicar à tabela dedicada (espelho público) — APENAS campos
      //    preenchidos no Excel; campos em branco não são tocados.
      if (dedicatedConfig) {
        const updates: Record<string, unknown> = {};
        for (const field of dedicatedConfig.validSyncFields) {
          if (partial[field] !== undefined) updates[field] = partial[field];
        }
        // area_str deve ser recalculado se area foi atualizado
        if (updates.area !== undefined && !updates.area_str) {
          updates.area_str = `${updates.area} m²`;
        }

        if (Object.keys(updates).length === 0) {
          // Nada preenchido para esta unidade — nada a replicar (não é falha)
        } else if (dedicatedRow && dedicatedRow.id) {
          const { error: syncErr } = await supabase
            .from(dedicatedConfig.table)
            .update(updates)
            .eq("id", String(dedicatedRow.id));
          if (syncErr) {
            results.sync_failed++;
            syncDetails.push(
              `Linha ${i + 1} (${unitName}): falha ao replicar para ${dedicatedConfig.table}: ${syncErr.message}`
            );
            console.error(`Erro ao sincronizar com ${dedicatedConfig.table}:`, syncErr.message);
          } else {
            results.sync_ok++;
          }
        } else {
          results.sync_failed++;
          syncDetails.push(
            `Linha ${i + 1} (${unitName}): ${dedicatedMissReason ?? "unidade não encontrada na tabela dedicada"} (${dedicatedConfig.table}) — atualização não replicada ao espelho público`
          );
        }
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
      partial_spreadsheet: isPartialSpreadsheet,
      errors: errorDetails.length > 0 ? errorDetails : undefined,
      sync_details: syncDetails.length > 0 ? syncDetails : undefined,
    });
  } catch (err) {
    console.error("Erro no upload de Excel:", err);
    return NextResponse.json(
      { error: "Erro interno no processamento do Excel" },
      { status: 500 }
    );
  }
}
