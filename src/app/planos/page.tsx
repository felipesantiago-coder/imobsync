export const revalidate = 300; // Revalidar a cada 5 minutos (planos mudam raramente)

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import PlanosPublicClient from './PlanosPublicClient';
import PlanosAuthClient from '../planos-auth/PlanosClient';
import type { PlanoDB } from '@/lib/mercadopago';

export default async function PlanosPage() {
  let user: { id: string; email: string | null } | null = null;
  let profile: Record<string, unknown> | null = null;
  let assinaturaAtiva: Record<string, unknown> | null = null;

  // Tentar detectar usuário logado
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    // GoTrue types email as string | undefined; the local contract uses null.
    user = data.user ? { id: data.user.id, email: data.user.email ?? null } : null;

    if (user) {
      const { data: p } = await supabase
        .from('profiles')
        .select('display_name, role, subscription_status')
        .eq('id', user.id)
        .maybeSingle();
      profile = p as Record<string, unknown> | null;

      const { data: a } = await supabase
        .from('assinaturas')
        .select('id, status, plano:planos(id, nome)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();
      assinaturaAtiva = a as Record<string, unknown> | null;
    }
  } catch {
    // Env vars não configuradas — mostrar versão pública
  }

  // Buscar planos SEMPRE via admin client
  let planos: PlanoDB[] = [];
  try {
    const adminClient = createAdminClient();
    const { data: planosData } = await adminClient
      .from('planos')
      .select('*')
      .eq('ativo', true)
      .order('ordem', { ascending: true });

    planos = (planosData || []).map((p) => ({
      ...p,
      features: Array.isArray(p.features) ? p.features : [],
    }));
  } catch {
    // Admin client também pode falhar sem env vars
  }

  if (user) {
    const isAdmin = profile?.role === 'admin_sistema';
    return (
      <PlanosAuthClient
        userEmail={user.email || ''}
        userName={(profile?.display_name as string) || user.email || ''}
        isAdmin={isAdmin}
        planos={planos}
        assinaturaAtiva={assinaturaAtiva as { id: string; status: string; plano: { id: string; nome: string } } | null}
      />
    );
  }

  return <PlanosPublicClient planos={planos} />;
}
