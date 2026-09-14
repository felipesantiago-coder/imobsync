import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    // SEC-AUDIT Issue 5c: CSP melhorado
    // NOTA: 'unsafe-inline' em script-src é necessário para hidratação do Next.js
    // em Vercel (Edge Runtime não propaga headers de nonce para o render).
    // 'unsafe-eval' foi removido — esta é a principal melhoria de segurança.
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in https://*.mercadopago.com",
      "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co wss://*.supabase.in https://*.mercadopago.com https://api.mercadopago.com https://challenges.cloudflare.com",
      "frame-src https://*.mercadopago.com https://challenges.cloudflare.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://*.mercadopago.com",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Standalone apenas para SELF-HOSTING (npm run build:standalone define
  // NEXT_OUTPUT=standalone). Na Vercel, o adaptador nativo usa o output
  // padrão do Next — produzir standalone ali não serve ao runtime e inflaria
  // o armazenamento de deployment (~65 MB por deploy).
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  // Quality gates restored in perf/optimization-program (audit P0.1):
  // tsc --noEmit and next build both run with full type checking.
  // reactStrictMode stays disabled until effects/listeners are validated
  // idempotent in staging (see audit Phase 0.2 — no staging available yet).
  reactStrictMode: false,
};

export default nextConfig;
