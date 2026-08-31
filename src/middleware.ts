import { type NextRequest, NextResponse } from "next/server";

// Valores permitidos para o cookie subscription_status.
// Este cookie é um cache de curta duração (5 min) — não é fonte de verdade.
// A fonte de verdade é o banco de dados, verificado por:
//   1. subscription-guard.ts nas APIs (a cada request)
//   2. /api/subscription-refresh (a cada 5 min via cliente)
//   3. /api/cron/expire-subscriptions (diário)
const ALLOWED_SUB_STATUS_VALUES = new Set(['active', 'cancelled', 'lifetime', 'none', 'pending']);

// ── Helpers ──

const NONCE_SIZE = 16; // 128 bits

function generateNonce(): string {
  // Web Crypto API — compatível com Edge Runtime (Vercel)
  const buf = new Uint8Array(NONCE_SIZE);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function cspWithValue(nonce: string): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' https://cdn.jsdelivr.net https://unpkg.com https://challenges.cloudflare.com`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' https://fonts.gstatic.com`,
    `img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in https://*.mercadopago.com https://images.unsplash.com`,
    `connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co wss://*.supabase.in https://*.mercadopago.com https://api.mercadopago.com https://challenges.cloudflare.com`,
    `frame-src https://*.mercadopago.com https://challenges.cloudflare.com`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self' https://*.mercadopago.com`,
  ].join('; ');
}

const STATIC_SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

/**
 * Cria um NextResponse.next() com headers de segurança.
 * O nonce é passado no CSP tanto como request header (para Next.js
 * extrair e injetar nos scripts inline) quanto como response header
 * (para o browser validar).
 */
function nextWithSecurity(
  request: NextRequest,
  nonce: string,
  includeCsp: boolean
): NextResponse {
  const requestHeaders = new Headers(request.headers);
  if (includeCsp) {
    // Next.js lê headers['content-security-policy'] do request para extrair
    // o nonce e injetar nos scripts inline de hidratação.
    const csp = cspWithValue(nonce);
    requestHeaders.set('content-security-policy', csp);
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  if (includeCsp) {
    response.headers.set('Content-Security-Policy', cspWithValue(nonce));
  }
  for (const h of STATIC_SECURITY_HEADERS) {
    response.headers.set(h.key, h.value);
  }
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith('/api/');
  const nonce = generateNonce();

  // Redirecionar rota antiga de login para a nova página inicial
  if (pathname === '/admin/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // ── Rotas públicas (sem lógica de auth) ──
  const isSimulador = pathname.startsWith('/simulador');
  const isPublicRoute =
    pathname === '/' ||
    pathname === '/change-password' ||
    pathname === '/mfa-onboarding' ||
    pathname === '/mfa-verify' ||
    pathname === '/mfa-setup' ||
    pathname === '/planos' ||
    pathname === '/aguardando-pagamento' ||
    isSimulador;

  if (isPublicRoute) {
    return nextWithSecurity(request, nonce, !isApiRoute);
  }

  if (isApiRoute) {
    const response = NextResponse.next();
    for (const h of STATIC_SECURITY_HEADERS) {
      response.headers.set(h.key, h.value);
    }
    return response;
  }

  // Rotas que exigem autenticacao
  const isProtectedRoute =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/admin-sistema') ||
    pathname.startsWith('/empreendimento') ||
    pathname === '/espelho' ||
    pathname === '/villa-bianco' ||
    pathname === '/moment' ||
    pathname === '/projetos' ||
    pathname === '/vitta' ||
    pathname === '/assinatura';

  if (!isProtectedRoute) {
    // Outras páginas (ex: /planos-auth, /simulador-generico)
    return nextWithSecurity(request, nonce, true);
  }

  // ── Lógica de autenticação para rotas protegidas ──
  try {
    const allCookies = request.cookies.getAll();

    // 1. Verificar autenticacao Supabase
    const hasSessionCookie = allCookies.some(
      (c) => c.name.includes('sb-') && c.name.includes('-auth-token')
    );

    if (!hasSessionCookie) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.searchParams.set('reason', 'unauthenticated');
      return NextResponse.redirect(url);
    }

    // 2. Fluxo de primeiro acesso — verificar cookie first_login_step
    const firstLoginStep = allCookies.find((c) => c.name === 'first_login_step');

    if (firstLoginStep) {
      const step = firstLoginStep.value;

      if (step === 'change_password' && pathname !== '/change-password') {
        const url = request.nextUrl.clone();
        url.pathname = '/change-password';
        return NextResponse.redirect(url);
      }

      if (step === 'setup_mfa' && pathname !== '/mfa-onboarding') {
        const url = request.nextUrl.clone();
        url.pathname = '/mfa-onboarding';
        return NextResponse.redirect(url);
      }
    }

    // 3. Verificar MFA
    const mfaPending = allCookies.some((c) => c.name === 'mfa_pending');
    const mfaVerified = allCookies.some((c) => c.name === 'mfa_verified');

    if (mfaPending && !mfaVerified) {
      const url = request.nextUrl.clone();
      url.pathname = '/mfa-verify';
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }

    // 4. Verificar assinatura via cookie (HINT de cache curto — 5 min)
    const isAdminRoute = pathname.startsWith('/admin-sistema');
    const isAssinaturaRoute = pathname === '/assinatura';

    if (!isAdminRoute && !isAssinaturaRoute) {
      const subCookie = allCookies.find(
        (c) => c.name === 'subscription_status'
      );

      if (subCookie && ALLOWED_SUB_STATUS_VALUES.has(subCookie.value)) {
        if (subCookie.value === 'pending') {
          const url = request.nextUrl.clone();
          url.pathname = '/aguardando-pagamento';
          return NextResponse.redirect(url);
        }

        if (subCookie.value === 'none' || subCookie.value === 'cancelled') {
          const url = request.nextUrl.clone();
          url.pathname = '/assinatura';
          url.searchParams.set('reason', 'no_subscription');
          return NextResponse.redirect(url);
        }
      }
    }
  } catch {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.searchParams.set('reason', 'error');
    return NextResponse.redirect(url);
  }

  // Rotas protegidas que passaram em tudo — CSP + headers
  return nextWithSecurity(request, nonce, true);
}

export const config = {
  matcher: [
    // Todas as rotas de página e API (exceto assets estáticos)
    '/((?!_next/static|_next/image|favicon\.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
