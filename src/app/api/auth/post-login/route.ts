import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/auth/post-login
 *
 * Consolidação do pós-login (auditoria login-latency): substitui a cadeia
 * serial client-side profiles → [mfa (totp+passkeys) ∥ subscription-refresh]
 * por UMA chamada que resolve tudo server-side em paralelo e grava o cookie
 * subscription_status — o cliente faz signIn → 1 POST → router.push.
 *
 * Paridade de comportamento com o fluxo anterior:
 *  - Derivação de status de assinatura IDÊNTICA ao /api/subscription-refresh
 *    (mesma query admin, mesmo realStatus, mesmo sync do profile quando
 *    inconsistente com 'none', mesmo cookie: maxAge 300/httpOnly/lax).
 *  - Admin: status tratado como 'active' sem sync de assinatura (early
 *    return do subscription-refresh).
 *  - MFA: mfa_enabled do perfil OU totp verificado OU passkey cadastrada
 *    (mesma regra que o handleLogin aplicava client-side).
 *  - Decisão de rota: src/lib/post-login.ts (pura; precedência preservada).
 *
 * Contrato de resposta (200):
 *   { authenticated: true, role, isAdmin, mfaEnabled,
 *     mustChangePassword, mustSetupMfa, subscriptionStatus }
 * Erros:
 *   401 { authenticated: false }  — sem sessão válida
 *   500 { error }                 — falha inesperada (cliente cai no fluxo legado)
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const admin = createAdminClient();

    // Perfil + MFA (totp/passkeys) + assinatura em PARALELO — 1 round trip
    // sequencial a mais que o getUser; o fluxo anterior fazia isso em 3+.
    const [profileRes, totpRes, passkeyRes, assinaturaRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("role, mfa_enabled, must_change_password, must_setup_mfa, subscription_status")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("user_totp")
        .select("id")
        .eq("user_id", user.id)
        .eq("verified", true)
        .maybeSingle(),
      supabase
        .from("user_passkeys")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id),
      admin
        .from("assinaturas")
        .select("id, status, data_fim")
        .eq("user_id", user.id)
        .in("status", ["active", "lifetime"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const profile = profileRes.data as Record<string, unknown> | null;
    const role = (profile?.role as string) ?? null;
    const isAdmin = role === "admin_sistema";

    // ── Status de assinatura (derivação = subscription-refresh) ──────────
    let realStatus: string;
    if (isAdmin) {
      realStatus = "active";
    } else {
      const assinatura = assinaturaRes.data as Record<string, unknown> | null;
      if (!assinatura) {
        realStatus = "none";
      } else if (assinatura.status === "lifetime") {
        realStatus = "lifetime";
      } else if (
        assinatura.data_fim &&
        new Date(assinatura.data_fim as string) <= new Date()
      ) {
        realStatus = "none";
      } else {
        realStatus = "active";
      }

      // Sincronizar perfil se inconsistente (paridade com subscription-refresh)
      if (
        profile &&
        profile.subscription_status !== realStatus &&
        realStatus === "none"
      ) {
        await admin
          .from("profiles")
          .update({ subscription_status: "none" })
          .eq("id", user.id);
      }
    }

    // ── MFA (mesma regra do fluxo legado client-side) ────────────────────
    const mfaEnabled =
      (profile?.mfa_enabled as boolean) ||
      !!totpRes.data ||
      (passkeyRes.count ?? 0) > 0;

    const response = NextResponse.json(
      {
        authenticated: true,
        role,
        isAdmin,
        mfaEnabled,
        mustChangePassword: !!profile?.must_change_password,
        mustSetupMfa: !!profile?.must_setup_mfa,
        subscriptionStatus: realStatus,
      },
      { headers: { "Cache-Control": "no-store" } }
    );

    // Mesmo cookie/TTL do subscription-refresh — o proxy usa como hint de 5 min.
    response.cookies.set("subscription_status", realStatus, {
      path: "/",
      maxAge: 300,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });

    return response;
  } catch (err) {
    console.error("[POST /api/auth/post-login] Erro:", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
