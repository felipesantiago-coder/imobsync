/**
 * Characterization tests (audit Phase 0.1) — golden values captured BEFORE
 * any performance refactoring. These lock the observable behavior of
 * exported pure business functions. If a perf change alters any value here,
 * that is a functional regression, not an intended improvement.
 *
 * Scope note: flows requiring staging credentials (login/MFA, Mercado Pago,
 * Realtime, uploads, PDF rendering) are documented as blocked in
 * docs/performance/PHASE0-BASELINE.md and are NOT covered here.
 */
import { describe, it, expect } from "vitest";
import { isSubscriptionActive, getStatusLabel, type AssinaturaDB } from "@/lib/mercadopago";
import { units, getStats, formatCurrency, formatCompactCurrency } from "@/lib/units-data";
import { momentUnits } from "@/lib/moment-data";

function makeAssinatura(overrides: Partial<AssinaturaDB>): AssinaturaDB {
  return {
    id: "a-1",
    user_id: "u-1",
    plano_id: "p-1",
    mercadopago_subscription_id: null,
    mercadopago_payer_id: null,
    status: "active",
    metodo_pagamento: null,
    data_inicio: null,
    data_fim: null,
    ultimo_pagamento_em: null,
    proximo_ciclo_em: null,
    cancelado_em: null,
    motivo_cancelamento: "",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("isSubscriptionActive — characterization", () => {
  it("returns false for null", () => {
    expect(isSubscriptionActive(null)).toBe(false);
  });

  it("returns true for lifetime regardless of dates", () => {
    expect(
      isSubscriptionActive(makeAssinatura({ status: "lifetime", data_fim: "2000-01-01T00:00:00Z" }))
    ).toBe(true);
  });

  it("returns true for active without data_fim (pre-migration plan)", () => {
    expect(isSubscriptionActive(makeAssinatura({ status: "active", data_fim: null }))).toBe(true);
  });

  it("returns true for active with future data_fim", () => {
    expect(
      isSubscriptionActive(makeAssinatura({ status: "active", data_fim: "2099-12-31T00:00:00Z" }))
    ).toBe(true);
  });

  it("returns false for active with past data_fim", () => {
    expect(
      isSubscriptionActive(makeAssinatura({ status: "active", data_fim: "2020-01-01T00:00:00Z" }))
    ).toBe(false);
  });

  it("returns false for every non-active status", () => {
    const statuses = ["pending", "cancelled", "paused", "expired", "cancelled_by_user"] as const;
    for (const status of statuses) {
      expect(isSubscriptionActive(makeAssinatura({ status, data_fim: null }))).toBe(false);
    }
  });
});

describe("getStatusLabel — characterization", () => {
  it("maps canonical statuses to pt-BR labels", () => {
    expect(getStatusLabel("pending")).toBe("Pendente");
    expect(getStatusLabel("active")).toBe("Ativa");
    expect(getStatusLabel("cancelled")).toBe("Cancelada");
    expect(getStatusLabel("paused")).toBe("Pausada");
    expect(getStatusLabel("expired")).toBe("Expirada");
    expect(getStatusLabel("cancelled_by_user")).toBe("Cancelada pelo usuário");
    expect(getStatusLabel("approved")).toBe("Aprovado");
    expect(getStatusLabel("rejected")).toBe("Rejeitado");
    expect(getStatusLabel("refunded")).toBe("Estornado");
    expect(getStatusLabel("in_process")).toBe("Em processamento");
  });

  it("returns unknown statuses verbatim", () => {
    expect(getStatusLabel("status_inexistente")).toBe("status_inexistente");
  });
});

describe("units-data getStats — characterization", () => {
  const stats = getStats();

  it("counts 72 static units", () => {
    expect(units.length).toBe(72);
    expect(stats.totalUnits).toBe(72);
  });

  it("reports zero units with the legacy 'consultar' status", () => {
    // The "consultar" status is not produced by any data source today.
    expect(stats.consultar).toBe(0);
  });

  it("keeps price aggregates consistent with the unit data", () => {
    const prices = units
      .map((u) => u.valorVenda)
      .filter((v): v is number => v !== null);
    expect(stats.menorPreco).toBe(Math.min(...prices));
    expect(stats.maiorPreco).toBe(Math.max(...prices));
    const media = prices.reduce((a, b) => a + b, 0) / prices.length;
    expect(stats.mediaPreco).toBeCloseTo(media, 10);
    expect(stats.totalVGV).toBeCloseTo(prices.reduce((a, b) => a + b, 0), 10);
  });

  it("derives disponiveis from the same data", () => {
    expect(stats.disponiveis).toBe(units.filter((u) => u.status === "disponivel").length);
  });

  it("exposes the four canonical area types", () => {
    expect(stats.areasDisponiveis.sort()).toEqual(["100m²", "66m²", "67m²", "69m²"].sort());
  });
});

describe("currency formatting — characterization", () => {
  it("formats BRL with pt-BR conventions", () => {
    expect(formatCurrency(1234.56)).toBe("R$\u00A01.234,56");
    expect(formatCurrency(0)).toBe("R$\u00A00,00");
  });

  it("formats compact currency thresholds", () => {
    expect(formatCompactCurrency(1_500_000)).toBe("R$ 1.5M");
    expect(formatCompactCurrency(2_500)).toBe("R$ 3K");
    expect(formatCompactCurrency(999)).toBe("R$\u00A0999,00");
  });
});

describe("moment-data derived fields — characterization", () => {
  it("derives valorStr and valorFormatado for every unit", () => {
    expect(momentUnits.length).toBe(72);
    for (const unit of momentUnits) {
      expect(unit.valorStr.length).toBeGreaterThan(0);
      expect(unit.valorFormatado.length).toBeGreaterThan(0);
    }
  });

  it("falls back to 'Consulte' text for units without price", () => {
    const semValor = momentUnits.filter((u) => u.valorVenda === null);
    expect(semValor.length).toBeGreaterThan(0);
    for (const unit of semValor) {
      expect(unit.valorStr).toBe("Consulte");
      expect(unit.valorFormatado).toBe("Consulte o valor");
    }
  });
});
