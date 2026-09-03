"use client";

import React, { useState } from "react";
import {
  Plus, Trash2, X, Check, AlertCircle, Loader2,
  Crown, RefreshCw, CreditCard, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/confirm-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

// ─── Types ─────────────────────────────────────────────────────────────
interface AssinaturasTabProps {
  assinaturas: Record<string, unknown>[];
  assinaturasLoading: boolean;
  planosAdmin: Record<string, unknown>[];
  syncingPlano: string | null;
  changingStatus: string | null;
  statusChangeDialog: { id: string; currentStatus: string } | null;
  newStatus: string;
  statusMotivo: string;
  savingPlano: boolean;
  deletingPlano: string | null;
  togglingPlano: string | null;
  addToast: (type: "success" | "error", message: string) => void;
  onSyncPlano: (planoId: string, planoNome: string) => void;
  onFetchAssinaturas: () => Promise<void>;
  onFetchPlanos: () => Promise<void>;
  onOpenStatusChange: (id: string, current: string) => void;
  onConfirmStatusChange: () => Promise<void>;
  onSetStatusChangeDialog: (v: { id: string; currentStatus: string } | null) => void;
  onSetNewStatus: (v: string) => void;
  onSetStatusMotivo: (v: string) => void;
  onSavePlano: (data: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  onDeletePlano: (planoId: string) => Promise<void>;
  onTogglePlano: (planoId: string, currentAtivo: boolean, planoNome: string) => void;
}

interface PlanoFormState {
  id?: string;
  nome: string;
  descricao: string;
  periodo_meses: string;
  preco: string;
  features: string;
  popular: boolean;
  maior_economia: boolean;
  ativo: boolean;
  ordem: string;
}

const EMPTY_PLANO_FORM: PlanoFormState = {
  nome: "",
  descricao: "",
  periodo_meses: "1",
  preco: "",
  features: "",
  popular: false,
  maior_economia: false,
  ativo: true,
  ordem: "",
};

// ─── Component ───────────────────────────────────────────────────────────
function AssinaturasTab({
  assinaturas, assinaturasLoading, planosAdmin, syncingPlano,
  changingStatus, statusChangeDialog, newStatus, statusMotivo,
  savingPlano, deletingPlano, togglingPlano,
  addToast, onSyncPlano, onFetchAssinaturas, onFetchPlanos,
  onOpenStatusChange, onConfirmStatusChange,
  onSetStatusChangeDialog, onSetNewStatus, onSetStatusMotivo,
  onSavePlano, onDeletePlano, onTogglePlano,
}: AssinaturasTabProps) {
  const [innerTab, setInnerTab] = useState<"assinaturas" | "planos">("assinaturas");

  // Plano form
  const [showPlanoDialog, setShowPlanoDialog] = useState(false);
  const [planoForm, setPlanoForm] = useState<PlanoFormState>(EMPTY_PLANO_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [savePlanoConfirm, setSavePlanoConfirm] = useState(false);

  // Ativação manual de assinatura
  const [showActivateDialog, setShowActivateDialog] = useState(false);
  const [activateForm, setActivateForm] = useState({ userId: "", planoId: "", motivo: "" });
  const [activateUsers, setActivateUsers] = useState<Record<string, unknown>[]>([]);
  const [activateLoading, setActivateLoading] = useState(false);
  const [activateFetchingUsers, setActivateFetchingUsers] = useState(false);

  // Correcao de usuarios legados
  const [fixLegacyLoading, setFixLegacyLoading] = useState(false);
  const [fixLegacyConfirm, setFixLegacyConfirm] = useState(false);

  // Conceder plano vitalicio
  const [showLifetimeDialog, setShowLifetimeDialog] = useState(false);
  const [lifetimeForm, setLifetimeForm] = useState({ userId: "", motivo: "" });
  const [lifetimeLoading, setLifetimeLoading] = useState(false);

  const statusLabels: Record<string, string> = {
    active: "Ativa", pending: "Pendente", cancelled: "Cancelada",
    paused: "Pausada", expired: "Expirada", cancelled_by_user: "Cancelada (user)",
    lifetime: "Vitalícia",
  };

  const statusColors: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-700",
    pending: "bg-amber-100 text-amber-700",
    cancelled: "bg-red-100 text-red-700",
    cancelled_by_user: "bg-red-100 text-red-700",
    paused: "bg-gray-100 text-gray-700",
    expired: "bg-gray-100 text-gray-500",
    lifetime: "bg-purple-100 text-purple-700",
  };

  const openCreatePlano = () => {
    setPlanoForm(EMPTY_PLANO_FORM);
    setShowPlanoDialog(true);
  };

  const fetchNonAdminUsers = async () => {
    if (activateUsers.length === 0) {
      setActivateFetchingUsers(true);
      try {
        const res = await fetch("/api/admin-sistema/users");
        if (res.ok) {
          const json = await res.json();
          setActivateUsers((json.users || []).filter((u: Record<string, unknown>) => u.role !== "admin_sistema"));
        }
      } catch {
        addToast("error", "Erro ao buscar usuários.");
      } finally {
        setActivateFetchingUsers(false);
      }
    }
  };

  const handleOpenActivateDialog = async () => {
    setActivateForm({ userId: "", planoId: "", motivo: "" });
    setShowActivateDialog(true);
    await fetchNonAdminUsers();
  };

  const handleGrantLifetime = async () => {
    if (!lifetimeForm.userId || lifetimeForm.motivo.trim().length < 15) {
      addToast("error", "Selecione um usuário e forneça um motivo (mín. 15 caracteres).");
      return;
    }
    setLifetimeLoading(true);
    try {
      const res = await fetch("/api/admin-sistema/assinaturas/grant-lifetime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: lifetimeForm.userId, motivo: lifetimeForm.motivo.trim() }),
      });
      const json = await res.json();
      if (res.ok) {
        addToast("success", json.message || "Plano vitalício concedido.");
        setShowLifetimeDialog(false);
        setLifetimeForm({ userId: "", motivo: "" });
        await onFetchAssinaturas();
      } else {
        addToast("error", json.error || "Erro ao conceder vitalício.");
      }
    } catch {
      addToast("error", "Erro ao conceder plano vitalício.");
    } finally {
      setLifetimeLoading(false);
    }
  };

  const handleOpenLifetimeDialog = async () => {
    setLifetimeForm({ userId: "", motivo: "" });
    setShowLifetimeDialog(true);
    await fetchNonAdminUsers();
  };

  const handleFixLegacy = async () => {
    setFixLegacyConfirm(false);
    setFixLegacyLoading(true);
    try {
      const res = await fetch("/api/admin-sistema/assinaturas/fix-legacy", { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        const parts: string[] = [];
        if (json.fixed_no_subscription?.length > 0) parts.push(`${json.fixed_no_subscription.length} sem assinatura corrigidos`);
        if (json.fixed_expired?.length > 0) parts.push(`${json.fixed_expired.length} expirados`);
        const msg = parts.length > 0 ? `Correcao concluida: ${parts.join(", ")}.` : "Nenhum usuario precisava de correcao.";
        addToast("success", msg);
        if (json.total_fixed > 0) await onFetchAssinaturas();
      } else {
        addToast("error", json.error || "Erro ao corrigir usuarios legados.");
      }
    } catch {
      addToast("error", "Erro ao corrigir usuarios legados.");
    } finally {
      setFixLegacyLoading(false);
    }
  };

  const handleActivateManual = async () => {
    if (!activateForm.userId || !activateForm.planoId || activateForm.motivo.trim().length < 10) {
      addToast("error", "Selecione um usuário, um plano e forneça um motivo (mín. 10 caracteres).");
      return;
    }
    setActivateLoading(true);
    try {
      const res = await fetch("/api/admin-sistema/assinaturas/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: activateForm.userId, planoId: activateForm.planoId, motivo: activateForm.motivo.trim() }),
      });
      const json = await res.json();
      if (res.ok) {
        addToast("success", json.message || "Assinatura ativada manualmente.");
        setShowActivateDialog(false);
        await onFetchAssinaturas();
      } else {
        addToast("error", json.error || "Erro ao ativar assinatura.");
      }
    } catch {
      addToast("error", "Erro ao ativar assinatura.");
    } finally {
      setActivateLoading(false);
    }
  };

  const openEditPlano = (plano: Record<string, unknown>) => {
    const featuresArr = Array.isArray(plano.features) ? (plano.features as string[]).join(", ") : "";
    setPlanoForm({
      id: plano.id as string, nome: plano.nome as string,
      descricao: plano.descricao as string || "", periodo_meses: String(plano.periodo_meses),
      preco: String(plano.preco), features: featuresArr,
      popular: plano.popular as boolean || false, maior_economia: plano.maior_economia as boolean || false,
      ativo: plano.ativo as boolean ?? true, ordem: plano.ordem ? String(plano.ordem) : "",
    });
    setShowPlanoDialog(true);
  };

  const handleSavePlanoForm = async () => {
    if (!planoForm.nome.trim() || !planoForm.preco || !planoForm.periodo_meses) {
      addToast("error", "Preencha nome, preço e período.");
      return;
    }
    // For existing planos, show confirmation first
    if (planoForm.id) {
      setSavePlanoConfirm(true);
      return;
    }
    await executePlanoSave();
  };

  const executePlanoSave = async () => {
    setSavePlanoConfirm(false);
    const features = planoForm.features.split(",").map((f) => f.trim()).filter(Boolean);
    const payload: Record<string, unknown> = {
      nome: planoForm.nome.trim(), descricao: planoForm.descricao.trim(),
      periodo_meses: parseInt(planoForm.periodo_meses, 10), preco: parseFloat(planoForm.preco),
      features, popular: planoForm.popular, maior_economia: planoForm.maior_economia, ativo: planoForm.ativo,
    };
    if (planoForm.id) payload.id = planoForm.id;
    if (planoForm.ordem) payload.ordem = parseInt(planoForm.ordem, 10);
    const result = await onSavePlano(payload);
    if (result) setShowPlanoDialog(false);
  };

  return (
    <div className="space-y-6">
      {/* FIX #1: Inner tabs now scrollable on mobile */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit min-w-full sm:min-w-0">
          <button onClick={() => setInnerTab("assinaturas")} className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${innerTab === "assinaturas" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            <CreditCard className="w-4 h-4" /> Assinaturas
          </button>
          <button onClick={() => setInnerTab("planos")} className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${innerTab === "planos" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            <Crown className="w-4 h-4" /> Planos / MP
          </button>
        </div>
      </div>

      {/* ══ Sub-tab: Assinaturas ══ */}
      {innerTab === "assinaturas" && (
        <>
          {/* FIX #2: Actions bar now wraps on mobile */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Assinaturas</h2>
              <p className="text-sm text-gray-500 mt-1">
                {assinaturasLoading ? "Carregando..." : `${assinaturas.length} assinatura(s)`}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={onFetchAssinaturas} className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600">
                <RefreshCw className="w-4 h-4" />
              </button>
              <Button onClick={() => setFixLegacyConfirm(true)} disabled={fixLegacyLoading} className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white shadow-md rounded-xl h-9 px-3 sm:px-4 text-xs font-semibold">
                {fixLegacyLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertCircle className="w-3.5 h-3.5" />}
                <span className="hidden xs:inline">Corrigir </span>Legados
              </Button>
              <Button onClick={handleOpenActivateDialog} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md rounded-xl h-9 px-3 sm:px-4 text-xs font-semibold">
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Ativar </span>Manual
              </Button>
              <Button onClick={handleOpenLifetimeDialog} className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white shadow-md rounded-xl h-9 px-3 sm:px-4 text-xs font-semibold">
                <Crown className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Conceder </span>Vitalício
              </Button>
            </div>
          </div>
          {assinaturasLoading && <div className="space-y-3">{[1,2,3].map(i => (<div key={i} className="bg-white rounded-xl p-4 border animate-pulse"><div className="h-4 bg-gray-200 rounded w-48" /></div>))}</div>}
          {!assinaturasLoading && assinaturas.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  {/* FIX #3: Hide columns on mobile for responsiveness */}
                  <thead><tr className="border-b bg-gray-50/50 text-gray-500 text-xs uppercase">
                    <th className="text-left px-3 sm:px-4 py-3">Usuário</th>
                    <th className="text-left px-3 sm:px-4 py-3">Plano</th>
                    <th className="text-left px-3 sm:px-4 py-3">Status</th>
                    <th className="text-left px-3 sm:px-4 py-3 hidden sm:table-cell">Método</th>
                    <th className="text-left px-3 sm:px-4 py-3 hidden md:table-cell">Início</th>
                    <th className="text-left px-3 sm:px-4 py-3">Ações</th>
                  </tr></thead>
                  <tbody>
                    {assinaturas.map((ass: Record<string, unknown>) => {
                      const user = (ass.user as Record<string, unknown>) || {};
                      const plano = (ass.plano as Record<string, unknown>) || {};
                      const status = (ass.status as string) || "pending";
                      return (
                        <tr key={ass.id as string} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-3 sm:px-4 py-3">
                            <p className="font-medium text-gray-900 truncate max-w-[120px] sm:max-w-none">{(user.display_name as string) || (user.email as string)?.split("@")[0]}</p>
                            <p className="text-xs text-gray-500 truncate max-w-[150px] sm:max-w-none">{user.email as string}</p>
                          </td>
                          <td className="px-3 sm:px-4 py-3">
                            <p className="text-gray-900 font-medium truncate max-w-[100px] sm:max-w-none">{plano.nome as string}</p>
                            <p className="text-xs text-gray-400">R$ {Number(plano.preco).toFixed(2).replace(",", ".")}</p>
                          </td>
                          <td className="px-3 sm:px-4 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold ${statusColors[status] || "bg-gray-100 text-gray-600"}`}>
                              {statusLabels[status] || status}
                            </span>
                          </td>
                          {/* FIX #3: Hidden on mobile */}
                          <td className="px-3 sm:px-4 py-3 capitalize text-gray-600 hidden sm:table-cell">{ass.metodo_pagamento as string || "—"}</td>
                          {/* FIX #3: Hidden on small screens */}
                          <td className="px-3 sm:px-4 py-3 text-gray-500 hidden md:table-cell">{ass.data_inicio ? new Date(ass.data_inicio as string).toLocaleDateString("pt-BR") : "—"}</td>
                          <td className="px-3 sm:px-4 py-3">
                            <button
                              onClick={() => onOpenStatusChange(ass.id as string, status)}
                              disabled={changingStatus === (ass.id as string)}
                              className="text-xs font-semibold text-amber-600 hover:text-amber-800 disabled:opacity-50"
                            >
                              Alterar status
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {!assinaturasLoading && assinaturas.length === 0 && (
            <div className="text-center py-12 text-gray-400"><p className="text-sm">Nenhuma assinatura registrada.</p></div>
          )}
        </>
      )}

      {/* ══ Sub-tab: Planos ══ */}
      {innerTab === "planos" && (
        <>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Planos e Mercado Pago</h2>
              <p className="text-sm text-gray-500 mt-1">Gerencie os planos de assinatura.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onFetchPlanos} className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600">
                <RefreshCw className="w-4 h-4" />
              </button>
              <Button onClick={openCreatePlano} className="flex items-center gap-2 bg-[#0D1B2A] to-gray-700 text-white hover:from-gray-800 hover:to-gray-600 shadow-md rounded-xl h-9 px-4 text-xs font-semibold">
                <Plus className="w-4 h-4" /> Novo Plano
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            {planosAdmin.map((plano: Record<string, unknown>) => {
              const hasMpId = !!plano.mercadopago_plan_id;
              const isAtivo = plano.ativo as boolean;
              return (
                <div key={plano.id as string} className={`bg-white rounded-xl p-4 sm:p-5 border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${!isAtivo ? "opacity-60" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900">{plano.nome as string}</p>
                      {hasMpId ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold"><Check className="w-3 h-3" /> MP</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-semibold">Sem MP</span>
                      )}
                      {isAtivo ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold">Ativo</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-semibold">Inativo</span>
                      )}
                      {Boolean(plano.popular) && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold">Popular</span>
                      )}
                      {Boolean(plano.maior_economia) && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold">Maior economia</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">
                      R$ {Number(plano.preco).toFixed(2).replace(",", ".")} — {(plano.periodo_meses as number)}{"mes" + ((plano.periodo_meses as number) > 1 ? "es" : "")}
                      {plano.descricao ? ` — ${plano.descricao}` : ""}
                    </p>
                    {hasMpId && (
                      <p className="text-xs text-gray-400 mt-0.5 font-mono truncate">MP: {plano.mercadopago_plan_id as string}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => onTogglePlano(plano.id as string, isAtivo, plano.nome as string)} disabled={togglingPlano === (plano.id as string)} className={`p-2 rounded-lg border transition-colors text-xs ${isAtivo ? "border-red-200 text-red-500 hover:bg-red-50" : "border-emerald-200 text-emerald-500 hover:bg-emerald-50"} disabled:opacity-50`} title={isAtivo ? "Desativar" : "Ativar"}>
                      {togglingPlano === (plano.id as string) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isAtivo ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => openEditPlano(plano)} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors" title="Editar">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteConfirm(plano.id as string)} disabled={deletingPlano === (plano.id as string)} className="p-2 rounded-lg border border-red-200 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50" title="Excluir">
                      {deletingPlano === (plano.id as string) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                    {!hasMpId && (
                      <button onClick={() => onSyncPlano(plano.id as string, plano.nome as string)} disabled={syncingPlano === (plano.id as string)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors disabled:opacity-50">
                        {syncingPlano === (plano.id as string) ? <><Loader2 className="w-3 h-3 animate-spin" /> Sync...</> : "Sync MP"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {planosAdmin.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <p className="text-sm">Nenhum plano cadastrado.</p>
                <Button onClick={openCreatePlano} variant="outline" className="mt-3 rounded-xl text-xs">Criar primeiro plano</Button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══ Dialog: Criar/Editar Plano ══ */}
      <Dialog open={showPlanoDialog} onOpenChange={setShowPlanoDialog}>
        {/* FIX #4: max-h with overflow for mobile */}
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{planoForm.id ? "Editar Plano" : "Novo Plano"}</DialogTitle>
            <DialogDescription>
              {planoForm.id ? "Altere os dados do plano abaixo." : "Preencha os dados para criar um novo plano."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* FIX #5: grid-cols-1 on mobile, cols-2 on sm+ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="text-sm font-medium text-gray-700">Nome *</label>
                <input value={planoForm.nome} onChange={(e) => setPlanoForm((p) => ({ ...p, nome: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white" placeholder="Ex: Mensal, Trimestral..." />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Preço (R$) *</label>
                <input type="number" step="0.01" min="0" inputMode="decimal" value={planoForm.preco} onChange={(e) => setPlanoForm((p) => ({ ...p, preco: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white" placeholder="49.90" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Período (meses) *</label>
                <input type="number" min="1" step="1" inputMode="numeric" value={planoForm.periodo_meses} onChange={(e) => setPlanoForm((p) => ({ ...p, periodo_meses: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white" placeholder="1" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Ordem</label>
                <input type="number" min="0" step="1" inputMode="numeric" value={planoForm.ordem} onChange={(e) => setPlanoForm((p) => ({ ...p, ordem: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white" placeholder="Auto" />
              </div>
              {/* FIX #12: Checkboxes stack vertically on mobile */}
              <div className="sm:col-span-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={planoForm.popular} onChange={(e) => setPlanoForm((p) => ({ ...p, popular: e.target.checked }))} className="rounded border-gray-300" />
                  <span className="text-sm text-gray-700">Popular</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={planoForm.maior_economia} onChange={(e) => setPlanoForm((p) => ({ ...p, maior_economia: e.target.checked }))} className="rounded border-gray-300" />
                  <span className="text-sm text-gray-700">Maior economia</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={planoForm.ativo} onChange={(e) => setPlanoForm((p) => ({ ...p, ativo: e.target.checked }))} className="rounded border-gray-300" />
                  <span className="text-sm text-gray-700">Ativo</span>
                </label>
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium text-gray-700">Descrição</label>
                <textarea value={planoForm.descricao} onChange={(e) => setPlanoForm((p) => ({ ...p, descricao: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" rows={2} placeholder="Descrição breve do plano..." />
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium text-gray-700">Features (separadas por vírgula)</label>
                <textarea value={planoForm.features} onChange={(e) => setPlanoForm((p) => ({ ...p, features: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" rows={3} placeholder="Espelho de vendas, Todos os empreendimentos, Suporte..." />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowPlanoDialog(false)} className="flex-1 rounded-xl" disabled={savingPlano}>Cancelar</Button>
            <Button onClick={handleSavePlanoForm} disabled={savingPlano || !planoForm.nome.trim() || !planoForm.preco || !planoForm.periodo_meses} className="flex-1 rounded-xl bg-gray-900 hover:bg-gray-800 text-white">
              {savingPlano ? <Loader2 className="w-4 h-4 animate-spin" /> : planoForm.id ? "Salvar alterações" : "Criar plano"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ Dialog: Confirmar exclusão ══ */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir plano?</DialogTitle>
            <DialogDescription>Esta ação não pode ser desfeita. Se houver assinaturas ativas, a exclusão será bloqueada.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} className="flex-1 rounded-xl">Cancelar</Button>
            <Button onClick={() => { if (deleteConfirm) { onDeletePlano(deleteConfirm); setDeleteConfirm(null); } }} disabled={!deleteConfirm || deletingPlano !== null} variant="destructive" className="flex-1 rounded-xl">
              {deletingPlano ? <Loader2 className="w-4 h-4 animate-spin" /> : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ Dialog: Alterar status da assinatura ══ */}
      <Dialog open={!!statusChangeDialog} onOpenChange={(open) => !open && onSetStatusChangeDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar status da assinatura</DialogTitle>
            <DialogDescription>Status atual: {statusChangeDialog?.currentStatus}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-gray-700">Novo status</label>
              <select value={newStatus} onChange={(e) => onSetNewStatus(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white">
                <option value="">Selecionar...</option>
                <option value="active">Ativa</option>
                <option value="lifetime">Vitalícia</option>
                <option value="paused">Pausada</option>
                <option value="cancelled">Cancelada</option>
                <option value="expired">Expirada</option>
                <option value="pending">Pendente</option>
              </select>
            </div>
            {(newStatus === "cancelled" || newStatus === "expired") && (
              <div>
                <label className="text-sm font-medium text-gray-700">Motivo</label>
                <textarea value={statusMotivo} onChange={(e) => onSetStatusMotivo(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" rows={2} placeholder="Motivo do cancelamento ou expiração..." />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onSetStatusChangeDialog(null)} className="flex-1 rounded-xl">Cancelar</Button>
            <Button onClick={onConfirmStatusChange} disabled={!newStatus || changingStatus !== null} className="flex-1 rounded-xl bg-gray-900 hover:bg-gray-800 text-white">
              {changingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ Dialog: Ativação manual ══ */}
      <Dialog open={showActivateDialog} onOpenChange={setShowActivateDialog}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ativar assinatura manualmente</DialogTitle>
            <DialogDescription>Selecione o usuário, o plano e forneça um motivo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-gray-700">Usuário *</label>
              {activateFetchingUsers ? (
                <div className="mt-1 flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>
              ) : (
                <select value={activateForm.userId} onChange={(e) => setActivateForm((f) => ({ ...f, userId: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white">
                  <option value="">Selecionar...</option>
                  {activateUsers.map((u) => <option key={u.id as string} value={u.id as string}>{(u.display_name || u.email) as string}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Plano *</label>
              <select value={activateForm.planoId} onChange={(e) => setActivateForm((f) => ({ ...f, planoId: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white">
                <option value="">Selecionar...</option>
                {(planosAdmin.filter(p => p.ativo) as Array<Record<string, unknown>>).map((p) => <option key={p.id as string} value={p.id as string}>{p.nome as string} — R$ {Number(p.preco).toFixed(2)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Motivo * <span className="text-xs text-gray-400">(mín. 10 caracteres)</span></label>
              <textarea value={activateForm.motivo} onChange={(e) => setActivateForm((f) => ({ ...f, motivo: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" rows={3} placeholder="Ex: Usuário tinha assinatura legada..." />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowActivateDialog(false)} className="flex-1 rounded-xl" disabled={activateLoading}>Cancelar</Button>
            <Button
              onClick={handleActivateManual}
              disabled={activateLoading || !activateForm.userId || !activateForm.planoId || activateForm.motivo.trim().length < 10}
              className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {activateLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ativar assinatura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ Dialog: Conceder vitalício ══ */}
      <Dialog open={showLifetimeDialog} onOpenChange={setShowLifetimeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Conceder plano vitalício</DialogTitle>
            <DialogDescription>Conceda acesso vitalício a um usuário. Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-gray-700">Usuário *</label>
              {activateFetchingUsers ? (
                <div className="mt-1 flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>
              ) : (
                <select value={lifetimeForm.userId} onChange={(e) => setLifetimeForm((f) => ({ ...f, userId: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white">
                  <option value="">Selecionar...</option>
                  {activateUsers.map((u) => <option key={u.id as string} value={u.id as string}>{(u.display_name || u.email) as string}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Motivo da concessão * <span className="text-xs text-gray-400">(mín. 15 caracteres)</span></label>
              <textarea value={lifetimeForm.motivo} onChange={(e) => setLifetimeForm((f) => ({ ...f, motivo: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" rows={3} placeholder="Ex: Parceiro estratégico, colaborador interno, acordo comercial..." />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowLifetimeDialog(false)} className="flex-1 rounded-xl" disabled={lifetimeLoading}>Cancelar</Button>
            <Button onClick={handleGrantLifetime} disabled={lifetimeLoading || !lifetimeForm.userId || lifetimeForm.motivo.trim().length < 15} className="flex-1 rounded-xl bg-purple-600 hover:bg-purple-700 text-white">
              {lifetimeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Conceder vitalício"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Fix Legacy confirmation ── */}
      <ConfirmDialog
        open={fixLegacyConfirm}
        title="Corrigir usuários legados?"
        description="Esta ação irá corrigir assinaturas de usuários que pagaram mas não possuem registro ativo. Isso modificará dados de múltiplos usuários automaticamente."
        confirmLabel="Corrigir Legados"
        variant="warning"
        onConfirm={handleFixLegacy}
        onCancel={() => setFixLegacyConfirm(false)}
        loading={fixLegacyLoading}
      />

      {/* ── Save Plano confirmation (edit only) ── */}
      <ConfirmDialog
        open={savePlanoConfirm}
        title="Salvar alterações no plano?"
        description={`As informações do plano "${planoForm.nome}" serão atualizadas. Se o preço ou período foram alterados, a sincronização com o Mercado Pago será desfeita e deverá ser feita novamente.`}
        confirmLabel="Salvar alterações"
        variant="warning"
        onConfirm={executePlanoSave}
        onCancel={() => setSavePlanoConfirm(false)}
        loading={savingPlano}
      />
    </div>
  );
}

export default React.memo(AssinaturasTab);