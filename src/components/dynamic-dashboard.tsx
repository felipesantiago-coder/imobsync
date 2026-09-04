"use client";

import React, { useState, useCallback, useMemo, useEffect, memo } from "react";
import { useRouter } from "next/navigation";
import { useCssPresence } from "@/lib/use-css-presence";
import {
  Building2,
  Maximize2,
  Car,
  DollarSign,
  ChevronUp,
  Filter,
  X,
  Check,
  LogOut,
  Sun,
  BedDouble,
  Calculator,
  Pencil,
  ArrowLeft,
  Radio,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import MobileMenu from "@/components/MobileMenu";
import { createClient } from "@/lib/supabase/client";
import ConfirmDialog from "@/components/confirm-dialog";
import { useTrackEvent } from "@/hooks/useTrackEvent";
import { mapProjetoUnitRow, type ProjetoUnit } from "@/lib/projeto-units";

// ─── Interfaces ───
// ProjetoUnit e o mapper das linhas do PostgREST vivem em @/lib/projeto-units
// (audit P1.4: mesma transformação reutilizada pelo fetch da API e pelos
// dados iniciais server-side; testável sem React).

interface DynamicDashboardProps {
  empreendimentoId: string;
  empreendimentoNome: string;
  isAdmin: boolean;
  isCoordinator?: boolean;
  hideHeader?: boolean;
  simuladorUrl?: string;
  /** Linhas brutas de projeto_units pré-buscadas no servidor (audit P1.4). */
  initialUnits?: Record<string, unknown>[] | null;
}

// ─── Color palette ───
const colorPalette = [
  { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", gradient: "from-emerald-500 to-emerald-600", accent: "bg-emerald-500" },
  { bg: "bg-sky-50", border: "border-sky-200", text: "text-sky-700", gradient: "from-sky-500 to-sky-600", accent: "bg-sky-500" },
  { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", gradient: "from-amber-500 to-amber-600", accent: "bg-amber-500" },
  { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-700", gradient: "from-violet-500 to-violet-600", accent: "bg-violet-500" },
  { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", gradient: "from-rose-500 to-rose-600", accent: "bg-rose-500" },
  { bg: "bg-lime-50", border: "border-lime-200", text: "text-lime-700", gradient: "from-lime-500 to-lime-600", accent: "bg-lime-500" },
  { bg: "bg-teal-50", border: "border-teal-200", text: "text-teal-700", gradient: "from-teal-500 to-teal-600", accent: "bg-teal-500" },
  { bg: "bg-cyan-50", border: "border-cyan-200", text: "text-cyan-700", gradient: "from-cyan-500 to-cyan-600", accent: "bg-cyan-500" },
  { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", gradient: "from-orange-500 to-orange-600", accent: "bg-orange-500" },
  { bg: "bg-pink-50", border: "border-pink-200", text: "text-pink-700", gradient: "from-pink-500 to-pink-600", accent: "bg-pink-500" },
];

type ColorSet = (typeof colorPalette)[number];

// ─── Color mapping with Map cache ───
const tipologiaColorCache = new Map<string, ColorSet>();

function getTipologiaColor(tip: string): ColorSet {
  if (tipologiaColorCache.has(tip)) {
    return tipologiaColorCache.get(tip)!;
  }
  const hash = tip
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const index = hash % colorPalette.length;
  const color = colorPalette[index];
  tipologiaColorCache.set(tip, color);
  return color;
}

// ─── Status config ───
type UnitStatus = "disponivel" | "reservado" | "vendido";

const statusLabels: Record<UnitStatus, { label: string; color: string; dotColor: string }> = {
  disponivel: { label: "Disponível", color: "bg-emerald-100 text-emerald-800 border-emerald-200", dotColor: "bg-emerald-500" },
  reservado: { label: "Reservada", color: "bg-amber-100 text-amber-800 border-amber-200", dotColor: "bg-amber-500" },
  vendido: { label: "Vendida", color: "bg-red-100 text-red-800 border-red-200", dotColor: "bg-red-500" },
};

const allStatuses: { value: UnitStatus; label: string; dotColor: string }[] = [
  { value: "disponivel", label: "Disponível", dotColor: "bg-emerald-500" },
  { value: "reservado", label: "Reservada", dotColor: "bg-amber-500" },
  { value: "vendido", label: "Vendida", dotColor: "bg-red-500" },
];

const statusOptions: UnitStatus[] = ["disponivel", "reservado", "vendido"];

// ─── Helpers ───
function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatArea(value: number | null): string {
  if (!value) return "—";
  return `${value}m²`;
}

function getStatusColor(status: string): { label: string; color: string; dotColor: string } {
  const validStatus = statusLabels[status as UnitStatus];
  if (validStatus) return validStatus;
  return { label: status, color: "bg-gray-100 text-gray-800 border-gray-200", dotColor: "bg-gray-500" };
}

function pricePerSqm(valor: number | null, area: number | null): string | null {
  if (!valor || !area) return null;
  return (
    (Number(valor) / Number(area)).toLocaleString("pt-BR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  );
}

// ─── Unit Card (memoized — biggest perf win on mobile) ───
const UnitCard = memo(function UnitCard({
  unit,
  onSelect,
  isBackground,
  isAdmin,
  onStatusChange,
  empreendimentoId,
  updateMode = false,
  selectorMode = false,
  isSelected = false,
  onToggleSelect,
}: {
  unit: ProjetoUnit;
  onSelect: (unit: ProjetoUnit) => void;
  isBackground: boolean;
  isAdmin: boolean;
  onStatusChange: (unidade: string, newStatus: UnitStatus) => void;
  empreendimentoId: string;
  updateMode?: boolean;
  selectorMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (unit: ProjetoUnit) => void;
}) {
  const colors = getTipologiaColor(unit.tipologia || "Padrão");
  const status = getStatusColor(unit.status);
  const [flipping, setFlipping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<"success" | "error" | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(timer);
  }, [feedback]);

  // Reset flip when update mode is deactivated
  useEffect(() => {
    if (!updateMode) setFlipping(false);
  }, [updateMode]);

  const updateStatus = async (newStatus: UnitStatus) => {
    if (saving) return;
    if (!onStatusChange || newStatus === unit.status) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(
        `/api/admin-sistema/empreendimentos/${empreendimentoId}/units`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unidade: unit.unidade, status: newStatus }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        onStatusChange(unit.unidade, newStatus);
        setFeedback("success");
      } else {
        console.error("Erro ao atualizar status:", data.error);
        setFeedback("error");
      }
    } catch (err) {
      console.error("Erro ao atualizar status:", err);
      setFeedback("error");
    } finally {
      setSaving(false);
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Batch selection: Shift+click
    if (e.shiftKey && isAdmin && onToggleSelect) {
      onToggleSelect(unit);
      return;
    }
    // Update mode: flip card to show status options on back
    if (updateMode && isAdmin) {
      if (flipping || saving) return;
      setFlipping(true);
      return;
    }
    onSelect(unit);
  };

  const handleFlipStatusSelect = async (newStatus: UnitStatus) => {
    if (saving) return;
    await updateStatus(newStatus);
    setFlipping(false);
  };

  // Modo seletor (Atualização em Lote): card compacto apenas de seleção —
  // sem flip, sem modal, sem informações completas. Clique alterna a seleção.
  if (selectorMode && onToggleSelect) {
    return (
      <button
        type="button"
        onClick={() => onToggleSelect(unit)}
        data-unit-selector
        aria-pressed={isSelected}
        className={`relative rounded-xl border-2 p-3 text-left transition-all duration-150 active:scale-[0.97] ${
          isSelected
            ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500 shadow-md shadow-blue-100"
            : "border-gray-200 bg-white hover:border-gray-400 hover:shadow-md"
        }`}
      >
        <span
          className={`absolute top-2 right-2 w-5 h-5 rounded-md border-2 flex items-center justify-center ${
            isSelected ? "bg-blue-500 border-blue-600" : "bg-gray-100 border-gray-300"
          }`}
        >
          {isSelected && <Check className="w-3 h-3 text-white" />}
        </span>
        <div className="flex items-center gap-2 pr-6">
          <span className="text-lg font-bold tracking-tight text-gray-900">{unit.unidade}</span>
          {unit.bloco && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500">
              Bloco {unit.bloco}
            </span>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${status.dotColor}`} />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            {status.label}
          </span>
        </div>
      </button>
    );
  }

  const displayArea = unit.area_str || formatArea(unit.area);
  const sqm = pricePerSqm(unit.valor_venda, unit.area);


  return (
    <div
      onClick={handleCardClick}
      data-unit-card
      className={`
        ims-card-in
        relative rounded-xl border-2 overflow-visible
        bg-white shadow-md hover:shadow-xl
        border-gray-100
        transition-[transform,opacity,box-shadow] duration-300
        ${!isBackground && !updateMode ? "ims-card-hover" : ""}
        ${isSelected ? "ring-2 ring-blue-500 border-blue-400 shadow-blue-100" : ""}
        ${isBackground ? "opacity-25 pointer-events-none" : ""}
      `}
      style={{
        borderColor: isSelected ? undefined : "rgb(243 244 246)",
      }}
    >
      {/* Batch selection indicator */}
      {isSelected && (
        <div className="absolute top-2 left-2 z-10 w-5 h-5 rounded-md bg-blue-500 border-2 border-blue-600 flex items-center justify-center">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}
      {/* Flip container */}
      <div style={{ perspective: "800px", overflow: "hidden" }}>
        <div
          style={{
            transformStyle: "preserve-3d",
            transition: "transform 0.5s ease-in-out",
            transform: flipping ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          {/* Front face */}
          <div style={{ backfaceVisibility: "hidden" }}>
      {/* Top colored bar */}
      <div className={`h-1.5 bg-gradient-to-r ${colors.gradient}`} />

      <div className="p-5 space-y-3">
        {/* Header: Unit identifier + Status */}
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <span className="text-xl font-bold tracking-tight text-gray-900 block truncate">
              {unit.unidade}
            </span>
            {unit.bloco && (
              <span className="text-[11px] text-gray-400 font-medium">
                Bloco {unit.bloco}
              </span>
            )}
          </div>
          {/* Status badge: purely informational — never interactive; status updates only via card click (flip) */}
          <span
            className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${status.color} cursor-default`}
          >
            {saving ? (
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" />
            ) : (
              <span className={`w-1.5 h-1.5 rounded-full ${status.dotColor}`} />
            )}
            {status.label}
          </span>
        </div>

        {/* Feedback visual */}
        <div className={`ims-feedback ${feedback ? "ims-feedback-open" : "ims-feedback-closed"}`}>
          <div className="ims-feedback-inner">
            {feedback && (
              <div className={`flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-lg ${
                feedback === "success"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}>
                {feedback === "success" ? (
                  <Check className="w-3 h-3 flex-shrink-0" />
                ) : (
                  <X className="w-3 h-3 flex-shrink-0" />
                )}
                {feedback === "success"
                  ? "Status atualizado!"
                  : "Erro ao atualizar."}
              </div>
            )}
          </div>
        </div>

        {/* Tipologia badge */}
        {unit.tipologia && (
          <div>
            <span
              className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md ${colors.bg} ${colors.text} ${colors.border} border`}
            >
              {unit.tipologia}
            </span>
          </div>
        )}

        {/* Info items */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-1.5 text-gray-500">
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="text-sm font-medium">{displayArea}</span>
          </div>
          {unit.vagas !== null && unit.vagas !== undefined && (
            <div className="flex items-center gap-1.5 text-gray-500">
              <Car className="w-3.5 h-3.5" />
              <span className="text-sm font-medium">
                {unit.vagas} vag{unit.vagas === 1 ? "a" : "as"}
              </span>
            </div>
          )}
          {unit.quartos !== null && unit.quartos !== undefined && (
            <div className="flex items-center gap-1.5 text-gray-500">
              <BedDouble className="w-3.5 h-3.5" />
              <span className="text-sm font-medium">
                {unit.quartos} qts
              </span>
            </div>
          )}
          {unit.posicao_solar && (
            <div className="flex items-center gap-1.5 text-gray-500">
              <Sun className="w-3.5 h-3.5" />
              <span className="text-sm font-medium">{unit.posicao_solar}</span>
            </div>
          )}
        </div>

        {/* Price */}
        <div className="pt-1">
          <p
            className={`text-lg font-bold ${
              unit.valor_venda ? "text-gray-900" : "text-gray-400 italic"
            }`}
          >
            {unit.valor_venda ? formatCurrency(Number(unit.valor_venda)) : "Consulte o valor"}
          </p>
          {sqm && (
            <p className="text-[11px] text-gray-400 mt-0.5">
              R$ {sqm}/m²
            </p>
          )}
        </div>
      </div>
          </div>
          {/* Back face */}
          <div
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
            className="bg-white flex flex-col"
          >
            <div className={`h-1.5 bg-gradient-to-r ${colors.gradient}`} />
            <div className="flex-1 flex flex-col p-3 gap-2.5">
              <p className="text-xs font-bold text-gray-900 text-center truncate">
                {unit.bloco ? unit.bloco + " — " : ""}Unidade {unit.unidade}
              </p>
              <div className="flex-1 flex flex-col justify-center gap-2">
                {allStatuses.map((s) => (
                  <button
                    key={s.value}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (s.value === unit.status) {
                        setFlipping(false);
                        return;
                      }
                      handleFlipStatusSelect(s.value);
                    }}
                    disabled={saving}
                    className={`flex-1 flex items-center justify-center gap-2.5 rounded-xl border-2 text-sm font-bold transition-all active:scale-[0.97] ${
                      s.value === unit.status
                        ? "bg-gray-50 border-gray-300 text-gray-400"
                        : s.value === "disponivel"
                        ? "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                        : s.value === "reservado"
                        ? "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100"
                        : "bg-red-50 border-red-300 text-red-700 hover:bg-red-100"
                    }`}
                  >
                    <span className={`w-3 h-3 rounded-full flex-shrink-0 ${s.dotColor}`} />
                    {s.label}
                    {s.value === unit.status && <Check className="w-4 h-4 ml-1" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

// ─── Expanded Centered Card Modal (memoized) ───
const ExpandedCard = memo(function ExpandedCard({
  unit,
  onClose,
  empreendimentoNome,
  simuladorUrl,
  closing = false,
  onAnimEnd,
}: {
  unit: ProjetoUnit;
  onClose: () => void;
  empreendimentoNome: string;
  simuladorUrl?: string;
  closing?: boolean;
  onAnimEnd: (e: React.AnimationEvent) => void;
}) {
  const colors = getTipologiaColor(unit.tipologia || "Padrão");
  const status = getStatusColor(unit.status);
  const displayArea = unit.area_str || formatArea(unit.area);
  const sqm = pricePerSqm(unit.valor_venda, unit.area);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 z-[300] flex items-center justify-center p-4 sm:p-8 ${closing ? "ims-overlay-out" : "ims-overlay-in"}`}
      onClick={onClose}
      onAnimationEnd={(e) => { if (e.target === e.currentTarget) onAnimEnd(e); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Card */}
      <div
        className={`relative z-10 w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden ${closing ? "ims-modal-card-out" : "ims-modal-card-in"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top gradient bar */}
        <div className={`h-2 bg-gradient-to-r ${colors.gradient}`} />

        <div className="p-6 sm:p-8 space-y-5">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors z-20"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>

          {/* Header */}
          <div className="flex items-start gap-4">
            <div
              className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${colors.gradient} flex items-center justify-center shadow-lg flex-shrink-0`}
            >
              <Building2 className="w-8 h-8 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
                Unidade {unit.unidade}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {unit.andar !== null
                  ? `${unit.andar}º Andar`
                  : "Sem andar definido"}
                {unit.bloco ? ` — Bloco ${unit.bloco}` : ""}
                {" — "}
                {empreendimentoNome}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${status.color}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${status.dotColor}`} />
                  {status.label}
                </span>
                {unit.tipologia && (
                  <span
                    className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border ${colors.bg} ${colors.text} ${colors.border}`}
                  >
                    {unit.tipologia}
                  </span>
                )}
                {unit.is_cobertura && (
                  <Badge
                    variant="outline"
                    className="text-[11px] font-semibold border-amber-300 bg-amber-50 text-amber-700"
                  >
                    Cobertura
                  </Badge>
                )}
                {unit.is_garden && (
                  <Badge
                    variant="outline"
                    className="text-[11px] font-semibold border-emerald-300 bg-emerald-50 text-emerald-700"
                  >
                    Garden
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Separator */}
          <div className="border-t border-gray-100" />

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            {unit.quartos !== null && unit.quartos !== undefined && (
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-gray-50 border border-gray-100">
                <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                  <BedDouble className="w-5 h-5 text-gray-500" />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">
                    {unit.quartos} quarto{unit.quartos > 1 ? "s" : ""}
                  </p>
                  <p className="text-[11px] text-gray-400 font-medium">
                    Dormitórios
                  </p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-gray-50 border border-gray-100">
              <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                <Maximize2 className="w-5 h-5 text-gray-500" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">{displayArea}</p>
                <p className="text-[11px] text-gray-400 font-medium">
                  Área Privativa
                </p>
              </div>
            </div>
            {unit.vagas !== null && unit.vagas !== undefined && (
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-gray-50 border border-gray-100">
                <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                  <Car className="w-5 h-5 text-gray-500" />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">
                    {unit.vagas} vaga{unit.vagas > 1 ? "s" : ""}
                  </p>
                  <p className="text-[11px] text-gray-400 font-medium">Garagem</p>
                </div>
              </div>
            )}
            {unit.posicao_solar && (
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-gray-50 border border-gray-100">
                <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                  <Sun className="w-5 h-5 text-gray-500" />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">
                    {unit.posicao_solar}
                  </p>
                  <p className="text-[11px] text-gray-400 font-medium">
                    Posição Solar
                  </p>
                </div>
              </div>
            )}
            {unit.andar !== null && (
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-gray-50 border border-gray-100">
                <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5 text-gray-500" />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">
                    {unit.andar}º andar
                  </p>
                  <p className="text-[11px] text-gray-400 font-medium">Pavimento</p>
                </div>
              </div>
            )}
            {unit.bloco && (
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-gray-50 border border-gray-100">
                <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5 text-gray-500" />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">
                    Bloco {unit.bloco}
                  </p>
                  <p className="text-[11px] text-gray-400 font-medium">Bloco</p>
                </div>
              </div>
            )}
          </div>

          {/* Separator */}
          <div className="border-t border-gray-100" />

          {/* Price */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-gray-400" />
              <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                Valor de Venda
              </span>
            </div>
            {unit.valor_venda ? (
              <div className="space-y-2">
                <p className="text-3xl font-bold text-gray-900">
                  {formatCurrency(Number(unit.valor_venda))}
                </p>
                {sqm && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs border-gray-200">
                      R$ {sqm}/m²
                    </Badge>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                <p className="text-lg font-semibold text-gray-400">
                  Consulte o valor
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  Entre em contato para saber o valor desta unidade
                </p>
              </div>
            )}
          </div>

          {/* Simular button */}
          {simuladorUrl && (
            <a
              href={`${simuladorUrl}?valor=${unit.valor_venda || 0}&unidade=${unit.unidade}&area=${unit.area_str || unit.area || ""}&andar=${unit.andar ?? ""}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                if (!unit.valor_venda) { e.preventDefault(); return; }
              }}
              className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 ${unit.valor_venda ? "bg-[#0D1B2A] to-gray-700 text-white hover:from-gray-800 hover:to-gray-600 shadow-lg hover:shadow-xl" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
            >
              <Calculator className="w-4 h-4" />
              Simular Financiamento
            </a>
          )}
        </div>
      </div>
    </div>
  );
});

// ─── Floor Section (collapsible, memoized) ───
const FloorSection = memo(function FloorSection({
  floor,
  floorLabel,
  floorUnits,
  selectedUnit,
  onSelectUnit,
  isCollapsed,
  onToggle,
  isAdmin,
  onStatusChange,
  empreendimentoId,
  updateMode = false,
  selectorMode = false,
  selectedForBatch,
  onToggleSelect,
  onToggleFloorSelect,
}: {
  floor: number;
  floorLabel: string;
  floorUnits: ProjetoUnit[];
  selectedUnit: ProjetoUnit | null;
  onSelectUnit: (unit: ProjetoUnit) => void;
  isCollapsed: boolean;
  onToggle: () => void;
  isAdmin: boolean;
  onStatusChange: (unidade: string, newStatus: UnitStatus) => void;
  empreendimentoId: string;
  updateMode?: boolean;
  selectorMode?: boolean;
  selectedForBatch?: Set<string>;
  onToggleSelect?: (unit: ProjetoUnit) => void;
  onToggleFloorSelect?: (units: ProjetoUnit[]) => void;
}) {
  const tipologiasInFloor = [...new Set(floorUnits.map((u) => u.tipologia).filter(Boolean))];
  const totalInFloor = floorUnits.length;
  const disponiveis = floorUnits.filter(
    (u) => u.status === "disponivel"
  ).length;

  // Modo seletor: sub-grupos por bloco quando o andar mistura blocos
  const blocoGroups = selectorMode
    ? [...new Set(floorUnits.map((u) => u.bloco ?? ""))]
    : [];
  const floorAllSelected =
    selectorMode && floorUnits.length > 0 &&
    floorUnits.every((u) => selectedForBatch?.has(u.id) ?? false);

  const renderSelectorGrid = (groupUnits: ProjetoUnit[]) => (
    <div className={`grid gap-3 md:gap-4 ${selectorMode ? "grid-cols-2 sm:grid-cols-4 lg:grid-cols-6" : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"}`}>
      {groupUnits.map((unit) => (
        <UnitCard
          key={unit.id}
          unit={unit}
          onSelect={onSelectUnit}
          isBackground={
            selectedUnit !== null && selectedUnit.id !== unit.id
          }
          isAdmin={isAdmin}
          onStatusChange={onStatusChange}
          empreendimentoId={empreendimentoId}
          updateMode={updateMode}
          selectorMode={selectorMode}
          isSelected={selectorMode ? (selectedForBatch?.has(unit.id) ?? false) : false}
          onToggleSelect={selectorMode ? onToggleSelect : undefined}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Floor header */}
      <div className="flex items-stretch gap-2">
      <button
        onClick={onToggle}
        className="flex-1 min-w-0 flex items-center justify-between p-4 rounded-xl bg-gradient-to-r bg-[#0D1B2A] text-white shadow-lg hover:shadow-xl transition-[box-shadow,transform] duration-200 group hover:scale-[1.005] active:scale-[0.995]"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center backdrop-blur-sm">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="text-left">
            <h3 className="text-lg font-bold">{floorLabel}</h3>
            <p className="text-sm text-white/60">
              {totalInFloor} unidade{totalInFloor !== 1 ? "s" : ""} •{" "}
              {disponiveis} disponíve
              {disponiveis !== 1 ? "is" : "l"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 flex-wrap justify-end">
            {tipologiasInFloor.map((tipo) => {
              const count = floorUnits.filter((u) => u.tipologia === tipo).length;
              return (
                <Badge
                  key={tipo}
                  variant="secondary"
                  className="text-[10px] font-semibold bg-white/15 text-white/80 border-white/20"
                >
                  {count}x {tipo}
                </Badge>
              );
            })}
          </div>
          <ChevronUp className={`w-5 h-5 text-white/60 transition-transform duration-300 ${isCollapsed ? "" : "rotate-180"}`} />
        </div>
      </button>
      {selectorMode && (
        <button
          onClick={() => onToggleFloorSelect?.(floorUnits)}
          className={`flex items-center gap-2 px-3 sm:px-4 rounded-xl text-white shadow-lg transition-colors duration-200 ${floorAllSelected ? "bg-blue-600" : "bg-[#0D1B2A]"}`}
          title={floorAllSelected ? "Desmarcar todas as unidades deste andar" : "Selecionar todas as unidades deste andar"}
        >
          <span
            className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
              floorAllSelected ? "bg-white border-white" : "bg-white/10 border-white/40"
            }`}
          >
            {floorAllSelected && <Check className="w-3 h-3 text-blue-600" />}
          </span>
          <span className="text-xs font-semibold whitespace-nowrap hidden sm:inline">
            {floorAllSelected ? "Limpar andar" : "Selecionar andar"}
          </span>
        </button>
      )}
      </div>

      {/* Floor units grid — collapse por CSS (grid-rows 0fr↔1fr) + culling ims-cv */}
      <div
        className={`ims-collapse ${isCollapsed ? "ims-collapse-closed" : "ims-collapse-open"}`}
        style={{ "--ims-cv-h": selectorMode ? "360px" : "620px" } as React.CSSProperties}
      >
        <div className={`ims-collapse-inner ims-cv`}>
          {selectorMode && blocoGroups.length > 1 ? (
            <div className="space-y-5">
              {blocoGroups.map((b) => {
                const groupUnits = floorUnits.filter((u) => (u.bloco ?? "") === b);
                const blocoAllSelected = groupUnits.every((u) => selectedForBatch?.has(u.id) ?? false);
                return (
                  <div key={b || "sem-bloco"} className="space-y-2">
                    <div className="flex items-center justify-between gap-2 px-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                        {b ? `Bloco ${b}` : "Sem bloco"} · {groupUnits.length}
                      </span>
                      <button
                        onClick={() => onToggleFloorSelect?.(groupUnits)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
                          blocoAllSelected
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "bg-white border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700"
                        }`}
                      >
                        <span
                          className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                            blocoAllSelected ? "bg-white border-white" : "bg-gray-50 border-gray-300"
                          }`}
                        >
                          {blocoAllSelected && <Check className="w-2.5 h-2.5 text-blue-600" />}
                        </span>
                        {blocoAllSelected ? "Limpar" : "Selecionar"}
                      </button>
                    </div>
                    {renderSelectorGrid(groupUnits)}
                  </div>
                );
              })}
            </div>
          ) : (
            renderSelectorGrid(floorUnits)
          )}
        </div>
      </div>
    </div>
  );
});

// ─── Tipologia Legend (memoized) ───
const TipologiaLegend = memo(function TipologiaLegend({
  tipologias,
}: {
  tipologias: string[];
}) {
  if (tipologias.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-white/80 shadow-sm border border-gray-100">
      <span className="text-xs font-semibold text-gray-500 mr-1">
        Tipologias:
      </span>
      {tipologias.map((tipo) => {
        const colors = getTipologiaColor(tipo);
        return (
          <Badge
            key={tipo}
            variant="outline"
            className={`text-[11px] font-semibold ${colors.bg} ${colors.text} ${colors.border}`}
          >
            <span className={`w-2 h-2 rounded-full ${colors.accent} mr-1`} />
            {tipo}
          </Badge>
        );
      })}
    </div>
  );
});

// ─── Loading Skeleton ───
function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {/* Filter skeleton */}
      <div className="p-4 rounded-xl bg-white shadow-md border border-gray-100 animate-pulse">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-4 h-4 bg-gray-200 rounded" />
          <div className="w-16 h-3 bg-gray-200 rounded" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i}>
              <div className="w-20 h-2 bg-gray-200 rounded mb-2" />
              <div className="w-full h-9 bg-gray-100 rounded-lg border border-gray-200" />
            </div>
          ))}
        </div>
      </div>
      {/* Card skeletons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border-2 border-gray-100 bg-white shadow-md animate-pulse"
          >
            <div className="h-1.5 bg-gray-200" />
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-16 h-5 bg-gray-200 rounded" />
                <div className="w-16 h-5 bg-gray-200 rounded-full" />
              </div>
              <div className="w-14 h-4 bg-gray-200 rounded" />
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-3.5 h-3.5 bg-gray-200 rounded" />
                  <div className="w-10 h-3.5 bg-gray-200 rounded" />
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3.5 h-3.5 bg-gray-200 rounded" />
                  <div className="w-10 h-3.5 bg-gray-200 rounded" />
                </div>
              </div>
              <div className="pt-1">
                <div className="w-24 h-5 bg-gray-200 rounded" />
                <div className="w-16 h-3 bg-gray-200 rounded mt-1" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Batch Action Bar (memoized) ───
const BatchActionBar = memo(function BatchActionBar({
  count,
  onApplyStatus,
  onClear,
  saving,
  closing = false,
  onAnimEnd,
}: {
  count: number;
  onApplyStatus: (status: UnitStatus) => void;
  onClear: () => void;
  saving: boolean;
  closing?: boolean;
  onAnimEnd: (e: React.AnimationEvent) => void;
}) {
  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-5 py-3 bg-gray-900 text-white rounded-2xl shadow-2xl border border-gray-700 ${closing ? "ims-bar-out" : "ims-bar-in"}`}
      onAnimationEnd={(e) => { if (e.target === e.currentTarget) onAnimEnd(e); }}
    >
      <span className="text-sm font-semibold whitespace-nowrap">
        {count} {count === 1 ? "unidade" : "unidades"} selecionada{count !== 1 ? "s" : ""}
      </span>
      <div className="w-px h-6 bg-gray-600" />
      <div className="flex items-center gap-2">
        <button
          onClick={() => onApplyStatus("disponivel")}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <span className="w-2 h-2 rounded-full bg-white" />
          Disponível
        </button>
        <button
          onClick={() => onApplyStatus("reservado")}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <span className="w-2 h-2 rounded-full bg-white" />
          Reservada
        </button>
        <button
          onClick={() => onApplyStatus("vendido")}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <span className="w-2 h-2 rounded-full bg-white" />
          Vendida
        </button>
      </div>
      <button
        onClick={onClear}
        className="ml-1 px-2 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
});

// ─── Main Dynamic Dashboard ───
export default function DynamicDashboard({
  empreendimentoId,
  empreendimentoNome,
  isAdmin,
  isCoordinator = false,
  hideHeader = false,
  simuladorUrl,
  initialUnits = null,
}: DynamicDashboardProps) {
  const router = useRouter();
  const track = useTrackEvent();
  // Dados iniciais server-side (audit P1.4): grade pronta no HTML/RSC inicial;
  // sem eles, o fluxo original (skeleton → fetch → API) permanece intacto.
  const [units, setUnits] = useState<ProjetoUnit[]>(() =>
    initialUnits ? initialUnits.map((row) => mapProjetoUnitRow(row, empreendimentoId)) : []
  );
  const [loading, setLoading] = useState<boolean>(() => !initialUnits);
  const [selectedUnit, setSelectedUnit] = useState<ProjetoUnit | null>(null);
  const [updateMode, setUpdateMode] = useState(false);
  // Sub-modo do modo de atualização: false = individual (flip), true = lote (seletor)
  const [batchSelectMode, setBatchSelectMode] = useState(false);
  const [selectedForBatch, setSelectedForBatch] = useState<Set<string>>(new Set());
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchConfirmStatus, setBatchConfirmStatus] = useState<UnitStatus | null>(null);

  // Separação clara dos modos: individual = flip do card; lote = interface seletora
  const selectorActive = updateMode && batchSelectMode && isAdmin;

  // Presença CSS (substitui AnimatePresence/motion exit — audit framer→CSS)
  const expandedPresence = useCssPresence<ProjetoUnit | null>(selectedUnit, "imsOverlayOut");
  const batchBarPresence = useCssPresence<number | null>(
    selectorActive && selectedForBatch.size > 0 && isAdmin ? selectedForBatch.size : null,
    "imsBarOut"
  );
  const [collapsedFloors, setCollapsedFloors] = useState<Set<number>>(
    new Set()
  );
  const [filterTipologia, setFilterTipologia] = useState<string>("all");
  const [filterSolar, setFilterSolar] = useState<string>("all");
  const [filterBloco, setFilterBloco] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<UnitStatus | "all">("all");
  const [filterAndar, setFilterAndar] = useState<number | "all">("all");
  const [sortBy, setSortBy] = useState<
    "andar" | "price-asc" | "price-desc"
  >("andar");

  // ─── Detect available filter values from data ───
  const availableTipologias = useMemo(() => {
    const set = new Set(units.map((u) => u.tipologia).filter(Boolean));
    return [...set].sort();
  }, [units]);

  const availableSolarPosicoes = useMemo(() => {
    const set = new Set(
      units.map((u) => u.posicao_solar).filter(Boolean)
    );
    return [...set].sort();
  }, [units]);

  const availableBlocos = useMemo(() => {
    const set = new Set(units.map((u) => u.bloco).filter(Boolean));
    return [...set].sort();
  }, [units]);

  const availableAndares = useMemo(() => {
    const set = new Set(
      units.map((u) => u.andar).filter((a): a is number => a !== null)
    );
    return [...set].sort((a, b) => a - b);
  }, [units]);

  // ─── Dashboard view tracking ───
  useEffect(() => {
    track({ event_type: "dashboard_view", resource_type: "empreendimento", metadata: { empreendimento: empreendimentoNome } });
     
  }, []);

  // ─── Auto-detect which filters to show ───
  const showTipologiaFilter = availableTipologias.length > 1;
  const showSolarFilter = availableSolarPosicoes.length > 1;
  const showBlocoFilter = availableBlocos.length >= 1;
  const showAndarFilter = availableAndares.length > 1;

  // ─── Filter & sort ───
  const filteredUnits = useMemo(() => {
    let result = [...units];
    if (filterTipologia !== "all")
      result = result.filter((u) => u.tipologia === filterTipologia);
    if (filterSolar !== "all")
      result = result.filter((u) => u.posicao_solar === filterSolar);
    if (filterBloco !== "all")
      result = result.filter((u) => u.bloco === filterBloco);
    if (filterStatus !== "all")
      result = result.filter((u) => u.status === filterStatus);
    if (filterAndar !== "all")
      result = result.filter((u) => u.andar === filterAndar);

    // Default sort by ordem within groups
    result.sort((a, b) => a.ordem - b.ordem);

    if (sortBy === "price-asc")
      result.sort(
        (a, b) =>
          (Number(a.valor_venda) || Infinity) -
          (Number(b.valor_venda) || Infinity)
      );
    if (sortBy === "price-desc")
      result.sort(
        (a, b) =>
          (Number(b.valor_venda) || 0) - (Number(a.valor_venda) || 0)
      );
    return result;
  }, [
    units,
    filterTipologia,
    filterSolar,
    filterBloco,
    filterStatus,
    filterAndar,
    sortBy,
  ]);

  // ─── Active floors for floor-based sorting ───
  const activeFloors = useMemo(() => {
    const floorSet = new Set(
      filteredUnits
        .map((u) => u.andar)
        .filter((a): a is number => a !== null)
    );
    return availableAndares.filter((f) => floorSet.has(f));
  }, [filteredUnits, availableAndares]);

  // ─── Summary stats ───
  const summaryStats = useMemo(() => {
    const total = units.length;
    const disponiveis = units.filter((u) => u.status === "disponivel").length;
    const reservados = units.filter((u) => u.status === "reservado").length;
    const vendidos = units.filter((u) => u.status === "vendido").length;
    return { total, disponiveis, reservados, vendidos };
  }, [units]);

  // ─── Fetch units + realtime ───
  useEffect(() => {
    let supabaseChannel: ReturnType<
      ReturnType<typeof createClient>["channel"]
    > | null = null;

    // Realtime isolado do fetch: com initialUnits o canal abre no mount sem
    // nova busca; no caminho original o canal só abre após fetch bem-sucedido
    // (semântica preservada nos dois casos).
    const subscribe = () => {
      const supabase = createClient();
      supabaseChannel = supabase
        .channel(`projeto-${empreendimentoId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "projeto_units",
            filter: `empreendimento_id=eq.${empreendimentoId}`,
          },
          (payload) => {
            const updated = payload.new as Record<string, unknown>;
            setUnits((prev) =>
              prev.map((u) => {
                if (u.id !== updated.id) return u;
                return {
                  ...u,
                  status: (updated.status as string) ?? u.status,
                  valor_venda: (updated.valor_venda as number | null) ?? u.valor_venda,
                  andar: (updated.andar as number) ?? u.andar,
                  unidade: String(updated.unidade ?? u.unidade),
                  vagas: (updated.vagas as number) ?? u.vagas,
                  area: (updated.area as number) ?? u.area,
                  area_str: (updated.area_str as string) || u.area_str,
                  quartos: (updated.quartos as number) ?? u.quartos,
                  posicao_solar: (updated.posicao_solar as string) || u.posicao_solar,
                  tipologia: (updated.tipologia as string) || u.tipologia,
                  bloco: (updated.bloco as string) || u.bloco,
                  is_cobertura: (updated.is_cobertura as boolean) || u.is_cobertura,
                  is_garden: (updated.is_garden as boolean) || u.is_garden,
                };
              })
            );
          }
        )
        .subscribe();
    };

    async function loadData() {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/admin-sistema/empreendimentos/${empreendimentoId}/units`
        );
        if (!res.ok) {
          console.error("Erro ao buscar unidades:", res.statusText);
          return;
        }
        const data = await res.json();
        const mapped: ProjetoUnit[] = (Array.isArray(data) ? data : []).map(
          (row: Record<string, unknown>) => mapProjetoUnitRow(row, empreendimentoId)
        );

        setUnits(mapped);

        subscribe();
      } catch (err) {
        console.error("Erro ao carregar dados:", err);
      } finally {
        setLoading(false);
      }
    }

    if (initialUnits) {
      // Dados iniciais server-side (audit P1.4): pula o fetch no mount. A API
      // permanece para refetch/mutações e como fallback quando o acesso foi
      // negado no servidor (initialUnits = null → fluxo original intacto).
      subscribe();
    } else {
      loadData();
    }

    return () => {
      if (supabaseChannel) {
        createClient().removeChannel(supabaseChannel);
      }
    };
  }, [empreendimentoId, initialUnits]);

  // ─── Handlers ───
  const handleSelectUnit = useCallback((unit: ProjetoUnit) => {
    setSelectedUnit(unit);
  }, []);

  const handleLocalStatusChange = useCallback(
    (unidade: string, newStatus: UnitStatus) => {
      setUnits((prev) =>
        prev.map((u) =>
          u.unidade === unidade ? { ...u, status: newStatus } : u
        )
      );
      setSelectedUnit((prev) =>
        prev && prev.unidade === unidade
          ? { ...prev, status: newStatus }
          : prev
      );
    },
    []
  );

  const handleCloseExpanded = useCallback(() => {
    setSelectedUnit(null);
  }, []);

  // Close expanded card when entering update mode
  useEffect(() => {
    if (updateMode) { setSelectedUnit(null); setSelectedForBatch(new Set()); }
    else { setBatchSelectMode(false); }
  }, [updateMode]);

  // Batch selection handlers
  const handleBatchToggle = useCallback((unit: ProjetoUnit) => {
    setSelectedForBatch((prev) => {
      const next = new Set(prev);
      if (next.has(unit.id)) next.delete(unit.id);
      else next.add(unit.id);
      return next;
    });
  }, []);

  // Alterna seleção de várias unidades de uma vez (andar/bloco inteiro)
  const handleBatchToggleMany = useCallback((list: ProjetoUnit[]) => {
    setSelectedForBatch((prev) => {
      const allSelected = list.every((u) => prev.has(u.id));
      const next = new Set(prev);
      for (const u of list) {
        if (allSelected) next.delete(u.id);
        else next.add(u.id);
      }
      return next;
    });
  }, []);

  const handleBatchClear = useCallback(() => {
    setSelectedForBatch(new Set());
  }, []);

  const handleBatchStatusChange = useCallback((newStatus: UnitStatus) => {
    if (batchSaving || selectedForBatch.size === 0) return;
    setBatchConfirmStatus(newStatus);
  }, [batchSaving, selectedForBatch]);

  const confirmBatchStatusChange = useCallback(async () => {
    if (!batchConfirmStatus) return;
    const newStatus = batchConfirmStatus;
    setBatchConfirmStatus(null);
    setBatchSaving(true);
    try {
      const updates = Array.from(selectedForBatch).map(async (unitId) => {
        const unit = units.find((u) => u.id === unitId);
        if (!unit) return { unitId, ok: false };
        const res = await fetch(
          `/api/admin-sistema/empreendimentos/${empreendimentoId}/units`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ unidade: unit.unidade, status: newStatus }),
          }
        );
        return { unitId, ok: res.ok };
      });
      const results = await Promise.all(updates);
      const succeeded = results.filter((r) => r.ok);
      setUnits((prev) =>
        prev.map((u) =>
          succeeded.some((r) => r.unitId === u.id) ? { ...u, status: newStatus } : u
        )
      );
      setSelectedForBatch(new Set());
    } catch (err) {
      console.error("Erro ao atualizar em lote:", err);
    } finally {
      setBatchSaving(false);
    }
  }, [batchConfirmStatus, selectedForBatch, units, empreendimentoId]);

  const toggleFloor = useCallback((floor: number) => {
    setCollapsedFloors((prev) => {
      const next = new Set(prev);
      if (next.has(floor)) next.delete(floor);
      else next.add(floor);
      return next;
    });
  }, []);

  // Stable onToggle factory — returns same reference pattern via useCallback with floor closure
  // Used in render; FloorSection is memoized so only the floor that changes re-renders
  const getFloorToggle = useCallback((floor: number) => () => toggleFloor(floor), [toggleFloor]);

  const handleLogout = useCallback(async () => {
    await createClient().auth.signOut();
    window.location.href = "/";
  }, []);

  const hasActiveFilters =
    filterTipologia !== "all" ||
    filterSolar !== "all" ||
    filterBloco !== "all" ||
    filterStatus !== "all" ||
    filterAndar !== "all" ||
    sortBy !== "andar";

  const clearAllFilters = useCallback(() => {
    setFilterTipologia("all");
    setFilterSolar("all");
    setFilterBloco("all");
    setFilterStatus("all");
    setFilterAndar("all");
    setSortBy("andar");
  }, []);

  // Memoized mobile menu items — avoids re-creating JSX on every render
  const mobileMenuItems = useMemo(() => [
    { label: "Voltar aos Projetos", icon: <ArrowLeft className="w-5 h-5" />, href: "/projetos" },
    ...(isCoordinator && isAdmin ? [{
      label: updateMode ? "Desativar Atualização" : "Modo Atualização",
      icon: <Pencil className="w-5 h-5" />,
      onClick: () => setUpdateMode(prev => !prev),
      variant: "warning" as const,
      active: updateMode,
    }] : []),
    { label: "Tempo Real", icon: <Radio className="w-5 h-5" />, badge: "ON" },
    { label: "Sair", icon: <LogOut className="w-5 h-5" />, onClick: handleLogout, variant: "danger" as const },
  ], [isCoordinator, isAdmin, updateMode, handleLogout]);

  // ─── Loading state with skeleton ───
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 flex flex-col">
        {!hideHeader && (
          <header className="sticky top-0 z-50 bg-[#0D1B2A] text-white shadow-lg">
            <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10">
              <div className="flex items-center justify-between h-16">
                <div className="flex items-center gap-2 sm:gap-3">
                  <img src="/imobsync-icon-escuro-36.png" alt="ImobSync" className="h-7 sm:h-9 w-auto rounded-lg" />
                  <div className="min-w-0">
                    <h1 className="text-sm sm:text-lg font-bold tracking-tight truncate">
                      ImobSync
                    </h1>
                    <p className="text-[10px] sm:text-[11px] text-gray-400 font-medium truncate">
                      {empreendimentoNome}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </header>
        )}
        <main className="w-full px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10 py-6 flex-1">
          <LoadingSkeleton />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 flex flex-col">
      {/* Header */}
      {!hideHeader && (
        <header className="sticky top-0 z-50 bg-[#0D1B2A] text-white shadow-lg">
          <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-2 sm:gap-3">
                <img src="/imobsync-icon-escuro-36.png" alt="ImobSync" className="h-7 sm:h-9 w-auto rounded-lg" />
                <div className="min-w-0">
                  <h1 className="text-sm sm:text-lg font-bold tracking-tight truncate">
                    ImobSync
                  </h1>
                  <p className="text-[10px] sm:text-[11px] text-gray-400 font-medium truncate">
                    {empreendimentoNome}
                  </p>
                </div>
              </div>
              {/* Desktop actions */}
              <div className="hidden sm:flex items-center gap-2">
                <a
                  href="/projetos"
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  Projetos
                </a>
                {isCoordinator && isAdmin && (
                  <button
                    onClick={() => setUpdateMode(!updateMode)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                      updateMode
                        ? "bg-amber-500/25 text-amber-300 border-amber-500/40 shadow-lg shadow-amber-500/10"
                        : "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white"
                    }`}
                    title={updateMode ? "Desativar modo de atualização" : "Ativar modo de atualização"}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">
                      {updateMode ? "Atualização ON" : "Modo Atualização"}
                    </span>
                  </button>
                )}
                <div className="flex items-center gap-1.5 text-[11px] text-gray-400 font-medium px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Atualização em tempo real
                </div>
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
      )}

      {/* Update mode banner */}
      {updateMode && (
        <div className={`border-b px-4 py-2.5 flex flex-wrap items-center justify-center gap-2 ${selectorActive ? "bg-blue-50 border-blue-200" : "bg-amber-50 border-amber-200"}`}>
          {selectorActive ? (
            <ListChecks className="w-4 h-4 text-blue-600 flex-shrink-0" />
          ) : (
            <Pencil className="w-4 h-4 text-amber-600 flex-shrink-0" />
          )}
          <p className={`text-sm font-semibold ${selectorActive ? "text-blue-700" : "text-amber-700"}`}>
            {selectorActive
              ? "Atualização em Lote — selecione andares/blocos e unidades e aplique um status a todas de uma vez"
              : "Modo de Atualização Ativado — Clique em qualquer unidade para alterar o status"}
          </p>
          {isAdmin && (
            <div className="flex rounded-lg border border-gray-300 bg-white overflow-hidden text-xs font-semibold shadow-sm flex-shrink-0">
              <button
                onClick={() => setBatchSelectMode(false)}
                className={`px-3 py-1.5 transition-colors ${!selectorActive ? "bg-amber-500 text-white" : "text-gray-500 hover:bg-gray-100"}`}
              >
                Individual
              </button>
              <button
                onClick={() => setBatchSelectMode(true)}
                className={`px-3 py-1.5 transition-colors border-l border-gray-300 ${selectorActive ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}
              >
                Em lote
              </button>
            </div>
          )}
          <button
            onClick={() => setUpdateMode(false)}
            className="ml-2 text-xs font-medium text-gray-500 hover:text-gray-800 underline underline-offset-2 flex-shrink-0"
          >
            Desativar
          </button>
        </div>
      )}

      <main className="w-full px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10 py-6 space-y-6 flex-1">
        {/* Filters */}
        <div className="p-4 rounded-xl bg-white shadow-md border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              Filtros
            </span>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-xs text-gray-400 hover:text-gray-600"
                onClick={clearAllFilters}
              >
                <X className="w-3 h-3 mr-1" />
                Limpar filtros
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Tipologia filter (auto-detected) */}
            {showTipologiaFilter && (
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">
                  Tipologia
                </label>
                <select
                  value={filterTipologia}
                  onChange={(e) => setFilterTipologia(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-all"
                >
                  <option value="all">Todas</option>
                  {availableTipologias.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Posição Solar filter (auto-detected) */}
            {showSolarFilter && (
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">
                  Posição Solar
                </label>
                <select
                  value={filterSolar}
                  onChange={(e) => setFilterSolar(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-all"
                >
                  <option value="all">Todas</option>
                  {availableSolarPosicoes.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Bloco filter (auto-detected) */}
            {showBlocoFilter && (
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">
                  Bloco
                </label>
                <select
                  value={filterBloco}
                  onChange={(e) => setFilterBloco(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-all"
                >
                  <option value="all">Todos</option>
                  {availableBlocos.map((b) => (
                    <option key={b} value={b}>
                      Bloco {b}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Andar filter (auto-detected) */}
            {showAndarFilter && (
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">
                  Andar
                </label>
                <select
                  value={filterAndar}
                  onChange={(e) =>
                    setFilterAndar(
                      e.target.value === "all" ? "all" : Number(e.target.value)
                    )
                  }
                  className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-all"
                >
                  <option value="all">Todos</option>
                  {availableAndares.map((a) => (
                    <option key={a} value={a}>
                      {a}º andar
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Status filter (always shown) */}
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">
                Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) =>
                  setFilterStatus(e.target.value as UnitStatus | "all")
                }
                className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-all"
              >
                <option value="all">Todos</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {statusLabels[s].label}
                  </option>
                ))}
              </select>
            </div>

            {/* Ordenar (always shown) */}
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">
                Ordenar
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-all"
              >
                <option value="andar">Andar</option>
                <option value="price-asc">Menor preço</option>
                <option value="price-desc">Maior preço</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tipologia Legend */}
        <TipologiaLegend tipologias={availableTipologias} />

        {/* Units display — floor sections when sorted by andar, flat grid for price */}
        {sortBy === "andar" || selectorActive ? (
          <div className="space-y-6">
            {activeFloors.map((floor) => {
              const floorUnits = filteredUnits.filter((u) => u.andar === floor);
              const hasCobertura = floorUnits.some((u) => u.is_cobertura);
              const hasGarden = floorUnits.some((u) => u.is_garden);
              const floorLabel =
                floor === 0
                  ? hasGarden
                    ? "Térreo — Garden"
                    : "Térreo"
                  : hasCobertura
                    ? `${floor}º Andar — Cobertura`
                    : hasGarden
                      ? `${floor}º Andar — Garden`
                      : `${floor}º Andar`;

              return (
                <FloorSection
                  key={floor}
                  floor={floor}
                  floorLabel={floorLabel}
                  floorUnits={floorUnits}
                  selectedUnit={selectedUnit}
                  onSelectUnit={handleSelectUnit}
                  isCollapsed={collapsedFloors.has(floor)}
                  onToggle={getFloorToggle(floor)}
                  isAdmin={isAdmin}
                  onStatusChange={handleLocalStatusChange}
                  empreendimentoId={empreendimentoId}
                  updateMode={updateMode}
                  selectorMode={selectorActive}
                  selectedForBatch={selectedForBatch}
                  onToggleSelect={handleBatchToggle}
                  onToggleFloorSelect={handleBatchToggleMany}
                />
              );
            })}
          </div>
        ) : (
          <div className={`ims-fade-in space-y-4`} key={sortBy}>
            <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
              <DollarSign className="w-4 h-4" />
              Ordenado por{" "}
              {sortBy === "price-asc" ? "menor preço" : "maior preço"}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
              {filteredUnits.map((unit) => (
                <UnitCard
                  key={unit.id}
                  unit={unit}
                  onSelect={handleSelectUnit}
                  isBackground={false}
                  isAdmin={isAdmin}
                  onStatusChange={handleLocalStatusChange}
                  empreendimentoId={empreendimentoId}
                  updateMode={updateMode}
                  isSelected={false}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {filteredUnits.length === 0 && (
          <div className="ims-fade-in text-center py-20">
            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-400">
              Nenhuma unidade encontrada
            </h3>
            <p className="text-sm text-gray-300 mt-1">
              Tente ajustar os filtros para ver mais resultados
            </p>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={clearAllFilters}
              >
                <X className="w-3.5 h-3.5 mr-1.5" />
                Limpar todos os filtros
              </Button>
            )}
          </div>
        )}
      </main>

      {/* Footer with unit count summary */}
      <footer className="border-t border-gray-200 bg-white/90 mt-auto">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Building2 className="w-4 h-4" />
              <span className="font-semibold text-gray-600">
                {empreendimentoNome}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-gray-400" />
                <span className="text-gray-500">
                  {summaryStats.total} total
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-emerald-700">
                  {summaryStats.disponiveis} disponíve
                  {summaryStats.disponiveis !== 1 ? "is" : "l"}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-amber-700">
                  {summaryStats.reservados} reservada
                  {summaryStats.reservados !== 1 ? "s" : ""}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-red-700">
                  {summaryStats.vendidos} vendida
                  {summaryStats.vendidos !== 1 ? "s" : ""}
                </span>
              </span>
            </div>
          </div>
        </div>
      </footer>

      {/* Expanded centered card overlay — presença CSS */}
      {expandedPresence.mounted && (
        <ExpandedCard
          unit={expandedPresence.current!}
          closing={expandedPresence.closing}
          onAnimEnd={expandedPresence.onAnimEnd}
          onClose={handleCloseExpanded}
          empreendimentoNome={empreendimentoNome}
          simuladorUrl={simuladorUrl}
        />
      )}

      {/* Batch action bar — presença CSS */}
      {batchBarPresence.mounted && (
        <BatchActionBar
          count={batchBarPresence.current!}
          closing={batchBarPresence.closing}
          onAnimEnd={batchBarPresence.onAnimEnd}
          onApplyStatus={handleBatchStatusChange}
          onClear={handleBatchClear}
          saving={batchSaving}
        />
      )}
      <ConfirmDialog
        open={!!batchConfirmStatus}
        title="Alterar status em lote"
        description={`Deseja alterar o status de ${selectedForBatch.size} unidade(s) para "${batchConfirmStatus === "disponivel" ? "Disponível" : batchConfirmStatus === "reservado" ? "Reservada" : "Vendida"}"?`}
        confirmLabel="Confirmar"
        cancelLabel="Cancelar"
        variant="warning"
        onConfirm={confirmBatchStatusChange}
        onCancel={() => setBatchConfirmStatus(null)}
        loading={false}
      />
    </div>
  );
}
