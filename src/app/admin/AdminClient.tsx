"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Building2,
  LogOut,
  RefreshCw,
  Save,
  Check,
  ArrowLeft,
  Filter,
} from "lucide-react";
import ConfirmDialog from "@/components/confirm-dialog";

interface DBUnit {
  id: number;
  andar: number;
  unidade: number;
  vagas: number;
  area: number;
  area_str: string;
  valor_venda: number | null;
  tipo_area: string;
  status: "disponivel" | "reservado" | "vendido";
  posicao_solar: string;
  quartos: number;
  updated_at: string;
}

function formatBRL(value: number | null): string {
  if (value === null) return "Consulte";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

const statusConfig = {
  disponivel: {
    label: "Disponível",
    bg: "bg-emerald-100",
    text: "text-emerald-800",
    border: "border-emerald-300",
    dot: "bg-emerald-500",
  },
  reservado: {
    label: "Reservada",
    bg: "bg-amber-100",
    text: "text-amber-800",
    border: "border-amber-300",
    dot: "bg-amber-500",
  },
  vendido: {
    label: "Vendida",
    bg: "bg-red-100",
    text: "text-red-800",
    border: "border-red-300",
    dot: "bg-red-500",
  },
};

export default function AdminClient() {
  const router = useRouter();
  const [units, setUnits] = useState<DBUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterFloor, setFilterFloor] = useState<number | "all">("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [changedUnits, setChangedUnits] = useState<Map<number, string>>(new Map());
  const [lastSync, setLastSync] = useState<string>("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  const fetchUnits = useCallback(async () => {
    try {
      const res = await fetch("/api/units");
      const data = await res.json();
      setUnits(Array.isArray(data) ? data : []);
      setLastSync(new Date().toLocaleTimeString("pt-BR"));
    } catch (err) {
      console.error("Erro ao buscar unidades:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();

    // Verificar autenticação
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push("/admin/login");
    });

    fetchUnits();

    // Realtime
    const channel = supabase
      .channel("admin-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "units" },
        (payload) => {
          setUnits((prev) =>
            prev.map((u) =>
              u.unidade === payload.new.unidade
                ? { ...u, status: payload.new.status as DBUnit["status"], updated_at: payload.new.updated_at as string }
                : u
            )
          );
          setLastSync(new Date().toLocaleTimeString("pt-BR"));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [router, fetchUnits]);

  const handleStatusChange = useCallback((unidade: number, newStatus: string) => {
    setUnits((prev) =>
      prev.map((u) => u.unidade === unidade ? { ...u, status: newStatus as DBUnit["status"] } : u)
    );
    setChangedUnits((prev) => { const n = new Map(prev); n.set(unidade, newStatus); return n; });
    setSaveSuccess(false);
  }, []);

  const handleSave = useCallback(() => {
    if (changedUnits.size === 0) return;
    setShowSaveConfirm(true);
  }, [changedUnits]);

  const confirmSave = useCallback(async () => {
    setShowSaveConfirm(false);
    setSaving(true);
    try {
      const updates = Array.from(changedUnits.entries()).map(([unidade, status]) => ({ unidade, status }));
      const res = await fetch("/api/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (res.ok) {
        setChangedUnits(new Map());
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        alert("Erro ao salvar alterações");
      }
    } catch (err) {
      console.error("Erro ao salvar:", err);
      alert("Erro ao salvar alterações");
    } finally {
      setSaving(false);
    }
  }, [changedUnits]);

  const handleLogout = useCallback(async () => {
    await createClient().auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }, [router]);

  const floors = [1, 2, 3, 4, 5, 6];

  const filteredUnits = useMemo(() => units.filter((u) => {
    if (filterFloor !== "all" && u.andar !== filterFloor) return false;
    if (filterStatus !== "all" && u.status !== filterStatus) return false;
    return true;
  }), [units, filterFloor, filterStatus]);

  const groupedByFloor = useMemo(() => floors
    .map((f) => ({ floor: f, units: filteredUnits.filter((u) => u.andar === f).sort((a, b) => a.unidade - b.unidade) }))
    .filter((g) => g.units.length > 0), [filteredUnits]);

  const stats = useMemo(() => ({
    total: units.length,
    disponivel: units.filter((u) => u.status === "disponivel").length,
    reservado: units.filter((u) => u.status === "reservado").length,
    vendido: units.filter((u) => u.status === "vendido").length,
  }), [units]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-400 font-medium">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-gray-900 to-gray-700 flex items-center justify-center shadow-md">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 tracking-tight">
                  Quattre <span className="text-gray-400 font-normal">Istambul</span>
                </h1>
                <p className="text-[11px] text-gray-400 font-medium hidden sm:block">Painel Administrativo</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {lastSync && <span className="text-xs text-gray-400 hidden sm:block">Sync: {lastSync}</span>}
              <Link href="/" className="text-sm text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /><span className="hidden sm:inline">Espelho</span>
              </Link>
              <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 transition-all">
                <LogOut className="w-4 h-4" /><span className="hidden sm:inline">Sair</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 flex-1">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-xs text-gray-400 font-medium mt-1">Total</p>
          </div>
          <div className="bg-emerald-50 rounded-xl p-4 shadow-sm border border-emerald-100 text-center">
            <p className="text-2xl font-bold text-emerald-700">{stats.disponivel}</p>
            <p className="text-xs text-emerald-600 font-medium mt-1">Disponíveis</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-4 shadow-sm border border-amber-100 text-center">
            <p className="text-2xl font-bold text-amber-700">{stats.reservado}</p>
            <p className="text-xs text-amber-600 font-medium mt-1">Reservadas</p>
          </div>
          <div className="bg-red-50 rounded-xl p-4 shadow-sm border border-red-100 text-center">
            <p className="text-2xl font-bold text-red-700">{stats.vendido}</p>
            <p className="text-xs text-red-600 font-medium mt-1">Vendidas</p>
          </div>
        </div>

        {/* Filters + Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={filterFloor}
              onChange={(e) => setFilterFloor(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            >
              <option value="all">Todos os Andares</option>
              {floors.map((f) => <option key={f} value={f}>{f}º Andar</option>)}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            >
              <option value="all">Todos os Status</option>
              <option value="disponivel">Disponível</option>
              <option value="reservado">Reservada</option>
              <option value="vendido">Vendida</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchUnits} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all shadow-sm">
              <RefreshCw className="w-4 h-4" /> Atualizar
            </button>
            <button
              onClick={handleSave}
              disabled={changedUnits.size === 0 || saving}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm ${
                changedUnits.size === 0 ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : saveSuccess ? "bg-emerald-600 text-white"
                : "bg-[#0D1B2A] to-gray-700 text-white hover:from-gray-800 hover:to-gray-600"
              }`}
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saving ? "Salvando..." : saveSuccess ? "Salvo!" : `Salvar (${changedUnits.size})`}
            </button>
          </div>
        </div>

        {/* Units Table by Floor */}
        <div className="space-y-6">
          {groupedByFloor.map(({ floor, units: floorUnits }) => (
            <div key={floor} className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r bg-[#0D1B2A] text-white shadow-md">
                <Building2 className="w-5 h-5" />
                <span className="font-bold">{floor}º Andar</span>
                <span className="text-white/60 text-sm">— {floorUnits.length} unidades</span>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left py-3 px-4 font-semibold text-gray-500 text-xs uppercase">Unidade</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-500 text-xs uppercase">Área</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-500 text-xs uppercase">Qts</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-500 text-xs uppercase">Vagas</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-500 text-xs uppercase">Valor</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-500 text-xs uppercase">Solar</th>
                        <th className="text-center py-3 px-4 font-semibold text-gray-500 text-xs uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {floorUnits.map((unit) => {
                        const cfg = statusConfig[unit.status];
                        const isChanged = changedUnits.has(unit.unidade);
                        return (
                          <tr key={unit.unidade} className={`border-b border-gray-50 transition-colors ${isChanged ? "bg-amber-50/50" : "hover:bg-gray-50/50"}`}>
                            <td className="py-3 px-4 font-bold text-gray-900">{unit.unidade}</td>
                            <td className="py-3 px-4 text-gray-600">{unit.area_str}</td>
                            <td className="py-3 px-4 text-gray-600">{unit.quartos}</td>
                            <td className="py-3 px-4 text-gray-600">{unit.vagas}</td>
                            <td className="py-3 px-4 text-gray-600 font-medium">{formatBRL(unit.valor_venda)}</td>
                            <td className="py-3 px-4">
                              <span className={`text-xs font-medium ${unit.posicao_solar === "Nascente" ? "text-amber-600" : "text-orange-600"}`}>
                                {unit.posicao_solar}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <select
                                value={unit.status}
                                onChange={(e) => handleStatusChange(unit.unidade, e.target.value)}
                                className={`h-8 px-2 rounded-lg text-xs font-semibold border cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-900/10 ${cfg.bg} ${cfg.text} ${cfg.border}`}
                              >
                                <option value="disponivel">Disponível</option>
                                <option value="reservado">Reservada</option>
                                <option value="vendido">Vendida</option>
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-white/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-xs text-gray-400">Quattre Istambul — Painel Administrativo {lastSync && `• Sincronizado às ${lastSync}`}</p>
        </div>
      </footer>
      <ConfirmDialog
        open={showSaveConfirm}
        title="Salvar alterações"
        description={`Você alterou o status de ${changedUnits.size} unidade(s). Deseja confirmar as mudanças?`}
        confirmLabel="Salvar"
        cancelLabel="Cancelar"
        variant="default"
        onConfirm={confirmSave}
        onCancel={() => setShowSaveConfirm(false)}
        loading={false}
      />
    </div>
  );
}
