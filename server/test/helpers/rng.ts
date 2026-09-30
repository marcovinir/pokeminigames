import type { Rng } from "../../src/game/rng.js";

/**
 * Azar con una secuencia conocida: cada llamada consume el siguiente valor (módulo el
 * máximo pedido). Cuando se acaba la secuencia devuelve 0.
 */
export function sequenceRng(values: number[] = []): Rng & { calls: number } {
  const queue = [...values];
  const rng = {
    calls: 0,
    int(maxExclusive: number): number {
      rng.calls++;
      const next = queue.shift() ?? 0;
      return next % maxExclusive;
    },
  };
  return rng;
}

/** Azar pseudoaleatorio pero repetible (mulberry32). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    int(maxExclusive: number): number {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * maxExclusive);
    },
  };
}
