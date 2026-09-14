import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Rate limiting simples in-memory (por IP)
// Em produção com multiple instances, cada instancia tem seu proprio mapa.
// Isso é suficiente pois o refresh acontece a cada 4 min — abusos seriam obvios.
const refreshCounts = new Map<string, { count: number; resetAt: number }>();
const REFRESH_WINDOW_MS = 60 * 1000; // 1 minuto
const REFRESH_MAX_PER_WINDOW = 10; // max 10 refreshes por minuto por IP

/**
 * GET /api/subscription-refresh
 *
 * Atualiza o cookie subscription_status com o status real do banco.
 * Chamado periodicamente pelo cliente (a cada 4 min) ou após login.
 *
 * Retorna o status real e configura o cookie com TTL curto (5 min).
 */
export async function GET(request: globalThis.Request) {
  // Rate limiting por IP
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  const entry = refreshCounts.get(ip);

  if (entry) {
    if (now > entry.resetAt) {
      // Janela expirou — resetar
      refreshCounts.set(ip, { count: 1, resetAt: now + REFRESH_WINDOW_MS });
    } else {
      entry.count++;
      if (entry.count > REFRESH_MAX_PER_WINDOW) {
        return NextResponse.json(
          { error: 'Muitas requisicoes. Tente novamente em instantes.' },
          { status: 429, headers: { 'Retry-After': '60' } }
        );
      }
    }
  } else {
    refreshCounts.set(ip, { count: 1, resetAt: now + REFRESH_WINDOW_MS });
  }

  // Limpar entradas antigas periodicamente (a cada 100 requests, limpar expiradas)
  if (Math.random() < 0.01) {
    for (const [key, val] of refreshCounts.entries()) {
      if (now > val.resetAt) refreshCounts.delete(key);
    }
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      const response = NextResponse.json({ authenticated: false }, {
        headers: { 'Cache-Control': 'no-store', 'X-Refresh-Status': 'unauthenticated' },
      });
      response.cookies.set('subscription_status', '', {
        path: '/',
        maxAge: 0,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });
      return response;
    }

    // PERF: perfil e assinatura consultados em PARALELO (−1 round trip
    // sequencial por chamada; este endpoint roda a cada navegação protegida).
    // Semântica de erro preservada: ambas as queries usam maybeSingle e não
    // lançam — erro → data null → mesmo fluxo de antes (profile null cai no
    // fluxo por assinatura; assinatura null → 'none').
    // Para admins a query de assinatura também roda (resultado descartado no
    // early return) — custo de 1 query indexada vs. ganho no caminho comum.
    const admin = createAdminClient();
    const [profileRes, assinaturaRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('role, subscription_status')
        .eq('id', user.id)
        .maybeSingle(),
      admin
        .from('assinaturas')
        .select('id, status, data_fim')
        .eq('user_id', user.id)
        .in('status', ['active', 'lifetime'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const profileData = profileRes.data as Record<string, unknown> | null;
    const isAdmin = profileData?.role === 'admin_sistema';

    if (isAdmin) {
      const response = NextResponse.json({
        authenticated: true,
        status: 'active',
        isAdmin: true,
      }, { headers: { 'Cache-Control': 'no-store' } });
      response.cookies.set('subscription_status', 'active', {
        path: '/',
        maxAge: 300,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });
      return response;
    }

    // Verificar assinatura real no banco (incluindo data_fim)
    const assinatura = assinaturaRes.data;

    let realStatus = 'none';

    if (assinatura) {
      if (assinatura.status === 'lifetime') {
        realStatus = 'lifetime';
      } else if (assinatura.data_fim && new Date(assinatura.data_fim) <= new Date()) {
        realStatus = 'none';
      } else {
        realStatus = 'active';
      }
    }

    // Sincronizar perfil se inconsistente
    if (profileData && profileData.subscription_status !== realStatus && realStatus === 'none') {
      await admin
        .from('profiles')
        .update({ subscription_status: 'none' })
        .eq('id', user.id);
    }

    const response = NextResponse.json({
      authenticated: true,
      status: realStatus,
      isAdmin: false,
    }, { headers: { 'Cache-Control': 'no-store' } });

    response.cookies.set('subscription_status', realStatus, {
      path: '/',
      maxAge: 300,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    return response;
  } catch (err) {
    console.error('[GET /api/subscription-refresh] Erro:', err);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
