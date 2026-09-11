import { describe, expect, it } from "vitest";
import { evaluateSubscriptionValidity } from "../src/lib/subscription-guard";

describe("evaluateSubscriptionValidity (avaliação pura de assinatura)", () => {
  const now = new Date("2026-09-11T12:00:00Z");

  it("lifetime nunca expira", () => {
    expect(
      evaluateSubscriptionValidity({ status: "lifetime", data_fim: "2020-01-01T00:00:00Z" }, now)
    ).toEqual({ valid: true, expired: false });
    expect(
      evaluateSubscriptionValidity({ status: "lifetime", data_fim: null }, now)
    ).toEqual({ valid: true, expired: false });
  });

  it("active com data_fim futura é válido", () => {
    expect(
      evaluateSubscriptionValidity({ status: "active", data_fim: "2026-09-30T00:00:00Z" }, now)
    ).toEqual({ valid: true, expired: false });
  });

  it("active com data_fim passada está vencido (lazy expiration)", () => {
    expect(
      evaluateSubscriptionValidity({ status: "active", data_fim: "2026-09-11T11:59:59Z" }, now)
    ).toEqual({ valid: false, expired: true });
  });

  it("data_fim exatamente igual a agora conta como vencida (<=)", () => {
    expect(
      evaluateSubscriptionValidity({ status: "active", data_fim: "2026-09-11T12:00:00Z" }, now)
    ).toEqual({ valid: false, expired: true });
  });

  it("active com data_fim null é válido (plano pré-migration)", () => {
    expect(
      evaluateSubscriptionValidity({ status: "active", data_fim: null }, now)
    ).toEqual({ valid: true, expired: false });
  });
});
