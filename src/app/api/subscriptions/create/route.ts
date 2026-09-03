import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createMpPreference } from '@/lib/mercadopago';

// Regex para validação de UUID v4
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * POST /api/subscriptions/create
 * Cria um pagamento via MP Checkout Pro (Preference) para o plano escolhido.
 * Suporta PIX, cartão de crédito e outros métodos.
 * Retorna a URL de checkout (init_point) para redirecionar o usuário.
 *
 * Body: { planoId: string, cupomId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }

    // Parse body
    const body = await request.json();
    const { planoId, cupomId } = body as { planoId?: string; cupomId?: string };

    if (!planoId) {
      return NextResponse.json({ error: 'planoId é obrigatório.' }, { status: 400 });
    }

    if (!UUID_RE.test(planoId)) {
      return NextResponse.json({ error: 'planoId inválido.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // 1. Buscar o plano
    const { data: plano, error: planoErr } = await adminClient
      .from('planos')
      .select('*')
      .eq('id', planoId)
      .eq('ativo', true)
      .single();

    if (planoErr || !plano) {
      return NextResponse.json({ error: 'Plano não encontrado.' }, { status: 404 });
    }

    // 2. Verificar se o usuário já tem assinatura ATIVA
    const { data: assinaturaAtiva } = await adminClient
      .from('assinaturas')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (assinaturaAtiva) {
      return NextResponse.json(
        { error: 'Você já possui uma assinatura ativa.', subscriptionId: assinaturaAtiva.id },
        { status: 409 }
      );
    }

    // 3. Verificar se há assinatura pendente para este plano
    const { data: assinaturaPendente } = await adminClient
      .from('assinaturas')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('plano_id', planoId)
      .in('status', ['pending', 'paused'])
      .maybeSingle();

    // ── 4. Validar cupom (se fornecido) ──
    let cupomValidado: Record<string, unknown> | null = null;
    let valorFinal = Number(plano.preco);
    let valorDescontado = 0;

    if (cupomId) {
      const hoje = new Date().toISOString().slice(0, 10);
      const { data: cupom } = await adminClient
        .from('cupons')
        .select('*')
        .eq('id', cupomId)
        .maybeSingle();

      if (!cupom) {
        return NextResponse.json({ error: 'Cupom não encontrado.' }, { status: 404 });
      }
      if (!cupom.ativo) {
        return NextResponse.json({ error: 'Este cupom não está mais ativo.' }, { status: 400 });
      }
      if (cupom.valido_a_partir && String(cupom.valido_a_partir).slice(0, 10) > hoje) {
        return NextResponse.json({ error: 'Este cupom ainda não é válido.' }, { status: 400 });
      }
      if (cupom.valido_ate && String(cupom.valido_ate).slice(0, 10) < hoje) {
        return NextResponse.json({ error: 'Este cupom expirou.' }, { status: 400 });
      }
      if (cupom.usos_maximos !== null && cupom.usos_atuais >= cupom.usos_maximos) {
        return NextResponse.json({ error: 'Este cupom já atingiu o limite de usos.' }, { status: 400 });
      }
      if (Array.isArray(cupom.planos_ids) && cupom.planos_ids.length > 0 && !cupom.planos_ids.includes(planoId)) {
        return NextResponse.json({ error: 'Este cupom não é válido para o plano selecionado.' }, { status: 400 });
      }

      const precoOriginal = Number(plano.preco);
      if (cupom.tipo_desconto === 'percentual') {
        valorDescontado = Math.round(precoOriginal * Number(cupom.valor_desconto) / 100 * 100) / 100;
      } else {
        valorDescontado = Math.min(Number(cupom.valor_desconto), precoOriginal);
      }
      valorFinal = Math.round(Math.max(0, precoOriginal - valorDescontado) * 100) / 100;
      cupomValidado = cupom as Record<string, unknown>;
    }

    // 5. Criar ou reusar assinatura local, depois criar Preference no MP
    let assinaturaId: string | null = null;

    if (assinaturaPendente) {
      // Reutilizar assinatura pendente existente
      assinaturaId = assinaturaPendente.id;
    } else {
      // Criar nova assinatura local
      const { data: newAssinatura, error: insertErr } = await adminClient
        .from('assinaturas')
        .insert({
          user_id: user.id,
          plano_id: planoId,
          status: 'pending',
          data_inicio: null,
          data_fim: null,
        })
        .select('id')
        .single();

      if (insertErr) {
        console.error('[POST /api/subscriptions/create] Erro ao criar assinatura:', insertErr);
        if (insertErr.code === '23505') {
          return NextResponse.json(
            { error: 'Você já possui uma assinatura ativa ou pendente.' },
            { status: 409 }
          );
        }
        return NextResponse.json({ error: 'Erro ao criar assinatura.' }, { status: 500 });
      }
      assinaturaId = newAssinatura.id;
    }

    // Defensive guard: assinaturaId is always set by the branch above; this
    // satisfies the createMpPreference contract without changing behavior.
    if (!assinaturaId) {
      return NextResponse.json({ error: 'Erro ao preparar assinatura.' }, { status: 500 });
    }

    // Criar Preference no MP (suporta PIX, cartão, boleto)
    const mpResult = await createMpPreference({
      planoId,
      userEmail: user.email || '',
      planoNome: plano.nome,
      planoPreco: valorFinal,
      assinaturaId: assinaturaId,
    });

    // 7. Registrar uso do cupom
    if (cupomValidado) {
      const { error: incErr } = await adminClient.rpc('incrementar_uso_cupom', {
        p_cupom_id: cupomValidado.id,
      });
      if (incErr) {
        console.error('[POST /api/subscriptions/create] Falha ao incrementar cupom:', incErr);
      }

      await adminClient.from('cupom_usos').insert({
        cupom_id: cupomValidado.id,
        user_id: user.id,
        assinatura_id: assinaturaId,
        plano_id: planoId,
        valor_original: Number(plano.preco),
        valor_descontado: valorDescontado,
        valor_final: valorFinal,
      });
    }

    const response: Record<string, unknown> = {
      checkoutUrl: mpResult.init_point,
    };

    if (cupomValidado) {
      response.desconto = {
        codigo: cupomValidado.codigo,
        valor_original: Number(plano.preco),
        valor_descontado: valorDescontado,
        valor_final: valorFinal,
      };
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error('[POST /api/subscriptions/create] Erro:', err);

    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('MERCADOPAGO_ACCESS_TOKEN')) {
      return NextResponse.json(
        { error: 'Integração com pagamento não configurada. Contate o administrador.' },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: 'Erro ao criar assinatura.' }, { status: 500 });
  }
}
