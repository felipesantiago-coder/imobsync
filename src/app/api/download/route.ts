import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// S3-P2-004 FIX: Require authentication for download
export async function GET(request: NextRequest) {
  try {
    // 1. Autenticar o usuário via cookie de sessão
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "Storage não configurado" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verificar autenticação a partir do cookie
    const authHeader = request.headers.get('authorization');
    const cookieHeader = request.headers.get('cookie') || '';
    const authTokenMatch = cookieHeader.match(/sb-[^=]+-auth-token=([^;]+)/);

    if (!authTokenMatch) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    try {
      const accessToken = JSON.parse(decodeURIComponent(authTokenMatch[1]))?.access_token;
      if (!accessToken) throw new Error('no token');

      const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
      if (authError || !user) {
        return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
      }
    } catch {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    // 2. Gerar URL assinada para download direto do Supabase Storage
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from('downloads')
      .createSignedUrl('projeto.zip', 60); // URL válida por 60 segundos

    if (urlError || !signedUrlData) {
      console.error('[download] Erro ao gerar URL assinada:', urlError);
      return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });
    }

    // 3. Redirecionar para o download direto (não passa pelo serverless)
    return NextResponse.redirect(signedUrlData.signedUrl);
  } catch (err) {
    console.error('[download] Erro:', err);
    return NextResponse.json({ error: "Erro ao processar download" }, { status: 500 });
  }
}
