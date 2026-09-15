import { describe, expect, it } from "vitest";
import {
  applyInitialUnitsSemantics,
  computeLegacyPageRoles,
  parseAdminEmails,
} from "@/lib/legacy-units-page";

/**
 * Testes das funções puras extraídas das 4 páginas irmãs (/espelho,
 * /villa-bianco, /moment, /vitta). A semântica DEVE espelhar o código
 * anterior à refactor — qualquer divergência é regressão visível.
 */
describe("parseAdminEmails", () => {
  it("separa, normaliza e filtra vazios", () => {
    expect(parseAdminEmails(" A@X.com , b@Y.com,, ")).toEqual(["a@x.com", "b@y.com"]);
  });
  it("env ausente/vazio → lista vazia (todos são admin por padrão)", () => {
    expect(parseAdminEmails(undefined)).toEqual([]);
    expect(parseAdminEmails("")).toEqual([]);
  });
});

describe("computeLegacyPageRoles", () => {
  const admins = ["dono@imobsync.site"];

  it("ADMIN_EMAILS vazio → todos admin por padrão (parity)", () => {
    expect(computeLegacyPageRoles("qualquer@x.com", null, [])).toEqual({
      isAdmin: true,
      isCoordinator: false,
    });
  });

  it("email na lista → admin; fora da lista e sem profile → não admin", () => {
    expect(computeLegacyPageRoles("dono@imobsync.site", null, admins).isAdmin).toBe(true);
    expect(computeLegacyPageRoles("comum@x.com", null, admins)).toEqual({
      isAdmin: false,
      isCoordinator: false,
    });
    expect(computeLegacyPageRoles(undefined, null, admins).isAdmin).toBe(false);
  });

  it("profile admin_sistema → admin independente do email", () => {
    expect(computeLegacyPageRoles("comum@x.com", "admin_sistema", admins)).toEqual({
      isAdmin: true,
      isCoordinator: false,
    });
  });

  it("profile coordenador → coordenador E admin (escrita nos legados)", () => {
    expect(computeLegacyPageRoles("comum@x.com", "coordenador", admins)).toEqual({
      isAdmin: true,
      isCoordinator: true,
    });
  });
});

describe("applyInitialUnitsSemantics", () => {
  const rows = [{ id: 1 }, { id: 2 }];

  it("sem acesso ou sem dados → null (cliente faz fetch via API)", () => {
    expect(applyInitialUnitsSemantics(false, rows, false)).toBeNull();
    expect(applyInitialUnitsSemantics(true, null, false)).toBeNull();
    expect(applyInitialUnitsSemantics(true, undefined, false)).toBeNull();
  });

  it("espelho/villa/moment: array vazio passa (parity com data truthy)", () => {
    expect(applyInitialUnitsSemantics(true, [], false)).toEqual([]);
  });

  it("vitta (requireNonEmpty): vazio → null (fallback estático do cliente)", () => {
    expect(applyInitialUnitsSemantics(true, [], true)).toBeNull();
    expect(applyInitialUnitsSemantics(true, rows, true)).toEqual(rows);
  });
});
