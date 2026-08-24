import { NextRequest, NextResponse } from "next/server";
import { requireAdminSistema } from "@/lib/admin-auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET — Busca configuração do simulador de um empreendimento.
 * Query: ?empreendimento_id=uuid
 */
export async function GET(request: NextRequest) {
  try {
    const isAllowed = await requireAdminSistema();
    if (!isAllowed) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

    const empId = request.nextUrl.searchParams.get("empreendimento_id");
    if (!empId) {
      return NextResponse.json({ error: "empreendimento_id é obrigatório" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("simulador_configs")
      .select("*")
      .eq("empreendimento_id", empId)
      .maybeSingle();

    if (error) {
      console.error("[GET simulador-config] Erro:", error.message);
      return NextResponse.json({ error: "Erro ao buscar configuração" }, { status: 500 });
    }

    return NextResponse.json({ config: data });
  } catch (err) {
    console.error("[GET simulador-config] Erro:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * POST — Cria configuração do simulador para um empreendimento.
 * Body: { empreendimento_id, entrega_mes, entrega_ano, percentual_sinal, percentual_captacao, ... }
 */
export async function POST(request: NextRequest) {
  try {
    const isAllowed = await requireAdminSistema();
    if (!isAllowed) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

    const supabase = await createClient();
    const body = await request.json();
    const {
      empreendimento_id,
      entrega_mes,
      entrega_ano,
      percentual_sinal,
      percentual_captacao,
      semestrais_habilitado,
      anuais_habilitado,
      intermediarias_habilitado,
      parcela_unica_habilitada,
      taxa_decoracao,
      taxa_decoracao_valor,
      taxa_decoracao_parcelas,
      taxa_decoracao_inicio,
      taxa_decoracao_fim,
    } = body;

    if (!empreendimento_id || !entrega_mes || !entrega_ano) {
      return NextResponse.json(
        { error: "empreendimento_id, entrega_mes e entrega_ano são obrigatórios" },
        { status: 400 }
      );
    }

    // Verificar se o empreendimento existe
    const { data: emp, error: empErr } = await supabase
      .from("empreendimentos")
      .select("id")
      .eq("id", empreendimento_id)
      .maybeSingle();

    if (empErr || !emp) {
      return NextResponse.json({ error: "Empreendimento não encontrado" }, { status: 404 });
    }

    // Verificar se já existe config
    const { data: existing } = await supabase
      .from("simulador_configs")
      .select("id")
      .eq("empreendimento_id", empreendimento_id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "Configuração já existe. Use PUT para atualizar." },
        { status: 409 }
      );
    }

    const insertData: Record<string, unknown> = {
      empreendimento_id,
      entrega_mes: parseInt(entrega_mes),
      entrega_ano: parseInt(entrega_ano),
      percentual_sinal: parseFloat(percentual_sinal) || 5,
      percentual_captacao: parseFloat(percentual_captacao) || 30,
      semestrais_habilitado: !!semestrais_habilitado,
      anuais_habilitado: !!anuais_habilitado,
      intermediarias_habilitado: !!intermediarias_habilitado,
      parcela_unica_habilitada: !!parcela_unica_habilitada,
      taxa_decoracao: !!taxa_decoracao,
    };

    if (taxa_decoracao) {
      insertData.taxa_decoracao_valor = parseFloat(taxa_decoracao_valor) || null;
      insertData.taxa_decoracao_parcelas = parseInt(taxa_decoracao_parcelas) || null;
      insertData.taxa_decoracao_inicio = taxa_decoracao_inicio || null;
      insertData.taxa_decoracao_fim = taxa_decoracao_fim || null;
    }

    const { data, error } = await supabase
      .from("simulador_configs")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error("[POST simulador-config] Erro:", error.message);
      return NextResponse.json({ error: "Erro ao criar configuração" }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[POST simulador-config] Erro:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * PUT — Atualiza configuração existente.
 * Body: { empreendimento_id, ...campos }
 */
export async function PUT(request: NextRequest) {
  try {
    const isAllowed = await requireAdminSistema();
    if (!isAllowed) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

    const supabase = await createClient();
    const body = await request.json();
    const { empreendimento_id, ...fields } = body;

    if (!empreendimento_id) {
      return NextResponse.json({ error: "empreendimento_id é obrigatório" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      "entrega_mes", "entrega_ano", "percentual_sinal", "percentual_captacao",
      "semestrais_habilitado", "anuais_habilitado", "intermediarias_habilitado",
      "parcela_unica_habilitada", "taxa_decoracao",
      "taxa_decoracao_valor", "taxa_decoracao_parcelas", "taxa_decoracao_inicio", "taxa_decoracao_fim",
    ];

    for (const field of allowedFields) {
      if (fields[field] !== undefined) {
        updateData[field] = fields[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });
    }

    // Converter tipos numéricos
    if (updateData.entrega_mes !== undefined) updateData.entrega_mes = parseInt(String(updateData.entrega_mes));
    if (updateData.entrega_ano !== undefined) updateData.entrega_ano = parseInt(String(updateData.entrega_ano));
    if (updateData.percentual_sinal !== undefined) updateData.percentual_sinal = parseFloat(String(updateData.percentual_sinal));
    if (updateData.percentual_captacao !== undefined) updateData.percentual_captacao = parseFloat(String(updateData.percentual_captacao));
    if (updateData.taxa_decoracao_valor !== undefined) updateData.taxa_decoracao_valor = updateData.taxa_decoracao_valor ? parseFloat(String(updateData.taxa_decoracao_valor)) : null;
    if (updateData.taxa_decoracao_parcelas !== undefined) updateData.taxa_decoracao_parcelas = updateData.taxa_decoracao_parcelas ? parseInt(String(updateData.taxa_decoracao_parcelas)) : null;

    const { data, error } = await supabase
      .from("simulador_configs")
      .update(updateData)
      .eq("empreendimento_id", empreendimento_id)
      .select()
      .single();

    if (error) {
      console.error("[PUT simulador-config] Erro:", error.message);
      return NextResponse.json({ error: "Erro ao atualizar configuração" }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Configuração não encontrada" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[PUT simulador-config] Erro:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * DELETE — Remove configuração do simulador.
 * Query: ?empreendimento_id=uuid
 */
export async function DELETE(request: NextRequest) {
  try {
    const isAllowed = await requireAdminSistema();
    if (!isAllowed) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

    const empId = request.nextUrl.searchParams.get("empreendimento_id");
    if (!empId) {
      return NextResponse.json({ error: "empreendimento_id é obrigatório" }, { status: 400 });
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("simulador_configs")
      .delete()
      .eq("empreendimento_id", empId);

    if (error) {
      console.error("[DELETE simulador-config] Erro:", error.message);
      return NextResponse.json({ error: "Erro ao excluir configuração" }, { status: 500 });
    }

    return NextResponse.json({ message: "Configuração removida" });
  } catch (err) {
    console.error("[DELETE simulador-config] Erro:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
