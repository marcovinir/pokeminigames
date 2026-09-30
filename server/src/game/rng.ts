import { randomInt } from "node:crypto";

/** Fuente de azar inyectable: en las pruebas se reemplaza por una secuencia conocida. */
export interface Rng {
  /** Entero en [0, maxExclusive). */
  int(maxExclusive: number): number;
}

export const cryptoRng: Rng = {
  int: (maxExclusive) => randomInt(maxExclusive),
};

export function pickOne<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pickOne: la lista está vacía");
  return items[rng.int(items.length)]!;
}
