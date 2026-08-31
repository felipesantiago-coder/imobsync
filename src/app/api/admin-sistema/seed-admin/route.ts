import { NextRequest, NextResponse } from "next/server";
import { requireAdminSistema } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL;

if (!ADMIN_EMAIL) {
  console.warn('[seed-admin] SEED_ADMIN_EMAIL nao definido — endpoint desabilitado.');
}
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "";

export async function POST(_request: NextRequest) {
  // Apenas admin_sistema pode executar o seed
  const isAllowed = await requireAdminSistema();
  if (!isAllowed) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    return NextResponse.json(
      { error: "Configure SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD no ambiente." },
      { status: 500 }
    );
  }

  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createAdminClient();

    // Verificar se admin já existe
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("email", ADMIN_EMAIL)
      .single();

    if (existingProfile) {
      if (existingProfile.role !== "admin_sistema") {
        await supabase
          .from("profiles")
          .update({ role: "admin_sistema" })
          .eq("id", existingProfile.id);
        return NextResponse.json({ message: "Perfil atualizado para admin_sistema" });
      }
      return NextResponse.json({ message: "Administrador do sistema já existe" });
    }

    // Criar usuário via signUp com service_role
    const { data, error } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: "Administrador do Sistema" },
    });

    if (error) {
      if (error.message.includes("already registered") || error.message.includes("already been registered")) {
        return NextResponse.json({
          message: "Usuário já existe no auth. Atualize o perfil manualmente via SQL.",
        });
      }
      console.error("Erro ao criar admin:", error.message);
      return NextResponse.json({ error: "Erro ao criar administrador" }, { status: 500 });
    }

    if (data.user) {
      await supabase
        .from("profiles")
        .update({ role: "admin_sistema" })
        .eq("id", data.user.id);
    }

    // NUNCA retornar a senha no response
    return NextResponse.json({
      message: "Administrador do sistema criado com sucesso",
      email: ADMIN_EMAIL,
    });
  } catch (err) {
    console.error("Erro no seed admin:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}