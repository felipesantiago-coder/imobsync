/**
 * Helpers puros para janelas de tempo e projeções de uso.
 *
 * Convenção de fuso: UTC explícito, consistente com o agendamento do cron
 * (23:55 UTC) e com os timestamps ISO (timestamptz) do Supabase.
 *
 * Regra dos intervalos: início inclusivo (`gte`), fim exclusivo (`lt`).
 * Assim o dia "2026-09-11" cobre [00:00:00.000Z, 2026-09-12T00:00:00.000Z).
 */

export interface TimeWindow {
  /** ISO 8601 — início inclusivo (usar com .gte) */
  gte: string;
  /** ISO 8601 — fim exclusivo (usar com .lt) */
  lt: string;
}

/** Janela do dia UTC `dateStr` ("YYYY-MM-DD"): [00:00Z, 00:00Z do dia seguinte). */
export function utcDayWindow(dateStr: string): TimeWindow {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`Data inválida para janela diária: "${dateStr}"`);
  }
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) {
    throw new Error(`Data inválida para janela diária: "${dateStr}"`);
  }
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { gte: start.toISOString(), lt: end.toISOString() };
}

/** Data UTC de hoje no formato "YYYY-MM-DD". */
export function utcTodayStr(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Início do mês UTC da data `now` (instant ISO) — inclusivo. */
export function utcMonthStartIso(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return new Date(Date.UTC(y, m, 1, 0, 0, 0, 0)).toISOString();
}

/** Número real de dias do mês UTC de `now`. */
export function daysInUtcMonth(now: Date = new Date()): number {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

/** Dia corrente do mês UTC (1..31). */
export function utcDayOfMonth(now: Date = new Date()): number {
  return now.getUTCDate();
}

/**
 * Projeção mensal a partir do acumulado até agora.
 * A janela do mês já inclui o dia corrente — NÃO somar o dia novamente.
 * Fator: (acumulado / diaCorrente) × diasReaisDoMês.
 */
export function projectMonthlyFromMtd(
  monthToDate: number,
  dayOfMonth: number,
  daysInMonth: number
): number {
  if (!Number.isFinite(monthToDate) || monthToDate < 0) return 0;
  const day = Math.max(1, Math.floor(dayOfMonth));
  const total = Math.max(day, Math.floor(daysInMonth));
  return Math.round((monthToDate / day) * total);
}
