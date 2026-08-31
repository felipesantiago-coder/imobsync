/**
 * api-auth.ts
 *
 * Helpers compartilhados para autenticação e autorização em API routes.
 * Evita duplicação de chamadas de autenticação.
 */

import { createClient } from '@/lib/supabase/server';
import { requireActiveSubscription, subscriptionDeniedResponse } from '@/lib/subscription-guard';
import { NextResponse } from 'next/server';


/**
 * Verifica se o usuário pode LER dados protegidos.
 * Admin sempre pode. Usuários normais precisam de assinatura ativa.
 *
 * Usa requireActiveSubscription() internamente (que já verifica admin),
 * evitando chamadas duplicadas de autenticação.
 */
export async function requireReadAccess(): Promise<NextResponse | null> {
  const guard = await requireActiveSubscription();
  if (!guard.valid) {
    return subscriptionDeniedResponse(guard);
  }
  return null;
}

/**
 * Verifica se o usuário é admin para operações de ESCRITA.
 * Retorna null se autorizado, ou uma resposta de erro.
 */
export async function requireWriteAccess(): Promise<NextResponse | null> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Nao autenticado.' }, { status: 401 });
  }

  // Verificar role do perfil
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if ((profile as Record<string, unknown> | null)?.role === 'admin_sistema') {
    return null;
  }

  return NextResponse.json({ error: 'Nao autorizado.' }, { status: 403 });
}
