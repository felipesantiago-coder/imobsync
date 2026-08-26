import { createClient } from "@/lib/supabase/server";

export type AnalyticsEvent = {
  event_type: string;
  resource_type?: string;
  resource_id?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Registra um evento de analytics no banco (server-side, fire-and-forget).
 * Não bloqueia a resposta da requisição principal.
 */
export async function trackEvent(
  userId: string | null | undefined,
  role: string,
  event: AnalyticsEvent,
  ipAddress?: string
) {
  if (!userId) return;
  try {
    const supabase = await createClient();
    await supabase.from("analytics_events").insert({
      user_id: userId,
      role,
      event_type: event.event_type,
      resource_type: event.resource_type ?? null,
      resource_id: event.resource_id ?? null,
      metadata: event.metadata ?? {},
      ip_address: ipAddress ?? null,
    });
  } catch {
    // Fire-and-forget: falha de tracking nunca deve quebrar o fluxo principal
  }
}

/**
 * Registra mudança de status de unidade no histórico.
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
    const supabase = await createClient();
    await supabase.from("unit_status_history").insert({
      unit_id: params.unitId ?? null,
      empreendimento_id: params.empreendimentoId,
      unidade: params.unidade,
      bloco: params.bloco,
      status_anterior: params.statusAnterior,
      status_novo: params.statusNovo,
      changed_by: params.changedBy,
      changed_by_role: params.changedByRole,
    });
  } catch {
    // Fire-and-forget
  }
}