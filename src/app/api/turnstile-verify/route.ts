import { NextRequest, NextResponse } from "next/server";
import { classifySiteverifyCodes } from "@/lib/turnstile-policy";

/**
 * POST /api/turnstile-verify
 *
 * Verifica um token do Cloudflare Turnstile server-side via `siteverify`.
 * Endpoint interno — chamado pelo handleLogin antes de processar
 * a autenticação com o Supabase.
 *
 * ── Política de enforcement em camadas ─────────────────────────────────
 * (runbook: docs/diagnostics/turnstile-troubleshooting-runbook.md)
 *
 * 1. Sem keys configuradas (dev/local)          → bypass (valid: true).
 * 2. Veredicto negativo do desafio com token
 *    válido na estrutura ("invalid-input-response",
 *    "timeout-or-duplicate")                    → 403 blocked (fail-closed).
 *    O cliente regenera o token e tenta 1× antes de bloquear o usuário.
 * 3. Infraestrutura/desconhecido (Cloudflare
 *    fora do ar, secret inválido, rede, HTTP 5xx,
 *    código futuro)                             → 200 softFail (fail-open):
 *    login segue; incidente logado para monitoria.
 * 4. Requisição sem token                       → 200 softFail (o cliente
 *    legítimo skipa quando o widget não carrega, ex.: adblock).
 *
 * Contrato de resposta:
 *   { valid: true,  bypassed?: true }                          bypass dev
 *   { valid: true,  softFail: false }                          verificado OK
 *   { valid: true,  softFail: true,  reason, codes? }          fail-open
 *   { valid: false, blocked: true,   reason, codes }   (403)   fail-closed
 *
 * Nota de arquitetura: como o login Supabase é client-side, um bot
 * sofisticado pode pular esta chamada — a política eleva o nível contra
 * bots casuais (defense-in-depth; segurança primária = Supabase Auth + MFA).
 * Se NEXT_PUBLIC_TURNSTILE_SITE_KEY não estiver configurado (dev/local),
 * retorna sempre válido (bypass).
 */

/** Timeout do fetch ao siteverify — não seguramos o login mais que isso. */
const SITEVERIFY_TIMEOUT_MS = 5000;

export async function POST(request: NextRequest) {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  // Modo bypass: sem keys configuradas (dev/local)
  if (!secretKey || !siteKey || siteKey === "placeholder") {
    return NextResponse.json({ valid: true, bypassed: true });
  }

  let token: string | undefined;
  try {
    const body = await request.json();
    token = body?.token;
  } catch {
    token = undefined;
  }

  if (!token || token === "bypass") {
    // Cliente legítimo não envia requisição sem token (o hook skipa a
    // chamada quando o widget não carrega). Requisição sem token = nada a
    // verificar → fail-open + log para monitoria.
    console.warn("[Turnstile] verify sem token — fail-open (no_token)");
    return NextResponse.json({
      valid: true,
      softFail: true,
      reason: "no_token",
    });
  }

  // Verificar com a API do Cloudflare
  const formData = new URLSearchParams();
  formData.append("secret", secretKey);
  formData.append("response", token);
  // Opcional: verificar o IP do cliente para maior segurança
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  if (ip) formData.append("remoteip", ip);

  try {
    const cfRes = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
        signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
      }
    );

    if (!cfRes.ok) {
      // Cloudflare respondendo fora do esperado → infraestrutura, fail-open
      console.warn(
        `[Turnstile] siteverify HTTP ${cfRes.status} — fail-open (cf_http_error)`
      );
      return NextResponse.json({
        valid: true,
        softFail: true,
        reason: "cf_http_error",
        status: cfRes.status,
      });
    }

    const data = await cfRes.json();

    if (data.success === true) {
      return NextResponse.json({ valid: true, softFail: false });
    }

    const codes: string[] = Array.isArray(data["error-codes"])
      ? data["error-codes"]
      : [];

    if (classifySiteverifyCodes(codes) === "hard") {
      // Veredicto negativo com token estruturalmente válido → fail-closed.
      // O cliente tenta 1× com token regenerado (cobre expiração legítima);
      // replay/forgery falhará de novo e será bloqueado.
      console.error("[Turnstile] verificação recusada (hard):", codes);
      return NextResponse.json(
        {
          valid: false,
          blocked: true,
          reason: "challenge_failed",
          codes,
          error: "Verificação de segurança falhou.",
        },
        { status: 403 }
      );
    }

    // Infraestrutura (secret, internal-error) ou código desconhecido →
    // fail-open: disponibilidade primeiro; incidente fica nos logs.
    console.warn(
      "[Turnstile] siteverify indicou problema de infraestrutura — fail-open:",
      codes
    );
    return NextResponse.json({
      valid: true,
      softFail: true,
      reason: "infra",
      codes,
    });
  } catch (err) {
    // Rede/timeout ao siteverify → infraestrutura, fail-open
    console.warn(
      "[Turnstile] siteverify inacessível — fail-open (cf_unreachable):",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({
      valid: true,
      softFail: true,
      reason: "cf_unreachable",
    });
  }
}
