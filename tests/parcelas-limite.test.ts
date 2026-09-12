import { describe, expect, it } from "vitest";
import {
  limiteParcelasMensais,
  limiteParcelasMensaisFrase,
} from "@/lib/parcelas-limite";

describe("limiteParcelasMensais — padrão (até o mês anterior à entrega)", () => {
  it("meses intermediários recuam 1 mês no mesmo ano", () => {
    expect(limiteParcelasMensais(11, 2027, false)).toEqual({ month: 10, year: 2027 });
    expect(limiteParcelasMensais(6, 2026, false)).toEqual({ month: 5, year: 2026 });
    expect(limiteParcelasMensais(12, 2027, false)).toEqual({ month: 11, year: 2027 });
  });

  it("entrega em Janeiro recua para Dezembro do ano anterior", () => {
    expect(limiteParcelasMensais(1, 2028, false)).toEqual({ month: 12, year: 2027 });
  });

  it("undefined/ausente (configs antigas) mantém o comportamento padrão", () => {
    expect(limiteParcelasMensais(11, 2027, undefined)).toEqual({ month: 10, year: 2027 });
    expect(limiteParcelasMensais(1, 2028, undefined)).toEqual({ month: 12, year: 2027 });
  });
});

describe("limiteParcelasMensais — opção ativa (até o mês de entrega, inclusive)", () => {
  it("mantém o próprio mês de entrega como limite", () => {
    expect(limiteParcelasMensais(11, 2027, true)).toEqual({ month: 11, year: 2027 });
    expect(limiteParcelasMensais(6, 2026, true)).toEqual({ month: 6, year: 2026 });
    expect(limiteParcelasMensais(12, 2027, true)).toEqual({ month: 12, year: 2027 });
  });

  it("entrega em Janeiro limita em Janeiro do mesmo ano (sem recuar ano)", () => {
    expect(limiteParcelasMensais(1, 2028, true)).toEqual({ month: 1, year: 2028 });
  });
});

describe("limiteParcelasMensais — entrada suja", () => {
  it("mês inválido devolve fallback sem estourar cronograma", () => {
    expect(limiteParcelasMensais(0, 2027, false)).toEqual({ month: 1, year: 2027 });
    expect(limiteParcelasMensais(13, 2027, true)).toEqual({ month: 1, year: 2027 });
    expect(limiteParcelasMensais("abc", 2027, true)).toEqual({ month: 1, year: 2027 });
  });

  it("ano inválido devolve ano 0 como sentinela", () => {
    expect(limiteParcelasMensais(11, NaN, true)).toEqual({ month: 1, year: 0 });
  });

  it("campos numéricos do Supabase em string são aceitos", () => {
    expect(limiteParcelasMensais("11", "2027", true)).toEqual({ month: 11, year: 2027 });
    expect(limiteParcelasMensais("11.4", "2027", false)).toEqual({ month: 10, year: 2027 });
  });

  it("valores decimais são arredondados", () => {
    expect(limiteParcelasMensais(11.6, 2027, true)).toEqual({ month: 12, year: 2027 });
  });
});

describe("limiteParcelasMensaisFrase", () => {
  it("descreve os dois modos", () => {
    expect(limiteParcelasMensaisFrase(true)).toBe("o mês da entrega");
    expect(limiteParcelasMensaisFrase(false)).toBe("o mês anterior à entrega");
    expect(limiteParcelasMensaisFrase(undefined)).toBe("o mês anterior à entrega");
  });
});
