import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";

/**
 * Smoke test da superfície da API do XLSX usada por
 * src/app/api/admin-sistema/empreendimentos/upload-excel/route.ts.
 *
 * O projeto usa a distribuição oficial SheetJS (cdn.sheetjs.com/xlsx-0.20.3),
 * pois o registry npm congela o pacote em 0.18.5 (advisories GHSA-4r6h-8v6p-xvw6
 * e GHSA-5pgg-2g8v-p4x9 sem fix pelo registry). Estes testes garantem que as
 * chamadas críticas do parse continuam com o mesmo contrato após a troca.
 */

function buildWorkbookBuffer(rows: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Plan1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("xlsx (SheetJS 0.20.x) — contrato usado pelo upload-excel", () => {
  it("lê buffer com { type: 'buffer' } e primeira aba como na rota", () => {
    const buf = buildWorkbookBuffer([
      ["Empreendimento", "Bloco", "Unidade", "Valor de Venda"],
      ["Portal do Parque II", "1", "101", "450000"],
    ]);
    const workbook = XLSX.read(buf, { type: "buffer" });
    expect(workbook.SheetNames.length).toBe(1);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    expect(sheet).toBeTruthy();
  });

  it("sheet_to_json com defval:'' mantém células ausentes como string vazia", () => {
    const buf = buildWorkbookBuffer([
      ["Bloco", "Unidade", "Valor de Venda"],
      ["A", "101", "500000"],
      ["A", "102"], // linha sem valor — defval deve preencher ""
    ]);
    const workbook = XLSX.read(buf, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    expect(rows).toHaveLength(2);
    expect(rows[0]["Valor de Venda"]).toBe("500000");
    expect(rows[1]["Valor de Venda"]).toBe("");
    expect(rows[1]["Unidade"]).toBe("102");
  });

  it("converte valores numéricos e datas sem alterar semântica do parse", () => {
    const buf = buildWorkbookBuffer([
      ["Unidade", "Preço", "Data"],
      ["101", 450000, "2026-09-11"],
    ]);
    const workbook = XLSX.read(buf, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[workbook.SheetNames[0]],
      { defval: "" },
    );
    expect(Number(rows[0]["Preço"])).toBe(450000);
    expect(String(rows[0]["Data"])).toContain("2026");
  });
});
