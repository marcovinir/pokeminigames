import { useEffect, useRef, useState } from "react";

/**
 * Diferencia entre el reloj del servidor y el del navegador, medida al recibir un evento que trae
 * `serverNow`. Se ignora la latencia de la red (unas decenas de milisegundos): lo que importa es
 * corregir desfases de segundos entre los dos relojes.
 */
export function clockOffset(serverNow: number, receivedAt: number): number {
  return serverNow - receivedAt;
}

/** Milisegundos que faltan para un plazo dado en hora del servidor; nunca baja de cero. */
export function remainingMs(deadline: number | null, offset: number, now: number): number {
  if (deadline === null) return 0;
  return Math.max(0, deadline - (now + offset));
}

/** Segundos enteros que se muestran en un cronómetro (se redondea hacia arriba: 0,2 s se ve como 1). */
export function secondsLeft(ms: number): number {
  return Math.ceil(ms / 1000);
}

export interface CountdownOptions {
  /** Hora actual del navegador; se reemplaza en las pruebas. */
  now?: () => number;
  intervalMs?: number;
}

/**
 * Milisegundos que faltan para `deadline` (hora del servidor), actualizados unas 4 veces por
 * segundo. Solo sirve para mostrar el cronómetro: el servidor es quien decide cuándo termina todo.
 */
export function useCountdown(deadline: number | null, offset: number, options: CountdownOptions = {}): number {
  const intervalMs = options.intervalMs ?? 250;
  const nowRef = useRef(options.now ?? Date.now);
  nowRef.current = options.now ?? Date.now;
  const [remaining, setRemaining] = useState(() => remainingMs(deadline, offset, nowRef.current()));

  useEffect(() => {
    const tick = () => setRemaining(remainingMs(deadline, offset, nowRef.current()));
    tick();
    if (deadline === null) return;
    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [deadline, offset, intervalMs]);

  return remaining;
}
