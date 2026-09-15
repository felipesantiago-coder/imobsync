/**
 * session-local-uid.ts (P3-A)
 *
 * Extrai uid + exp da sessão Supabase DIRETO dos cookies de sessão
 * (@supabase/ssr), sem nenhuma chamada de rede.
 *
 * Por quê: no render server, `auth.getUser()` custa 1 RTT transcontinental
 * (iad1 → sa-east-1). As queries seguintes (profiles, empreendimentos) só
 * dependem do `user.id` — que já está no cookie. Ler o uid localmente permite
 * disparar getUser (fonte de verdade de autenticação) e as queries EM
 * PARALELO, eliminando uma fase serial inteira.
 *
 * Segurança: o valor extraído NÃO é usado para autorizar nada. O getUser()
 * paralelo continua validando/revogando a sessão; se falhar, a página faz
 * redirect e os resultados paralelos são descartados.
 *
 * Formato do cookie (@supabase/ssr):
 *   `sb-<ref>-auth-token` = "base64-" + base64(JSON da sessão)
 *   Sessões grandes são particionadas: `sb-<ref>-auth-token.0`, `.1`, ...
 */
export interface LocalSessionInfo {
  uid: string;
  /** Epoch (segundos) do `exp` do access_token, quando extraível. */
  exp: number | null;
}

export function extractLocalSession(
  cookieEntries: ReadonlyArray<{ name: string; value: string }>,
  supabaseUrl: string
): LocalSessionInfo | null {
  const ref = supabaseUrl.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.(co|in)/i)?.[1];
  if (!ref) return null;

  const base = `sb-${ref}-auth-token`;
  let raw: string | null = cookieEntries.find((c) => c.name === base)?.value ?? null;

  if (raw === null) {
    // Cookie particionado: recolher chunks em ordem numérica (.0, .1, ...)
    const chunks = cookieEntries
      .filter((c) => c.name.startsWith(`${base}.`))
      .sort(
        (a, b) =>
          Number(a.name.slice(base.length + 1)) - Number(b.name.slice(base.length + 1))
      );
    if (chunks.length === 0) return null;
    raw = chunks.map((c) => c.value).join("");
  }

  try {
    const jsonText = raw.startsWith("base64-")
      ? Buffer.from(raw.slice(7), "base64").toString("utf8")
      : raw;
    const session = JSON.parse(jsonText) as {
      user?: { id?: string };
      access_token?: string;
    };

    let uid: string | null = session.user?.id ?? null;
    let exp: number | null = null;

    // Fallback/extração a partir das claims do access_token (JWT)
    const token = session.access_token;
    if (token) {
      const payloadB64 = token.split(".")[1];
      if (payloadB64) {
        try {
          const claims = JSON.parse(
            Buffer.from(payloadB64, "base64url").toString("utf8")
          ) as { sub?: string; exp?: number };
          if (!uid && claims.sub) uid = claims.sub;
          if (typeof claims.exp === "number") exp = claims.exp;
        } catch {
          // payload do JWT ilegível — mantém o que já temos
        }
      }
    }

    if (!uid) return null;
    return { uid, exp };
  } catch {
    return null;
  }
}
