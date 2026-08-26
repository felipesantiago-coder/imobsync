"use client";

import { useCallback } from "react";

/**
 * Hook client-side para disparar eventos de analytics (fire-and-forget).
 * Usa fetch com keepalive como fallback para sendBeacon.
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
          navigator.sendBeacon("/api/analytics/track", body);
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
