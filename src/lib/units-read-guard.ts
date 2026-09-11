/**
 * units-read-guard.ts
 *
 * Autorização de LEITURA de unidades para os dados iniciais server-side dos
 * dashboards (audit P1.4 — ImobSync_Auditoria_Performance_v1.0.md).
 *
 * Reproduz EXATAMENTE a decisão das APIs de unidades (GET), que usam
 * `requireReadAccess()` → `requireActiveSubscription()`:
 *   - admin_sistema e coordenador: sempre podem ler (definição de "admin"
 *     idêntica à do guard — manter em sincronia com subscription-guard.ts);
 *   - demais perfis: verificação completa de assinatura (inclui lazy
 *     expiration — mesma lógica, agora reaproveitando o usuário já validado
 *     nesta request, sem re-autenticação duplicada).
 *
 * `user` e `role` devem ser obtidos na MESMA request server-side
 * (supabase.auth.getUser() + profiles.role) — reuso de contexto por request
 * conforme auditoria (P3.1). Nenhum cookie ou dado do cliente é aceito como
 * prova de autorização; a RLS do Supabase permanece como barreira final em
 * todas as queries (o cliente server-side usa a sessão do próprio usuário).
 *
 * Retorno `false` = a API retornaria 401/403. Nesse caso as páginas NÃO devem
 * enviar `initialUnits`; o componente cliente segue o fluxo original
 * (fetch → API → mesmo resultado observado hoje, inclusive o estado vazio).
 */

import { hasValidSubscriptionForUser } from "@/lib/subscription-guard";

/** Linha bruta do PostgREST (select("*")) — serializável via RSC props. */
export type InitialUnitsRow = Record<string, unknown>;

/**
 * Decide se o usuário pode ler unidades, com a mesma semântica das APIs.
 * @param user Usuário já validado por auth.getUser() nesta request (ou null)
 * @param role Role já consultada em profiles nesta request (ou null/undefined)
 *
 * Contexto de auth por request (audit V07): para perfis comuns, NÃO repete
 * auth.getUser() + profiles — o user.id recebido já foi validado por cookie
 * nesta mesma request; a verificação de assinatura é feita AGORA (consulta
 * nova, com lazy expiration), sem TTL e sem estado global. Para
 * admin_sistema/coordenador o bypass permanece idêntico.
 */
export async function canReadUnits(
  user: { id: string } | null,
  role: string | null | undefined
): Promise<boolean> {
  if (!user) return false;

  // Mesma definição de "admin" de requireActiveSubscription() —
  // (userRole === 'admin_sistema' || userRole === 'coordenador') → válido
  // sem consulta de assinatura. Manter em sincronia.
  if (role === "admin_sistema" || role === "coordenador") return true;

  // Demais perfis: assinatura consultada agora para o usuário já autenticado
  // nesta request (mesma decisão de requireActiveSubscription, sem repetir
  // a autenticação que a página já fez).
  return hasValidSubscriptionForUser(user.id);
}
