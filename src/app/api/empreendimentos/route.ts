import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveSubscription, subscriptionDeniedResponse } from "@/lib/subscription-guard";

export const dynamic = "force-dynamic";

// Endpoint otimizado: busca empreendimentos + contagem de unidades em 2 queries
export async function GET() {
  try {
    // Verificar assinatura ativa (inclui verificação de data_fim)
    const guard = await requireActiveSubscription();
    if (!guard.valid) {
      return subscriptionDeniedResponse(guard);
    }

    const supabase = await createClient();

    // Query 1: Buscar empreendimentos ativos
    const { data: emps, error: err } = await supabase
      .from("empreendimentos")
      .select("id, nome, slug, regiao, imagem_url, descricao, ativo, created_at")
      .eq("ativo", true)
      .order("created_at", { ascending: true });

    if (err || !emps || emps.length === 0) {
      return NextResponse.json({ empreendimentos: [], total: 0 });
    }

    // Query 2: Buscar contagem de unidades em LOTE
    const empIds = emps.map(e => e.id);
    const { data: counts } = await supabase
      .from("projeto_units")
      .select("empreendimento_id")
      .in("empreendimento_id", empIds);

    const countMap = new Map<string, number>();
    if (counts) {
      for (const c of counts) {
        const id = c.empreendimento_id as string;
        countMap.set(id, (countMap.get(id) || 0) + 1);
      }
    }

    const enriched = emps.map(emp => ({
      ...emp,
      unit_count: countMap.get(emp.id) || 0,
    }));

    return NextResponse.json({ empreendimentos: enriched, total: enriched.length });
  } catch (err) {
    console.error('[GET /api/empreendimentos] Erro:', err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
