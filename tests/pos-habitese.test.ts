import { describe, expect, it } from "vitest";
import {
  clampJurosPosHabitese,
  formatJurosPosHabitese,
  JUROS_POS_HABITESE_DEFAULT,
  normalizePosHabiteseIndice,
  posHabiteseFullLabel,
  posHabiteseIndexLabel,
  posHabiteseIndiceOptions,
} from "@/lib/pos-habitese";

describe("normalizePosHabiteseIndice", () => {
  it("mantém 'igpm' e 'ipca' válidos", () => {
    expect(normalizePosHabiteseIndice("igpm")).toBe("igpm");
    expect(normalizePosHabiteseIndice("ipca")).toBe("ipca");
  });

  it("fallback para 'igpm' em valores inválidos/ausentes (configs antigas)", () => {
    expect(normalizePosHabiteseIndice(undefined)).toBe("igpm");
    expect(normalizePosHabiteseIndice(null)).toBe("igpm");
    expect(normalizePosHabiteseIndice("")).toBe("igpm");
    expect(normalizePosHabiteseIndice("SELIC")).toBe("igpm");
  });
});

describe("posHabiteseIndiceOptions", () => {
  it("expõe exatamente IGPM e IPCA", () => {
    expect(posHabiteseIndiceOptions()).toEqual(["igpm", "ipca"]);
  });
});

describe("clampJurosPosHabitese", () => {
  it("aceita number e string numérica (numeric do Supabase vem como string)", () => {
    expect(clampJurosPosHabitese(1)).toBe(1);
    expect(clampJurosPosHabitese("0.80")).toBe(0.8);
    expect(clampJurosPosHabitese("0,80")).toBe(0.8);
  });

  it("limita a faixa 0..20 e sanitiza inválidos para o default 1%", () => {
    expect(clampJurosPosHabitese(0)).toBe(0);
    expect(clampJurosPosHabitese(50)).toBe(20);
    expect(clampJurosPosHabitese(-1)).toBe(JUROS_POS_HABITESE_DEFAULT);
    expect(clampJurosPosHabitese("abc")).toBe(JUROS_POS_HABITESE_DEFAULT);
    expect(clampJurosPosHabitese(undefined)).toBe(JUROS_POS_HABITESE_DEFAULT);
    expect(clampJurosPosHabitese(null)).toBe(JUROS_POS_HABITESE_DEFAULT);
    expect(JUROS_POS_HABITESE_DEFAULT).toBe(1);
  });
});

describe("labels", () => {
  it("rótulo curto do índice", () => {
    expect(posHabiteseIndexLabel("igpm")).toBe("IGPM");
    expect(posHabiteseIndexLabel("ipca")).toBe("IPCA");
  });

  it("taxa formatada em pt-BR com 2 casas", () => {
    expect(formatJurosPosHabitese(1)).toBe("1,00%");
    expect(formatJurosPosHabitese(0.8)).toBe("0,80%");
  });

  it("rótulo completo índice + juros", () => {
    expect(posHabiteseFullLabel("igpm", 1)).toBe(
      "IGPM + juros de 1,00% ao mês"
    );
    expect(posHabiteseFullLabel("ipca", "0.80")).toBe(
      "IPCA + juros de 0,80% ao mês"
    );
  });

  it("config antiga sem índice/juros cai no padrão IGPM + 1,00% (texto histórico do PDF)", () => {
    expect(posHabiteseFullLabel(undefined, undefined)).toBe(
      "IGPM + juros de 1,00% ao mês"
    );
  });
});
