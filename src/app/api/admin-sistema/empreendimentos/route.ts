import { NextRequest, NextResponse } from "next/server";
import { requireAdminSistema } from "@/lib/admin-auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const isAllowed = await requireAdminSistema();
    if (!isAllowed) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

    const supabase = await createClient();

    // Query única com aggregate — evita N+1 queries separadas por empreendimento
    const { data, error: err } = await supabase
      .from("empreendimentos")
      .select(`
        *,
        projeto_units(count)
      `)
      .order("created_at", { ascending: true });

    if (err) {
      console.error("Erro ao buscar empreendimentos:", err.message);
      return NextResponse.json({ error: "Erro ao buscar empreendimentos" }, { status: 500 });
    }

    // Mapear aggregate count para unit_count
    const enriched = (data || []).map((emp: Record<string, unknown>) => ({
      ...emp,
      projeto_units: undefined, // remover dados embedded
      unit_count: (emp.projeto_units as { count: number }[] | null)?.[0]?.count ?? 0,
    }));

    return NextResponse.json({ empreendimentos: enriched, total: enriched.length });
  } catch (err) {
    console.error("Erro no GET /api/admin-sistema/empreendimentos:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

function generateSlug(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function POST(request: NextRequest) {
  try {
    const isAllowed = await requireAdminSistema();
    if (!isAllowed) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

    const supabase = await createClient();

    const body = await request.json();
    const { nome, regiao, descricao } = body;

    if (!nome || !regiao) {
      return NextResponse.json({ error: "Campos 'nome' e 'região' são obrigatórios" }, { status: 400 });
    }

    const slug = generateSlug(nome);

    const { data, error: err } = await supabase
      .from("empreendimentos")
      .insert({
        nome: nome.trim(),
        slug,
        regiao: regiao.trim(),
        descricao: descricao?.trim() || "",
        imagem_url: null,
      })
      .select()
      .single();

    if (err) {
      console.error("Erro ao criar empreendimento:", err.message);
      if (err.code === "23505") {
        return NextResponse.json({ error: "Já existe um empreendimento com esse nome" }, { status: 409 });
      }
      return NextResponse.json({ error: "Erro ao criar empreendimento" }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("Erro no POST /api/admin-sistema/empreendimentos:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const isAllowed = await requireAdminSistema();
    if (!isAllowed) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

    const supabase = await createClient();

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "Campo 'id' é obrigatório" }, { status: 400 });
    }

    const { error: err } = await supabase.from("empreendimentos").delete().eq("id", id);

    if (err) {
      console.error("Erro ao remover empreendimento:", err.message);
      return NextResponse.json({ error: "Erro ao remover empreendimento" }, { status: 500 });
    }

    // Remover imagem do Supabase Storage se existir
    for (const ext of [".jpg", ".png", ".webp"]) {
      try {
        await supabase.storage.from("empreendimentos").remove([`${id}${ext}`]);
      } catch {
        // Arquivo pode não existir, ignorar
      }
    }

    return NextResponse.json({ message: "Empreendimento removido com sucesso" });
  } catch (err) {
    console.error("Erro no DELETE /api/admin-sistema/empreendimentos:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
