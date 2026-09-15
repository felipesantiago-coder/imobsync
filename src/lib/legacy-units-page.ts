/**
 * legacy-units-page.ts (P3 — irmãs do /projetos)
 *
 * Carregador compartilhado dos dashboards legados (/espelho, /villa-bianco,
 * /moment, /vitta), replicando EXATAMENTE a lógica que estava duplicada nas
 * 4 páginas:
 *
 *   Caminho rápido (token fresco, P3-A + P3-C): 1 fase —
 *     getUser ∥ get_legacy_units_view(p_slug) ∥ profiles
 *     · getUser permanece a fonte de verdade de autenticação;
 *     · RPC decide can_read com a MESMA semântica de canReadUnits
 *       (admin_sistema/coordenador → true; demais → assinatura com lazy
 *       expiration) e já retorna as unidades ordenadas;
 *     · RPC ausente (migration pendente) → fallback reaproveitando o perfil
 *       já buscado: canReadUnits ∥ query de units (2 fases).
 *
 *   Caminho serial (token expirando/sem sessão local): fluxo de hoje —
 *     getUser (renova em memória) → profiles → canReadUnits ∥ units.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canReadUnits, type InitialUnitsRow } from "@/lib/units-read-guard";
import { extractLocalSession } from "@/lib/session-local-uid";

export interface LegacyUnitsPageConfig {
  /** Slug na whitelist da RPC (espelho | villa-bianco | moment | residencial-vitta). */
  slug: string;
  /** Tabela de unidades legada. */
  table: string;
  /** Colunas de ordenação (todas asc, na ordem das queries atuais). */
  order: string[];
  /** vitta: resultado vazio → initialUnits null (cliente usa fallback estático). */
  requireNonEmptyUnits?: boolean;
}

export interface LegacyUnitsPageResult {
  isAdmin: boolean;
  isCoordinator: boolean;
  initialUnits: InitialUnitsRow[] | null;
}

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

type RpcPayload = {
  role?: string | null;
  can_read?: boolean;
  units?: InitialUnitsRow[] | null;
};

/** ADMIN_EMAILS: split/trim/lowercase/filtro (parity com as páginas). */
export function parseAdminEmails(raw: string | undefined): string[] {
  return (raw || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

/**
 * Papéis da página — parity exata com o bloco duplicado nas 4 páginas:
 * ADMIN_EMAILS vazio = todos são admin por padrão (comportamento atual
 * preservado); profile admin_sistema → admin; coordenador → coordenador E
 * admin (acesso de escrita nos espelhos legados).
 */
export function computeLegacyPageRoles(
  userEmail: string | null | undefined,
  profileRole: string | null | undefined,
  adminEmails: string[]
): { isAdmin: boolean; isCoordinator: boolean } {
  let isAdmin =
    adminEmails.length === 0 ||
    adminEmails.includes((userEmail ?? "").toLowerCase());
  let isCoordinator = false;
  if (profileRole === "admin_sistema") isAdmin = true;
  if (profileRole === "coordenador") {
    isCoordinator = true;
    if (!isAdmin) isAdmin = true;
  }
  return { isAdmin, isCoordinator };
}

/**
 * Semântica de initialUnits — parity com as páginas:
 *   · espelho/villa/moment: canRead && data != null → data (array vazio passa);
 *   · vitta: adicionalmente data.length > 0 (vazio → null → fallback estático).
 */
export function applyInitialUnitsSemantics(
  canRead: boolean,
  units: InitialUnitsRow[] | null | undefined,
  requireNonEmpty: boolean
): InitialUnitsRow[] | null {
  if (!canRead || !units) return null;
  if (requireNonEmpty && units.length === 0) return null;
  return units;
}

function unitsQuery(supabase: ServerSupabase, config: LegacyUnitsPageConfig) {
  let q = supabase.from(config.table).select("*");
  for (const col of config.order) q = q.order(col, { ascending: true });
  return q;
}

export async function loadLegacyUnitsDashboard(
  config: LegacyUnitsPageConfig
): Promise<LegacyUnitsPageResult> {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS);

  // Sessão local (leitura de cookie, zero rede) — NÃO autoriza nada;
  // getUser paralelo continua sendo a fonte de verdade.
  const local = extractLocalSession(
    cookieStore.getAll(),
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  );
  const tokenFresh = !!local?.exp && local.exp * 1000 > Date.now() + 30_000;

  // ── Caminho rápido: 1 fase ────────────────────────────────────────────
  if (local?.uid && tokenFresh) {
    const [auth, rpc, profileRes] = await Promise.all([
      supabase.auth.getUser(),
      supabase.rpc("get_legacy_units_view", { p_slug: config.slug }),
      supabase.from("profiles").select("role").eq("id", local.uid).single(),
    ]);

    if (auth.error || !auth.data?.user) redirect("/");
    const user = auth.data.user;

    const rpcErr = (rpc.error ?? null) as { code?: string; message?: string } | null;
    const rpcMissing =
      !!rpcErr &&
      (rpcErr.code === "PGRST202" ||
        rpcErr.code === "404" ||
        /could not find the function/i.test(rpcErr.message ?? ""));

    if (!rpcErr && rpc.data !== null && rpc.data !== undefined) {
      const payload = rpc.data as RpcPayload | null;
      if (!payload) redirect("/"); // auth.uid() nulo no banco = sessão inválida
      const roles = computeLegacyPageRoles(user.email, payload.role ?? null, adminEmails);
      return {
        ...roles,
        initialUnits: applyInitialUnitsSemantics(
          !!payload.can_read,
          payload.units ?? null,
          !!config.requireNonEmptyUnits
        ),
      };
    }

    // RPC ausente (migration pendente) ou erro pontual → fallback:
    // perfil JÁ buscado em paralelo; fase 2 = canRead ∥ units (como hoje).
    const profileRole = profileRes.data?.role ?? null;
    const [canRead, unitsRes] = await Promise.all([
      canReadUnits(user, profileRole),
      unitsQuery(supabase, config),
    ]);
    const roles = computeLegacyPageRoles(user.email, profileRole, adminEmails);
    return {
      ...roles,
      initialUnits: applyInitialUnitsSemantics(
        canRead,
        (unitsRes.data ?? null) as InitialUnitsRow[] | null,
        !!config.requireNonEmptyUnits
      ),
    };
  }

  // ── Caminho serial (token expirando/sem sessão local): fluxo de hoje ──
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  let profileRole: string | null = null;
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    profileRole = profile?.role ?? null;
  } catch {
    // Tabela profiles pode não existir
  }

  const [canRead, unitsRes] = await Promise.all([
    canReadUnits(user, profileRole),
    unitsQuery(supabase, config),
  ]);

  const roles = computeLegacyPageRoles(user.email, profileRole, adminEmails);
  return {
    ...roles,
    initialUnits: applyInitialUnitsSemantics(
      canRead,
      (unitsRes.data ?? null) as InitialUnitsRow[] | null,
      !!config.requireNonEmptyUnits
    ),
  };
}
