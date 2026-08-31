/**
 * api-auth.ts
 *
 * Helpers compartilhados para autenticação e autorização em API routes.
 * Evita duplicação de chamadas de autenticação.
 */

import { createClient } from '@/lib/supabase/server';
import { requireActiveSubscription, subscriptionDeniedResponse } from '@/lib/subscription-guard';
import { coordenadorHasAccess, isCoordenadorWithAnyEmpreendimento } from '@/lib/coordinator-access';
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

/**
 * Verifica se o usuário pode ESCREVER em unidades.
 * Admin_sistema sempre pode.
 * Coordenador pode se tiver pelo menos um empreendimento atribuído.
 *
 * Usado para tabelas de unidades hardcoded (villa_bianco_units, vitta_units, etc.)
 * que não têm coluna empreendimento_id para isolamento granular.
 */
export async function requireCoordinatorOrAdminWriteAccess(): Promise<NextResponse | null> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Nao autenticado.' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const role = (profile as Record<string, unknown> | null)?.role as string | undefined;

  if (role === 'admin_sistema') {
    return null;
  }

  if (role === 'coordenador') {
    const hasAny = await isCoordenadorWithAnyEmpreendimento(user.id);
    if (hasAny) return null;
  }

  return NextResponse.json({ error: 'Nao autorizado.' }, { status: 403 });
}

/**
 * Verifica se o usuário pode ESCREVER em unidades de um empreendimento específico.
 * Admin_sistema sempre pode. Coordenadores precisam ter o empreendimento atribuído.
 * O empreendimentoId pode ser um slug ('villa-bianco') ou UUID.
 *
 * Usado para tabelas dinâmicas (projeto_units) que têm coluna empreendimento_id.
 */
export async function requireWriteAccessForEmpreendimento(empreendimentoId: string): Promise<NextResponse | null> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Nao autenticado.' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const role = (profile as Record<string, unknown> | null)?.role as string | undefined;

  // Admin sempre pode
  if (role === 'admin_sistema') {
    return null;
  }

  // Coordenador: verificar se tem o empreendimento atribuído
  if (role === 'coordenador') {
    const hasAccess = await coordenadorHasAccess(user.id, empreendimentoId);
    if (hasAccess) return null;
  }

  return NextResponse.json({ error: 'Nao autorizado.' }, { status: 403 });
}
