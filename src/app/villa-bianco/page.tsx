export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canReadUnits, type InitialUnitsRow } from "@/lib/units-read-guard";
import VillaBiancoDashboard from "@/components/villa-bianco-dashboard";

export default async function VillaBiancoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
  let isAdmin = adminEmails.length === 0 || adminEmails.includes(user.email?.toLowerCase() || "");
  let isCoordinator = false;
  let profileRole: string | null = null;

  // Detectar role INDEPENDENTEMENTE do isAdmin por email
  // (evita que ADMIN_EMAILS vazio impeça detecção de coordenador)
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    profileRole = profile?.role ?? null;
    if (profile?.role === "admin_sistema") isAdmin = true;
    if (profile?.role === "coordenador") {
      isCoordinator = true;
      // Coordenadores têm acesso de escrita nos espelhos legados
      if (!isAdmin) isAdmin = true;
    }
  } catch {
    // Tabela profiles pode não existir
  }

  // Dados iniciais server-side (audit P1.4): mesma autorização da API GET
  // /api/villa-bianco-units (requireReadAccess) e a mesma query/ordenação.
  // Se negado ou em erro, initialUnits permanece null e o cliente segue o
  // fluxo original (fetch → API → mesmo resultado, inclusive fallback estático).
  let initialUnits: InitialUnitsRow[] | null = null;
  if (await canReadUnits(user, profileRole)) {
    const { data } = await supabase
      .from("villa_bianco_units")
      .select("*")
      .order("bloco", { ascending: true })
      .order("andar", { ascending: true })
      .order("unidade", { ascending: true });
    if (data) initialUnits = data;
  }

  return <VillaBiancoDashboard isAdmin={isAdmin} isCoordinator={isCoordinator} initialUnits={initialUnits} />;
}
