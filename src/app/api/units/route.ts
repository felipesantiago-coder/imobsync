import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireReadAccess, requireCoordinatorOrAdminWriteAccess } from "@/lib/api-auth";
import { trackUnitStatusChange } from "@/lib/analytics";
import {
  matchBatchTargets,
  matchSingleTarget,
  type BatchRow,
} from "@/lib/batch-units";

export async function GET() {
  try {
    // Verificar acesso (admin ou assinatura ativa)
    const denied = await requireReadAccess();
    if (denied) return denied;

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("units")
      .select("*")
      .order("andar", { ascending: true })
      .order("unidade", { ascending: true });

    if (error) {
      console.error("Erro ao buscar unidades:", error.message);
      return NextResponse.json({ error: "Erro ao buscar unidades" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch {
    const { units } = await import("@/lib/units-data");
    return NextResponse.json(units);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // Verificar acesso de escrita (admin only)
    const denied = await requireCoordinatorOrAdminWriteAccess();
    if (denied) return denied;

    const supabase = await createClient();
    const body = await request.json();
    const { unidade, status } = body;

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

    // FIX (mesmo padrão do PATCH de projeto_units — ver rota
    // admin-sistema/empreendimentos/[id]/units): resolve os candidatos sem
    // .single(), casa 1 linha exata (matchSingleTarget) e atualiza por id
    // (PK) com .maybeSingle() — elimina o 500 por coerção do PostgREST
    // (PGRST116 "Cannot coerce the result to a single JSON object") quando o
    // filtro casa 0 ou 2+ linhas, e impede atualização de linhas gêmeas caso
    // a tabela venha a ter unidades homônimas.
    const { data: candidates, error: resolveErr } = await supabase
      .from("units")
      .select("id, status, unidade")
      .eq("unidade", unidade);

    if (resolveErr) {
      console.error("Erro ao localizar unidade:", resolveErr.message);
      return NextResponse.json({ error: "Erro ao localizar unidade" }, { status: 500 });
    }

    const match = matchSingleTarget(
      ((candidates ?? []) as unknown) as BatchRow[],
      { unidade }
    );

    if (!match.ok) {
      if (match.motivo === "ambigua") {
        const total = (candidates ?? []).length;
        console.error(`PATCH /api/units: unidade ambígua (${total} ocorrências de "${unidade}")`);
        return NextResponse.json(
          {
            error: `Unidade ambígua: existem ${total} unidades com o número "${unidade}". Verifique os dados da tabela.`,
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "Unidade não encontrada" }, { status: 404 });
    }

    const target = match.row;

    const { data, error } = await supabase
      .from("units")
      .update({ status })
      .eq("id", String(target.id))
      .select()
      .maybeSingle();

    if (error) {
      console.error("Erro ao atualizar:", error.message);
      return NextResponse.json({ error: "Erro ao atualizar unidade" }, { status: 500 });
    }

    // 0 linhas: removida no meio do voo OU bloqueio de RLS (a política UPDATE
    // desta tabela legacy aceita apenas admin_sistema, enquanto o guard da
    // rota também aceita coordenador com atribuição).
    if (!data) {
      return NextResponse.json(
        { error: "Unidade não encontrada ou sem permissão para editá-la" },
        { status: 404 }
      );
    }

    // Track status change (fire-and-forget)
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", authUser?.id).maybeSingle();
      if (authUser) {
        await trackUnitStatusChange({
          unitId: data.id,
          empreendimentoId: "sales",
          unidade: String(unidade),
          bloco: "",
          statusAnterior: (target.status as string) ?? null,
          statusNovo: status,
          changedBy: authUser.id,
          changedByRole: (profile as Record<string, unknown>)?.role as string || "admin",
        });
      }
    } catch { /* fire-and-forget */ }

    return NextResponse.json(data);
  } catch (err) {
    console.error("Erro no PATCH /api/units:", err);
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
      if (!update.unidade || !update.status || !validStatuses.includes(update.status)) {
        return NextResponse.json({ error: `Atualização inválida para unidade ${update.unidade}` }, { status: 400 });
      }
    }

    const results: unknown[] = [];

    // FIX: resolve todos os candidatos em 1 query (.in) e casa cada item do
    // lote com matchBatchTargets (mesmo algoritmo do PATCH em lote de
    // projeto_units). O update passa a ser por id (PK): um item nunca atualiza
    // duas linhas, e item não casado é logado e pulado — contrato
    // { updated } preservado.
    if (updates.length > 0) {
      const unidadeValues = [...new Set(updates.map((u) => String(u.unidade)))];
      const { data: candidates, error: resolveErr } = await supabase
        .from("units")
        .select("id, unidade")
        .in("unidade", unidadeValues);

      if (resolveErr) {
        console.error("Erro ao localizar unidades:", resolveErr.message);
        return NextResponse.json({ error: "Erro ao localizar unidades" }, { status: 500 });
      }

      const { matches, failures } = matchBatchTargets(
        ((candidates ?? []) as unknown) as BatchRow[],
        updates.map((u) => ({ unidade: u.unidade }))
      );
      for (const failure of failures) {
        console.error(`Item do lote não aplicado (${failure.motivo}): unidade ${failure.unidade}`);
      }

      for (const [index, update] of updates.entries()) {
        const target = matches.get(index);
        if (!target) continue; // falha já logada acima

        const { data, error } = await supabase
          .from("units")
          .update({ status: update.status })
          .eq("id", String(target.id))
          .select()
          .maybeSingle();

        if (error) {
          console.error(`Erro ao atualizar unidade ${update.unidade}:`, error.message);
        } else if (data) {
          results.push(data);
        } else {
          console.error(`Unidade ${update.unidade} (id ${target.id}) não retornou do update — removida ou bloqueada por RLS`);
        }
      }
    }

    return NextResponse.json({ updated: results });
  } catch (err) {
    console.error("Erro no POST /api/units:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
