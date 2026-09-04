/**
 * batch-units.ts
 *
 * Núcleo compartilhado da atualização de status em lote (rota PATCH /units/batch).
 *
 * Objetivo: substituir N requisições PATCH paralelas do cliente por UMA
 * requisição, aplicando os mesmos guards do PATCH individual (auth → papel →
 * acesso do coordenador → validação de status) apenas uma vez, e devolvendo
 * feedback por unidade (falhas parciais) em vez de falhar silenciosamente.
 *
 * Contrato do corpo:
 *   { status: "disponivel" | "reservado" | "vendido", unidades: [...] }
 *
 * `unidades` usa identificadores de negócio (os mesmos do PATCH individual),
 * pois as tabelas legacy são chaveadas por nome, não por id:
 *   - units / moment_units / projeto_units: { unidade }
 *   - villa_bianco_units: { bloco, unidade }
 *   - vitta_units: { bloco, unidade, andar }
 *
 * Algoritmo (2 passos, O(chunks) queries em vez de O(N) requisições HTTP):
 *   1. SELECT resolve colunas-chave das linhas candidatas (.in unidade),
 *      scoping por empreendimento quando aplicável;
 *   2. casamento exato identificador → linha (função pura matchBatchTargets),
 *      seguido de um UPDATE .in(id, ...) com RETURNING — linhas pedidas mas
 *      ausentes do RETURNING viram falha "nao_atualizada".
 *
 * A resposta sempre traz { total, updated, failed } — 200 mesmo quando tudo
 * falha por unidade inexistente, pois a requisição em si era válida.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { coordenadorHasAccess, isCoordenadorWithAnyEmpreendimento } from "@/lib/coordinator-access";
import { trackUnitStatusChange } from "@/lib/analytics";

export const BATCH_VALID_STATUSES = ["disponivel", "reservado", "vendido"] as const;
export const BATCH_MAX_UNITS = 1000;

// Tamanhos de chunk para manter as URLs do PostgREST (.in) abaixo de limites
// práticos de gateway (ids UUID são longos; valores de unidade são curtos).
const RESOLVE_CHUNK = 200;
const UPDATE_CHUNK = 100;
const ANALYTICS_CHUNK = 50;

export type BatchUnitIdentifier = {
  unidade: string | number;
  bloco?: string | number;
  andar?: string | number;
};

export type BatchFailureMotivo = "nao_encontrada" | "ambigua" | "nao_atualizada";

export type BatchFailure = {
  unidade: string;
  bloco: string | null;
  andar: string | null;
  motivo: BatchFailureMotivo;
};

export type BatchRow = Record<string, unknown>;

export type BatchApplyResult = {
  /** Número de identificadores deduplicados recebidos. */
  total: number;
  /** Linhas efetivamente atualizadas (RETURNING do UPDATE). */
  updated: BatchRow[];
  /** Identificadores não atualizados, com motivo por unidade. */
  failed: BatchFailure[];
};

export type BatchAuthContext = { ok: true; userId: string; role: string };

export type BatchAuthDenied = { ok: false; status: number; message: string };

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function toFailure(ident: BatchUnitIdentifier, motivo: BatchFailureMotivo): BatchFailure {
  return {
    unidade: String(ident.unidade),
    bloco: ident.bloco !== undefined ? String(ident.bloco) : null,
    andar: ident.andar !== undefined ? String(ident.andar) : null,
    motivo,
  };
}

/**
 * Valida e normaliza o corpo da requisição em lote.
 * Campos extras por item (ex.: andar em tabelas sem andar) são ignorados —
 * o casamento só usa o que a tabela possui.
 */
export function parseBatchRequestBody(
  body: unknown
): { ok: true; status: string; unidades: BatchUnitIdentifier[] } | { ok: false; message: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "Corpo da requisição inválido" };
  }
  const { status, unidades } = body as Record<string, unknown>;

  if (typeof status !== "string" || !(BATCH_VALID_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, message: `Status inválido. Valores: ${BATCH_VALID_STATUSES.join(", ")}` };
  }
  if (!Array.isArray(unidades) || unidades.length === 0) {
    return { ok: false, message: "Campo 'unidades' deve ser um array não vazio" };
  }
  if (unidades.length > BATCH_MAX_UNITS) {
    return { ok: false, message: `Limite de ${BATCH_MAX_UNITS} unidades por requisição excedido` };
  }

  const normalized: BatchUnitIdentifier[] = [];
  for (const item of unidades) {
    if (typeof item !== "object" || item === null) {
      return { ok: false, message: "Identificador de unidade inválido" };
    }
    const { unidade, bloco, andar } = item as Record<string, unknown>;
    if (unidade === undefined || unidade === null || unidade === "") {
      return { ok: false, message: "Cada unidade deve informar o campo 'unidade'" };
    }
    if (typeof unidade !== "string" && typeof unidade !== "number") {
      return { ok: false, message: "Campo 'unidade' deve ser string ou número" };
    }
    const ident: BatchUnitIdentifier = { unidade };
    if (bloco !== undefined && bloco !== null && bloco !== "") {
      if (typeof bloco !== "string" && typeof bloco !== "number") {
        return { ok: false, message: "Campo 'bloco' deve ser string ou número" };
      }
      ident.bloco = bloco;
    }
    if (andar !== undefined && andar !== null && andar !== "") {
      if (typeof andar !== "string" && typeof andar !== "number") {
        return { ok: false, message: "Campo 'andar' deve ser string ou número" };
      }
      ident.andar = andar;
    }
    normalized.push(ident);
  }

  return { ok: true, status, unidades: normalized };
}

/**
 * Casamento puro identificador → linha candidata (mesma semântica do PATCH
 * individual, que usa .single(): 1 casamento exato; 0 = não encontrada;
 * >1 = ambígua). Filtros compostos (bloco/andar) só se aplicam quando o
 * identificador os informa. Tolerância: se o filtro composto não casou nada
 * mas existe exatamente UMA linha com aquela unidade, assume-a (protege
 * contra divergência de formatação de bloco/andar entre cliente e banco).
 */
export function matchBatchTargets(
  rows: BatchRow[],
  unidades: BatchUnitIdentifier[]
): { matches: Map<number, BatchRow>; failures: BatchFailure[] } {
  const byUnidade = new Map<string, BatchRow[]>();
  for (const row of rows) {
    const key = String(row.unidade);
    const list = byUnidade.get(key);
    if (list) list.push(row);
    else byUnidade.set(key, [row]);
  }

  const matches = new Map<number, BatchRow>();
  const failures: BatchFailure[] = [];

  unidades.forEach((ident, index) => {
    const base = byUnidade.get(String(ident.unidade)) ?? [];
    let pool = base;
    let filtered = false;
    if (ident.bloco !== undefined) {
      pool = pool.filter((r) => String(r.bloco) === String(ident.bloco));
      filtered = true;
    }
    if (ident.andar !== undefined) {
      pool = pool.filter((r) => String(r.andar) === String(ident.andar));
      filtered = true;
    }
    if (pool.length === 0 && filtered && base.length === 1) pool = base;

    if (pool.length === 1) matches.set(index, pool[0]);
    else if (pool.length === 0) failures.push(toFailure(ident, "nao_encontrada"));
    else failures.push(toFailure(ident, "ambigua"));
  });

  return { matches, failures };
}

/**
 * Mesmos guards do PATCH individual, executados uma vez para o lote inteiro.
 * - Sem `empreendimentoId`: admin_sistema sempre; coordenador precisa de ao
 *   menos um empreendimento atribuído (tabelas legacy sem escopo granular).
 * - Com `empreendimentoId`: coordenador precisa daquele empreendimento
 *   atribuído (projeto_units / dashboard dinâmico).
 * Fail-closed: qualquer falha na verificação nega acesso.
 */
export async function authorizeBatchWriter(
  supabase: SupabaseClient,
  empreendimentoId?: string
): Promise<BatchAuthContext | BatchAuthDenied> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { ok: false, status: 401, message: "Não autenticado" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (profile as Record<string, unknown> | null)?.role as string | null;

  if (role === "admin_sistema") {
    return { ok: true, userId: user.id, role };
  }

  if (role === "coordenador") {
    const allowed = empreendimentoId
      ? await coordenadorHasAccess(user.id, empreendimentoId)
      : await isCoordenadorWithAnyEmpreendimento(user.id);
    if (allowed) return { ok: true, userId: user.id, role };
  }

  return {
    ok: false,
    status: 403,
    message: empreendimentoId ? "Sem permissão para este empreendimento" : "Não autorizado",
  };
}

export type BatchApplyArgs = {
  supabase: SupabaseClient;
  table: string;
  status: string;
  unidades: BatchUnitIdentifier[];
  /** Colunas necessárias para o casamento, ex.: "id, status, unidade, bloco". */
  resolveColumns: string;
  /** Colunas retornadas no RETURNING do UPDATE (padrão: "*"). */
  selectColumns?: string;
  /** Escopo extra obrigatório (empreendimento_id) para projeto_units. */
  scopeEmpreendimentoId?: string;
  /** Valor gravado em unit_status_history.empreendimento_id. */
  empreendimentoRef: string;
  changedBy: string;
  changedByRole: string;
};

/**
 * Executa a atualização em lote de fato (auth já feita via authorizeBatchWriter).
 * Nunca lança: falhas de infra viram { ok: false, message }.
 */
export async function applyBatchStatusUpdate(
  args: BatchApplyArgs
): Promise<{ ok: true; result: BatchApplyResult } | { ok: false; message: string }> {
  const {
    supabase,
    table,
    status,
    unidades,
    resolveColumns,
    selectColumns = "*",
    scopeEmpreendimentoId,
    empreendimentoRef,
    changedBy,
    changedByRole,
  } = args;

  // Cliente com generics "any" — tabela é dinâmica (5 tabelas de units).
  const db = supabase as SupabaseClient;

  // 1. Deduplicação preservando ordem (mesmo identificador repetido conta 1x).
  const seen = new Set<string>();
  const deduped: BatchUnitIdentifier[] = [];
  for (const ident of unidades) {
    const key = `${ident.bloco ?? ""}|${String(ident.unidade)}|${ident.andar ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(ident);
    }
  }

  // 2. Resolve candidatos (colunas-chave) — mesmo filtro de leitura do PATCH individual.
  const unidadeValues = [...new Set(deduped.map((u) => String(u.unidade)))];
  const rows: BatchRow[] = [];
  try {
    for (const values of chunk(unidadeValues, RESOLVE_CHUNK)) {
      let query = db.from(table).select(resolveColumns);
      if (scopeEmpreendimentoId) query = query.eq("empreendimento_id", scopeEmpreendimentoId);
      query = query.in("unidade", values);
      const { data, error } = await query;
      if (error) {
        console.error(`[batch-units] Erro ao resolver candidatos (${table}):`, error.message);
        return { ok: false, message: "Erro ao localizar unidades" };
      }
      if (data) rows.push(...(data as unknown as BatchRow[]));
    }
  } catch (err) {
    console.error(`[batch-units] Exceção ao resolver candidatos (${table}):`, err);
    return { ok: false, message: "Erro ao localizar unidades" };
  }

  // 3. Casamento exato identificador → linha.
  const { matches, failures } = matchBatchTargets(rows, deduped);
  const matchedIds = [...new Set([...matches.values()].map((r) => String(r.id)))];

  // 4. UPDATE por chunks com RETURNING (disjuntos → paralelo seguro).
  const updated: BatchRow[] = [];
  if (matchedIds.length > 0) {
    const results = await Promise.all(
      chunk(matchedIds, UPDATE_CHUNK).map(async (ids) => {
        try {
          // Escopo primeiro, filtro de ids por último, RETURNING no fim —
          // encadeamento em expressão única (builder de update não reassina).
          const chain = scopeEmpreendimentoId
            ? db
                .from(table)
                .update({ status })
                .eq("empreendimento_id", scopeEmpreendimentoId)
                .in("id", ids)
                .select(selectColumns)
            : db.from(table).update({ status }).in("id", ids).select(selectColumns);
          const { data, error } = await chain;
          if (error) {
            console.error(`[batch-units] Erro no update (${table}):`, error.message);
            return null;
          }
          return ((data ?? []) as unknown) as BatchRow[];
        } catch (err) {
          console.error(`[batch-units] Exceção no update (${table}):`, err);
          return null;
        }
      })
    );
    for (const part of results) {
      if (part) updated.push(...part);
    }
  }

  // 5. Casadas mas ausentes do RETURNING (ex.: deletada no meio do voo, erro de chunk).
  const updatedIds = new Set(updated.map((r) => String(r.id)));
  for (const [index, row] of matches) {
    if (!updatedIds.has(String(row.id))) {
      failures.push(toFailure(deduped[index], "nao_atualizada"));
    }
  }

  // 6. Histórico por unidade (mesma granularidade do PATCH individual),
  //    com statusAnterior capturado no passo 2. Await em chunks para garantir
  //    o registro sem explodir o pool de conexões.
  const oldStatusById = new Map(rows.map((r) => [String(r.id), (r.status as string) ?? null]));
  try {
    for (const group of chunk(updated, ANALYTICS_CHUNK)) {
      await Promise.all(
        group.map((row) =>
          trackUnitStatusChange({
            unitId: String(row.id),
            empreendimentoId: empreendimentoRef,
            unidade: String(row.unidade ?? ""),
            bloco: row.bloco === undefined || row.bloco === null ? "" : String(row.bloco),
            statusAnterior: oldStatusById.get(String(row.id)) ?? null,
            statusNovo: status,
            changedBy,
            changedByRole,
          })
        )
      );
    }
  } catch {
    // trackUnitStatusChange já engole erros internamente; nunca quebra a resposta.
  }

  return { ok: true, result: { total: deduped.length, updated, failed: failures } };
}
