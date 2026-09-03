import { NextResponse } from 'next/server';  import { createClient } from '@/lib/supabase/server';  import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/subscription-check
 * Verifica se o usuário logado tem assinatura ativa E dentro do período válido.
 * Usado pela página /aguardando-pagamento para poll.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    // Verificar assinatura ativa ou vitalícia, INCLUINDO verificação de data_fim
    const admin = createAdminClient();
    const { data: assinatura } = await admin
      .from('assinaturas')
      .select('id, status, data_fim, plano:planos(nome)')
      .eq('user_id', user.id)
      .in('status', ['active', 'lifetime'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Verificar perfil
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_status, display_name')
      .eq('id', user.id)
      .maybeSingle();

    if (assinatura) {
      // Verificar se a assinatura está dentro do período
      const isExpired = assinatura.status !== 'lifetime' &&
        assinatura.data_fim &&
        new Date(assinatura.data_fim) <= new Date();

      if (isExpired) {
        // Assinatura vencida — não considerar ativa
        return NextResponse.json({
          authenticated: true,
          subscriptionActive: false,
          subscriptionExpired: true,
          profile: {
            displayName: profile?.display_name || '',
            subscriptionStatus: profile?.subscription_status || 'none',
          },
        });
      }

      const response = NextResponse.json({
        authenticated: true,
        subscriptionActive: true,
        subscription: {
          id: assinatura.id,
          status: assinatura.status,
          planoNome: (assinatura.plano as unknown as Record<string, unknown>)?.nome || 'Plano',
        },
        profile: {
          displayName: profile?.display_name || '',
          subscriptionStatus: profile?.subscription_status || 'none',
        },
      });

      response.cookies.set('subscription_status', 'active', {
        path: '/',
        maxAge: 300,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });

      return response;
    }

    // Verificar se há assinatura pendente
    const { data: pendingSub } = await supabase
      .from('assinaturas')
      .select('id, status')
      .eq('user_id', user.id)
      .in('status', ['pending', 'paused'])
      .maybeSingle();

    return NextResponse.json({
      authenticated: true,
      subscriptionActive: false,
      hasPendingSubscription: !!pendingSub,
      profile: {
        displayName: profile?.display_name || '',
        subscriptionStatus: profile?.subscription_status || 'none',
      },
    });
  } catch (err) {
    console.error('[GET /api/subscription-check] Erro:', err);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
