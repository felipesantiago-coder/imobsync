export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCoordenadorEmpreendimentos } from "@/lib/coordinator-access";
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

export default async function ProjetosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/");

  // Ler subscription_status do cookie (definido no login)
  const cookieStore = await cookies();
  const subCookie = cookieStore.get("subscription_status")?.value;
  const hasActivePlan = subCookie === "active" || subCookie === "lifetime";

  // Perfil único (role + mfa_enabled) e empreendimentos em paralelo.
  // (audit P1.3: a primeira consulta de perfil era duplicada aqui — removida)
  // (MFA e assinatura já verificados no login — não precisam de query aqui)
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

  // MFA já verificado no login — usar apenas o flag do profile
  const hasVerifiedMfa = profileResult.data?.mfa_enabled ?? false;

  // Processar empreendimentos com contagem de unidades + última atualização
  let empreendimentos: EmpreendimentoData[] = [];
  const lastUpdatedMap: Record<string, string | null> = {};

  if (empsResult.data && empsResult.data.length > 0) {
    const emps = empsResult.data;
    const empIds = emps.map(e => e.id);
    const slugToId = new Map(emps.map(e => [e.slug, e.id]));

    // Separar empreendimentos legados dos genéricos
    const legacySlugs = emps
      .filter(e => LEGACY_TABLE_MAP[e.slug])
      .map(e => e.slug);
    const genericIds = emps
      .filter(e => !LEGACY_TABLE_MAP[e.slug])
      .map(e => e.id);

    // Iniciar coord check em paralelo com as queries de unidades
    const coordPromise = userRole === "coordenador"
      ? getCoordenadorEmpreendimentos(user.id)
      : Promise.resolve(null);

    // Buscar contagem de unidades + updated_at em LOTE (uma query)
    const unitsPromise = supabase
      .from("projeto_units")
      .select("empreendimento_id, updated_at")
      .in("empreendimento_id", empIds);

    // Buscar updated_at das tabelas legadas em paralelo
    const legacyQueries = legacySlugs.map(async (slug) => {
      const table = LEGACY_TABLE_MAP[slug];
      const { data } = await supabase
        .from(table)
        .select("updated_at");
      return { slug, rows: data as { updated_at: string }[] | null };
    });

    // Aguardar tudo em paralelo: unidades + legados + coord check
    const [unitsResult, legacyResults, allowedIds] = await Promise.all([
      unitsPromise,
      Promise.all(legacyQueries),
      coordPromise,
    ]);

    // Calcular contagem e MAX(updated_at) para projetos genéricos
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

    for (const id of genericIds) {
      lastUpdatedMap[id] = genericMaxMap.get(id) || null;
    }

    for (const { slug, rows } of legacyResults) {
      const empId = slugToId.get(slug);
      if (!empId) continue;
      if (rows && rows.length > 0) {
        const maxTs = rows.reduce((max, r) => {
          if (r.updated_at && r.updated_at > max) return r.updated_at;
          return max;
        }, "");
        lastUpdatedMap[empId] = maxTs || null;
      } else {
        lastUpdatedMap[empId] = null;
      }
    }

    // Construir lista com contagem
    const empsWithCount = emps.map(emp => ({
      ...emp,
      unit_count: countMap.get(emp.id) || 0,
    }));

    // Coordenador: filtrar apenas empreendimentos atribuídos
    if (allowedIds !== null) {
      const allowedSet = new Set(allowedIds);
      empreendimentos = empsWithCount.filter(emp => allowedSet.has(emp.id));
    } else {
      empreendimentos = empsWithCount;
    }
  }

  return (
    <ProjetosClient
      userRole={userRole}
      initialEmpreendimentos={empreendimentos}
      initialMfaEnabled={hasVerifiedMfa}
      lastUpdatedMap={lastUpdatedMap}
      hasActivePlan={hasActivePlan}
    />
  );
}
