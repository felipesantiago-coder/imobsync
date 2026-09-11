import { describe, it, expect } from "vitest";
// Importa o classificador puro do script de retenção (.mjs — allowJs + noImplicitAny off no tsconfig).
import { classifyDeployments, meaningfulAliases, POLICY } from "../scripts/vercel-retention.mjs";

type Over = {
  uid: string;
  state: string;
  target: "production" | "preview";
  ageDays: number;
  alias?: string[];
  automaticAliases?: string[];
};
type Decision = {
  id: string;
  action: "keep" | "delete";
  reason: string;
  aliases: string[];
  customAliases: string[];
};

function fixture(overs: Over[], now: number): Map<string, Decision> {
  const deps = overs.map((o) => ({
    uid: o.uid,
    url: `${o.uid}.vercel.app`,
    state: o.state,
    target: o.target,
    created: now - o.ageDays * 86_400_000,
    alias: o.alias ?? [],
    automaticAliases: o.automaticAliases ?? [],
    meta: {},
  }));
  const decisions = classifyDeployments(deps, { now }) as Decision[];
  return new Map(decisions.map((d) => [d.id, d]));
}

const NOW = 1_789_000_000_000;

describe("classificador da política de retenção (plano §3)", () => {
  it("nunca exclui produção com alias, mesmo antiga", () => {
    const m = fixture(
      [{ uid: "p", state: "READY", target: "production", ageDays: 120, alias: ["imobsync.vercel.app"] }],
      NOW,
    );
    expect(m.get("p")!.action).toBe("keep");
    expect(m.get("p")!.reason).toMatch(/alias/);
  });

  it("alias automático de git NÃO protege preview >7d (todo preview nasce com um)", () => {
    const auto = "imobsync-git-perf-opt-7dc39d-felipe-santiagos-projects-8ef42ff7.vercel.app";
    const m = fixture(
      [
        { uid: "auto-set", state: "READY", target: "preview", ageDays: 10, alias: [auto], automaticAliases: [auto] },
        { uid: "auto-regex", state: "READY", target: "preview", ageDays: 12, alias: ["imobsync-git-fix-abc-user.vercel.app"] },
        { uid: "custom", state: "READY", target: "preview", ageDays: 10, alias: ["staging.imobsync.com"] },
      ],
      NOW,
    );
    expect(m.get("auto-set")!.action).toBe("delete");
    expect(m.get("auto-regex")!.action).toBe("delete");
    expect(m.get("custom")!.action).toBe("keep");
    expect(m.get("custom")!.reason).toMatch(/alias/);
  });

  it("meaningfulAliases separa aliases reais dos automáticos", () => {
    const auto = "imobsync-git-main-abc123-user.vercel.app";
    expect(
      meaningfulAliases({
        alias: [auto, "staging.imobsync.com", "imobsync.vercel.app"],
        automaticAliases: [auto],
      }),
    ).toEqual(["staging.imobsync.com", "imobsync.vercel.app"]);
    expect(meaningfulAliases({ alias: [auto] })).toEqual([]);
    expect(meaningfulAliases({})).toEqual([]);
    expect(meaningfulAliases(null)).toEqual([]);
  });

  it("preserva as 3 últimas produções READY como janela de rollback", () => {
    const m = fixture(
      [
        { uid: "prod-1", state: "READY", target: "production", ageDays: 2 },
        { uid: "prod-2", state: "READY", target: "production", ageDays: 5 },
        { uid: "prod-3", state: "READY", target: "production", ageDays: 9 },
        { uid: "prod-4", state: "READY", target: "production", ageDays: 12 },
      ],
      NOW,
    );
    for (const id of ["prod-1", "prod-2", "prod-3"]) {
      expect(m.get(id)!.action).toBe("keep");
      expect(m.get(id)!.reason).toMatch(/rollback/);
    }
    // Dentro da retenção de 30d → keep por idade; >30d → delete.
    expect(m.get("prod-4")!.action).toBe("keep");
    expect(m.get("prod-4")!.reason).toMatch(/30d/);
  });

  it("produção READY além de 30 dias sem alias é elegível (fora da janela de rollback)", () => {
    const m = fixture(
      [
        { uid: "r1", state: "READY", target: "production", ageDays: 1 },
        { uid: "r2", state: "READY", target: "production", ageDays: 3 },
        { uid: "r3", state: "READY", target: "production", ageDays: 6 },
        { uid: "old", state: "READY", target: "production", ageDays: 45 },
      ],
      NOW,
    );
    expect(m.get("old")!.action).toBe("delete");
    expect(m.get("old")!.reason).toMatch(/30d/);
  });

  it("previews READY elegíveis apenas após 7 dias", () => {
    const m = fixture(
      [
        { uid: "prev-6", state: "READY", target: "preview", ageDays: 6.9 },
        { uid: "prev-8", state: "READY", target: "preview", ageDays: 8 },
      ],
      NOW,
    );
    expect(m.get("prev-6")!.action).toBe("keep");
    expect(m.get("prev-8")!.action).toBe("delete");
  });

  it("canceled/error elegíveis apenas após 2 dias", () => {
    const m = fixture(
      [
        { uid: "c1", state: "CANCELED", target: "preview", ageDays: 1 },
        { uid: "c5", state: "CANCELED", target: "preview", ageDays: 5 },
        { uid: "e10", state: "ERROR", target: "preview", ageDays: 10 },
      ],
      NOW,
    );
    expect(m.get("c1")!.action).toBe("keep");
    expect(m.get("c5")!.action).toBe("delete");
    expect(m.get("e10")!.action).toBe("delete");
  });

  it("nada com menos de 24h é elegível, e builds em andamento nunca", () => {
    const m = fixture(
      [
        { uid: "fresh", state: "READY", target: "preview", ageDays: 0.2 },
        { uid: "building", state: "BUILDING", target: "preview", ageDays: 90 },
        { uid: "queued", state: "QUEUED", target: "production", ageDays: 90 },
      ],
      NOW,
    );
    expect(m.get("fresh")!.action).toBe("keep");
    expect(m.get("fresh")!.reason).toMatch(/24h/);
    expect(m.get("building")!.action).toBe("keep");
    expect(m.get("building")!.reason).toMatch(/andamento/);
    expect(m.get("queued")!.action).toBe("keep");
  });

  it("a lista de exclusão nunca contém item com alias nem produção ativa", () => {
    const overs: Over[] = [
      { uid: "a", state: "READY", target: "production", ageDays: 60, alias: ["x.com"] },
      { uid: "b", state: "READY", target: "production", ageDays: 1 },
      { uid: "c", state: "READY", target: "production", ageDays: 50 },
      { uid: "d", state: "READY", target: "preview", ageDays: 20 },
      { uid: "e", state: "ERROR", target: "preview", ageDays: 30 },
    ];
    const m = fixture(overs, NOW);
    const deletes = [...m.values()].filter((d) => d.action === "delete");
    expect(deletes.length).toBeGreaterThan(0);
    for (const d of deletes) {
      expect(d.aliases.length).toBe(0);
    }
    expect(m.get("a")!.action).toBe("keep");
    expect(m.get("b")!.action).toBe("keep");
  });

  it("ordem de entrada não altera a janela de rollback (mais recentes primeiro)", () => {
    const overs: Over[] = [
      { uid: "prod-1", state: "READY", target: "production", ageDays: 2 },
      { uid: "prod-2", state: "READY", target: "production", ageDays: 5 },
      { uid: "prod-3", state: "READY", target: "production", ageDays: 9 },
      { uid: "prod-4", state: "READY", target: "production", ageDays: 40 },
      { uid: "prod-5", state: "READY", target: "production", ageDays: 80 },
    ];
    const shuffled = [overs[3], overs[0], overs[4], overs[2], overs[1]];
    const a = fixture(overs, NOW);
    const b = fixture(shuffled, NOW);
    const keepA = [...a.values()].filter((d) => d.reason.includes("rollback")).map((d) => d.id).sort();
    const keepB = [...b.values()].filter((d) => d.reason.includes("rollback")).map((d) => d.id).sort();
    expect(keepA).toEqual(["prod-1", "prod-2", "prod-3"]);
    expect(keepB).toEqual(["prod-1", "prod-2", "prod-3"]);
    expect(a.get("prod-4")!.action).toBe("delete");
    expect(a.get("prod-5")!.action).toBe("delete");
  });

  it("constantes do plano §3 não mudaram silenciosamente", () => {
    expect(POLICY.ROLLBACK_KEEP_PRODUCTION).toBe(3);
    expect(POLICY.PRODUCTION_MAX_AGE_DAYS).toBe(30);
    expect(POLICY.PREVIEW_MAX_AGE_DAYS).toBe(7);
    expect(POLICY.FAILED_MAX_AGE_DAYS).toBe(2);
    expect(POLICY.MIN_AGE_HOURS).toBe(24);
    expect(POLICY.EXECUTE_BATCH).toBe(10);
  });
});
