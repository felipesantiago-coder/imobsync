import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * GET /api/cupons/validate?codigo=XXX&planoId=YYY
 * Valida um cupom de desconto para um plano específico.
 * Retorna dados do cupom e valores calculados se válido.
 *
 * Não incrementa usos_atuais — isso é feito no momento da criação da assinatura.
 *
 * SEC-007 FIX: Rate limiting — 10 validações por IP por minuto.
 */
export async function GET(request: NextRequest) {
  // SEC-007 FIX: Rate limiting para evitar enumeração de cupons
  const ip = getClientIp(request);
  const rl = rateLimit(`cupom_validate:${ip}`, { maxRequests: 10, windowSeconds: 60 });

  if (!rl.success) {
    return NextResponse.json(
      { valid: false, error: 'Muitas tentativas. Aguarde um momento.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  try {
    const { searchParams } = request.nextUrl;
    const codigo = searchParams.get('codigo')?.trim();
    const planoId = searchParams.get('planoId')?.trim();

    if (!codigo || !planoId) {
      return NextResponse.json(
        { valid: false, error: 'Código do cupom e ID do plano são obrigatórios.' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const hoje = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD" para comparação correta

    // Buscar cupom pelo código (case-insensitive via index)
    // Somente as colunas consumidas abaixo (audit: trocar select(*) por campos)
    const { data: cupom, error: cupomErr } = await supabase
      .from('cupons')
      .select('id, codigo, ativo, tipo_desconto, valor_desconto, planos_ids, usos_maximos, usos_atuais, valido_a_partir, valido_ate')
      .ilike('codigo', codigo)
      .maybeSingle();

    if (cupomErr || !cupom) {
      return NextResponse.json({ valid: false, error: 'Cupom não encontrado.' });
    }

    // Verificações de validade
    if (!cupom.ativo) {
      return NextResponse.json({ valid: false, error: 'Este cupom não está mais ativo.' });
    }

    // Comparar apenas a parte da data (YYYY-MM-DD) para evitar bug de comparação de strings
    // onde "2026-08-22" < "2026-08-22T03:25:00Z" = true incorretamente no JS
    if (cupom.valido_a_partir && String(cupom.valido_a_partir).slice(0, 10) > hoje) {
      return NextResponse.json({ valid: false, error: 'Este cupom ainda não é válido.' });
    }

    if (cupom.valido_ate && String(cupom.valido_ate).slice(0, 10) < hoje) {
      return NextResponse.json({ valid: false, error: 'Este cupom expirou.' });
    }

    if (cupom.usos_maximos !== null && cupom.usos_atuais >= cupom.usos_maximos) {
      return NextResponse.json({ valid: false, error: 'Este cupom já atingiu o limite de usos.' });
    }

    // Verificar se o cupom vale para este plano
    if (cupom.planos_ids && Array.isArray(cupom.planos_ids) && cupom.planos_ids.length > 0) {
      if (!(cupom.planos_ids as string[]).includes(planoId)) {
        return NextResponse.json({ valid: false, error: 'Este cupom não é válido para o plano selecionado.' });
      }
    }

    // Buscar preço do plano
    const { data: plano } = await supabase
      .from('planos')
      .select('id, nome, preco')
      .eq('id', planoId)
      .maybeSingle();

    if (!plano) {
      return NextResponse.json({ valid: false, error: 'Plano não encontrado.' });
    }

    // Calcular desconto
    const precoOriginal = Number(plano.preco);
    let valorDescontado: number;
    let valorFinal: number;

    if (cupom.tipo_desconto === 'percentual') {
      valorDescontado = Math.round(precoOriginal * Number(cupom.valor_desconto) / 100 * 100) / 100;
    } else {
      valorDescontado = Math.round(Math.min(Number(cupom.valor_desconto), precoOriginal) * 100) / 100;
    }
    valorFinal = Math.round(Math.max(0, precoOriginal - valorDescontado) * 100) / 100;

    return NextResponse.json({
      valid: true,
      cupom: {
        id: cupom.id,
        codigo: cupom.codigo,
        tipo_desconto: cupom.tipo_desconto,
        valor_desconto: Number(cupom.valor_desconto),
        usos_restantes: cupom.usos_maximos !== null ? cupom.usos_maximos - cupom.usos_atuais : null,
      },
      plano: {
        id: plano.id,
        nome: plano.nome,
      },
      calculo: {
        valor_original: precoOriginal,
        valor_descontado: valorDescontado,
        valor_final: valorFinal,
      },
    });
  } catch (err) {
    console.error('[GET /api/cupons/validate] Erro:', err);
    return NextResponse.json({ valid: false, error: 'Erro interno.' }, { status: 500 });
  }
}
