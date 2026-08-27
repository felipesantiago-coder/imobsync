'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  Clock, CheckCircle2, Loader2, CreditCard,
  RefreshCw, Building2, LogOut, Shield,
} from 'lucide-react';
import MobileMenu from '@/components/MobileMenu';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

interface AssinaturaPendente {
  id: string;
  status: string;
  created_at: string;
  plano: { nome: string; preco: number } | null;
}

interface AguardandoPagamentoClientProps {
  userName: string;
  userEmail: string;
  assinaturaPendente: AssinaturaPendente | null;
}

export default function AguardandoPagamentoClient({
  userName,
  userEmail,
  assinaturaPendente,
}: AguardandoPagamentoClientProps) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [activated, setActivated] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Contador de tempo decorrido
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Poll para verificar se o pagamento foi confirmado
  const checkSubscription = useCallback(async () => {
    try {
      const res = await fetch('/api/subscription-check');
      if (res.ok) {
        const data = await res.json();
        if (data.subscriptionActive) {
          setActivated(true);
          // Parar polling
          if (intervalRef.current) clearInterval(intervalRef.current);
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          // Cookie agora é setado pelo /api/subscription-check com HttpOnly + Secure
          // Redirecionar após breve delay para o usuário ver o sucesso
          setTimeout(() => {
            router.push('/projetos');
            router.refresh();
          }, 2000);
        }
      }
    } catch {
      // Silently fail
    }
  }, [router]);

  // Iniciar polling automático a cada 5 segundos
  useEffect(() => {
    intervalRef.current = setInterval(checkSubscription, 15000);

    // Parar polling após 30 minutos
    timeoutRef.current = setTimeout(() => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }, 30 * 60 * 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [checkSubscription]);

  const handleManualCheck = async () => {
    setChecking(true);
    await checkSubscription();
    setTimeout(() => setChecking(false), 1000);
  };

  const handleLogout = useCallback(async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    await createClient().auth.signOut();
    router.push('/');
    router.refresh();
  }, [router]);

  const mobileMenuItems = useMemo(() => [
    { label: 'Sair', icon: <LogOut className="w-5 h-5" />, onClick: handleLogout, variant: 'danger' as const },
  ], [handleLogout]);

  const formatElapsed = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  if (activated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-green-50 to-emerald-50 flex flex-col items-center justify-center p-4">
        <div
          className="text-center max-w-md animate-[fadeInScale_0.4s_ease-out]"
        >
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Pagamento confirmado!</h1>
          <p className="text-sm text-gray-600 mt-2">
            Sua conta foi ativada com sucesso. Redirecionando...
          </p>
          <div className="mt-6">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-500 mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0D1B2A] text-white shadow-lg">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2 sm:gap-3">
              <Image
                src="/imobsync-icon-escuro-36.png"
                alt="Logo ImobSync"
                width={36}
                height={36}
                className="h-7 w-auto sm:h-9 rounded-lg"
              />
              <div className="min-w-0">
                <h1 className="text-sm sm:text-lg font-bold tracking-tight truncate">
                  ImobSync
                </h1>
                <p className="text-[10px] sm:text-[11px] text-gray-400 font-medium truncate">Confirmando pagamento</p>
              </div>
            </div>
            {/* Desktop */}
            <div className="hidden sm:flex items-center gap-2">
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-semibold transition-colors border border-red-500/20"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sair
              </button>
            </div>
            {/* Mobile menu */}
            <MobileMenu items={mobileMenuItems} />
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 w-full px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10 py-8 sm:py-12">
        <div className="max-w-lg mx-auto text-center">
          <div
            className="animate-[fadeSlideUp_0.5s_ease-out]"
          >
            {/* Animated icon */}
            <div className="w-20 h-20 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-6">
              <div className="animate-[spin_2s_linear_infinite]">
                <CreditCard className="w-10 h-10 text-amber-600" />
              </div>
            </div>

            <h2 className="text-2xl font-bold text-gray-900">Aguardando confirmacao do pagamento</h2>
            <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
              Seu cadastro foi realizado com sucesso! Agora estamos aguardando a confirmacao
              do pagamento pelo Mercado Pago para liberar seu acesso.
            </p>

            {/* Info card */}
            {assinaturaPendente && (
              <div className="mt-6 p-5 rounded-2xl bg-white border border-gray-200 shadow-sm text-left">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-gray-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Detalhes da assinatura</p>
                    <p className="text-xs text-gray-500">Referencia: {assinaturaPendente.id.slice(0, 8)}...</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-gray-50">
                    <p className="text-xs text-gray-500">Plano</p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">
                      {assinaturaPendente.plano?.nome || '—'}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-gray-50">
                    <p className="text-xs text-gray-500">Valor</p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">
                      R$ {assinaturaPendente.plano?.preco?.toFixed(2).replace('.', ',') || '—'}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-gray-50">
                    <p className="text-xs text-gray-500">E-mail</p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5 truncate">
                      {userEmail}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-gray-50">
                    <p className="text-xs text-gray-500">Status</p>
                    <p className="text-sm font-semibold text-amber-600 mt-0.5 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      Aguardando
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Timer */}
            <div className="mt-6 flex items-center justify-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-500">
                Tempo decorrido: <span className="font-mono font-semibold text-gray-700">{formatElapsed(elapsedSeconds)}</span>
              </span>
            </div>

            {/* Auto-refresh info */}
            <p className="text-xs text-gray-400 mt-3">
              A verificacao e automatica a cada 15 segundos. O pagamento via Pix e confirmado em poucos minutos.
            </p>

            {/* Manual check button */}
            <div className="mt-6">
              <Button
                onClick={handleManualCheck}
                disabled={checking}
                variant="outline"
                className="rounded-xl gap-2"
              >
                {checking ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Verificar agora
              </Button>
            </div>

            {/* Help text */}
            <div className="mt-8 space-y-3">
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                <p className="text-xs text-gray-500">
                  <strong>Nao recebeu a confirmacao?</strong> Se o pagamento foi feito via PIX e nao foi confirmado
                  em ate 10 minutos, ou se usou cartao de credito e nao foi aprovado, entre em contato
                  com o suporte.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                <p className="text-xs text-amber-700">
                  <strong>Ja era usuario antes da integracao com pagamentos?</strong>
                  Se voce ja tinha acesso ao sistema e ficou preso nesta tela,
                  entre em contato com o administrador para que sua assinatura seja
                  reativada manualmente.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white/90 mt-auto">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10 py-6">
          <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
            <Building2 className="w-4 h-4" />
            <span className="font-semibold text-gray-600">ImobSync</span>
            <span>-</span>
            <span>Confirmacao de Pagamento</span>
          </div>
        </div>
      </footer>
    </div>
  );
}