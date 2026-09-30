import { describe, expect, it } from "vitest";
import { cryptoRng, pickOne } from "../../src/game/rng.js";
import { seededRng, sequenceRng } from "../helpers/rng.js";

describe("pickOne", () => {
  it("elige el elemento que indica el azar", () => {
    const items = ["a", "b", "c"];
    expect(pickOne(sequenceRng([0]), items)).toBe("a");
    expect(pickOne(sequenceRng([2]), items)).toBe("c");
  });

  it("lanza un error claro si la lista está vacía", () => {
    expect(() => pickOne(sequenceRng([0]), [])).toThrow(/vacía/);
  });
});

describe("cryptoRng", () => {
  it("devuelve enteros dentro del rango y alcanza todos los valores", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const value = cryptoRng.int(3);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(3);
      seen.add(value);
    }
    expect(seen).toEqual(new Set([0, 1, 2]));
  });
});

describe("azar de las pruebas", () => {
  it("sequenceRng consume los valores en orden, aplica el módulo y cuenta las llamadas", () => {
    const rng = sequenceRng([7, 1]);
    expect(rng.int(5)).toBe(2);
    expect(rng.int(5)).toBe(1);
    expect(rng.int(5)).toBe(0); // sin más valores devuelve 0
    expect(rng.calls).toBe(3);
  });

  it("seededRng es repetible con la misma semilla y distinto con otra", () => {
    const draw = (seed: number) => {
      const rng = seededRng(seed);
      return Array.from({ length: 8 }, () => rng.int(1000));
    };
    expect(draw(42)).toEqual(draw(42));
    expect(draw(42)).not.toEqual(draw(43));
  });
});
