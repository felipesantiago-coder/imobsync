'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, ArrowLeft, Loader2, CreditCard, Shield, Zap,
  Crown, CalendarDays, Clock, Star, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import type { PlanoDB } from '@/lib/mercadopago';

interface PlanosClientProps {
  userEmail: string;
  userName: string;
  isAdmin: boolean;
  planos: PlanoDB[];
  assinaturaAtiva: { id: string; status: string; plano: { id: string; nome: string } } | null;
}

const periodoLabels: Record<number, string> = {
  1: '/mês',
  3: '/trimestre',
  6: '/semestre',
  12: '/ano',
};

export default function PlanosClient({
  userEmail,
  userName,
  isAdmin,
  planos,
  assinaturaAtiva,
}: PlanosClientProps) {
  const router = useRouter();
  const [loadingPlanoId, setLoadingPlanoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<PlanoDB | null>(null);

  const handleSelectPlano = (plano: PlanoDB) => {
    // Verificar se já tem assinatura ativa
    if (assinaturaAtiva) {
      setError(`Você já possui uma assinatura ativa (${assinaturaAtiva.plano.nome}). Acesse o portal do assinante para gerenciar.`);
      return;
    }

    // Verificar se o plano tem ID do MP
    if (!plano.mercadopago_plan_id) {
      setError('Este plano ainda não está disponível para compra. Aguarde a configuração pelo administrador.');
      return;
    }

    setConfirmDialog(plano);
  };

  const handleConfirmSubscribe = async () => {
    if (!confirmDialog) return;

    setLoadingPlanoId(confirmDialog.id);
    setError(null);

    try {
      const res = await fetch('/api/subscriptions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planoId: confirmDialog.id }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Erro ao criar assinatura.');
        return;
      }

      // Redirecionar para o checkout do Mercado Pago
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        setError('Erro: URL de checkout não recebida.');
      }
    } catch (err) {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setLoadingPlanoId(null);
      setConfirmDialog(null);
    }
  };

  const handleLogout = async () => {
    await createClient().auth.signOut();
    router.push('/');
    router.refresh();
  };

  // Calcular economia relativa ao plano mensal
  const mensalPrice = planos.find(p => p.periodo_meses === 1)?.preco || 49.9;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-white shadow-lg">
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
                <h1 className="text-lg font-bold tracking-tight">Planos de Assinatura</h1>
                <p className="text-[11px] text-gray-400 font-medium">Escolha o plano ideal para você</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {assinaturaAtiva && (
                <a
                  href="/assinatura"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-xs font-semibold transition-colors border border-emerald-500/20"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Minha Assinatura</span>
                </a>
              )}
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
        <div className="max-w-5xl mx-auto">
          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10 sm:mb-14"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold mb-4">
              <Zap className="w-3.5 h-3.5" />
              Acesse todos os empreendimentos
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
              Escolha seu plano
            </h2>
            <p className="text-sm sm:text-base text-gray-500 mt-3 max-w-xl mx-auto">
              Assine e tenha acesso completo ao espelho de vendas de todos os empreendimentos.
              Cancele quando quiser, sem multa.
            </p>
          </motion.div>

          {/* Assinatura ativa banner */}
          {assinaturaAtiva && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-3"
            >
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <p className="text-sm text-emerald-800">
                Você possui uma assinatura <strong>{assinaturaAtiva.plano.nome}</strong> ativa.
                {' '}<a href="/assinatura" className="underline font-semibold">Gerenciar assinatura</a>
              </p>
            </motion.div>
          )}

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 p-4 rounded-xl bg-red-50 border border-red-200 flex items-center gap-3"
            >
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
                ✕
              </button>
            </motion.div>
          )}

          {/* Plan cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
            {planos.map((plano, index) => {
              const isPopular = plano.popular;
              const precoMensal = Number(plano.preco) / plano.periodo_meses;
              const economia = mensalPrice > 0
                ? Math.round((1 - precoMensal / mensalPrice) * 100)
                : 0;
              const isLoading = loadingPlanoId === plano.id;
              const isCurrentPlan = assinaturaAtiva?.plano?.id === plano.id;
              const semMpId = !plano.mercadopago_plan_id;

              return (
                <motion.div
                  key={plano.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.08 * index }}
                  className={`relative rounded-2xl border-2 transition-all duration-300 flex flex-col ${
                    isPopular
                      ? 'border-amber-400 shadow-lg shadow-amber-100 scale-[1.02]'
                      : 'border-gray-200 shadow-md hover:shadow-lg hover:border-gray-300'
                  } ${isCurrentPlan ? 'ring-2 ring-emerald-400' : ''}`}
                >
                  {/* Popular badge */}
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                      <Badge className="bg-amber-500 text-white border-0 px-3 py-1 text-xs font-bold shadow-sm">
                        <Star className="w-3 h-3 mr-1" />
                        Mais popular
                      </Badge>
                    </div>
                  )}

                  <div className="p-5 sm:p-6 flex flex-col flex-1">
                    {/* Plan name */}
                    <h3 className="text-lg font-bold text-gray-900">{plano.nome}</h3>
                    <p className="text-xs text-gray-500 mt-1">{plano.descricao}</p>

                    {/* Price */}
                    <div className="mt-4 mb-5">
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl sm:text-4xl font-bold text-gray-900">
                          R$ {Number(plano.preco).toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm text-gray-500">
                          {periodoLabels[plano.periodo_meses] || `/${plano.periodo_meses} meses`}
                        </span>
                        {economia > 0 && (
                          <Badge variant="secondary" className="text-[10px] bg-emerald-100 text-emerald-700 border-0">
                            Economia de {economia}%
                          </Badge>
                        )}
                      </div>
                      {plano.periodo_meses > 1 && (
                        <p className="text-xs text-gray-400 mt-1">
                          Equivalente a R$ {precoMensal.toFixed(2).replace('.', ',')}/mês
                        </p>
                      )}
                    </div>

                    {/* Features */}
                    <ul className="space-y-2.5 flex-1">
                      {(plano.features as string[]).map((feature, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span className="text-sm text-gray-700">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    <div className="mt-6">
                      {isCurrentPlan ? (
                        <a
                          href="/assinatura"
                          className="flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-emerald-100 text-emerald-700 text-sm font-semibold hover:bg-emerald-200 transition-colors"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Plano atual
                        </a>
                      ) : semMpId ? (
                        <Button
                          disabled
                          className="w-full h-11 rounded-xl text-sm font-semibold bg-gray-100 text-gray-400 cursor-not-allowed"
                        >
                          Em breve
                        </Button>
                      ) : (
                        <Button
                          onClick={() => handleSelectPlano(plano)}
                          disabled={isLoading || !!assinaturaAtiva}
                          className={`w-full h-11 rounded-xl text-sm font-semibold transition-all duration-200 ${
                            isPopular
                              ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-md hover:shadow-lg'
                              : 'bg-gray-900 hover:bg-gray-800 text-white'
                          }`}
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Processando...
                            </>
                          ) : (
                            <>
                              <CreditCard className="w-4 h-4" />
                              Assinar agora
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Trust indicators */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6"
          >
            <div className="flex flex-col items-center text-center p-4">
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
                <Shield className="w-5 h-5 text-gray-600" />
              </div>
              <p className="text-sm font-semibold text-gray-800">Pagamento seguro</p>
              <p className="text-xs text-gray-500 mt-1">Pix e cartão via Mercado Pago</p>
            </div>
            <div className="flex flex-col items-center text-center p-4">
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
                <CalendarDays className="w-5 h-5 text-gray-600" />
              </div>
              <p className="text-sm font-semibold text-gray-800">Cancele quando quiser</p>
              <p className="text-xs text-gray-500 mt-1">Sem multa ou taxa de cancelamento</p>
            </div>
            <div className="flex flex-col items-center text-center p-4">
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
                <Clock className="w-5 h-5 text-gray-600" />
              </div>
              <p className="text-sm font-semibold text-gray-800">Acesso imediato</p>
              <p className="text-xs text-gray-500 mt-1">Liberação automática após pagamento</p>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white/80 backdrop-blur-sm mt-auto">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10 py-6">
          <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
            <Crown className="w-4 h-4" />
            <span className="font-semibold text-gray-600">Espelho de Vendas</span>
            <span>•</span>
            <span>Planos de Assinatura</span>
          </div>
        </div>
      </footer>

      {/* Dialog de confirmação */}
      <Dialog open={!!confirmDialog} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar assinatura</DialogTitle>
            <DialogDescription>
              Você será redirecionado para o checkout seguro do Mercado Pago para completar o pagamento.
            </DialogDescription>
          </DialogHeader>
          {confirmDialog && (
            <div className="py-4 space-y-3">
              <div className="p-4 rounded-xl bg-gray-50 border">
                <p className="text-sm font-semibold text-gray-900">{confirmDialog.nome}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  R$ {Number(confirmDialog.preco).toFixed(2).replace('.', ',')}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {periodoLabels[confirmDialog.periodo_meses] || `${confirmDialog.periodo_meses} meses`}
                </p>
              </div>
              <div className="flex items-start gap-2 text-xs text-gray-500">
                <Shield className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
                <p>
                  O pagamento é processado com segurança pelo Mercado Pago.
                  Aceitamos Pix e cartão de crédito.
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setConfirmDialog(null)}
              className="flex-1 rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmSubscribe}
              disabled={loadingPlanoId !== null}
              className="flex-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white"
            >
              {loadingPlanoId ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Ir para o pagamento'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
