import { describe, expect, it } from "vitest";
import { extractLocalSession } from "@/lib/session-local-uid";

/**
 * Testes do leitor local de sessão (P3-A): uid + exp extraídos do cookie
 * @supabase/ssr sem rede. Cobre formato base64, cookie particionado (chunks),
 * fallback via claims do JWT (sub/exp) e degradação segura.
 */
const URL = "https://ghsdetqtwrnyxtitlesh.supabase.co";

function b64(json: unknown): string {
  return "base64-" + Buffer.from(JSON.stringify(json), "utf8").toString("base64");
}

const FUTURE_EXP = Math.floor(Date.now() / 1000) + 3600;

describe("extractLocalSession", () => {
  it("lê cookie único (base64) com user.id e exp do access_token", () => {
    const value = b64({
      access_token: `h.${Buffer.from(
        JSON.stringify({ sub: "uid-1", exp: FUTURE_EXP })
      )
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "")}.s`,
      user: { id: "uid-1" },
      refresh_token: "r",
    });
    const out = extractLocalSession(
      [{ name: "sb-ghsdetqtwrnyxtitlesh-auth-token", value }],
      URL
    );
    expect(out).toEqual({ uid: "uid-1", exp: FUTURE_EXP });
  });

  it("remonta cookie particionado (.0/.1/.2) em ordem numérica", () => {
    const full = b64({ user: { id: "uid-2" }, access_token: "h.p.s" });
    const a = full.slice(0, 50);
    const b = full.slice(50, 100);
    const c = full.slice(100);
    const base = "sb-ghsdetqtwrnyxtitlesh-auth-token";
    // fora de ordem de propósito: o sort deve normalizar
    const out = extractLocalSession(
      [
        { name: `${base}.2`, value: c },
        { name: `${base}.0`, value: a },
        { name: `${base}.1`, value: b },
      ],
      URL
    );
    expect(out?.uid).toBe("uid-2");
  });

  it("fallback: uid via claim sub quando user ausente", () => {
    const payload = Buffer.from(JSON.stringify({ sub: "uid-3", exp: FUTURE_EXP }))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const value = b64({ access_token: `h.${payload}.s` });
    const out = extractLocalSession(
      [{ name: "sb-ghsdetqtwrnyxtitlesh-auth-token", value }],
      URL
    );
    expect(out).toEqual({ uid: "uid-3", exp: FUTURE_EXP });
  });

  it("aceita JSON plano (sem prefixo base64-)", () => {
    const out = extractLocalSession(
      [
        {
          name: "sb-ghsdetqtwrnyxtitlesh-auth-token",
          value: JSON.stringify({ user: { id: "uid-4" } }),
        },
      ],
      URL
    );
    expect(out?.uid).toBe("uid-4");
  });

  it("retorna null para lixo/cookie ausente/URL não-Supabase", () => {
    expect(
      extractLocalSession(
        [{ name: "sb-ghsdetqtwrnyxtitlesh-auth-token", value: "%%%não-json%%%" }],
        URL
      )
    ).toBeNull();
    expect(extractLocalSession([], URL)).toBeNull();
    expect(
      extractLocalSession(
        [{ name: "sb-ghsdetqtwrnyxtitlesh-auth-token", value: b64({ user: { id: "x" } }) }],
        "https://example.com"
      )
    ).toBeNull();
  });

  it("retorna null quando nem user.id nem sub existem", () => {
    const out = extractLocalSession(
      [
        {
          name: "sb-ghsdetqtwrnyxtitlesh-auth-token",
          value: b64({ access_token: "h.s" }),
        },
      ],
      URL
    );
    expect(out).toBeNull();
  });
});
