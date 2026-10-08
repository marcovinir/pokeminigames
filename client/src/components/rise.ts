import type { CSSProperties } from "react";

/**
 * El turno de entrada de una tarjeta con `animate-rise`: la número `index` entra `index × 60 ms` después de la primera
 * (el retardo lo calcula el CSS a partir de `--i`; con «reducir movimiento» se apaga).
 */
export const rise = (index = 0): CSSProperties => ({ "--i": index }) as CSSProperties;
