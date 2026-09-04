import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorizeBatchWriter, parseBatchRequestBody, applyBatchStatusUpdate } from "@/lib/batch-units";

export const dynamic = "force-dynamic";

/**
 * PATCH em lote das unidades de um empreendimento (dashboard dinâmico).
 * 1 requisição no lugar de N PATCHes paralelos, com os mesmos guards do
 * PATCH individual (auth → papel → coordenadorHasAccess → empreendimento
 * existe → status válido) aplicados uma única vez, e feedback por unidade.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const auth = await authorizeBatchWriter(supabase, id);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const body = await request.json().catch(() => null);
    const parsed = parseBatchRequestBody(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.message }, { status: 400 });
    }

    // Validar que o empreendimento existe antes de alterar (paridade c/ PATCH individual)
    const { data: emp, error: empErr } = await supabase
      .from("empreendimentos")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (empErr || !emp) {
      return NextResponse.json({ error: "Empreendimento não encontrado" }, { status: 404 });
    }

    const result = await applyBatchStatusUpdate({
      supabase,
      table: "projeto_units",
      status: parsed.status,
      unidades: parsed.unidades,
      resolveColumns: "id, status, unidade, bloco",
      scopeEmpreendimentoId: id,
      empreendimentoRef: id,
      changedBy: auth.userId,
      changedByRole: auth.role || "unknown",
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 500 });
    }

    return NextResponse.json(result.result);
  } catch (err) {
    console.error("Erro no PATCH units batch:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
