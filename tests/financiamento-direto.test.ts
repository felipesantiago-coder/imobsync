import { describe, expect, it } from "vitest";
import {
  clampCaptacaoPct,
  clampFinDiretoParcelas,
  FIN_DIRETO_DEFAULT_CAPTACAO_PCT,
  FIN_DIRETO_DEFAULT_PARCELAS,
  FIN_DIRETO_MAX_PARCELAS,
  pricePmt,
  priceTotals,
} from "@/lib/financiamento-direto";

describe("clampFinDiretoParcelas", () => {
  it("valores válidos passam inalterados", () => {
    expect(clampFinDiretoParcelas(120)).toBe(120);
    expect(clampFinDiretoParcelas(1)).toBe(1);
    expect(clampFinDiretoParcelas(360)).toBe(360);
  });

  it("arredonda decimais para inteiro", () => {
    expect(clampFinDiretoParcelas(60.4)).toBe(60);
    expect(clampFinDiretoParcelas("48")).toBe(48);
  });

  it("inválidos/limite: 0, negativo e não-numérico → default", () => {
    expect(clampFinDiretoParcelas(0)).toBe(FIN_DIRETO_DEFAULT_PARCELAS);
    expect(clampFinDiretoParcelas(-10)).toBe(FIN_DIRETO_DEFAULT_PARCELAS);
    expect(clampFinDiretoParcelas("abc")).toBe(FIN_DIRETO_DEFAULT_PARCELAS);
    expect(clampFinDiretoParcelas(null)).toBe(FIN_DIRETO_DEFAULT_PARCELAS);
    expect(clampFinDiretoParcelas(undefined)).toBe(FIN_DIRETO_DEFAULT_PARCELAS);
  });

  it("acima do máximo é saturado em 360", () => {
    expect(clampFinDiretoParcelas(500)).toBe(FIN_DIRETO_MAX_PARCELAS);
  });
});

describe("clampCaptacaoPct", () => {
  it("valores válidos passam inalterados", () => {
    expect(clampCaptacaoPct(40)).toBe(40);
    expect(clampCaptacaoPct(0)).toBe(0);
    expect(clampCaptacaoPct(100)).toBe(100);
  });

  it("fora da faixa é saturado em 0..100", () => {
    expect(clampCaptacaoPct(-5)).toBe(0);
    expect(clampCaptacaoPct(150)).toBe(100);
  });

  it("inválido → default", () => {
    expect(clampCaptacaoPct("abc")).toBe(FIN_DIRETO_DEFAULT_CAPTACAO_PCT);
    expect(clampCaptacaoPct(null)).toBe(FIN_DIRETO_DEFAULT_CAPTACAO_PCT);
  });
});

describe("pricePmt", () => {
  it("caso clássico: PV 100.000, 1% a.m., 120 parcelas → PMT ≈ 1.434,71", () => {
    expect(pricePmt(100000, 1, 120)).toBeCloseTo(1434.71, 1);
  });

  it("PV 300.000, 0,80% a.m., 180 parcelas → PMT ≈ 3.150,80", () => {
    // PMT = 300000*0.008/(1-1.008^-180)
    expect(pricePmt(300000, 0.8, 180)).toBeCloseTo(3150.8, 0);
  });

  it("taxa 0% degenere para divisão simples (PV/n)", () => {
    expect(pricePmt(120000, 0, 120)).toBeCloseTo(1000, 6);
  });

  it("n = 1: parcela única = PV·(1+i)", () => {
    expect(pricePmt(1000, 1, 1)).toBeCloseTo(1010, 6);
  });

  it("entrada sem estimativa: PV ≤ 0, n < 1 ou taxa negativa → 0", () => {
    expect(pricePmt(0, 1, 120)).toBe(0);
    expect(pricePmt(-100, 1, 120)).toBe(0);
    expect(pricePmt(100000, 1, 0)).toBe(0);
    expect(pricePmt(100000, -1, 120)).toBe(0);
    expect(pricePmt(100000, NaN, 120)).toBe(0);
  });

  it("consistência: soma das parcelas quita PV + juros (amortização PRICE)", () => {
    // Simula a tabela PRICE: juros do mês = saldo·i; amortização = PMT − juros.
    const pv = 250000;
    const i = 1.2 / 100;
    const n = 240;
    const pmt = pricePmt(pv, 1.2, n);
    let saldo = pv;
    for (let m = 0; m < n; m++) {
      const juros = saldo * i;
      const amort = pmt - juros;
      saldo -= amort;
    }
    expect(saldo).toBeCloseTo(0, 4);
  });
});

describe("priceTotals", () => {
  it("total = PMT×n e juros = total − PV", () => {
    const { pmt, total, juros } = priceTotals(100000, 1, 120);
    expect(pmt).toBeCloseTo(1434.71, 1);
    expect(total).toBeCloseTo(pmt * 120, 6);
    expect(juros).toBeCloseTo(total - 100000, 6);
    expect(juros).toBeGreaterThan(0);
  });

  it("taxa 0% → juros zero e total = PV", () => {
    const { total, juros } = priceTotals(120000, 0, 60);
    expect(total).toBeCloseTo(120000, 6);
    expect(juros).toBeCloseTo(0, 6);
  });
});
