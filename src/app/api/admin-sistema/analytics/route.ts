import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminSistema } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const isAllowed = await requireAdminSistema();
  if (!isAllowed) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") || "30");
  const role = searchParams.get("role") || null;
  const eventType = searchParams.get("event_type") || null;

  const since = new Date();
  since.setDate(since.getDate() - days);

  // 1. Eventos filtrados
  let eventQuery = supabase
    .from("analytics_events")
    .select("*")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false });

  if (role) eventQuery = eventQuery.eq("role", role);
  if (eventType) eventQuery = eventQuery.eq("event_type", eventType);

  const { data: events } = await eventQuery;

  // 2. Eventos por dia
  const { data: dailyData } = await supabase
    .from("analytics_events")
    .select("created_at")
    .gte("created_at", since.toISOString());

  const dailyMap = new Map<string, number>();
  for (let i = days; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dailyMap.set(key, 0);
  }
  if (dailyData) {
    for (const ev of dailyData) {
      const key = ev.created_at.slice(0, 10);
      dailyMap.set(key, (dailyMap.get(key) || 0) + 1);
    }
  }
  const daily = Array.from(dailyMap.entries()).map(([date, count]) => ({
    date,
    count,
  }));

  // 3. Eventos por tipo
  const typeCount = new Map<string, number>();
  if (events) {
    for (const ev of events) {
      typeCount.set(ev.event_type, (typeCount.get(ev.event_type) || 0) + 1);
    }
  }
  const byType = Array.from(typeCount.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  // 4. Uso por empreendimento
  const empCount = new Map<string, number>();
  if (events) {
    for (const ev of events) {
      const meta = ev.metadata as Record<string, unknown> | null;
      const emp = meta?.empreendimento as string | undefined;
      if (emp) {
        empCount.set(emp, (empCount.get(emp) || 0) + 1);
      }
    }
  }
  const byEmpreendimento = Array.from(empCount.entries())
    .map(([empreendimento, count]) => ({ empreendimento, count }))
    .sort((a, b) => b.count - a.count);

  // 5. Top usuários ativos
  const userCount = new Map<string, { email: string; role: string; count: number }>();
  if (events) {
    const userIds = [...new Set(events.map((e) => e.user_id).filter(Boolean))] as string[];
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("id, email, display_name, role").in("id", userIds)
      : { data: [] };
    const profileMap = new Map<string, { email: string; role: string }>();
    if (profiles) {
      for (const p of profiles) {
        profileMap.set(p.id, { email: p.display_name || p.email, role: p.role });
      }
    }
    for (const ev of events) {
      if (!ev.user_id) continue;
      const existing = userCount.get(ev.user_id);
      const profile = profileMap.get(ev.user_id);
      if (existing) {
        existing.count++;
      } else if (profile) {
        userCount.set(ev.user_id, { ...profile, count: 1 });
      }
    }
  }
  const topUsers = Array.from(userCount.entries())
    .map(([, info]) => info)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // 6. Últimos eventos
  const recentEvents = (events || []).slice(0, 50).map((ev) => ({
    id: ev.id,
    event_type: ev.event_type,
    resource_type: ev.resource_type,
    resource_id: ev.resource_id,
    metadata: ev.metadata,
    user_id: ev.user_id,
    role: ev.role,
    created_at: ev.created_at,
  }));

  // 7. KPIs
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);

  const filtered = events || [];
  const activeUsersToday = new Set(
    filtered.filter((e) => e.created_at.slice(0, 10) === today).map((e) => e.user_id).filter(Boolean)
  ).size;
  const activeUsersWeek = new Set(
    filtered.filter((e) => new Date(e.created_at) >= weekAgo).map((e) => e.user_id).filter(Boolean)
  ).size;
  const simThisWeek = filtered.filter(
    (e) => e.event_type === "simulador_calculate" && new Date(e.created_at) >= weekAgo
  ).length;
  const pdfThisMonth = filtered.filter(
    (e) => e.event_type === "simulador_export_pdf" && new Date(e.created_at) >= monthAgo
  ).length;

  // 8. Histórico de status de unidades
  let statusHistory: Array<Record<string, unknown>> = [];
  const { data: history } = await supabase
    .from("unit_status_history")
    .select("*, profiles(display_name, email, role)")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(50);
  statusHistory = (history || []) as Array<Record<string, unknown>>;

  return NextResponse.json({
    kpis: { activeUsersToday, activeUsersWeek, simThisWeek, pdfThisMonth, totalEvents: filtered.length },
    daily,
    byType,
    byEmpreendimento,
    topUsers,
    recentEvents,
    statusHistory,
  });
}
