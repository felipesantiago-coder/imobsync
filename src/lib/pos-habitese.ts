/**
 * Correção do saldo devedor pós-habite-se (simulador genérico).
 *
 * Regra comercial:
 * - Durante as obras (até o habite-se): correção mensal sempre pelo INCC.
 * - Após a emissão do habite-se: correção pelo índice escolhido pelo
 *   administrador (IGPM ou IPCA) mais taxa de juros mensal informada
 *   (ex.: "IGPM + juros de 1,00% ao mês", "IPCA + juros de 0,80% ao mês").
 *
 * Funções puras e tolerantes a entrada suja: o valor numérico do juros pode
 * chegar como number ou string (coluna numeric do Supabase vem como string),
 * e o índice pode vir indefinido em configs antigas (default IGPM).
 */

export type PosHabiteseIndice = "igpm" | "ipca";

const POS_HABITESE_INDICES: readonly PosHabiteseIndice[] = ["igpm", "ipca"];

const INDEX_LABELS: Record<PosHabiteseIndice, string> = {
  igpm: "IGPM",
  ipca: "IPCA",
};

/** Normaliza o índice recebido (string/undefined) para 'igpm' | 'ipca'. */
export function normalizePosHabiteseIndice(value: unknown): PosHabiteseIndice {
  return value === "ipca" ? "ipca" : "igpm";
}

/** Lista dos índices suportados (para montar o select do painel admin). */
export function posHabiteseIndiceOptions(): readonly PosHabiteseIndice[] {
  return POS_HABITESE_INDICES;
}

/** Taxa de juros mensal padrão (%) quando ausente/inválida — alinhada ao default da migration. */
export const JUROS_POS_HABITESE_DEFAULT = 1;

/**
 * Converte e limita a taxa de juros mensal (%) para 0..20.
 * Aceita number ou string numérica; ausente/inválido/negativo volta ao
 * padrão 1% (mesmo default do banco e do texto histórico do PDF).
 */
export function clampJurosPosHabitese(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : parseFloat(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return JUROS_POS_HABITESE_DEFAULT;
  return Math.min(parsed, 20);
}

/** Rótulo curto do índice: "IGPM" | "IPCA". */
export function posHabiteseIndexLabel(value: unknown): string {
  return INDEX_LABELS[normalizePosHabiteseIndice(value)];
}

/** Taxa formatada em pt-BR: 1 -> "1,00%", 0.8 -> "0,80%". */
export function formatJurosPosHabitese(value: unknown): string {
  return `${clampJurosPosHabitese(value).toFixed(2).replace(".", ",")}%`;
}

/** Rótulo completo da correção pós-habite-se: "IGPM + juros de 1,00% ao mês". */
export function posHabiteseFullLabel(indice: unknown, juros: unknown): string {
  return `${posHabiteseIndexLabel(indice)} + juros de ${formatJurosPosHabitese(juros)} ao mês`;
}
