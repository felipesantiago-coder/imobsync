export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCoordenadorEmpreendimentos } from "@/lib/coordinator-access";
import { extractLocalSession } from "@/lib/session-local-uid";
import ProjetosClient from "./ProjetosClient";

interface EmpreendimentoData {
  id: string;
  nome: string;
  slug: string;
  regiao: string;
  imagem_url: string | null;
  descricao: string;
  ativo: boolean;
  unit_count: number;
}

// Mapeamento slug → tabela de unidades (desenvolvimentos legados)
const LEGACY_TABLE_MAP: Record<string, string> = {
  "quattre-istambul": "units",
  "villa-bianco": "villa_bianco_units",
  moment: "moment_units",
  "residencial-vitta": "vitta_units",
};

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

type EmpRow = {
  id: string;
  nome: string;
  slug: string;
  regiao: string;
  imagem_url: string | null;
  descricao: string;
  ativo: boolean;
  created_at: string;
};

type RpcPayload = {
  role?: string;
  mfa_enabled?: boolean;
  empreendimentos?: Array<
    EmpRow & { unit_count?: number; last_updated?: string | null }
  > | null;
};

/**
 * Fase de contagens (compartilhada pelos caminhos rápido e de compatibilidade).
 * P3-B: os legados agora pedem apenas o top-1 por updated_at
 * (nullsFirst:false replica o reduce que ignorava nulls) em vez de
 * transferir a tabela inteira para calcular MAX no JS.
 */
async function buildLists(
  supabase: ServerSupabase,
  emps: EmpRow[],
  userRole: string,
  userId: string
): Promise<{ empreendimentos: EmpreendimentoData[]; lastUpdatedMap: Record<string, string | null> }> {
  const lastUpdatedMap: Record<string, string | null> = {};
  const empIds = emps.map((e) => e.id);
  const slugToId = new Map(emps.map((e) => [e.slug, e.id]));

  const legacySlugs = emps
    .filter((e) => LEGACY_TABLE_MAP[e.slug])
    .map((e) => e.slug);

  // Coord check em paralelo com as queries de unidades
  const coordPromise =
    userRole === "coordenador"
      ? getCoordenadorEmpreendimentos(userId)
      : Promise.resolve(null);

  // Contagem + MAX(updated_at) dos genéricos em lote (uma query)
  const unitsPromise = supabase
    .from("projeto_units")
    .select("empreendimento_id, updated_at")
    .in("empreendimento_id", empIds);

  // P3-B: 1 linha por tabela legada (era: full-scan sem filtro)
  const legacyQueries = legacySlugs.map(async (slug) => {
    const table = LEGACY_TABLE_MAP[slug];
    const { data } = await supabase
      .from(table)
      .select("updated_at")
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1);
    return { slug, rows: (data ?? null) as { updated_at: string | null }[] | null };
  });

  const [unitsResult, legacyResults, allowedIds] = await Promise.all([
    unitsPromise,
    Promise.all(legacyQueries),
    coordPromise,
  ]);

  const countMap = new Map<string, number>();
  const genericMaxMap = new Map<string, string>();

  if (unitsResult.data) {
    for (const r of unitsResult.data) {
      const id = r.empreendimento_id as string;
      countMap.set(id, (countMap.get(id) || 0) + 1);
      const ts = r.updated_at as string;
      if (ts) {
        const current = genericMaxMap.get(id);
        if (!current || ts > current) genericMaxMap.set(id, ts);
      }
    }
  }

  const genericIds = emps
    .filter((e) => !LEGACY_TABLE_MAP[e.slug])
    .map((e) => e.id);
  for (const id of genericIds) {
    lastUpdatedMap[id] = genericMaxMap.get(id) || null;
  }

  // Legados sobrescrevem o valor genérico (ordem preservada do código anterior)
  for (const { slug, rows } of legacyResults) {
    const empId = slugToId.get(slug);
    if (!empId) continue;
    const top = rows && rows.length > 0 ? rows[0]?.updated_at : null;
    lastUpdatedMap[empId] = top || null;
  }

  const empsWithCount: EmpreendimentoData[] = emps.map((emp) => ({
    id: emp.id,
    nome: emp.nome,
    slug: emp.slug,
    regiao: emp.regiao,
    imagem_url: emp.imagem_url,
    descricao: emp.descricao,
    ativo: emp.ativo,
    unit_count: countMap.get(emp.id) || 0,
  }));

  // Coordenador: filtrar apenas empreendimentos atribuídos (fail-closed)
  if (allowedIds !== null) {
    const allowedSet = new Set(allowedIds);
    return {
      empreendimentos: empsWithCount.filter((emp) => allowedSet.has(emp.id)),
      lastUpdatedMap,
    };
  }
  return { empreendimentos: empsWithCount, lastUpdatedMap };
}

export default async function ProjetosPage() {
  const supabase = await createClient();
  const cookieStore = await cookies();

  // Ler subscription_status do cookie (definido no login)
  const subCookie = cookieStore.get("subscription_status")?.value;
  const hasActivePlan = subCookie === "active" || subCookie === "lifetime";

  // Sessão local (leitura de cookie, zero rede): uid + exp do access_token.
  // NÃO autoriza nada — o getUser() paralelo continua sendo a fonte de verdade.
  const local = extractLocalSession(
    cookieStore.getAll(),
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  );
  // Token com margem de 30s: evita disparar queries com JWT a ponto de
  // expirar (nesse cenário o getUser renovaria em memória depois das
  // queries — comportamento do caminho serial abaixo).
  const tokenFresh = !!local?.exp && local.exp * 1000 > Date.now() + 30_000;

  // ── Caminho rápido (P3-A + P3-C): 1 fase — tudo em paralelo ──────────
  if (local?.uid && tokenFresh) {
    const [auth, rpc, profileResult, empsResult] = await Promise.all([
      supabase.auth.getUser(),
      supabase.rpc("get_projetos_view"),
      supabase
        .from("profiles")
        .select("role, mfa_enabled")
        .eq("id", local.uid)
        .maybeSingle(),
      supabase
        .from("empreendimentos")
        .select("id, nome, slug, regiao, imagem_url, descricao, ativo, created_at")
        .eq("ativo", true)
        .order("created_at", { ascending: true }),
    ]);

    if (auth.error || !auth.data?.user) redirect("/");

    const rpcErr = (rpc.error ?? null) as { code?: string; message?: string } | null;
    const rpcMissing =
      !!rpcErr &&
      (rpcErr.code === "PGRST202" ||
        rpcErr.code === "404" ||
        /could not find the function/i.test(rpcErr.message ?? ""));

    if (!rpcErr && rpc.data !== null && rpc.data !== undefined) {
      const payload = rpc.data as RpcPayload | null;
      if (!payload) redirect("/"); // auth.uid() nulo no banco = sessão inválida
      const rows = payload.empreendimentos ?? [];
      const empreendimentos: EmpreendimentoData[] = rows.map((e) => ({
        id: e.id,
        nome: e.nome,
        slug: e.slug,
        regiao: e.regiao,
        imagem_url: e.imagem_url ?? null,
        descricao: e.descricao,
        ativo: e.ativo,
        unit_count: e.unit_count ?? 0,
      }));
      const lastUpdatedMap: Record<string, string | null> = {};
      for (const e of rows) lastUpdatedMap[e.id] = e.last_updated ?? null;
      return (
        <ProjetosClient
          userRole={payload.role ?? "coordenador"}
          initialEmpreendimentos={empreendimentos}
          initialMfaEnabled={payload.mfa_enabled ?? false}
          lastUpdatedMap={lastUpdatedMap}
          hasActivePlan={hasActivePlan}
        />
      );
    }

    // RPC ausente (migration pendente) ou erro pontual → caminho de
    // compatibilidade, reaproveitando profile/emps JÁ buscados (P3-A:
    // sem a fase serial extra de getUser).
    const emps = (empsResult.data ?? []) as EmpRow[];
    const userRole =
      !profileResult.error && profileResult.data?.role
        ? profileResult.data.role
        : "coordenador";
    const initialMfaEnabled = profileResult.data?.mfa_enabled ?? false;

    if (emps.length === 0) {
      return (
        <ProjetosClient
          userRole={userRole}
          initialEmpreendimentos={[]}
          initialMfaEnabled={initialMfaEnabled}
          lastUpdatedMap={{}}
          hasActivePlan={hasActivePlan}
        />
      );
    }
    const lists = await buildLists(supabase, emps, userRole, local.uid);
    return (
      <ProjetosClient
        userRole={userRole}
        initialEmpreendimentos={lists.empreendimentos}
        initialMfaEnabled={initialMfaEnabled}
        lastUpdatedMap={lists.lastUpdatedMap}
        hasActivePlan={hasActivePlan}
      />
    );
  }

  // ── Caminho de compatibilidade (sem sessão local / token expirando) ──
  // Fluxo serial de hoje: getUser primeiro — pode renovar a sessão em
  // memória antes das queries seguintes.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // Perfil único (role + mfa_enabled) e empreendimentos em paralelo.
  // (audit P1.3: a primeira consulta de perfil era duplicada aqui — removida)
  const [profileResult, empsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("role, mfa_enabled")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("empreendimentos")
      .select("id, nome, slug, regiao, imagem_url, descricao, ativo, created_at")
      .eq("ativo", true)
      .order("created_at", { ascending: true }),
  ]);

  let userRole = "coordenador";
  if (!profileResult.error && profileResult.data?.role) {
    userRole = profileResult.data.role;
  }
  const hasVerifiedMfa = profileResult.data?.mfa_enabled ?? false;

  const emps = (empsResult.data ?? []) as EmpRow[];
  if (emps.length === 0) {
    return (
      <ProjetosClient
        userRole={userRole}
        initialEmpreendimentos={[]}
        initialMfaEnabled={hasVerifiedMfa}
        lastUpdatedMap={{}}
        hasActivePlan={hasActivePlan}
      />
    );
  }

  const lists = await buildLists(supabase, emps, userRole, user.id);
  return (
    <ProjetosClient
      userRole={userRole}
      initialEmpreendimentos={lists.empreendimentos}
      initialMfaEnabled={hasVerifiedMfa}
      lastUpdatedMap={lists.lastUpdatedMap}
      hasActivePlan={hasActivePlan}
    />
  );
}
