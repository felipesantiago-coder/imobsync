import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { coordenadorHasAccess } from "@/lib/coordinator-access";
import { canReadUnits, type InitialUnitsRow } from "@/lib/units-read-guard";
import DynamicDashboard from "@/components/dynamic-dashboard";

export const dynamic = "force-dynamic";

export default async function EmpreendimentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/");

  // Consultas independentes em paralelo (audit P1.5): empreendimento, perfil e
  // config do simulador dependem apenas de user.id/id da rota. Queries do
  // Supabase não lançam em erro — retornam { data, error } — e os tratamentos
  // fail-closed originais (perfil ausente → nega; sim_config ausente → slug)
  // são preservados pelos mesmos checks abaixo.
  const [empResult, profileResult, simConfigResult] = await Promise.all([
    supabase
      .from("empreendimentos")
      .select("id, nome, slug")
      .eq("id", id)
      .single(),
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase
      .from("simulador_configs")
      .select("id")
      .eq("empreendimento_id", id)
      .maybeSingle(),
  ]);

  const emp = empResult.data;
  if (!emp) redirect("/projetos");

  // Verificar role via perfil (fail-closed: sem perfil → sem escalonamento)
  const profileRole = (profileResult.data as { role?: string } | null)?.role ?? null;
  let isAdmin = profileRole === "admin_sistema";
  let isCoordinator = false;
  if (profileRole === "coordenador") {
    isCoordinator = true;
    const hasAccess = await coordenadorHasAccess(user.id, id);
    if (hasAccess) isAdmin = true;
  }

  // Verificar se existe config de simulador genérico para este empreendimento
  let simuladorUrl: string | undefined;
  if (simConfigResult.data) {
    // Usar simulador genérico parametrizado
    simuladorUrl = `/simulador-generico/${id}`;
  } else if (emp.slug) {
    // Fallback para simulador legado por slug
    simuladorUrl = `/simulador-${emp.slug}`;
  }

  // Dados iniciais server-side (audit P1.4): mesma autorização da API GET
  // /api/admin-sistema/empreendimentos/[id]/units (requireReadAccess) e a
  // mesma query/ordenação. Se negado ou em erro, initialUnits permanece null
  // e o cliente segue o fluxo original (fetch → API → mesmo resultado).
  let initialUnits: InitialUnitsRow[] | null = null;
  if (await canReadUnits(user, profileRole)) {
    const { data: units } = await supabase
      .from("projeto_units")
      .select("*")
      .eq("empreendimento_id", id)
      .order("ordem", { ascending: true })
      .order("andar", { ascending: true })
      .order("unidade", { ascending: true });
    if (units) initialUnits = units;
  }

  return (
    <DynamicDashboard
      key={id}
      empreendimentoId={id}
      empreendimentoNome={emp.nome}
      isAdmin={!!isAdmin}
      isCoordinator={isCoordinator}
      simuladorUrl={simuladorUrl}
      initialUnits={initialUnits}
    />
  );
}
