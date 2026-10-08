import { useCallback, useEffect, useState } from "react";

/**
 * Una cuenta atrás de segundos enteros (p. ej. la espera entre dos códigos). Se calcula a partir de la hora, no de contar
 * ticks, así que no se atrasa si la pestaña estuvo en segundo plano. Sin cuenta en marcha no hay ningún temporizador.
 */
export function useCooldown(initialSeconds = 0): { remaining: number; start(seconds?: number): void } {
  const [endsAt, setEndsAt] = useState(() => (initialSeconds > 0 ? Date.now() + initialSeconds * 1000 : 0));
  const [, setTick] = useState(0);
  const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  const running = remaining > 0;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => clearInterval(timer);
  }, [running, endsAt]);

  const start = useCallback((seconds = 60) => setEndsAt(Date.now() + seconds * 1000), []);
  return { remaining, start };
}
