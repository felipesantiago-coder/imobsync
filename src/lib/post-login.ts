/**
 * post-login.ts — decisão de roteamento pós-login (função pura, testável).
 *
 * Contexto (auditoria login-latency): o handleLogin executava uma cadeia
 * serial de 3-4 RTTs client (profiles → [mfa ∥ subscription-refresh]) antes
 * de cada redirect. O caminho feliz agora concentra tudo em 1 POST
 * (/api/auth/post-login) que devolve o PostLoginInfo abaixo; a decisão de
 * rota ficou nesta função pura para ser testável sem rede.
 *
 * PRECEDÊNCIA — espelha exatamente o fluxo legado de src/app/page.tsx:
 *   1. must_change_password  → /change-password
 *   2. must_setup_mfa        → /mfa-onboarding
 *   3. assinatura pending (não-admin) → /aguardando-pagamento
 *   4. MFA ativo             → /mfa-verify?redirect=<final>
 *   5. destino final         → /admin-sistema (admin) | /projetos
 *
 * Notas de paridade com o comportamento anterior:
 *   - admin NUNCA cai no redirect de pending (o fluxo legado tratava admin
 *     como 'active' sem consultar assinatura).
 *   - status 'none'/'cancelled' NÃO redireciona aqui: o cliente segue para o
 *     destino final e o proxy (cookie subscription_status) assume o bloqueio,
 *     exatamente como antes.
 */

export interface PostLoginInfo {
  authenticated: true;
  /** role do perfil — null quando o perfil ainda não existe. */
  role: string | null;
  /** mfa_enabled do perfil OU totp verificado OU passkey cadastrada. */
  mfaEnabled: boolean;
  mustChangePassword: boolean;
  mustSetupMfa: boolean;
  /**
   * Status derivado do banco (mesma derivação do subscription-refresh):
   * 'active' | 'lifetime' | 'none' — ou valor do perfil em fallback.
   * 'pending' só chega aqui via fallback legado (perfil).
   */
  subscriptionStatus: string;
}

export type LoginRoute =
  | { kind: "change_password"; path: "/change-password" }
  | { kind: "setup_mfa"; path: "/mfa-onboarding" }
  | { kind: "pending"; path: "/aguardando-pagamento" }
  | { kind: "mfa_verify"; path: string }
  | { kind: "go"; path: string };

export function resolveLoginRoute(info: PostLoginInfo): LoginRoute {
  if (info.mustChangePassword) {
    return { kind: "change_password", path: "/change-password" };
  }
  if (info.mustSetupMfa) {
    return { kind: "setup_mfa", path: "/mfa-onboarding" };
  }

  const isAdmin = info.role === "admin_sistema";

  if (!isAdmin && info.subscriptionStatus === "pending") {
    return { kind: "pending", path: "/aguardando-pagamento" };
  }

  const finalRedirect = isAdmin ? "/admin-sistema" : "/projetos";

  if (info.mfaEnabled) {
    return {
      kind: "mfa_verify",
      path: `/mfa-verify?redirect=${encodeURIComponent(finalRedirect)}`,
    };
  }

  return { kind: "go", path: finalRedirect };
}
