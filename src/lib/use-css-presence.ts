"use client";

import { useCallback, useState } from "react";

/**
 * Presença CSS para componentes que antes usavam AnimatePresence/motion exit.
 *
 * Mantém o elemento montado durante a animação de saída (classes
 * `*-out` definidas em globals.css) e desmonta ao `animationend` da
 * animação de saída do próprio elemento raiz (ignora eventos de filhos).
 *
 * Uso típico (dono do estado condicional):
 * ```tsx
 * const expanded = useCssPresence<Unit | null>(selectedUnit, "ims-overlay-out");
 * // ...
 * {expanded.mounted && (
 *   <ExpandedCard
 *     unit={expanded.current!}
 *     closing={expanded.closing}
 *     onAnimEnd={expanded.onAnimEnd}
 *     onClose={handleClose}
 *   />
 * )}
 * ```
 * No componente filho (raiz):
 * ```tsx
 * <div
 *   className={closing ? "ims-overlay-out" : "ims-overlay-in"}
 *   onAnimationEnd={(e) => { if (e.target === e.currentTarget) onAnimEnd(); }}
 * >
 * ```
 *
 * Implementação sem useEffect: a re-sincronização com a prop `open` usa o
 * padrão React documentado de ajuste de estado durante o render (guardado
 * por comparação — "adjusting state when a prop changes"), compatível com as
 * regras do React Compiler (react-hooks/set-state-in-effect).
 */
export function useCssPresence<T>(
  value: T,
  exitAnimationName: string
): {
  /** true se o valor está definido (estado "aberto"). */
  open: boolean;
  /** true enquanto o elemento deve permanecer montado. */
  mounted: boolean;
  /** true durante a animação de saída (montado, mas fechando). */
  closing: boolean;
  /** Último valor definido — mantém o conteúdo renderizado durante a saída. */
  current: T;
  /** Handler de onAnimationEnd do elemento raiz. */
  onAnimEnd: (event: React.AnimationEvent) => void;
} {
  const open = value !== null && value !== undefined;

  const [snap, setSnap] = useState({ open, mounted: open, last: value });

  // Re-sincronização render-time (padrão documentado; guards evitam loop):
  // - open mudou → re-armar `mounted` quando abre (fechar mantém montado);
  // - open e valor novos → guardar o último valor definido para a saída.
  if (snap.open !== open || (open && !Object.is(snap.last, value))) {
    setSnap({
      open,
      mounted: open ? true : snap.mounted,
      last: open ? value : snap.last,
    });
  }

  const onAnimEnd = useCallback(
    (event: React.AnimationEvent) => {
      if (!open && event.animationName === exitAnimationName) {
        setSnap((prev) => (prev.mounted ? { ...prev, mounted: false } : prev));
      }
    },
    [open, exitAnimationName]
  );

  return {
    open,
    mounted: snap.mounted,
    closing: snap.mounted && !open,
    current: (open ? value : snap.last) as T,
    onAnimEnd,
  };
}
