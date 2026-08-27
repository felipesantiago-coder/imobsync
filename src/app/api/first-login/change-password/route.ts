import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validatePassword } from "@/lib/password-validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // Ler o body para obter a nova senha
    const body = await request.json();
    const { newPassword } = body as { newPassword: string };

    if (!newPassword) {
      return NextResponse.json({ error: "Senha é obrigatória" }, { status: 400 });
    }

    // Validar critérios de senha
    const validation = validatePassword(newPassword);
    if (!validation.valid) {
      const unmet = validation.rules.filter((r) => !r.met).map((r) => r.label);
      return NextResponse.json(
        { error: "Senha não atende aos requisitos", unmetRules: unmet },
        { status: 400 }
      );
    }

    // Atualizar senha do usuário logado
    const supabase = await createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      console.error("Erro ao atualizar senha:", updateError.message);
      return NextResponse.json(
        { error: "Erro ao atualizar senha. Tente novamente." },
        { status: 500 }
      );
    }

    // Limpar flag must_change_password e ativar must_setup_mfa no perfil
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      // Usar API direta para evitar problemas com RLS
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          must_change_password: false,
          must_setup_mfa: true,
        })
        .eq("id", user.id);

      if (profileError) {
        console.error(
          "Não conseguiu atualizar flags do perfil:",
          profileError.message
        );
      }
    }

    const response = NextResponse.json({
      success: true,
      message: "Senha atualizada com sucesso",
    });

    response.cookies.set('first_login_step', 'setup_mfa', {
      path: '/',
      maxAge: 3600,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    return response;
  } catch (err) {
    console.error("Erro no change-password:", err);
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
