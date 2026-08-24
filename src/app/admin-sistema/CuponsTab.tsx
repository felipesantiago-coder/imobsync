"use client";

import React, { useState, useCallback, useEffect } from "react";
import {
  Plus, Trash2, Pencil, Check, AlertCircle, Loader2, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/confirm-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

// ─── Types ─────────────────────────────────────────────────────────────
interface CuponsTabProps {
  addToast: (type: "success" | "error", msg: string) => void;
  planosAdmin: Record<string, unknown>[];
}

interface CupomForm {
  id?: string;
  codigo: string;
  tipo_desconto: "percentual" | "fixo";
  valor_desconto: string;
  usos_maximos: string;
  valido_a_partir: string;
  valido_ate: string;
  ativo: boolean;
  planos_ids: string[];
}

const EMPTY_CUPOM_FORM: CupomForm = {
  codigo: "", tipo_desconto: "percentual", valor_desconto: "",
  usos_maximos: "", valido_a_partir: "", valido_ate: "",
  ativo: true, planos_ids: [],
};

// ─── Component ───────────────────────────────────────────────────────────
function CuponsTab({ addToast, planosAdmin }: CuponsTabProps) {
  const [cupons, setCupons] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingCupom, setEditingCupom] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState<CupomForm>(EMPTY_CUPOM_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingAtivo, setTogglingAtivo] = useState<string | null>(null);
  const [toggleConfirm, setToggleConfirm] = useState<{ id: string; ativo: boolean; codigo: string } | null>(null);
  const [saveConfirm, setSaveConfirm] = useState(false);

  const fetchCupons = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin-sistema/cupons");
      if (!res.ok) throw new Error("Erro ao buscar cupons");
      const json = await res.json();
      setCupons(Array.isArray(json.cupons) ? json.cupons : []);
    } catch (err) {
      console.error(err);
      addToast("error", "Erro ao carregar cupons");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { fetchCupons(); }, [fetchCupons]);

  const handleOpenNew = () => {
    setEditingCupom(null);
    setForm(EMPTY_CUPOM_FORM);
    setShowDialog(true);
  };

  const handleOpenEdit = (cupom: Record<string, unknown>) => {
    setEditingCupom(cupom);
    setForm({
      id: cupom.id as string,
      codigo: (cupom.codigo as string) || "",
      tipo_desconto: (cupom.tipo_desconto as "percentual" | "fixo") || "percentual",
      valor_desconto: String(cupom.valor_desconto ?? ""),
      usos_maximos: cupom.usos_maximos != null ? String(cupom.usos_maximos) : "",
      valido_a_partir: (cupom.valido_a_partir as string)?.split("T")[0] || "",
      valido_ate: (cupom.valido_ate as string)?.split("T")[0] || "",
      ativo: (cupom.ativo as boolean) ?? true,
      planos_ids: Array.isArray(cupom.planos_ids) ? (cupom.planos_ids as string[]) : [],
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    const codigo = form.codigo.trim();
    const valor = parseFloat(form.valor_desconto.replace(",", "."));
    if (!codigo || isNaN(valor) || valor <= 0) {
      addToast("error", "Preencha código e valor do desconto.");
      return;
    }
    // For existing cupons, show confirmation first
    if (form.id) {
      setSaveConfirm(true);
      return;
    }
    await executeSave();
  };

  const executeSave = async () => {
    setSaveConfirm(false);
    const codigo = form.codigo.trim();
    const valor = parseFloat(form.valor_desconto.replace(",", "."));
    setSaving(true);
    try {
      const isEdit = !!form.id;
      const method = isEdit ? "PATCH" : "POST";
      const payload: Record<string, unknown> = {
        codigo, tipo_desconto: form.tipo_desconto, valor_desconto: valor,
        usos_maximos: form.usos_maximos ? Number(form.usos_maximos) : null,
        valido_a_partir: form.valido_a_partir || null, valido_ate: form.valido_ate || null,
        ativo: form.ativo, planos_ids: form.planos_ids,
      };
      if (isEdit) payload.id = form.id;
      const res = await fetch("/api/admin-sistema/cupons", {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok) {
        addToast("success", isEdit ? "Cupom atualizado!" : "Cupom criado!");
        setShowDialog(false);
        await fetchCupons();
      } else {
        addToast("error", json.error || "Erro ao salvar cupom.");
      }
    } catch {
      addToast("error", "Erro ao salvar cupom.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/admin-sistema/cupons", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: (deleteTarget.id as string) }),
      });
      const json = await res.json();
      if (res.ok) {
        addToast("success", "Cupom excluído.");
        await fetchCupons();
      } else {
        addToast("error", json.error || "Erro ao excluir cupom.");
      }
    } catch {
      addToast("error", "Erro ao excluir cupom.");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleToggleAtivoRequest = (cupom: Record<string, unknown>) => {
    setToggleConfirm({
      id: cupom.id as string,
      ativo: cupom.ativo as boolean,
      codigo: cupom.codigo as string,
    });
  };

  const handleToggleAtivo = async () => {
    if (!toggleConfirm) return;
    const cupom = cupons.find((c) => c.id === toggleConfirm.id);
    if (!cupom) return;
    setTogglingAtivo(toggleConfirm.id);
    try {
      const res = await fetch("/api/admin-sistema/cupons", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cupom.id, ativo: !(cupom.ativo as boolean) }),
      });
      const json = await res.json();
      if (res.ok) {
        addToast("success", `Cupom ${!(cupom.ativo as boolean) ? "ativado" : "desativado"}!`);
        await fetchCupons();
      } else {
        addToast("error", json.error || "Erro ao alterar status.");
      }
    } catch {
      addToast("error", "Erro ao alterar status.");
    } finally {
      setTogglingAtivo(null);
      setToggleConfirm(null);
    }
  };

  const activePlans = planosAdmin.filter((p) => p.ativo) as Array<Record<string, unknown>>;

  const formatDate = (d: string | null | undefined) => {
    if (!d) return "—";
    try { return new Date(d.includes('T') ? d : d + "T00:00:00").toLocaleDateString("pt-BR"); } catch { return d; }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Cupons</h2>
          <p className="text-sm text-gray-500 mt-1">
            {loading ? "Carregando..." : `${cupons.length} cupom${cupons.length !== 1 ? "s" : ""} cadastrado${cupons.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button onClick={handleOpenNew} className="flex items-center gap-2 bg-[#0D1B2A] to-gray-700 text-white hover:from-gray-800 hover:to-gray-600 shadow-md rounded-xl h-11 px-5 text-sm font-semibold">
          <Plus className="w-4 h-4" /> Novo cupom
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
        </div>
      )}

      {/* FIX #4: Table with responsive column hiding */}
      {!loading && cupons.length > 0 && (
        <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-3 sm:px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Código</th>
                  <th className="text-left px-3 sm:px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Tipo</th>
                  <th className="text-left px-3 sm:px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Valor</th>
                  <th className="text-left px-3 sm:px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Usos</th>
                  <th className="text-left px-3 sm:px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Válido até</th>
                  <th className="text-left px-3 sm:px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-right px-3 sm:px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {cupons.map((c) => (
                  <tr key={c.id as string} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-3 sm:px-5 py-3 sm:py-3.5 font-mono font-semibold text-gray-900">{c.codigo as string}</td>
                    {/* FIX: Hidden on mobile */}
                    <td className="px-3 sm:px-5 py-3 sm:py-3.5 hidden sm:table-cell">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${c.tipo_desconto === "percentual" ? "bg-purple-100 text-purple-700" : "bg-amber-100 text-amber-700"}`}>
                        {c.tipo_desconto === "percentual" ? "%" : "R$"}
                      </span>
                    </td>
                    <td className="px-3 sm:px-5 py-3 sm:py-3.5 text-gray-700">
                      {c.tipo_desconto === "fixo"
                        ? `R$ ${Number(c.valor_desconto).toFixed(2).replace(".", ",")}`
                        : `${Number(c.valor_desconto).toFixed(2).replace(".", ",")}%`}
                    </td>
                    {/* FIX: Hidden on small screens */}
                    <td className="px-3 sm:px-5 py-3 sm:py-3.5 text-gray-700 hidden md:table-cell">
                      {c.usos_maximos != null && c.usos_maximos !== ""
                        ? `${c.usos_count ?? 0} / ${c.usos_maximos}`
                        : `${c.usos_count ?? 0} / sem limite`}
                    </td>
                    {/* FIX: Hidden on small screens */}
                    <td className="px-3 sm:px-5 py-3 sm:py-3.5 text-gray-700 hidden lg:table-cell">{formatDate(c.valido_ate as string | null)}</td>
                    <td className="px-3 sm:px-5 py-3 sm:py-3.5">
                      {c.ativo ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Ativo</span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Inativo</span>
                      )}
                    </td>
                    <td className="px-3 sm:px-5 py-3 sm:py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleToggleAtivoRequest(c)} disabled={togglingAtivo === c.id} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${(c.ativo as boolean) ? "text-emerald-600 hover:bg-emerald-50" : "text-red-500 hover:bg-red-50"}`} title={c.ativo ? "Desativar" : "Ativar"}>
                          {togglingAtivo === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </button>
                        <button onClick={() => handleOpenEdit(c)} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Editar">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDeleteTarget(c)} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Excluir">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && cupons.length === 0 && (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-5">
            <Tag className="w-8 h-8 text-gray-300" />
          </div>
          <h3 className="text-lg font-semibold text-gray-400">Nenhum cupom cadastrado</h3>
          <p className="text-sm text-gray-300 mt-1.5">Clique em &quot;Novo cupom&quot; para começar</p>
        </div>
      )}

      {/* ── Create / Edit Dialog ── */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCupom ? "Editar Cupom" : "Novo Cupom"}</DialogTitle>
            <DialogDescription>
              {editingCupom ? "Altere os dados do cupom abaixo." : "Preencha os campos abaixo para criar um novo cupom de desconto."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Código <span className="text-red-400">*</span></label>
              <input type="text" value={form.codigo} onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value.toUpperCase() }))} placeholder="Ex: PROMO10" disabled={!!editingCupom} className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 placeholder:text-gray-400 disabled:opacity-50" />
            </div>
            {/* FIX #6: grid-cols-1 on mobile */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Tipo de desconto <span className="text-red-400">*</span></label>
                <select value={form.tipo_desconto} onChange={(e) => setForm((f) => ({ ...f, tipo_desconto: e.target.value as "percentual" | "fixo" }))} className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300">
                  <option value="percentual">Percentual (%)</option>
                  <option value="fixo">Fixo (R$)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Valor <span className="text-red-400">*</span></label>
                <input type="text" value={form.valor_desconto} onChange={(e) => setForm((f) => ({ ...f, valor_desconto: e.target.value }))} placeholder={form.tipo_desconto === "percentual" ? "Ex: 10" : "Ex: 50.00"} className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 placeholder:text-gray-400" />
              </div>
            </div>
            {/* FIX #6: grid-cols-1 on mobile */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Usos máximos</label>
                <input type="text" value={form.usos_maximos} onChange={(e) => setForm((f) => ({ ...f, usos_maximos: e.target.value }))} placeholder="Vazio = sem limite" className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 placeholder:text-gray-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Status</label>
                <select value={form.ativo ? "ativo" : "inativo"} onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.value === "ativo" }))} className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300">
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </div>
            </div>
            {/* FIX #6: grid-cols-1 on mobile */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Válido a partir de</label>
                <input type="date" value={form.valido_a_partir} onChange={(e) => setForm((f) => ({ ...f, valido_a_partir: e.target.value }))} className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Válido até</label>
                <input type="date" value={form.valido_ate} onChange={(e) => setForm((f) => ({ ...f, valido_ate: e.target.value }))} className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300" />
              </div>
            </div>
            {/* Planos específicos - multi-select */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Planos específicos <span className="text-xs text-gray-400 font-normal">(se nenhum, aplica a todos)</span></label>
              <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl bg-gray-50 p-2 space-y-1">
                {activePlans.length === 0 && (
                  <p className="text-xs text-gray-400 px-2 py-1">Nenhum plano ativo disponível.</p>
                )}
                {activePlans.map((plano) => {
                  const isSelected = form.planos_ids.includes(plano.id as string);
                  return (
                    <button key={plano.id as string} type="button" onClick={() => setForm((f) => ({ ...f, planos_ids: isSelected ? f.planos_ids.filter((pid) => pid !== (plano.id as string)) : [...f.planos_ids, plano.id as string] }))} className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${isSelected ? "bg-gray-900 text-white font-medium" : "text-gray-600 hover:bg-gray-100"}`}>
                      {plano.nome as string} — R$ {Number(plano.preco).toFixed(2).replace(".", ",")}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDialog(false)} className="flex-1 rounded-xl" disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !form.codigo.trim() || !form.valor_desconto} className="flex-1 rounded-xl bg-[#0D1B2A] to-gray-700 text-white hover:from-gray-800 hover:to-gray-600">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingCupom ? "Salvar alterações" : "Criar cupom"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Toggle confirmation Dialog ── */}
      <ConfirmDialog
        open={!!toggleConfirm}
        title={toggleConfirm?.ativo ? "Desativar cupom?" : "Ativar cupom?"}
        description={`O cupom "${toggleConfirm?.codigo}" será ${toggleConfirm?.ativo ? "desativado e não poderá ser usado no checkout" : "ativado e ficará disponível para uso"}.`}
        confirmLabel={toggleConfirm?.ativo ? "Desativar" : "Ativar"}
        variant={toggleConfirm?.ativo ? "warning" : "default"}
        onConfirm={handleToggleAtivo}
        onCancel={() => setToggleConfirm(null)}
        loading={!!togglingAtivo}
      />

      {/* ── Delete confirmation Dialog ── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir cupom</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir o cupom <strong className="font-semibold">{deleteTarget?.codigo as string}</strong>? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="flex-1 rounded-xl" disabled={deleting}>Cancelar</Button>
            <Button onClick={handleDelete} disabled={deleting} className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 text-white">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Save confirmation Dialog (edit only) ── */}
      <ConfirmDialog
        open={saveConfirm}
        title="Salvar alterações no cupom?"
        description={`O cupom "${form.codigo}" será atualizado com os novos dados informados.`}
        confirmLabel="Salvar alterações"
        variant="warning"
        onConfirm={executeSave}
        onCancel={() => setSaveConfirm(false)}
        loading={saving}
      />
    </div>
  );
}

export default React.memo(CuponsTab);
