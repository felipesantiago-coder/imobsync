"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cloudflare Turnstile — widget invisível (não interrompe o usuário).
 *
 * Uso:
 *   const { token, reset } = useTurnstile();
 *   // token é preenchido automaticamente quando o desafio é resolvido
 *   // reset() força um novo desafio
 *
 * Requer NEXT_PUBLIC_TURNSTILE_SITE_KEY no .env
 * Se não configurado, o token é sempre "bypass" (modo dev/local).
 */
export function useTurnstile() {
  const [token, setToken] = useState<string | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const isConfigured = Boolean(siteKey && siteKey !== "" && siteKey !== "placeholder");

  // Carregar o script do Turnstile uma vez
  useEffect(() => {
    if (!isConfigured) return;
    if (document.getElementById("cf-turnstile-script")) return;

    const script = document.createElement("script");
    script.id = "cf-turnstile-script";
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, [isConfigured]);

  // Renderizar o widget quando o script estiver pronto
  useEffect(() => {
    if (!isConfigured) return;

    const renderWidget = () => {
      if (
        !widgetRef.current ||
        typeof window.turnstile === "undefined"
      ) {
        return;
      }

      // Limpar widget anterior se existir
      if (widgetIdRef.current !== null) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore
        }
        widgetIdRef.current = null;
      }

      widgetIdRef.current = window.turnstile.render(widgetRef.current, {
        sitekey: siteKey!,
        callback: (tok: string) => setToken(tok),
        "error-callback": () => setToken(null),
        "expired-callback": () => setToken(null),
        size: "invisible",
        appearance: "interaction-only",
      });
    };

    // Esperar o script carregar
    if (typeof window.turnstile !== "undefined") {
      renderWidget();
    } else {
      // Polling curto para esperar o script (max 3s)
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (typeof window.turnstile !== "undefined" || attempts > 30) {
          clearInterval(interval);
          if (typeof window.turnstile !== "undefined") {
            renderWidget();
          }
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [isConfigured, siteKey]);

  const reset = useCallback(() => {
    if (widgetIdRef.current !== null && typeof window.turnstile !== "undefined") {
      window.turnstile.reset(widgetIdRef.current);
    }
    setToken(null);
  }, []);

  // Se não configurado, sempre retorna token de bypass
  if (!isConfigured) {
    return { token: "bypass", reset: () => {}, widgetRef: { current: null } };
  }

  return { token, reset, widgetRef };
}

// Tipagem global do Turnstile
declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        params: Record<string, unknown>
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}
