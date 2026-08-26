'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Crown, CheckCircle2, XCircle, Clock, CreditCard,
  Loader2, AlertCircle, ExternalLink, RefreshCw, Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createClient } from '@/lib/supabase/client';

interface AssinaturaClientProps {
  userName: string;
  isAdmin: boolean;
  returnedFromPayment?: boolean;
}

interface PlanoInfo {
  id: string;
  nome: string;
  periodo_meses: number;
  preco: number;
}

interface AssinaturaInfo {
  id: string;
  status: string;
  metodo_pagamento: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  ultimo_pagamento_em: string | null;
  proximo_ciclo_em: string | null;
  cancelado_em: string | null;
  motivo_cancelamento: string;
  created_at: string;
  plano: PlanoInfo;
}

interface PagamentoInfo {
  id: string;
  valor: number;
  metodo_pagamento: string;
  status: string;
  data_pagamento: string | null;
  created_at: string;
}

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  active: { label: 'Ativa', color: 'text-emerald-700', bg: 'bg-emerald-100', icon: CheckCircle2 },
  pending: { label: 'Pendente', color: 'text-amber-700', bg: 'bg-amber-100', icon: Clock },
  cancelled: { label: 'Cancelada', color: 'text-red-700', bg: 'bg-red-100', icon: XCircle },
  cancelled_by_user: { label: 'Cancelada', color: 'text-red-700', bg: 'bg-red-100', icon: XCircle },
  paused: { label: 'Pausada', color: 'text-gray-700', bg: 'bg-gray-100', icon: Clock },
  expired: { label: 'Expirada', color: 'text-gray-700', bg: 'bg-gray-100', icon: XCircle },
};

const pagamentoStatusConfig: Record<string, { label: string; color: string; bg: string }> = {
  approved: { label: 'Aprovado', color: 'text-emerald-700', bg: 'bg-emerald-100' },
  pending: { label: 'Pendente', color: 'text-amber-700', bg: 'bg-amber-100' },
  rejected: { label: 'Rejeitado', color: 'text-red-700', bg: 'bg-red-100' },
  refunded: { label: 'Estornado', color: 'text-blue-700', bg: 'bg-blue-100' },
  cancelled: { label: 'Cancelado', color: 'text-gray-700', bg: 'bg-gray-100' },
  in_process: { label: 'Processando', color: 'text-amber-700', bg: 'bg-amber-100' },
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AssinaturaClient({ userName, isAdmin, returnedFromPayment }: AssinaturaClientProps) {
  const router = useRouter();
  const [assinatura, setAssinatura] = useState<AssinaturaInfo | null>(null);
  const [pagamentos, setPagamentos] = useState<PagamentoInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [paymentJustConfirmed, setPaymentJustConfirmed] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/subscriptions/status');
      if (res.ok) {
        const data = await res.json();
        setAssinatura(data.assinatura);
        setPagamentos(data.pagamentos || []);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  // Ao montar: se retornou do MP com assinatura já ativa (webhook processou primeiro), mostrar confirmação
  useEffect(() => {
    if (!loading && returnedFromPayment && assinatura && (assinatura.status === 'active' || assinatura.status === 'lifetime') && !paymentJustConfirmed) {
      // Garantir que o cookie está atualizado
      fetch('/api/subscription-refresh', { credentials: 'include' });
      setPaymentJustConfirmed(true);
    }
  }, [loading, returnedFromPayment, assinatura?.status, paymentJustConfirmed]);

  // Ao montar: se assinatura está pending, tentar confirmar pagamento via MP
  useEffect(() => {
    if (!loading && assinatura && assinatura.status === 'pending' && !confirming) {
      setConfirming(true);
      fetch('/api/subscriptions/confirm-payment', { method: 'POST', credentials: 'include' })
        .then(res => res.json())
        .then(data => {
          if (data.activated) {
            // Pagamento confirmado — atualizar cookie e recarregar dados
            return fetch('/api/subscription-refresh', { credentials: 'include' }).then(() => {
              fetchStatus();
              setPaymentJustConfirmed(true);
            });
          }
        })
        .catch(() => {})
        .finally(() => setConfirming(false));
    }
  }, [loading, assinatura?.status, confirming]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleCancel = async () => {
    setCancelling(true);
    setError(null);
    setShowCancelDialog(false);

    try {
      const res = await fetch('/api/subscriptions/cancel', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Erro ao cancelar.');
        return;
      }

      // Recarregar dados
      await fetchStatus();
    } catch {
      setError('Erro de conexão.');
    } finally {
      setCancelling(false);
    }
  };

  const handleLogout = useCallback(async () => {
    await createClient().auth.signOut();
    router.push('/');
    router.refresh();
  }, [router]);

  const statusCfg = assinatura ? statusConfig[assinatura.status] : null;
  const StatusIcon = statusCfg?.icon || Clock;
  const isActive = assinatura?.status === 'active';

  const daysRemainingLabel = useMemo(() => {
    if (!isActive || !assinatura?.data_fim) return null;
    const diffMs = new Date(assinatura.data_fim).getTime() - Date.now();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'Hoje';
    if (diffDays === 1) return '1 dia';
    return `${diffDays} dias`;
  }, [isActive, assinatura?.data_fim]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0D1B2A] text-white shadow-lg">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/projetos')}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="w-9 h-9 rounded-lg bg-white/10 backdrop-blur-sm border border-white/10 flex items-center justify-center">
                <Crown className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">Gerenciar Plano</h1>
                <p className="text-[11px] text-gray-400 font-medium">Informacoes da sua assinatura</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="/planos"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                Ver planos
              </a>
              {isAdmin && (
                <a
                  href="/admin-sistema"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 text-xs font-semibold transition-colors border border-amber-500/20"
                >
                  Administração
                </a>
              )}
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-semibold transition-colors border border-red-500/20"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 w-full px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10 py-8 sm:py-12">
        <div className="max-w-3xl mx-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : !assinatura ? (
            /* Sem assinatura */
            <div
              className="text-center py-16 animate-[fadeSlideUp_0.5s_ease-out]"
            >
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <Crown className="w-8 h-8 text-gray-400" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Nenhuma assinatura encontrada</h2>
              <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
                Você ainda não possui uma assinatura ativa. Escolha um plano para ter acesso completo ao sistema.
              </p>
              <a
                href="/planos"
                className="inline-flex items-center gap-2 mt-6 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors shadow-md"
              >
                <ExternalLink className="w-4 h-4" />
                Ver planos disponíveis
              </a>
            </div>
          ) : (
            <div
              className="space-y-6 animate-[fadeSlideUp_0.5s_ease-out]"
            >
              {/* Banner de confirmação de pagamento */}
              {paymentJustConfirmed && (
                <div
                  className="p-6 sm:p-8 rounded-2xl bg-emerald-50 border-2 border-emerald-200 shadow-sm animate-[fadeSlideUp_0.3s_ease-out]"
                >
                  <div className="flex flex-col items-center text-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                      <CheckCircle2 className="w-9 h-9 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-emerald-900">Pagamento confirmado!</h3>
                      <p className="text-sm text-emerald-700 mt-2 max-w-md">
                        Seu pagamento foi aprovado com sucesso e sua assinatura está ativa.
                        Agora você tem acesso completo ao sistema.
                      </p>
                    </div>
                    <Button
                      onClick={() => router.push('/projetos')}
                      className="mt-2 px-8 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors shadow-md"
                    >
                      Acessar o sistema
                      <ArrowLeft className="w-4 h-4 ml-2 rotate-180" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                  <p className="text-sm text-red-700 flex-1">{error}</p>
                  <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">✕</button>
                </div>
              )}

              {/* Card de status da assinatura */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-6 sm:p-8">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">
                        {assinatura.plano.nome}
                      </h2>
                      <p className="text-sm text-gray-500 mt-1">
                        Assinatura criada em {formatDate(assinatura.created_at)}
                      </p>
                    </div>
                    <Badge className={`${statusCfg?.bg || 'bg-gray-100'} ${statusCfg?.color || 'text-gray-700'} border-0 px-3 py-1.5 text-xs font-semibold`}>
                      <StatusIcon className="w-3.5 h-3.5 mr-1.5" />
                      {statusCfg?.label || assinatura.status}
                    </Badge>
                  </div>

                  {/* Dados da assinatura */}
                  {/* FIX #10: Responsive grid - 2 cols on mobile, 4 on sm+ */}
                  <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                    <div className="p-3 rounded-xl bg-gray-50">
                      <p className="text-xs text-gray-500">Valor do plano</p>
                      <p className="text-lg font-bold text-gray-900 mt-0.5">
                        R$ {Number(assinatura.plano.preco).toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-gray-50">
                      <p className="text-xs text-gray-500">Método</p>
                      <p className="text-sm font-semibold text-gray-900 mt-1 capitalize flex items-center gap-1.5">
                        <CreditCard className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="truncate">{assinatura.metodo_pagamento === 'credit_card' ? 'Cartão'
                          : assinatura.metodo_pagamento === 'pix' ? 'Pix'
                          : assinatura.metodo_pagamento || '—'}</span>
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-gray-50">
                      <p className="text-xs text-gray-500">Início</p>
                      <p className="text-sm font-semibold text-gray-900 mt-1">
                        {formatDate(assinatura.data_inicio)}
                      </p>
                    </div>
                    {/* FIX #10: Show data_fim (end date) instead of proximo_ciclo for clarity */}
                    <div className="p-3 rounded-xl bg-gray-50">
                      <p className="text-xs text-gray-500">{assinatura.status === 'lifetime' ? 'Tipo' : 'Vencimento'}</p>
                      <p className="text-sm font-semibold text-gray-900 mt-1">
                        {assinatura.status === 'lifetime'
                          ? 'Vitalício'
                          : formatDate(assinatura.data_fim)}
                      </p>
                    </div>
                  </div>

                  {/* Dias restantes para plano ativo */}
                  {isActive && assinatura.data_fim && (
                    <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-emerald-600 shrink-0" />
                          <p className="text-xs font-semibold text-emerald-700">Seu plano vence em</p>
                        </div>
                        <p className="text-sm font-bold text-emerald-800">
                          {daysRemainingLabel}
                        </p>
                      </div>
                      <p className="text-[11px] text-emerald-600 mt-1 ml-6">
                        {new Date(assinatura.data_fim).toLocaleDateString('pt-BR', {
                          day: '2-digit', month: 'long', year: 'numeric',
                        })}
                      </p>
                    </div>
                  )}

                  {/* Badge vitalício */}
                  {assinatura.status === 'lifetime' && (
                    <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-100">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-amber-700">Acesso vitalício</p>
                          <p className="text-[11px] text-amber-600 mt-0.5">Sua conta possui acesso permanente ao sistema, sem data de vencimento.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Motivo do cancelamento */}
                  {(assinatura.status === 'cancelled' || assinatura.status === 'cancelled_by_user') && assinatura.motivo_cancelamento && (
                    <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-100">
                      <p className="text-xs text-red-600 font-semibold">Motivo do cancelamento</p>
                      <p className="text-sm text-red-700 mt-1">{assinatura.motivo_cancelamento}</p>
                      {assinatura.cancelado_em && (
                        <p className="text-xs text-red-500 mt-1">Cancelado em {formatDate(assinatura.cancelado_em)}</p>
                      )}
                    </div>
                  )}

                  {/* Ações */}
                  {isActive && (
                    <div className="mt-6 flex flex-col sm:flex-row gap-3">
                      <Button
                        variant="outline"
                        onClick={() => router.push('/planos')}
                        className="flex-1 rounded-xl"
                      >
                        Trocar plano
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => setShowCancelDialog(true)}
                        disabled={cancelling}
                        className="flex-1 rounded-xl"
                      >
                        {cancelling ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <XCircle className="w-4 h-4 mr-2" />
                        )}
                        Cancelar assinatura
                      </Button>
                    </div>
                  )}

                  {!isActive && assinatura.status !== 'cancelled' && assinatura.status !== 'cancelled_by_user' && assinatura.status !== 'expired' && (
                    <div className="mt-6">
                      <a
                        href="/planos"
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors shadow-md"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Assinar um plano
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Histórico de pagamentos */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-6 sm:p-8">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold text-gray-900">Histórico de pagamentos</h3>
                    <button
                      onClick={fetchStatus}
                      className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
                      title="Atualizar"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>

                  {pagamentos.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">
                      Nenhum pagamento registrado ainda.
                    </p>
                  ) : (
                    <div className="space-y-3 max-h-80 overflow-y-auto">
                      {pagamentos.map((pag) => {
                        const pStatusCfg = pagamentoStatusConfig[pag.status] || pagamentoStatusConfig.pending;
                        return (
                          <div
                            key={pag.id}
                            className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-lg bg-white border flex items-center justify-center">
                                <CreditCard className="w-4 h-4 text-gray-400" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-gray-900">
                                  R$ {Number(pag.valor).toFixed(2).replace('.', ',')}
                                </p>
                                <p className="text-xs text-gray-500">{formatDate(pag.data_pagamento || pag.created_at)}</p>
                              </div>
                            </div>
                            <Badge className={`${pStatusCfg.bg} ${pStatusCfg.color} border-0 text-[10px] font-semibold`}>
                              {pStatusCfg.label}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white/90 mt-auto">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10 py-6">
          <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
            <Crown className="w-4 h-4" />
            <span className="font-semibold text-gray-600">ImobSync</span>
            <span>•</span>
            <span>Minha Assinatura</span>
          </div>
        </div>
      </footer>

      {/* Dialog de confirmação de cancelamento */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar assinatura</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja cancelar sua assinatura? Você perderá o acesso ao sistema ao final do período atual.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100">
              <Shield className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                Não há multa por cancelamento. Se quiser voltar, basta assinar um novo plano a qualquer momento.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowCancelDialog(false)}
              className="flex-1 rounded-xl"
            >
              Manter assinatura
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelling}
              className="flex-1 rounded-xl"
            >
              {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sim, cancelar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
