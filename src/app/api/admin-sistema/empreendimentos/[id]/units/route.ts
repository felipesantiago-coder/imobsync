import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireReadAccess } from "@/lib/api-auth";
import { coordenadorHasAccess } from "@/lib/coordinator-access";
import { trackUnitStatusChange } from "@/lib/analytics";

export const dynamic = "force-dynamic";

/** Verifica se o usuário é coordenador ou admin_sistema */
async function getUserAndRole() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }), user: null, role: null };
  const { data: profile, error: profileErr } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return { supabase, error: null, user, role: profile?.role || null };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Leitura: admin sempre pode; usuários comuns precisam de assinatura ativa
    const readDenied = await requireReadAccess();
    if (readDenied) return readDenied;

    const supabase = await createClient();

    const { id } = await params;

    // Validar que o empreendimento existe
    const { data: emp, error: empErr } = await supabase
      .from("empreendimentos")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (empErr || !emp) {
      return NextResponse.json({ error: "Empreendimento não encontrado" }, { status: 404 });
    }

    const { data, error: queryErr } = await supabase
      .from("projeto_units")
      .select("*")
      .eq("empreendimento_id", id)
      .order("ordem", { ascending: true })
      .order("andar", { ascending: true })
      .order("unidade", { ascending: true });

    if (queryErr) {
      console.error("Erro ao buscar unidades:", queryErr.message);
      return NextResponse.json({ error: "Erro ao buscar unidades" }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err) {
    console.error("Erro no GET units:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, error, role, user } = await getUserAndRole();
    if (error) return error;

    if (!role || (role !== "coordenador" && role !== "admin_sistema")) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const { id } = await params;

    // Coordenador só pode alterar unidades de empreendimentos atribuídos
    if (role === "coordenador" && user) {
      const hasAccess = await coordenadorHasAccess(user.id, id);
      if (!hasAccess) {
        return NextResponse.json({ error: "Sem permissão para este empreendimento" }, { status: 403 });
      }
    }
    const body = await request.json();
    const { unidade, status } = body;

    if (!unidade || !status) {
      return NextResponse.json({ error: "Campos 'unidade' e 'status' são obrigatórios" }, { status: 400 });
    }

    const validStatuses = ["disponivel", "reservado", "vendido"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: `Status inválido. Valores: ${validStatuses.join(", ")}` }, { status: 400 });
    }

    // Validar que o empreendimento existe antes de alterar
    const { data: emp, error: empErr } = await supabase
      .from("empreendimentos")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (empErr || !emp) {
      return NextResponse.json({ error: "Empreendimento não encontrado" }, { status: 404 });
    }

    // Fetch old unit data before update
    const { data: oldUnit } = await supabase
      .from("projeto_units")
      .select("id, status, bloco, empreendimento_id")
      .eq("empreendimento_id", id)
      .eq("unidade", unidade)
      .single();

    const { data, error: updateErr } = await supabase
      .from("projeto_units")
      .update({ status })
      .eq("empreendimento_id", id)
      .eq("unidade", unidade)
      .select()
      .single();

    if (updateErr) {
      console.error("Erro ao atualizar status:", updateErr.message);
      return NextResponse.json({ error: "Erro ao atualizar unidade" }, { status: 500 });
    }

    // Track status change (fire-and-forget)
    if (user) {
      trackUnitStatusChange({
        unitId: data.id,
        empreendimentoId: id,
        unidade: String(unidade),
        bloco: data.bloco || "",
        statusAnterior: oldUnit?.status ?? null,
        statusNovo: status,
        changedBy: user.id,
        changedByRole: role || "unknown",
      });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("Erro no PATCH units:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}