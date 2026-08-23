import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminSistema } from '@/lib/admin-auth';

/**
 * GET /api/admin-sistema/cupons
 * Lista todos os cupons com contagem de usos.
 */
export async function GET() {
  try {
    const isAllowed = await requireAdminSistema();
    if (!isAllowed) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const supabase = createAdminClient();

    const { data: cupons, error } = await supabase
      .from('cupons')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[GET /api/admin-sistema/cupons] Erro:', error);
      return NextResponse.json({ error: 'Erro ao buscar cupons.' }, { status: 500 });
    }

    // Buscar nomes dos planos para exibição
    const allPlanoIds = new Set<string>();
    for (const c of (cupons || [])) {
      if (Array.isArray(c.planos_ids)) {
        for (const pid of c.planos_ids) allPlanoIds.add(pid);
      }
    }

    let planoNames: Record<string, string> = {};
    if (allPlanoIds.size > 0) {
      const { data: planos } = await supabase
        .from('planos')
        .select('id, nome')
        .in('id', [...allPlanoIds]);
      if (planos) {
        planoNames = Object.fromEntries(planos.map((p: { id: string; nome: string }) => [p.id, p.nome]));
      }
    }

    const enriched = (cupons || []).map((c: Record<string, unknown>) => ({
      ...c,
      plano_nomes: Array.isArray(c.planos_ids)
        ? (c.planos_ids as string[]).map((id: string) => planoNames[id] || id)
        : null,
    }));

    return NextResponse.json({ cupons: enriched });
  } catch (err) {
    console.error('[GET /api/admin-sistema/cupons] Erro:', err);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}

/**
 * POST /api/admin-sistema/cupons
 * Cria um novo cupom.
 */
export async function POST(request: NextRequest) {
  try {
    const isAllowed = await requireAdminSistema();
    if (!isAllowed) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const supabase = createAdminClient();
    const body = await request.json();
    const {
      codigo, tipo_desconto, valor_desconto,
      usos_maximos, valido_a_partir, valido_ate,
      planos_ids,
    } = body as {
      codigo?: unknown;
      tipo_desconto?: unknown;
      valor_desconto?: unknown;
      usos_maximos?: unknown;
      valido_a_partir?: unknown;
      valido_ate?: unknown;
      planos_ids?: unknown;
    };

    // Validações
    if (typeof codigo !== 'string' || !codigo.trim()) {
      return NextResponse.json({ error: 'Código é obrigatório.' }, { status: 400 });
    }

    const trimmedCodigo = codigo.trim().toUpperCase().slice(0, 50);

    if (!['percentual', 'fixo'].includes(tipo_desconto as string)) {
      return NextResponse.json({ error: 'tipo_desconto deve ser "percentual" ou "fixo".' }, { status: 400 });
    }

    const desconto = Number(valor_desconto);
    if (!Number.isFinite(desconto) || desconto <= 0) {
      return NextResponse.json({ error: 'valor_desconto deve ser um número positivo.' }, { status: 400 });
    }

    if (tipo_desconto === 'percentual' && desconto > 100) {
      return NextResponse.json({ error: 'Desconto percentual não pode exceder 100%.' }, { status: 400 });
    }

    if (tipo_desconto === 'fixo' && desconto > 99999.99) {
      return NextResponse.json({ error: 'Valor fixo não pode exceder R$ 99.999,99.' }, { status: 400 });
    }

    const insertData: Record<string, unknown> = {
      codigo: trimmedCodigo,
      tipo_desconto: tipo_desconto as string,
      valor_desconto: desconto,
    };

    if (usos_maximos !== undefined && usos_maximos !== null) {
      const max = Number(usos_maximos);
      if (!Number.isInteger(max) || max < 1) {
        return NextResponse.json({ error: 'usos_maximos deve ser um inteiro positivo.' }, { status: 400 });
      }
      insertData.usos_maximos = max;
    }

    if (valido_a_partir) insertData.valido_a_partir = new Date(valido_a_partir as string).toISOString();
    if (valido_ate) insertData.valido_ate = new Date(valido_ate as string).toISOString();

    if (Array.isArray(planos_ids) && planos_ids.length > 0) {
      insertData.planos_ids = planos_ids;
    }

    const { data: novoCupom, error: insertErr } = await supabase
      .from('cupons')
      .insert(insertData)
      .select()
      .single();

    if (insertErr) {
      if (insertErr.message?.includes('duplicate') || insertErr.message?.includes('unique')) {
        return NextResponse.json({ error: 'Já existe um cupom com este código.' }, { status: 409 });
      }
      console.error('[POST /api/admin-sistema/cupons] Erro:', insertErr);
      return NextResponse.json({ error: 'Erro ao criar cupom.' }, { status: 500 });
    }

    return NextResponse.json({ cupom: novoCupom, message: 'Cupom criado com sucesso.' }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/admin-sistema/cupons] Erro:', err);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin-sistema/cupons
 * Atualiza um cupom existente.
 */
export async function PATCH(request: NextRequest) {
  try {
    const isAllowed = await requireAdminSistema();
    if (!isAllowed) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const supabase = createAdminClient();
    const body = await request.json();
    const { id, ...fields } = body as { id?: string; [key: string]: unknown };

    if (!id) {
      return NextResponse.json({ error: 'id é obrigatório.' }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (fields.codigo !== undefined) {
      if (typeof fields.codigo !== 'string' || !fields.codigo.trim()) {
        return NextResponse.json({ error: 'Código inválido.' }, { status: 400 });
      }
      updates.codigo = fields.codigo.trim().toUpperCase().slice(0, 50);
    }

    if (fields.tipo_desconto !== undefined) {
      if (!['percentual', 'fixo'].includes(fields.tipo_desconto as string)) {
        return NextResponse.json({ error: 'tipo_desconto inválido.' }, { status: 400 });
      }
      updates.tipo_desconto = fields.tipo_desconto;
    }

    if (fields.valor_desconto !== undefined) {
      const d = Number(fields.valor_desconto);
      if (!Number.isFinite(d) || d <= 0) {
        return NextResponse.json({ error: 'valor_desconto inválido.' }, { status: 400 });
      }
      updates.valor_desconto = d;
    }

    if (fields.usos_maximos !== undefined) {
      if (fields.usos_maximos === null) {
        updates.usos_maximos = null;
      } else {
        const m = Number(fields.usos_maximos);
        if (!Number.isInteger(m) || m < 1) {
          return NextResponse.json({ error: 'usos_maximos inválido.' }, { status: 400 });
        }
        updates.usos_maximos = m;
      }
    }

    if (fields.ativo !== undefined) updates.ativo = fields.ativo === true;

    if (fields.valido_a_partir !== undefined) {
      updates.valido_a_partir = fields.valido_a_partir ? new Date(fields.valido_a_partir as string).toISOString() : null;
    }
    if (fields.valido_ate !== undefined) {
      updates.valido_ate = fields.valido_ate ? new Date(fields.valido_ate as string).toISOString() : null;
    }

    if (fields.planos_ids !== undefined) {
      updates.planos_ids = Array.isArray(fields.planos_ids) ? fields.planos_ids : null;
    }

    const { data: updated, error } = await supabase
      .from('cupons')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !updated) {
      console.error('[PATCH /api/admin-sistema/cupons] Erro:', error);
      return NextResponse.json({ error: 'Erro ao atualizar cupom.' }, { status: 500 });
    }

    return NextResponse.json({ cupom: updated, message: 'Cupom atualizado.' });
  } catch (err) {
    console.error('[PATCH /api/admin-sistema/cupons] Erro:', err);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin-sistema/cupons
 * Remove um cupom. Só permite se não tiver usos vinculados.
 */
export async function DELETE(request: NextRequest) {
  try {
    const isAllowed = await requireAdminSistema();
    if (!isAllowed) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const { id } = await request.json() as { id?: string };
    if (!id) {
      return NextResponse.json({ error: 'id é obrigatório.' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Excluir cupom — cupom_usos tem ON DELETE CASCADE no banco
    const { error } = await supabase.from('cupons').delete().eq('id', id);
    if (error) {
      console.error('[DELETE /api/admin-sistema/cupons] Erro:', error);
      return NextResponse.json({ error: 'Erro ao excluir cupom.' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Cupom excluído.' });
  } catch (err) {
    console.error('[DELETE /api/admin-sistema/cupons] Erro:', err);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
