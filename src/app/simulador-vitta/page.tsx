"use client";

import Link from "next/link";
import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTrackEvent } from "@/hooks/useTrackEvent";
import {
  Building2,
  Calculator,
  Info,
  FileDown,
  Trash2,
  RotateCcw,
  TrendingUp,
  Home,
  Wallet,
  CalendarClock,
  Settings,
} from "lucide-react";

// ─── Constants ───
const DELIVERY_YEAR = 2029;
const DELIVERY_MONTH = 7; // August (0-indexed: 0=Jan, 7=Aug)
const MAX_MONTHLY_INSTALLMENTS = 60;
const MAX_SEMESTER_INSTALLMENTS = 5;
const MIN_CAPTATION_PCT = 25;

// ─── Utility Functions ───
function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function parseCurrencyToNumber(formatted: string): number {
  if (!formatted) return 0;
  const cleaned = formatted.replace(/[R$\s.]/g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

function formatInputAsCurrency(value: string): { formatted: string; numeric: number } {
  const digits = value.replace(/\D/g, "");
  const numeric = parseInt(digits) || 0;
  const formatted = formatBRL(numeric / 100);
  return { formatted, numeric: numeric / 100 };
}

function addMonthsToDate(date: Date, months: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

function monthsBetween(start: Date, end: Date): number {
  const yearDiff = end.getUTCFullYear() - start.getUTCFullYear();
  const monthDiff = end.getUTCMonth() - start.getUTCMonth();
  return yearDiff * 12 + monthDiff;
}

function formatDateBR(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function getTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type InccMode = "none" | "180m" | "12m" | "6m";

interface InccData {
  avg180: number;
  avg12: number;
  avg6: number;
  lastUpdate: string | null;
  totalMonths: number;
  loading: boolean;
  error: string | null;
  isFallback: boolean;
}

interface InstallmentRow { parcela: string; data: string; valor: string; }

interface CalculationResult {
  finalPropertyValue: number;
  downPaymentValue: number;
  downPaymentPercent: number;
  totalMonthsUntilDelivery: number;
  paidMonthlyCount: number;
  remainingMonthlyCount: number;
  paidSemesterCount: number;
  remainingSemesterCount: number;
  monthlyPaidDuringConstruction: number;
  monthlyPaidPercent: number;
  semesterPaidDuringConstruction: number;
  semesterPaidPercent: number;
  remainingMonthlyValue: number;
  remainingSemesterValue: number;
  unicaValue: number;
  unicaPercent: number;
  unicaDate: string;
  habiteseAmount: number;
  habitesePercent: number;
  captationPercent: number;
  sinalRows: InstallmentRow[];
  monthlyRows: InstallmentRow[];
  semesterRows: InstallmentRow[];
  unicaScheduleRows: InstallmentRow[];
  inccMonthlyRate: number;
  inccCorrectionFactor: number;
  inccAccumulatedPercent: number;
  inccMode: string;
  habiteseCorrected: number;
  monthlyRemainingCorrected: number;
  semesterRemainingCorrected: number;
  habiteseBalanceCorrected: number;
  totalMonthlyCommitted: number;
  totalMonthlyCommittedPercent: number;
}

function SimulatorContent() {
  const searchParams = useSearchParams();
  const initialValor = parseFloat(searchParams.get("valor") || "0");
  const initialUnidade = searchParams.get("unidade") || "";
  const initialArea = searchParams.get("area") || "";

  const [propertyValueInput, setPropertyValueInput] = useState(initialValor > 0 ? formatBRL(initialValor) : "");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [unitName, setUnitName] = useState(initialUnidade);
  const [downPaymentInput, setDownPaymentInput] = useState("");
  const [downPaymentDate, setDownPaymentDate] = useState(getTodayISO());
  const [monthlyValueInput, setMonthlyValueInput] = useState("");
  const [semesterValueInput, setSemesterValueInput] = useState("");
  const [unicaValueInput, setUnicaValueInput] = useState("");
  const [activeTab, setActiveTab] = useState<"sinal" | "mensal" | "semestral" | "unica" | "habitese">("sinal");
  const [showResults, setShowResults] = useState(false);
  const track = useTrackEvent();

  // INCC state
  const [inccMode, setInccMode] = useState<InccMode>("none");
  const [inccData, setInccData] = useState<InccData>({
    avg180: 0, avg12: 0, avg6: 0,
    lastUpdate: null, totalMonths: 0,
    loading: true, error: null, isFallback: false,
  });

  const parseVal = (raw: string) => parseCurrencyToNumber(raw);
  const propertyValue = parseVal(propertyValueInput);
  const downPaymentManual = parseVal(downPaymentInput);
  const monthlyVal = parseVal(monthlyValueInput);
  const semesterVal = parseVal(semesterValueInput);
  const unicaManual = parseVal(unicaValueInput);
  const discount = parseFloat(discountPercent) || 0;
  const finalPropertyValue = propertyValue * (1 - discount / 100);
  const downPaymentValue = downPaymentManual > 0 ? downPaymentManual : finalPropertyValue * 0.06;
  const unicaValue = unicaManual > 0 ? unicaManual : finalPropertyValue * 0.05;

  // INCC helper
  const getInccMonthlyRate = (): number => {
    if (inccMode === "180m") return inccData.avg180;
    if (inccMode === "12m") return inccData.avg12;
    if (inccMode === "6m") return inccData.avg6;
    return 0;
  };
  const inccMonthlyRate = inccData.loading ? 0 : getInccMonthlyRate();

  const result: CalculationResult = useMemo(() => {
    const dpDate = new Date(Date.UTC(
      parseInt(downPaymentDate.split("-")[0]),
      parseInt(downPaymentDate.split("-")[1]) - 1,
      parseInt(downPaymentDate.split("-")[2])
    ));
    const deliveryDate = new Date(Date.UTC(DELIVERY_YEAR, DELIVERY_MONTH, 1));
    // Meses até o mês anterior à entrega
    let totalMonthsUntilDelivery = monthsBetween(dpDate, deliveryDate) - 1;
    totalMonthsUntilDelivery = Math.max(0, totalMonthsUntilDelivery);

    // Quantas parcelas cabem durante a obra vs ficam para o financiamento
    const paidMonthlyCount = Math.min(MAX_MONTHLY_INSTALLMENTS, totalMonthsUntilDelivery);
    const remainingMonthlyCount = Math.max(0, MAX_MONTHLY_INSTALLMENTS - paidMonthlyCount);
    const paidSemesterCount = Math.min(MAX_SEMESTER_INSTALLMENTS, Math.floor(totalMonthsUntilDelivery / 6));
    const remainingSemesterCount = Math.max(0, MAX_SEMESTER_INSTALLMENTS - paidSemesterCount);

    // INCC: fator de correção para o período total
    const inccCorrectionFactor = totalMonthsUntilDelivery > 0 && inccMonthlyRate > 0
      ? Math.pow(1 + inccMonthlyRate / 100, totalMonthsUntilDelivery)
      : 1;

    // ── Fase 1: Calcular cronograma nominal (sem INCC) ──
    const sinalRows: InstallmentRow[] = [
      { parcela: "1/1", data: formatDateBR(dpDate), valor: formatBRL(downPaymentValue) },
    ];
    const monthlyRows: InstallmentRow[] = [];
    const semesterRows: InstallmentRow[] = [];
    const unicaScheduleRows: InstallmentRow[] = [];

    // Parcela única: mês de entrega
    const unicaMonth = totalMonthsUntilDelivery + 1;
    const unicaDate = totalMonthsUntilDelivery > 0 ? addMonthsToDate(dpDate, unicaMonth) : dpDate;
    const inccFactorUnica = inccMonthlyRate > 0 && unicaMonth > 0 ? Math.pow(1 + inccMonthlyRate / 100, unicaMonth) : 1;
    if (unicaValue > 0) {
      unicaScheduleRows.push({
        parcela: "1/1",
        data: formatDateBR(unicaDate),
        valor: formatBRL(unicaValue * inccFactorUnica),
      });
    }
    const semesterPaymentMonths = new Set<number>();
    for (let i = 1; i <= paidSemesterCount; i++) semesterPaymentMonths.add(6 * i);

    for (let month = 1; month <= totalMonthsUntilDelivery; month++) {
      // Mensais
      if (month <= paidMonthlyCount) {
        const inccFactorForMonth = inccMonthlyRate > 0 ? Math.pow(1 + inccMonthlyRate / 100, month) : 1;
        monthlyRows.push({
          parcela: `${month}/${MAX_MONTHLY_INSTALLMENTS}`,
          data: formatDateBR(addMonthsToDate(dpDate, month)),
          valor: formatBRL(monthlyVal * inccFactorForMonth),
        });
      }

      // Semestrais
      if (semesterPaymentMonths.has(month)) {
        const semIdx = month / 6;
        const inccFactorForMonth = inccMonthlyRate > 0 ? Math.pow(1 + inccMonthlyRate / 100, month) : 1;
        semesterRows.push({
          parcela: `${semIdx}/${MAX_SEMESTER_INSTALLMENTS}`,
          data: formatDateBR(addMonthsToDate(dpDate, month)),
          valor: formatBRL(semesterVal * inccFactorForMonth),
        });
      }
    }

    // Valores pagos durante a obra (nominais)
    const monthlyPaidDuringConstruction = paidMonthlyCount * monthlyVal;
    const semesterPaidDuringConstruction = paidSemesterCount * semesterVal;
    const remainingMonthlyValue = remainingMonthlyCount * monthlyVal;
    const remainingSemesterValue = remainingSemesterCount * semesterVal;

    const totalMonthlyCommitted = (paidMonthlyCount + remainingMonthlyCount) * monthlyVal;
    const totalCaptation = downPaymentValue + totalMonthlyCommitted + semesterPaidDuringConstruction + unicaValue;
    const captPct = finalPropertyValue > 0 ? (totalCaptation / finalPropertyValue) * 100 : 0;

    // Habite-se = saldo devedor pós-obra
    const habitese = Math.max(0, finalPropertyValue - totalCaptation);

    // ── Fase 2: Aplicar correção INCC aos saldos remanescentes ──
    // Remaining monthly is now captação, not financing. Only semester remaining + residual go to financing.
    const saldoResidual = habitese - remainingSemesterValue;
    // Nota: a parcela única é durante a obra, então NÃO entra no financiamento
    // Nota: parcelas mensais remanescentes compõem a captação, NÃO entram no financiamento
    const monthlyRemainingCorrected = 0;
    const semesterRemainingCorrected = remainingSemesterValue * inccCorrectionFactor;
    const habiteseBalanceCorrected = Math.max(0, saldoResidual) * inccCorrectionFactor;
    const habiteseCorrected = semesterRemainingCorrected + habiteseBalanceCorrected;

    const inccAccumulatedPercent = habitese > 0 ? ((habiteseCorrected - habitese) / habitese) * 100 : 0;

    return {
      finalPropertyValue,
      downPaymentValue,
      downPaymentPercent: finalPropertyValue > 0 ? (downPaymentValue / finalPropertyValue) * 100 : 0,
      totalMonthsUntilDelivery,
      paidMonthlyCount,
      remainingMonthlyCount,
      paidSemesterCount,
      remainingSemesterCount,
      monthlyPaidDuringConstruction,
      monthlyPaidPercent: finalPropertyValue > 0 ? (monthlyPaidDuringConstruction / finalPropertyValue) * 100 : 0,
      totalMonthlyCommitted,
      totalMonthlyCommittedPercent: finalPropertyValue > 0 ? (totalMonthlyCommitted / finalPropertyValue) * 100 : 0,
      semesterPaidDuringConstruction,
      semesterPaidPercent: finalPropertyValue > 0 ? (semesterPaidDuringConstruction / finalPropertyValue) * 100 : 0,
      remainingMonthlyValue,
      remainingSemesterValue,
      habiteseAmount: habitese,
      habitesePercent: finalPropertyValue > 0 ? (habitese / finalPropertyValue) * 100 : 0,
      captationPercent: captPct,
      unicaValue: unicaValue,
      unicaPercent: finalPropertyValue > 0 ? (unicaValue / finalPropertyValue) * 100 : 0,
      unicaDate: formatDateBR(unicaDate),
      sinalRows,
      monthlyRows,
      semesterRows,
      unicaScheduleRows,
      inccMonthlyRate,
      inccCorrectionFactor,
      inccAccumulatedPercent,
      inccMode,
      habiteseCorrected,
      monthlyRemainingCorrected,
      semesterRemainingCorrected,
      habiteseBalanceCorrected,
    };
  }, [propertyValue, discount, downPaymentValue, downPaymentDate, monthlyVal, semesterVal, unicaValue, finalPropertyValue, inccMonthlyRate, inccMode]);

  useEffect(() => { setShowResults(propertyValue > 0); }, [propertyValue]);
  useEffect(() => {
    if (propertyValue > 0) {
      setShowResults(true);
      track({ event_type: "simulador_calculate", resource_type: "empreendimento", metadata: { empreendimento: "vitta", unidade: unitName, valor_imovel: result.finalPropertyValue, captacao_percent: result.captationPercent } });
    }
  }, [result]);

  // Fetch INCC data
  useEffect(() => {
    async function fetchIncc() {
      try {
        const res = await fetch("/api/incc");
        const data = await res.json();
        setInccData({
          avg180: data.avg180 || 0, avg12: data.avg12 || 0,
          avg6: data.avg6 || 0,
          lastUpdate: data.lastUpdate || null, totalMonths: data.totalMonths || 0,
          loading: false, error: null, isFallback: data.fallback || false,
        });
      } catch {
        setInccData(prev => ({ ...prev, loading: false, error: "Erro ao buscar dados INCC" }));
      }
    }
    fetchIncc();
  }, []);

  const handleCurrencyInput = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const { formatted } = formatInputAsCurrency(e.target.value);
    setter(formatted);
  };

  const clearAll = () => {
    setPropertyValueInput(initialValor > 0 ? formatBRL(initialValor) : "");
    setDiscountPercent("0");
    setDownPaymentInput("");
    setMonthlyValueInput("");
    setSemesterValueInput("");
    setUnicaValueInput("");
    setDownPaymentDate(getTodayISO());
    setShowResults(false);
    setInccMode("none");
  };

  const generatePDF = useCallback(async () => {
    track({ event_type: "simulador_export_pdf", resource_type: "empreendimento", metadata: { empreendimento: "vitta", unidade: unitName } });
    const { jsPDF } = await import("jspdf");
    const autoTableModule = await import("jspdf-autotable");
    const autoTable = autoTableModule.default || autoTableModule;
    const doc = new jsPDF("p", "mm", "a4") as any;
    autoTable(doc, { startY: -9999, head: [["", ""]], body: [] });
    const margin = 15;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const primaryColor: [number, number, number] = [26, 58, 95];
    const secondaryColor: [number, number, number] = [212, 175, 55];
    let yPos = 0;

    // Header
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 40, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("Residencial Vitta", margin, 20);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text("Simulação de Fluxo de Pagamento", margin, 30);
    const today = new Date().toLocaleDateString("pt-BR");
    doc.setFontSize(10);
    doc.text(`Gerado em: ${today}`, pageWidth - margin - 30, 30, { align: "right" });
    yPos = 50;

    // Info table
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Informações da Simulação", margin, yPos);
    yPos += 10;
    autoTable(doc, {
      startY: yPos,
      head: [["Descrição", "Informação"]],
      body: [
        ["Unidade", unitName || "Não informado"],
        ["Área", initialArea || "—"],
        ["Valor do Imóvel", formatBRL(propertyValue)],
        ["Valor com Desconto", formatBRL(result.finalPropertyValue)],
        ["Entrega Prevista", "Agosto de 2029"],
        ["Máx. Mensais Contratadas", `${MAX_MONTHLY_INSTALLMENTS} parcelas`],
        ["Máx. Semestrais Contratadas", `${MAX_SEMESTER_INSTALLMENTS} parcelas`],
      ],
      theme: "grid",
      headStyles: { fillColor: primaryColor, textColor: 255 },
      margin: { top: 10, left: margin, right: margin },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 55 }, 1: { cellWidth: "auto" } },
    });
    yPos = doc.lastAutoTable.finalY + 15;

    // Financial Summary
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Resumo Financeiro", margin, yPos);
    yPos += 10;

    const summaryBody: (string | number)[][] = [
      ["Sinal", formatBRL(result.downPaymentValue), `${result.downPaymentPercent.toFixed(2)}%`, "Pagamento à vista"],
      [`Mensais (captação)`, formatBRL(result.totalMonthlyCommitted), `${result.totalMonthlyCommittedPercent.toFixed(2)}%`, `${MAX_MONTHLY_INSTALLMENTS} parcelas (${result.paidMonthlyCount} durante a obra + ${result.remainingMonthlyCount} pós-entrega)`],
      [`Semestrais (obra)`, formatBRL(result.semesterPaidDuringConstruction), `${result.semesterPaidPercent.toFixed(2)}%`, `${result.paidSemesterCount} parcelas durante a obra`],
    ];

    if (result.unicaValue > 0) {
      summaryBody.push(["Única (mês de entrega)", formatBRL(result.unicaValue), `${result.unicaPercent.toFixed(2)}%`, `1 parcela em ${result.unicaDate}`]);
    }


    if (result.remainingSemesterCount > 0) {
      summaryBody.push([`Semestrais (pós financiamento)`, formatBRL(result.remainingSemesterValue), "—", `${result.remainingSemesterCount} parcelas remanescentes`]);
    }

    summaryBody.push(["Financiamento", formatBRL(result.habiteseAmount), `${result.habitesePercent.toFixed(2)}%`, "Saldo devedor pós-obra"]);

    if (inccMode !== "none" && result.inccAccumulatedPercent > 0) {
      summaryBody.push(["Financiamento (estimativa INCC)", formatBRL(result.habiteseCorrected), `${((result.habiteseCorrected / result.finalPropertyValue) * 100).toFixed(2)}%`, "Valor estimado com correção"]);
    }

    summaryBody.push(["Total", formatBRL(result.finalPropertyValue), "100%", ""]);

    autoTable(doc, {
      startY: yPos,
      head: [["Etapa", "Valor", "%", "Observação"]],
      body: summaryBody,
      theme: "striped",
      headStyles: { fillColor: primaryColor, textColor: 255 },
      margin: { top: 10, left: margin, right: margin },
      foot: [["", "Total Geral:", formatBRL(result.finalPropertyValue), ""]],
      footStyles: { fillColor: secondaryColor, textColor: 0, fontStyle: "bold" },
    });
    yPos = doc.lastAutoTable.finalY + 15;

    // Sinal schedule
    if (result.sinalRows.length > 0) {
      if (yPos > 230) { doc.addPage(); yPos = 20; }
      doc.setFontSize(14); doc.setFont("helvetica", "bold");
      doc.text("Cronograma: Sinal", margin, yPos); yPos += 10;
      autoTable(doc, { startY: yPos, head: [["Parcela", "Data", "Valor"]], body: result.sinalRows.map((r) => [r.parcela, r.data, r.valor]), theme: "grid", headStyles: { fillColor: primaryColor, textColor: 255 }, margin: { top: 10, left: margin, right: margin } });
      yPos = doc.lastAutoTable.finalY + 15;
    }

    // Monthly schedule
    if (result.monthlyRows.length > 0) {
      if (yPos > 220) { doc.addPage(); yPos = 20; }
      doc.setFontSize(14); doc.setFont("helvetica", "bold");
      doc.text("Cronograma: Mensais (durante a obra)", margin, yPos); yPos += 10;
      autoTable(doc, { startY: yPos, head: [["Parcela", "Data", "Valor"]], body: result.monthlyRows.map((r) => [r.parcela, r.data, r.valor]), theme: "grid", headStyles: { fillColor: primaryColor, textColor: 255 }, margin: { top: 10, left: margin, right: margin }, pageBreak: "auto" });
      yPos = doc.lastAutoTable.finalY + 15;
    }

    // Única schedule table (rendered after Mensais, before Semestrais)
    if (result.unicaScheduleRows.length > 0) {
      if (yPos > 220) { doc.addPage(); yPos = 20; }
      doc.setFontSize(14); doc.setFont("helvetica", "bold");
      doc.text("Cronograma: Parcela Única", margin, yPos); yPos += 10;
      autoTable(doc, { startY: yPos, head: [["Parcela", "Data", "Valor"]], body: result.unicaScheduleRows.map((r) => [r.parcela, r.data, r.valor]), theme: "grid", headStyles: { fillColor: primaryColor, textColor: 255 }, margin: { top: 10, left: margin, right: margin } });
      yPos = doc.lastAutoTable.finalY + 15;
    }

    // Semester schedule
    if (result.semesterRows.length > 0) {
      if (yPos > 220) { doc.addPage(); yPos = 20; }
      doc.setFontSize(14); doc.setFont("helvetica", "bold");
      doc.text("Cronograma: Semestrais (durante a obra)", margin, yPos); yPos += 10;
      autoTable(doc, { startY: yPos, head: [["Parcela", "Data", "Valor"]], body: result.semesterRows.map((r) => [r.parcela, r.data, r.valor]), theme: "grid", headStyles: { fillColor: primaryColor, textColor: 255 }, margin: { top: 10, left: margin, right: margin } });
      yPos = doc.lastAutoTable.finalY + 15;
    }

    // Habite-se details
    if (yPos > 200) { doc.addPage(); yPos = 20; }
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text("Detalhes do Financiamento", margin, yPos); yPos += 10;

    const habiteBody: (string | number)[][] = [
      ["Saldo Devedor Total (Financiamento)", formatBRL(result.habiteseAmount)],
    ];
    if (result.remainingSemesterCount > 0) {
      habiteBody.push([`  Parcelas semestrais remanescentes (${result.remainingSemesterCount}x)`, formatBRL(result.remainingSemesterValue)]);
    }
    const saldoResidual = result.habiteseAmount - result.remainingSemesterValue;
    if (saldoResidual > 0) {
      habiteBody.push(["  Saldo residual", formatBRL(saldoResidual)]);
    }

    autoTable(doc, {
      startY: yPos,
      head: [["Descrição", "Valor"]],
      body: habiteBody,
      theme: "striped",
      headStyles: { fillColor: secondaryColor, textColor: 0 },
      margin: { top: 10, left: margin, right: margin },
    });
    yPos = doc.lastAutoTable.finalY + 15;

    // INCC Correction section
    if (inccMode !== "none" && result.inccAccumulatedPercent > 0) {
      if (yPos > 180) { doc.addPage(); yPos = 20; }
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Estimativa de Correção INCC", margin, yPos);
      yPos += 10;
      const inccMetricLabel = inccMode === "180m"
        ? "Média dos últimos 180 meses do INCC"
        : inccMode === "12m"
          ? "Média dos últimos 12 meses do INCC"
          : inccMode === "6m"
            ? "Média dos últimos 6 meses do INCC"
            : "N/A";
      const inccSourceLabel = inccData.isFallback
        ? "Dados de referência (valores estimados)"
        : "FGV IBRE";
      autoTable(doc, {
        startY: yPos,
        head: [["Descrição", "Valor"]],
        body: [
          ["Taxa Mensal Utilizada", `${inccMonthlyRate.toFixed(3)}% ao mês`],
          ["Métrica Utilizada", inccMetricLabel],
          ["Fonte dos Dados", inccSourceLabel],
          ["Período de Correção", `${result.totalMonthsUntilDelivery} meses`],
          ["Correção Acumulada", `${result.inccAccumulatedPercent.toFixed(2)}%`],
          ["Financiamento Original", formatBRL(result.habiteseAmount)],
          ["Financiamento Projetado", formatBRL(result.habiteseCorrected)],
          ["Impacto Estimado", formatBRL(result.habiteseCorrected - result.habiteseAmount)],
        ],
        theme: "grid",
        headStyles: { fillColor: [180, 83, 9], textColor: 255 },
        margin: { top: 10, left: margin, right: margin },
      });
      yPos = doc.lastAutoTable.finalY + 8;
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(120, 80, 0);
      const disclaimerLines = doc.splitTextToSize(
        "AVISO: Os valores de correção INCC apresentados acima são estimativas baseadas em médias históricas e não garantem o resultado final. O INCC é um índice variável cujos valores futuros não podem ser previstos com certeza. A taxa utilizada é baseada em dados históricos e poderá divergir significativamente do índice efetivamente apurado durante o período de obras. Consulte o contrato para as condições definitivas de reajuste.",
        pageWidth - margin * 2
      );
      doc.text(disclaimerLines, margin, yPos);
      yPos += disclaimerLines.length * 3.5 + 10;
    }

    // Notes
    if (yPos > 210) { doc.addPage(); yPos = 20; }
    doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0);
    doc.text("Observações Importantes", margin, yPos); yPos += 8;
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
    const notes = [
      "O sinal é pago à vista.",
      "As parcelas mensais começam no mês seguinte ao sinal.",
      "A parcela única é paga no mês de entrega do empreendimento.",
      "A primeira parcela semestral é 6 meses após o sinal.",
      `A construtora permite dividir as mensais em até ${MAX_MONTHLY_INSTALLMENTS} meses e as semestrais em até ${MAX_SEMESTER_INSTALLMENTS} semestrais.`,
      "Todas as parcelas mensais contratadas compõem a captação da obra, inclusive as remanescentes que são pagas após a entrega. O cliente pode pagá-las diretamente à construtora ou integrá-las ao financiamento bancário.",
      "As parcelas semestrais que não couberem até o mês de entrega são integradas ao saldo devedor pós financiamento.",
      "O saldo devedor no financiamento pode ser quitado ou financiado com o banco de preferência.",
      "Importante: Os saldos devedores de todas as parcelas serão corrigidos mensalmente pelo INCC (Índice Nacional de Custo da Construção) até o financiamento.",
      `Captação mínima: A captação durante as obras deve ser de no mínimo ${MIN_CAPTATION_PCT}% do valor do imóvel.`,
      "Os valores, condições e disponibilidade apresentados podem sofrer alteração sem aviso prévio.",
    ];
    notes.forEach((note) => {
      const lines = doc.splitTextToSize(note, pageWidth - margin * 2);
      doc.text(lines, margin, yPos);
      yPos += lines.length * 4 + 4;
    });

    // Footer
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8); doc.setTextColor(150);
      doc.text(`Página ${i} de ${totalPages} - Residencial Vitta`, pageWidth / 2, pageHeight - 10, { align: "center" });
    }

    const fileName = `Simulação_Vitta_${(unitName || "unidade").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;
    try {
      const blob = doc.output("blob");
      // IE/Edge legacy API is not part of lib.dom; keep behavior with an explicit capability check
      const legacyNav = navigator as Navigator & { msSaveOrOpenBlob?: (blob: Blob, fileName: string) => boolean };
      if (typeof legacyNav.msSaveOrOpenBlob === "function") {
        legacyNav.msSaveOrOpenBlob(blob, fileName);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          URL.revokeObjectURL(url);
          document.body.removeChild(a);
        }, 1000);
      }
    } catch {
      doc.save(fileName);
    }
  }, [result, unitName, initialArea, propertyValue, inccMode, inccMonthlyRate]);

  const resultRows = useMemo(() => [
    { description: "Sinal", value: formatBRL(result.downPaymentValue), percent: result.downPaymentPercent, note: "Pagamento à vista", bold: false, isHighlight: false, isIncc: false },
    { description: "Parcelas Mensais", value: formatBRL(result.totalMonthlyCommitted), percent: result.totalMonthlyCommittedPercent, note: `${MAX_MONTHLY_INSTALLMENTS} parcelas (${result.paidMonthlyCount} durante a obra + ${result.remainingMonthlyCount} pós-entrega)`, bold: false, isHighlight: false, isIncc: false },
    { description: "Parcelas Semestrais", value: formatBRL(result.semesterPaidDuringConstruction), percent: result.semesterPaidPercent, note: `${result.paidSemesterCount}x de ${MAX_SEMESTER_INSTALLMENTS} durante a obra`, bold: false, isHighlight: false, isIncc: false },
    { description: "Parcela Única", value: formatBRL(result.unicaValue), percent: result.unicaPercent, note: "Paga na entrega", bold: false, isHighlight: false, isIncc: false },
    { description: "Financiamento", value: formatBRL(result.habiteseAmount), percent: result.habitesePercent, note: "Saldo devedor restante", bold: false, isHighlight: false, isIncc: false },
    ...(inccMode !== "none" && result.inccAccumulatedPercent > 0 ? [{
      description: "Financiamento (estimativa INCC)*", value: formatBRL(result.habiteseCorrected), percent: result.habitesePercent > 0 ? (result.habiteseCorrected / result.finalPropertyValue) * 100 : 0, note: `INCC +${result.inccAccumulatedPercent.toFixed(2)}% (${inccMonthlyRate.toFixed(4)}% a.m.)`, bold: false, isHighlight: false, isIncc: true,
    }] : []),
    { description: "Valor Total", value: formatBRL(result.finalPropertyValue), percent: 100, note: "", bold: true, isHighlight: true, isIncc: false },
  ], [result, inccMode, inccMonthlyRate]);


  // ─── Render ───
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-lg border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img src="/imobsync-icon-claro-36.png" alt="ImobSync" className="h-10 w-auto rounded-xl" />
              <div>
                <h1 className="text-lg font-bold text-slate-900 tracking-tight">ImobSync</h1>
                <p className="text-xs text-slate-500 font-medium hidden sm:block">Simulador Residencial Vitta</p>
              </div>
            </div>
            <Link href="/vitta" className="text-sm text-slate-600 hover:text-slate-900 transition-colors font-medium flex items-center gap-2">
              <span className="hidden sm:inline">&larr; Voltar ao Residencial Vitta</span>
              <span className="sm:hidden">Voltar</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
        {/* Title */}
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">Simulador de Fluxo de Pagamento</h2>
          <p className="text-slate-500 mt-2 max-w-xl mx-auto">Preencha os dados abaixo e simule o plano de pagamento personalizado para o seu imóvel.</p>
        </div>

        {/* Grid: 5 columns on lg */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
          {/* Left Column */}
          <div className="space-y-6 lg:col-span-3">
            {/* Auto-calc indicator */}
            <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm font-medium">
              <RotateCcw className="w-4 h-4 animate-spin" style={{animationDuration: '3s'}} />
              <span>Cálculo automático em tempo real</span>
            </div>

            {/* Card 1: Detalhes do Imóvel */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50">
                <Home className="w-5 h-5 text-slate-700" />
                <h3 className="font-bold text-slate-800">Detalhes do Imóvel</h3>
              </div>
              <div className="p-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Valor do Imóvel (R$)</label>
                    <input type="text" inputMode="numeric" value={propertyValueInput} onChange={handleCurrencyInput(setPropertyValueInput)} placeholder="Ex: R$ 400.000,00" className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all placeholder:text-slate-400 text-right" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Percentual de Desconto (%)</label>
                    <input type="number" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} min="0" max="100" step="0.01" placeholder="Ex: 5" className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all placeholder:text-slate-400" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Unidade Escolhida</label>
                  <input type="text" value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder="Ex: A-101" className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all placeholder:text-slate-400" />
                </div>
              </div>
            </div>

            {/* Card 2: Pagamento Inicial (Sinal) */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50">
                <Wallet className="w-5 h-5 text-slate-700" />
                <h3 className="font-bold text-slate-800">Pagamento Inicial (Sinal)</h3>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Valor do Sinal (R$)</label>
                  <input type="text" inputMode="numeric" value={downPaymentInput} onChange={handleCurrencyInput(setDownPaymentInput)} placeholder="Deixe em branco para 6% do valor final" className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all placeholder:text-slate-400 text-right" />
                  <p className="text-xs text-slate-500 mt-1">Padrão: 6% do valor final do imóvel. Pagamento à vista.</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Data do Pagamento do Sinal</label>
                  <input type="date" value={downPaymentDate} min={getTodayISO()} onChange={(e) => setDownPaymentDate(e.target.value)} className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all placeholder:text-slate-400" />
                  <p className="text-xs text-slate-500 mt-1">Por padrão, utiliza a data atual. Não é permitido selecionar datas anteriores.</p>
                </div>
              </div>
            </div>

            {/* Card 3: Parcelas Durante a Obra */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50">
                <CalendarClock className="w-5 h-5 text-slate-700" />
                <h3 className="font-bold text-slate-800">Parcelas Durante a Obra</h3>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Valor de Cada Parcela Mensal (R$)</label>
                  <input type="text" inputMode="numeric" value={monthlyValueInput} onChange={handleCurrencyInput(setMonthlyValueInput)} placeholder="Ex: R$ 1.000,00" className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all placeholder:text-slate-400 text-right" />
                  {monthlyVal > 0 && (
                    <div className="mt-2 space-y-1">
                      <div className="mt-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-sm text-slate-600">
                        <span className="font-medium">Total mensal: {formatBRL(monthlyVal * MAX_MONTHLY_INSTALLMENTS)} ({MAX_MONTHLY_INSTALLMENTS}x)</span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {result.paidMonthlyCount} parcelas durante a obra + {result.remainingMonthlyCount} pós-entrega (captação)
                      </p>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Valor de Cada Parcela Semestral (R$)</label>
                  <input type="text" inputMode="numeric" value={semesterValueInput} onChange={handleCurrencyInput(setSemesterValueInput)} placeholder="Ex: R$ 8.000,00" className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all placeholder:text-slate-400 text-right" />
                  {semesterVal > 0 && (
                    <div className="mt-2 space-y-1">
                      <div className="mt-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-sm text-slate-600">
                        <span className="font-medium">Total semestral: {formatBRL(semesterVal * MAX_SEMESTER_INSTALLMENTS)} ({MAX_SEMESTER_INSTALLMENTS}x)</span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {result.paidSemesterCount} parcelas durante a obra + {result.remainingSemesterCount} para o financiamento
                      </p>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Valor da Parcela Úanica (R$)</label>
                  <input type="text" inputMode="numeric" value={unicaValueInput} onChange={handleCurrencyInput(setUnicaValueInput)} placeholder="Deixe em branco para 5% do valor final" className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all placeholder:text-slate-400 text-right" />
                  <p className="text-xs text-slate-500 mt-1">Padrão: 5% do valor final do imóvel. Paga no mês de entrega. Compõe a captação da obra.</p>
                </div>
              </div>
            </div>

            {/* Card 4: Ajustes Finais e INCC */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50">
                <Settings className="w-5 h-5 text-slate-700" />
                <h3 className="font-bold text-slate-800">Ajustes Finais e INCC</h3>
              </div>
              <div className="p-6 space-y-5">
                {/* INCC Correction */}
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setInccMode(inccMode === "none" ? "12m" : "none")}
                    className="flex items-center justify-between w-full p-4 rounded-xl border-2 border-slate-100 hover:border-amber-300 transition-all bg-slate-50"
                  >
                    <div className="flex items-center gap-3">
                      <TrendingUp className="w-5 h-5 text-amber-600" />
                      <span className="font-bold text-slate-700">Correção INCC</span>
                    </div>
                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${inccMode !== "none" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-500"}`}>
                      {inccMode !== "none" ? "Ativada" : "Desativada"}
                    </span>
                  </button>

                  {inccMode !== "none" && (
                    <div className="mt-4 pl-2 space-y-3 border-l-2 border-slate-100 ml-4">
                      <label className="flex items-center gap-3 p-2 cursor-pointer hover:bg-slate-50 rounded-lg">
                        <input type="radio" name="incc" value="none" checked={(inccMode as InccMode) === "none"} onChange={() => setInccMode("none")} className="w-4 h-4 text-amber-600 focus:ring-amber-500" />
                        <span className="text-sm text-slate-600">Sem correção</span>
                      </label>
                      <label className="flex items-center gap-3 p-2 cursor-pointer hover:bg-slate-50 rounded-lg">
                        <input type="radio" name="incc" value="180m" checked={inccMode === "180m"} onChange={() => setInccMode("180m")} className="w-4 h-4 text-amber-600 focus:ring-amber-500" />
                        <span className="text-sm text-slate-600">Média últimos 180 meses{!inccData.loading ? ` (${inccData.avg180.toFixed(4)}% a.m.)` : " (carregando...)"}</span>
                      </label>
                      <label className="flex items-center gap-3 p-2 cursor-pointer hover:bg-slate-50 rounded-lg">
                        <input type="radio" name="incc" value="12m" checked={inccMode === "12m"} onChange={() => setInccMode("12m")} className="w-4 h-4 text-amber-600 focus:ring-amber-500" />
                        <span className="text-sm text-slate-600">Média últimos 12 meses{!inccData.loading ? ` (${inccData.avg12.toFixed(4)}% a.m.)` : " (carregando...)"}</span>
                      </label>
                      <label className="flex items-center gap-3 p-2 cursor-pointer hover:bg-slate-50 rounded-lg">
                        <input type="radio" name="incc" value="6m" checked={inccMode === "6m"} onChange={() => setInccMode("6m")} className="w-4 h-4 text-amber-600 focus:ring-amber-500" />
                        <span className="text-sm text-slate-600">Média últimos 6 meses{!inccData.loading ? ` (${inccData.avg6.toFixed(4)}% a.m.)` : " (carregando...)"}</span>
                      </label>
                      {inccData.lastUpdate && (
                        <p className="text-xs text-slate-400 pl-8">Atualizado em {inccData.lastUpdate} — {inccData.isFallback ? "Referência" : "FGV IBRE"}</p>
                      )}
                    </div>
                  )}
                </div>

                <button onClick={clearAll} className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-all">
                  <Trash2 className="w-4 h-4" /> Limpar Campos
                </button>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6 lg:col-span-2 lg:sticky lg:top-24 self-start">
            {/* Summary Card */}
            <div className="bg-gradient-to-br from-[#0D1B2A] to-[#0D1B2A] rounded-2xl shadow-lg p-6 text-white">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-white/90 text-sm uppercase tracking-wider">Resumo do Financiamento</h4>
                <span className="text-xs bg-white/10 px-2 py-1 rounded-full">Entrega: Ago/{DELIVERY_YEAR}</span>
              </div>
              <div className="space-y-4">
                <div><p className="text-white/60 text-xs mb-1">Valor do Imóvel</p><p className="text-lg font-bold">{formatBRL(propertyValue)}</p></div>
                <div className="pt-4 border-t border-white/10"><p className="text-white/60 text-xs mb-1">Valor com Desconto</p><p className="text-2xl font-extrabold tracking-tight">{formatBRL(result.finalPropertyValue)}</p></div>
              </div>
              <div className="mt-6">
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-white/80 font-medium">Captação durante obras</span>
                  <span className="text-white font-bold">{result.captationPercent.toFixed(2)}%</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-white/10 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${result.captationPercent >= MIN_CAPTATION_PCT ? "bg-emerald-400" : result.captationPercent >= MIN_CAPTATION_PCT - 5 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${Math.min(result.captationPercent, 100)}%` }} />
                </div>
              </div>

              {inccMode !== "none" && result.inccAccumulatedPercent > 0 && (
                <div className="mt-4 p-3 rounded-xl bg-amber-500/15 border border-amber-500/25">
                  <p className="text-amber-200 text-xs font-semibold uppercase tracking-wider mb-1">Correção INCC</p>
                  <p className="text-white text-sm font-medium">
                    Financiamento projetado: <span className="font-bold text-amber-200">{formatBRL(result.habiteseCorrected)}</span>
                  </p>
                  <p className="text-amber-200/70 text-xs mt-0.5">
                    +{formatBRL(result.habiteseCorrected - result.habiteseAmount)} ({result.inccAccumulatedPercent.toFixed(2)}% acumulado)
                  </p>
                </div>
              )}
            </div>

            {/* Results Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50">
                <Calculator className="w-5 h-5 text-slate-700" />
                <h3 className="font-bold text-slate-800">Fluxo de Pagamento</h3>
              </div>
              <div className="p-4 sm:p-6">
                {/* Mobile card layout */}
                <div className="sm:hidden space-y-3">
                  {resultRows.map((row, i) => (
                    <div key={i} className={`rounded-xl p-4 border ${row.bold ? "bg-emerald-50 border-emerald-200" : row.isIncc ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-100"}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`font-medium text-sm ${row.bold ? "text-emerald-900" : row.isIncc ? "text-amber-900" : "text-slate-700"}`}>{row.description}</span>
                        {row.percent != null && <span className={`text-xs px-2 py-0.5 rounded-full ${row.bold ? "bg-emerald-200 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>{row.percent.toFixed(2)}%</span>}
                      </div>
                      <span className={`text-lg font-bold block ${row.bold ? "text-emerald-900" : row.isIncc ? "text-amber-900" : "text-slate-900"}`}>{row.value}</span>
                      {row.note && <span className={`text-xs block mt-1 ${row.isIncc ? "text-amber-600" : "text-slate-400"}`}>{row.note}</span>}
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden sm:block overflow-hidden rounded-xl border border-slate-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600">
                        <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wider">Etapa</th>
                        <th className="text-right py-3 px-4 font-semibold text-xs uppercase tracking-wider">Valor</th>
                        <th className="text-right py-3 px-4 font-semibold text-xs uppercase tracking-wider">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultRows.map((row, i) => (
                        <tr key={i} className={row.bold ? "bg-emerald-50 border-t border-emerald-200" : row.isIncc ? "border-t border-amber-200 bg-amber-50" : "border-t border-slate-100"}>
                          <td className={`py-3 px-4 ${row.bold ? "font-bold text-emerald-900" : row.isIncc ? "font-medium text-amber-900" : "font-medium text-slate-700"}`}>
                            {row.description}
                            {row.note && <span className={`block text-xs font-normal mt-0.5 ${row.isIncc ? "text-amber-600" : "text-slate-400"}`}>{row.note}</span>}
                          </td>
                          <td className={`py-3 px-4 text-right ${row.bold ? "font-bold text-emerald-900" : row.isIncc ? "font-bold text-amber-900" : "font-semibold text-slate-900"}`}>{row.value}</td>
                          <td className={`py-3 px-4 text-right ${row.bold ? "font-bold text-emerald-700" : "text-slate-500"}`}>{row.percent != null ? `${row.percent.toFixed(2)}%` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Schedule Tabs */}
                {showResults && (
                  <div className="mt-6">
                    <div className="flex flex-wrap gap-2 mb-4 bg-slate-100 p-1.5 rounded-xl">
                      {([
                        { key: "sinal", label: "Sinal" },
                        { key: "mensal", label: `Mensais (${result.monthlyRows.length})` },
                        { key: "semestral", label: `Semestrais (${result.semesterRows.length})` },
                        { key: "unica", label: `Úanica${result.unicaScheduleRows.length > 0 ? ` (${result.unicaScheduleRows.length})` : ""}` },
                        { key: "habitese", label: "Financ." },
                      ] as const).map((tab) => (
                        <button key={tab.key} onClick={() => setActiveTab(tab.key as typeof activeTab)} className={`flex-1 min-w-[80px] px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all ${activeTab === tab.key ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {activeTab === "sinal" && (
                      <div className="border border-slate-100 rounded-xl overflow-hidden">
                        <div className="max-h-[400px] overflow-y-auto">
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-slate-50"><tr className="border-b border-slate-100"><th className="text-left py-2 px-4 text-xs font-semibold text-slate-500 uppercase">Parc.</th><th className="text-left py-2 px-4 text-xs font-semibold text-slate-500 uppercase">Data</th><th className="text-right py-2 px-4 text-xs font-semibold text-slate-500 uppercase">Valor</th></tr></thead>
                            <tbody>
                              {result.sinalRows.length > 0 ? result.sinalRows.map((row, i) => (<tr key={i} className="border-b border-slate-50 hover:bg-slate-50"><td className="py-2 px-4 font-medium text-slate-700">{row.parcela}</td><td className="py-2 px-4 text-slate-600">{row.data}</td><td className="py-2 px-4 text-right font-bold text-slate-900">{row.valor}</td></tr>)) : (<tr><td colSpan={3} className="py-4 text-center text-slate-400">Nenhum dado</td></tr>)}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {activeTab === "mensal" && (
                      <div className="border border-slate-100 rounded-xl overflow-hidden">
                        <div className="max-h-[400px] overflow-y-auto">
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-slate-50"><tr className="border-b border-slate-100"><th className="text-left py-2 px-4 text-xs font-semibold text-slate-500 uppercase">Parc.</th><th className="text-left py-2 px-4 text-xs font-semibold text-slate-500 uppercase">Data</th><th className="text-right py-2 px-4 text-xs font-semibold text-slate-500 uppercase">Valor</th></tr></thead>
                            <tbody>
                              {result.monthlyRows.length > 0 ? result.monthlyRows.map((row, i) => (<tr key={i} className="border-b border-slate-50 hover:bg-slate-50"><td className="py-2 px-4 font-medium text-slate-700">{row.parcela}</td><td className="py-2 px-4 text-slate-600">{row.data}</td><td className="py-2 px-4 text-right font-bold text-slate-900">{row.valor}</td></tr>)) : (<tr><td colSpan={3} className="py-4 text-center text-slate-400">Nenhuma parcela mensal durante a obra</td></tr>)}
                            </tbody>
                            <tfoot><tr className="bg-slate-50 font-bold border-t border-slate-200"><td className="py-2 px-4" colSpan={2}>Total mensais (obra)</td><td className="py-2 px-4 text-right">{formatBRL(result.monthlyPaidDuringConstruction)}</td></tr></tfoot>
                          </table>
                        </div>
                      </div>
                    )}

                    {activeTab === "semestral" && (
                      <div className="border border-slate-100 rounded-xl overflow-hidden">
                        <div className="max-h-[400px] overflow-y-auto">
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-slate-50"><tr className="border-b border-slate-100"><th className="text-left py-2 px-4 text-xs font-semibold text-slate-500 uppercase">Parc.</th><th className="text-left py-2 px-4 text-xs font-semibold text-slate-500 uppercase">Data</th><th className="text-right py-2 px-4 text-xs font-semibold text-slate-500 uppercase">Valor</th></tr></thead>
                            <tbody>
                              {result.semesterRows.length > 0 ? result.semesterRows.map((row, i) => (<tr key={i} className="border-b border-slate-50 hover:bg-slate-50"><td className="py-2 px-4 font-medium text-slate-700">{row.parcela}</td><td className="py-2 px-4 text-slate-600">{row.data}</td><td className="py-2 px-4 text-right font-bold text-slate-900">{row.valor}</td></tr>)) : (<tr><td colSpan={3} className="py-4 text-center text-slate-400">Nenhuma parcela semestral durante a obra</td></tr>)}
                            </tbody>
                            <tfoot><tr className="bg-slate-50 font-bold border-t border-slate-200"><td className="py-2 px-4" colSpan={2}>Total semestrais (obra)</td><td className="py-2 px-4 text-right">{formatBRL(result.semesterPaidDuringConstruction)}</td></tr></tfoot>
                          </table>
                        </div>
                      </div>
                    )}

                    {activeTab === "unica" && (
                      <div className="space-y-3">
                        <div className="border border-slate-100 rounded-xl overflow-hidden">
                          <div className="max-h-[400px] overflow-y-auto">
                            <table className="w-full text-sm">
                              <thead className="sticky top-0 bg-slate-50"><tr className="border-b border-slate-100"><th className="text-left py-2 px-4 text-xs font-semibold text-slate-500 uppercase">Parc.</th><th className="text-left py-2 px-4 text-xs font-semibold text-slate-500 uppercase">Data</th><th className="text-right py-2 px-4 text-xs font-semibold text-slate-500 uppercase">Valor</th></tr></thead>
                              <tbody>
                                {result.unicaScheduleRows.length > 0 ? result.unicaScheduleRows.map((row, i) => (<tr key={i} className="border-b border-slate-50 hover:bg-slate-50"><td className="py-2 px-4 font-medium text-slate-700">{row.parcela}</td><td className="py-2 px-4 text-slate-600">{row.data}</td><td className="py-2 px-4 text-right font-bold text-slate-900">{row.valor}</td></tr>)) : (<tr><td colSpan={3} className="py-4 text-center text-slate-400">Nenhuma parcela única informada</td></tr>)}
                              </tbody>
                              <tfoot><tr className="bg-slate-50 font-bold border-t border-slate-200"><td className="py-2 px-4" colSpan={2}>Total parcela única</td><td className="py-2 px-4 text-right">{formatBRL(result.unicaValue)}</td></tr></tfoot>
                            </table>
                          </div>
                        </div>
                        <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-500">
                          <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-slate-400" />
                          <span>Paga no mês de entrega do empreendimento. Este valor compõe o percentual de captação durante as obras.</span>
                        </div>
                      </div>
                    )}

                    {activeTab === "habitese" && (
                      <div className="space-y-4">
                        <div className="p-4 rounded-xl bg-white border border-slate-200">
                          <h4 className="font-bold text-slate-900 mb-3">Composição do Financiamento</h4>
                          <div className="space-y-3">
                            <div className="flex justify-between text-sm"><span className="text-slate-600">Saldo devedor total</span><span className="font-semibold">{formatBRL(result.habiteseAmount)}</span></div>
                            {result.remainingSemesterCount > 0 && (
                              <div className="flex justify-between text-sm pl-4 border-l-2 border-amber-300"><span className="text-slate-500">{result.remainingSemesterCount}x semestrais remanescentes</span><span className="font-medium text-amber-700">{formatBRL(result.remainingSemesterValue)}</span></div>
                            )}
                            {(() => { const sr = result.habiteseAmount - result.remainingSemesterValue; return sr > 0 ? (
                              <div className="flex justify-between text-sm pl-4 border-l-2 border-slate-300"><span className="text-slate-500">Saldo residual</span><span className="font-medium">{formatBRL(sr)}</span></div>
                            ) : null; })()}
                          </div>
                        </div>
                        {result.remainingMonthlyCount > 0 && (
                          <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-500">
                            <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-slate-400" />
                            <span>As {result.remainingMonthlyCount} parcelas mensais remanescentes ({formatBRL(result.remainingMonthlyValue)}) compõem a captação da obra. O cliente pode optar por pagá-las diretamente à construtora após a entrega do empreendimento ou integrar esse saldo ao financiamento bancário, conforme sua renda permita.</span>
                          </div>
                        )}
                        {inccMode !== "none" && result.inccAccumulatedPercent > 0 && (
                          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                            <p className="font-bold text-amber-900 text-xl">{formatBRL(result.habiteseCorrected)}</p>
                            <p className="text-sm text-amber-700 mt-1">Estimativa INCC (+{result.inccAccumulatedPercent.toFixed(2)}%)</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* PDF Button */}
                {showResults && (
                  <button onClick={generatePDF} className="mt-6 flex items-center justify-center gap-2 w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-colors shadow-md hover:shadow-lg">
                    <FileDown className="w-5 h-5" /> Gerar PDF da Simulação
                  </button>
                )}
              </div>
            </div>

            {/* Info Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-5 h-5 text-blue-500" />
                <h4 className="font-bold text-slate-800 text-sm">Informações Importantes</h4>
              </div>
              <ul className="space-y-2 text-xs text-slate-500 list-disc list-inside">
                <li>Máx. mensais: <strong>{MAX_MONTHLY_INSTALLMENTS} parcelas</strong> | Máx. semestrais: <strong>{MAX_SEMESTER_INSTALLMENTS} parcelas</strong></li>
                <li>Parcela única padrão: <strong>5%</strong> do valor final (paga na entrega)</li>
                <li>Entrega prevista: <strong>Agosto de 2029</strong></li>
                <li>Saldos devedores corrigidos mensalmente pelo INCC até o financiamento</li>
              </ul>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-sm text-slate-400">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              <span className="font-semibold text-slate-600">ImobSync</span>
            </div>
            <span className="hidden sm:inline">•</span>
            <span>Residencial Vitta</span>
            <span className="hidden sm:inline">•</span>
            <span>&copy; {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function SimuladorVittaPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4 animate-pulse" />
          <p className="text-slate-400 font-medium">Carregando simulador...</p>
        </div>
      </div>
    }>
      <SimulatorContent />
    </Suspense>
  );
}
