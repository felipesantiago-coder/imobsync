/**
 * projeto-units.ts
 *
 * Tipo e mapper puros para linhas da tabela `projeto_units` (dashboard dinâmico
 * de empreendimentos). Extraído do componente client para permitir:
 *  - reuso idêntico entre o fetch da API e os dados iniciais server-side
 *    (audit P1.4 — mesma transformação dos dois lados);
 *  - testes de caracterização sem importar React/framer-motion.
 */

export interface ProjetoUnit {
  id: string;
  empreendimento_id: string;
  andar: number | null;
  unidade: string;
  vagas: number | null;
  area: number | null;
  area_str: string;
  quartos: number | null;
  valor_venda: number | null;
  status: string;
  posicao_solar: string;
  tipologia: string;
  bloco: string;
  is_cobertura: boolean;
  is_garden: boolean;
  ordem: number;
}

/**
 * Transforma uma linha bruta do PostgREST (`select("*")` em
 * `projeto_units`) no formato consumido pelo dashboard dinâmico.
 * Porta exata do mapeamento inline anterior — não alterar valores padrão.
 */
export function mapProjetoUnitRow(
  row: Record<string, unknown>,
  fallbackEmpreendimentoId: string
): ProjetoUnit {
  return {
    id: row.id as string,
    empreendimento_id: (row.empreendimento_id as string) || fallbackEmpreendimentoId,
    andar: (row.andar as number) ?? null,
    unidade: String(row.unidade ?? ""),
    vagas: (row.vagas as number) ?? null,
    area: (row.area as number) ?? null,
    area_str: (row.area_str as string) || "",
    quartos: (row.quartos as number) ?? null,
    valor_venda: row.valor_venda as number | null,
    status: (row.status as string) || "disponivel",
    posicao_solar: (row.posicao_solar as string) || "",
    tipologia: (row.tipologia as string) || "",
    bloco: (row.bloco as string) || "",
    is_cobertura: (row.is_cobertura as boolean) || false,
    is_garden: (row.is_garden as boolean) || false,
    ordem: (row.ordem as number) ?? 0,
  };
}
