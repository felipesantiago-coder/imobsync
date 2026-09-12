/**
 * Financiamento Direto com a Construtora (pós-obra) — sistema PRICE.
 *
 * Cenário alternativo do simulador genérico: em vez de financiamento bancário
 * após a entrega, a construtora financia o saldo remanescente em N parcelas
 * mensais fixas (PRICE). A taxa mensal estimada = média histórica do índice
 * configurado (IGPM/IPCA, escolhida pelo usuário) + juros pós-habite-se do
 * administrador. Funções PURAS — sem dependências — para testabilidade.
 */

export const FIN_DIRETO_MAX_PARCELAS = 360;
export const FIN_DIRETO_DEFAULT_PARCELAS = 120;
export const FIN_DIRETO_DEFAULT_CAPTACAO_PCT = 40;

/**
 * Nº de parcelas pós-entrega, normalizado (1..360).
 * Valores inválidos/ausentes voltam ao default (120).
 */
export function clampFinDiretoParcelas(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v < 1) return FIN_DIRETO_DEFAULT_PARCELAS;
  return Math.min(FIN_DIRETO_MAX_PARCELAS, v);
}

/**
 * Meta de captação (%) do cenário direto, normalizada (0..100).
 * Valores inválidos/ausentes voltam ao default (40).
 */
export function clampCaptacaoPct(n: unknown): number {
  if (n === null || n === undefined || n === "") {
    return FIN_DIRETO_DEFAULT_CAPTACAO_PCT;
  }
  const v = Number(n);
  if (!Number.isFinite(v)) return FIN_DIRETO_DEFAULT_CAPTACAO_PCT;
  return Math.min(100, Math.max(0, v));
}

/**
 * Parcela mensal fixa do sistema PRICE.
 *
 * PMT = PV · i / (1 − (1+i)^−n)
 *
 * - taxa 0% (após clamp de sanidade) degenere para PV/n (divida sem juros);
 * - PV <= 0, n < 1 ou taxa inválida retornam 0 (sem estimativa).
 */
export function pricePmt(
  pv: number,
  monthlyRatePct: number,
  n: number
): number {
  if (!Number.isFinite(pv) || pv <= 0) return 0;
  if (!Number.isFinite(n) || n < 1) return 0;
  const i = monthlyRatePct / 100;
  if (!Number.isFinite(i) || i < 0) return 0;
  if (i === 0) return pv / n;
  const denominator = 1 - Math.pow(1 + i, -n);
  if (denominator <= 0) return 0;
  return (pv * i) / denominator;
}

export interface PriceTotals {
  /** Parcela mensal fixa estimada. */
  pmt: number;
  /** Total estimado pago (PMT × n). */
  total: number;
  /** Total de juros estimados (total − PV). */
  juros: number;
}

/** Parcela + totais estimados do parcelamento PRICE. */
export function priceTotals(
  pv: number,
  monthlyRatePct: number,
  n: number
): PriceTotals {
  const pmt = pricePmt(pv, monthlyRatePct, n);
  const total = pmt * n;
  return { pmt, total, juros: total - pv };
}
