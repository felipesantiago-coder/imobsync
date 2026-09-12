/**
 * Limite das parcelas mensais do simulador genérico.
 *
 * O administrador escolhe, por empreendimento, até quando as parcelas
 * mensais durante a obra são geradas:
 *
 * - parcelas_ate_entrega = false (padrão): as parcelas vão até o MÊS
 *   ANTERIOR ao mês de entrega — comportamento histórico do simulador.
 * - parcelas_ate_entrega = true: as parcelas vão até o PRÓPRIO MÊS DE
 *   ENTREGA (inclusive) — a última parcela mensal cai no mês do habite-se.
 *
 * A escolha vale para o simulador padrão (financiamento bancário) e para o
 * simulador de financiamento direto com a construtora, pois ambos derivam o
 * cronograma mensal (e os limites de semestrais/anuais) do mesmo mês-limite.
 *
 * Função pura e tolerante a entrada suja: os campos numeric do Supabase podem
 * chegar como string, e configs antigas podem trazer o campo ausente
 * (undefined) — nesse caso vale o default (false = mês anterior).
 */

/** Mês-limite das parcelas mensais: último mês em que há parcela a pagar. */
export function limiteParcelasMensais(
  entregaMes: unknown,
  entregaAno: unknown,
  parcelasAteEntrega: unknown
): { month: number; year: number } {
  const mes = Math.round(Number(entregaMes));
  const ano = Math.round(Number(entregaAno));

  if (!Number.isFinite(mes) || mes < 1 || mes > 12 || !Number.isFinite(ano)) {
    // Entrada inválida: não há como ancorar o limite na entrega — devolve
    // o próprio mês informado (ou Janeiro) para não estourar o cronograma.
    return { month: 1, year: Number.isFinite(ano) ? ano : 0 };
  }

  // Opção do administrador ativa: parcelas vão ATÉ o mês de entrega (inclusive).
  if (parcelasAteEntrega === true) {
    return { month: mes, year: ano };
  }

  // Padrão: parcelas vão até o mês ANTERIOR à entrega (Janeiro recua um ano).
  return mes === 1 ? { month: 12, year: ano - 1 } : { month: mes - 1, year: ano };
}

/** Descrição curta do limite (sem a data): para compor textos de UI e PDF. */
export function limiteParcelasMensaisFrase(parcelasAteEntrega: unknown): string {
  return parcelasAteEntrega === true
    ? "o mês da entrega"
    : "o mês anterior à entrega";
}
