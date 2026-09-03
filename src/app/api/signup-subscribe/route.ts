import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createMpPreference } from '@/lib/mercadopago';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

// Forçar dinâmico — evitar cache edge que possa servir código antigo
export const dynamic = 'force-dynamic';

// Regex para validação de UUID v4
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Regex para validação básica de senha (min 8 chars, 1 maiúscula, 1 número)
const PASSWORD_RE = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

interface SignupSubscribeBody {
  nome: string;
  email: string;
  senha: string;
  planoId: string;
  cupomId?: string;
}

/**
 * POST /api/signup-subscribe
 *
 * Fluxo: Cria conta + assinatura pendente em uma única operação.
 * Usa MP Checkout Pro (Preference API) que suporta PIX, cartão e boleto.
 * O webhook de payment confirma automaticamente a assinatura.
 */
export async function POST(request: NextRequest) {
  console.error('[signup-subscribe] INICIO handler - deployment pix-preference');

  // SEC-007 FIX: Rate limiting
  const ip = getClientIp(request);
  const rl = rateLimit(`signup_subscribe:${ip}`, { maxRequests: 5, windowSeconds: 60 });

  if (!rl.success) {
    return NextResponse.json(
      { error: 'Muitas tentativas de cadastro. Aguarde um momento.' },
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
    // 0. Verificar se MP está configurado
    if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
      return NextResponse.json(
        { error: 'Integração com pagamento não configurada. Contate o administrador.' },
        { status: 503 }
      );
    }

    // 1. Parse e validação do body
    const body = await request.json();
    const { nome, email, senha, planoId, cupomId } = body as SignupSubscribeBody;

    console.error('[signup-subscribe] Body recebido:', JSON.stringify({ nome, email, planoId, cupomId: cupomId || 'nenhum' }));

    // Validar nome
    const nomeTrimmed = (nome || '').trim();
    if (!nomeTrimmed || nomeTrimmed.length < 2) {
      return NextResponse.json({ error: 'Nome deve ter pelo menos 2 caracteres.' }, { status: 400 });
    }

    // Validar email
    const emailTrimmed = (email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailTrimmed)) {
      return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 });
    }

    // Validar senha
    if (!senha || !PASSWORD_RE.test(senha)) {
      return NextResponse.json(
        { error: 'Senha deve ter pelo menos 8 caracteres, incluindo 1 letra maiúscula e 1 número.' },
        { status: 400 }
      );
    }

    // Validar planoId
    if (!planoId || !UUID_RE.test(planoId)) {
      return NextResponse.json({ error: 'Plano inválido.' }, { status: 400 });
    }

    // 2. Buscar o plano
    const adminClient = createAdminClient();

    // Somente as colunas consumidas abaixo (audit: trocar select(*) por campos)
    const { data: plano, error: planoErr } = await adminClient
      .from('planos')
      .select('id, nome, preco, periodo_meses')
      .eq('id', planoId)
      .eq('ativo', true)
      .single();

    if (planoErr || !plano) {
      console.error('[signup-subscribe] Plano não encontrado:', planoId, planoErr);
      return NextResponse.json({ error: 'Plano não encontrado.' }, { status: 404 });
    }

    console.error('[signup-subscribe] Plano:', plano.nome, '| preço:', plano.preco);

    // 3. Criar usuário no Supabase Auth
    const supabaseAdmin = createAdminClient();

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: emailTrimmed,
      password: senha,
      email_confirm: true,
      user_metadata: {
        display_name: nomeTrimmed,
        signup_via: 'plan_checkout',
      },
    });

    if (authError || !authData.user) {
      console.error('[signup-subscribe] Erro ao criar usuário:', authError);
      if (authError?.message?.includes('already') || authError?.message?.includes('registered')) {
        return NextResponse.json(
          { error: 'Este e-mail já está cadastrado. Faça login para assinar um plano.' },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: 'Erro ao criar conta. Verifique seus dados e tente novamente.' },
        { status: 400 }
      );
    }

    const userId = authData.user.id;
    console.error('[signup-subscribe] User criado:', userId);

    const debugInfo: Record<string, unknown> = {
      cupomIdRecebido: cupomId || null,
      planoNome: plano.nome,
      planoPreco: Number(plano.preco),
    };

    try {
      // 4. Atualizar perfil
      const { count: updatedCount, error: updateProfileErr } = await adminClient
        .from('profiles')
        .update({
          email: emailTrimmed,
          display_name: nomeTrimmed,
          subscription_status: 'pending',
        })
        .eq('id', userId);

      if (updateProfileErr) {
        console.error('[signup-subscribe] Erro UPDATE perfil:', updateProfileErr);
      }

      if (!updateProfileErr && updatedCount === 0) {
        console.error('[signup-subscribe] Perfil não encontrado via trigger, fazendo INSERT manual');
        const { error: insertProfileErr } = await adminClient
          .from('profiles')
          .insert({
            id: userId,
            email: emailTrimmed,
            display_name: nomeTrimmed,
            role: 'comum',
            subscription_status: 'pending',
          });
        if (insertProfileErr) {
          console.error('[signup-subscribe] Erro INSERT perfil:', insertProfileErr);
        }
      }

      // 5. Verificar assinatura existente
      const { data: existingSub } = await adminClient
        .from('assinaturas')
        .select('id')
        .eq('user_id', userId)
        .in('status', ['active', 'pending'])
        .maybeSingle();

      if (existingSub) {
        return NextResponse.json(
          { error: 'Já existe uma assinatura para este usuário.' },
          { status: 409 }
        );
      }

      // 6. Validar cupom (se fornecido)
      let cupomValidado: Record<string, unknown> | null = null;
      let valorFinal = Number(plano.preco);
      let valorDescontado = 0;

      if (cupomId) {
        console.error('[signup-subscribe] Validando cupom:', cupomId);
        const hoje = new Date().toISOString().slice(0, 10);
        const { data: cupom, error: cupomErr } = await adminClient
          .from('cupons')
          .select('id, codigo, ativo, tipo_desconto, valor_desconto, planos_ids, usos_maximos, usos_atuais, valido_a_partir, valido_ate')
          .eq('id', cupomId)
          .maybeSingle();

        if (cupomErr) {
          console.error('[signup-subscribe] Erro DB ao buscar cupom:', cupomErr);
        }

        if (!cupom) {
          console.error('[signup-subscribe] Cupom NÃO encontrado no DB:', cupomId);
          debugInfo.cupomErro = 'nao_encontrado';
          return NextResponse.json({ error: 'Cupom não encontrado.' }, { status: 404 });
        }
        if (!cupom.ativo) {
          debugInfo.cupomErro = 'inativo';
          return NextResponse.json({ error: 'Cupom inativo.' }, { status: 400 });
        }
        if (cupom.valido_a_partir && String(cupom.valido_a_partir).slice(0, 10) > hoje) {
          debugInfo.cupomErro = 'nao_valido_ainda';
          return NextResponse.json({ error: 'Cupom ainda não é válido.' }, { status: 400 });
        }
        if (cupom.valido_ate && String(cupom.valido_ate).slice(0, 10) < hoje) {
          debugInfo.cupomErro = 'expirado';
          return NextResponse.json({ error: 'Cupom expirou.' }, { status: 400 });
        }
        if (cupom.usos_maximos !== null && cupom.usos_atuais >= cupom.usos_maximos) {
          debugInfo.cupomErro = 'esgotado';
          return NextResponse.json({ error: 'Cupom esgotado.' }, { status: 400 });
        }
        if (Array.isArray(cupom.planos_ids) && cupom.planos_ids.length > 0 && !cupom.planos_ids.includes(planoId)) {
          debugInfo.cupomErro = 'plano_incompativel';
          return NextResponse.json({ error: 'Cupom não válido para este plano.' }, { status: 400 });
        }

        const precoOriginal = Number(plano.preco);
        if (cupom.tipo_desconto === 'percentual') {
          valorDescontado = Math.round(precoOriginal * Number(cupom.valor_desconto) / 100 * 100) / 100;
        } else {
          valorDescontado = Math.min(Number(cupom.valor_desconto), precoOriginal);
        }
        valorFinal = Math.round(Math.max(0, precoOriginal - valorDescontado) * 100) / 100;
        cupomValidado = cupom as Record<string, unknown>;

        debugInfo.cupomCodigo = cupom.codigo;
        debugInfo.cupomTipo = cupom.tipo_desconto;
        debugInfo.cupomValorDesconto = Number(cupom.valor_desconto);
        debugInfo.valorDescontado = valorDescontado;
        debugInfo.valorFinal = valorFinal;

        console.error('[signup-subscribe] Cupom VÁLIDO:', cupom.codigo, '| desconto:', valorDescontado, '| final:', valorFinal);
      } else {
        console.error('[signup-subscribe] NENHUM cupom — preço original:', valorFinal);
      }

      // 7. Registrar assinatura local ANTES do MP (precisamos do ID para external_reference)
      const { data: insertedSub, error: insertSubErr } = await adminClient
        .from('assinaturas')
        .insert({
          user_id: userId,
          plano_id: planoId,
          status: 'pending',
          data_inicio: null,
          data_fim: null,
        })
        .select('id')
        .single();

      if (insertSubErr || !insertedSub) {
        console.error('[signup-subscribe] Erro ao registrar assinatura local:', insertSubErr);
        throw new Error('Erro ao registrar assinatura. Tente novamente.');
      }

      const assinaturaId = insertedSub.id;
      console.error('[signup-subscribe] Assinatura local criada:', assinaturaId);

      // 8. Criar pagamento via MP Checkout Pro (Preference) — suporta PIX, cartão, boleto
      console.error('[signup-subscribe] Criando Preference MP | valor:', valorFinal, '| assinatura:', assinaturaId);

      let checkoutUrl: string;
      try {
        const mpResult = await createMpPreference({
          planoId: planoId,
          userEmail: emailTrimmed,
          planoNome: plano.nome,
          planoPreco: valorFinal,
          assinaturaId: assinaturaId,
        });
        checkoutUrl = mpResult.init_point;
        console.error('[signup-subscribe] Preference OK | URL:', checkoutUrl.substring(0, 200));
        debugInfo.mpInitPoint = checkoutUrl.substring(0, 200);
        debugInfo.preferenceId = mpResult.preference_id;
      } catch (mpErr: unknown) {
        console.error('[signup-subscribe] FALHA MP:', mpErr);
        debugInfo.mpErro = mpErr instanceof Error ? mpErr.message : String(mpErr);
        throw mpErr;
      }

      // 9. Registrar uso do cupom
      if (cupomValidado) {
        const { error: incErr } = await adminClient.rpc('incrementar_uso_cupom', {
          p_cupom_id: cupomValidado.id,
        });
        if (incErr) {
          console.error('[signup-subscribe] Falha ao incrementar cupom:', incErr);
        }

        await adminClient.from('cupom_usos').insert({
          cupom_id: cupomValidado.id,
          user_id: userId,
          assinatura_id: assinaturaId,
          plano_id: planoId,
          valor_original: Number(plano.preco),
          valor_descontado: valorDescontado,
          valor_final: valorFinal,
        });
      }

      // 10. Retornar URL de checkout
      console.error('[signup-subscribe] SUCESSO | cupom:', !!cupomValidado, '| valor:', valorFinal);
      return NextResponse.json({
        checkoutUrl,
        email: emailTrimmed,
        needsLogin: true,
        message: 'Conta criada com sucesso! Redirecionando para o pagamento...',
        _debug: debugInfo,
      });

    } catch (innerErr: unknown) {
      const errMsg = innerErr instanceof Error ? innerErr.message : String(innerErr);
      console.error('[signup-subscribe] Erro pós-criação:', errMsg);

      // Limpar usuário criado se algo falhou após
      try {
        await adminClient.auth.admin.deleteUser(userId);
      } catch {
        // Ignore cleanup errors
      }

      let userMessage = 'Erro ao processar assinatura. Tente novamente.';
      let statusCode = 500;

      if (errMsg.includes('Mercado Pago Preference API') || errMsg.includes('Mercado Pago API')) {
        if (errMsg.includes('401') || errMsg.includes('unauthorized')) {
          userMessage = 'Erro na integração com o pagamento. Contate o administrador.';
          statusCode = 503;
        } else if (errMsg.includes('404')) {
          userMessage = 'Plano não encontrado no Mercado Pago. Contate o administrador.';
          statusCode = 503;
        } else {
          userMessage = 'Erro ao conectar com o Mercado Pago. Tente novamente em alguns minutos.';
          statusCode = 502;
        }
      }

      return NextResponse.json({ error: userMessage, _debug: debugInfo }, { status: statusCode });
    }
  } catch (err) {
    console.error('[POST /api/signup-subscribe] Erro:', err);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}
