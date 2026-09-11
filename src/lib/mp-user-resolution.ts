/**
 * mp-user-resolution.ts
 *
 * Resolução INEQUÍVOCA de usuário por e-mail para o webhook do Mercado Pago.
 *
 * Defeito corrigido (audit §9 / finding confirmado no repositório):
 * `auth.admin.listUsers({ filter })` do SDK @supabase/auth-js instalado NÃO
 * aplica `filter` em runtime (envia apenas page/per_page). O código antigo
 * usava `users[0]` de uma página de 1 — associando o pagamento ao PRIMEIRO
 * usuário arbitrário da tabela quando o vínculo por preapproval_id/
 * external_reference falhava.
 *
 * Regra agora contratada:
 *   - correspondência exata (case-insensitive) do e-mail;
 *   - exatamente 1 usuário → associa;
 *   - 0 usuários → não associa (pagamento não relacionado);
 *   - >1 usuários (ambiguidade) → NÃO associa e reporta — nunca escolher
 *     o primeiro arbitrariamente.
 *
 * A busca usa a tabela `profiles` (espelho 1:1 de auth.users, mantido pelo
 * trigger handle_new_user) porque o admin client consulta o PostgREST com
 * filtro exato — ao contrário do listUsers, que não filtra.
 */

export type EmailUserMatch = { id: string; email: string | null };

export type UserResolution =
  | { kind: "found"; userId: string }
  | { kind: "none" }
  | { kind: "ambiguous" };

export function resolveUniqueUserByEmail(
  matches: EmailUserMatch[],
  payerEmail: string
): UserResolution {
  const target = payerEmail.trim().toLowerCase();
  const ids = [
    ...new Set(
      matches
        .filter((m) => (m.email ?? "").trim().toLowerCase() === target)
        .map((m) => m.id)
    ),
  ];

  if (ids.length === 1) return { kind: "found", userId: ids[0] };
  if (ids.length === 0) return { kind: "none" };
  return { kind: "ambiguous" };
}

/**
 * Lista de variantes de e-mail para consulta exata (`.in`) no banco.
 * Evita `ilike` (que trata `_` como curinga — e-mails legítimos contêm `_`).
 */
export function emailVariantsForQuery(payerEmail: string): string[] {
  const raw = payerEmail.trim();
  const lower = raw.toLowerCase();
  return lower === raw ? [raw] : [raw, lower];
}
