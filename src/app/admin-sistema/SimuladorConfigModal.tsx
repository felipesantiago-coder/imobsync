"use client";

import React, { useState, useEffect } from "react";
import {
  Calculator, X, Loader2, Save, Trash2, Settings,
} from "lucide-react";

const MESES = [
  { value: 1, label: "Janeiro" }, { value: 2, label: "Fevereiro" }, { value: 3, label: "Março" },
  { value: 4, label: "Abril" }, { value: 5, label: "Maio" }, { value: 6, label: "Junho" },
  { value: 7, label: "Julho" }, { value: 8, label: "Agosto" }, { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" }, { value: 11, label: "Novembro" }, { value: 12, label: "Dezembro" },
];

interface SimuladorConfig {
  id?: string;
  empreendimento_id: string;
  entrega_mes: number;
  entrega_ano: number;
  percentual_sinal: number;
  percentual_captacao: number;
  semestrais_habilitado: boolean;
  anuais_habilitado: boolean;
  intermediarias_habilitado: boolean;
  parcela_unica_habilitada: boolean;
  taxa_decoracao: boolean;
  taxa_decoracao_valor: number | null;
  taxa_decoracao_parcelas: number | null;
  taxa_decoracao_inicio: string | null;
  taxa_decoracao_fim: string | null;
}

interface SimuladorConfigModalProps {
  empreendimentoId: string;
  empreendimentoNome: string;
  open: boolean;
  onClose: () => void;
  onSave: () => void;
}

export default function SimuladorConfigModal({
  empreendimentoId,
  empreendimentoNome,
  open,
  onClose,
  onSave,
}: SimuladorConfigModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [existingConfig, setExistingConfig] = useState(false);

  const [form, setForm] = useState<SimuladorConfig>({
    empreendimento_id: empreendimentoId,
    entrega_mes: 12,
    entrega_ano: new Date().getFullYear() + 2,
    percentual_sinal: 5,
    percentual_captacao: 30,
    semestrais_habilitado: false,
    anuais_habilitado: false,
    intermediarias_habilitado: false,
    parcela_unica_habilitada: false,
    taxa_decoracao: false,
    taxa_decoracao_valor: null,
    taxa_decoracao_parcelas: null,
    taxa_decoracao_inicio: null,
    taxa_decoracao_fim: null,
  });

  // Carregar config existente
  useEffect(() => {
    if (!open) return;
    setError("");
    setSuccess("");
    setLoading(true);
    fetch(`/api/admin-sistema/simulador-config?empreendimento_id=${empreendimentoId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.config) {
          setForm(data.config);
          setExistingConfig(true);
        } else {
          setForm({
            empreendimento_id: empreendimentoId,
            entrega_mes: 12,
            entrega_ano: new Date().getFullYear() + 2,
            percentual_sinal: 5,
            percentual_captacao: 30,
            semestrais_habilitado: false,
            anuais_habilitado: false,
            intermediarias_habilitado: false,
            parcela_unica_habilitada: false,
            taxa_decoracao: false,
            taxa_decoracao_valor: null,
            taxa_decoracao_parcelas: null,
            taxa_decoracao_inicio: null,
            taxa_decoracao_fim: null,
          });
          setExistingConfig(false);
        }
      })
      .catch(() => setError("Erro ao carregar configuração."))
      .finally(() => setLoading(false));
  }, [open, empreendimentoId]);

  const setField = (field: keyof SimuladorConfig, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
    setSuccess("");
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const url = "/api/admin-sistema/simulador-config";
      const method = existingConfig ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erro ao salvar.");
        return;
      }

      setExistingConfig(true);
      setSuccess("Configuração salva com sucesso!");
      onSave();
    } catch {
      setError("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Remover a configuração do simulador?")) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/admin-sistema/simulador-config?empreendimento_id=${empreendimentoId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Erro ao remover.");
        return;
      }
      setExistingConfig(false);
      setSuccess("Configuração removida.");
      onSave();
    } catch {
      setError("Erro de conexão.");
    } finally {
      setDeleting(false);
    }
  };

  if (!open) return null;

  const anoAtual = new Date().getFullYear();
  const anos = Array.from({ length: 15 }, (_, i) => anoAtual + i);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-2xl z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#0D1B2A] flex items-center justify-center">
                <Calculator className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Configurar Simulador</h2>
                <p className="text-xs text-gray-500">{empreendimentoNome}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              {/* Mensagens */}
              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
                  <X className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}
              {success && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 flex items-center gap-2">
                  <Save className="w-4 h-4 shrink-0" /> {success}
                </div>
              )}

              {/* Data de Entrega */}
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                  <Settings className="w-4 h-4" /> Data de Entrega
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Mês</label>
                    <select
                      value={form.entrega_mes}
                      onChange={(e) => setField("entrega_mes", parseInt(e.target.value))}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-[#0D1B2A]/20 focus:border-[#0D1B2A] outline-none"
                    >
                      {MESES.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Ano</label>
                    <select
                      value={form.entrega_ano}
                      onChange={(e) => setField("entrega_ano", parseInt(e.target.value))}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-[#0D1B2A]/20 focus:border-[#0D1B2A] outline-none"
                    >
                      {anos.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Percentuais Padrão */}
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-3">Percentuais Padrão</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Sinal Ato (%)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="100"
                      value={form.percentual_sinal}
                      onChange={(e) => setField("percentual_sinal", parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-[#0D1B2A]/20 focus:border-[#0D1B2A] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Captação During Obras (%)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      max="100"
                      value={form.percentual_captacao}
                      onChange={(e) => setField("percentual_captacao", parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-[#0D1B2A]/20 focus:border-[#0D1B2A] outline-none"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Sinal + mensais + opcionais + parcela única = captação</p>
                  </div>
                </div>
              </div>

              {/* Tipos de Parcela Opcionais */}
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-3">Parcelas Opcionais</h3>
                <p className="text-xs text-gray-400 mb-3">Mensais e financiamento são sempre obrigatórios. Selecione quais parcelas opcionais estarão disponíveis no simulador.</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: "semestrais_habilitado" as const, label: "Parcelas Semestrais", desc: "A cada 6 meses" },
                    { key: "anuais_habilitado" as const, label: "Parcelas Anuais", desc: "Anualmente até a entrega" },
                    { key: "intermediarias_habilitado" as const, label: "Parcelas Intermediárias", desc: "Datas livres definidas pelo usuário" },
                    { key: "parcela_unica_habilitada" as const, label: "Parcela Única", desc: "No mês de entrega" },
                  ].map((item) => (
                    <label
                      key={item.key}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        form[item.key]
                          ? "border-[#0D1B2A] bg-[#0D1B2A]/5"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={form[item.key]}
                        onChange={(e) => setField(item.key, e.target.checked)}
                        className="w-4 h-4 rounded accent-[#0D1B2A]"
                      />
                      <div>
                        <span className="text-sm font-semibold text-gray-800">{item.label}</span>
                        <p className="text-[10px] text-gray-400">{item.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Taxa de Decoração */}
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-3">Taxa de Decoração</h3>
                <label className="flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all mb-3 border-gray-200 hover:border-gray-300">
                  <input
                    type="checkbox"
                    checked={form.taxa_decoracao}
                    onChange={(e) => setField("taxa_decoracao", e.target.checked)}
                    className="w-4 h-4 rounded accent-[#0D1B2A]"
                  />
                  <div>
                    <span className="text-sm font-semibold text-gray-800">Possui taxa de decoração</span>
                    <p className="text-[10px] text-gray-400">Não conta para o percentual de captação</p>
                  </div>
                </label>

                {form.taxa_decoracao && (
                  <div className="grid grid-cols-2 gap-3 pl-7 border-l-2 border-gray-200 ml-2 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Valor Total (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.taxa_decoracao_valor || ""}
                        onChange={(e) => setField("taxa_decoracao_valor", parseFloat(e.target.value) || null)}
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-[#0D1B2A]/20 focus:border-[#0D1B2A] outline-none"
                        placeholder="Ex: 15000"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Nº de Parcelas</label>
                      <input
                        type="number"
                        min="1"
                        value={form.taxa_decoracao_parcelas || ""}
                        onChange={(e) => setField("taxa_decoracao_parcelas", parseInt(e.target.value) || null)}
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-[#0D1B2A]/20 focus:border-[#0D1B2A] outline-none"
                        placeholder="Ex: 10"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Início do Pagamento</label>
                      <input
                        type="date"
                        value={form.taxa_decoracao_inicio || ""}
                        onChange={(e) => setField("taxa_decoracao_inicio", e.target.value || null)}
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-[#0D1B2A]/20 focus:border-[#0D1B2A] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Fim do Pagamento</label>
                      <input
                        type="date"
                        value={form.taxa_decoracao_fim || ""}
                        onChange={(e) => setField("taxa_decoracao_fim", e.target.value || null)}
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-[#0D1B2A]/20 focus:border-[#0D1B2A] outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && (
          <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 rounded-b-2xl flex items-center justify-between">
            {existingConfig ? (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-all disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Remover Configuração
              </button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#0D1B2A] text-white hover:bg-gray-800 transition-all shadow-md disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {existingConfig ? "Atualizar" : "Salvar Configuração"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
