import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveSubscription } from "@/lib/subscription-guard";

export const dynamic = "force-dynamic";

/**
 * GET — Retorna config do simulador + dados do empreendimento.
 * Usado pelo simulador genérico (cliente).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ empreendimentoId: string }> }
) {
  try {
    const { empreendimentoId } = await params;
    if (!empreendimentoId) {
      return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
    }

    // Verificar assinatura ativa
    const guard = await requireActiveSubscription();
    if (!guard.valid) {
      return NextResponse.json(
        { error: guard.reason === 'unauthenticated' ? 'Não autenticado' : 'Sem acesso' },
        { status: guard.reason === 'unauthenticated' ? 401 : 403 }
      );
    }

    const supabase = await createClient();

    // Buscar config do simulador
    const { data: config, error: configErr } = await supabase
      .from("simulador_configs")
      .select("*")
      .eq("empreendimento_id", empreendimentoId)
      .maybeSingle();

    if (configErr) {
      console.error("[GET simulador-config] Erro:", configErr.message);
      return NextResponse.json({ error: "Erro ao buscar configuração" }, { status: 500 });
    }

    if (!config) {
      return NextResponse.json({ error: "Simulador não configurado" }, { status: 404 });
    }

    // Buscar dados do empreendimento
    const { data: emp, error: empErr } = await supabase
      .from("empreendimentos")
      .select("id, nome, slug")
      .eq("id", empreendimentoId)
      .single();

    if (empErr || !emp) {
      return NextResponse.json({ error: "Empreendimento não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ config, empreendimento: emp });
  } catch (err) {
    console.error("[GET simulador-config/:id] Erro:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
