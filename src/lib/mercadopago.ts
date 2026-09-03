/**
 * Integração com Mercado Pago — Assinaturas e Pagamentos
 *
 * Utiliza o SDK oficial mercadopago v3+.
 * Toda comunicação com a API do MP acontece server-side apenas.
 */

import { MercadoPagoConfig, PreApproval, Payment, PreApprovalPlan, Preference } from 'mercadopago';

// ── Configuração ──────────────────────────────────────────────

const MP_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
const MP_WEBHOOK_SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET;

// back_url validado na inicializacao
// Resolver URL base do app — tentar múltiplas fontes
function resolveAppUrl(): string {
  // 1. Variável de ambiente explícita (pode ser server-side)
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.APP_URL) return process.env.APP_URL;
  // 2. Vercel fornece VERCEL_URL automaticamente
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return '';
}

const APP_URL = resolveAppUrl();
if (!APP_URL) {
  console.warn('[MP] Nenhuma URL base configurada (NEXT_PUBLIC_APP_URL, APP_URL ou VERCEL_URL). O back_url do Mercado Pago pode ficar invalido.');
} else {
  console.log('[MP] URL base configurada:', APP_URL);
}

function getBackUrl(path: string): string {
  if (!APP_URL) {
    throw new Error(
      'Nenhuma URL base configurada para o Mercado Pago. ' +
      'Defina NEXT_PUBLIC_APP_URL, APP_URL ou VERCEL_URL no painel da Vercel.'
    );
  }
  return `${APP_URL.replace(/\/$/, '')}${path}`;
}

let _client: PreApproval | null = null;
let _paymentClient: Payment | null = null;
let _planClient: PreApprovalPlan | null = null;
let _preferenceClient: Preference | null = null;

function getMpConfig(): MercadoPagoConfig {
  if (!MP_ACCESS_TOKEN) {
    throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurada nas variáveis de ambiente.');
  }
  return new MercadoPagoConfig({
    accessToken: MP_ACCESS_TOKEN,
    options: { timeout: 15000 },
  });
}

/**
 * Retorna o cliente de pré-aprovações (assinaturas) do Mercado Pago.
 * Singleton para reaproveitar a conexão.
 */
export function getPreApprovalClient(): PreApproval {
  if (!_client) {
    _client = new PreApproval(getMpConfig());
  }
  return _client;
}

/**
 * Retorna o cliente de pagamentos do Mercado Pago.
 */
export function getPaymentClient(): Payment {
  if (!_paymentClient) {
    _paymentClient = new Payment(getMpConfig());
  }
  return _paymentClient;
}

/**
 * Retorna o cliente de planos de pré-aprovação.
 */
export function getPreApprovalPlanClient(): PreApprovalPlan {
  if (!_planClient) {
    _planClient = new PreApprovalPlan(getMpConfig());
  }
  return _planClient;
}

/**
 * Retorna o cliente de preferências (Checkout Pro) do Mercado Pago.
 */
export function getPreferenceClient(): Preference {
  if (!_preferenceClient) {
    _preferenceClient = new Preference(getMpConfig());
  }
  return _preferenceClient;
}

/**
 * Retorna o segredo do webhook para verificação de assinatura.
 */
export function getWebhookSecret(): string {
  if (!MP_WEBHOOK_SECRET) {
    throw new Error('MERCADOPAGO_WEBHOOK_SECRET não configurada.');
  }
  return MP_WEBHOOK_SECRET;
}

// ── Tipos ─────────────────────────────────────────────────────

export interface PlanoDB {
  id: string;
  nome: string;
  descricao: string;
  periodo_meses: number;
  preco: number;
  features: string[];
  popular: boolean;
  maior_economia: boolean;
  ativo: boolean;
  ordem: number;
  mercadopago_plan_id: string | null;
}

export interface AssinaturaDB {
  id: string;
  user_id: string;
  plano_id: string;
  mercadopago_subscription_id: string | null;
  mercadopago_payer_id: string | null;
  status: 'pending' | 'active' | 'cancelled' | 'paused' | 'expired' | 'cancelled_by_user' | 'lifetime';
  metodo_pagamento: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  ultimo_pagamento_em: string | null;
  proximo_ciclo_em: string | null;
  cancelado_em: string | null;
  motivo_cancelamento: string;
  created_at: string;
  updated_at: string;
  // Join com plano
  plano?: PlanoDB;
}

export interface PagamentoDB {
  id: string;
  assinatura_id: string | null;
  user_id: string;
  mercadopago_payment_id: string | null;
  mercadopago_preapproval_id: string | null;
  valor: number;
  metodo_pagamento: string;
  status: 'pending' | 'approved' | 'rejected' | 'refunded' | 'cancelled' | 'in_process';
  data_pagamento: string | null;
  detalhes: Record<string, unknown>;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Verifica se o usuário possui assinatura ativa E dentro do período válido.
 */
export function isSubscriptionActive(assinatura: AssinaturaDB | null): boolean {
  if (!assinatura) return false;
  if (assinatura.status === 'lifetime') return true;
  if (assinatura.status !== 'active') return false;
  // Verificar data_fim
  if (assinatura.data_fim) {
    return new Date(assinatura.data_fim) > new Date();
  }
  // Sem data_fim (plano pré-migration) — considerar ativo
  return true;
}

/**
 * Retorna o status legível da assinatura em português.
 */
export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Pendente',
    active: 'Ativa',
    cancelled: 'Cancelada',
    paused: 'Pausada',
    expired: 'Expirada',
    cancelled_by_user: 'Cancelada pelo usuário',
    approved: 'Aprovado',
    rejected: 'Rejeitado',
    refunded: 'Estornado',
    in_process: 'Em processamento',
  };
  return labels[status] || status;
}

/**
 * Verifica a assinatura do webhook do Mercado Pago usando x-signature.
 * Ref: https://www.mercadopago.com.br/developers/pt/docs/webhooks/webhooks-management
 */
export async function verifyWebhookSignature(
  xSignature: string | null,
  body: string
): Promise<boolean> {
  if (!xSignature || !MP_WEBHOOK_SECRET) return false;

  try {
    const parts = xSignature.split(',');
    let ts = '';
    let v1 = '';

    for (const part of parts) {
      const [key, value] = part.split('=');
      if (key === 'ts') ts = value;
      if (key === 'v1') v1 = value;
    }

    if (!ts || !v1) return false;

    // Verificar se o timestamp está dentro de 5 minutos
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(ts, 10)) > 300) return false;

    // Gerar hash esperado
    const crypto = await import('crypto');
    const manifest = `id=${JSON.parse(body).data?.id};ts=${ts};`;
    const expectedHash = crypto
      .createHmac('sha256', MP_WEBHOOK_SECRET)
      .update(manifest)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(v1, 'hex'),
      Buffer.from(expectedHash, 'hex')
    );
  } catch {
    return false;
  }
}

// ── Operações com a API do Mercado Pago ──────────────────────

/**
 * Cria um plano de assinatura no Mercado Pago.
 * Retorna o ID do plano criado no MP.
 */
export async function createMpPlan(params: {
  planoId: string;
  nome: string;
  periodoMeses: number;
  preco: number;
}): Promise<string> {
  const client = getPreApprovalPlanClient();

  const backUrl = getBackUrl('/assinatura');
  if (!backUrl.startsWith('http')) {
    throw new Error(
      `NEXT_PUBLIC_APP_URL não configurada. Valor atual: "${process.env.NEXT_PUBLIC_APP_URL || '(vazio)'}". ` +
      `Defina esta variável no painel do Vercel (ex: https://seudominio.com).`
    );
  }

  try {
    const response = await client.create({
      body: {
        reason: params.nome,
        auto_recurring: {
          frequency: params.periodoMeses,
          frequency_type: 'months',
          transaction_amount: params.preco,
          currency_id: 'BRL',
        },
        payment_methods_allowed: {
          payment_types: [
            { id: 'credit_card' },
            { id: 'bank_transfer' },
          ],
          payment_methods: [
            { id: 'pix' },
          ],
        },
        back_url: backUrl,
        status: 'active',
      },
    });

    if (!response.id) {
      throw new Error('Mercado Pago não retornou ID do plano.');
    }

    console.log('[createMpPlan] Plano criado:', response.id, '| init_point:', (response as unknown as Record<string, unknown>).init_point || 'não retornado');
    return response.id;
  } catch (err: unknown) {
    // Capturar erro detalhado da API do Mercado Pago
    const mpErr = err as { message?: string; response?: { data?: { message?: string; error?: string; cause?: string[] }; status?: number } };
    const detail = mpErr?.response?.data?.message
      || mpErr?.response?.data?.error
      || (Array.isArray(mpErr?.response?.data?.cause) ? mpErr.response.data.cause.join('; ') : null)
      || mpErr?.message
      || 'Erro desconhecido';
    const status = mpErr?.response?.status;
    throw new Error(`Mercado Pago API (${status || 'sem status'}): ${detail}`);
  }
}

/**
 * Cria um plano temporário no Mercado Pago com preço customizado (cupom).
 * Retorna o ID do plano criado.
 *
 * O plano temporário tem o mesmo frequency do plano original, mas com
 * o valor descontado. Deve ser deletado após o webhook confirmar a assinatura.
 */
export async function createTempMpPlan(params: {
  nome: string;
  periodoMeses: number;
  preco: number;
}): Promise<{ id: string; init_point: string }> {
  const client = getPreApprovalPlanClient();

  const backUrl = getBackUrl('/assinatura');
  if (!backUrl.startsWith('http')) {
    throw new Error(
      `NEXT_PUBLIC_APP_URL não configurada. Valor atual: "${process.env.NEXT_PUBLIC_APP_URL || '(vazio)'}". ` +
      `Defina esta variável no painel do Vercel (ex: https://seudominio.com).`
    );
  }

  const timestamp = Date.now();
  const reason = `${params.nome} (Promo ${timestamp})`;

  try {
    const response = await client.create({
      body: {
        reason,
        auto_recurring: {
          frequency: params.periodoMeses,
          frequency_type: 'months',
          transaction_amount: params.preco,
          currency_id: 'BRL',
        },
        payment_methods_allowed: {
          payment_types: [
            { id: 'credit_card' },
            { id: 'bank_transfer' },
          ],
          payment_methods: [
            { id: 'pix' },
          ],
        },
        back_url: backUrl,
        status: 'active',
      },
    });

    if (!response.id) {
      throw new Error('Mercado Pago não retornou ID do plano temporário.');
    }

    const initPoint = (response as unknown as Record<string, unknown>).init_point as string | undefined;
    const pma = (response as unknown as Record<string, unknown>).payment_methods_allowed;
    console.log('[createTempMpPlan] Plano criado:', response.id, '| valor:', params.preco);
    console.log('[createTempMpPlan] init_point:', initPoint || 'NÃO RETORNADO');
    console.log('[createTempMpPlan] payment_methods_allowed (resposta MP):', JSON.stringify(pma));
    return { id: response.id, init_point: initPoint || '' };
  } catch (err: unknown) {
    const mpErr = err as {
      name?: string; status?: number; message?: string;
      causes?: Array<{ code?: string; description?: string }>;
    };
    const mpStatus = mpErr?.status;
    const mpMessage =
      (mpErr?.causes && mpErr.causes.length > 0
        ? mpErr.causes.map(c => c.description).filter(Boolean).join('; ')
        : '') ||
      mpErr?.message || 'Erro desconhecido';
    console.error('[createTempMpPlan] Falha:', { status: mpStatus, message: mpMessage });
    throw new Error(`Mercado Pago API (${mpStatus || 'sem status'}): ${mpMessage}`);
  }
}

/**
 * Deleta um plano no Mercado Pago.
 * Usado para limpar planos temporários criados para cupons.
 */
export async function deleteMpPlan(planId: string): Promise<void> {
  const client = getPreApprovalPlanClient();
  try {
    // MP SDK não tem método delete direto para planos.
    // Usamos update para inativar o plano.
    await client.update({
      id: planId,
      updatePreApprovalPlanRequest: { status: 'inactive' },
    });
    console.log('[deleteMpPlan] Plano inativado:', planId);
  } catch (err: unknown) {
    // Não falhar o fluxo principal se a limpeza falhar
    console.warn('[deleteMpPlan] Falha ao inativar plano temporário:', planId, err instanceof Error ? err.message : String(err));
  }
}

/**
 * Atualiza os métodos de pagamento de um plano existente no MP.
 * Usado para habilitar PIX em planos criados antes da correção.
 */
export async function updateMpPlanPaymentMethods(planId: string): Promise<void> {
  const client = getPreApprovalPlanClient();
  try {
    await client.update({
      id: planId,
      updatePreApprovalPlanRequest: {
        payment_methods_allowed: {
          payment_types: [
            { id: 'credit_card' },
            { id: 'bank_transfer' },
          ],
          payment_methods: [
            { id: 'pix' },
          ],
        },
      },
    });
    console.log('[updateMpPlanPaymentMethods] Plano atualizado com PIX:', planId);
  } catch (err: unknown) {
    console.warn('[updateMpPlanPaymentMethods] Falha ao atualizar plano:', planId, err instanceof Error ? err.message : String(err));
  }
}

/**
 * Cria uma assinatura (preapproval) no Mercado Pago.
 * Retorna a URL de init_point para redirecionar o usuário ao checkout.
 *
 * ESTRATÉGIA — cria uma pré-assinatura (PreApproval) via API para obter
 * um init_point que respeita os payment_methods_allowed do plano (incluindo PIX).
 *
 * - SEM cupom → usa o plano MP original.
 * - COM cupom → cria um plano temporário no MP com o preço descontado,
 *   o webhook inativa o plano temporário após a assinatura ser confirmada.
 */
export async function createMpSubscription(params: {
  /** ID do plano no banco (UUID) — usado como external_reference */
  planoId: string;
  userEmail: string;
  planoNome: string;
  /** Preço original do plano */
  planoPreco: number;
  /** Frequência do plano em meses */
  planoPeriodoMeses: number;
  /** Se informado, sobrescreve o valor (cupom) */
  customAmount?: number;
  /** ID do plano no Mercado Pago — obrigatório */
  mercadopagoPlanId: string;
}): Promise<{ init_point: string; subscription_id: string }> {
  const backUrl = getBackUrl('/assinatura');
  if (!backUrl.startsWith('http')) {
    throw new Error(
      `NEXT_PUBLIC_APP_URL não configurada. Valor atual: "${process.env.NEXT_PUBLIC_APP_URL || '(vazio)'}". ` +
      `Defina esta variável no painel do Vercel (ex: https://seudominio.com).`
    );
  }

  // ── Com cupom → criar plano temporário com preço descontado ──
  // Usar init_point do plano diretamente (evita segunda chamada API que pode falhar)
  if (params.customAmount && params.customAmount > 0) {
    console.log('[createMpSubscription] Cupom detectado. Criando plano temporário com valor:', params.customAmount, '(original:', params.planoPreco, ')');
    const tempPlan = await createTempMpPlan({
      nome: params.planoNome,
      periodoMeses: params.planoPeriodoMeses,
      preco: params.customAmount,
    });

    // O plano temporário já retorna init_point — usar diretamente
    let checkoutUrl = tempPlan.init_point;
    if (!checkoutUrl) {
      // Fallback: montar URL manual
      checkoutUrl = `https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=${tempPlan.id}`;
    }
    const url = new URL(checkoutUrl);
    url.searchParams.set('external_reference', params.planoId);
    if (params.userEmail) url.searchParams.set('payer_email', params.userEmail);

    console.log('[createMpSubscription] Checkout URL (plano temp):', url.toString().substring(0, 200));
    return {
      init_point: url.toString(),
      subscription_id: '', // será preenchido pelo webhook
    };
  }

  // ── Sem cupom → criar pré-assinatura (PreApproval) via API ──
  const preApprovalClient = getPreApprovalClient();

  const preApprovalBody: Record<string, unknown> = {
    preapproval_plan_id: params.mercadopagoPlanId,
    external_reference: params.planoId,
    back_url: backUrl,
    reason: params.planoNome,
  };
  if (params.userEmail) {
    preApprovalBody.payer_email = params.userEmail;
  }

  console.log('[createMpSubscription] Criando PreApproval com plano:', params.mercadopagoPlanId);

  try {
    const preApprovalResponse = await preApprovalClient.create({
      body: preApprovalBody,
    });

    const preApproval = preApprovalResponse as unknown as Record<string, unknown>;
    const initPoint = (preApproval.init_point as string) || '';
    const preApprovalId = String(preApproval.id || '');

    console.log('[createMpSubscription] PreApproval criada:', preApprovalId, '| init_point:', initPoint ? 'SIM' : 'NÃO');

    if (!initPoint) {
      // Fallback: montar URL manual se MP não retornar init_point
      console.warn('[createMpSubscription] MP não retornou init_point, usando URL manual');
      const url = new URL('https://www.mercadopago.com.br/subscriptions/checkout');
      url.searchParams.set('preapproval_plan_id', params.mercadopagoPlanId);
      url.searchParams.set('external_reference', params.planoId);
      if (params.userEmail) url.searchParams.set('payer_email', params.userEmail);
      return {
        init_point: url.toString(),
        subscription_id: preApprovalId,
      };
    }

    // Adicionar external_reference ao init_point se não estiver presente
    const url = new URL(initPoint);
    if (!url.searchParams.has('external_reference')) {
      url.searchParams.set('external_reference', params.planoId);
    }

    console.log('[createMpSubscription] Checkout URL:', url.toString().substring(0, 200));

    return {
      init_point: url.toString(),
      subscription_id: preApprovalId,
    };
  } catch (preApprovalErr: unknown) {
    // Se PreApproval falhar, montar URL manual com o plano original
    console.error('[createMpSubscription] Falha ao criar PreApproval, usando fallback:', preApprovalErr instanceof Error ? preApprovalErr.message : String(preApprovalErr));
    const url = new URL('https://www.mercadopago.com.br/subscriptions/checkout');
    url.searchParams.set('preapproval_plan_id', params.mercadopagoPlanId);
    url.searchParams.set('external_reference', params.planoId);
    if (params.userEmail) url.searchParams.set('payer_email', params.userEmail);
    return {
      init_point: url.toString(),
      subscription_id: '',
    };
  }
}

/**
 * Cria um Checkout Pro (Preference) no Mercado Pago.
 * Suporta PIX, cartão de crédito, boleto e outros métodos.
 * O webhook de payment confirma automaticamente a assinatura.
 *
 * Diferença de PreApproval: Preference é pagamento único (sem recorrência automática).
 * O período da assinatura é controlado pelo nosso banco de dados.
 */
export async function createMpPreference(params: {
  planoId: string;
  userEmail: string;
  planoNome: string;
  planoPreco: number;
  assinaturaId: string;
}): Promise<{ init_point: string; preference_id: string }> {
  const client = getPreferenceClient();
  const backUrl = getBackUrl('/assinatura?payment=return');

  try {
    const response = await client.create({
      body: {
        items: [
          {
            id: params.planoId,
            title: `Plano ${params.planoNome}`,
            unit_price: params.planoPreco,
            quantity: 1,
            currency_id: 'BRL',
          },
        ],
        payer: {
          email: params.userEmail,
        },
        back_urls: {
          success: backUrl,
          pending: backUrl,
          failure: backUrl,
        },
        auto_return: 'approved',
        external_reference: params.assinaturaId,
        metadata: {
 assinatura_id: params.assinaturaId,
          plano_id: params.planoId,
          tipo: 'assinatura_checkout',
        },
        payment_methods: {
          excluded_payment_types: [],
          installments: 12,
        },
      },
    });

    const pref = response as unknown as Record<string, unknown>;
    const initPoint = (pref.init_point as string) || '';
    const prefId = String(pref.id || '');

    console.log('[createMpPreference] Preference criada:', prefId, '| init_point:', initPoint ? 'SIM' : 'NÃO');

    if (!initPoint) {
      throw new Error('Mercado Pago não retornou init_point da preferência.');
    }

    return { init_point: initPoint, preference_id: prefId };
  } catch (err: unknown) {
    const mpErr = err as { message?: string; status?: number; causes?: Array<{ description?: string }> };
    const detail =
      (mpErr.causes?.map(c => c.description).filter(Boolean).join('; ')) ||
      mpErr.message ||
      'Erro desconhecido';
    console.error('[createMpPreference] Falha:', { status: mpErr.status, message: detail });
    throw new Error(`Mercado Pago Preference API (${mpErr.status || 'sem status'}): ${detail}`);
  }
}

/**
 * Cancela uma assinatura no Mercado Pago.
 */
export async function cancelMpSubscription(subscriptionId: string): Promise<void> {
  const client = getPreApprovalClient();
  await client.update({ id: subscriptionId, body: { status: 'cancelled' } });
}

/**
 * Busca detalhes de uma assinatura no Mercado Pago.
 */
export async function getMpSubscription(subscriptionId: string) {
  const client = getPreApprovalClient();
  return client.get({ id: subscriptionId });
}

/**
 * Busca detalhes de um pagamento no Mercado Pago.
 */
export async function getMpPayment(paymentId: string) {
  const client = getPaymentClient();
  return client.get({ id: paymentId });
}
