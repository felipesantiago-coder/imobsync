import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorizeBatchWriter, parseBatchRequestBody, applyBatchStatusUpdate } from "@/lib/batch-units";

export const dynamic = "force-dynamic";

/**
 * PATCH em lote das unidades Villa Bianco (tabela `villa_bianco_units`).
 * 1 requisição no lugar de N PATCHes paralelos, com os mesmos guards do
 * PATCH individual aplicados uma única vez e feedback por unidade.
 * Corpo: { status, unidades: [{ bloco, unidade }] }
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();

    const auth = await authorizeBatchWriter(supabase);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const body = await request.json().catch(() => null);
    const parsed = parseBatchRequestBody(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.message }, { status: 400 });
    }

    const result = await applyBatchStatusUpdate({
      supabase,
      table: "villa_bianco_units",
      status: parsed.status,
      unidades: parsed.unidades,
      resolveColumns: "id, status, unidade, bloco",
      empreendimentoRef: "villa-bianco",
      changedBy: auth.userId,
      changedByRole: auth.role || "unknown",
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 500 });
    }

    return NextResponse.json(result.result);
  } catch (err) {
    console.error("Erro no PATCH /api/villa-bianco-units/batch:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
