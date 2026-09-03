import { type NextRequest, NextResponse } from "next/server";

// Valores permitidos para o cookie subscription_status.
// Este cookie é um cache de curta duração (5 min) — não é fonte de verdade.
// A fonte de verdade é o banco de dados, verificado por:
//   1. subscription-guard.ts nas APIs (a cada request)
//   2. /api/subscription-refresh (a cada 5 min via cliente)
//   3. /api/cron/expire-subscriptions (diário)
const ALLOWED_SUB_STATUS_VALUES = new Set(['active', 'cancelled', 'lifetime', 'none', 'pending']);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirecionar rota antiga de login para a nova página inicial
  if (pathname === "/admin/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Rotas públicas (nunca interceptar)
  const isPublicRoute =
    pathname === "/" ||
    pathname === "/change-password" ||
    pathname === "/mfa-onboarding" ||
    pathname === "/mfa-verify" ||
    pathname === "/mfa-setup" ||
    pathname === "/planos" ||
    pathname === "/aguardando-pagamento" ||
    pathname.startsWith("/simulador");

  const isApiRoute = pathname.startsWith("/api/");

  if (isPublicRoute || isApiRoute) {
    return NextResponse.next({ request });
  }

  // Rotas que exigem autenticacao
  const isProtectedRoute =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/admin-sistema") ||
    pathname.startsWith("/empreendimento") ||
    pathname === "/espelho" ||
    pathname === "/villa-bianco" ||
    pathname === "/moment" ||
    pathname === "/projetos" ||
    pathname === "/vitta" ||
    pathname === "/assinatura";

  if (!isProtectedRoute) {
    return NextResponse.next({ request });
  }

  try {
    const allCookies = request.cookies.getAll();

    // 1. Verificar autenticacao Supabase
    const hasSessionCookie = allCookies.some(
      (c) => c.name.includes("sb-") && c.name.includes("-auth-token")
    );

    if (!hasSessionCookie) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.searchParams.set("reason", "unauthenticated");
      return NextResponse.redirect(url);
    }

    // 2. Fluxo de primeiro acesso — verificar cookie first_login_step
    const firstLoginStep = allCookies.find((c) => c.name === "first_login_step");

    if (firstLoginStep) {
      const step = firstLoginStep.value;

      if (step === "change_password" && pathname !== "/change-password") {
        const url = request.nextUrl.clone();
        url.pathname = "/change-password";
        return NextResponse.redirect(url);
      }

      if (step === "setup_mfa" && pathname !== "/mfa-onboarding") {
        const url = request.nextUrl.clone();
        url.pathname = "/mfa-onboarding";
        return NextResponse.redirect(url);
      }
    }

    // 3. Verificar MFA
    const mfaPending = allCookies.some((c) => c.name === "mfa_pending");
    const mfaVerified = allCookies.some((c) => c.name === "mfa_verified");

    if (mfaPending && !mfaVerified) {
      const url = request.nextUrl.clone();
      url.pathname = "/mfa-verify";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }

    // 4. Verificar assinatura via cookie (HINT de cache curto — 5 min)
    const isAdminRoute = pathname.startsWith("/admin-sistema");
    const isAssinaturaRoute = pathname === "/assinatura";

    if (!isAdminRoute && !isAssinaturaRoute) {
      const subCookie = allCookies.find(
        (c) => c.name === "subscription_status"
      );

      if (subCookie && ALLOWED_SUB_STATUS_VALUES.has(subCookie.value)) {
        if (subCookie.value === "pending") {
          const url = request.nextUrl.clone();
          url.pathname = "/aguardando-pagamento";
          return NextResponse.redirect(url);
        }

        if (subCookie.value === "none" || subCookie.value === "cancelled") {
          const url = request.nextUrl.clone();
          url.pathname = "/assinatura";
          url.searchParams.set("reason", "no_subscription");
          return NextResponse.redirect(url);
        }
      }
    }
  } catch {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("reason", "error");
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}

// Next.js 16 convention: proxy.ts (middleware.ts is deprecated).
// Matcher restricted to protected + interception-needed routes (audit P3.2):
// public routes (/, /planos, /aguardando-pagamento, /change-password,
// /mfa-onboarding, /mfa-setup, /simulador*) and /api/* never invoke the proxy.
// Real authorization remains server-side (subscription-guard, page-level
// server checks, RLS) — cookie checks here are hints only.
export const config = {
  matcher: [
    "/admin/:path*",
    "/admin-sistema/:path*",
    "/empreendimento/:path*",
    "/espelho",
    "/villa-bianco",
    "/moment",
    "/projetos",
    "/vitta",
    "/assinatura",
  ],
};
