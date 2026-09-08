/**
 * Testes da lógica pura da importação de Excel para os espelhos de vendas
 * (rota POST /api/admin-sistema/empreendimentos/upload-excel).
 *
 * Cenários cobertos (regra contratada pelo usuário):
 *   - APENAS campos efetivamente preenchidos no Excel são atualizados;
 *   - campos em branco ou ausentes são IGNORADOS — o valor anterior permanece;
 *   - divergência de formatação de bloco não duplica unidades;
 *   - tabela dedicada (espelho público) é resolvida pelo slug correto
 *     (incluindo o alias "residencial-vitta" → vitta_units);
 *   - valores antigos da tabela dedicada preenchem lacunas de projeto_units.
 */
import { describe, it, expect } from "vitest";
import {
  buildPartialUnitFromRow,
  buildUnitIndex,
  composeUnitToSave,
  findExistingUnit,
  mapColumns,
  parseBrazilianNumber,
  parseStatus,
  DEDICATED_TABLE_MAP,
  type ExcelRow,
} from "@/lib/excel-mirror";

const EMP = "11111111-1111-1111-1111-111111111111";

// ─── Parsers ──────────────────────────────────────────────────────────────────
describe("parseBrazilianNumber", () => {
  it("converte formato brasileiro com separadores", () => {
    expect(parseBrazilianNumber("1.234.567,89")).toBe(1234567.89);
    expect(parseBrazilianNumber("530000,00")).toBe(530000);
  });
  it("retorna null para vazio/nulo — campo em branco é ignorável", () => {
    expect(parseBrazilianNumber("")).toBeNull();
    expect(parseBrazilianNumber(null)).toBeNull();
    expect(parseBrazilianNumber(undefined)).toBeNull();
    expect(parseBrazilianNumber("   ")).toBeNull();
  });
  it("retorna null para texto não numérico", () => {
    expect(parseBrazilianNumber("consulte")).toBeNull();
  });
});

describe("parseStatus", () => {
  it("mapeia variações válidas (PT/EN) para o domínio do banco", () => {
    expect(parseStatus("Vendida")).toBe("vendido");
    expect(parseStatus("RESERVADO")).toBe("reservado");
    expect(parseStatus("Disponível")).toBe("disponivel");
  });
  it("retorna null para vazio ou desconhecido — nunca sobrescrever status", () => {
    expect(parseStatus("")).toBeNull();
    expect(parseStatus("PERMUTA")).toBeNull();
    expect(parseStatus(null)).toBeNull();
  });
});

// ─── buildPartialUnitFromRow ──────────────────────────────────────────────────
describe("buildPartialUnitFromRow — semântica de atualização parcial", () => {
  const mapping = mapColumns([
    "Andar",
    "Unidade",
    "Área Privativa",
    "Valor de Venda",
    "Status",
    "Bloco",
  ]).mapped;

  it("cenário do usuário: preço em branco NÃO gera campo — valor antigo permanece", () => {
    const partial = buildPartialUnitFromRow(
      { Andar: 10, Unidade: "101", "Área Privativa": 50, "Valor de Venda": "", Status: "vendida", Bloco: "1" },
      mapping,
      EMP,
      1
    );
    expect(partial.unidade).toBe("101");
    expect(partial.andar).toBe(10);
    expect(partial.area).toBe(50);
    expect(partial.area_str).toBe("50 m²");
    expect(partial.status).toBe("vendido");
    expect(partial).not.toHaveProperty("valor_venda");
  });

  it("preço preenchido é convertido (formato brasileiro)", () => {
    const partial = buildPartialUnitFromRow(
      { Unidade: "101", "Valor de Venda": "530.000,00" },
      mapping,
      EMP,
      1
    );
    expect(partial.valor_venda).toBe(530000);
  });

  it("status desconhecido não sobrescreve (campo ignorado)", () => {
    const partial = buildPartialUnitFromRow(
      { Unidade: "101", Status: "PERMUTA" },
      mapping,
      EMP,
      1
    );
    expect(partial).not.toHaveProperty("status");
  });
});

// ─── Índices e casamento de unidades ──────────────────────────────────────────
describe("buildUnitIndex + findExistingUnit", () => {
  const projetoRows: ExcelRow[] = [
    { id: "a", bloco: "1", unidade: "101", valor_venda: 500000 },
    { id: "b", bloco: "2", unidade: "101", valor_venda: 480000 },
    { id: "c", bloco: "", unidade: "50", valor_venda: 300000 },
  ];
  const index = buildUnitIndex(projetoRows, true);

  it("casamento exato por bloco+unidade", () => {
    const lookup = findExistingUnit(index, { unidade: "101", bloco: "2" }, true);
    expect(lookup.kind).toBe("found");
    if (lookup.kind === "found") expect(lookup.row.id).toBe("b");
  });

  it("unidade sem bloco (banco bloco vazio) casa com Excel sem bloco", () => {
    const lookup = findExistingUnit(index, { unidade: "50" }, true);
    expect(lookup.kind).toBe("found");
    if (lookup.kind === "found") expect(lookup.row.id).toBe("c");
  });

  it("tolerância: divergência de formatação de bloco com 1 candidata", () => {
    const single = buildUnitIndex(
      [{ id: "x", bloco: "Bloco 1", unidade: "101" }],
      true
    );
    const lookup = findExistingUnit(single, { unidade: "101", bloco: "1" }, true);
    expect(lookup.kind).toBe("found");
    if (lookup.kind === "found") expect(lookup.row.id).toBe("x");
  });

  it("bloco divergente com 2 candidatas: desambigua por bloco normalizado", () => {
    const lookup = findExistingUnit(index, { unidade: "101", bloco: "Bloco 1" }, true);
    expect(lookup.kind).toBe("found");
    if (lookup.kind === "found") expect(lookup.row.id).toBe("a");
  });

  it("ambíguo: 2 candidatas e Excel sem bloco → linha ignorada (nunca duplicar)", () => {
    const lookup = findExistingUnit(index, { unidade: "101" }, true);
    expect(lookup.kind).toBe("ambiguous");
    if (lookup.kind === "ambiguous") expect(lookup.candidates).toHaveLength(2);
  });

  it("ambíguo: bloco do Excel não corresponde a nenhuma candidata", () => {
    const lookup = findExistingUnit(index, { unidade: "101", bloco: "9" }, true);
    expect(lookup.kind).toBe("ambiguous");
  });

  it("missing: unidade inexistente", () => {
    expect(findExistingUnit(index, { unidade: "999", bloco: "1" }, true).kind).toBe("missing");
  });

  it("índice sem bloco (units/moment_units): chave é só a unidade", () => {
    const legacy = buildUnitIndex([{ id: "m", unidade: 101 }], false);
    const lookup = findExistingUnit(legacy, { unidade: "101" }, false);
    expect(lookup.kind).toBe("found");
    if (lookup.kind === "found") expect(lookup.row.id).toBe("m");
  });
});

// ─── composeUnitToSave — cenários do usuário ──────────────────────────────────
describe("composeUnitToSave", () => {
  it("célula em branco preserva o valor anterior de projeto_units", () => {
    const projetoRow: ExcelRow = {
      id: "a",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      empreendimento_id: EMP,
      bloco: "1",
      unidade: "101",
      andar: 10,
      area: 50,
      area_str: "50 m²",
      valor_venda: 500000,
      status: "vendido",
      tipologia: "2 quartos",
    };
    const partial = buildPartialUnitFromRow(
      { Unidade: "101", Andar: 10, "Valor de Venda": "", Bloco: "1" },
      mapColumns(["Unidade", "Andar", "Valor de Venda", "Bloco"]).mapped,
      EMP,
      3
    );
    const merged = composeUnitToSave({ partial, projetoRow, dedicatedRow: null, nowIso: "2026-01-01T00:00:00Z" });

    expect(merged.valor_venda).toBe(500000); // valor antigo preservado
    expect(merged.status).toBe("vendido"); // não tocado
    expect(merged.tipologia).toBe("2 quartos"); // não tocado
    expect(merged.bloco).toBe("1"); // identidade da linha existente
    expect(merged.ordem).toBe(3);
    expect(merged.updated_at).toBe("2026-01-01T00:00:00Z");
    expect(merged).not.toHaveProperty("id");
    expect(merged).not.toHaveProperty("created_at");
  });

  it("preço preenchido no Excel sobrescreve o valor antigo", () => {
    const projetoRow: ExcelRow = { bloco: "1", unidade: "101", valor_venda: 500000 };
    const partial: ExcelRow = { empreendimento_id: EMP, ordem: 1, unidade: "101", valor_venda: 550000 };
    const merged = composeUnitToSave({ partial, projetoRow, dedicatedRow: null, nowIso: "n" });
    expect(merged.valor_venda).toBe(550000);
  });

  it("valor antigo da tabela dedicada preenche lacuna nula de projeto_units (curativo)", () => {
    const projetoRow: ExcelRow = { bloco: "1", unidade: "101", valor_venda: null, status: "disponivel" };
    const dedicatedRow: ExcelRow = { id: "d", bloco: "1", unidade: 101, valor_venda: 450000, status: "reservado" };
    const partial: ExcelRow = { empreendimento_id: EMP, ordem: 1, unidade: "101" };
    const merged = composeUnitToSave({ partial, projetoRow, dedicatedRow, nowIso: "n" });

    expect(merged.valor_venda).toBe(450000); // curado a partir do espelho público
    expect(merged.status).toBe("disponivel"); // projeto_units vence quando não-nulo
    expect(merged.bloco).toBe("1"); // identidade preservada
  });

  it("unidade nova em empreendimento legado herda valores antigos da tabela dedicada", () => {
    const dedicatedRow: ExcelRow = { id: "d", bloco: "2", unidade: 205, valor_venda: 610000, area: 62 };
    const partial: ExcelRow = { empreendimento_id: EMP, ordem: 7, unidade: "205", andar: 2 };
    const merged = composeUnitToSave({ partial, projetoRow: null, dedicatedRow, nowIso: "n" });

    expect(merged.valor_venda).toBe(610000); // valor antigo mantido (célula em branco)
    expect(merged.area).toBe(62);
    expect(merged.area_str).toBe("62 m²");
    expect(merged.unidade).toBe("205"); // inteiro legado → texto
    expect(merged.bloco).toBe("2");
    expect(merged).not.toHaveProperty("id");
  });

  it("bloco divergente no Excel não muda a identidade da linha existente", () => {
    const projetoRow: ExcelRow = { bloco: "1", unidade: "101", valor_venda: 500000 };
    const partial: ExcelRow = { empreendimento_id: EMP, ordem: 1, unidade: "101", bloco: "Bloco 1", valor_venda: 510000 };
    const merged = composeUnitToSave({ partial, projetoRow, dedicatedRow: null, nowIso: "n" });
    expect(merged.bloco).toBe("1"); // upsert atualiza a MESMA linha
    expect(merged.valor_venda).toBe(510000);
  });
});

// ─── Mapa de tabelas dedicadas ────────────────────────────────────────────────
describe("DEDICATED_TABLE_MAP", () => {
  it("alias crítico: slug 'residencial-vitta' resolve vitta_units", () => {
    expect(DEDICATED_TABLE_MAP["residencial-vitta"]?.table).toBe("vitta_units");
  });
  it("alias 'vitta' continua resolvendo vitta_units", () => {
    expect(DEDICATED_TABLE_MAP["vitta"]?.table).toBe("vitta_units");
  });
  it("aliases dos demais empreendimentos legados", () => {
    expect(DEDICATED_TABLE_MAP["moment"]?.table).toBe("moment_units");
    expect(DEDICATED_TABLE_MAP["villa-bianco"]?.table).toBe("villa_bianco_units");
    expect(DEDICATED_TABLE_MAP["quattre-istambul"]?.table).toBe("units");
  });
  it("alias compartilha a mesma configuração (sync fields da vitta)", () => {
    expect(DEDICATED_TABLE_MAP["residencial-vitta"]).toBe(DEDICATED_TABLE_MAP["vitta"]);
  });
});
