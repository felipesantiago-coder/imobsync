import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Endpoint de limpeza de analytics — chamado por cron-job.org.
 * Requer token secreto via query param ?token=SEU_TOKEN
 * para evitar acesso não autorizado (não usa sessão de usuário,
 * pois cron-job.org não tem como fazer login).
 */
export async function POST(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token");
  const expectedToken = process.env.CLEANUP_SECRET;

  if (!expectedToken || token !== expectedToken) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc("clean_old_analytics");
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      message: "Limpeza executada com sucesso",
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}
