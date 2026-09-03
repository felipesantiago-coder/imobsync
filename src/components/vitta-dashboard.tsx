"use client";

import React, { useState, useCallback, useMemo, useEffect, memo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  vittaBlocos,
  vittaTipos,
  vittaAndares,
  vittaAndarLabels,
  formatVittaCurrency,
  type VittaUnit,
  vittaUnits as staticUnits,
} from "@/lib/vitta-data";
import { Building2, Maximize2, DollarSign, ChevronUp, Filter, X, Check, LogOut, Calculator, BedDouble, Sun, Pencil, ArrowLeft, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import MobileMenu from "@/components/MobileMenu";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import ConfirmDialog from "@/components/confirm-dialog";
import { useTrackEvent } from "@/hooks/useTrackEvent";

// ─── Color palette for tipos ───
type TipoKey = VittaUnit["tipo"];

const typeColors: Record<TipoKey, { bg: string; border: string; text: string; gradient: string; accent: string }> = {
  "1 quarto": {
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-700",
    gradient: "from-orange-500 to-orange-600",
    accent: "bg-orange-500",
  },
  "2 quartos": {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    gradient: "from-emerald-500 to-emerald-600",
    accent: "bg-emerald-500",
  },
  "2 quartos (suíte e varanda)": {
    bg: "bg-sky-50",
    border: "border-sky-200",
    text: "text-sky-700",
    gradient: "from-sky-500 to-sky-600",
    accent: "bg-sky-500",
  },
  "2 quartos (garden)": {
    bg: "bg-violet-50",
    border: "border-violet-200",
    text: "text-violet-700",
    gradient: "from-violet-500 to-violet-600",
    accent: "bg-violet-500",
  },
  "Loja": {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    gradient: "from-amber-500 to-amber-600",
    accent: "bg-amber-500",
  },
};

const statusLabels: Record<VittaUnit["status"], { label: string; color: string; dotColor: string }> = {
  disponivel: { label: "Disponível", color: "bg-emerald-100 text-emerald-800 border-emerald-200", dotColor: "bg-emerald-500" },
  reservado: { label: "Reservada", color: "bg-amber-100 text-amber-800 border-amber-200", dotColor: "bg-amber-500" },
  vendido: { label: "Vendida", color: "bg-red-100 text-red-800 border-red-200", dotColor: "bg-red-500" },
};

const allStatuses: { value: VittaUnit["status"]; label: string; dotColor: string }[] = [
  { value: "disponivel", label: "Disponível", dotColor: "bg-emerald-500" },
  { value: "reservado", label: "Reservada", dotColor: "bg-amber-500" },
  { value: "vendido", label: "Vendida", dotColor: "bg-red-500" },
];

const statusCycle: VittaUnit["status"][] = ["disponivel", "reservado", "vendido"];
function getNextStatus(current: VittaUnit["status"]): VittaUnit["status"] {
  const idx = statusCycle.indexOf(current);
  if (idx === -1) return statusCycle[0];
  return statusCycle[(idx + 1) % statusCycle.length];
}

const statusTypes = ["disponivel", "reservado", "vendido"] as const;

// ─── Helpers ───
function getQuartos(unit: VittaUnit): number | null {
  if (unit.tipo === "Loja") return null;
  const match = unit.tipo.match(/(\d+)\s*quarto/);
  return match ? parseInt(match[1]) : null;
}

function getPosicaoSolar(unit: VittaUnit): string | null {
  if (unit.tipo === "Loja") return null;
  return unit.unidade % 2 === 0 ? "Nascente" : "Poente";
}

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
  unit: VittaUnit;
  onSelect: (unit: VittaUnit) => void;
  isBackground: boolean;
  isAdmin?: boolean;
  onStatusChange?: (unidade: number, bloco: string, andar: string, newStatus: VittaUnit["status"]) => void;
  updateMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (unit: VittaUnit) => void;
}) {
  const colors = typeColors[unit.tipo as TipoKey] || typeColors["1 quarto"];
  const status = statusLabels[unit.status];
  const [flipping, setFlipping] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset flip when update mode is deactivated.
  // Official React pattern for prop-driven state reset: adjust state during
  // render (instead of setState-in-effect, which causes cascading renders).
  const [prevUpdateMode, setPrevUpdateMode] = useState(updateMode);
  if (prevUpdateMode !== updateMode) {
    setPrevUpdateMode(updateMode);
    if (!updateMode) setFlipping(false);
  }


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

  // Badge click: only cycle status when update mode is active
  const handleStatusClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAdmin && updateMode) {
      if (saving) return;
      const next = getNextStatus(unit.status);
      if (onStatusChange) onStatusChange(unit.unidade, unit.bloco, unit.andar, next);
      setSaving(true);
      setTimeout(() => setSaving(false), 500);
      return;
    }
  };

  const handleFlipStatusSelect = (newStatus: VittaUnit["status"]) => {
    if (saving) return;
    if (onStatusChange) onStatusChange(unit.unidade, unit.bloco, unit.andar, newStatus);
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
        relative rounded-xl border-2 overflow-visible
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
      <div className={`h-1.5 bg-gradient-to-r ${colors.gradient}`} />
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Bloco {unit.bloco}</span>
            <span className="text-xl font-bold tracking-tight text-gray-900">{unit.unidade}</span>
          </div>
          <button
            onClick={handleStatusClick}
            className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${status.color} ${isAdmin && updateMode ? "cursor-pointer hover:opacity-80 ring-1 ring-offset-1 ring-gray-200 hover:ring-gray-400" : "cursor-default"}`}
            title={isAdmin && updateMode ? "Clique para alterar o status" : undefined}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${status.dotColor}`} />
            {status.label}
          </button>
        </div>

        <div>
          <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md ${colors.bg} ${colors.text} ${colors.border} border`}>
            {unit.tipo}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-gray-500">
          <Maximize2 className="w-3.5 h-3.5" />
          <span className="text-sm font-medium">{unit.areaStr}</span>
        </div>

        <div className="pt-1">
          <p className="text-lg font-bold text-gray-900">{unit.valorFormatado}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            R$ {(unit.valorVenda / unit.area).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/m²
          </p>
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
                Bloco {unit.bloco} — Unidade {unit.unidade}
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

// ─── Expanded Card ───
const ExpandedCard = memo(function ExpandedCard({ unit, onClose }: { unit: VittaUnit; onClose: () => void }) {
  const colors = typeColors[unit.tipo as TipoKey] || typeColors["1 quarto"];
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
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="absolute inset-0 bg-black/50"
      />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        style={{ willChange: "transform, opacity" }}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className={`h-2 bg-gradient-to-r ${colors.gradient}`} />
        <div className="p-6 sm:p-8 space-y-5">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors z-20"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>

          <div className="flex items-start gap-4">
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${colors.gradient} flex items-center justify-center shadow-lg flex-shrink-0`}>
              <Building2 className="w-8 h-8 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
                Unidade {unit.unidade}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Bloco {unit.bloco} — {unit.andar} — Residencial Vitta
              </p>
              <div className="mt-3 flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${status.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${status.dotColor}`} />
                  {status.label}
                </span>
                <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border ${colors.bg} ${colors.text} ${colors.border}`}>
                  {unit.tipo}
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100" />

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-gray-50 border border-gray-100">
              <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-gray-500" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">Bloco {unit.bloco}</p>
                <p className="text-[11px] text-gray-400 font-medium">Bloco</p>
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
            {getQuartos(unit) !== null && (
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-gray-50 border border-gray-100">
                <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                  <BedDouble className="w-5 h-5 text-gray-500" />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">{getQuartos(unit)} quarto{getQuartos(unit)! > 1 ? "s" : ""}</p>
                  <p className="text-[11px] text-gray-400 font-medium">Dormitórios</p>
                </div>
              </div>
            )}
            {getPosicaoSolar(unit) !== null && (
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-gray-50 border border-gray-100">
                <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                  <Sun className={`w-5 h-5 ${getPosicaoSolar(unit) === "Nascente" ? "text-amber-500" : "text-orange-500"}`} />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">{getPosicaoSolar(unit)}</p>
                  <p className="text-[11px] text-gray-400 font-medium">Posição Solar</p>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100" />

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-gray-400" />
              <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Valor de Venda</span>
            </div>
            <div className="space-y-2">
              <p className="text-3xl font-bold text-gray-900">{formatVittaCurrency(unit.valorVenda)}</p>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs border-gray-200">
                  R$ {(unit.valorVenda / unit.area).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/m²
                </Badge>
              </div>
            </div>
          </div>

          <a
            href={`/simulador-vitta?valor=${unit.valorVenda}&unidade=${unit.bloco}-${unit.unidade}&area=${unit.areaStr}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 bg-[#0D1B2A] to-gray-700 text-white hover:from-gray-800 hover:to-gray-600 shadow-lg hover:shadow-xl"
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
  floor: string;
  floorUnits: VittaUnit[];
  selectedUnit: VittaUnit | null;
  onSelectUnit: (unit: VittaUnit) => void;
  isCollapsed: boolean;
  onToggle: () => void;
  isAdmin?: boolean;
  onStatusChange?: (unidade: number, bloco: string, andar: string, newStatus: VittaUnit["status"]) => void;
  updateMode?: boolean;
  selectedForBatch?: Set<string>;
  onToggleSelect?: (unit: VittaUnit) => void;
}) {
  const tiposInFloor = [...new Set(floorUnits.map((u) => u.tipo))];
  const totalInFloor = floorUnits.length;
  const disponiveis = floorUnits.filter((u) => u.status === "disponivel").length;

  return (
    <motion.div layout className="space-y-4">
      <motion.button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 rounded-xl bg-gradient-to-r bg-[#0D1B2A] text-white shadow-lg hover:shadow-xl transition-shadow group"
        whileHover={{ scale: 1.005 }}
        whileTap={{ scale: 0.995 }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center backdrop-blur-sm">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="text-left">
            <h3 className="text-lg font-bold">{floor}</h3>
            <p className="text-sm text-white/60">{totalInFloor} unidades • {disponiveis} disponíve{disponiveis !== 1 ? "is" : "l"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 flex-wrap justify-end">
            {tiposInFloor.map((tipo) => {
              const c = typeColors[tipo as TipoKey];
              if (!c) return null;
              const count = floorUnits.filter((u) => u.tipo === tipo).length;
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
                  key={`${unit.bloco}-${unit.unidade}`}
                  unit={unit}
                  onSelect={onSelectUnit}
                  isBackground={selectedUnit !== null && (selectedUnit.bloco !== unit.bloco || selectedUnit.unidade !== unit.unidade)}
                  isAdmin={isAdmin}
                  onStatusChange={onStatusChange}
                  updateMode={updateMode}
                  isSelected={selectedForBatch?.has(`${unit.bloco}-${unit.unidade}`) ?? false}
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
      {vittaTipos.map((tipo) => {
        const colors = typeColors[tipo as TipoKey];
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
  onApplyStatus: (status: VittaUnit["status"]) => void;
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
    </motion.div>
  );
});

// ─── Main Dashboard ───
export default function VittaDashboard({ isAdmin = false, isCoordinator = false, hideHeader = false }: { isAdmin?: boolean; isCoordinator?: boolean; hideHeader?: boolean }) {
  const router = useRouter();
  const track = useTrackEvent();
  const [units, setUnits] = useState<VittaUnit[]>(staticUnits);
  const [selectedUnit, setSelectedUnit] = useState<VittaUnit | null>(null);
  const [collapsedFloors, setCollapsedFloors] = useState<Set<string>>(new Set());
  const [filterBloco, setFilterBloco] = useState<string>("all");
  const [filterAndar, setFilterAndar] = useState<string>("all");
  const [filterTipo, setFilterTipo] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<VittaUnit["status"] | "all">("all");
  const [sortBy, setSortBy] = useState<"andar" | "price-asc" | "price-desc">("andar");
  const [updateMode, setUpdateMode] = useState(false);
  const [selectedForBatch, setSelectedForBatch] = useState<Set<string>>(new Set());
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchConfirmStatus, setBatchConfirmStatus] = useState<VittaUnit["status"] | null>(null);

  // ─── Dashboard view tracking ───
  useEffect(() => {
    track({ event_type: "dashboard_view", resource_type: "empreendimento", metadata: { empreendimento: "vitta" } });
     
  }, []);

  // Carregar unidades do banco (fallback para dados estáticos)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/vitta-units");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            // Mapear formato do banco para o formato do dashboard
            const mapped: VittaUnit[] = data.map((row: Record<string, unknown>) => ({
              bloco: row.bloco as "A" | "B",
              andar: row.andar as string,
              andarNum: Number(row.andar_num),
              unidade: Number(row.unidade),
              area: Number(row.area),
              areaStr: row.area_str as string,
              valorVenda: Number(row.valor_venda),
              valorStr: formatVittaCurrency(Number(row.valor_venda)),
              valorFormatado: formatVittaCurrency(Number(row.valor_venda)),
              status: row.status as VittaUnit["status"],
              tipo: row.tipologia as string,
            }));
            setUnits(mapped);
          }
        }
      } catch {
        // Manter dados estáticos como fallback
      }
    })();
  }, []);

  const handleSelectUnit = useCallback((unit: VittaUnit) => setSelectedUnit(unit), []);
  const handleCloseExpanded = useCallback(() => setSelectedUnit(null), []);

  useEffect(() => { if (updateMode) { setSelectedUnit(null); setSelectedForBatch(new Set()); } }, [updateMode]);

  // Batch selection handlers
  const handleBatchToggle = useCallback((unit: VittaUnit) => {
    setSelectedForBatch((prev) => {
      const next = new Set(prev);
      const key = `${unit.bloco}-${unit.unidade}`;
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleBatchClear = useCallback(() => {
    setSelectedForBatch(new Set());
  }, []);

  const handleBatchStatusChange = useCallback((newStatus: VittaUnit["status"]) => {
    if (batchSaving || selectedForBatch.size === 0) return;
    setBatchConfirmStatus(newStatus);
  }, [batchSaving, selectedForBatch]);

  const confirmBatchStatusChange = useCallback(async () => {
    if (!batchConfirmStatus) return;
    const newStatus = batchConfirmStatus;
    setBatchConfirmStatus(null);
    setBatchSaving(true);
    try {
      const updates = Array.from(selectedForBatch).map(async (key) => {
        const [bloco, unidadeStr] = key.split("-");
        const unidade = parseInt(unidadeStr);
        // Find the matching unit to get its andar
        const unit = units.find((u) => u.bloco === bloco && u.unidade === unidade);
        const andar = unit?.andar || "";
        // Optimistic update
        setUnits((prev) => prev.map((u) => (u.bloco === bloco && u.unidade === unidade) ? { ...u, status: newStatus } : u));
        const res = await fetch("/api/vitta-units", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bloco, unidade, andar, status: newStatus }),
        });
        return { key, bloco, unidade, ok: res.ok };
      });
      const results = await Promise.all(updates);
      const failed = results.filter((r) => !r.ok);
      // Revert failed ones
      if (failed.length > 0) {
        setUnits((prev) =>
          prev.map((u) => {
            const key = `${u.bloco}-${u.unidade}`;
            if (failed.some((r) => r.key === key) && u.status === newStatus) return { ...u, status: "disponivel" };
            return u;
          })
        );
      }
      setSelectedForBatch(new Set());
    } catch (err) {
      console.error("Erro ao atualizar em lote:", err);
    } finally {
      setBatchSaving(false);
    }
  }, [batchConfirmStatus, selectedForBatch, units]);

  const handleLocalStatusChange = useCallback(async (unidade: number, bloco: string, andar: string, newStatus: VittaUnit["status"]) => {
    // Otimistic update
    setUnits((prev) => prev.map((u) => (u.bloco === bloco && u.unidade === unidade && u.andar === andar) ? { ...u, status: newStatus } : u));
    setSelectedUnit((prev) => prev && prev.bloco === bloco && prev.unidade === unidade && prev.andar === andar ? { ...prev, status: newStatus } : prev);

    // Persistir no banco
    try {
      const res = await fetch("/api/vitta-units", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bloco, unidade, andar, status: newStatus }),
      });
      if (!res.ok) {
        const json = await res.json();
        console.error("Erro ao salvar status:", json.error);
        // Reverter em caso de erro
        setUnits((prev) => prev.map((u) => (u.bloco === bloco && u.unidade === unidade && u.andar === andar) ? { ...u, status: "disponivel" } : u));
      }
    } catch (err) {
      console.error("Erro ao salvar status:", err);
    }
  }, []);

  const toggleFloor = useCallback((floor: string) => {
    setCollapsedFloors((prev) => {
      const next = new Set(prev);
      if (next.has(floor)) next.delete(floor);
      else next.add(floor);
      return next;
    });
  }, []);

  const getFloorToggle = useCallback((floor: string) => () => toggleFloor(floor), [toggleFloor]);

  const handleLogout = useCallback(async () => {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }, [router]);

  const filteredUnits = useMemo(() => {
    let result = [...units];
    if (filterBloco !== "all") result = result.filter((u) => u.bloco === filterBloco);
    if (filterAndar !== "all") result = result.filter((u) => u.andar === filterAndar);
    if (filterTipo !== "all") result = result.filter((u) => u.tipo === filterTipo);
    if (filterStatus !== "all") result = result.filter((u) => u.status === filterStatus);
    if (sortBy === "price-asc") result.sort((a, b) => a.valorVenda - b.valorVenda);
    if (sortBy === "price-desc") result.sort((a, b) => b.valorVenda - a.valorVenda);
    return result;
  }, [units, filterBloco, filterAndar, filterTipo, filterStatus, sortBy]);

  // Group by floor for display
  const activeFloors = useMemo(() => {
    const floorSet = new Set(filteredUnits.map((u) => u.andar));
    return vittaAndares.filter((f) => floorSet.has(f));
  }, [filteredUnits]);

  const hasActiveFilters = filterBloco !== "all" || filterAndar !== "all" || filterTipo !== "all" || filterStatus !== "all" || sortBy !== "andar";

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
                  <p className="text-[10px] sm:text-[11px] text-gray-400 font-medium truncate">Residencial Vitta — Ceilândia</p>
                </div>
              </div>
              {/* Desktop actions */}
              <div className="hidden sm:flex items-center gap-2">
                <a href="/projetos" className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors">
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
                <button onClick={handleLogout} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-semibold transition-colors border border-red-500/20">
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
          <p className="text-sm font-semibold text-amber-700">Modo de Atualização Ativado — Clique em qualquer unidade para alterar o status{isAdmin && <span className="font-normal text-amber-600"> · Shift+clique para selecionar em lote</span>}</p>
          <button onClick={() => setUpdateMode(false)} className="ml-2 text-xs font-medium text-amber-600 hover:text-amber-800 underline underline-offset-2 flex-shrink-0">Desativar</button>
        </div>)}

      <main className="w-full px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10 py-6 space-y-6 flex-1">
        {/* Filters */}
        <div className="p-4 rounded-xl bg-white shadow-md border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Filtros</span>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="ml-auto text-xs text-gray-400 hover:text-gray-600"
                onClick={() => { setFilterBloco("all"); setFilterAndar("all"); setFilterTipo("all"); setFilterStatus("all"); setSortBy("andar"); }}>
                Limpar filtros
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Bloco</label>
              <select value={filterBloco} onChange={(e) => setFilterBloco(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-all">
                <option value="all">Todos</option>
                {vittaBlocos.map((b) => (<option key={b} value={b}>Bloco {b}</option>))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Andar</label>
              <select value={filterAndar} onChange={(e) => setFilterAndar(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-all">
                <option value="all">Todos</option>
                {vittaAndares.map((a) => (<option key={a} value={a}>{a}</option>))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Tipologia</label>
              <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-all">
                <option value="all">Todas</option>
                {vittaTipos.map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Status</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as VittaUnit["status"] | "all")}
                className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-all">
                <option value="all">Todos</option>
                {statusTypes.map((s) => (<option key={s} value={s}>{s === "disponivel" ? "Disponível" : s === "reservado" ? "Reservada" : "Vendida"}</option>))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Ordenar</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-all">
                <option value="andar">Andar</option>
                <option value="price-asc">Menor preço</option>
                <option value="price-desc">Maior preço</option>
              </select>
            </div>
            <div className="flex items-end">
              <div className="w-full h-9 px-3 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center">
                <span className="text-sm font-medium text-gray-500">
                  <span className="font-bold text-gray-900">{filteredUnits.length}</span> resultado{filteredUnits.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>
        </div>

        <Legend />

        {sortBy === "andar" ? (
          <div className="space-y-6">
            {activeFloors.map((floor) => {
              const floorUnits = filteredUnits.filter((u) => u.andar === floor).sort((a, b) => {
                if (a.bloco !== b.bloco) return a.bloco.localeCompare(b.bloco);
                return a.unidade - b.unidade;
              });
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
          <motion.div key={sortBy} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
              <DollarSign className="w-4 h-4" />
              Ordenado por {sortBy === "price-asc" ? "menor preço" : "maior preço"}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
              {filteredUnits.map((unit) => (
                <UnitCard key={`${unit.bloco}-${unit.unidade}`} unit={unit} onSelect={handleSelectUnit} isBackground={false} isAdmin={isAdmin} onStatusChange={handleLocalStatusChange} updateMode={updateMode} isSelected={selectedForBatch.has(`${unit.bloco}-${unit.unidade}`)} onToggleSelect={handleBatchToggle} />
              ))}
            </div>
          </motion.div>
        )}

        {filteredUnits.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center py-16 px-4">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <Building2 className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-semibold text-gray-500 mb-1">Nenhuma unidade encontrada</h3>
            <p className="text-sm text-gray-400 text-center max-w-sm">Tente ajustar os filtros para visualizar mais unidades disponíveis.</p>
          </motion.div>
        )}
      </main>

      <footer className="w-full px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10 py-4 mt-auto">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>ImobSync • Residencial Vitta</span>
          <span>{units.length} unidades • {units.filter((u) => u.status === "disponivel").length} disponíve{units.filter((u) => u.status === "disponivel").length !== 1 ? "is" : "l"}</span>
        </div>
      </footer>

      <AnimatePresence>
        {selectedUnit && <ExpandedCard unit={selectedUnit} onClose={handleCloseExpanded} />}
      </AnimatePresence>

      {/* Batch action bar */}
      <AnimatePresence>
        {selectedForBatch.size > 0 && isAdmin && (
          <BatchActionBar
            count={selectedForBatch.size}
            onApplyStatus={handleBatchStatusChange}
            onClear={handleBatchClear}
            saving={batchSaving}
          />
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