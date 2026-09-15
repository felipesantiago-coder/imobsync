import { describe, expect, it } from "vitest";
import { resolveLoginRoute, type PostLoginInfo } from "@/lib/post-login";

/**
 * Testes da decisão de roteamento pós-login (função pura).
 * A precedência DEVE espelhar o fluxo legado do handleLogin:
 *   1. must_change_password → 2. must_setup_mfa → 3. pending (não-admin)
 *   → 4. mfa_verify → 5. destino final (admin → /admin-sistema, resto → /projetos)
 */
function info(overrides: Partial<PostLoginInfo> = {}): PostLoginInfo {
  return {
    authenticated: true,
    role: "coordenador",
    mfaEnabled: false,
    mustChangePassword: false,
    mustSetupMfa: false,
    subscriptionStatus: "active",
    ...overrides,
  };
}

describe("resolveLoginRoute", () => {
  it("coordenador ativo sem MFA vai direto para /projetos", () => {
    expect(resolveLoginRoute(info())).toEqual({ kind: "go", path: "/projetos" });
  });

  it("admin_sistema ativo sem MFA vai direto para /admin-sistema", () => {
    expect(resolveLoginRoute(info({ role: "admin_sistema" }))).toEqual({
      kind: "go",
      path: "/admin-sistema",
    });
  });

  it("must_change_password tem a maior precedência (mesmo admin com MFA e pending)", () => {
    const route = resolveLoginRoute(
      info({
        role: "admin_sistema",
        mfaEnabled: true,
        subscriptionStatus: "pending",
        mustChangePassword: true,
      })
    );
    expect(route).toEqual({ kind: "change_password", path: "/change-password" });
  });

  it("must_setup_mfa vem depois do change-password e antes do pending", () => {
    const route = resolveLoginRoute(
      info({ subscriptionStatus: "pending", mustSetupMfa: true })
    );
    expect(route).toEqual({ kind: "setup_mfa", path: "/mfa-onboarding" });
  });

  it("assinatura pending redireciona não-admin para /aguardando-pagamento", () => {
    expect(
      resolveLoginRoute(info({ subscriptionStatus: "pending" }))
    ).toEqual({ kind: "pending", path: "/aguardando-pagamento" });
  });

  it("admin NUNCA cai no redirect de pending (legado: admin tratado como active)", () => {
    expect(
      resolveLoginRoute(
        info({ role: "admin_sistema", subscriptionStatus: "pending" })
      )
    ).toEqual({ kind: "go", path: "/admin-sistema" });
  });

  it("MFA ativo manda para /mfa-verify com redirect=/projetos encodado", () => {
    const route = resolveLoginRoute(info({ mfaEnabled: true }));
    expect(route).toEqual({
      kind: "mfa_verify",
      path: `/mfa-verify?redirect=${encodeURIComponent("/projetos")}`,
    });
  });

  it("admin com MFA manda para /mfa-verify com redirect=/admin-sistema", () => {
    const route = resolveLoginRoute(
      info({ role: "admin_sistema", mfaEnabled: true })
    );
    expect(route).toEqual({
      kind: "mfa_verify",
      path: `/mfa-verify?redirect=${encodeURIComponent("/admin-sistema")}`,
    });
  });

  it("status 'none'/'cancelled'/'lifetime' NÃO redireciona — proxy assume o bloqueio (paridade)", () => {
    for (const subscriptionStatus of ["none", "cancelled", "lifetime"]) {
      expect(
        resolveLoginRoute(info({ subscriptionStatus }))
      ).toEqual({ kind: "go", path: "/projetos" });
    }
  });

  it("perfil ausente (role null) é tratado como não-admin sem MFA", () => {
    expect(
      resolveLoginRoute(info({ role: null }))
    ).toEqual({ kind: "go", path: "/projetos" });
  });

  it("perfil ausente com MFA server-side detectado (totp/passkeys) pede verificação", () => {
    const route = resolveLoginRoute(info({ role: null, mfaEnabled: true }));
    expect(route.kind).toBe("mfa_verify");
  });
});
