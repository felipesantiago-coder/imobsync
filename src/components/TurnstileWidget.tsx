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
 *
 * ⚠︎ Ruído de console conhecido e benigno — tudo vindo do iframe do desafio
 * em challenges.cloudflare.com (nenhuma mensagem é gerada por este app):
 *   1. "Creating a TrustedTypePolicy named 'goog#html' violates ... trusted-types
 *      <token> default" → extensão Google Tag Assistant (content_script_bin.js /
 *      tag_assistant_api_bin.js) bloqueada pela CSP interna do próprio iframe.
 *      O CSP do ImobSync não define `trusted-types` (ver next.config.ts).
 *   2. "OTS parsing error: Size of decompressed WOFF 2.0 is less than compressed
 *      size" → fonte WOFF2 servida pelo próprio Cloudflare dentro do iframe.
 *   3. "No available adapters" → log interno do runner de desafio do Cloudflare.
 * Triage completo: docs/diagnostics/login-console-errors.md
 */
export function useTurnstile() {
  const [token, setToken] = useState<string | null>(null);
  // Espelho em ref: o submit precisa ler o token mais recente sem depender
  // do closure do render (e serve para aguardar token novo após reset).
  const tokenRef = useRef<string | null>(null);
  const errorRef = useRef(false);
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const isConfigured = Boolean(siteKey && siteKey !== "" && siteKey !== "placeholder");

  const setTokenState = useCallback((value: string | null) => {
    tokenRef.current = value;
    setToken(value);
  }, []);

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
          // widget já removido — ignore
        }
        widgetIdRef.current = null;
      }

      widgetIdRef.current = window.turnstile.render(widgetRef.current, {
        sitekey: siteKey!,
        callback: (tok: string) => {
          errorRef.current = false;
          setTokenState(tok);
        },
        // Log do código de erro real do Turnstile (ver runbook de diagnóstico:
        // docs/diagnostics/turnstile-troubleshooting-runbook.md)
        "error-callback": (errorCode?: string) => {
          console.warn(
            `[Turnstile] erro no widget: ${errorCode ?? "código não informado"}`
          );
          errorRef.current = true;
          setTokenState(null);
        },
        "expired-callback": () => {
          console.warn(
            "[Turnstile] token expirado antes do uso — novo desafio necessário"
          );
          setTokenState(null);
        },
        size: "invisible",
        execution: "render",
      });
    };

    // Esperar o script carregar
    let interval: ReturnType<typeof setInterval> | undefined;
    if (typeof window.turnstile !== "undefined") {
      renderWidget();
    } else {
      // Polling curto para esperar o script (max 3s)
      let attempts = 0;
      interval = setInterval(() => {
        attempts++;
        if (typeof window.turnstile !== "undefined" || attempts > 30) {
          clearInterval(interval!);
          interval = undefined;
          if (typeof window.turnstile !== "undefined") {
            renderWidget();
          } else {
            // Script não chegou em 3s — quase sempre rede/adblock/CSP.
            console.warn(
              "[Turnstile] script challenges.cloudflare.com não carregou em 3s — verifique rede, adblock ou CSP (runbook: docs/diagnostics/turnstile-troubleshooting-runbook.md)"
            );
          }
        }
      }, 100);
    }

    // Cleanup ao desmontar — remove o widget e limpa o polling
    return () => {
      if (interval) clearInterval(interval);
      if (widgetIdRef.current !== null && typeof window.turnstile !== "undefined") {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // DOM já pode ter sido removido
        }
        widgetIdRef.current = null;
      }
    };
  }, [isConfigured, siteKey]);

  const reset = useCallback(() => {
    if (widgetIdRef.current !== null && typeof window.turnstile !== "undefined") {
      window.turnstile.reset(widgetIdRef.current);
    }
    errorRef.current = false;
    setTokenState(null);
  }, [setTokenState]);

  /**
   * Aguarda um token novo (após reset) por até timeoutMs. Resolve null se
   * o widget sinalizar erro ou estourar o timeout — o chamador decide o
   * fallback (fail-open).
   */
  const awaitTurnstileToken = useCallback(
    (timeoutMs = 8000) =>
      new Promise<string | null>((resolve) => {
        if (tokenRef.current) {
          resolve(tokenRef.current);
          return;
        }
        const startedAt = Date.now();
        const poll = setInterval(() => {
          if (tokenRef.current) {
            clearInterval(poll);
            resolve(tokenRef.current);
            return;
          }
          if (errorRef.current || Date.now() - startedAt >= timeoutMs) {
            clearInterval(poll);
            resolve(null);
          }
        }, 100);
      }),
    []
  );

  // Se não configurado, sempre retorna token de bypass
  if (!isConfigured) {
    return {
      token: "bypass" as string | null,
      reset: () => {},
      widgetRef: { current: null },
      awaitTurnstileToken: async () => null,
    };
  }

  return { token, reset, widgetRef, awaitTurnstileToken };
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
