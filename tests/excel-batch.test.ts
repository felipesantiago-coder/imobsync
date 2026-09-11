import { describe, expect, it } from "vitest";
import {
  chunk,
  conflictKeyOf,
  dedupeUpsertPayloads,
  groupDedicatedOps,
  type DedicatedOp,
  type UpsertItem,
} from "../src/lib/excel-batch";

function item(n: number, overrides: Partial<UpsertItem> = {}): UpsertItem {
  return {
    rowNo: n,
    unitName: `U${n}`,
    key: `emp::Bloco 1::U${n}`,
    kind: "updated",
    payload: { empreendimento_id: "emp", bloco: "Bloco 1", unidade: `U${n}`, valor_venda: 1000 + n },
    ...overrides,
  };
}

describe("excel-batch — dedupeUpsertPayloads", () => {
  it("mantém a ÚLTIMA ocorrência de chave duplicada (mesmo resultado do loop sequencial)", () => {
    const first = item(1, {
      key: "emp::Bloco 1::A101",
      unitName: "A101",
      payload: { empreendimento_id: "emp", bloco: "Bloco 1", unidade: "A101", status: "disponivel" },
    });
    const last = item(7, {
      key: "emp::Bloco 1::A101",
      unitName: "A101",
      kind: "updated",
      payload: { empreendimento_id: "emp", bloco: "Bloco 1", unidade: "A101", status: "vendido" },
    });
    const other = item(5, { key: "emp::Bloco 1::B202", unitName: "B202" });

    const { unique, duplicatedRows } = dedupeUpsertPayloads([first, other, last]);
    expect(duplicatedRows).toBe(1);
    expect(unique.length).toBe(2);
    const a101 = unique.find((u) => u.unitName === "A101");
    expect(a101?.payload.status).toBe("vendido"); // última linha vence
    expect(a101?.rowNo).toBe(7);
  });

  it("chaves distintas não são colapsadas", () => {
    const { unique, duplicatedRows } = dedupeUpsertPayloads([item(1), item(2), item(3)]);
    expect(duplicatedRows).toBe(0);
    expect(unique.length).toBe(3);
  });

  it("ordena pela posição da última ocorrência", () => {
    const a = item(1, { key: "emp::B::A" });
    const b = item(2, { key: "emp::B::B" });
    const a2 = item(3, { key: "emp::B::A" });
    const { unique } = dedupeUpsertPayloads([a, b, a2]);
    expect(unique.map((u) => u.unitName)).toEqual(["U2", "U3"]); // rowNo 2, depois 3
  });
});

describe("excel-batch — conflictKeyOf", () => {
  it("usa empreendimento_id + bloco + unidade crus (constraint única)", () => {
    expect(conflictKeyOf({ empreendimento_id: "e1", bloco: "Bloco 2", unidade: "101" })).toBe(
      "e1::Bloco 2::101"
    );
  });

  it("bloco ausente/null vira string vazia (nunca undefined no key)", () => {
    expect(conflictKeyOf({ empreendimento_id: "e1", unidade: "101" })).toBe("e1::::101");
    expect(conflictKeyOf({ empreendimento_id: "e1", bloco: null, unidade: "101" })).toBe("e1::::101");
  });
});

describe("excel-batch — groupDedicatedOps", () => {
  it("payloads idênticos vão para o mesmo grupo (1 update .in em vez de N)", () => {
    const payload = { status: "vendido" };
    const ops: DedicatedOp[] = [
      { rowNo: 1, unitName: "A", id: "id-a", payload: { ...payload } },
      { rowNo: 2, unitName: "B", id: "id-b", payload: { status: "vendido" } },
      { rowNo: 3, unitName: "C", id: "id-c", payload: { status: "reservado" } },
    ];
    const groups = groupDedicatedOps(ops);
    expect(groups.length).toBe(2);
    const vendido = groups.find((g) => g.payload.status === "vendido");
    expect(vendido?.ops.map((o) => o.id)).toEqual(["id-a", "id-b"]);
  });

  it("não mistura payloads com tipos diferentes (number vs string)", () => {
    const ops: DedicatedOp[] = [
      { rowNo: 1, unitName: "A", id: "id-a", payload: { valor: 1000 } },
      { rowNo: 2, unitName: "B", id: "id-b", payload: { valor: "1000" } },
    ];
    expect(groupDedicatedOps(ops).length).toBe(2);
  });

  it("lista vazia → nenhum grupo", () => {
    expect(groupDedicatedOps([])).toEqual([]);
  });
});

describe("excel-batch — chunk", () => {
  it("divide preservando conteúdo e ordem", () => {
    const arr = Array.from({ length: 205 }, (_, i) => i);
    const parts = chunk(arr, 100);
    expect(parts.length).toBe(3);
    expect(parts.flat()).toEqual(arr);
  });

  it("tamanho inválido não divide por zero", () => {
    expect(chunk([1, 2, 3], 0).length).toBe(3);
  });
});
