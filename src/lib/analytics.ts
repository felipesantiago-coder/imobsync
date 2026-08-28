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
    await admin.from("unit_status_history").insert({
      unit_id: params.unitId ?? null,
      empreendimento_id: params.empreendimentoId,
      unidade: params.unidade,
      bloco: params.bloco,
      status_anterior: params.statusAnterior,
      status_novo: params.statusNovo,
      changed_by: params.changedBy,
      changed_by_role: params.changedByRole,
    });
  } catch (err) {
    console.warn("[Analytics] trackUnitStatusChange falhou:", err);
  }
}