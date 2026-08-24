import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { coordenadorHasAccess } from "@/lib/coordinator-access";
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

  // Buscar detalhes do empreendimento
  const { data: emp } = await supabase
    .from("empreendimentos")
    .select("*")
    .eq("id", id)
    .single();

  if (!emp) redirect("/projetos");

  // Verificar role (resiliente: se tabela não existir, verifica apenas pelo email)
  let isAdmin = user.email?.toLowerCase() === "prosperosdirecional@gmail.com";
  let isCoordinator = false;
  if (!isAdmin) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (profile?.role === "admin_sistema") isAdmin = true;
      if (profile?.role === "coordenador") {
        isCoordinator = true;
        const hasAccess = await coordenadorHasAccess(user.id, id);
        if (hasAccess) isAdmin = true;
      }
    } catch {
      // Tabela profiles pode não existir — isAdmin já foi definido pelo email check
    }
  }

  // Verificar se existe config de simulador genérico para este empreendimento
  let simuladorUrl: string | undefined;
  try {
    const { data: simConfig } = await supabase
      .from("simulador_configs")
      .select("id")
      .eq("empreendimento_id", id)
      .maybeSingle();
    if (simConfig) {
      // Usar simulador genérico parametrizado
      simuladorUrl = `/simulador-generico/${id}`;
    } else if (emp.slug) {
      // Fallback para simulador legado por slug
      simuladorUrl = `/simulador-${emp.slug}`;
    }
  } catch {
    // Tabela simulador_configs pode não existir ainda — fallback para slug
    simuladorUrl = emp.slug ? `/simulador-${emp.slug}` : undefined;
  }

  return (
    <DynamicDashboard
      empreendimentoId={id}
      empreendimentoNome={emp.nome}
      isAdmin={!!isAdmin}
      isCoordinator={isCoordinator}
      simuladorUrl={simuladorUrl}
    />
  );
}
