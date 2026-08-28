"use client";

import { useCallback } from "react";

/**
 * Hook client-side para disparar eventos de analytics (fire-and-forget).
 * Usa sendBeacon com Blob para garantir Content-Type correto.
 */
export function useTrackEvent() {
  const track = useCallback(
    (event: {
      event_type: string;
      resource_type?: string;
      resource_id?: string;
      metadata?: Record<string, unknown>;
    }) => {
      try {
        const body = JSON.stringify(event);
        if (navigator.sendBeacon) {
          // Blob com type explícito — sendBeacon com string envia text/plain,
          // o que pode falhar na desserialização do JSON no servidor
          const blob = new Blob([body], { type: "application/json" });
          navigator.sendBeacon("/api/analytics/track", blob);
        } else {
          fetch("/api/analytics/track", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
          });
        }
      } catch {
        // Silente — tracking nunca deve quebrar o fluxo
      }
    },
    []
  );

  return track;
}