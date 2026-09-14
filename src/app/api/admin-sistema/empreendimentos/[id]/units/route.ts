import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireReadAccess } from "@/lib/api-auth";
import { coordenadorHasAccess } from "@/lib/coordinator-access";
import { trackUnitStatusChange } from "@/lib/analytics";
import {
  matchSingleTarget,
  type BatchRow,
  type BatchUnitIdentifier,
} from "@/lib/batch-units";

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
    const { unidade, bloco, status } = body;

    if (!unidade || !status) {
      return NextResponse.json({ error: "Campos 'unidade' e 'status' são obrigatórios" }, { status: 400 });
    }

    if (typeof unidade !== "string" && typeof unidade !== "number") {
      return NextResponse.json({ error: "Campo 'unidade' deve ser string ou número" }, { status: 400 });
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

    // FIX: a unicidade real de projeto_units é (empreendimento_id, bloco,
    // unidade) — números de unidade se repetem entre blocos. Atualizar por
    // (empreendimento_id, unidade) fechando com .single() fazia o PostgREST
    // falhar com PGRST116 ("Cannot coerce the result to a single JSON
    // object") quando o empreendimento possui unidades homônimas em blocos
    // diferentes — e o UPDATE podia aplicar o status às 2 linhas gêmeas
    // antes do erro (500 que o coordenador via como "Erro ao atualizar
    // unidade").
    //
    // Padrão novo (mesmo do PATCH em lote — batch-units.ts):
    //   1. SELECT resolve as linhas candidatas (sem .single());
    //   2. casamento exato identificador → linha (matchSingleTarget, com a
    //      tolerância de formatação de bloco já documentada no lote);
    //   3. UPDATE por id (chave primária) com escopo do empreendimento e
    //      .maybeSingle() — imune a duplicatas e a deleção concorrente.
    const { data: candidates, error: resolveErr } = await supabase
      .from("projeto_units")
      .select("id, status, unidade, bloco")
      .eq("empreendimento_id", id)
      .eq("unidade", unidade);

    if (resolveErr) {
      console.error("Erro ao localizar unidade:", resolveErr.message);
      return NextResponse.json({ error: "Erro ao localizar unidade" }, { status: 500 });
    }

    const ident: BatchUnitIdentifier = { unidade };
    if ((typeof bloco === "string" && bloco !== "") || typeof bloco === "number") {
      ident.bloco = bloco;
    }
    const match = matchSingleTarget(
      ((candidates ?? []) as unknown) as BatchRow[],
      ident
    );

    if (!match.ok) {
      if (match.motivo === "ambigua") {
        const total = (candidates ?? []).length;
        console.error(
          `PATCH units: unidade ambígua (${total} ocorrências de "${unidade}" em blocos diferentes) no empreendimento ${id}`
        );
        return NextResponse.json(
          {
            error: `Unidade ambígua: existem ${total} unidades com o número "${unidade}" em blocos diferentes. Recarregue a página e tente novamente.`,
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "Unidade não encontrada" }, { status: 404 });
    }

    const target = match.row;

    const { data, error: updateErr } = await supabase
      .from("projeto_units")
      .update({ status })
      .eq("empreendimento_id", id)
      .eq("id", String(target.id))
      .select()
      .maybeSingle();

    if (updateErr) {
      console.error("Erro ao atualizar status:", updateErr.message);
      return NextResponse.json({ error: "Erro ao atualizar unidade" }, { status: 500 });
    }

    // Linha removida entre o resolve e o update (corrida rara) → sem dado.
    if (!data) {
      return NextResponse.json({ error: "Unidade não encontrada" }, { status: 404 });
    }

    // Track status change (aguardado: histórico essencial deve completar
    // antes da resposta para não ser congelado no ciclo da Function)
    if (user) {
      await trackUnitStatusChange({
        unitId: data.id,
        empreendimentoId: id,
        unidade: String(unidade),
        bloco: data.bloco || "",
        statusAnterior: (target.status as string) ?? null,
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