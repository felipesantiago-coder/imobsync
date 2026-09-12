"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  Suspense,
} from "react";
import { useParams, useSearchParams } from "next/navigation";
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
  Landmark,
  Wallet,
  CalendarClock,
  Settings,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  clampJurosPosHabitese,
  formatJurosPosHabitese,
  normalizePosHabiteseIndice,
  posHabiteseFullLabel,
  posHabiteseIndexLabel,
} from "@/lib/pos-habitese";
import {
  clampFinDiretoParcelas,
  priceTotals,
} from "@/lib/financiamento-direto";

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

interface SimuladorConfig {
  id: string;
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
}

interface EmpreendimentoData {
  id: string;
  nome: string;
  slug: string;
}

interface IntermediateInstallment {
  id: string;
  date: string;
  valueInput: string;
}

interface CalculationResult {
  finalPropertyValue: number;
  downPaymentValue: number;
  downPaymentPercent: number;
  monthlyInstallments: number;
  monthlyPaid: number;
  monthlyPaidPercent: number;
  semesterInstallments: number;
  semesterPaid: number;
  semesterPaidPercent: number;
  annualInstallments: number;
  annualPaid: number;
  annualPaidPercent: number;
  intermediariasPaid: number;
  intermediariasPaidPercent: number;
  unicaValue: number;
  unicaPercent: number;
  unicaDate: string;
  unicaDataValue: number;
  unicaDataPercent: number;
  unicaDataDate: string;
  decoracaoPaid: number;
  decoracaoInstallments: number;
  financingAmount: number;
  financingPercent: number;
  captationPercent: number;
  monthlyRemaining: number;
  semesterRemaining: number;
  annualRemaining: number;
  habiteseBalance: number;
  inccMonthlyRate: number;
  inccCorrectionFactor: number;
  inccAccumulatedPercent: number;
  inccMode: string;
  posMode: string;
  posIndexRate: number;
  posJuros: number;
  posTotalRate: number;
  posFactor12: number;
  posBase: number;
  posProjected: number;
  posImpact: number;
  posAccumPct: number;
  posDateLabel: string;
  financingCorrected: number;
  mRemainingCorrected: number;
  sRemainingCorrected: number;
  aRemainingCorrected: number;
  hBalanceCorrected: number;
  finDiretoActive: boolean;
  finDiretoParcelas: number;
  posPmt: number;
  posTotalPago: number;
  posJurosTotal: number;
  posFimLabel: string;
  sinalRows: InstallmentRow[];
  monthlyRows: InstallmentRow[];
  semesterRows: InstallmentRow[];
  annualRows: InstallmentRow[];
  intermediariasRows: InstallmentRow[];
  unicaScheduleRows: InstallmentRow[];
  unicaDataScheduleRows: InstallmentRow[];
  decoracaoRows: InstallmentRow[];
}

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

function formatInputAsCurrency(value: string): {
  formatted: string;
  numeric: number;
} {
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

function formatPctBR(value: number, decimals = 3): string {
  return value.toFixed(decimals).replace(".", ",");
}

function getTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function getDeliveryMonthName(month: number): string {
  return MONTH_NAMES[(month - 1) % 12] || "";
}

type TabKey =
  | "sinal"
  | "mensal"
  | "semestral"
  | "anual"
  | "intermediarias"
  | "unicaData"
  | "unica"
  | "decoracao"
  | "financiamento";

// ─── Simulator Component ───
function SimulatorContent() {
  const params = useParams();
  const id = params.id as string;
  const searchParams = useSearchParams();
  const initialValor = parseFloat(searchParams.get("valor") || "0");
  const initialUnidade = searchParams.get("unidade") || "";
  const initialArea = searchParams.get("area") || "";
  const initialAndar = searchParams.get("andar") || "";

  // Config state
  const [config, setConfig] = useState<SimuladorConfig | null>(null);
  const [empreendimento, setEmpreendimento] = useState<EmpreendimentoData | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  // Form state
  const [propertyValueInput, setPropertyValueInput] = useState(
    initialValor > 0 ? formatBRL(initialValor) : ""
  );
  const [discountPercent, setDiscountPercent] = useState("0");
  const [unitName, setUnitName] = useState(initialUnidade);
  const [downPaymentInput, setDownPaymentInput] = useState("");
  const [downPaymentDate, setDownPaymentDate] = useState(getTodayISO());
  const [downPaymentInstallments, setDownPaymentInstallments] = useState("1");
  const [monthlyValueInput, setMonthlyValueInput] = useState("");
  const [semesterValueInput, setSemesterValueInput] = useState("");
  const [annualValueInput, setAnnualValueInput] = useState("");
  const [unicaValueInput, setUnicaValueInput] = useState("");
  const [unicaDataValueInput, setUnicaDataValueInput] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("sinal");
  const [showResults, setShowResults] = useState(false);
  const track = useTrackEvent();

  // Optional installment expansion state
  const [expandedOptional, setExpandedOptional] = useState<Set<string>>(
    new Set()
  );

  // Intermediárias state
  const [intermediateInstallments, setIntermediateInstallments] = useState<
    IntermediateInstallment[]
  >([]);

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

  // Índice pós-habite-se (IGPM/IPCA conforme escolha do administrador)
  const [posMode, setPosMode] = useState<InccMode>("none");
  // Cenário pós-entrega: bancário (padrão) ou financiamento direto com a construtora
  const [modoFinanciamento, setModoFinanciamento] = useState<
    "bancario" | "direto"
  >("bancario");
  const [posData, setPosData] = useState<InccData>({
    avg180: 0,
    avg12: 0,
    avg6: 0,
    lastUpdate: null,
    totalMonths: 0,
    loading: true,
    error: null,
    isFallback: false,
  });

  // Fetch config
  useEffect(() => {
    async function fetchConfig() {
      try {
        setConfigLoading(true);
        const res = await fetch(`/api/simulador-config/${id}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setConfigError(data.error || `Erro ${res.status}`);
          return;
        }
        const data = await res.json();
        setConfig(data.config);
        setEmpreendimento(data.empreendimento);
      } catch {
        setConfigError("Erro ao carregar configuração");
      } finally {
        setConfigLoading(false);
      }
    }
    fetchConfig();
  }, [id]);

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
        setInccData((prev) => ({
          ...prev,
          loading: false,
          error: "Erro ao buscar dados INCC",
        }));
      }
    }
    fetchIncc();
  }, []);

  // Fetch do índice pós-habite-se (IGPM/IPCA conforme config do empreendimento)
  useEffect(() => {
    if (!config) return;
    const indice = normalizePosHabiteseIndice(config.indice_pos_habitese);
    let cancelled = false;
    async function fetchPosIndex() {
      try {
        const res = await fetch(`/api/incc?indice=${indice}`);
        if (!res.ok) throw new Error(`Erro ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setPosData({
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
        if (cancelled) return;
        setPosData((prev) => ({
          ...prev,
          loading: false,
          error: "Erro ao buscar dados do índice",
        }));
      }
    }
    fetchPosIndex();
    return () => {
      cancelled = true;
    };
  }, [config]);

  const parseVal = (raw: string) => parseCurrencyToNumber(raw);
  const propertyValue = parseVal(propertyValueInput);
  const downPaymentManual = parseVal(downPaymentInput);
  const monthlyVal = parseVal(monthlyValueInput);
  const semesterVal = parseVal(semesterValueInput);
  const annualVal = parseVal(annualValueInput);
  const unicaVal = parseVal(unicaValueInput);
  const unicaDataVal = parseVal(unicaDataValueInput);
  const discount = parseFloat(discountPercent) || 0;
  const finalPropertyValue = propertyValue * (1 - discount / 100);
  const defaultSinalPercent = config?.percentual_sinal || 5;
  const downPaymentValue =
    downPaymentManual > 0
      ? downPaymentManual
      : finalPropertyValue * (defaultSinalPercent / 100);
  // Parcelamento do sinal ato conforme decisão do administrador (simulador_configs).
  // Fallback (config ausente): parcelável até 3 — comportamento histórico.
  const sinalParcelavel = config?.sinal_parcelavel !== false;
  const sinalMaxParcelas = sinalParcelavel
    ? Math.min(12, Math.max(1, Math.round(config?.sinal_max_parcelas || 3)))
    : 1;
  const dpInstallments = Math.max(
    1,
    Math.min(parseInt(downPaymentInstallments) || 1, sinalMaxParcelas)
  );

  // INCC helper
  const getInccMonthlyRate = (): number => {
    if (inccMode === "180m") return inccData.avg180;
    if (inccMode === "12m") return inccData.avg12;
    if (inccMode === "6m") return inccData.avg6;
    return 0;
  };
  const inccMonthlyRate = inccData.loading ? 0 : getInccMonthlyRate();

  // Índice pós-habite-se: média do índice escolhido pelo administrador + juros
  const posJuros = config ? clampJurosPosHabitese(config.juros_pos_habitese) : 1;
  const getPosIndexRate = (): number => {
    if (posMode === "180m") return posData.avg180;
    if (posMode === "12m") return posData.avg12;
    if (posMode === "6m") return posData.avg6;
    return 0;
  };
  const posIndexRate = posData.loading ? 0 : getPosIndexRate();
  const posTotalRate = posIndexRate > 0 ? posIndexRate + posJuros : 0;
  const posIndexLabel = config
    ? posHabiteseIndexLabel(config.indice_pos_habitese)
    : "IGPM";

  // ── Cenário de financiamento ──
  // "direto" só é válido quando o administrador habilitou a opção.
  const finDiretoAvailable = config?.fin_direto_construtora === true;
  const modoDireto = finDiretoAvailable && modoFinanciamento === "direto";
  // Estimativa de correção pós-entrega (média do índice + juros) só existe
  // no cenário de financiamento direto; no padrão o PDF apenas informa.
  const posEstimativaAtiva =
    modoDireto && posMode !== "none" && posTotalRate > 0;
  // Meta de captação exibida no resumo (cenário direto tem meta própria)
  const captacaoTarget = modoDireto
    ? config?.fin_direto_captacao_pct || 40
    : config?.percentual_captacao || 25;

  // Derived config values
  const deliveryMonth = config?.entrega_mes || 11;
  const deliveryYear = config?.entrega_ano || 2027;
  const paymentLimitMonth = deliveryMonth === 1 ? 12 : deliveryMonth - 1;
  const paymentLimitYear = deliveryMonth === 1 ? deliveryYear - 1 : deliveryYear;
  const deliveryLabel = `${getDeliveryMonthName(deliveryMonth)} de ${deliveryYear}`;

  // Max monthly = months between sinal and payment limit
  const dpDate = useMemo(() => {
    const parts = downPaymentDate.split("-");
    return new Date(
      Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
    );
  }, [downPaymentDate]);

  const paymentLimit = useMemo(() => {
    return new Date(
      Date.UTC(paymentLimitYear, paymentLimitMonth - 1, 28)
    );
  }, [paymentLimitYear, paymentLimitMonth]);

  const totalMonths = Math.max(0, monthsBetween(dpDate, paymentLimit));
  const maxSemesterInstallments = Math.floor(totalMonths / 6);
  const maxAnnualInstallments = Math.floor(totalMonths / 12);

  // Intermediate installments total (nominal)
  const intermediariasTotal = useMemo(() => {
    return intermediateInstallments.reduce((sum, item) => {
      return sum + parseVal(item.valueInput);
    }, 0);
  }, [intermediateInstallments]);

  // Decoração
  const decoracaoEnabled = config?.taxa_decoracao === true;
  const decoracaoTotalValue = decoracaoEnabled
    ? (config?.taxa_decoracao_valor || 0)
    : 0;
  const decoracaoNumParcelas = decoracaoEnabled
    ? (config?.taxa_decoracao_parcelas || 1)
    : 0;
  const decoracaoPerParcela =
    decoracaoNumParcelas > 0 ? decoracaoTotalValue / decoracaoNumParcelas : 0;
  const decoracaoStartDate = config?.taxa_decoracao_inicio
    ? new Date(config.taxa_decoracao_inicio + "T00:00:00Z")
    : null;
  const decoracaoEndDate = config?.taxa_decoracao_fim
    ? new Date(config.taxa_decoracao_fim + "T00:00:00Z")
    : null;
  const decoracaoTotalMonths =
    decoracaoStartDate && decoracaoEndDate
      ? Math.max(0, monthsBetween(decoracaoStartDate, decoracaoEndDate))
      : 0;

  // ── Main calculation ──
  const result: CalculationResult = useMemo(() => {
    if (!config) {
      return {
        finalPropertyValue: 0,
        downPaymentValue: 0,
        downPaymentPercent: 0,
        monthlyInstallments: 0,
        monthlyPaid: 0,
        monthlyPaidPercent: 0,
        semesterInstallments: 0,
        semesterPaid: 0,
        semesterPaidPercent: 0,
        annualInstallments: 0,
        annualPaid: 0,
        annualPaidPercent: 0,
        intermediariasPaid: 0,
        intermediariasPaidPercent: 0,
        unicaValue: 0,
        unicaPercent: 0,
        unicaDate: "",
        unicaDataValue: 0,
        unicaDataPercent: 0,
        unicaDataDate: "",
        decoracaoPaid: 0,
        decoracaoInstallments: 0,
        financingAmount: 0,
        financingPercent: 0,
        captationPercent: 0,
        monthlyRemaining: 0,
        semesterRemaining: 0,
        annualRemaining: 0,
        habiteseBalance: 0,
        inccMonthlyRate: 0,
        inccCorrectionFactor: 1,
        inccAccumulatedPercent: 0,
        inccMode,
        posMode,
        posIndexRate: 0,
        posJuros: 0,
        posTotalRate: 0,
        posFactor12: 1,
        posBase: 0,
        posProjected: 0,
        posImpact: 0,
        posAccumPct: 0,
        posDateLabel: "",
        financingCorrected: 0,
        mRemainingCorrected: 0,
        sRemainingCorrected: 0,
        aRemainingCorrected: 0,
        hBalanceCorrected: 0,
        finDiretoActive: false,
        finDiretoParcelas: 0,
        posPmt: 0,
        posTotalPago: 0,
        posJurosTotal: 0,
        posFimLabel: "",
        sinalRows: [],
        monthlyRows: [],
        semesterRows: [],
        annualRows: [],
        intermediariasRows: [],
        unicaScheduleRows: [],
        unicaDataScheduleRows: [],
        decoracaoRows: [],
      };
    }

    const mInstallments = totalMonths;
    const sInstallments = maxSemesterInstallments;
    const aInstallments = maxAnnualInstallments;

    const inccCorrectionFactor =
      totalMonths > 0 && inccMonthlyRate > 0
        ? Math.pow(1 + inccMonthlyRate / 100, totalMonths)
        : 1;

    // ── Sinal rows (no INCC) ──
    const dpPerInstallment = downPaymentValue / dpInstallments;
    const sinalRows: InstallmentRow[] = [];
    for (let i = 1; i <= dpInstallments; i++) {
      sinalRows.push({
        parcela: `${i}/${dpInstallments}`,
        data: formatDateBR(addMonthsToDate(dpDate, i - 1)),
        valor: formatBRL(dpPerInstallment),
      });
    }

    // ── Monthly schedule ──
    const monthlyRows: InstallmentRow[] = [];
    let mPaid = 0;
    for (let month = 1; month <= totalMonths; month++) {
      if (monthlyVal > 0) {
        mPaid += monthlyVal;
        const inccFactor =
          inccMonthlyRate > 0
            ? Math.pow(1 + inccMonthlyRate / 100, month)
            : 1;
        monthlyRows.push({
          parcela: `${month}/${mInstallments}`,
          data: formatDateBR(addMonthsToDate(dpDate, month)),
          valor: formatBRL(monthlyVal * inccFactor),
        });
      }
    }

    // ── Semester schedule ──
    const semesterRows: InstallmentRow[] = [];
    let sPaid = 0;
    if (config.semestrais_habilitado) {
      for (let i = 1; i <= sInstallments; i++) {
        const monthIndex = 6 * i;
        if (monthIndex > totalMonths) break;
        if (semesterVal > 0) {
          sPaid += semesterVal;
          const inccFactor =
            inccMonthlyRate > 0
              ? Math.pow(1 + inccMonthlyRate / 100, monthIndex)
              : 1;
          semesterRows.push({
            parcela: `${i}/${sInstallments}`,
            data: formatDateBR(addMonthsToDate(dpDate, monthIndex)),
            valor: formatBRL(semesterVal * inccFactor),
          });
        }
      }
    }

    // ── Annual schedule ──
    const annualRows: InstallmentRow[] = [];
    let aPaid = 0;
    if (config.anuais_habilitado) {
      for (let i = 1; i <= aInstallments; i++) {
        const monthIndex = 12 * i;
        if (monthIndex > totalMonths) break;
        if (annualVal > 0) {
          aPaid += annualVal;
          const inccFactor =
            inccMonthlyRate > 0
              ? Math.pow(1 + inccMonthlyRate / 100, monthIndex)
              : 1;
          annualRows.push({
            parcela: `${i}/${aInstallments}`,
            data: formatDateBR(addMonthsToDate(dpDate, monthIndex)),
            valor: formatBRL(annualVal * inccFactor),
          });
        }
      }
    }

    // ── Intermediárias schedule ──
    const intermediariasRows: InstallmentRow[] = [];
    let intPaid = 0;
    if (config.intermediarias_habilitado) {
      const sorted = [...intermediateInstallments].sort((a, b) =>
        a.date.localeCompare(b.date)
      );
      sorted.forEach((item, idx) => {
        const val = parseVal(item.valueInput);
        if (val > 0 && item.date) {
          const itemDate = new Date(item.date + "T00:00:00Z");
          const monthsFromSinal = Math.max(0, monthsBetween(dpDate, itemDate));
          const inccFactor =
            inccMonthlyRate > 0
              ? Math.pow(1 + inccMonthlyRate / 100, monthsFromSinal)
              : 1;
          intPaid += val;
          intermediariasRows.push({
            parcela: `${idx + 1}/${sorted.length}`,
            data: formatDateBR(itemDate),
            valor: formatBRL(val * inccFactor),
          });
        }
      });
    }

    // ── Parcela Única Habite-se (mês da entrega) ──
    const unicaMonths = totalMonths + 1;
    const unicaDate =
      unicaMonths > 0 ? addMonthsToDate(dpDate, unicaMonths) : dpDate;
    const unicaScheduleRows: InstallmentRow[] = [];
    if (config.parcela_unica_habilitada && unicaVal > 0) {
      const inccFactorUnica =
        inccMonthlyRate > 0 && unicaMonths > 0
          ? Math.pow(1 + inccMonthlyRate / 100, unicaMonths)
          : 1;
      unicaScheduleRows.push({
        parcela: "1/1",
        data: formatDateBR(unicaDate),
        valor: formatBRL(unicaVal * inccFactorUnica),
      });
    }

    // ── Parcela Única (data definida pelo administrador) ──
    const unicaDataDate = config.parcela_unica_data_habilitada && config.parcela_unica_data
      ? new Date(config.parcela_unica_data + "T00:00:00Z")
      : null;
    const unicaDataScheduleRows: InstallmentRow[] = [];
    if (unicaDataDate && unicaDataVal > 0) {
      const monthsFromSinal = Math.max(0, monthsBetween(dpDate, unicaDataDate));
      const inccFactorUnicaData =
        inccMonthlyRate > 0
          ? Math.pow(1 + inccMonthlyRate / 100, monthsFromSinal)
          : 1;
      unicaDataScheduleRows.push({
        parcela: "1/1",
        data: formatDateBR(unicaDataDate),
        valor: formatBRL(unicaDataVal * inccFactorUnicaData),
      });
    }

    // ── Decoração schedule ──
    const decoracaoRows: InstallmentRow[] = [];
    let dPaid = 0;
    if (decoracaoEnabled && decoracaoPerParcela > 0 && decoracaoStartDate && decoracaoTotalMonths > 0) {
      const monthsPerInstallment = decoracaoTotalMonths / decoracaoNumParcelas;
      for (let i = 0; i < decoracaoNumParcelas; i++) {
        const installmentDate = addMonthsToDate(
          decoracaoStartDate,
          Math.round(i * monthsPerInstallment)
        );
        const monthsFromSinal = Math.max(
          0,
          monthsBetween(dpDate, installmentDate)
        );
        const inccFactor =
          inccMonthlyRate > 0
            ? Math.pow(1 + inccMonthlyRate / 100, monthsFromSinal)
            : 1;
        const correctedVal = decoracaoPerParcela * inccFactor;
        dPaid += decoracaoPerParcela;
        decoracaoRows.push({
          parcela: `${i + 1}/${decoracaoNumParcelas}`,
          data: formatDateBR(installmentDate),
          valor: formatBRL(correctedVal),
        });
      }
    }

    // ── Totals ──
    // Captation = sinal + all obra installments (NOT decoração)
    const totalObraCaptation =
      downPaymentValue + mPaid + sPaid + aPaid + intPaid + unicaVal + unicaDataVal;
    const captPct =
      finalPropertyValue > 0
        ? (totalObraCaptation / finalPropertyValue) * 100
        : 0;
    const financing = Math.max(
      0,
      finalPropertyValue - totalObraCaptation
    );

    // Remaining for INCC correction
    const mRemaining = Math.max(0, monthlyVal * mInstallments - mPaid);
    const sRemaining = Math.max(
      0,
      semesterVal * sInstallments - sPaid
    );
    const aRemaining = Math.max(0, annualVal * aInstallments - aPaid);
    const hBalance = Math.max(
      0,
      financing - mRemaining - sRemaining - aRemaining
    );

    // INCC corrected remaining
    const mRemainingCorrected = mRemaining * inccCorrectionFactor;
    const sRemainingCorrected = sRemaining * inccCorrectionFactor;
    const aRemainingCorrected = aRemaining * inccCorrectionFactor;
    const hBalanceCorrected = hBalance * inccCorrectionFactor;
    const financingCorrected =
      mRemainingCorrected + sRemainingCorrected + aRemainingCorrected + hBalanceCorrected;
    const inccAccumulatedPercent =
      financing > 0
        ? ((financingCorrected - financing) / financing) * 100
        : 0;

    // Estimativa pós-habite-se: saldo no habite-se (corrigido pelo INCC quando
    // a estimativa de obra está ativa) projetado pela média do índice escolhido
    // pelo administrador + juros configurados.
    // - Cenário DIRETO (construtora): parcelamento PRICE em N parcelas fixas.
    // - Cenário PADRÃO (bancário): nenhuma correção é calculada no app
    //   (o PDF apenas informa a existência da correção contratual).
    const posInccActive = inccMode !== "none" && inccAccumulatedPercent > 0;
    const posBase = posInccActive ? hBalanceCorrected : hBalance;
    const finDiretoParcelasConfig = clampFinDiretoParcelas(
      config.fin_direto_parcelas
    );
    const priceEst = posEstimativaAtiva && posBase > 0
      ? priceTotals(posBase, posTotalRate, finDiretoParcelasConfig)
      : { pmt: 0, total: 0, juros: 0 };
    const posFactor12 =
      posTotalRate > 0 ? Math.pow(1 + posTotalRate / 100, 12) : 1;
    const posProjected = posBase * posFactor12;
    const posImpact = posProjected - posBase;
    const posAccumPct = posBase > 0 ? (posImpact / posBase) * 100 : 0;
    const posDate = addMonthsToDate(dpDate, totalMonths + 1 + 12);
    const posFimDate = addMonthsToDate(
      dpDate,
      totalMonths + 1 + finDiretoParcelasConfig
    );

    return {
      finalPropertyValue,
      downPaymentValue,
      downPaymentPercent:
        finalPropertyValue > 0
          ? (downPaymentValue / finalPropertyValue) * 100
          : 0,
      monthlyInstallments: mInstallments,
      monthlyPaid: mPaid,
      monthlyPaidPercent:
        finalPropertyValue > 0 ? (mPaid / finalPropertyValue) * 100 : 0,
      semesterInstallments: sInstallments,
      semesterPaid: sPaid,
      semesterPaidPercent:
        finalPropertyValue > 0 ? (sPaid / finalPropertyValue) * 100 : 0,
      annualInstallments: aInstallments,
      annualPaid: aPaid,
      annualPaidPercent:
        finalPropertyValue > 0 ? (aPaid / finalPropertyValue) * 100 : 0,
      intermediariasPaid: intPaid,
      intermediariasPaidPercent:
        finalPropertyValue > 0 ? (intPaid / finalPropertyValue) * 100 : 0,
      unicaValue: unicaVal,
      unicaPercent:
        finalPropertyValue > 0 ? (unicaVal / finalPropertyValue) * 100 : 0,
      unicaDate: formatDateBR(unicaDate),
      unicaDataValue: unicaDataVal,
      unicaDataPercent:
        finalPropertyValue > 0 ? (unicaDataVal / finalPropertyValue) * 100 : 0,
      unicaDataDate: unicaDataDate ? formatDateBR(unicaDataDate) : "",
      decoracaoPaid: dPaid,
      decoracaoInstallments: decoracaoNumParcelas,
      financingAmount: financing,
      financingPercent:
        finalPropertyValue > 0 ? (financing / finalPropertyValue) * 100 : 0,
      captationPercent: captPct,
      monthlyRemaining: mRemaining,
      semesterRemaining: sRemaining,
      annualRemaining: aRemaining,
      habiteseBalance: hBalance,
      inccMonthlyRate,
      inccCorrectionFactor,
      inccAccumulatedPercent,
      inccMode,
      posMode,
      posIndexRate,
      posJuros,
      posTotalRate,
      posFactor12,
      posBase,
      posProjected,
      posImpact,
      posAccumPct,
      posDateLabel: formatDateBR(posDate),
      financingCorrected,
      mRemainingCorrected,
      sRemainingCorrected,
      aRemainingCorrected,
      hBalanceCorrected,
      finDiretoActive: modoDireto,
      finDiretoParcelas: finDiretoParcelasConfig,
      posPmt: priceEst.pmt,
      posTotalPago: priceEst.total,
      posJurosTotal: priceEst.juros,
      posFimLabel: formatDateBR(posFimDate),
      sinalRows,
      monthlyRows,
      semesterRows,
      annualRows,
      intermediariasRows,
      unicaScheduleRows,
      unicaDataScheduleRows,
      decoracaoRows,
    };
  }, [
    propertyValue,
    discount,
    downPaymentValue,
    downPaymentDate,
    dpInstallments,
    monthlyVal,
    semesterVal,
    annualVal,
    unicaVal,
    unicaDataVal,
    finalPropertyValue,
    inccMonthlyRate,
    inccMode,
    posMode,
    posIndexRate,
    posJuros,
    posTotalRate,
    modoDireto,
    posEstimativaAtiva,
    config,
    dpDate,
    paymentLimit,
    totalMonths,
    maxSemesterInstallments,
    maxAnnualInstallments,
    intermediateInstallments,
    decoracaoEnabled,
    decoracaoTotalValue,
    decoracaoNumParcelas,
    decoracaoStartDate,
    decoracaoEndDate,
    decoracaoPerParcela,
    decoracaoTotalMonths,
  ]);

  useEffect(() => {
    if (propertyValue > 0 && config) {
      setShowResults(true);
      track({ event_type: "simulador_calculate", resource_type: "empreendimento", metadata: { empreendimento: empreendimento?.slug || "", unidade: unitName, valor_imovel: result.finalPropertyValue, captacao_percent: result.captationPercent } });
    }
  }, [result, propertyValue, config]);

  const handleCurrencyInput =
    (setter: (v: string) => void) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { formatted } = formatInputAsCurrency(e.target.value);
      setter(formatted);
    };

  const toggleOptional = (key: string) => {
    setExpandedOptional((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const addIntermediate = () => {
    setIntermediateInstallments((prev) => [
      ...prev,
      {
        id: `int-${Date.now()}`,
        date: getTodayISO(),
        valueInput: "",
      },
    ]);
  };

  const removeIntermediate = (id: string) => {
    setIntermediateInstallments((prev) => prev.filter((i) => i.id !== id));
  };

  const updateIntermediate = (
    id: string,
    field: "date" | "valueInput",
    value: string
  ) => {
    setIntermediateInstallments((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const clearAll = () => {
    setPropertyValueInput(initialValor > 0 ? formatBRL(initialValor) : "");
    setDiscountPercent("0");
    setDownPaymentInput("");
    setMonthlyValueInput("");
    setSemesterValueInput("");
    setAnnualValueInput("");
    setUnicaValueInput("");
    setUnicaDataValueInput("");
    setDownPaymentInstallments("1");
    setDownPaymentDate(getTodayISO());
    setShowResults(false);
    setInccMode("none");
    setPosMode("none");
    setIntermediateInstallments([]);
    setExpandedOptional(new Set());
  };

  // Build available tabs dynamically
  const availableTabs: { key: TabKey; label: string }[] = useMemo(() => {
    const tabs: { key: TabKey; label: string }[] = [
      { key: "sinal", label: "Sinal" },
      { key: "mensal", label: "Mensais" },
    ];
    if (config?.semestrais_habilitado) {
      tabs.push({ key: "semestral", label: "Semest." });
    }
    if (config?.anuais_habilitado) {
      tabs.push({ key: "anual", label: "Anuais" });
    }
    if (config?.intermediarias_habilitado) {
      tabs.push({ key: "intermediarias", label: "Interm." });
    }
    if (config?.parcela_unica_data_habilitada) {
      tabs.push({ key: "unicaData", label: "Única" });
    }
    if (config?.parcela_unica_habilitada) {
      tabs.push({ key: "unica", label: "Única Hab." });
    }
    if (decoracaoEnabled) {
      tabs.push({ key: "decoracao", label: "Decoração" });
    }
    tabs.push({ key: "financiamento", label: "Financ." });
    return tabs;
  }, [config, decoracaoEnabled]);

  // Ensure activeTab is valid
  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.find((t) => t.key === activeTab)) {
      setActiveTab(availableTabs[0].key);
    }
  }, [availableTabs, activeTab]);

  // ── PDF Generation ──
  const generatePDF = useCallback(async () => {
    track({ event_type: "simulador_export_pdf", resource_type: "empreendimento", metadata: { empreendimento: empreendimento?.slug || "", unidade: unitName } });
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
    const primaryColor: [number, number, number] = [26, 58, 95];
    const secondaryColor: [number, number, number] = [212, 175, 55];
    let yPos = 0;
    const empName = empreendimento?.nome || "Empreendimento";

    // Header
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 40, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text(empName, margin, 20);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text("Simulação Comercial - Fluxo de Pagamento", margin, 30);
    const today = new Date().toLocaleDateString("pt-BR");
    doc.setFontSize(10);
    doc.text(
      `Gerado em: ${today}`,
      pageWidth - margin - 30,
      30,
      { align: "right" }
    );
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
        [
          "Andar",
          initialAndar ? `${initialAndar}º Andar` : "—",
        ],
        ["Valor do Imóvel", formatBRL(propertyValue)],
        [
          "Valor com Desconto",
          formatBRL(result.finalPropertyValue),
        ],
        ["Entrega Prevista", deliveryLabel],
      ],
      theme: "grid",
      headStyles: { fillColor: primaryColor, textColor: 255 },
      margin: { top: 10, left: margin, right: margin },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 50 },
        1: { cellWidth: "auto" },
      },
    });
    yPos = doc.lastAutoTable.finalY + 15;

    // Summary
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Resumo Financeiro", margin, yPos);
    yPos += 10;
    const summaryBody: string[][] = [
      [
        "Sinal",
        formatBRL(result.downPaymentValue),
        `${result.downPaymentPercent.toFixed(2)}%`,
      ],
      [
        "Mensais (Obra)",
        formatBRL(result.monthlyPaid),
        `${result.monthlyPaidPercent.toFixed(2)}%`,
      ],
    ];
    if (config?.semestrais_habilitado && result.semesterPaid > 0) {
      summaryBody.push([
        "Semestrais (Obra)",
        formatBRL(result.semesterPaid),
        `${result.semesterPaidPercent.toFixed(2)}%`,
      ]);
    }
    if (config?.anuais_habilitado && result.annualPaid > 0) {
      summaryBody.push([
        "Anuais (Obra)",
        formatBRL(result.annualPaid),
        `${result.annualPaidPercent.toFixed(2)}%`,
      ]);
    }
    if (
      config?.intermediarias_habilitado &&
      result.intermediariasPaid > 0
    ) {
      summaryBody.push([
        "Intermediárias (Obra)",
        formatBRL(result.intermediariasPaid),
        `${result.intermediariasPaidPercent.toFixed(2)}%`,
      ]);
    }
    if (config?.parcela_unica_data_habilitada && result.unicaDataValue > 0) {
      summaryBody.push([
        `Única (data definida)`,
        formatBRL(result.unicaDataValue),
        `${result.unicaDataPercent.toFixed(2)}%`,
      ]);
    }
    if (config?.parcela_unica_habilitada && result.unicaValue > 0) {
      summaryBody.push([
        `Única Habite-se (mês de entrega)`,
        formatBRL(result.unicaValue),
        `${result.unicaPercent.toFixed(2)}%`,
      ]);
    }
    summaryBody.push([
      modoDireto
        ? "Financiamento direto construtora"
        : "Financiamento",
      formatBRL(result.financingAmount),
      `${result.financingPercent.toFixed(2)}%`,
    ]);
    if (inccMode !== "none" && result.inccAccumulatedPercent > 0) {
      summaryBody.push([
        "Financiamento (estimativa INCC)",
        formatBRL(result.financingCorrected),
        `${((result.financingCorrected / result.finalPropertyValue) * 100).toFixed(2)}%`,
      ]);
    }
    summaryBody.push(["Total", formatBRL(result.finalPropertyValue), "100%"]);

    autoTable(doc, {
      startY: yPos,
      head: [["Etapa", "Valor", "%"]],
      body: summaryBody,
      theme: "striped",
      headStyles: { fillColor: primaryColor, textColor: 255 },
      margin: { top: 10, left: margin, right: margin },
      foot: [
        ["", "Total Geral:", formatBRL(result.finalPropertyValue)],
      ],
      footStyles: {
        fillColor: secondaryColor,
        textColor: 0,
        fontStyle: "bold",
      },
    });
    yPos = doc.lastAutoTable.finalY + 15;

    // Schedule tables
    function renderSchedule(
      title: string,
      rows: InstallmentRow[],
      forcePage?: boolean
    ) {
      if (rows.length === 0) return;
      if (yPos > 220 || forcePage) {
        doc.addPage();
        yPos = 20;
      }
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(`Cronograma: ${title}`, margin, yPos);
      yPos += 10;
      autoTable(doc, {
        startY: yPos,
        head: [["Parcela", "Data", "Valor"]],
        body: rows.map((r) => [r.parcela, r.data, r.valor]),
        theme: "grid",
        headStyles: { fillColor: primaryColor, textColor: 255 },
        margin: { top: 10, left: margin, right: margin },
        pageBreak: "auto",
      });
      yPos = doc.lastAutoTable.finalY + 15;
    }

    renderSchedule("Sinal", result.sinalRows, true);
    renderSchedule("Mensais", result.monthlyRows);
    if (config?.semestrais_habilitado) {
      renderSchedule("Semestrais", result.semesterRows);
    }
    if (config?.anuais_habilitado) {
      renderSchedule("Anuais", result.annualRows);
    }
    if (config?.intermediarias_habilitado) {
      renderSchedule("Intermediárias", result.intermediariasRows);
    }
    if (config?.parcela_unica_data_habilitada) {
      renderSchedule("Parcela Única", result.unicaDataScheduleRows);
    }
    if (config?.parcela_unica_habilitada) {
      renderSchedule("Parcela Única Habite-se", result.unicaScheduleRows);
    }
    if (decoracaoEnabled) {
      renderSchedule("Decoração", result.decoracaoRows);
    }

    // Financing details
    if (yPos > 200) {
      doc.addPage();
      yPos = 20;
    }
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Detalhes do Financiamento", margin, yPos);
    yPos += 10;
    const financingBody: string[][] = [
      ["Saldo Mensais Restantes", formatBRL(result.monthlyRemaining)],
    ];
    if (config?.semestrais_habilitado) {
      financingBody.push([
        "Saldo Semestrais Restantes",
        formatBRL(result.semesterRemaining),
      ]);
    }
    if (config?.anuais_habilitado) {
      financingBody.push([
        "Saldo Anuais Restantes",
        formatBRL(result.annualRemaining),
      ]);
    }
    financingBody.push([
      "Saldo Final do Imóvel",
      formatBRL(result.habiteseBalance),
    ]);
    financingBody.push([
      "Total para Quitação",
      formatBRL(result.financingAmount),
    ]);
    autoTable(doc, {
      startY: yPos,
      head: [["Descrição", "Valor"]],
      body: financingBody,
      theme: "striped",
      headStyles: { fillColor: secondaryColor, textColor: 0 },
      margin: { top: 10, left: margin, right: margin },
    });
    yPos = doc.lastAutoTable.finalY + 15;

    // INCC Correction
    if (inccMode !== "none" && result.inccAccumulatedPercent > 0) {
      if (yPos > 200) {
        doc.addPage();
        yPos = 20;
      }
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Estimativa de Correcao INCC", margin, yPos);
      yPos += 10;
      const constructionMonths = Math.max(
        0,
        monthsBetween(dpDate, paymentLimit)
      );
      const inccMetricLabel =
        inccMode === "180m"
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
          [
            "Taxa Mensal Utilizada",
            `${inccMonthlyRate.toFixed(3)}% ao mês`,
          ],
          ["Métrica Utilizada", inccMetricLabel],
          ["Fonte dos Dados", inccSourceLabel],
          ["Período de Correção", `${constructionMonths} meses`],
          ["Correção Acumulada", `${result.inccAccumulatedPercent.toFixed(2)}%`],
          ["Financiamento Original", formatBRL(result.financingAmount)],
          [
            "Financiamento Projetado",
            formatBRL(result.financingCorrected),
          ],
          [
            "Impacto Estimado",
            formatBRL(result.financingCorrected - result.financingAmount),
          ],
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

    // ── Estimativa das parcelas PRICE (somente cenário de financiamento direto) ──
    if (posEstimativaAtiva && result.posBase > 0) {
      if (yPos > 200) {
        doc.addPage();
        yPos = 20;
      }
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Financiamento Direto com a Construtora (Estimativa)", margin, yPos);
      yPos += 10;
      const posMetricLabel =
        posMode === "180m"
          ? `Média dos últimos 180 meses do ${posIndexLabel}`
          : posMode === "12m"
            ? `Média dos últimos 12 meses do ${posIndexLabel}`
            : `Média dos últimos 6 meses do ${posIndexLabel}`;
      const posSourceLabel = posData.isFallback
        ? "Dados de referência (valores estimados)"
        : "Banco Central do Brasil (SGS)";
      autoTable(doc, {
        startY: yPos,
        head: [["Descrição", "Valor"]],
        body: [
          [
            "Modalidade",
            `Financiamento direto com a construtora — ${result.finDiretoParcelas} parcelas mensais fixas (sistema PRICE)`,
          ],
          [
            "Índice Aplicado",
            `${posIndexLabel} + juros de ${formatJurosPosHabitese(config?.juros_pos_habitese)} ao mês`,
          ],
          [
            "Taxa Mensal Estimada",
            `${formatPctBR(posIndexRate)} (índice) + ${formatPctBR(posJuros)} (juros) = ${formatPctBR(posTotalRate)} ao mês`,
          ],
          ["Métrica Utilizada", posMetricLabel],
          ["Fonte dos Dados", posSourceLabel],
          ["Saldo Financiado (no Habite-se)", formatBRL(result.posBase)],
          ["Parcela Mensal Estimada (PMT)", formatBRL(result.posPmt)],
          ["Número de Parcelas", `${result.finDiretoParcelas} parcelas mensais`],
          ["Total Estimado", formatBRL(result.posTotalPago)],
          ["Juros Estimados", formatBRL(result.posJurosTotal)],
          ["Última Parcela Estimada", result.posFimLabel],
        ],
        theme: "grid",
        headStyles: { fillColor: [79, 70, 229], textColor: 255 },
        margin: { top: 10, left: margin, right: margin },
      });
      yPos = doc.lastAutoTable.finalY + 8;
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(79, 70, 229);
      const posDisclaimerLines = doc.splitTextToSize(
        "AVISO: As parcelas acima são estimativas calculadas pelo sistema PRICE sobre o saldo no habite-se, usando a média histórica do índice indicado mais a taxa de juros informada. O resultado final dependerá dos índices efetivamente apurados após a entrega e das condições contratuais do financiamento direto. A correção durante as obras é sempre pelo INCC; esta projeção cobre apenas o período posterior à entrega. Consulte o contrato para as condições definitivas.",
        pageWidth - margin * 2
      );
      doc.text(posDisclaimerLines, margin, yPos);
      yPos += posDisclaimerLines.length * 3.5 + 10;
    }

    // ── Correção do Saldo Devedor (última página, antes das Observações) ──
    if (yPos > 170) {
      doc.addPage();
      yPos = 20;
    }
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Correção do Saldo Devedor", margin, yPos);
    yPos += 8;
    autoTable(doc, {
      startY: yPos + 2,
      head: [["Fase", "Índice de Correção"]],
      body: [
        [
          "Durante as obras (até o habite-se)",
          "INCC — Índice Nacional de Custo da Construção, corrigido mensalmente",
        ],
        [
          "Após a emissão do habite-se",
          `${posHabiteseIndexLabel(config?.indice_pos_habitese)} + juros de ${formatJurosPosHabitese(config?.juros_pos_habitese)} ao mês, sobre o saldo devedor remanescente`,
        ],
      ],
      theme: "grid",
      headStyles: { fillColor: primaryColor, textColor: 255 },
      margin: { top: 10, left: margin, right: margin },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 60 },
      },
    });
    yPos = doc.lastAutoTable.finalY + 6;
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(90, 90, 90);
    const correctionNoteLines = doc.splitTextToSize(
      modoDireto
        ? posEstimativaAtiva
          ? "A correção durante as obras é sempre pelo INCC. A partir da emissão do habite-se, o saldo devedor passa a ser corrigido pelo índice contratado mais a taxa de juros mensal indicada acima, até a efetiva quitação. A estimativa das parcelas do financiamento direto com a construtora apresentada neste PDF utiliza o sistema PRICE sobre o saldo no habite-se, com a média histórica do índice selecionada na simulação mais os juros contratados."
          : "A correção durante as obras é sempre pelo INCC. A partir da emissão do habite-se, o saldo devedor passa a ser corrigido pelo índice contratado mais a taxa de juros mensal indicada acima, até a efetiva quitação. Nesta simulação, nenhuma correção pós-entrega foi calculada — selecione uma média do índice no simulador para estimar as parcelas do financiamento direto."
        : "A correção durante as obras é sempre pelo INCC. A partir da emissão do habite-se, o saldo devedor passa a ser corrigido pelo índice contratado mais a taxa de juros mensal indicada acima, até a efetiva quitação. IMPORTANTE: nesta simulação (financiamento bancário) NENHUMA correção pós-entrega foi calculada nos valores apresentados — a correção indicada acima ocorrerá conforme o contrato e poderá alterar o saldo devedor após a entrega.",
      pageWidth - margin * 2
    );
    doc.text(correctionNoteLines, margin, yPos);
    yPos += correctionNoteLines.length * 3.5 + 8;

    // Notes
    if (yPos > 210) {
      doc.addPage();
      yPos = 20;
    }
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Observações Importantes", margin, yPos);
    yPos += 8;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    const posHabiteseLabel = posHabiteseFullLabel(
      config?.indice_pos_habitese,
      config?.juros_pos_habitese
    );
    const notes = [
      modoDireto
        ? `O saldo devedor deverá ser quitado até o habite-se ou financiado diretamente com a construtora em ${result.finDiretoParcelas} parcelas mensais (sistema PRICE), conforme as condições contratuais.`
        : "O saldo devedor deverá ser quitado até o habite-se ou financiado com o banco de preferência.",
      `Importante: Os saldos devedores de todas as parcelas serão corrigidos mensalmente pelo INCC (Índice Nacional de Custo da Construção) durante as obras, até o habite-se, e a partir da emissão do habite-se por ${posHabiteseLabel}.`,
      "Os valores, condições e disponibilidade apresentados podem sofrer alteração sem aviso prévio.",
      `Entrega prevista: ${deliveryLabel}.`,
    ];
    if (decoracaoEnabled) {
      notes.push(
        `A taxa de decoração (${formatBRL(decoracaoTotalValue)}) é cobrada separadamente e não compõe o percentual de captação.`
      );
    }
    notes.forEach((note) => {
      const lines = doc.splitTextToSize(
        note,
        pageWidth - margin * 2
      );
      doc.text(lines, margin, yPos);
      yPos += lines.length * 4 + 4;
    });

    // Footer
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Página ${i} de ${totalPages} - ${empName}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: "center" }
      );
    }

    const fileName = `Simulacao_${empName.replace(/\s+/g, "_")}_${(unitName || "unidade").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;
    try {
      const blob = doc.output("blob");
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
    } catch {
      doc.save(fileName);
    }
  }, [
    result,
    unitName,
    initialArea,
    initialAndar,
    propertyValue,
    inccMode,
    inccMonthlyRate,
    inccData.isFallback,
    posMode,
    posIndexRate,
    posJuros,
    posTotalRate,
    posData.isFallback,
    modoDireto,
    posEstimativaAtiva,
    downPaymentDate,
    empreendimento,
    config,
    deliveryLabel,
    decoracaoEnabled,
    decoracaoTotalValue,
    dpDate,
    paymentLimit,
  ]);

  // Build result rows for summary
  const resultRows = useMemo(() => {
    const rows: {
      description: string;
      value: string;
      percent: number;
      note: string;
      bold: boolean;
      isHighlight: boolean;
      isIncc: boolean;
      isDecoracao: boolean;
      isPos?: boolean;
    }[] = [
      {
        description: "Sinal",
        value: formatBRL(result.downPaymentValue),
        percent: result.downPaymentPercent,
        note: "Pagamento à vista",
        bold: false,
        isHighlight: false,
        isIncc: false,
        isDecoracao: false,
      },
      {
        description: "Parcelas Mensais",
        value: formatBRL(result.monthlyPaid),
        percent: result.monthlyPaidPercent,
        note: `${result.monthlyInstallments} parcelas`,
        bold: false,
        isHighlight: false,
        isIncc: false,
        isDecoracao: false,
      },
    ];
    if (config?.semestrais_habilitado) {
      rows.push({
        description: "Parcelas Semestrais",
        value: formatBRL(result.semesterPaid),
        percent: result.semesterPaidPercent,
        note: `${result.semesterInstallments} parcelas`,
        bold: false,
        isHighlight: false,
        isIncc: false,
        isDecoracao: false,
      });
    }
    if (config?.anuais_habilitado) {
      rows.push({
        description: "Parcelas Anuais",
        value: formatBRL(result.annualPaid),
        percent: result.annualPaidPercent,
        note: `${result.annualInstallments} parcelas`,
        bold: false,
        isHighlight: false,
        isIncc: false,
        isDecoracao: false,
      });
    }
    if (config?.intermediarias_habilitado && result.intermediariasPaid > 0) {
      rows.push({
        description: "Intermediárias",
        value: formatBRL(result.intermediariasPaid),
        percent: result.intermediariasPaidPercent,
        note: `${intermediateInstallments.length} parcela(s)`,
        bold: false,
        isHighlight: false,
        isIncc: false,
        isDecoracao: false,
      });
    }
    if (config?.parcela_unica_data_habilitada && result.unicaDataValue > 0) {
      rows.push({
        description: "Única",
        value: formatBRL(result.unicaDataValue),
        percent: result.unicaDataPercent,
        note: `1 parcela em ${result.unicaDataDate}`,
        bold: false,
        isHighlight: false,
        isIncc: false,
        isDecoracao: false,
      });
    }
    if (config?.parcela_unica_habilitada && result.unicaValue > 0) {
      rows.push({
        description: "Única Habite-se",
        value: formatBRL(result.unicaValue),
        percent: result.unicaPercent,
        note: `1 parcela em ${result.unicaDate}`,
        bold: false,
        isHighlight: false,
        isIncc: false,
        isDecoracao: false,
      });
    }
    rows.push({
      description: "Financiamento",
      value: formatBRL(result.financingAmount),
      percent: result.financingPercent,
      note: modoDireto
        ? `Financiamento direto com a construtora (${result.finDiretoParcelas} parcelas PRICE)`
        : "Saldo para financiamento bancário",
      bold: false,
      isHighlight: false,
      isIncc: false,
      isDecoracao: false,
    });
    if (inccMode !== "none" && result.inccAccumulatedPercent > 0) {
      rows.push({
        description: "Financiamento (estimativa INCC)*",
        value: formatBRL(result.financingCorrected),
        percent:
          result.financingPercent > 0
            ? (result.financingCorrected / result.finalPropertyValue) * 100
            : 0,
        note: `INCC +${result.inccAccumulatedPercent.toFixed(2)}% (${inccMonthlyRate.toFixed(3)}% a.m.)`,
        bold: false,
        isHighlight: false,
        isIncc: true,
        isDecoracao: false,
      });
    }
    if (posEstimativaAtiva && result.posBase > 0) {
      rows.push({
        description: "Financiamento construtora (estimativa PRICE)*",
        value: formatBRL(result.posTotalPago),
        percent:
          result.finalPropertyValue > 0
            ? (result.posTotalPago / result.finalPropertyValue) * 100
            : 0,
        note: `${result.finDiretoParcelas} parcelas de ${formatBRL(result.posPmt)} — ${posIndexLabel} + juros = ${formatPctBR(posTotalRate)}% a.m.`,
        bold: false,
        isHighlight: false,
        isIncc: false,
        isDecoracao: false,
        isPos: true,
      });
    }
    if (decoracaoEnabled && result.decoracaoPaid > 0) {
      rows.push({
        description: "Taxa de Decoração",
        value: formatBRL(result.decoracaoPaid),
        percent: 0,
        note: `${result.decoracaoInstallments} parcelas (não compõe captação)`,
        bold: false,
        isHighlight: false,
        isIncc: false,
        isDecoracao: true,
      });
    }
    rows.push({
      description: "Valor Total",
      value: formatBRL(result.finalPropertyValue),
      percent: 100,
      note: "",
      bold: true,
      isHighlight: true,
      isIncc: false,
      isDecoracao: false,
    });
    return rows;
  }, [
    result,
    inccMode,
    inccMonthlyRate,
    posMode,
    posTotalRate,
    posIndexLabel,
    modoDireto,
    posEstimativaAtiva,
    config,
    intermediateInstallments,
    decoracaoEnabled,
  ]);

  // ── Loading / Error states ──
  if (configLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-slate-300 mx-auto mb-4 animate-spin" />
          <p className="text-slate-400 font-medium">Carregando configuração...</p>
        </div>
      </div>
    );
  }

  if (configError || !config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center max-w-md mx-auto px-4">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            Erro ao carregar simulador
          </h2>
          <p className="text-slate-500 mb-6">{configError || "Configuração não encontrada para este empreendimento."}</p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar
          </a>
        </div>
      </div>
    );
  }

  // ─── Render ───
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-lg border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img
                src="/imobsync-icon-claro-36.png"
                alt="ImobSync"
                className="h-10 w-auto rounded-xl"
              />
              <div>
                <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                  {empreendimento?.nome || "Simulador"}
                </h1>
                <p className="text-xs text-slate-500 font-medium hidden sm:block">
                  Simulação Comercial - Fluxo de Pagamento
                </p>
              </div>
            </div>
            <a
              href={`/empreendimento/${id}`}
              className="text-sm text-slate-600 hover:text-slate-900 transition-colors font-medium flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Voltar ao Empreendimento</span>
              <span className="sm:hidden">Voltar</span>
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
        {/* Title */}
        <div className="text-center mb-6">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Simulador de Fluxo de Pagamento
          </h2>
          <p className="text-slate-500 mt-2 max-w-xl mx-auto">
            Preencha os dados abaixo e simule o plano de pagamento personalizado.
          </p>
        </div>

        {/* Seletor de cenário pós-entrega (apenas quando o admin habilitou) */}
        {finDiretoAvailable && (
          <div className="mb-8 max-w-3xl mx-auto">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-5">
              <p className="text-center text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                Como você quer pagar o saldo após a entrega?
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setModoFinanciamento("bancario")}
                  className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                    !modoDireto
                      ? "border-[#0D1B2A] bg-[#0D1B2A]/5 shadow-sm"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <Landmark
                    className={`w-5 h-5 mt-0.5 shrink-0 ${
                      !modoDireto ? "text-[#0D1B2A]" : "text-slate-400"
                    }`}
                  />
                  <span>
                    <span
                      className={`block text-sm font-bold ${
                        !modoDireto ? "text-[#0D1B2A]" : "text-slate-600"
                      }`}
                    >
                      Padrão — Financiamento bancário
                    </span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      Saldo devedor financiado pelo banco de sua preferência.
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setModoFinanciamento("direto")}
                  className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                    modoDireto
                      ? "border-indigo-600 bg-indigo-50 shadow-sm"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <Building2
                    className={`w-5 h-5 mt-0.5 shrink-0 ${
                      modoDireto ? "text-indigo-600" : "text-slate-400"
                    }`}
                  />
                  <span>
                    <span
                      className={`block text-sm font-bold ${
                        modoDireto ? "text-indigo-700" : "text-slate-600"
                      }`}
                    >
                      Financiamento direto com a construtora
                    </span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      {clampFinDiretoParcelas(config?.fin_direto_parcelas)} parcelas
                      mensais fixas (PRICE) após a entrega, direto com a construtora.
                    </span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
          {/* ── Left Column ── */}
          <div className="space-y-6 lg:col-span-3">
            {/* Auto-calc indicator */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm font-medium"
            >
              <RotateCcw
                className="w-4 h-4 animate-spin"
                style={{ animationDuration: "3s" }}
              />
              <span>Cálculo automático em tempo real</span>
            </motion.div>

            {/* Card 1: Property Details */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50">
                <Home className="w-5 h-5 text-slate-700" />
                <h3 className="font-bold text-slate-800">
                  Detalhes do Imóvel
                </h3>
              </div>
              <div className="p-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
                      Valor do Imóvel (R$)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={propertyValueInput}
                      onChange={handleCurrencyInput(setPropertyValueInput)}
                      placeholder="Ex: R$ 500.000,00"
                      className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all placeholder:text-slate-400 text-right"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
                      Percentual de Desconto (%)
                    </label>
                    <input
                      type="number"
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(e.target.value)}
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="Ex: 5"
                      className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all placeholder:text-slate-400"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
                      Unidade
                    </label>
                    <input
                      type="text"
                      value={unitName}
                      onChange={(e) => setUnitName(e.target.value)}
                      placeholder="Ex: Apto 1201"
                      className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all placeholder:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
                      Área
                    </label>
                    <input
                      type="text"
                      value={initialArea}
                      readOnly
                      className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-100 text-sm font-medium text-slate-600"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
                      Andar
                    </label>
                    <input
                      type="text"
                      value={initialAndar}
                      readOnly
                      className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-100 text-sm font-medium text-slate-600"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Sinal */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50">
                <Wallet className="w-5 h-5 text-slate-700" />
                <h3 className="font-bold text-slate-800">
                  Pagamento Inicial (Sinal)
                </h3>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
                    Valor do Sinal (R$)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={downPaymentInput}
                    onChange={handleCurrencyInput(setDownPaymentInput)}
                    placeholder={`Deixe em branco para ${defaultSinalPercent}% do valor final`}
                    className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all placeholder:text-slate-400 text-right"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Padrão: {defaultSinalPercent}% do valor final do imóvel.
                  </p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
                    Data do Primeiro Pagamento do Sinal
                  </label>
                  <input
                    type="date"
                    value={downPaymentDate}
                    min={getTodayISO()}
                    onChange={(e) => setDownPaymentDate(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all placeholder:text-slate-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
                    Número de Parcelas do Sinal
                  </label>
                  {sinalParcelavel ? (
                    <>
                      <select
                        value={String(dpInstallments)}
                        onChange={(e) => setDownPaymentInstallments(e.target.value)}
                        className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all"
                      >
                        {Array.from({ length: sinalMaxParcelas }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={String(n)}>
                            {n} {n === 1 ? "parcela" : "parcelas"}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-slate-500 mt-1">
                        O sinal ato pode ser dividido em até {sinalMaxParcelas}{" "}
                        {sinalMaxParcelas === 1 ? "parcela" : "parcelas"} mensais, a partir da data do primeiro
                        pagamento.
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-slate-500">
                      O sinal ato deve ser pago à vista, em parcela única.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Card 3: Monthly installments */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50">
                <CalendarClock className="w-5 h-5 text-slate-700" />
                <h3 className="font-bold text-slate-800">
                  Parcelas Mensais Durante a Obra
                </h3>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
                    Valor de Cada Parcela Mensal (R$)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={monthlyValueInput}
                    onChange={handleCurrencyInput(setMonthlyValueInput)}
                    placeholder="Ex: R$ 1.500,00"
                    className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all placeholder:text-slate-400 text-right"
                  />
                  {monthlyVal > 0 && (
                    <div className="mt-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-sm text-slate-600">
                      <span className="font-medium">
                        Total mensal: {formatBRL(monthlyVal * totalMonths)}{" "}
                        ({totalMonths}x)
                      </span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  As parcelas mensais iniciam no mês seguinte ao sinal e vão até
                  o mês anterior à entrega ({deliveryLabel}). Total de {" "}
                  <strong>{totalMonths} meses</strong>.
                </p>
              </div>
            </div>

            {/* Card 4: Optional Installments */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50">
                <Settings className="w-5 h-5 text-slate-700" />
                <h3 className="font-bold text-slate-800">
                  Parcelas Opcionais
                </h3>
              </div>
              <div className="p-6 space-y-3">
                {/* Semestrais */}
                {config.semestrais_habilitado && (
                  <motion.div
                    layout
                    className="rounded-xl border border-slate-200 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleOptional("semestral")}
                      className={`flex items-center justify-between w-full p-4 transition-all ${expandedOptional.has("semestral") ? "bg-emerald-50 border-b border-emerald-100" : "bg-slate-50 hover:bg-slate-100"}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${semesterVal > 0 ? "bg-emerald-500" : "bg-slate-300"}`} />
                        <span className="font-semibold text-slate-700">
                          Parcelas Semestrais
                        </span>
                        <span className="text-xs text-slate-400">
                          (até {maxSemesterInstallments} parcelas)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {semesterVal > 0 && (
                          <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                            Ativo
                          </span>
                        )}
                        {expandedOptional.has("semestral") ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </button>
                    <AnimatePresence>
                      {expandedOptional.has("semestral") && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="p-4 space-y-3 border-t border-slate-100">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
                              Valor de Cada Parcela Semestral (R$)
                            </label>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={semesterValueInput}
                              onChange={handleCurrencyInput(
                                setSemesterValueInput
                              )}
                              placeholder="Ex: R$ 10.000,00"
                              className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white transition-all placeholder:text-slate-400 text-right"
                            />
                            {semesterVal > 0 && (
                              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-sm text-emerald-700">
                                <span className="font-medium">
                                  Total semestral: {" "}
                                  {formatBRL(
                                    semesterVal * maxSemesterInstallments
                                  )}{" "}
                                  ({maxSemesterInstallments}x)
                                </span>
                              </div>
                            )}
                            <p className="text-xs text-slate-400">
                              Pagas a cada 6 meses a partir do sinal, até o mês
                              anterior à entrega.
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}

                {/* Anuais */}
                {config.anuais_habilitado && (
                  <motion.div
                    layout
                    className="rounded-xl border border-slate-200 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleOptional("anual")}
                      className={`flex items-center justify-between w-full p-4 transition-all ${expandedOptional.has("anual") ? "bg-blue-50 border-b border-blue-100" : "bg-slate-50 hover:bg-slate-100"}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${annualVal > 0 ? "bg-blue-500" : "bg-slate-300"}`} />
                        <span className="font-semibold text-slate-700">
                          Parcelas Anuais
                        </span>
                        <span className="text-xs text-slate-400">
                          (até {maxAnnualInstallments} parcelas)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {annualVal > 0 && (
                          <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                            Ativo
                          </span>
                        )}
                        {expandedOptional.has("anual") ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </button>
                    <AnimatePresence>
                      {expandedOptional.has("anual") && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="p-4 space-y-3 border-t border-slate-100">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
                              Valor de Cada Parcela Anual (R$)
                            </label>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={annualValueInput}
                              onChange={handleCurrencyInput(
                                setAnnualValueInput
                              )}
                              placeholder="Ex: R$ 25.000,00"
                              className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all placeholder:text-slate-400 text-right"
                            />
                            {annualVal > 0 && (
                              <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-100 text-sm text-blue-700">
                                <span className="font-medium">
                                  Total anual: {" "}
                                  {formatBRL(
                                    annualVal * maxAnnualInstallments
                                  )}{" "}
                                  ({maxAnnualInstallments}x)
                                </span>
                              </div>
                            )}
                            <p className="text-xs text-slate-400">
                              Pagas a cada 12 meses a partir do sinal, até o mês
                              anterior à entrega.
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}

                {/* Intermediárias */}
                {config.intermediarias_habilitado && (
                  <motion.div
                    layout
                    className="rounded-xl border border-slate-200 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleOptional("intermediarias")}
                      className={`flex items-center justify-between w-full p-4 transition-all ${expandedOptional.has("intermediarias") ? "bg-purple-50 border-b border-purple-100" : "bg-slate-50 hover:bg-slate-100"}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${intermediateInstallments.length > 0 ? "bg-purple-500" : "bg-slate-300"}`} />
                        <span className="font-semibold text-slate-700">
                          Parcelas Intermediárias
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {intermediateInstallments.length > 0 && (
                          <span className="text-xs font-medium text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                            {intermediateInstallments.length} parcela(s)
                          </span>
                        )}
                        {expandedOptional.has("intermediarias") ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </button>
                    <AnimatePresence>
                      {expandedOptional.has("intermediarias") && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="p-4 space-y-3 border-t border-slate-100">
                            <p className="text-xs text-slate-500">
                              Adicione parcelas intermediárias com data e valor
                              personalizados.
                            </p>
                            {intermediateInstallments.length === 0 && (
                              <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-xl">
                                <p className="text-slate-400 text-sm mb-3">
                                  Clique para adicionar parcelas intermediárias
                                </p>
                                <button
                                  type="button"
                                  onClick={addIntermediate}
                                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
                                >
                                  <Plus className="w-4 h-4" /> Adicionar
                                  Parcela
                                </button>
                              </div>
                            )}
                            {intermediateInstallments.length > 0 && (
                              <div className="space-y-3">
                                {intermediateInstallments.map((item) => (
                                  <div
                                    key={item.id}
                                    className="flex items-end gap-3 p-3 bg-purple-50 rounded-xl border border-purple-100"
                                  >
                                    <div className="flex-1">
                                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
                                        Data
                                      </label>
                                      <input
                                        type="date"
                                        value={item.date}
                                        onChange={(e) =>
                                          updateIntermediate(
                                            item.id,
                                            "date",
                                            e.target.value
                                          )
                                        }
                                        className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                      />
                                    </div>
                                    <div className="flex-1">
                                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
                                        Valor (R$)
                                      </label>
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        value={item.valueInput}
                                        onChange={(e) =>
                                          updateIntermediate(
                                            item.id,
                                            "valueInput",
                                            e.target.value
                                          )
                                        }
                                        placeholder="R$ 0,00"
                                        className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 text-right placeholder:text-slate-400"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => removeIntermediate(item.id)}
                                      className="h-10 w-10 flex items-center justify-center rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={addIntermediate}
                                  className="flex items-center gap-2 px-4 py-2 text-purple-600 text-sm font-medium hover:bg-purple-50 rounded-lg transition-colors"
                                >
                                  <Plus className="w-4 h-4" /> Adicionar outra
                                  parcela
                                </button>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}

                {/* Parcela Única (data definida pelo administrador) */}
                {config.parcela_unica_data_habilitada && (
                  <motion.div
                    layout
                    className="rounded-xl border border-slate-200 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleOptional("unicaData")}
                      className={`flex items-center justify-between w-full p-4 transition-all ${expandedOptional.has("unicaData") ? "bg-rose-50 border-b border-rose-100" : "bg-slate-50 hover:bg-slate-100"}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${unicaDataVal > 0 ? "bg-rose-500" : "bg-slate-300"}`} />
                        <span className="font-semibold text-slate-700">
                          Parcela Única
                        </span>
                        <span className="text-xs text-slate-400">
                          (em {result.unicaDataDate || "data definida pelo empreendimento"})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {unicaDataVal > 0 && (
                          <span className="text-xs font-medium text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                            Ativo
                          </span>
                        )}
                        {expandedOptional.has("unicaData") ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </button>
                    <AnimatePresence>
                      {expandedOptional.has("unicaData") && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="p-4 space-y-3 border-t border-slate-100">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
                              Valor da Parcela Única (R$)
                            </label>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={unicaDataValueInput}
                              onChange={handleCurrencyInput(setUnicaDataValueInput)}
                              placeholder="Informe o valor (opcional)"
                              className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-600 focus:bg-white transition-all placeholder:text-slate-400 text-right"
                            />
                            <p className="text-xs text-slate-400">
                              Paga em {result.unicaDataDate || "data definida pelo empreendimento"}.
                              Compõe a captação da obra.
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}

                {/* Parcela Única Habite-se */}
                {config.parcela_unica_habilitada && (
                  <motion.div
                    layout
                    className="rounded-xl border border-slate-200 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleOptional("unica")}
                      className={`flex items-center justify-between w-full p-4 transition-all ${expandedOptional.has("unica") ? "bg-amber-50 border-b border-amber-100" : "bg-slate-50 hover:bg-slate-100"}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${unicaVal > 0 ? "bg-amber-500" : "bg-slate-300"}`} />
                        <span className="font-semibold text-slate-700">
                          Parcela Única Habite-se
                        </span>
                        <span className="text-xs text-slate-400">
                          (mês da entrega)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {unicaVal > 0 && (
                          <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                            Ativo
                          </span>
                        )}
                        {expandedOptional.has("unica") ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </button>
                    <AnimatePresence>
                      {expandedOptional.has("unica") && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="p-4 space-y-3 border-t border-slate-100">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
                              Valor da Parcela Única Habite-se (R$)
                            </label>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={unicaValueInput}
                              onChange={handleCurrencyInput(setUnicaValueInput)}
                              placeholder="Informe o valor (opcional)"
                              className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white transition-all placeholder:text-slate-400 text-right"
                            />
                            <p className="text-xs text-slate-400">
                              Paga no mês da entrega/habite-se ({deliveryLabel}).
                              Compõe a captação da obra.
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}

                {/* If no optional types enabled */}
                {!config.semestrais_habilitado &&
                  !config.anuais_habilitado &&
                  !config.intermediarias_habilitado &&
                  !config.parcela_unica_habilitada &&
                  !config.parcela_unica_data_habilitada && (
                    <p className="text-sm text-slate-400 text-center py-4">
                      Nenhum tipo de parcela opcional habilitado para este
                      empreendimento.
                    </p>
                  )}
              </div>
            </div>

            {/* Card 5: INCC and Final Adjustments */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50">
                <TrendingUp className="w-5 h-5 text-slate-700" />
                <h3 className="font-bold text-slate-800">
                  Ajustes Finais e INCC
                </h3>
              </div>
              <div className="p-6 space-y-5">
                {/* INCC */}
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() =>
                      setInccMode(inccMode === "none" ? "12m" : "none")
                    }
                    className="flex items-center justify-between w-full p-4 rounded-xl border-2 border-slate-100 hover:border-amber-300 transition-all bg-slate-50"
                  >
                    <div className="flex items-center gap-3">
                      <TrendingUp className="w-5 h-5 text-amber-600" />
                      <span className="font-bold text-slate-700">
                        Correção INCC
                      </span>
                    </div>
                    <span
                      className={`text-xs font-bold px-3 py-1 rounded-full ${inccMode !== "none" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-500"}`}
                    >
                      {inccMode !== "none" ? "Ativada" : "Desativada"}
                    </span>
                  </button>

                  {inccMode !== "none" ? (
                    <div className="mt-4 pl-2 space-y-3 border-l-2 border-slate-100 ml-4">
                      <label className="flex items-center gap-3 p-2 cursor-pointer hover:bg-slate-50 rounded-lg">
                        <input
                          type="radio"
                          name="incc"
                          value="none"
                          checked={false}
                          onChange={() => setInccMode("none")}
                          className="w-4 h-4 text-amber-600 focus:ring-amber-500"
                        />
                        <span className="text-sm text-slate-600">
                          Sem correção
                        </span>
                      </label>
                      <label className="flex items-center gap-3 p-2 cursor-pointer hover:bg-slate-50 rounded-lg">
                        <input
                          type="radio"
                          name="incc"
                          value="180m"
                          checked={inccMode === "180m"}
                          onChange={() => setInccMode("180m")}
                          className="w-4 h-4 text-amber-600 focus:ring-amber-500"
                        />
                        <span className="text-sm text-slate-600">
                          Média últimos 180 meses
                          {!inccData.loading
                            ? ` (${inccData.avg180.toFixed(4)}% a.m.)`
                            : " (carregando...)"}
                        </span>
                      </label>
                      <label className="flex items-center gap-3 p-2 cursor-pointer hover:bg-slate-50 rounded-lg">
                        <input
                          type="radio"
                          name="incc"
                          value="12m"
                          checked={inccMode === "12m"}
                          onChange={() => setInccMode("12m")}
                          className="w-4 h-4 text-amber-600 focus:ring-amber-500"
                        />
                        <span className="text-sm text-slate-600">
                          Média últimos 12 meses
                          {!inccData.loading
                            ? ` (${inccData.avg12.toFixed(4)}% a.m.)`
                            : " (carregando...)"}
                        </span>
                      </label>
                      <label className="flex items-center gap-3 p-2 cursor-pointer hover:bg-slate-50 rounded-lg">
                        <input
                          type="radio"
                          name="incc"
                          value="6m"
                          checked={inccMode === "6m"}
                          onChange={() => setInccMode("6m")}
                          className="w-4 h-4 text-amber-600 focus:ring-amber-500"
                        />
                        <span className="text-sm text-slate-600">
                          Média últimos 6 meses
                          {!inccData.loading
                            ? ` (${inccData.avg6.toFixed(4)}% a.m.)`
                            : " (carregando...)"}
                        </span>
                      </label>
                      {inccData.lastUpdate && (
                        <p className="text-xs text-slate-400 pl-8">
                          Atualizado em {inccData.lastUpdate} —{" "}
                          {inccData.isFallback ? "Referência" : "FGV IBRE"}
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>

                {/* Correção Pós-Habite-se — apenas no cenário de financiamento direto.
                    No cenário padrão (bancário) a correção NÃO é calculada;
                    o PDF apenas informa a existência dela. */}
                {modoDireto ? (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() =>
                      setPosMode(posMode === "none" ? "12m" : "none")
                    }
                    className="flex items-center justify-between w-full p-4 rounded-xl border-2 border-slate-100 hover:border-indigo-300 transition-all bg-slate-50"
                  >
                    <div className="flex items-center gap-3">
                      <TrendingUp className="w-5 h-5 text-indigo-600" />
                      <span className="font-bold text-slate-700">
                        Correção Pós-Habite-se
                      </span>
                    </div>
                    <span
                      className={`text-xs font-bold px-3 py-1 rounded-full ${posMode !== "none" ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-500"}`}
                    >
                      {posMode !== "none" ? "Ativada" : "Desativada"}
                    </span>
                  </button>

                  {posMode !== "none" ? (
                    <div className="mt-4 pl-2 space-y-3 border-l-2 border-slate-100 ml-4">
                      <p className="text-xs text-slate-500">
                        Índice definido pelo administrador:{" "}
                        <strong>{posIndexLabel}</strong> + juros de{" "}
                        <strong>{formatJurosPosHabitese(config.juros_pos_habitese)}</strong>{" "}
                        ao mês. Usado para estimar as {clampFinDiretoParcelas(config.fin_direto_parcelas)} parcelas
                        mensais (PRICE) do financiamento direto com a construtora.
                      </p>
                      <label className="flex items-center gap-3 p-2 cursor-pointer hover:bg-slate-50 rounded-lg">
                        <input
                          type="radio"
                          name="pos-indice"
                          value="none"
                          checked={false}
                          onChange={() => setPosMode("none")}
                          className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-slate-600">
                          Sem correção pós-entrega
                        </span>
                      </label>
                      <label className="flex items-center gap-3 p-2 cursor-pointer hover:bg-slate-50 rounded-lg">
                        <input
                          type="radio"
                          name="pos-indice"
                          value="180m"
                          checked={posMode === "180m"}
                          onChange={() => setPosMode("180m")}
                          className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-slate-600">
                          Média últimos 180 meses do {posIndexLabel}
                          {posData.loading
                            ? " (carregando...)"
                            : ` (${formatPctBR(posData.avg180, 4)}% a.m. + juros de ${formatJurosPosHabitese(config.juros_pos_habitese)} = ${formatPctBR(posData.avg180 + posJuros, 4)}% a.m.)`}
                        </span>
                      </label>
                      <label className="flex items-center gap-3 p-2 cursor-pointer hover:bg-slate-50 rounded-lg">
                        <input
                          type="radio"
                          name="pos-indice"
                          value="12m"
                          checked={posMode === "12m"}
                          onChange={() => setPosMode("12m")}
                          className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-slate-600">
                          Média últimos 12 meses do {posIndexLabel}
                          {posData.loading
                            ? " (carregando...)"
                            : ` (${formatPctBR(posData.avg12, 4)}% a.m. + juros de ${formatJurosPosHabitese(config.juros_pos_habitese)} = ${formatPctBR(posData.avg12 + posJuros, 4)}% a.m.)`}
                        </span>
                      </label>
                      <label className="flex items-center gap-3 p-2 cursor-pointer hover:bg-slate-50 rounded-lg">
                        <input
                          type="radio"
                          name="pos-indice"
                          value="6m"
                          checked={posMode === "6m"}
                          onChange={() => setPosMode("6m")}
                          className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-slate-600">
                          Média últimos 6 meses do {posIndexLabel}
                          {posData.loading
                            ? " (carregando...)"
                            : ` (${formatPctBR(posData.avg6, 4)}% a.m. + juros de ${formatJurosPosHabitese(config.juros_pos_habitese)} = ${formatPctBR(posData.avg6 + posJuros, 4)}% a.m.)`}
                        </span>
                      </label>
                      {posData.error ? (
                        <p className="text-xs text-red-500 pl-8">
                          Não foi possível carregar os dados do índice agora.
                        </p>
                      ) : posData.lastUpdate ? (
                        <p className="text-xs text-slate-400 pl-8">
                          Atualizado em {posData.lastUpdate} —{" "}
                          {posData.isFallback
                            ? "Referência"
                            : "Banco Central do Brasil"}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                ) : null}

                <button
                  onClick={clearAll}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-all"
                >
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
                <h4 className="font-bold text-white/90 text-sm uppercase tracking-wider">
                  Resumo do Financiamento
                </h4>
                <span className="text-xs bg-white/10 px-2 py-1 rounded-full">
                  Entrega: {getDeliveryMonthName(deliveryMonth).slice(0, 3)}/{deliveryYear}
                </span>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-white/60 text-xs mb-1">
                    Valor do Imóvel
                  </p>
                  <p className="text-lg font-bold">
                    {formatBRL(propertyValue)}
                  </p>
                </div>
                <div className="pt-4 border-t border-white/10">
                  <p className="text-white/60 text-xs mb-1">
                    Valor com Desconto
                  </p>
                  <p className="text-2xl font-extrabold tracking-tight">
                    {formatBRL(result.finalPropertyValue)}
                  </p>
                </div>
              </div>
              <div className="mt-6">
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-white/80 font-medium">
                    Captação durante obras
                  </span>
                  <span className="text-white font-bold">
                    {result.captationPercent.toFixed(2)}%
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${result.captationPercent >= captacaoTarget ? "bg-emerald-400" : result.captationPercent >= captacaoTarget - 5 ? "bg-amber-400" : "bg-red-400"}`}
                    style={{
                      width: `${Math.min(result.captationPercent, 100)}%`,
                    }}
                  />
                </div>
              </div>

              {inccMode !== "none" && result.inccAccumulatedPercent > 0 && (
                <div className="mt-4 p-3 rounded-xl bg-amber-500/15 border border-amber-500/25">
                  <p className="text-amber-200 text-xs font-semibold uppercase tracking-wider mb-1">
                    Correção INCC
                  </p>
                  <p className="text-white text-sm font-medium">
                    Financiamento projetado:{" "}
                    <span className="font-bold text-amber-200">
                      {formatBRL(result.financingCorrected)}
                    </span>
                  </p>
                  <p className="text-amber-200/70 text-xs mt-0.5">
                    +
                    {formatBRL(
                      result.financingCorrected - result.financingAmount
                    )}{" "}
                    ({result.inccAccumulatedPercent.toFixed(2)}% acumulado)
                  </p>
                </div>
              )}

              {posEstimativaAtiva && result.posBase > 0 && (
                <div className="mt-4 p-3 rounded-xl bg-indigo-500/15 border border-indigo-500/25">
                  <p className="text-indigo-200 text-xs font-semibold uppercase tracking-wider mb-1">
                    Financiamento Construtora (PRICE)
                  </p>
                  <p className="text-white text-sm font-medium">
                    {result.finDiretoParcelas} parcelas de{" "}
                    <span className="font-bold text-indigo-200">
                      {formatBRL(result.posPmt)}
                    </span>
                  </p>
                  <p className="text-indigo-200/70 text-xs mt-0.5">
                    Taxa estimada: {posIndexLabel} + juros = {formatPctBR(posTotalRate)}% a.m. —
                    juros estimados {formatBRL(result.posJurosTotal)} até {result.posFimLabel}
                  </p>
                </div>
              )}
            </div>

            {/* Results Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50">
                <Calculator className="w-5 h-5 text-slate-700" />
                <h3 className="font-bold text-slate-800">
                  Fluxo de Pagamento
                </h3>
              </div>
              <div className="p-4 sm:p-6">
                {/* Mobile card layout */}
                <div className="sm:hidden space-y-3">
                  {resultRows.map((row, i) => (
                    <div
                      key={i}
                      className={`rounded-xl p-4 border ${row.bold ? "bg-emerald-50 border-emerald-200" : row.isIncc ? "bg-amber-50 border-amber-200" : row.isPos ? "bg-indigo-50 border-indigo-200" : row.isDecoracao ? "bg-orange-50 border-orange-200" : "bg-slate-50 border-slate-100"}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`font-medium text-sm ${row.bold ? "text-emerald-900" : row.isIncc ? "text-amber-900" : row.isPos ? "text-indigo-900" : row.isDecoracao ? "text-orange-900" : "text-slate-700"}`}
                        >
                          {row.description}
                        </span>
                        {row.percent != null && (
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${row.bold ? "bg-emerald-200 text-emerald-800" : row.isDecoracao ? "bg-orange-200 text-orange-800" : "bg-slate-200 text-slate-600"}`}
                          >
                            {row.isDecoracao
                              ? "Extra"
                              : `${row.percent.toFixed(2)}%`}
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-lg font-bold block ${row.bold ? "text-emerald-900" : row.isIncc ? "text-amber-900" : row.isPos ? "text-indigo-900" : row.isDecoracao ? "text-orange-900" : "text-slate-900"}`}
                      >
                        {row.value}
                      </span>
                      {row.note && (
                        <span
                          className={`text-xs block mt-1 ${row.isIncc ? "text-amber-600" : row.isPos ? "text-indigo-600" : row.isDecoracao ? "text-orange-600" : "text-slate-400"}`}
                        >
                          {row.note}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden sm:block overflow-hidden rounded-xl border border-slate-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600">
                        <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wider">
                          Etapa
                        </th>
                        <th className="text-right py-3 px-4 font-semibold text-xs uppercase tracking-wider">
                          Valor
                        </th>
                        <th className="text-right py-3 px-4 font-semibold text-xs uppercase tracking-wider">
                          %
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultRows.map((row, i) => (
                        <tr
                          key={i}
                          className={row.bold ? "bg-emerald-50 border-t border-emerald-200" : row.isIncc ? "border-t border-amber-200 bg-amber-50" : row.isPos ? "border-t border-indigo-200 bg-indigo-50" : row.isDecoracao ? "border-t border-orange-200 bg-orange-50" : "border-t border-slate-100"}
                        >
                          <td
                            className={`py-3 px-4 ${row.bold ? "font-bold text-emerald-900" : row.isIncc ? "font-medium text-amber-900" : row.isPos ? "font-medium text-indigo-900" : row.isDecoracao ? "font-medium text-orange-900" : "font-medium text-slate-700"}`}
                          >
                            {row.description}
                            {row.note && (
                              <span
                                className={`block text-xs font-normal mt-0.5 ${row.isIncc ? "text-amber-600" : row.isPos ? "text-indigo-600" : row.isDecoracao ? "text-orange-600" : "text-slate-400"}`}
                              >
                                {row.note}
                              </span>
                            )}
                          </td>
                          <td
                            className={`py-3 px-4 text-right ${row.bold ? "font-bold text-emerald-900" : row.isIncc ? "font-bold text-amber-900" : row.isPos ? "font-bold text-indigo-900" : row.isDecoracao ? "font-bold text-orange-900" : "font-semibold text-slate-900"}`}
                          >
                            {row.value}
                          </td>
                          <td
                            className={`py-3 px-4 text-right ${row.bold ? "font-bold text-emerald-700" : "text-slate-500"}`}
                          >
                            {row.isDecoracao
                              ? "Extra"
                              : row.percent != null
                                ? `${row.percent.toFixed(2)}%`
                                : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Schedule Tabs */}
                {showResults && (
                  <div className="mt-6">
                    <div className="flex flex-wrap gap-1 mb-4 bg-slate-100 p-1.5 rounded-xl">
                      {availableTabs.map((tab) => (
                        <button
                          key={tab.key}
                          onClick={() => setActiveTab(tab.key)}
                          className={`flex-1 min-w-[60px] px-2 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all ${activeTab === tab.key ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Tab content */}
                    <ScheduleTable
                      rows={
                        activeTab === "sinal"
                          ? result.sinalRows
                          : activeTab === "mensal"
                            ? result.monthlyRows
                            : activeTab === "semestral"
                              ? result.semesterRows
                              : activeTab === "anual"
                                ? result.annualRows
                                : activeTab === "intermediarias"
                                  ? result.intermediariasRows
                                  : activeTab === "unicaData"
                                  ? result.unicaDataScheduleRows
                                  : activeTab === "unica"
                                    ? result.unicaScheduleRows
                                    : activeTab === "decoracao"
                                      ? result.decoracaoRows
                                      : []
                      }
                      activeTab={activeTab}
                      result={result}
                      inccMode={inccMode}
                      posMode={posMode}
                      config={config}
                      modoDireto={modoDireto}
                    />
                  </div>
                )}

                {/* PDF Button */}
                {showResults && (
                  <button
                    onClick={generatePDF}
                    className="mt-6 flex items-center justify-center gap-2 w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-colors shadow-md hover:shadow-lg"
                  >
                    <FileDown className="w-5 h-5" /> Gerar PDF da Simulação
                  </button>
                )}
              </div>
            </div>

            {/* Info Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-5 h-5 text-blue-500" />
                <h4 className="font-bold text-slate-800 text-sm">
                  Informações Importantes
                </h4>
              </div>
              <ul className="space-y-2 text-xs text-slate-500 list-disc list-inside">
                <li>Entrega prevista: <strong>{deliveryLabel}</strong></li>
                <li>
                  Saldos devedores corrigidos mensalmente pelo INCC até o
                  habite-se
                </li>
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
            <span>Simulador de Fluxo de Pagamento</span>
            <span className="hidden sm:inline">•</span>
            <span>&copy; {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Schedule Table Sub-component ───
function ScheduleTable({
  rows,
  activeTab,
  result,
  inccMode,
  posMode,
  config,
  modoDireto,
}: {
  rows: InstallmentRow[];
  activeTab: TabKey;
  result: CalculationResult;
  inccMode: string;
  posMode: string;
  config: SimuladorConfig;
  modoDireto: boolean;
}) {
  if (activeTab === "financiamento") {
    return (
      <div className="p-4 space-y-4 bg-slate-50 rounded-xl">
        <div className="p-4 rounded-xl bg-white border border-slate-200">
          <p className="font-bold text-slate-900 text-xl">
            {formatBRL(result.financingAmount)}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            {modoDireto
              ? `Financiamento direto com a construtora (${result.finDiretoParcelas} parcelas após a entrega)`
              : "Saldo para financiamento bancário"}
          </p>
        </div>
        {inccMode !== "none" && result.inccAccumulatedPercent > 0 && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
            <p className="font-bold text-amber-900 text-xl">
              {formatBRL(result.financingCorrected)}
            </p>
            <p className="text-sm text-amber-700 mt-1">
              Estimativa INCC (+{result.inccAccumulatedPercent.toFixed(2)}%)
            </p>
          </div>
        )}
        {modoDireto && posMode !== "none" && result.posTotalRate > 0 && result.posBase > 0 && (
          <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200">
            <p className="font-bold text-indigo-900 text-xl">
              {formatBRL(result.posPmt)}
              <span className="text-sm font-semibold text-indigo-700">
                {' '}/ mês
              </span>
            </p>
            <p className="text-sm text-indigo-700 mt-1">
              Parcela mensal estimada — {result.finDiretoParcelas} parcelas fixas
              (sistema PRICE)
            </p>
            <p className="text-xs text-indigo-600 mt-1">
              {posHabiteseIndexLabel(config.indice_pos_habitese)} + juros de{" "}
              {formatJurosPosHabitese(config.juros_pos_habitese)} ao mês ={" "}
              {formatPctBR(result.posTotalRate)}% a.m. — total estimado{" "}
              {formatBRL(result.posTotalPago)} (juros {formatBRL(result.posJurosTotal)}){" "}
              até {result.posFimLabel}
            </p>
          </div>
        )}
        <div>
          <h5 className="font-semibold text-slate-900 text-sm mb-3">
            Composição do Financiamento:
          </h5>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200">
              <span className="text-sm text-slate-600">
                Parcelas mensais restantes
              </span>
              <span className="text-sm font-semibold text-slate-900">
                {formatBRL(
                  inccMode !== "none" && result.inccAccumulatedPercent > 0
                    ? result.mRemainingCorrected
                    : result.monthlyRemaining
                )}
              </span>
            </div>
            {config.semestrais_habilitado && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200">
                <span className="text-sm text-slate-600">
                  Parcelas semestrais restantes
                </span>
                <span className="text-sm font-semibold text-slate-900">
                  {formatBRL(
                    inccMode !== "none" &&
                      result.inccAccumulatedPercent > 0
                      ? result.sRemainingCorrected
                      : result.semesterRemaining
                  )}
                </span>
              </div>
            )}
            {config.anuais_habilitado && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200">
                <span className="text-sm text-slate-600">
                  Parcelas anuais restantes
                </span>
                <span className="text-sm font-semibold text-slate-900">
                  {formatBRL(
                    inccMode !== "none" &&
                      result.inccAccumulatedPercent > 0
                      ? result.aRemainingCorrected
                      : result.annualRemaining
                  )}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200">
              <span className="text-sm text-slate-600">
                Saldo final do imóvel
              </span>
              <span className="text-sm font-semibold text-slate-900">
                {formatBRL(
                  inccMode !== "none" && result.inccAccumulatedPercent > 0
                    ? result.hBalanceCorrected
                    : result.habiteseBalance
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === "unicaData" && rows.length === 0) {
    return (
      <p className="text-slate-400 text-sm py-4 text-center">
        Nenhuma parcela única informada
      </p>
    );
  }

  if (activeTab === "unica" && rows.length === 0) {
    return (
      <p className="text-slate-400 text-sm py-4 text-center">
        Nenhuma parcela única habite-se informada
      </p>
    );
  }

  if (activeTab === "intermediarias" && rows.length === 0) {
    return (
      <p className="text-slate-400 text-sm py-4 text-center">
        Nenhuma parcela intermediária adicionada
      </p>
    );
  }

  if (activeTab === "semestral" && rows.length === 0) {
    return (
      <p className="text-slate-400 text-sm py-4 text-center">
        Nenhum valor de parcela semestral informado
      </p>
    );
  }

  if (activeTab === "anual" && rows.length === 0) {
    return (
      <p className="text-slate-400 text-sm py-4 text-center">
        Nenhum valor de parcela anual informado
      </p>
    );
  }

  if (activeTab === "decoracao" && rows.length === 0) {
    return (
      <p className="text-slate-400 text-sm py-4 text-center">
        Nenhuma parcela de decoração configurada
      </p>
    );
  }

  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden">
      <div className="max-h-[400px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="border-b border-slate-100">
              <th className="text-left py-2 px-4 text-xs font-semibold text-slate-500 uppercase">
                Parc.
              </th>
              <th className="text-left py-2 px-4 text-xs font-semibold text-slate-500 uppercase">
                Data
              </th>
              <th className="text-right py-2 px-4 text-xs font-semibold text-slate-500 uppercase">
                Valor
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-slate-50 hover:bg-slate-50"
                >
                  <td className="py-2 px-4 font-medium text-slate-700">
                    {row.parcela}
                  </td>
                  <td className="py-2 px-4 text-slate-600">{row.data}</td>
                  <td className="py-2 px-4 text-right font-bold text-slate-900">
                    {row.valor}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={3}
                  className="py-4 text-center text-slate-400"
                >
                  Nenhum dado
                </td>
              </tr>
            )}
          </tbody>
          {activeTab === "unicaData" && rows.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 font-bold border-t border-slate-200">
                <td className="py-2 px-4" colSpan={2}>
                  Total parcela única
                </td>
                <td className="py-2 px-4 text-right">
                  {formatBRL(result.unicaDataValue)}
                </td>
              </tr>
            </tfoot>
          )}
          {activeTab === "unica" && rows.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 font-bold border-t border-slate-200">
                <td className="py-2 px-4" colSpan={2}>
                  Total parcela única habite-se
                </td>
                <td className="py-2 px-4 text-right">
                  {formatBRL(result.unicaValue)}
                </td>
              </tr>
            </tfoot>
          )}
          {activeTab === "decoracao" && rows.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 font-bold border-t border-slate-200">
                <td className="py-2 px-4" colSpan={2}>
                  Total decoração
                </td>
                <td className="py-2 px-4 text-right">
                  {formatBRL(result.decoracaoPaid)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ─── Page Export with Suspense ───
export default function SimuladorGenericoPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-center">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4 animate-pulse" />
            <p className="text-slate-400 font-medium">
              Carregando simulador...
            </p>
          </div>
        </div>
      }
    >
      <SimulatorContent />
    </Suspense>
  );
}
