import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/turnstile-verify
 *
 * Verifica um token do Cloudflare Turnstile server-side.
 * Endpoint interno — chamado pelo handleLogin antes de processar
 * a autenticação com o Supabase.
 *
 * Se NEXT_PUBLIC_TURNSTILE_SITE_KEY não estiver configurado (dev/local),
 * retorna sempre válido (bypass).
 */
export async function POST(request: NextRequest) {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  // Modo bypass: sem keys configuradas (dev/local)
  if (!secretKey || !siteKey || siteKey === "placeholder") {
    return NextResponse.json({ valid: true, bypassed: true });
  }

  try {
    const body = await request.json();
    const token: string | undefined = body?.token;

    if (!token || token === "bypass") {
      return NextResponse.json(
        { valid: false, error: "Token ausente." },
        { status: 400 }
      );
    }

    // Verificar com a API do Cloudflare
    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token);
    // Opcional: verificar o IP do cliente para maior segurança
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
    if (ip) formData.append("remoteip", ip);

    const cfRes = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      }
    );

    const data = await cfRes.json();

    if (data.success) {
      return NextResponse.json({ valid: true, bypassed: false });
    }

    console.warn("[Turnstile] Verificação falhou:", data["error-codes"]);
    return NextResponse.json(
      { valid: false, error: "Verificação de segurança falhou." },
      { status: 403 }
    );
  } catch (err) {
    console.error("[Turnstile] Erro ao verificar:", err);
    // Em caso de erro na verificação, bloquear (fail-closed)
    return NextResponse.json(
      { valid: false, error: "Erro na verificação de segurança." },
      { status: 503 }
    );
  }
}
