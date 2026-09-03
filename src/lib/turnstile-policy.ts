/**
 * Política de enforcement do Cloudflare Turnstile no login do ImobSync.
 *
 * Classifica os `error-codes` retornados pelo endpoint `siteverify` do
 * Cloudflare em dois veredictos (runbook: docs/diagnostics/turnstile-troubleshooting-runbook.md):
 *
 * - "hard": veredicto NEGATIVO do desafio com token estruturalmente válido
 *   (forjado, adulterado, já consumido ou expirado sem regeneração) → o
 *   cliente DEVE bloquear o login (fail-closed). O cliente regenera o token
 *   e tenta uma vez antes de desistir — usuário legítimo se recupera;
 *   replay/forgery não.
 *
 * - "soft": erro de INFRAESTRUTURA ou código desconhecido (Cloudflare fora
 *   do ar, secret inválido/misconfigurado, rede, formato inesperado) → o
 *   servidor responde fail-open (disponibilidade primeiro): login segue,
 *   incidente é logado para monitoria. Bloquear aqui trancaria usuários
 *   legítimos sem aumentar segurança real (um bot pode simplesmente pular
 *   esta chamada).
 *
 * Códigos de referência: developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

/** Códigos que indicam token rejeitado por conteúdo (veredicto do desafio). */
export const TURNSTILE_HARD_CODES = [
  "invalid-input-response",
  "timeout-or-duplicate",
] as const;

/** Veredicto consolidado da verificação. */
export type TurnstileVerdict = "pass" | "hard" | "soft";

/**
 * Classifica a lista de error-codes do siteverify.
 * Tolerante a payloads malformados (qualquer não-array → "soft").
 */
export function classifySiteverifyCodes(codes: unknown): TurnstileVerdict {
  if (!Array.isArray(codes)) return "soft";
  const hard = codes.some(
    (code) =>
      code === "invalid-input-response" || code === "timeout-or-duplicate"
  );
  return hard ? "hard" : "soft";
}
