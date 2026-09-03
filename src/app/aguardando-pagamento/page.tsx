export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AguardandoPagamentoClient from './AguardandoPagamentoClient';

export default async function AguardandoPagamentoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/');

  // Verificar se ja tem assinatura ativa
  const { data: assinaturaAtiva } = await supabase
    .from('assinaturas')
    .select('id, status, plano:planos(nome)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  // Se ja esta ativo, redirecionar para projetos
  if (assinaturaAtiva) redirect('/projetos');

  // Buscar assinatura pendente para mostrar info
  // PostgREST returns many-to-one embeds as an object; supabase-js without
  // generated DB types infers an array, so we assert the real shape at the boundary.
  const { data: assinaturaPendenteRaw } = await supabase
    .from('assinaturas')
    .select('id, status, created_at, plano:planos(nome, preco)')
    .eq('user_id', user.id)
    .in('status', ['pending', 'paused'])
    .maybeSingle();

  const assinaturaPendente = assinaturaPendenteRaw as unknown as {
    id: string;
    status: string;
    created_at: string;
    plano: { nome: string; preco: number } | null;
  } | null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, email')
    .eq('id', user.id)
    .maybeSingle();

  return (
    <AguardandoPagamentoClient
      userName={profile?.display_name || user.email || ''}
      userEmail={user.email || ''}
      assinaturaPendente={assinaturaPendente}
    />
  );
}
