export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canReadUnits, type InitialUnitsRow } from "@/lib/units-read-guard";
import AdminDashboardClient from "./AdminDashboardClient";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  // Verificar se é admin
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);

  // SEC-AUDIT FIX: Fail-closed — se ADMIN_EMAILS não estiver configurado,
  // negar acesso em vez de permitir para qualquer usuário autenticado.
  if (adminEmails.length === 0 || !adminEmails.includes(user.email?.toLowerCase() || "")) {
    redirect("/projetos");
  }

  // Role para os dados iniciais server-side (audit P1.4): a autorização é a
  // MESMA da API GET /api/units — ADMIN_EMAILS autoriza a PÁGINA, mas a leitura
  // de unidades segue o guard (admin_sistema/coordenador → ok; demais perfis
  // → requireReadAccess/assinatura). Se negado, initialUnits fica null e o
  // cliente segue o fluxo original (fetch → API → mesmo resultado).
  let profileRole: string | null = null;
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    profileRole = (profile as { role?: string } | null)?.role ?? null;
  } catch {
    // Tabela profiles pode não existir — segue como perfil comum (fail-closed)
  }

  let initialUnits: InitialUnitsRow[] | null = null;
  if (await canReadUnits(user, profileRole)) {
    const { data } = await supabase
      .from("units")
      .select("*")
      .order("andar", { ascending: true })
      .order("unidade", { ascending: true });
    if (data) initialUnits = data;
  }

  return <AdminDashboardClient initialUnits={initialUnits} />;
}
