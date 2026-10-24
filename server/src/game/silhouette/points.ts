import { ROUND_SECONDS } from "../constants.js";

const ROUND_MS = ROUND_SECONDS * 1000;

/**
 * Puntos de un acierto según lo rápido que llegó: 1000 en el instante 0 y 100 en el último, en línea recta. El tiempo es
 * el del servidor (de que empezó la ronda a que llegó la respuesta) y se limita a la ronda.
 */
export function silhouettePoints(elapsedMs: number): number {
  const t = Math.min(Math.max(elapsedMs, 0), ROUND_MS);
  return Math.round(1000 - (900 * t) / ROUND_MS);
}
