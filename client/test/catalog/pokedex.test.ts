import { describe, expect, it } from "vitest";
import { pokedexNumber } from "../../src/catalog/pokedex";

describe("pokedexNumber", () => {
  it("rellena a tres cifras", () => {
    expect(pokedexNumber(1)).toBe("#001");
    expect(pokedexNumber(25)).toBe("#025");
    expect(pokedexNumber(150)).toBe("#150");
  });

  it("no recorta los de cuatro cifras", () => {
    expect(pokedexNumber(1025)).toBe("#1025");
  });

  it("rechaza lo que no es un número de Pokédex", () => {
    expect(() => pokedexNumber(0)).toThrow(RangeError);
    expect(() => pokedexNumber(-3)).toThrow(RangeError);
    expect(() => pokedexNumber(1.5)).toThrow(RangeError);
    expect(() => pokedexNumber(Number.NaN)).toThrow(RangeError);
  });
});
