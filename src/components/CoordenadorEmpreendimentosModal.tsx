"use client";

import React, { useState, useEffect, useCallback } from "react";
import { X, Loader2, Building2, CheckSquare, Square, Check } from "lucide-react";
import ConfirmDialog from "@/components/confirm-dialog";

interface Empreendimento {
  id: string;
  nome: string;
  regiao: string;
}

interface Props {
  coordenadorId: string;
  coordenadorNome: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function CoordenadorEmpreendimentosModal({
  coordenadorId,
  coordenadorNome,
  onClose,
  onSaved,
}: Props) {
  const [empreendimentos, setEmpreendimentos] = useState<Empreendimento[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveConfirm, setSaveConfirm] = useState(false);

  // Buscar todos os empreendimentos ativos + os atribuídos ao coordenador
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [empRes, attrRes] = await Promise.all([
        fetch("/api/admin-sistema/empreendimentos"),
        fetch(`/api/admin-sistema/coordenadores/empreendimentos?userId=${coordenadorId}`),
      ]);

      if (empRes.ok) {
        const json = await empRes.json();
        setEmpreendimentos((json.empreendimentos || []).map((e: { id: string; nome: string; regiao: string }) => ({
          id: e.id,
          nome: e.nome,
          regiao: e.regiao,
        })));
      }

      if (attrRes.ok) {
        const json = await attrRes.json();
        setSelectedIds(new Set(json.empreendimentoIds || []));
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [coordenadorId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleEmpreendimento = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(empreendimentos.map((e) => e.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleSave = () => {
    setSaveConfirm(true);
  };

  const executeSave = async () => {
    setSaveConfirm(false);
    try {
      setSaving(true);
      const res = await fetch("/api/admin-sistema/coordenadores/empreendimentos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: coordenadorId,
          empreendimentoIds: Array.from(selectedIds),
        }),
      });

      if (res.ok) {
        onSaved();
        onClose();
      }
    } catch {
      // Silently fail
    } finally {
      setSaving(false);
    }
  };

  const allSelected = empreendimentos.length > 0 && selectedIds.size === empreendimentos.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Empreendimentos</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Atribuir a <span className="font-semibold text-gray-600">{coordenadorNome}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Actions bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-50 bg-gray-50/50">
          <span className="text-xs text-gray-500">
            {selectedIds.size} de {empreendimentos.length} selecionado{selectedIds.size !== 1 ? "s" : ""}
          </span>
          <div className="flex gap-2">
            <button
              onClick={allSelected ? deselectAll : selectAll}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-600 transition-colors"
            >
              {allSelected ? "Desmarcar todos" : "Selecionar todos"}
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
            </div>
          ) : empreendimentos.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-16">
              Nenhum empreendimento cadastrado
            </p>
          ) : (
            <div className="space-y-1">
              {empreendimentos.map((emp) => {
                const isSelected = selectedIds.has(emp.id);
                return (
                  <button
                    key={emp.id}
                    onClick={() => toggleEmpreendimento(emp.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left ${
                      isSelected
                        ? "bg-blue-50 border border-blue-200"
                        : "border border-transparent hover:bg-gray-50"
                    }`}
                  >
                    {isSelected ? (
                      <CheckSquare className="w-5 h-5 text-blue-600 shrink-0" />
                    ) : (
                      <Square className="w-5 h-5 text-gray-300 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isSelected ? "text-blue-900" : "text-gray-700"}`}>
                        {emp.nome}
                      </p>
                      <p className={`text-xs truncate ${isSelected ? "text-blue-500" : "text-gray-400"}`}>
                        {emp.regiao}
                      </p>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-blue-500 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/30">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Building2 className="w-4 h-4" />
            )}
            Salvar
          </button>
        </div>
      </div>

      {/* Save confirmation */}
      <ConfirmDialog
        open={saveConfirm}
        title="Salvar empreendimentos do coordenador?"
        description={`${coordenadorNome} terá acesso a ${selectedIds.size} empreendimento${selectedIds.size !== 1 ? "s" : ""}. A lista de acesso atual será substituída.`}
        confirmLabel="Salvar"
        variant="warning"
        onConfirm={executeSave}
        onCancel={() => setSaveConfirm(false)}
        loading={saving}
      />
    </div>
  );
}
