export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canReadUnits, type InitialUnitsRow } from "@/lib/units-read-guard";
import AdminVillaBiancoClient from "./AdminVillaBiancoClient";

export default async function AdminVillaBiancoPage() {
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

  if (adminEmails.length > 0 && !adminEmails.includes(user.email?.toLowerCase() || "")) {
    redirect("/projetos");
  }

  // Role para os dados iniciais server-side (audit P1.4): a autorização é a
  // MESMA da API GET /api/villa-bianco-units. Se negado, initialUnits fica
  // null e o cliente segue o fluxo original (fetch → API → mesmo resultado).
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
      .from("villa_bianco_units")
      .select("*")
      .order("bloco", { ascending: true })
      .order("andar", { ascending: true })
      .order("unidade", { ascending: true });
    if (data) initialUnits = data;
  }

  return <AdminVillaBiancoClient initialUnits={initialUnits} />;
}
