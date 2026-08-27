'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * SubscriptionRefresher
 *
 * Atualiza o cookie subscription_status de forma SOB DEMANDA —
 * apenas quando o usuário navega para uma rota protegida.
 *
 * Comportamento:
 * - Faz refresh ao montar em rotas protegidas (não usa polling)
 * - Só ativa para usuários logados (verifica presença de cookie de sessão Supabase)
 * - Não ativa em rotas públicas (/planos, /aguardando-pagamento, /)
 * - Debounce de 30s para não repetir em navegações rápidas
 */
export default function SubscriptionRefresher() {
  const pathname = usePathname();
  const lastRefreshRef = useRef<number>(0);
  const isInitialMount = useRef(true);

  useEffect(() => {
    // Pular a primeira montagem — o cookie acaba de ser definido no login
    // e chamar subscription-refresh aqui seria redundante
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // Rotas onde não precisa de refresh
    const publicPaths = ['/', '/planos', '/aguardando-pagamento', '/change-password', '/mfa-onboarding', '/mfa-verify', '/mfa-setup'];
    if (publicPaths.includes(pathname)) {
      return;
    }

    // Verificar se está logado (tem cookie de sessão Supabase)
    const hasSession = document.cookie
      .split(';')
      .some((c) => c.trim().startsWith('sb-') && c.includes('-auth-token'));

    if (!hasSession) return;

    // Debounce: não repetir se o último refresh foi há menos de 30 segundos
    const now = Date.now();
    if (now - lastRefreshRef.current < 30_000) return;
    lastRefreshRef.current = now;

    const refresh = async () => {
      try {
        await fetch('/api/subscription-refresh', { credentials: 'include' });
      } catch {
        // Silencioso — falha do refresh não deve impactar o usuário
      }
    };

    refresh();
  }, [pathname]);

  return null; // Componente invisível
}
