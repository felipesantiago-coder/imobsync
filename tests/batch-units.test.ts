/**
 * Testes da lógica pura da atualização em lote (rota PATCH /units/batch).
 *
 * parseBatchRequestBody: validação e normalização do corpo.
 * matchBatchTargets: casamento identificador → linha com a mesma semântica
 * do PATCH individual (.single(): 1 exato; 0 = não encontrada; >1 = ambígua).
 */
import { describe, it, expect } from "vitest";
import {
  parseBatchRequestBody,
  matchBatchTargets,
  BATCH_VALID_STATUSES,
  BATCH_MAX_UNITS,
  type BatchRow,
} from "@/lib/batch-units";

describe("parseBatchRequestBody", () => {
  it("aceita corpo válido mínimo (apenas unidade)", () => {
    const parsed = parseBatchRequestBody({
      status: "reservado",
      unidades: [{ unidade: 101 }, { unidade: "102" }],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.status).toBe("reservado");
      expect(parsed.unidades).toEqual([{ unidade: 101 }, { unidade: "102" }]);
    }
  });

  it("aceita identificadores compostos (bloco/andar) e descarta vazios", () => {
    const parsed = parseBatchRequestBody({
      status: "vendido",
      unidades: [
        { bloco: "A", unidade: 101, andar: "2" },
        { bloco: null, unidade: 102, andar: "" },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.unidades[0]).toEqual({ bloco: "A", unidade: 101, andar: "2" });
      // bloco/andar vazios não devem vir no identificador normalizado
      expect(parsed.unidades[1]).toEqual({ unidade: 102 });
    }
  });

  it("rejeita corpo não-objeto", () => {
    expect(parseBatchRequestBody(null).ok).toBe(false);
    expect(parseBatchRequestBody("x").ok).toBe(false);
    expect(parseBatchRequestBody([1, 2]).ok).toBe(false);
  });

  it("rejeita status fora da whitelist", () => {
    const parsed = parseBatchRequestBody({ status: "alugado", unidades: [{ unidade: 1 }] });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.message).toContain(BATCH_VALID_STATUSES.join(", "));
  });

  it("rejeita unidades vazio, não-array ou acima do limite", () => {
    expect(parseBatchRequestBody({ status: "vendido", unidades: [] }).ok).toBe(false);
    expect(parseBatchRequestBody({ status: "vendido" }).ok).toBe(false);
    const big = Array.from({ length: BATCH_MAX_UNITS + 1 }, () => ({ unidade: 1 }));
    const parsed = parseBatchRequestBody({ status: "vendido", unidades: big });
    expect(parsed.ok).toBe(false);
  });

  it("rejeita item sem unidade ou com tipos incorretos", () => {
    expect(parseBatchRequestBody({ status: "vendido", unidades: [{}] }).ok).toBe(false);
    expect(parseBatchRequestBody({ status: "vendido", unidades: [{ unidade: null }] }).ok).toBe(false);
    expect(parseBatchRequestBody({ status: "vendido", unidades: [{ unidade: "" }] }).ok).toBe(false);
    expect(parseBatchRequestBody({ status: "vendido", unidades: [{ unidade: true }] }).ok).toBe(false);
    expect(parseBatchRequestBody({ status: "vendido", unidades: [{ unidade: 1, bloco: {} }] }).ok).toBe(false);
    expect(parseBatchRequestBody({ status: "vendido", unidades: ["101"] }).ok).toBe(false);
  });
});

describe("matchBatchTargets", () => {
  const rows: BatchRow[] = [
    { id: "u1", status: "disponivel", unidade: 101, bloco: "A" },
    { id: "u2", status: "reservado", unidade: 101, bloco: "B" },
    { id: "u3", status: "disponivel", unidade: 102, bloco: "A" },
    { id: "u4", status: "vendido", unidade: 201, bloco: "A", andar: "2" },
    { id: "u5", status: "vendido", unidade: 201, bloco: "A", andar: "3" },
  ];

  it("casa por unidade quando ela é única (sem bloco informado)", () => {
    const { matches, failures } = matchBatchTargets(rows, [{ unidade: 102 }]);
    expect(matches.size).toBe(1);
    expect(matches.get(0)?.id).toBe("u3");
    expect(failures).toHaveLength(0);
  });

  it("casa por (bloco, unidade) quando o identificador informa bloco", () => {
    const { matches, failures } = matchBatchTargets(rows, [{ bloco: "B", unidade: 101 }]);
    expect(matches.size).toBe(1);
    expect(matches.get(0)?.id).toBe("u2");
    expect(failures).toHaveLength(0);
  });

  it("marca ambígua quando unidade repete sem bloco", () => {
    const { matches, failures } = matchBatchTargets(rows, [{ unidade: 101 }]);
    expect(matches.size).toBe(0);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ unidade: "101", bloco: null, motivo: "ambigua" });
  });

  it("casa por (bloco, unidade, andar) quando todos informados", () => {
    const { matches } = matchBatchTargets(rows, [{ bloco: "A", unidade: 201, andar: "3" }]);
    expect(matches.size).toBe(1);
    expect(matches.get(0)?.id).toBe("u5");
  });

  it("tolera divergência de formatação: filtro composto vazio + base unitária assume a linha", () => {
    // bloco "a" (minúsculo) não casa com "A", mas 102 é única → assume
    const { matches, failures } = matchBatchTargets(rows, [{ bloco: "a", unidade: 102 }]);
    expect(matches.size).toBe(1);
    expect(matches.get(0)?.id).toBe("u3");
    expect(failures).toHaveLength(0);
  });

  it("não assume fallback quando a base tem múltiplas linhas (evita falso positivo)", () => {
    // unidade 201 tem andares 2 e 3; identificador com andar inexistente "9" não casa
    const { matches, failures } = matchBatchTargets(rows, [{ bloco: "A", unidade: 201, andar: "9" }]);
    expect(matches.size).toBe(0);
    expect(failures[0].motivo).toBe("nao_encontrada");
  });

  it("reporta não encontrada para unidade inexistente, preservando bloco/andar no payload", () => {
    const { failures } = matchBatchTargets(rows, [{ bloco: "C", unidade: 999, andar: "1" }]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toEqual({ unidade: "999", bloco: "C", andar: "1", motivo: "nao_encontrada" });
  });

  it("processa lote misto preservando o índice de cada identificador", () => {
    const { matches, failures } = matchBatchTargets(rows, [
      { unidade: 102 },                    // ok → u3
      { bloco: "A", unidade: 101 },        // ok → u1
      { unidade: 777 },                    // não encontrada
      { unidade: 101 },                    // ambígua
    ]);
    expect(matches.get(0)?.id).toBe("u3");
    expect(matches.get(1)?.id).toBe("u1");
    expect(failures[0]).toMatchObject({ unidade: "777", motivo: "nao_encontrada" });
    expect(failures[1]).toMatchObject({ unidade: "101", motivo: "ambigua" });
  });

  it("compara unidade como string (banco numérico × cliente string)", () => {
    const numericRows: BatchRow[] = [{ id: "n1", status: "disponivel", unidade: 301 }];
    const { matches, failures } = matchBatchTargets(numericRows, [{ unidade: "301" }]);
    expect(matches.size).toBe(1);
    expect(failures).toHaveLength(0);
  });
});
