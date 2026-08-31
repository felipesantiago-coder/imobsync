import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireReadAccess, requireWriteAccessForEmpreendimento } from "@/lib/api-auth";
import { trackUnitStatusChange } from "@/lib/analytics";

export async function GET() {
  try {
    const denied = await requireReadAccess();
    if (denied) return denied;

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("vitta_units")
      .select("*")
      .order("andar_num", { ascending: true })
      .order("bloco", { ascending: true })
      .order("unidade", { ascending: true });

    if (error) {
      console.error("Erro ao buscar unidades Vitta:", error.message);
      return NextResponse.json({ error: "Erro ao buscar unidades" }, { status: 500 });
    }

    if (!data || data.length === 0) {
      const { vittaUnits } = await import("@/lib/vitta-data");
      return NextResponse.json(vittaUnits);
    }

    return NextResponse.json(data);
  } catch {
    const { vittaUnits } = await import("@/lib/vitta-data");
    return NextResponse.json(vittaUnits);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const denied = await requireWriteAccessForEmpreendimento('vitta');
    if (denied) return denied;

    const supabase = await createClient();
    const body = await request.json();
    const { bloco, unidade, andar, status, valor_venda } = body;

    if (!bloco || unidade === undefined) {
      return NextResponse.json(
        { error: "Campos 'bloco' e 'unidade' são obrigatórios" },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {};

    if (status !== undefined) {
      const validStatuses = ["disponivel", "reservado", "vendido"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Status inválido. Valores: ${validStatuses.join(", ")}` },
          { status: 400 }
        );
      }
      updates.status = status;
    }

    if (valor_venda !== undefined) {
      updates.valor_venda = valor_venda === null ? null : Number(valor_venda);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Informe pelo menos um campo para atualizar (status ou valor_venda)" },
        { status: 400 }
      );
    }

    // Fetch old unit data before update (only if status is changing)
    let oldUnit: { id?: string; status?: string } | null = null;
    if (status !== undefined) {
      let oldQuery = supabase
        .from("vitta_units")
        .select("id, status")
        .eq("bloco", bloco)
        .eq("unidade", unidade);
      if (andar) {
        oldQuery = oldQuery.eq("andar", andar) as any;
      }
      const { data: old } = await oldQuery.single();
      oldUnit = old;
    }

    let query = supabase
      .from("vitta_units")
      .update(updates)
      .eq("bloco", bloco)
      .eq("unidade", unidade);

    if (andar) {
      query = query.eq("andar", andar) as any;
    }

    const { data, error } = await query.select().single();

    if (error) {
      console.error("Erro ao atualizar unidade Vitta:", error.message);
      return NextResponse.json({ error: "Erro ao atualizar unidade" }, { status: 500 });
    }

    // Track status change (fire-and-forget)
    if (status !== undefined && oldUnit) {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const { data: profile } = await supabase.from("profiles").select("role").eq("id", authUser?.id).maybeSingle();
        if (authUser) {
          trackUnitStatusChange({
            unitId: data.id,
            empreendimentoId: "vitta",
            unidade: String(unidade),
            bloco: String(bloco),
            statusAnterior: oldUnit.status ?? null,
            statusNovo: status,
            changedBy: authUser.id,
            changedByRole: (profile as Record<string, unknown>)?.role as string || "admin",
          });
        }
      } catch { /* fire-and-forget */ }
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("Erro no PATCH /api/vitta-units:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
