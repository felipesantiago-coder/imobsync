import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireReadAccess, requireCoordinatorOrAdminWriteAccess } from "@/lib/api-auth";
import { trackUnitStatusChange } from "@/lib/analytics";

export async function GET() {
  try {
    const denied = await requireReadAccess();
    if (denied) return denied;

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("villa_bianco_units")
      .select("*")
      .order("bloco", { ascending: true })
      .order("andar", { ascending: true })
      .order("unidade", { ascending: true });

    if (error) {
      console.error("Erro ao buscar unidades Villa Bianco:", error.message);
      return NextResponse.json({ error: "Erro ao buscar unidades" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch {
    const { villaBiancoUnits } = await import("@/lib/villa-bianco-data");
    return NextResponse.json(villaBiancoUnits);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const denied = await requireCoordinatorOrAdminWriteAccess();
    if (denied) return denied;

    const supabase = await createClient();
    const body = await request.json();
    const { bloco, unidade, status } = body;

    if (!bloco || !unidade || !status) {
      return NextResponse.json({ error: "Campos 'bloco', 'unidade' e 'status' são obrigatórios" }, { status: 400 });
    }

    const validStatuses = ["disponivel", "reservado", "vendido"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: `Status inválido. Valores: ${validStatuses.join(", ")}` }, { status: 400 });
    }

    // Fetch old unit data before update
    const { data: oldUnit } = await supabase
      .from("villa_bianco_units")
      .select("id, status")
      .eq("bloco", bloco)
      .eq("unidade", unidade)
      .single();

    const { data, error } = await supabase
      .from("villa_bianco_units")
      .update({ status })
      .eq("bloco", bloco)
      .eq("unidade", unidade)
      .select()
      .single();

    if (error) {
      console.error("Erro ao atualizar:", error.message);
      return NextResponse.json({ error: "Erro ao atualizar unidade" }, { status: 500 });
    }

    // Track status change (fire-and-forget)
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", authUser?.id).maybeSingle();
      if (authUser) {
        trackUnitStatusChange({
          unitId: data.id,
          empreendimentoId: "villa-bianco",
          unidade: String(unidade),
          bloco: String(bloco),
          statusAnterior: oldUnit?.status ?? null,
          statusNovo: status,
          changedBy: authUser.id,
          changedByRole: (profile as Record<string, unknown>)?.role as string || "admin",
        });
      }
    } catch { /* fire-and-forget */ }

    return NextResponse.json(data);
  } catch (err) {
    console.error("Erro no PATCH /api/villa-bianco-units:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const denied = await requireCoordinatorOrAdminWriteAccess();
    if (denied) return denied;

    const supabase = await createClient();
    const body = await request.json();
    const { updates } = body;

    if (!Array.isArray(updates)) {
      return NextResponse.json({ error: "Campo 'updates' deve ser um array" }, { status: 400 });
    }

    const validStatuses = ["disponivel", "reservado", "vendido"];
    for (const update of updates) {
      if (!update.bloco || !update.unidade || !update.status || !validStatuses.includes(update.status)) {
        return NextResponse.json({ error: `Atualização inválida para unidade ${update.bloco} ${update.unidade}` }, { status: 400 });
      }
    }

    const results = [];
    for (const update of updates) {
      const { data, error } = await supabase
        .from("villa_bianco_units")
        .update({ status: update.status })
        .eq("bloco", update.bloco)
        .eq("unidade", update.unidade)
        .select()
        .single();

      if (error) {
        console.error(`Erro ao atualizar unidade ${update.bloco} ${update.unidade}:`, error.message);
      } else {
        results.push(data);
      }
    }

    return NextResponse.json({ updated: results });
  } catch (err) {
    console.error("Erro no POST /api/villa-bianco-units:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
