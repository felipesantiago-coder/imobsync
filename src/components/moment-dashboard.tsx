"use client";

import React, { memo, useState, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  momentTipologias,
  momentPavimentos,
  momentAndares,
  formatMomentCurrency,
  type MomentUnit,
  momentUnits as staticUnits,
} from "@/lib/moment-data";
import { Building2, Car, Maximize2, DollarSign, ChevronUp, Filter, X, BedDouble, Check, LogOut, Sun, Calculator, Pencil, ArrowLeft, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import MobileMenu from "@/components/MobileMenu";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import ConfirmDialog from "@/components/confirm-dialog";
import { useTrackEvent } from "@/hooks/useTrackEvent";

// ─── Color palette for tipologias ───
type TipologiaKey = MomentUnit["tipologia"];

const typeColors: Record<TipologiaKey, { bg: string; border: string; text: string; gradient: string; accent: string }> = {
  "1 Suíte": {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    gradient: "from-emerald-500 to-emerald-600",
    accent: "bg-emerald-500",
  },
  "3 Suítes": {
    bg: "bg-sky-50",
    border: "border-sky-200",
    text: "text-sky-700",
    gradient: "from-sky-500 to-sky-600",
    accent: "bg-sky-500",
  },
  "1 Suíte + 2 Semissuítes": {
    bg: "bg-violet-50",
    border: "border-violet-200",
    text: "text-violet-700",
    gradient: "from-violet-500 to-violet-600",
    accent: "bg-violet-500",
  },
  "Cobertura": {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    gradient: "from-amber-500 to-amber-600",
    accent: "bg-amber-500",
  },
};

const statusLabels: Record<MomentUnit["status"], { label: string; color: string; dotColor: string }> = {
  disponivel: { label: "Disponível", color: "bg-emerald-100 text-emerald-800 border-emerald-200", dotColor: "bg-emerald-500" },
  reservado: { label: "Reservada", color: "bg-amber-100 text-amber-800 border-amber-200", dotColor: "bg-amber-500" },
  vendido: { label: "Vendida", color: "bg-red-100 text-red-800 border-red-200", dotColor: "bg-red-500" },
};

const allStatuses: { value: MomentUnit["status"]; label: string; dotColor: string }[] = [
  { value: "disponivel", label: "Disponível", dotColor: "bg-emerald-500" },
  { value: "reservado", label: "Reservada", dotColor: "bg-amber-500" },
  { value: "vendido", label: "Vendida", dotColor: "bg-red-500" },
];

const statusCycle: MomentUnit["status"][] = ["disponivel", "reservado", "vendido"];
function getNextStatus(current: MomentUnit["status"]): MomentUnit["status"] {
  const idx = statusCycle.indexOf(current);
  if (idx === -1) return statusCycle[0];
  return statusCycle[(idx + 1) % statusCycle.length];
}

const statusTypes = ["disponivel", "reservado", "vendido"] as const;

// ─── Unit Card ───
const UnitCard = memo(function UnitCard({
  unit,
  onSelect,
  isBackground,
  isAdmin,
  onStatusChange,
  updateMode = false,
  isSelected = false,
  onToggleSelect,
}: {
  unit: MomentUnit;
  onSelect: (unit: MomentUnit) => void;
  isBackground: boolean;
  isAdmin?: boolean;
  onStatusChange?: (unidade: number, newStatus: MomentUnit["status"]) => void;
  updateMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (unit: MomentUnit) => void;
}) {
  const colors = typeColors[unit.tipologia];
  const status = statusLabels[unit.status];
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

  const updateStatus = async (newStatus: MomentUnit["status"]) => {
    if (saving) return;
    if (!onStatusChange || newStatus === unit.status) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/moment-units", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unidade: unit.unidade, status: newStatus }),
      });
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
    if (e.shiftKey && isAdmin && onToggleSelect) { onToggleSelect(unit); return; }
    if (updateMode && isAdmin) { if (flipping || saving) return; setFlipping(true); return; }
    onSelect(unit);
  };
  const handleStatusClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAdmin && updateMode) { if (saving) return; const next = getNextStatus(unit.status); updateStatus(next); return; }
  };
  const handleFlipStatusSelect = async (newStatus: MomentUnit["status"]) => {
    if (saving) return;
    await updateStatus(newStatus);
    setFlipping(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{
        opacity: isBackground ? 0.25 : 1,
        y: 0,
      }}
      exit={{ opacity: 0, y: -20 }}
      transition={{
        opacity: { duration: 0.3 },
      }}
      whileHover={!isBackground && !updateMode ? { y: -6, scale: 1.03 } : {}}
      onClick={handleCardClick}
      data-unit-card
      className={`
        relative cursor-pointer rounded-xl border-2 overflow-visible
        bg-white shadow-md hover:shadow-xl
        border-gray-100
        ${isSelected ? "ring-2 ring-blue-500 border-blue-400 shadow-blue-100" : ""}
        ${isBackground ? "pointer-events-none" : ""}
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
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight text-gray-900">
              {unit.unidade}
            </span>
          </div>
          <button
            onClick={handleStatusClick}
            className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${status.color} ${isAdmin && updateMode ? "cursor-pointer hover:opacity-80 ring-1 ring-offset-1 ring-gray-200 hover:ring-gray-400" : "cursor-default"}`}
            title={isAdmin && updateMode ? "Clique para alterar o status" : undefined}
          >
            {saving ? (
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" />
            ) : (
              <span className={`w-1.5 h-1.5 rounded-full ${status.dotColor}`} />
            )}
            {status.label}
          </button>
        </div>

        {/* Feedback visual */}
        <AnimatePresence>
          {feedback && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className={`flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-lg ${
                feedback === "success"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {feedback === "success" ? (
                <Check className="w-3 h-3 flex-shrink-0" />
              ) : (
                <X className="w-3 h-3 flex-shrink-0" />
              )}
              {feedback === "success" ? "Status atualizado!" : "Erro ao atualizar. Verifique o console."}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tipologia badge */}
        <div>
          <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md ${colors.bg} ${colors.text} ${colors.border} border`}>
            {unit.tipologia}
          </span>
        </div>

        {/* Info items */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-1.5 text-gray-500">
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="text-sm font-medium">{unit.areaStr}</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-500">
            <Car className="w-3.5 h-3.5" />
            <span className="text-sm font-medium">{unit.vagas} vag{unit.vagas === 1 ? "a" : "as"}</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-500">
            <BedDouble className="w-3.5 h-3.5" />
            <span className="text-sm font-medium">{unit.quartos} qts</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-500">
            <Sun className="w-3.5 h-3.5" />
            <span className="text-sm font-medium">{unit.sol}</span>
          </div>
        </div>

        {/* Price */}
        <div className="pt-1">
          <p className={`text-lg font-bold ${unit.valorVenda ? "text-gray-900" : "text-gray-400 italic"}`}>
            {unit.valorFormatado}
          </p>
          {unit.valorVenda && (
            <p className="text-[11px] text-gray-400 mt-0.5">
              R$ {(unit.valorVenda / unit.area).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/m²
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
                Unidade {unit.unidade}
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
    </motion.div>
  );
});

// ─── Expanded Centered Card ───
const ExpandedCard = memo(function ExpandedCard({ unit, onClose }: { unit: MomentUnit; onClose: () => void }) {
  const colors = typeColors[unit.tipologia];
  const status = statusLabels[unit.status];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 sm:p-8"
      onClick={onClose}
    >
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="absolute inset-0 bg-black/50"
      />

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        style={{ willChange: "transform, opacity" }}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
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
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${colors.gradient} flex items-center justify-center shadow-lg flex-shrink-0`}>
              <Building2 className="w-8 h-8 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
                Unidade {unit.unidade}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {momentPavimentos[unit.andar] || `${unit.andar}º andar`} — Moment
              </p>
              <div className="mt-3 flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${status.color}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${status.dotColor}`} />
                  {status.label}
                </span>
                <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border ${colors.bg} ${colors.text} ${colors.border}`}>
                  {unit.tipologia}
                </span>
              </div>
            </div>
          </div>

          {/* Separator */}
          <div className="border-t border-gray-100" />

          {/* Stats grid 2x2 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-gray-50 border border-gray-100">
              <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                <BedDouble className="w-5 h-5 text-gray-500" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">{unit.quartos} quarto{unit.quartos > 1 ? "s" : ""}</p>
                <p className="text-[11px] text-gray-400 font-medium">Dormitórios</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-gray-50 border border-gray-100">
              <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                <Maximize2 className="w-5 h-5 text-gray-500" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">{unit.areaStr}</p>
                <p className="text-[11px] text-gray-400 font-medium">Área Privativa</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-gray-50 border border-gray-100">
              <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                <Car className="w-5 h-5 text-gray-500" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">{unit.vagas} vaga{unit.vagas > 1 ? "s" : ""}</p>
                <p className="text-[11px] text-gray-400 font-medium">Garagem</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-gray-50 border border-gray-100">
              <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                <Sun className="w-5 h-5 text-gray-500" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">{unit.sol}</p>
                <p className="text-[11px] text-gray-400 font-medium">Posição Solar</p>
              </div>
            </div>
          </div>

          {/* Separator */}
          <div className="border-t border-gray-100" />

          {/* Price */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-gray-400" />
              <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Valor de Venda</span>
            </div>
            {unit.valorVenda ? (
              <div className="space-y-2">
                <p className="text-3xl font-bold text-gray-900">
                  {formatMomentCurrency(unit.valorVenda)}
                </p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs border-gray-200">
                    R$ {(unit.valorVenda / unit.area).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/m²
                  </Badge>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                <p className="text-lg font-semibold text-gray-400">Consulte o valor</p>
                <p className="text-sm text-gray-400 mt-1">Entre em contato para saber o valor desta unidade</p>
              </div>
            )}
          </div>

          {/* Simular Financiamento Button */}
          <a
            href={`/simulador-moment?valor=${unit.valorVenda || 0}&unidade=${unit.unidade}&area=${unit.areaStr}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              if (!unit.valorVenda) { e.preventDefault(); return; }
            }}
            className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 ${unit.valorVenda ? "bg-[#0D1B2A] to-gray-700 text-white hover:from-gray-800 hover:to-gray-600 shadow-lg hover:shadow-xl" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
          >
            <Calculator className="w-4 h-4" />
            Simular Financiamento
          </a>
        </div>
      </motion.div>
    </motion.div>
  );
});

// ─── Floor Section ───
const FloorSection = memo(function FloorSection({
  floor,
  floorUnits,
  selectedUnit,
  onSelectUnit,
  isCollapsed,
  onToggle,
  isAdmin,
  onStatusChange,
  updateMode = false,
  selectedForBatch,
  onToggleSelect,
}: {
  floor: number;
  floorUnits: MomentUnit[];
  selectedUnit: MomentUnit | null;
  onSelectUnit: (unit: MomentUnit) => void;
  isCollapsed: boolean;
  onToggle: () => void;
  isAdmin?: boolean;
  onStatusChange?: (unidade: number, newStatus: MomentUnit["status"]) => void;
  updateMode?: boolean;
  selectedForBatch?: Set<number>;
  onToggleSelect?: (unit: MomentUnit) => void;
}) {
  const tipologiasInFloor = [...new Set(floorUnits.map((u) => u.tipologia))];
  const totalInFloor = floorUnits.length;
  const disponiveis = floorUnits.filter((u) => u.status === "disponivel").length;
  const floorLabel = momentPavimentos[floor] || `${floor}º andar`;

  return (
    <motion.div layout className="space-y-4">
      {/* Floor header */}
      <motion.button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 rounded-xl bg-gradient-to-r bg-[#0D1B2A] text-white shadow-lg hover:shadow-xl transition-shadow group"
        whileHover={{ scale: 1.005 }}
        whileTap={{ scale: 0.995 }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="text-left">
            <h3 className="text-lg font-bold">{floorLabel}</h3>
            <p className="text-sm text-white/60">{totalInFloor} unidades • {disponiveis} disponíve{disponiveis !== 1 ? "is" : "l"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 flex-wrap justify-end">
            {tipologiasInFloor.map((tipo) => {
              const c = typeColors[tipo as TipologiaKey];
              if (!c) return null;
              const count = floorUnits.filter((u) => u.tipologia === tipo).length;
              return (
                <Badge key={tipo} variant="secondary" className="text-[10px] font-semibold bg-white/15 text-white/80 border-white/20">
                  {count}x {tipo}
                </Badge>
              );
            })}
          </div>
          <motion.div animate={{ rotate: isCollapsed ? 0 : 180 }}>
            <ChevronUp className="w-5 h-5 text-white/60" />
          </motion.div>
        </div>
      </motion.button>

      {/* Floor units grid */}
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-visible"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
              {floorUnits.map((unit) => (
                <UnitCard
                  key={unit.unidade}
                  unit={unit}
                  onSelect={onSelectUnit}
                  isBackground={selectedUnit !== null && selectedUnit.unidade !== unit.unidade}
                  isAdmin={isAdmin}
                  onStatusChange={onStatusChange}
                  updateMode={updateMode}
                  isSelected={selectedForBatch?.has(unit.unidade) ?? false}
                  onToggleSelect={onToggleSelect}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

// ─── Legend ───
const Legend = memo(function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-white/80 shadow-sm border border-gray-100">
      <span className="text-xs font-semibold text-gray-500 mr-1">Tipologias:</span>
      {momentTipologias.map((tipo) => {
        const colors = typeColors[tipo as TipologiaKey];
        if (!colors) return null;
        return (
          <Badge key={tipo} variant="outline" className={`text-[11px] font-semibold ${colors.bg} ${colors.text} ${colors.border}`}>
            <span className={`w-2 h-2 rounded-full ${colors.accent} mr-1`} />
            {tipo}
          </Badge>
        );
      })}
    </div>
  );
});

// ─── Batch Action Bar ───
const BatchActionBar = memo(function BatchActionBar({
  count,
  onApplyStatus,
  onClear,
  saving,
}: {
  count: number;
  onApplyStatus: (status: "disponivel" | "reservado" | "vendido") => void;
  onClear: () => void;
  saving: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 80 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 80 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-5 py-3 bg-gray-900 text-white rounded-2xl shadow-2xl border border-gray-700"
    >
      <span className="text-sm font-semibold whitespace-nowrap">
        {count} {count === 1 ? "unidade" : "unidades"} selecionada{count !== 1 ? "s" : ""}
      </span>
      <div className="w-px h-6 bg-gray-600" />
      <div className="flex items-center gap-2">
        <button onClick={() => onApplyStatus("disponivel")} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><span className="w-2 h-2 rounded-full bg-white" />Disponível</button>
        <button onClick={() => onApplyStatus("reservado")} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><span className="w-2 h-2 rounded-full bg-white" />Reservada</button>
        <button onClick={() => onApplyStatus("vendido")} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><span className="w-2 h-2 rounded-full bg-white" />Vendida</button>
      </div>
      <button onClick={onClear} className="ml-1 px-2 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><X className="w-4 h-4" /></button>
    </motion.div>
  );
});

// ─── Main Dashboard ───
export default function MomentDashboard({ isAdmin = false, isCoordinator = false, hideHeader = false }: { isAdmin?: boolean; isCoordinator?: boolean; hideHeader?: boolean }) {
  const router = useRouter();
  const track = useTrackEvent();
  const [units, setUnits] = useState<MomentUnit[]>(staticUnits);
  const [selectedUnit, setSelectedUnit] = useState<MomentUnit | null>(null);
  const [collapsedFloors, setCollapsedFloors] = useState<Set<number>>(new Set());
  const [filterAndar, setFilterAndar] = useState<number | "all">("all");
  const [filterTipologia, setFilterTipologia] = useState<string>("all");
  const [filterVagas, setFilterVagas] = useState<number | "all">("all");
  const [filterSol, setFilterSol] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<MomentUnit["status"] | "all">("all");
  const [sortBy, setSortBy] = useState<"andar" | "price-asc" | "price-desc">("andar");
  const [updateMode, setUpdateMode] = useState(false);
  const [selectedForBatch, setSelectedForBatch] = useState<Set<number>>(new Set());
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchConfirmStatus, setBatchConfirmStatus] = useState<"disponivel" | "reservado" | "vendido" | null>(null);

  // ─── Dashboard view tracking ───
  useEffect(() => {
    track({ event_type: "dashboard_view", resource_type: "empreendimento", metadata: { empreendimento: "moment" } });
     
  }, []);

  // Buscar dados do Supabase via API + Realtime
  useEffect(() => {
    let supabaseChannel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;

    async function loadData() {
      try {
        const res = await fetch("/api/moment-units");
        const data = await res.json();

        const mapped: MomentUnit[] = (Array.isArray(data) ? data : []).map((row: Record<string, unknown>) => ({
          andar: row.andar as number,
          unidade: row.unidade as number,
          vagas: row.vagas as number,
          area: Number(row.area),
          areaStr: row.area_str as string,
          valorVenda: row.valor_venda as number | null,
          valorStr: row.valor_venda ? Number(row.valor_venda).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "Consulte",
          valorFormatado: row.valor_venda ? formatMomentCurrency(Number(row.valor_venda)) : "Consulte o valor",
          tipologia: row.tipologia as MomentUnit["tipologia"],
          status: row.status as MomentUnit["status"],
          quartos: row.quartos as number,
          isCobertura: row.is_cobertura as boolean,
          sol: row.posicao_solar as string,
        }));

        setUnits(mapped);

        // Realtime: escutar mudanças de status e preço
        const supabase = createClient();
        supabaseChannel = supabase
          .channel("moment-realtime")
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "moment_units" },
            (payload) => {
              const updated = payload.new as Record<string, unknown>;
              setUnits((prev) =>
                prev.map((u) => {
                  if (u.unidade !== updated.unidade) return u;
                  const newValorVenda = updated.valor_venda as number | null;
                  return {
                    ...u,
                    status: updated.status as MomentUnit["status"],
                    valorVenda: newValorVenda,
                    valorStr: newValorVenda ? newValorVenda.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "Consulte",
                    valorFormatado: newValorVenda ? formatMomentCurrency(newValorVenda) : "Consulte o valor",
                  };
                })
              );
            }
          )
          .subscribe();
      } catch {
        console.error("Erro ao carregar dados do Supabase, usando dados estáticos.");
      }
    }

    loadData();

    return () => {
      if (supabaseChannel) {
        createClient().removeChannel(supabaseChannel);
      }
    };
  }, []);

  const filteredUnits = useMemo(() => {
    let result = [...units];
    if (filterAndar !== "all") result = result.filter((u) => u.andar === filterAndar);
    if (filterTipologia !== "all") result = result.filter((u) => u.tipologia === filterTipologia);
    if (filterVagas !== "all") result = result.filter((u) => u.vagas === filterVagas);
    if (filterSol !== "all") result = result.filter((u) => u.sol === filterSol);
    if (filterStatus !== "all") result = result.filter((u) => u.status === filterStatus);
    if (sortBy === "price-asc") result.sort((a, b) => (a.valorVenda ?? Infinity) - (b.valorVenda ?? Infinity));
    if (sortBy === "price-desc") result.sort((a, b) => (b.valorVenda ?? 0) - (a.valorVenda ?? 0));
    return result;
  }, [units, filterAndar, filterTipologia, filterVagas, filterSol, filterStatus, sortBy]);

  const activeFloors = useMemo(() => {
    const floorSet = new Set(filteredUnits.map((u) => u.andar));
    return momentAndares.filter((f) => floorSet.has(f));
  }, [filteredUnits]);

  useEffect(() => { if (updateMode) { setSelectedUnit(null); setSelectedForBatch(new Set()); } }, [updateMode]);

  const handleBatchToggle = useCallback((unit: MomentUnit) => {
    setSelectedForBatch((prev) => { const next = new Set(prev); if (next.has(unit.unidade)) next.delete(unit.unidade); else next.add(unit.unidade); return next; });
  }, []);
  const handleBatchClear = useCallback(() => setSelectedForBatch(new Set()), []);
  const handleBatchStatusChange = useCallback((newStatus: "disponivel" | "reservado" | "vendido") => {
    if (batchSaving || selectedForBatch.size === 0) return;
    setBatchConfirmStatus(newStatus);
  }, [batchSaving, selectedForBatch]);

  const confirmBatchStatusChange = useCallback(async () => {
    if (!batchConfirmStatus) return;
    const newStatus = batchConfirmStatus;
    setBatchConfirmStatus(null);
    setBatchSaving(true);
    try {
      const updates = Array.from(selectedForBatch).map(async (unidade) => {
        const res = await fetch("/api/moment-units", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unidade, status: newStatus }) });
        return { unidade, ok: res.ok };
      });
      const results = await Promise.all(updates);
      const succeeded = results.filter((r) => r.ok).map((r) => r.unidade);
      setUnits((prev) => prev.map((u) => (succeeded.includes(u.unidade) ? { ...u, status: newStatus } : u)));
      setSelectedForBatch(new Set());
    } catch (err) { console.error("Erro ao atualizar em lote:", err); } finally { setBatchSaving(false); }
  }, [batchConfirmStatus, selectedForBatch]);

  const handleSelectUnit = useCallback((unit: MomentUnit) => {
    setSelectedUnit(unit);
  }, []);

  const handleLocalStatusChange = useCallback((unidade: number, newStatus: MomentUnit["status"]) => {
    setUnits((prev) => prev.map((u) => (u.unidade === unidade) ? { ...u, status: newStatus } : u));
    setSelectedUnit((prev) => prev && prev.unidade === unidade ? { ...prev, status: newStatus } : prev);
  }, []);

  const handleCloseExpanded = useCallback(() => {
    setSelectedUnit(null);
  }, []);

  const toggleFloor = useCallback((floor: number) => {
    setCollapsedFloors((prev) => {
      const next = new Set(prev);
      if (next.has(floor)) next.delete(floor);
      else next.add(floor);
      return next;
    });
  }, []);

  const getFloorToggle = useCallback((floor: number) => () => toggleFloor(floor), [toggleFloor]);

  const handleLogout = useCallback(async () => {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }, [router]);

  const hasActiveFilters = filterAndar !== "all" || filterTipologia !== "all" || filterVagas !== "all" || filterSol !== "all" || filterStatus !== "all" || sortBy !== "andar";

  const mobileMenuItems = useMemo(() => [
    { label: "Voltar aos Projetos", icon: <ArrowLeft className="w-5 h-5" />, href: "/projetos" },
    ...(isCoordinator && isAdmin ? [{
      label: updateMode ? "Desativar Atualização" : "Modo Atualização",
      icon: <Pencil className="w-5 h-5" />,
      onClick: () => setUpdateMode(!updateMode),
      variant: "warning" as const,
      active: updateMode,
    }] : []),
    { label: "Tempo Real", icon: <Radio className="w-5 h-5" />, badge: "ON" },
    { label: "Sair", icon: <LogOut className="w-5 h-5" />, onClick: handleLogout, variant: "danger" as const },
  ], [isCoordinator, isAdmin, updateMode, handleLogout]);

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
                  <p className="text-[10px] sm:text-[11px] text-gray-400 font-medium truncate">Moment</p>
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
                  <button onClick={() => setUpdateMode(!updateMode)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${updateMode ? "bg-amber-500/25 text-amber-300 border-amber-500/40 shadow-lg shadow-amber-500/10" : "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white"}`} title={updateMode ? "Desativar modo de atualização" : "Ativar modo de atualização"}>
                    <Pencil className="w-3.5 h-3.5" />
                    <span>{updateMode ? "Atualização ON" : "Modo Atualização"}</span>
                  </button>)}
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
              <MobileMenu
                items={mobileMenuItems}
              />
            </div>
          </div>
        </header>
      )}
      {updateMode && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-center gap-2">
          <Pencil className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-sm font-semibold text-amber-700">Modo de Atualização Ativado — Clique em qualquer unidade para selecionar o novo status{isAdmin && <span className="font-normal text-amber-600"> · Shift+clique para selecionar em lote</span>}</p>
          <button onClick={() => setUpdateMode(false)} className="ml-2 text-xs font-medium text-amber-600 hover:text-amber-800 underline underline-offset-2 flex-shrink-0">Desativar</button>
        </div>)}

      <main className="w-full px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10 py-6 space-y-6 flex-1">
        {/* Filters */}
        <div className="p-4 rounded-xl bg-white shadow-md border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Filtros</span>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-xs text-gray-400 hover:text-gray-600"
                onClick={() => { setFilterAndar("all"); setFilterTipologia("all"); setFilterVagas("all"); setFilterSol("all"); setFilterStatus("all"); setSortBy("andar"); }}
              >
                Limpar filtros
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            {/* Andar filter */}
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Andar</label>
              <select
                value={filterAndar}
                onChange={(e) => setFilterAndar(e.target.value === "all" ? "all" : Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-all"
              >
                <option value="all">Todos</option>
                {momentAndares.map((f) => (
                  <option key={f} value={f}>{momentPavimentos[f]}</option>
                ))}
              </select>
            </div>

            {/* Tipologia filter */}
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Tipologia</label>
              <select
                value={filterTipologia}
                onChange={(e) => setFilterTipologia(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-all"
              >
                <option value="all">Todas</option>
                {momentTipologias.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Vagas filter */}
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Vagas</label>
              <select
                value={filterVagas}
                onChange={(e) => setFilterVagas(e.target.value === "all" ? "all" : Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-all"
              >
                <option value="all">Todas</option>
                <option value="2">2 vagas</option>
                <option value="3">3 vagas</option>
              </select>
            </div>

            {/* Posição solar filter */}
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Posição solar</label>
              <select
                value={filterSol}
                onChange={(e) => setFilterSol(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-all"
              >
                <option value="all">Todos</option>
                <option value="Face Norte">Face Norte</option>
                <option value="Face Sul">Face Sul</option>
              </select>
            </div>

            {/* Status filter */}
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as MomentUnit["status"] | "all")}
                className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-all"
              >
                <option value="all">Todos</option>
                {statusTypes.map((s) => (
                  <option key={s} value={s}>
                    {s === "disponivel" ? "Disponível" : s === "reservado" ? "Reservada" : "Vendida"}
                  </option>
                ))}
              </select>
            </div>

            {/* Ordenação */}
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Ordenar</label>
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

            {/* Results count */}
            <div className="flex items-end">
              <div className="w-full h-9 px-3 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center">
                <span className="text-sm font-medium text-gray-500">
                  <span className="font-bold text-gray-900">{filteredUnits.length}</span> resultado{filteredUnits.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <Legend />

        {/* Units display — floor sections or flat sorted list */}
        {sortBy === "andar" ? (
          <div className="space-y-6">
            {activeFloors.map((floor) => {
              const floorUnits = filteredUnits
                .filter((u) => u.andar === floor)
                .sort((a, b) => a.unidade - b.unidade);
              return (
                <FloorSection
                  key={floor}
                  floor={floor}
                  floorUnits={floorUnits}
                  selectedUnit={selectedUnit}
                  onSelectUnit={handleSelectUnit}
                  isCollapsed={collapsedFloors.has(floor)}
                  onToggle={getFloorToggle(floor)}
                  isAdmin={isAdmin}
                  onStatusChange={handleLocalStatusChange}
                  updateMode={updateMode}
                  selectedForBatch={selectedForBatch}
                  onToggleSelect={handleBatchToggle}
                />
              );
            })}
          </div>
        ) : (
          <motion.div
            key={sortBy}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
              <DollarSign className="w-4 h-4" />
              Ordenado por {sortBy === "price-asc" ? "menor preço" : "maior preço"}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
              {filteredUnits.map((unit) => (
                <UnitCard
                  key={unit.unidade}
                  unit={unit}
                  onSelect={handleSelectUnit}
                  isBackground={false}
                  isAdmin={isAdmin}
                  onStatusChange={handleLocalStatusChange}
                  updateMode={updateMode}
                  isSelected={selectedForBatch.has(unit.unidade)}
                  onToggleSelect={handleBatchToggle}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Empty state */}
        {filteredUnits.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-16 px-4"
          >
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <Building2 className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-semibold text-gray-500 mb-1">Nenhuma unidade encontrada</h3>
            <p className="text-sm text-gray-400 text-center max-w-sm">Tente ajustar os filtros para visualizar mais unidades disponíveis.</p>
          </motion.div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10 py-4 mt-auto">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>ImobSync • Moment</span>
          <span>{units.length} unidades • {units.filter((u) => u.status === "disponivel").length} disponíve{units.filter((u) => u.status === "disponivel").length !== 1 ? "is" : "l"}</span>
        </div>
      </footer>

      {/* Expanded card modal */}
      <AnimatePresence>
        {selectedUnit && (
          <ExpandedCard unit={selectedUnit} onClose={handleCloseExpanded} />
        )}
      </AnimatePresence>

      {/* Batch action bar */}
      <AnimatePresence>
        {selectedForBatch.size > 0 && isAdmin && (
          <BatchActionBar count={selectedForBatch.size} onApplyStatus={handleBatchStatusChange} onClear={handleBatchClear} saving={batchSaving} />
        )}
      </AnimatePresence>

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
