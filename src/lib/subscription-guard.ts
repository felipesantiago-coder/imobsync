/**
 * subscription-guard.ts
 *
 * Camada centralizada de validação de assinatura.
 * Todas as APIs protegidas devem usar `requireActiveSubscription()` para
 * garantir que o usuário tem acesso válido (não apenas status=active, mas
 * também dentro do período contratado).
 *
 * Design:
 *  - Usa Supabase Admin Client (bypass RLS) para query direta ao banco
 *  - Compara data_fim com now() para detectar assinaturas vencidas
 *  - Atualiza automaticamente o banco quando encontra uma assinatura vencida
 *    (lazy expiration — funciona mesmo sem o cron)
 *  - Retorna o userId e info da assinatura para uso pela API
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export interface SubscriptionGuardResult {
  valid: true;
  userId: string;
  userEmail: string | null;
  assinaturaId: string;
  status: string;
  isAdmin: boolean;
}

export interface SubscriptionGuardDenied {
  valid: false;
  reason: 'unauthenticated' | 'no_subscription' | 'subscription_expired' | 'subscription_inactive';
  userId?: string;
}

type SubscriptionGuardResponse = SubscriptionGuardResult | SubscriptionGuardDenied;

/**
 * Verifica se o usuário autenticado possui assinatura ativa E dentro do período válido.
 * Atualiza automaticamente assinaturas vencidas (lazy expiration).
 *
 * Uso típico em API routes:
 * ```ts
 * const guard = await requireActiveSubscription();
 * if (!guard.valid) {
 *   return NextResponse.json({ error: 'Sem acesso.' }, { status: guard.reason === 'unauthenticated' ? 401 : 403 });
 * }
 * // guard.userId, guard.assinaturaId disponíveis
 * ```
 */
export async function requireActiveSubscription(): Promise<SubscriptionGuardResponse> {
  // 1. Verificar autenticação
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { valid: false, reason: 'unauthenticated' };
  }

  // 2. Verificar se é admin — admins sempre têm acesso
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const userRole = (profile as Record<string, unknown> | null)?.role as string | null;
  const isAdmin = userRole === 'admin_sistema' || userRole === 'coordenador';

  if (isAdmin) {
    return {
      valid: true,
      userId: user.id,
      userEmail: user.email ?? null,
      assinaturaId: '',
      status: 'admin',
      isAdmin: true,
    };
  }

  // 3. Buscar assinatura mais recente do usuário
  const admin = createAdminClient();
  const { data: assinatura, error: assErr } = await admin
    .from('assinaturas')
    .select('id, status, data_fim, user_id')
    .eq('user_id', user.id)
    .in('status', ['active', 'lifetime'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (assErr || !assinatura) {
    return { valid: false, reason: 'no_subscription', userId: user.id };
  }

  // 4. Verificar validade temporal
  //    - lifetime: nunca expira
  //    - active: precisa de data_fim > now() ou data_fim = null (plano pré-migration)
  if (assinatura.status === 'lifetime') {
    return {
      valid: true,
      userId: user.id,
      userEmail: user.email ?? null,
      assinaturaId: assinatura.id,
      status: 'lifetime',
      isAdmin: false,
    };
  }

  // Assinatura active — verificar data_fim
  if (assinatura.data_fim) {
    const agora = new Date();
    const fim = new Date(assinatura.data_fim);

    if (fim <= agora) {
      // Assinatura vencida! Expirar lazy (em background)
      expireSubscriptionLazy(admin, assinatura.id, user.id).catch((err) => {
        console.error(`[subscription-guard] Erro ao expirar assinatura ${assinatura.id}:`, err);
      });

      return { valid: false, reason: 'subscription_expired', userId: user.id };
    }
  }

  // Assinatura ativa e dentro do período
  return {
    valid: true,
    userId: user.id,
    userEmail: user.email ?? null,
    assinaturaId: assinatura.id,
    status: 'active',
    isAdmin: false,
  };
}

/**
 * Verifica o status de assinatura de um usuário (sem bloquear).
 * Retorna o status real, verificando data_fim quando necessário.
 * Usado por endpoints que precisam do status mas não bloqueiam o acesso.
 */
export async function getRealSubscriptionStatus(userId: string): Promise<{
  status: string;
  assinaturaId: string | null;
  dataFim: string | null;
  isExpired: boolean;
}> {
  const admin = createAdminClient();

  const { data: assinatura } = await admin
    .from('assinaturas')
    .select('id, status, data_fim')
    .eq('user_id', userId)
    .in('status', ['active', 'lifetime'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!assinatura) {
    return { status: 'none', assinaturaId: null, dataFim: null, isExpired: false };
  }

  if (assinatura.status === 'lifetime') {
    return { status: 'lifetime', assinaturaId: assinatura.id, dataFim: null, isExpired: false };
  }

  // Verificar data_fim
  if (assinatura.data_fim) {
    const isExpired = new Date(assinatura.data_fim) <= new Date();
    return {
      status: isExpired ? 'expired' : 'active',
      assinaturaId: assinatura.id,
      dataFim: assinatura.data_fim,
      isExpired,
    };
  }

  return { status: 'active', assinaturaId: assinatura.id, dataFim: null, isExpired: false };
}

/**
 * Expira uma assinatura vencida (lazy expiration).
 * Atualiza a assinatura E o perfil do usuário.
 */
async function expireSubscriptionLazy(
  admin: ReturnType<typeof createAdminClient>,
  assinaturaId: string,
  userId: string
): Promise<void> {
  const agora = new Date().toISOString();
  const auditoria = `Expirada automaticamente (lazy expiration) em ${agora}. Periodo contratado encerrado.`;

  // Atualizar assinatura com CAS (só se ainda está active)
  const { count, error: assErr } = await admin
    .from('assinaturas')
    .update({
      status: 'expired',
      motivo_cancelamento: auditoria,
      proximo_ciclo_em: null,
      updated_at: agora,
    })
    .eq('id', assinaturaId)
    .eq('status', 'active');

  if (assErr) {
    console.error(`[lazy-expire] Erro ao atualizar assinatura ${assinaturaId}:`, assErr);
    return;
  }

  if (count === 0) {
    // Já foi atualizada por outro processo (cron, webhook, etc.)
    return;
  }

  // Atualizar perfil
  const { error: profileErr } = await admin
    .from('profiles')
    .update({ subscription_status: 'none' })
    .eq('id', userId);

  if (profileErr) {
    console.error(`[lazy-expire] Erro ao atualizar perfil ${userId}:`, profileErr);
  }

  console.log(`[lazy-expire] Assinatura ${assinaturaId} do usuario ${userId} expirada com sucesso.`);
}

/**
 * Helper: cria resposta de erro padronizada para APIs protegidas.
 */
export function subscriptionDeniedResponse(guard: SubscriptionGuardDenied): NextResponse {
  switch (guard.reason) {
    case 'unauthenticated':
      return NextResponse.json({ error: 'Nao autenticado.' }, { status: 401 });
    case 'no_subscription':
      return NextResponse.json({ error: 'Nenhuma assinatura ativa encontrada.' }, { status: 403 });
    case 'subscription_expired':
      return NextResponse.json(
        { error: 'Sua assinatura expirou. Renove seu plano para continuar acessando.', code: 'SUBSCRIPTION_EXPIRED' },
        { status: 403 }
      );
    case 'subscription_inactive':
      return NextResponse.json({ error: 'Sua assinatura nao esta ativa.' }, { status: 403 });
    default:
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }
}
