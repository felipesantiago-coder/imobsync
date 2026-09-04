"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogOut } from "lucide-react";
import SalesDashboard from "@/components/sales-dashboard";

export default function AdminDashboardClient({ initialUnits = null }: { initialUnits?: Record<string, unknown>[] | null }) {
  const router = useRouter();

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace("/");
    });
  }, [router]);

  const handleLogout = async () => {
    await createClient().auth.signOut();
    // replace: logout transition must not stay in history (audit P2.6)
    // refresh kept: purges client Router Cache of authenticated routes
    router.replace("/");
    router.refresh();
  };

  return (
    <div className="relative min-h-screen">
      {/* Banner fixo admin no topo — indicador claro de área administrativa */}
      <div className="fixed top-0 left-0 right-0 z-[200] flex items-center justify-between px-6 py-3 bg-[#0D1B2A] text-white shadow-2xl">
        {/* Logo + identificação */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500 shadow-md">
            <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight">ImobSync</span>
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                Admin
              </span>
            </div>
            <p className="text-[11px] text-gray-400 font-medium">Painel Administrativo • Quattre Istambul</p>
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-3">
          <Link href="/projetos" className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
            Projetos
          </Link>
          <div className="w-px h-5 bg-gray-700 hidden sm:block" />
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-semibold transition-colors border border-red-500/20"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </button>
        </div>
      </div>

      {/* Dashboard com isAdmin=true, padding-top para não sobrepor o banner */}
      <div className="pt-16">
        <SalesDashboard isAdmin={true} hideHeader={true} initialUnits={initialUnits} />
      </div>
    </div>
  );
}
