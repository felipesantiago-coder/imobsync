import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Coordinator from "@/lib/subscription-refresh-coordinator";

/**
 * O módulo guarda estado em variável de nível de módulo. vi.resetModules +
 * import dinâmico isolam cada teste com estado zerado.
 */
async function freshImport() {
  vi.resetModules();
  return await import("@/lib/subscription-refresh-coordinator");
}

describe("subscription-refresh-coordinator", () => {
  let mod: typeof Coordinator;

  beforeEach(async () => {
    mod = await freshImport();
  });

  it("retorna false quando nunca houve refresh", () => {
    expect(mod.wasSubscriptionRefreshedRecently()).toBe(false);
  });

  it("retorna true imediatamente após markSubscriptionRefreshed", () => {
    mod.markSubscriptionRefreshed();
    expect(mod.wasSubscriptionRefreshedRecently()).toBe(true);
  });

  it("retorna false após expirar a janela de dedupe (30s)", () => {
    vi.useFakeTimers();
    try {
      mod.markSubscriptionRefreshed();
      vi.advanceTimersByTime(mod.SUB_REFRESH_DEDUPE_MS + 1);
      expect(mod.wasSubscriptionRefreshedRecently()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("janela de dedupe é de 30 segundos", () => {
    expect(mod.SUB_REFRESH_DEDUPE_MS).toBe(30_000);
  });
});
