/**
 * Skeleton estável compartilhado pelas rotas de dashboard (audit P2.7).
 *
 * Exibido pelo loading.tsx durante a navegação enquanto a Server Component
 * prepara os dados iniciais. Dimensões estáveis (sem CLS) e mesma estrutura
 * visual dos dashboards (header escuro + barra de filtros + grade de cards).
 */
export default function DashboardRouteSkeleton({ subtitle }: { subtitle?: string }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 flex flex-col">
      {/* Header escuro estável */}
      <header className="sticky top-0 z-50 bg-[#0D1B2A] text-white shadow-lg">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-7 sm:h-9 w-9 rounded-lg bg-white/10 animate-pulse" />
              <div className="min-w-0">
                <div className="h-4 w-24 rounded bg-white/15 animate-pulse" />
                <div className="mt-1 h-2.5 w-32 rounded bg-white/10 animate-pulse" />
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <div className="h-7 w-20 rounded-lg bg-white/10 animate-pulse" />
              <div className="h-7 w-16 rounded-lg bg-white/10 animate-pulse" />
            </div>
          </div>
        </div>
      </header>

      <main className="w-full px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10 py-6 space-y-6 flex-1" aria-busy="true" aria-live="polite">
        {subtitle && <span className="sr-only">{subtitle}</span>}

        {/* Barra de filtros */}
        <div className="p-4 rounded-xl bg-white shadow-md border border-gray-100 animate-pulse">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-4 h-4 bg-gray-200 rounded" />
            <div className="w-16 h-3 bg-gray-200 rounded" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <div className="w-20 h-2 bg-gray-200 rounded mb-2" />
                <div className="w-full h-9 bg-gray-100 rounded-lg border border-gray-200" />
              </div>
            ))}
          </div>
        </div>

        {/* Grade de cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border-2 border-gray-100 bg-white shadow-md animate-pulse"
            >
              <div className="h-1.5 bg-gray-200" />
              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-16 h-5 bg-gray-200 rounded" />
                  <div className="w-16 h-5 bg-gray-200 rounded-full" />
                </div>
                <div className="w-14 h-4 bg-gray-200 rounded" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3.5 h-3.5 bg-gray-200 rounded" />
                    <div className="w-10 h-3.5 bg-gray-200 rounded" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3.5 h-3.5 bg-gray-200 rounded" />
                    <div className="w-10 h-3.5 bg-gray-200 rounded" />
                  </div>
                </div>
                <div className="pt-1">
                  <div className="w-24 h-5 bg-gray-200 rounded" />
                  <div className="w-16 h-3 bg-gray-200 rounded mt-1" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Rodapé estável */}
      <footer className="border-t border-gray-200 bg-white/90 mt-auto">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10 py-4 flex justify-center">
          <div className="h-3 w-64 rounded bg-gray-200 animate-pulse" />
        </div>
      </footer>
    </div>
  );
}
