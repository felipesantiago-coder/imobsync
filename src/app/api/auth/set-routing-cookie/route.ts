import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/auth/set-routing-cookie
 *
 * Seta cookies de roteamento (first_login_step) com flags seguras.
 * Chamado pelo cliente após login quando o profile indica necessidade de
 * mudar senha ou configurar MFA — garante HttpOnly + Secure.
 */
const ALLOWED_STEPS = new Set(['change_password', 'setup_mfa']);
const COOKIE_MAX_AGE = 3600; // 1 hora

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const step = typeof body?.step === 'string' ? body.step : '';

    if (!ALLOWED_STEPS.has(step)) {
      return NextResponse.json({ error: 'Invalid step' }, { status: 400 });
    }

    // Validar no banco se o usuário realmente precisa deste passo
    const field = step === 'change_password' ? 'must_change_password' : 'must_setup_mfa';
    const { data: profile } = await supabase
      .from('profiles')
      .select(field)
      .eq('id', user.id)
      .maybeSingle();

    const profileData = profile as Record<string, unknown> | null;
    if (!profileData?.[field]) {
      return NextResponse.json({ error: 'Step not required' }, { status: 403 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set('first_login_step', step, {
      path: '/',
      maxAge: COOKIE_MAX_AGE,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    return response;
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
