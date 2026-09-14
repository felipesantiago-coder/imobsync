import type { Metadata } from "next";
import Link from "next/link";
import { RefreshCw, WifiOff } from "lucide-react";

export const metadata: Metadata = {
  title: "Sem conexão — ImobSync",
  robots: { index: false, follow: false },
};

/**
 * Página de fallback offline do PWA (precached pelo service worker).
 * Estática por design: nenhum dado, nenhum fetch — deve abrir sem rede.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center text-foreground">
      <div
        className="flex h-20 w-20 items-center justify-center rounded-full bg-muted"
        aria-hidden="true"
      >
        <WifiOff className="h-9 w-9 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Sem conexão</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Não foi possível carregar esta tela. Verifique sua conexão com a
          internet e tente novamente.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Tentar novamente
      </Link>
    </main>
  );
}
