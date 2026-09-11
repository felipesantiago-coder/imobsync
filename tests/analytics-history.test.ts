import { describe, expect, it } from "vitest";
import {
  chunkForInsert,
  HISTORY_INSERT_CHUNK,
  type UnitStatusHistoryInsert,
} from "../src/lib/analytics";

function row(n: number): UnitStatusHistoryInsert {
  return {
    unit_id: `id-${n}`,
    empreendimento_id: "emp-1",
    unidade: `U${n}`,
    bloco: "Bloco 1",
    status_anterior: "disponivel",
    status_novo: "reservado",
    changed_by: "user-1",
    changed_by_role: "admin",
  };
}

describe("histórico em lote (unit_status_history)", () => {
  it("tamanho de chunk padrão é 100 (500 unidades → 5 inserts, não 500)", () => {
    expect(HISTORY_INSERT_CHUNK).toBe(100);
    const chunks = chunkForInsert(Array.from({ length: 500 }, (_, i) => row(i)));
    expect(chunks.length).toBe(5);
    expect(chunks[0].length).toBe(100);
    expect(chunks[4].length).toBe(100);
  });

  it("chunk final menor quando não fecha múltiplo exato", () => {
    const chunks = chunkForInsert(Array.from({ length: 250 }, (_, i) => row(i)));
    expect(chunks.length).toBe(3);
    expect(chunks[2].length).toBe(50);
  });

  it("lista vazia não gera chunk", () => {
    expect(chunkForInsert([])).toEqual([]);
  });

  it("tamanho inválido é elevado a 1 (nunca divide por zero)", () => {
    expect(chunkForInsert([row(1), row(2)], 0).length).toBe(2);
    expect(chunkForInsert([row(1)], -5).length).toBe(1);
  });

  it("preserva ordem e integridade das linhas", () => {
    const rows = Array.from({ length: 205 }, (_, i) => row(i));
    const flat = chunkForInsert(rows).flat();
    expect(flat.length).toBe(rows.length);
    expect(flat[0].unit_id).toBe("id-0");
    expect(flat[204].unit_id).toBe("id-204");
  });
});
