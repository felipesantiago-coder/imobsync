"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTrackEvent } from "@/hooks/useTrackEvent";
import {
  Building2,
  Calculator,
  Info,
  AlertTriangle,
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
const DELIVERY_YEAR = 2027;
const DELIVERY_MONTH = 9; // October (0-indexed: Jan=0, Feb=1, ..., Oct=9)
const DECORATION_FEE = 10000.00;
const MIN_CAPTATION_PERCENT = 20;

// ─── Utility Functions ───
function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
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

// ─── Types ───
interface InstallmentRow {
  parcela: string;
  data: string;
  valor: string;
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

interface CalculationResult {
  finalPropertyValue: number;
  downPaymentValue: number;
  downPaymentPercent: number;
  totalMonths: number;
  maxMonthlyInstallments: number;
  maxSemesterInstallments: number;
  monthlyPaid: number;
  monthlyPaidPercent: number;
  semesterPaid: number;
  semesterPaidPercent: number;
  decorationInstallmentValue: number;
  decorationInstallments: number;
  habiteseAmount: number;
  habitesePercent: number;
  captationPercent: number;
  sinalRows: InstallmentRow[];
  monthlyRows: InstallmentRow[];
  semesterRows: InstallmentRow[];
  decorationRows: InstallmentRow[];
  isLowCaptation: boolean;
  inccMonthlyRate: number;
  inccCorrectionFactor: number;
  inccAccumulatedPercent: number;
  inccMode: string;
  habiteseCorrected: number;
}

// ─── Simulator Component ───
function SimulatorContent() {
  const searchParams = useSearchParams();
  const initialValor = parseFloat(searchParams.get("valor") || "0");
  const initialUnidade = searchParams.get("unidade") || "";
  const initialArea = searchParams.get("area") || "";

  // Form state
  const [propertyValueInput, setPropertyValueInput] = useState(initialValor > 0 ? formatBRL(initialValor) : "");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [unitName, setUnitName] = useState(initialUnidade);
  const [downPaymentInput, setDownPaymentInput] = useState("");
  const [downPaymentDate, setDownPaymentDate] = useState(getTodayISO());
  const [monthlyValueInput, setMonthlyValueInput] = useState("");
  const [semesterValueInput, setSemesterValueInput] = useState("");
  const [activeTab, setActiveTab] = useState<"sinal" | "mensal" | "semestral" | "decoracao" | "habitese">("sinal");
  const [showResults, setShowResults] = useState(false);
  const track = useTrackEvent();

  // INCC state
  const [inccMode, setInccMode] = useState<InccMode>("none");
  const [inccData, setInccData] = useState<InccData>({
    avg180: 0,
    avg12: 0,
    avg6: 0,
    lastUpdate: null,
    totalMonths: 0,
    loading: true,
    error: null,
    isFallback: false,
  });

  const parseVal = (raw: string) => parseCurrencyToNumber(raw);

  const propertyValue = parseVal(propertyValueInput);
  const downPaymentManual = parseVal(downPaymentInput);
  const monthlyVal = parseVal(monthlyValueInput);
  const semesterVal = parseVal(semesterValueInput);

  const discount = parseFloat(discountPercent) || 0;
  const finalPropertyValue = propertyValue * (1 - discount / 100);
  const downPaymentValue = downPaymentManual > 0 ? downPaymentManual : finalPropertyValue * 0.1;

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
    let totalMonths = monthsBetween(dpDate, deliveryDate) - 1;
    totalMonths = Math.max(0, totalMonths);

    const maxMonthlyInstallments = totalMonths;
    const maxSemesterInstallments = Math.floor(totalMonths / 6);

    const decorationInstallments = totalMonths;
    const decorationInstallmentValue = decorationInstallments > 0 ? DECORATION_FEE / decorationInstallments : 0;

    // INCC: fator de correção para o período total
    const inccCorrectionFactor = totalMonths > 0 && inccMonthlyRate > 0 ? Math.pow(1 + inccMonthlyRate / 100, totalMonths) : 1;

    // ── Fase 1: Calcular cronograma nominal (sem INCC) ──
    let saldo = finalPropertyValue - downPaymentValue;
    let monthlyPaid = 0;
    let semesterPaid = 0;
    const semesterPaymentMonths = new Set<number>();
    for (let i = 1; i <= maxSemesterInstallments; i++) semesterPaymentMonths.add(6 * i);

    const sinalRows: InstallmentRow[] = [];
    sinalRows.push({ parcela: "1/1", data: formatDateBR(dpDate), valor: formatBRL(downPaymentValue) });

    const monthlyRows: InstallmentRow[] = [];
    const semesterRows: InstallmentRow[] = [];

    for (let month = 1; month <= totalMonths; month++) {
      if (month <= maxMonthlyInstallments) {
        saldo -= monthlyVal;
        monthlyPaid += monthlyVal;
        // Valor corrigido: do mês seguinte ao sinal até o mês de pagamento
        const inccFactorForMonth = inccMonthlyRate > 0 ? Math.pow(1 + inccMonthlyRate / 100, month) : 1;
        monthlyRows.push({ parcela: `${month}/${maxMonthlyInstallments}`, data: formatDateBR(addMonthsToDate(dpDate, month)), valor: formatBRL(monthlyVal * inccFactorForMonth) });
      }

      if (semesterPaymentMonths.has(month)) {
        const semIdx = month / 6;
        saldo -= semesterVal;
        semesterPaid += semesterVal;
        const inccFactorForMonth = inccMonthlyRate > 0 ? Math.pow(1 + inccMonthlyRate / 100, month) : 1;
        semesterRows.push({ parcela: `${semIdx}/${maxSemesterInstallments}`, data: formatDateBR(addMonthsToDate(dpDate, month)), valor: formatBRL(semesterVal * inccFactorForMonth) });
      }
    }

    // Valores nominais (sem INCC)
    const totalCaptation = downPaymentValue + monthlyPaid + semesterPaid;
    const captPct = finalPropertyValue > 0 ? (totalCaptation / finalPropertyValue) * 100 : 0;
    const habitese = Math.max(0, finalPropertyValue - totalCaptation);

    // ── Fase 2: Aplicar correção INCC aos saldos devedores remanescentes ──
    // No Villa Bianco, todas as parcelas mensais e semestrais são pagas durante a obra,
    // então o habite-se é o saldo puro corrigido pelo INCC
    const habiteseCorrected = habitese * inccCorrectionFactor;
    const inccAccumulatedPercent = habitese > 0 ? ((habiteseCorrected - habitese) / habitese) * 100 : 0;

    // Decoração: same schedule as mensais
    const decorationRows: InstallmentRow[] = [];
    for (let i = 1; i <= decorationInstallments; i++) {
      decorationRows.push({
        parcela: `${i}/${decorationInstallments}`,
        data: formatDateBR(addMonthsToDate(dpDate, i)),
        valor: formatBRL(decorationInstallmentValue),
      });
    }

    return {
      finalPropertyValue,
      downPaymentValue,
      downPaymentPercent: finalPropertyValue > 0 ? (downPaymentValue / finalPropertyValue) * 100 : 0,
      totalMonths,
      maxMonthlyInstallments,
      maxSemesterInstallments,
      monthlyPaid,
      monthlyPaidPercent: finalPropertyValue > 0 ? (monthlyPaid / finalPropertyValue) * 100 : 0,
      semesterPaid,
      semesterPaidPercent: finalPropertyValue > 0 ? (semesterPaid / finalPropertyValue) * 100 : 0,
      decorationInstallmentValue,
      decorationInstallments,
      habiteseAmount: habitese,
      habitesePercent: finalPropertyValue > 0 ? (habitese / finalPropertyValue) * 100 : 0,
      captationPercent: captPct,
      sinalRows,
      monthlyRows,
      semesterRows,
      decorationRows,
      isLowCaptation: captPct > 0 && captPct < MIN_CAPTATION_PERCENT,
      inccMonthlyRate,
      inccCorrectionFactor,
      inccAccumulatedPercent,
      inccMode,
      habiteseCorrected,
    };
  }, [propertyValue, discount, downPaymentValue, downPaymentDate, monthlyVal, semesterVal, finalPropertyValue, inccMonthlyRate, inccMode]);

  // Show results when there's meaningful data
  useEffect(() => {
    setShowResults(propertyValue > 0);
  }, [propertyValue]);

  // Auto-calculate
  useEffect(() => {
    if (propertyValue > 0) {
      setShowResults(true);
      track({ event_type: "simulador_calculate", resource_type: "empreendimento", metadata: { empreendimento: "villa-bianco", unidade: unitName, valor_imovel: result.finalPropertyValue, captacao_percent: result.captationPercent } });
    }
  }, [result]);

  // Fetch INCC data
  useEffect(() => {
    async function fetchIncc() {
      try {
        const res = await fetch("/api/incc");
        const data = await res.json();
        setInccData({
          avg180: data.avg180 || 0,
          avg12: data.avg12 || 0,
          avg6: data.avg6 || 0,
          lastUpdate: data.lastUpdate || null,
          totalMonths: data.totalMonths || 0,
          loading: false,
          error: null,
          isFallback: data.fallback || false,
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
    setDownPaymentDate(getTodayISO());
    setShowResults(false);
    setInccMode("none");
  };

  // PDF generation
  const generatePDF = useCallback(async () => {
    track({ event_type: "simulador_export_pdf", resource_type: "empreendimento", metadata: { empreendimento: "villa-bianco", unidade: unitName } });
    const { jsPDF } = await import("jspdf");
    const autoTableModule = await import("jspdf-autotable");
    const autoTable = autoTableModule.default || autoTableModule;

    const doc = new jsPDF("p", "mm", "a4") as any;
    autoTable(doc, {
      startY: -9999,
      head: [["", ""]],
      body: [],
    });
    const margin = 15;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const primaryColor = [26, 58, 95];
    const secondaryColor = [212, 175, 55];
    let yPos = 0;

    // Header
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 40, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("Villa Bianco", margin, 20);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text("Simulação Comercial - Fluxo de Pagamento", margin, 30);
    const today = new Date().toLocaleDateString("pt-BR");
    doc.setFontSize(10);
    doc.text(`Gerado em: ${today}`, pageWidth - margin - 30, 30, { align: "right" });
    yPos = 50;

    // Info
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
        ["Entrega Prevista", "Outubro de 2027"],
      ],
      theme: "grid",
      headStyles: { fillColor: primaryColor, textColor: 255 },
      margin: { top: 10, left: margin, right: margin },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 50 }, 1: { cellWidth: "auto" } },
    });
    yPos = doc.lastAutoTable.finalY + 15;

    // Summary
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Resumo Financeiro", margin, yPos);
    yPos += 10;
    autoTable(doc, {
      startY: yPos,
      head: [["Etapa", "Valor", "%"]],
      body: [
        ["Sinal Ato", formatBRL(result.downPaymentValue), `${result.downPaymentPercent.toFixed(2)}%`],
        ["Mensais (Obra)", formatBRL(result.monthlyPaid), `${result.monthlyPaidPercent.toFixed(2)}%`],
        ["Semestrais (Obra)", formatBRL(result.semesterPaid), `${result.semesterPaidPercent.toFixed(2)}%`],
        ["Financiamento", formatBRL(result.habiteseAmount), `${result.habitesePercent.toFixed(2)}%`],
        ...(inccMode !== "none" && result.inccAccumulatedPercent > 0 ? [
          ["Financiamento (estimativa INCC)", formatBRL(result.habiteseCorrected), `${((result.habiteseCorrected / result.finalPropertyValue) * 100).toFixed(2)}%`],
        ] : []),
        ["Total", formatBRL(result.finalPropertyValue), "100%"],
      ],
      theme: "striped",
      headStyles: { fillColor: primaryColor, textColor: 255 },
      margin: { top: 10, left: margin, right: margin },
      foot: [["", "Total Geral:", formatBRL(result.finalPropertyValue)]],
      footStyles: { fillColor: secondaryColor, textColor: 0, fontStyle: "bold" },
    });
    yPos = doc.lastAutoTable.finalY + 15;

    // Sinal schedule
    if (result.sinalRows.length > 0) {
      if (yPos > 230) { doc.addPage(); yPos = 20; }
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Cronograma: Sinal", margin, yPos);
      yPos += 10;
      autoTable(doc, {
        startY: yPos,
        head: [["Parcela", "Data", "Valor"]],
        body: result.sinalRows.map((r) => [r.parcela, r.data, r.valor]),
        theme: "grid",
        headStyles: { fillColor: primaryColor, textColor: 255 },
        margin: { top: 10, left: margin, right: margin },
      });
      yPos = doc.lastAutoTable.finalY + 15;
    }

    // Monthly schedule
    if (result.monthlyRows.length > 0) {
      if (yPos > 220) { doc.addPage(); yPos = 20; }
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Cronograma: Mensais", margin, yPos);
      yPos += 10;
      autoTable(doc, {
        startY: yPos,
        head: [["Parcela", "Data", "Valor"]],
        body: result.monthlyRows.map((r) => [r.parcela, r.data, r.valor]),
        theme: "grid",
        headStyles: { fillColor: primaryColor, textColor: 255 },
        margin: { top: 10, left: margin, right: margin },
        pageBreak: "auto",
      });
      yPos = doc.lastAutoTable.finalY + 15;
    }

    // Semester schedule
    if (result.semesterRows.length > 0) {
      if (yPos > 220) { doc.addPage(); yPos = 20; }
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Cronograma: Semestrais", margin, yPos);
      yPos += 10;
      autoTable(doc, {
        startY: yPos,
        head: [["Parcela", "Data", "Valor"]],
        body: result.semesterRows.map((r) => [r.parcela, r.data, r.valor]),
        theme: "grid",
        headStyles: { fillColor: primaryColor, textColor: 255 },
        margin: { top: 10, left: margin, right: margin },
      });
      yPos = doc.lastAutoTable.finalY + 15;
    }

    // Decoration schedule
    if (result.decorationRows.length > 0) {
      if (yPos > 220) { doc.addPage(); yPos = 20; }
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Cronograma: Decoração", margin, yPos);
      yPos += 10;
      autoTable(doc, {
        startY: yPos,
        head: [["Parcela", "Data", "Valor"]],
        body: result.decorationRows.map((r) => [r.parcela, r.data, r.valor]),
        theme: "grid",
        headStyles: { fillColor: primaryColor, textColor: 255 },
        margin: { top: 10, left: margin, right: margin },
        pageBreak: "auto",
      });
      yPos = doc.lastAutoTable.finalY + 15;
    }

    // Habite-se
    if (yPos > 200) { doc.addPage(); yPos = 20; }
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Detalhes do Financiamento", margin, yPos);
    yPos += 10;
    autoTable(doc, {
      startY: yPos,
      head: [["Descrição", "Valor"]],
      body: [
        ["Saldo Devedor Final", formatBRL(result.habiteseAmount)],
        ["Total para Quitação", formatBRL(result.habiteseAmount)],
      ],
      theme: "striped",
      headStyles: { fillColor: secondaryColor, textColor: 0 },
      margin: { top: 10, left: margin, right: margin },
    });
    yPos = doc.lastAutoTable.finalY + 15;

    // INCC Correction section
    if (inccMode !== "none" && result.inccAccumulatedPercent > 0) {
      if (yPos > 200) { doc.addPage(); yPos = 20; }
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Estimativa de Correcao INCC", margin, yPos);
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
          ["Período de Correção", `${result.totalMonths} meses`],
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
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Observações Importantes", margin, yPos);
    yPos += 8;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    const notes = [
      "O sinal é pago à vista.",
      "As parcelas mensais começam no mês seguinte ao sinal.",
      "A primeira parcela semestral é 6 meses após o sinal.",
      "O número de parcelas pagas durante as obras é calculado automaticamente com base na data do sinal e na entrega prevista para outubro de 2027.",
      "O saldo devedor no financiamento pode ser quitado ou financiado com o banco de preferência.",
      "Importante: Os saldos devedores de todas as parcelas serão corrigidos mensalmente pelo INCC (Índice Nacional de Custo da Construção) até o financiamento.",
      "Captação mínima: A captação durante as obras deve ser de no mínimo 15% do valor do imóvel.",
      "A Taxa de Decoração de R$ 10.000,00 é dividida em parcelas mensais equivalentes aos meses restantes até a entrega.",
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
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Página ${i} de ${totalPages} - Villa Bianco`, pageWidth / 2, pageHeight - 10, { align: "center" });
    }

    const fileName = `Simulacao_Villa_Bianco_${(unitName || "unidade").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;
    // Mobile-safe download: cria blob e abre em nova aba como fallback
    try {
      const blob = doc.output("blob");
      if (navigator.msSaveOrOpenBlob) {
        navigator.msSaveOrOpenBlob(blob, fileName);
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
    { description: "Sinal Ato", value: formatBRL(result.downPaymentValue), percent: result.downPaymentPercent, note: "Pagamento à vista", bold: false, isHighlight: false, isIncc: false },
    { description: "Parcelas Mensais", value: formatBRL(result.monthlyPaid), percent: result.monthlyPaidPercent, note: `${result.maxMonthlyInstallments} parcelas durante a obra`, bold: false, isHighlight: false, isIncc: false },
    { description: "Parcelas Semestrais", value: formatBRL(result.semesterPaid), percent: result.semesterPaidPercent, note: `${result.maxSemesterInstallments} parcelas durante a obra`, bold: false, isHighlight: false, isIncc: false },
    { description: "Taxa de Decoração", value: formatBRL(DECORATION_FEE), percent: null as number | null, note: "Parcelas mensais até a entrega (não compõe o financiamento)", bold: false, isHighlight: false, isIncc: false },
    { description: "Financiamento", value: formatBRL(result.habiteseAmount), percent: result.habitesePercent, note: "Saldo devedor restante", bold: false, isHighlight: false, isIncc: false },
    ...(inccMode !== "none" && result.inccAccumulatedPercent > 0 ? [{
      description: "Financiamento (estimativa INCC)*", value: formatBRL(result.habiteseCorrected), percent: result.habitesePercent > 0 ? (result.habiteseCorrected / result.finalPropertyValue) * 100 : 0, note: `INCC +${result.inccAccumulatedPercent.toFixed(2)}% (${inccMonthlyRate.toFixed(3)}% a.m.)`, bold: false, isHighlight: false, isIncc: true,
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
                <p className="text-xs text-slate-500 font-medium hidden sm:block">Simulador Villa Bianco</p>
              </div>
            </div>
            <a href="/villa-bianco" className="text-sm text-slate-600 hover:text-slate-900 transition-colors font-medium flex items-center gap-2">
              <span className="hidden sm:inline">← Voltar ao Villa Bianco</span>
              <span className="sm:hidden">Voltar</span>
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
        {/* Title */}
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">Simulador de Fluxo de Pagamento</h2>
          <p className="text-slate-500 mt-2 max-w-xl mx-auto">Preencha os dados abaixo e simule o plano de pagamento personalizado para o seu apartamento.</p>
        </div>

        {/* Grid: 5 columns on lg */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
          {/* ── Left Column ── */}
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
                    <input type="text" inputMode="numeric" value={propertyValueInput} onChange={handleCurrencyInput(setPropertyValueInput)} placeholder="Ex: R$ 500.000,00" className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all placeholder:text-slate-400 text-right" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Percentual de Desconto (%)</label>
                    <input type="number" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} min="0" max="100" step="0.01" placeholder="Ex: 5" className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all placeholder:text-slate-400" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Unidade Escolhida</label>
                  <input type="text" value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder="Ex: Apartamento B 101" className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all placeholder:text-slate-400" />
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
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Valor do Sinal Ato (R$)</label>
                  <input type="text" inputMode="numeric" value={downPaymentInput} onChange={handleCurrencyInput(setDownPaymentInput)} placeholder="Deixe em branco para 10% do valor final" className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all placeholder:text-slate-400 text-right" />
                  <p className="text-xs text-slate-500 mt-1">Padrão: 10% do valor final do imóvel. Pagamento à vista.</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Data do Pagamento do Sinal Ato</label>
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
                  <input type="text" inputMode="numeric" value={monthlyValueInput} onChange={handleCurrencyInput(setMonthlyValueInput)} placeholder="Ex: R$ 1.500,00" className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all placeholder:text-slate-400 text-right" />
                  {monthlyVal > 0 && result.totalMonths > 0 && (
                    <div className="mt-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-sm text-slate-600">
                      <span className="font-medium">Total mensal: {formatBRL(monthlyVal * result.maxMonthlyInstallments)} ({result.maxMonthlyInstallments}x)</span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Valor de Cada Parcela Semestral (R$)</label>
                  <input type="text" inputMode="numeric" value={semesterValueInput} onChange={handleCurrencyInput(setSemesterValueInput)} placeholder="Ex: R$ 10.000,00" className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all placeholder:text-slate-400 text-right" />
                  {semesterVal > 0 && result.maxSemesterInstallments > 0 && (
                    <div className="mt-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-sm text-slate-600">
                      <span className="font-medium">Total semestral: {formatBRL(semesterVal * result.maxSemesterInstallments)} ({result.maxSemesterInstallments}x)</span>
                    </div>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-sm text-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="font-medium text-slate-900">Taxa de Decoração (R$ 10.000,00):</span>
                    <span className="font-semibold text-slate-900">
                      {result.totalMonths > 0
                        ? `${result.totalMonths}x de ${formatBRL(result.decorationInstallmentValue)}`
                        : "A pagar à vista no financiamento"
                      }
                    </span>
                  </div>
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
                        <input type="radio" name="incc" value="none" checked={inccMode === "none"} onChange={() => setInccMode("none")} className="w-4 h-4 text-amber-600 focus:ring-amber-500" />
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

                {result.isLowCaptation && showResults && (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700">
                    <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                    <span className="font-bold text-sm">Captação abaixo de {MIN_CAPTATION_PERCENT}% não é permitida!</span>
                  </div>
                )}

                <button onClick={clearAll} className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-all">
                  <Trash2 className="w-4 h-4" /> Limpar Campos
                </button>
              </div>
            </div>
          </div>

          {/* ── Right Column ── */}
          <div className="space-y-6 lg:col-span-2 lg:sticky lg:top-24 self-start">
            {/* Summary Card */}
            <div className="bg-gradient-to-br from-[#0D1B2A] to-[#0D1B2A] rounded-2xl shadow-lg p-6 text-white">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-white/90 text-sm uppercase tracking-wider">Resumo do Financiamento</h4>
                <span className="text-xs bg-white/10 px-2 py-1 rounded-full">Entrega: Out/{DELIVERY_YEAR}</span>
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
                  <div className={`h-full rounded-full transition-all duration-500 ${result.captationPercent >= MIN_CAPTATION_PERCENT ? "bg-emerald-400" : result.captationPercent >= MIN_CAPTATION_PERCENT - 5 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${Math.min(result.captationPercent, 100)}%` }} />
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
                      {(["sinal", "mensal", "semestral", "decoracao", "habitese"] as const).map((tab) => (
                        <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 min-w-[80px] px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all ${activeTab === tab ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>
                          {tab === "habitese" ? "Financ." : tab === "sinal" ? "Sinal" : tab === "mensal" ? "Mensais" : tab === "semestral" ? "Semest." : "Decoração"}
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
                              {result.monthlyRows.length > 0 ? result.monthlyRows.map((row, i) => (<tr key={i} className="border-b border-slate-50 hover:bg-slate-50"><td className="py-2 px-4 font-medium text-slate-700">{row.parcela}</td><td className="py-2 px-4 text-slate-600">{row.data}</td><td className="py-2 px-4 text-right font-bold text-slate-900">{row.valor}</td></tr>)) : (<tr><td colSpan={3} className="py-4 text-center text-slate-400">Nenhum dado</td></tr>)}
                            </tbody>
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
                              {result.semesterRows.length > 0 ? result.semesterRows.map((row, i) => (<tr key={i} className="border-b border-slate-50 hover:bg-slate-50"><td className="py-2 px-4 font-medium text-slate-700">{row.parcela}</td><td className="py-2 px-4 text-slate-600">{row.data}</td><td className="py-2 px-4 text-right font-bold text-slate-900">{row.valor}</td></tr>)) : (<tr><td colSpan={3} className="py-4 text-center text-slate-400">Nenhum dado</td></tr>)}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {activeTab === "decoracao" && (
                      <div className="border border-slate-100 rounded-xl overflow-hidden">
                        <div className="max-h-[400px] overflow-y-auto">
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-slate-50"><tr className="border-b border-slate-100"><th className="text-left py-2 px-4 text-xs font-semibold text-slate-500 uppercase">Parc.</th><th className="text-left py-2 px-4 text-xs font-semibold text-slate-500 uppercase">Data</th><th className="text-right py-2 px-4 text-xs font-semibold text-slate-500 uppercase">Valor</th></tr></thead>
                            <tbody>
                              {result.decorationRows.length > 0 ? result.decorationRows.map((row, i) => (<tr key={i} className="border-b border-slate-50 hover:bg-slate-50"><td className="py-2 px-4 font-medium text-slate-700">{row.parcela}</td><td className="py-2 px-4 text-slate-600">{row.data}</td><td className="py-2 px-4 text-right font-bold text-slate-900">{row.valor}</td></tr>)) : (<tr><td colSpan={3} className="py-4 text-center text-slate-400">Nenhum dado</td></tr>)}
                            </tbody>
                            {result.decorationRows.length > 0 && (
                              <tfoot>
                                <tr className="border-t-2 border-slate-200 bg-slate-50">
                                  <td className="py-2 px-4 font-bold text-slate-900">Total</td>
                                  <td className="py-2 px-4"></td>
                                  <td className="py-2 px-4 text-right font-bold text-slate-900">{formatBRL(DECORATION_FEE)}</td>
                                </tr>
                              </tfoot>
                            )}
                          </table>
                        </div>
                      </div>
                    )}

                    {activeTab === "habitese" && (
                      <div className="p-4 space-y-4 bg-slate-50">
                        <div className="p-4 rounded-xl bg-white border border-slate-200">
                          <p className="font-bold text-slate-900 text-xl">{formatBRL(result.habiteseAmount)}</p>
                          <p className="text-sm text-slate-500 mt-1">Saldo para financiamento bancário</p>
                        </div>
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
                <li>Captação mínima durante as obras: <strong>15%</strong> do valor do imóvel</li>
                <li>Taxa de Decoração: <strong>R$ 10.000,00</strong> (parcelas mensais até a entrega)</li>
                <li>Entrega prevista: <strong>Outubro de 2027</strong></li>
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
            <span>Simulador Villa Bianco</span>
            <span className="hidden sm:inline">•</span>
            <span>&copy; {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function SimuladorVillaBiancoPage() {
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
