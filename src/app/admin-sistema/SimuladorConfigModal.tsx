"use client";

import React, { useState, useEffect } from "react";
import {
  Calculator, X, Loader2, Save, Trash2, Settings, AlertTriangle,
} from "lucide-react";
import ConfirmDialog from "@/components/confirm-dialog";
import {
  formatJurosPosHabitese,
  posHabiteseIndexLabel,
} from "@/lib/pos-habitese";
import {
  clampCaptacaoPct,
  clampFinDiretoParcelas,
} from "@/lib/financiamento-direto";
import { limiteParcelasMensais } from "@/lib/parcelas-limite";

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
  sinal_parcelavel: boolean;
  sinal_max_parcelas: number | null;
  percentual_captacao: number;
  semestrais_habilitado: boolean;
  anuais_habilitado: boolean;
  intermediarias_habilitado: boolean;
  parcela_unica_habilitada: boolean;
  parcela_unica_data_habilitada: boolean;
  parcela_unica_data: string | null;
  indice_pos_habitese: string;
  juros_pos_habitese: number;
  taxa_decoracao: boolean;
  taxa_decoracao_valor: number | null;
  taxa_decoracao_parcelas: number | null;
  taxa_decoracao_inicio: string | null;
  taxa_decoracao_fim: string | null;
  fin_direto_construtora: boolean;
  fin_direto_parcelas: number;
  fin_direto_captacao_pct: number;
  parcelas_ate_entrega: boolean;
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
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [saveConfirm, setSaveConfirm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [existingConfig, setExistingConfig] = useState(false);
  const [isLegacy, setIsLegacy] = useState(false);

  const [form, setForm] = useState<SimuladorConfig>({
    empreendimento_id: empreendimentoId,
    entrega_mes: 12,
    entrega_ano: new Date().getFullYear() + 2,
    percentual_sinal: 5,
    sinal_parcelavel: true,
    sinal_max_parcelas: 3,
    percentual_captacao: 30,
    semestrais_habilitado: false,
    anuais_habilitado: false,
    intermediarias_habilitado: false,
    parcela_unica_habilitada: false,
    parcela_unica_data_habilitada: false,
    parcela_unica_data: null,
    indice_pos_habitese: "igpm",
    juros_pos_habitese: 1,
    taxa_decoracao: false,
    taxa_decoracao_valor: null,
    taxa_decoracao_parcelas: null,
    taxa_decoracao_inicio: null,
    taxa_decoracao_fim: null,
    fin_direto_construtora: false,
    fin_direto_parcelas: 120,
    fin_direto_captacao_pct: 40,
    parcelas_ate_entrega: false,
  });

  // Carregar config existente
  useEffect(() => {
    if (!open) return;
    setError("");
    setSuccess("");
    setLoading(true);
    fetch(`/api/admin-sistema/simulador-config?empreendimento_id=${empreendimentoId}`)
      .then((r) => r.json())
      .then(async (data) => {
        if (data.config) {
          setForm((prev) => ({ ...prev, ...data.config }));
          setExistingConfig(true);
        } else {
          // Check if this empreendimento has a legacy simulator (slug-based route)
          const slugRes = await fetch(`/api/empreendimentos`);
          if (slugRes.ok) {
            const slugData = await slugRes.json();
            const emp = (slugData.empreendimentos || []).find((e: Record<string, unknown>) => e.id === empreendimentoId);
            setIsLegacy(!!emp?.slug);
          }
          setForm({
            empreendimento_id: empreendimentoId,
            entrega_mes: 12,
            entrega_ano: new Date().getFullYear() + 2,
            percentual_sinal: 5,
            sinal_parcelavel: true,
            sinal_max_parcelas: 3,
            percentual_captacao: 30,
            semestrais_habilitado: false,
            anuais_habilitado: false,
            intermediarias_habilitado: false,
            parcela_unica_habilitada: false,
            parcela_unica_data_habilitada: false,
            parcela_unica_data: null,
            indice_pos_habitese: "igpm",
            juros_pos_habitese: 1,
            taxa_decoracao: false,
            taxa_decoracao_valor: null,
            taxa_decoracao_parcelas: null,
            taxa_decoracao_inicio: null,
            taxa_decoracao_fim: null,
            fin_direto_construtora: false,
            fin_direto_parcelas: 120,
            fin_direto_captacao_pct: 40,
            parcelas_ate_entrega: false,
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

  // Meses-limite das opções de vencimento (recalculados conforme a data de
  // entrega escolhida — inclusive a fronteira de Janeiro, que recua um ano).
  const limiteAnterior = limiteParcelasMensais(form.entrega_mes, form.entrega_ano, false);
  const limiteEntrega = limiteParcelasMensais(form.entrega_mes, form.entrega_ano, true);
  const mesLabel = (m: number) => MESES[m - 1]?.label ?? `mês ${m}`;
  const limiteAnteriorLabel = `Até ${mesLabel(limiteAnterior.month)} de ${limiteAnterior.year}`;
  const limiteEntregaLabel = `Até ${mesLabel(limiteEntrega.month)} de ${limiteEntrega.year}`;

  const handleSave = () => {
    if (form.parcela_unica_data_habilitada && !form.parcela_unica_data) {
      setError("Informe a data da Parcela Única ou desative a opção.");
      return;
    }
    // Show confirmation before saving
    setSaveConfirm(true);
  };

  const executeSave = async () => {
    setSaveConfirm(false);
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
    setDeleteConfirm(false);
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

              {/* Aviso: empreendimento legado */}
              {!existingConfig && isLegacy && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Este empreendimento já possui um simulador ativo. Ao salvar esta configuração, o simulador atual será substituído pelo novo simulador parametrizado.</span>
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

              {/* Vencimento das Parcelas Mensais */}
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-3">Vencimento das Parcelas Mensais</h3>
                <label className="block text-xs font-medium text-gray-600 mb-1">Último mês de vencimento das parcelas mensais:</label>
                <select
                  value={form.parcelas_ate_entrega ? "entrega" : "anterior"}
                  onChange={(e) => setField("parcelas_ate_entrega", e.target.value === "entrega")}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-[#0D1B2A]/20 focus:border-[#0D1B2A] outline-none"
                >
                  <option value="anterior">
                    {limiteAnteriorLabel} — mês anterior à entrega (padrão)
                  </option>
                  <option value="entrega">
                    {limiteEntregaLabel} — mês da entrega, inclusive
                  </option>
                </select>
                <div className="text-[10px] text-gray-400 mt-1.5 space-y-0.5">
                  <p>
                    • <strong className="font-semibold text-gray-500">Até o mês anterior:</strong> a última parcela mensal vence um mês antes do habite-se.
                  </p>
                  <p>
                    • <strong className="font-semibold text-gray-500">Até o mês da entrega:</strong> a última parcela mensal vence no próprio mês do habite-se.
                  </p>
                  <p>
                    Vale para os dois cenários do simulador (financiamento bancário e financiamento direto) e também para o limite das parcelas semestrais e anuais.
                  </p>
                </div>
                {form.parcela_unica_habilitada && form.parcelas_ate_entrega && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700 flex items-start gap-2 mt-3">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Com esta combinação, a última parcela mensal e a Parcela Única Habite-se vencem no mesmo mês (o da entrega). Confirme se esta é a regra comercial desejada.
                    </span>
                  </div>
                )}
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

              {/* Parcelamento do Sinal Ato */}
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-3">Parcelamento do Sinal Ato</h3>
                <label className="flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all mb-3 border-gray-200 hover:border-gray-300">
                  <input
                    type="checkbox"
                    checked={form.sinal_parcelavel}
                    onChange={(e) => setField("sinal_parcelavel", e.target.checked)}
                    className="w-4 h-4 rounded accent-[#0D1B2A]"
                  />
                  <div>
                    <span className="text-sm font-semibold text-gray-800">Sinal ato pode ser parcelado</span>
                    <p className="text-[10px] text-gray-400">Se desativado, o sinal só poderá ser pago à vista (1 parcela)</p>
                  </div>
                </label>

                {form.sinal_parcelavel && (
                  <div className="pl-7 border-l-2 border-gray-200 ml-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nº máximo de parcelas</label>
                    <select
                      value={form.sinal_max_parcelas || 3}
                      onChange={(e) => setField("sinal_max_parcelas", parseInt(e.target.value))}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-[#0D1B2A]/20 focus:border-[#0D1B2A] outline-none"
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n} {n === 1 ? "parcela" : "parcelas"}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-gray-400 mt-1">O usuário poderá escolher de 1 até este limite</p>
                  </div>
                )}
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
                    { key: "parcela_unica_habilitada" as const, label: "Parcela Única Habite-se", desc: "No mês do habite-se (entrega)" },
                    { key: "parcela_unica_data_habilitada" as const, label: "Parcela Única", desc: "Em data definida por você" },
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

                {form.parcela_unica_data_habilitada && (
                  <div className="pl-7 border-l-2 border-gray-200 ml-2 mt-3">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Data da Parcela Única
                    </label>
                    <input
                      type="date"
                      value={form.parcela_unica_data || ""}
                      onChange={(e) => setField("parcela_unica_data", e.target.value || null)}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-[#0D1B2A]/20 focus:border-[#0D1B2A] outline-none"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">
                      O usuário informará apenas o valor; a data desta parcela é fixa para o empreendimento.
                    </p>
                  </div>
                )}
              </div>

              {/* Correção Pós-Habite-se */}
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-3">Correção Pós-Habite-se</h3>
                <p className="text-xs text-gray-400 mb-3">
                  Durante as obras o saldo devedor é sempre corrigido pelo INCC. Após a emissão do habite-se, passa a valer o índice e os juros abaixo.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Índice de correção</label>
                    <select
                      value={form.indice_pos_habitese}
                      onChange={(e) => setField("indice_pos_habitese", e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-[#0D1B2A]/20 focus:border-[#0D1B2A] outline-none"
                    >
                      <option value="igpm">IGPM</option>
                      <option value="ipca">IPCA</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Juros (% ao mês)</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max="20"
                      value={form.juros_pos_habitese}
                      onChange={(e) => setField("juros_pos_habitese", parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-[#0D1B2A]/20 focus:border-[#0D1B2A] outline-none"
                      placeholder="Ex: 1 ou 0,80"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mt-3">
                  Após o habite-se: saldo devedor corrigido por <strong>{posHabiteseIndexLabel(form.indice_pos_habitese)} + juros de {formatJurosPosHabitese(form.juros_pos_habitese)} ao mês</strong>.
                </p>
              </div>

              {/* Financiamento Direto com a Construtora (pós-obra) */}
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-3">Financiamento Direto com a Construtora (pós-obra)</h3>
                <label className="flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all mb-3 border-gray-200 hover:border-gray-300">
                  <input
                    type="checkbox"
                    checked={form.fin_direto_construtora}
                    onChange={(e) => setField("fin_direto_construtora", e.target.checked)}
                    className="w-4 h-4 rounded accent-[#0D1B2A]"
                  />
                  <div>
                    <span className="text-sm font-semibold text-gray-800">Habilitar opção de financiamento direto</span>
                    <p className="text-[10px] text-gray-400">
                      O usuário poderá escolher entre o cenário padrão (financiamento bancário) e o financiamento direto com a construtora.
                    </p>
                  </div>
                </label>

                {form.fin_direto_construtora && (
                  <div className="pl-7 border-l-2 border-gray-200 ml-2 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Nº de parcelas após a entrega</label>
                        <input
                          type="number"
                          min="1"
                          max="360"
                          value={form.fin_direto_parcelas}
                          onChange={(e) => setField("fin_direto_parcelas", clampFinDiretoParcelas(e.target.value))}
                          className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-[#0D1B2A]/20 focus:border-[#0D1B2A] outline-none"
                          placeholder="Ex: 120"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Captação neste cenário (%)</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="100"
                          value={form.fin_direto_captacao_pct}
                          onChange={(e) => setField("fin_direto_captacao_pct", clampCaptacaoPct(e.target.value))}
                          className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-[#0D1B2A]/20 focus:border-[#0D1B2A] outline-none"
                          placeholder="Ex: 40"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      Neste cenário, o saldo devedor após a entrega é financiado diretamente pela construtora em{" "}
                      <strong>{form.fin_direto_parcelas} parcelas mensais fixas (sistema PRICE)</strong>, com taxa estimada pela média do{" "}
                      <strong>{posHabiteseIndexLabel(form.indice_pos_habitese)} + juros de {formatJurosPosHabitese(form.juros_pos_habitese)} ao mês</strong>{" "}
                      (escolhidos acima). A meta de captação durante as obras passa a ser {form.fin_direto_captacao_pct}%.
                    </p>
                  </div>
                )}
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
                onClick={() => setDeleteConfirm(true)}
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

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteConfirm}
        title="Remover configuração do simulador?"
        description={isLegacy
          ? "Ao remover, o sistema voltará a usar o simulador original deste empreendimento."
          : "Ao remover, este empreendimento ficará sem simulador configurado."
        }
        confirmLabel="Remover"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(false)}
        loading={deleting}
      />

      {/* Save confirmation */}
      <ConfirmDialog
        open={saveConfirm}
        title={existingConfig ? "Atualizar configuração do simulador?" : "Salvar configuração do simulador?"}
        description={isLegacy && !existingConfig
          ? `Ao salvar, o simulador original de "${empreendimentoNome}" será substituído pelo novo simulador parametrizado. Esta ação não pode ser desfeita automaticamente — será necessário excluir a configuração para voltar ao simulador original.`
          : existingConfig
            ? `As configurações do simulador de "${empreendimentoNome}" serão atualizadas.`
            : `Um novo simulador parametrizado será criado para "${empreendimentoNome}".`
        }
        confirmLabel={existingConfig ? "Atualizar" : "Salvar"}
        variant={isLegacy && !existingConfig ? "danger" : "warning"}
        onConfirm={executeSave}
        onCancel={() => setSaveConfirm(false)}
        loading={saving}
      />
    </div>
  );
}
