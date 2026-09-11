import { describe, expect, it } from "vitest";
import {
  daysInUtcMonth,
  parseDaysParam,
  projectMonthlyFromMtd,
  utcDayOfMonth,
  utcDayWindow,
  utcMonthStartIso,
  utcTodayStr,
} from "../src/lib/usage-window";

describe("usage-window", () => {
  describe("utcDayWindow", () => {
    it("cobertura do dia é [00:00Z, 00:00Z do dia seguinte) — fim exclusivo", () => {
      const w = utcDayWindow("2026-09-11");
      expect(w.gte).toBe("2026-09-11T00:00:00.000Z");
      expect(w.lt).toBe("2026-09-12T00:00:00.000Z");
    });

    it("não perde eventos entre 23:59:59 e meia-noite (bug do lt 23:59:59)", () => {
      const w = utcDayWindow("2026-09-11");
      // 23:59:59.500 deve estar dentro da janela (era perdido antes)
      const evt = new Date("2026-09-11T23:59:59.500Z").getTime();
      expect(evt >= new Date(w.gte).getTime()).toBe(true);
      expect(evt < new Date(w.lt).getTime()).toBe(true);
    });

    it("evento exatamente na meia-noite do dia seguinte fica fora (exclusivo)", () => {
      const w = utcDayWindow("2026-09-11");
      const evt = new Date("2026-09-12T00:00:00.000Z").getTime();
      expect(evt < new Date(w.lt).getTime()).toBe(false);
    });

    it("funciona no atravessar de mês", () => {
      const w = utcDayWindow("2026-08-31");
      expect(w.lt).toBe("2026-09-01T00:00:00.000Z");
    });

    it("rejeita data malformada", () => {
      expect(() => utcDayWindow("11/09/2026")).toThrow();
      expect(() => utcDayWindow("2026-13-40")).toThrow();
    });
  });

  describe("utcMonthStartIso / dias do mês", () => {
    it("início do mês é a meia-noite UTC do dia 1", () => {
      expect(utcMonthStartIso(new Date("2026-09-11T15:30:00Z"))).toBe(
        "2026-09-01T00:00:00.000Z"
      );
    });

    it("dias reais do mês (2026 não é bissexto; 2024 é)", () => {
      expect(daysInUtcMonth(new Date("2026-02-10T00:00:00Z"))).toBe(28);
      expect(daysInUtcMonth(new Date("2024-02-10T00:00:00Z"))).toBe(29);
      expect(daysInUtcMonth(new Date("2026-09-11T00:00:00Z"))).toBe(30);
      expect(daysInUtcMonth(new Date("2026-12-11T00:00:00Z"))).toBe(31);
    });

    it("dia corrente do mês em UTC", () => {
      expect(utcDayOfMonth(new Date("2026-09-11T23:00:00Z"))).toBe(11);
      expect(utcDayOfMonth(new Date("2026-09-01T00:30:00Z"))).toBe(1);
    });

    it("today str em UTC", () => {
      expect(utcTodayStr(new Date("2026-09-11T23:59:59Z"))).toBe("2026-09-11");
      expect(utcTodayStr(new Date("2026-09-11T00:00:00Z"))).toBe("2026-09-11");
    });
  });

  describe("projectMonthlyFromMtd", () => {
    it("não soma o dia corrente novamente (usa acumulado do mês que já inclui hoje)", () => {
      // Acumulado do mês no dia 11 = 1100 → projeção = 1100/11 × 30
      expect(projectMonthlyFromMtd(1100, 11, 30)).toBe(3000);
    });

    it("usa dias reais do mês", () => {
      expect(projectMonthlyFromMtd(110, 11, 28)).toBe(280);
      expect(projectMonthlyFromMtd(110, 11, 31)).toBe(310);
    });

    it("evita divisão por zero no início do mês", () => {
      expect(projectMonthlyFromMtd(500, 0, 30)).toBe(500 * 30);
      expect(projectMonthlyFromMtd(500, 1, 30)).toBe(500 * 30);
    });

    it("entrada inválida resulta em 0", () => {
      expect(projectMonthlyFromMtd(-5, 11, 30)).toBe(0);
      expect(projectMonthlyFromMtd(Number.NaN, 11, 30)).toBe(0);
    });
  });
});

describe("parseDaysParam (analytics)", () => {
  it("default 30 quando ausente ou inválido", () => {
    expect(parseDaysParam(null)).toBe(30);
    expect(parseDaysParam("")).toBe(30);
    expect(parseDaysParam("abc")).toBe(30);
    expect(parseDaysParam("NaN")).toBe(30);
  });

  it("valor válido é preservado", () => {
    expect(parseDaysParam("7")).toBe(7);
    expect(parseDaysParam("365")).toBe(365);
  });

  it("fora da faixa é limitado (1..365)", () => {
    expect(parseDaysParam("0")).toBe(1);
    expect(parseDaysParam("-30")).toBe(1);
    expect(parseDaysParam("99999")).toBe(365);
  });
});
