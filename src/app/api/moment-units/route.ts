import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireReadAccess, requireWriteAccess } from "@/lib/api-auth";
import { trackUnitStatusChange } from "@/lib/analytics";

export async function GET() {
  try {
    const denied = await requireReadAccess();
    if (denied) return denied;

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("moment_units")
      .select("*")
      .order("andar", { ascending: true })
      .order("unidade", { ascending: true });

    if (error) {
      console.error("Erro ao buscar unidades Moment:", error.message);
      return NextResponse.json({ error: "Erro ao buscar unidades" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch {
    const { momentUnits } = await import("@/lib/moment-data");
    return NextResponse.json(momentUnits);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const denied = await requireWriteAccess();
    if (denied) return denied;

    const supabase = await createClient();
    const body = await request.json();
    const { unidade, status, valor_venda } = body;

    if (!unidade) {
      return NextResponse.json({ error: "Campo 'unidade' é obrigatório" }, { status: 400 });
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

    // Fetch old unit data before update
    let oldUnit: { id?: string; status?: string } | null = null;
    if (status !== undefined) {
      const { data: old } = await supabase
        .from("moment_units")
        .select("id, status")
        .eq("unidade", unidade)
        .single();
      oldUnit = old;
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

    const { data, error } = await supabase
      .from("moment_units")
      .update(updates)
      .eq("unidade", unidade)
      .select()
      .single();

    if (error) {
      console.error("Erro ao atualizar:", error.message);
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
            empreendimentoId: "moment",
            unidade: String(unidade),
            bloco: "",
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
    console.error("Erro no PATCH /api/moment-units:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const denied = await requireWriteAccess();
    if (denied) return denied;

    const supabase = await createClient();
    const body = await request.json();
    const { updates } = body;

    if (!Array.isArray(updates)) {
      return NextResponse.json({ error: "Campo 'updates' deve ser um array" }, { status: 400 });
    }

    const validStatuses = ["disponivel", "reservado", "vendido"];
    const results = [];

    for (const update of updates) {
      if (!update.unidade) {
        return NextResponse.json({ error: "Campo 'unidade' é obrigatório" }, { status: 400 });
      }

      const rowUpdates: Record<string, unknown> = {};

      if (update.status !== undefined) {
        if (!validStatuses.includes(update.status)) {
          return NextResponse.json({ error: `Status inválido para unidade ${update.unidade}` }, { status: 400 });
        }
        rowUpdates.status = update.status;
      }

      if (update.valor_venda !== undefined) {
        rowUpdates.valor_venda = update.valor_venda === null ? null : Number(update.valor_venda);
      }

      if (Object.keys(rowUpdates).length === 0) continue;

      const { data, error } = await supabase
        .from("moment_units")
        .update(rowUpdates)
        .eq("unidade", update.unidade)
        .select()
        .single();

      if (error) {
        console.error(`Erro ao atualizar unidade ${update.unidade}:`, error.message);
      } else {
        results.push(data);
      }
    }

    return NextResponse.json({ updated: results });
  } catch (err) {
    console.error("Erro no POST /api/moment-units:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
