import { createAdminClient } from "@/lib/supabase/admin";

export type AnalyticsEvent = {
  event_type: string;
  resource_type?: string;
  resource_id?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Registra um evento de analytics no banco (server-side).
 * Usa admin client (service_role) para bypass RLS.
 * Chamado de dentro de API routes — o await não adiciona latência perceptível
 * pois a rota principal já está processando.
 */
export async function trackEvent(
  userId: string | null | undefined,
  role: string,
  event: AnalyticsEvent,
  ipAddress?: string
) {
  if (!userId) return;
  try {
    const admin = createAdminClient();
    await admin.from("analytics_events").insert({
      user_id: userId,
      role,
      event_type: event.event_type,
      resource_type: event.resource_type ?? null,
      resource_id: event.resource_id ?? null,
      metadata: event.metadata ?? {},
      ip_address: ipAddress ?? null,
    });
  } catch (err) {
    // Falha de tracking nunca deve quebrar o fluxo principal
    console.warn("[Analytics] trackEvent falhou:", err);
  }
}

/**
 * Registra mudança de status de unidade no histórico.
 * Usa admin client (service_role) para bypass RLS.
 */
export async function trackUnitStatusChange(params: {
  unitId?: string | null;
  empreendimentoId: string;
  unidade: string;
  bloco: string;
  statusAnterior: string | null;
  statusNovo: string;
  changedBy: string;
  changedByRole: string;
}) {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("unit_status_history").insert({
      unit_id: params.unitId ?? null,
      empreendimento_id: params.empreendimentoId,
      unidade: params.unidade,
      bloco: params.bloco,
      status_anterior: params.statusAnterior,
      status_novo: params.statusNovo,
      changed_by: params.changedBy,
      changed_by_role: params.changedByRole,
    });
    // Erros retornados pelo SDK também precisam de tratamento (não só exceções).
    if (error) {
      console.warn("[Analytics] trackUnitStatusChange falhou:", error.message);
    }
  } catch (err) {
    console.warn("[Analytics] trackUnitStatusChange falhou:", err);
  }
}

// ── Histórico em lote ─────────────────────────────────────────

export type UnitStatusHistoryInsert = {
  unit_id: string | null;
  empreendimento_id: string;
  unidade: string;
  bloco: string;
  status_anterior: string | null;
  status_novo: string;
  changed_by: string;
  changed_by_role: string;
};

/** Tamanho de chunk do insert em massa: 100 linhas por requisição. */
export const HISTORY_INSERT_CHUNK = 100;

/** Agrupa linhas em chunks de tamanho limitado (puro, testável). */
export function chunkForInsert<T>(rows: T[], size: number = HISTORY_INSERT_CHUNK): T[][] {
  const safeSize = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += safeSize) out.push(rows.slice(i, i + safeSize));
  return out;
}

/**
 * Persiste o histórico de mudança de status em LOTE: um cliente admin por
 * chamada e inserts de arrays em chunks sequenciais de até
 * HISTORY_INSERT_CHUNK linhas (substitui 1 insert por unidade; para 500
 * unidades são 5 requisições em vez de 500).
 *
 * Mantém a granularidade do PATCH individual: UMA linha de histórico por
 * unidade realmente atualizada, com autor, papel, empreendimento e status
 * anterior/novo. Nunca gera registro para unidade que falhou no update.
 *
 * Trata tanto exceções quanto erros retornados pelo SDK; reporta o número de
 * requisições de insert que falharam sem interromper o restante. Nunca lança —
 * falha de histórico não deve quebrar a resposta do update que já ocorreu.
 */
export async function trackUnitStatusChanges(
  rows: UnitStatusHistoryInsert[]
): Promise<{ attempted: number; chunks: number; failedChunks: number }> {
  if (rows.length === 0) return { attempted: 0, chunks: 0, failedChunks: 0 };

  const chunks = chunkForInsert(rows);
  let failedChunks = 0;

  const admin = createAdminClient();
  for (const group of chunks) {
    try {
      const { error } = await admin.from("unit_status_history").insert(group);
      if (error) {
        failedChunks += 1;
        console.error(
          `[Analytics] trackUnitStatusChanges: chunk com ${group.length} linha(s) falhou:`,
          error.message
        );
      }
    } catch (err) {
      failedChunks += 1;
      console.error("[Analytics] trackUnitStatusChanges: exceção em chunk:", err);
    }
  }

  return { attempted: rows.length, chunks: chunks.length, failedChunks };
}