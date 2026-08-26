"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Users, Calculator, FileDown, Activity, TrendingUp, Building2,
  Clock, Filter, RefreshCw, BarChart3, PieChartIcon, List,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────
interface MetricasTabProps {
  addToast: (type: "success" | "error", message: string) => void;
}

interface AnalyticsData {
  kpis: {
    activeUsersToday: number;
    activeUsersWeek: number;
    simThisWeek: number;
    pdfThisMonth: number;
    totalEvents: number;
  };
  daily: { date: string; count: number }[];
  byType: { type: string; count: number }[];
  byEmpreendimento: { empreendimento: string; count: number }[];
  topUsers: { email: string; role: string; count: number }[];
  recentEvents: {
    id: string;
    event_type: string;
    resource_type: string | null;
    resource_id: string | null;
    metadata: Record<string, unknown>;
    user_id: string | null;
    role: string;
    created_at: string;
  }[];
  statusHistory: Array<Record<string, unknown>>;
}

const EVENT_LABELS: Record<string, string> = {
  simulador_calculate: "Simulação calculada",
  simulador_export_pdf: "PDF exportado",
  dashboard_view: "Dashboard visualizado",
  unit_status_change: "Status alterado",
  unit_status_batch: "Status em lote",
};

const EVENT_COLORS: string[] = [
  "bg-emerald-500", "bg-blue-500", "bg-amber-500", "bg-violet-500",
  "bg-rose-500", "bg-cyan-500", "bg-orange-500", "bg-pink-500",
];

// ─── Component ─────────────────────────────────────────────────────────
export default function MetricasTab({ addToast }: MetricasTabProps) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [roleFilter, setRoleFilter] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [activeView, setActiveView] = useState<"overview" | "events" | "history">("overview");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ days: String(days) });
      if (roleFilter) params.set("role", roleFilter);
      if (eventTypeFilter) params.set("event_type", eventTypeFilter);
      const res = await fetch(`/api/admin-sistema/analytics?${params}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json);
    } catch {
      addToast("error", "Erro ao carregar métricas");
    } finally {
      setLoading(false);
    }
  }, [days, roleFilter, eventTypeFilter, addToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const maxDaily = data ? Math.max(...data.daily.map((d) => d.count), 1) : 1;
  const totalByType = data ? data.byType.reduce((s, t) => s + t.count, 0) : 0;

  const formatDate = (iso: string) => {
    const d = new Date(iso + "Z");
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  const formatEventLabel = (type: string) => EVENT_LABELS[type] || type.replace(/_/g, " ");

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1">
          {([7, 30, 90] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                days === d
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
        >
          <option value="">Todos os perfis</option>
          <option value="comum">Comum</option>
          <option value="coordenador">Coordenador</option>
        </select>

        <select
          value={eventTypeFilter}
          onChange={(e) => setEventTypeFilter(e.target.value)}
          className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
        >
          <option value="">Todos os eventos</option>
          <option value="simulador_calculate">Simulações</option>
          <option value="simulador_export_pdf">Exportações PDF</option>
          <option value="dashboard_view">Dashboards</option>
          <option value="unit_status_change">Mudanças de status</option>
        </select>

        <button
          onClick={fetchData}
          className="ml-auto flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : !data ? (
        <p className="text-center text-slate-500 py-20">Nenhum dado disponível</p>
      ) : (
        <>
          {/* Tab switcher */}
          <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 w-fit">
            {(
              [
                ["overview", "Visão Geral", BarChart3],
                ["events", "Eventos Recentes", List],
                ["history", "Histórico de Status", Activity],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setActiveView(key)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeView === key
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {activeView === "overview" && (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {(
                  [
                    [data.kpis.activeUsersToday, "Usuários hoje", Users, "bg-emerald-50 text-emerald-600 border-emerald-100"],
                    [data.kpis.activeUsersWeek, "Usuários na semana (7d)", Users, "bg-blue-50 text-blue-600 border-blue-100"],
                    [data.kpis.simThisWeek, "Simulações na semana", Calculator, "bg-violet-50 text-violet-600 border-violet-100"],
                    [data.kpis.pdfThisMonth, "PDFs este mês", FileDown, "bg-amber-50 text-amber-600 border-amber-100"],
                  ] as const
                ).map(([value, label, Icon, colors], i) => (
                  <div key={i} className={`rounded-2xl border p-4 ${colors}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4" />
                      <span className="text-xs font-medium opacity-75">{label}</span>
                    </div>
                    <p className="text-2xl font-bold">{value}</p>
                  </div>
                ))}
              </div>

              {/* Charts Row */}
              <div className="grid lg:grid-cols-3 gap-6">
                {/* Activity chart (2 cols) */}
                <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="text-sm font-semibold text-slate-800 mb-4">Atividade por dia</h3>
                  {data.daily.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">Sem dados no período</p>
                  ) : (
                    <div className="flex items-end gap-[3px] h-40">
                      {data.daily.map((d) => (
                        <div
                          key={d.date}
                          className="flex-1 flex flex-col items-center gap-1 group"
                          title={`${d.date}: ${d.count} eventos`}
                        >
                          <span className="text-[10px] font-semibold text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">
                            {d.count}
                          </span>
                          <div
                            className="w-full rounded-t-sm bg-slate-900 min-h-[2px] transition-all duration-300 hover:bg-slate-700"
                            style={{
                              height: `${Math.max((d.count / maxDaily) * 100, 2)}%`,
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  {/* X-axis labels */}
                  <div className="flex justify-between mt-2">
                    <span className="text-[10px] text-slate-400">
                      {data.daily[0]?.date.slice(5)}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {data.daily[data.daily.length - 1]?.date.slice(5)}
                    </span>
                  </div>
                </div>

                {/* By Type (donut) */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="text-sm font-semibold text-slate-800 mb-4">Por tipo de evento</h3>
                  {data.byType.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">Sem dados</p>
                  ) : (
                    <div className="space-y-3">
                      {data.byType.slice(0, 6).map((t, i) => {
                        const pct = totalByType > 0 ? ((t.count / totalByType) * 100).toFixed(1) : "0";
                        return (
                          <div key={t.type} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="font-medium text-slate-700">
                                {formatEventLabel(t.type)}
                              </span>
                              <span className="text-slate-500">
                                {t.count} ({pct}%)
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${EVENT_COLORS[i % EVENT_COLORS.length]}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* By Empreendimento + Top Users */}
              <div className="grid lg:grid-cols-2 gap-6">
                {/* By Empreendimento */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Building2 className="w-4 h-4 text-slate-600" />
                    <h3 className="text-sm font-semibold text-slate-800">Por empreendimento</h3>
                  </div>
                  {data.byEmpreendimento.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">Sem dados</p>
                  ) : (
                    <div className="space-y-2">
                      {data.byEmpreendimento.map((e, i) => {
                        const max = data.byEmpreendimento[0]?.count || 1;
                        return (
                          <div key={e.empreendimento} className="flex items-center gap-3">
                            <span className="text-xs font-medium text-slate-500 w-36 truncate text-right">
                              {e.empreendimento}
                            </span>
                            <div className="flex-1 h-5 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-slate-900 transition-all"
                                style={{ width: `${(e.count / max) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-slate-700 w-10">{e.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Top Users */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="w-4 h-4 text-slate-600" />
                    <h3 className="text-sm font-semibold text-slate-800">Top usuários ativos</h3>
                  </div>
                  {data.topUsers.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">Sem dados</p>
                  ) : (
                    <div className="space-y-2">
                      {data.topUsers.map((u, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0"
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center">
                              {i + 1}
                            </span>
                            <div>
                              <p className="text-sm font-medium text-slate-800 truncate max-w-48">
                                {u.email}
                              </p>
                              <p className="text-[10px] text-slate-400 capitalize">{u.role}</p>
                            </div>
                          </div>
                          <span className="text-sm font-bold text-slate-700">{u.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {activeView === "events" && (
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-800">
                  Últimos eventos
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    ({data.recentEvents.length} no período)
                  </span>
                </h3>
              </div>
              <div className="max-h-[600px] overflow-y-auto">
                {data.recentEvents.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-12">Nenhum evento registrado</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Data</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Evento</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Detalhes</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Perfil</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentEvents.map((ev) => (
                        <tr key={ev.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                            {formatDate(ev.created_at)}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                              {formatEventLabel(ev.event_type)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-600 max-w-64">
                            {ev.metadata && typeof ev.metadata === "object" ? (
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(ev.metadata)
                                  .filter(([k]) => k !== "empreendimento" || !ev.metadata?.empreendimento)
                                  .slice(0, 3)
                                  .map(([k, v]) => (
                                    <span key={k} className="rounded bg-slate-50 px-1.5 py-0.5 text-[10px]">
                                      {k}: {String(v)}
                                    </span>
                                  ))}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              ev.role === "coordenador"
                                ? "bg-violet-100 text-violet-700"
                                : "bg-slate-100 text-slate-600"
                            }`}>
                              {ev.role}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {activeView === "history" && (
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-800">
                  Histórico de status de unidades
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    ({data.statusHistory.length} no período)
                  </span>
                </h3>
              </div>
              <div className="max-h-[600px] overflow-y-auto">
                {data.statusHistory.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-12">Nenhuma alteração registrada</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Data</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Unidade</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Mudança</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Responsável</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.statusHistory.map((h) => {
                        const profiles = h.profiles as Record<string, unknown> | null;
                        return (
                          <tr key={String(h.id)} className="border-t border-slate-50 hover:bg-slate-50/50">
                            <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                              {formatDate(String(h.created_at))}
                            </td>
                            <td className="px-4 py-2.5">
                              <p className="text-xs font-medium text-slate-800">
                                {String(h.bloco) ? `${h.bloco} - ` : ""}{String(h.unidade)}
                              </p>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <StatusBadge status={String(h.status_anterior || "-")} />
                                <span className="text-slate-300">→</span>
                                <StatusBadge status={String(h.status_novo)} />
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-600">
                              {profiles?.display_name || profiles?.email || "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Status Badge Helper ───────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    disponivel: "bg-emerald-100 text-emerald-700",
    reservado: "bg-amber-100 text-amber-700",
    vendido: "bg-slate-800 text-white",
    "-": "bg-slate-100 text-slate-400",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${colors[status] || "bg-slate-100 text-slate-600"}`}>
      {status}
    </span>
  );
}
