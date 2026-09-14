"use client";

import { useEffect } from "react";

/**
 * Registra o service worker do PWA (/sw.js) em produção.
 * - Dev (npm run dev) NÃO registra: evita caches velhos atrapalhando HMR.
 * - Registro após o evento 'load': não compete com a hidratação inicial.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) =>
          console.warn("[pwa] Falha ao registrar service worker:", err)
        );
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
