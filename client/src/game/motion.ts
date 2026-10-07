import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

const snapshot = (): boolean => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;

/** ¿Pidió la persona «reducir movimiento» en su sistema? Sin `matchMedia` se asume que el movimiento está permitido. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

export interface CountUpOptions {
  /** Cuánto tarda en llegar al valor nuevo. */
  durationMs?: number;
  /** Reloj inyectable para las pruebas. */
  now?: () => number;
}

/**
 * El valor que se muestra: al cambiar `target` sube o baja hasta él en `durationMs` y termina exactamente en él. Si
 * cambia a mitad de camino sigue desde donde iba. Con «reducir movimiento» salta directo al valor final.
 */
export function useCountUp(target: number, { durationMs = 500, now = Date.now }: CountUpOptions = {}): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(target);
  const shown = useRef(target);

  useEffect(() => {
    if (reduced || durationMs <= 0) {
      shown.current = target;
      setValue(target);
      return;
    }
    const from = shown.current;
    if (from === target) return;
    const start = now();
    const timer = setInterval(() => {
      const progress = Math.min(1, (now() - start) / durationMs);
      const eased = 1 - (1 - progress) ** 3;
      shown.current = Math.round(from + (target - from) * eased);
      setValue(shown.current);
      if (progress >= 1) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [target, reduced, durationMs, now]);

  return reduced ? target : value;
}
