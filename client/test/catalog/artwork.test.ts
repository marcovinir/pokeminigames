import { TYPE_NAMES } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import { artworkUrl, spriteUrl, typeIconUrl } from "../../src/catalog/artwork";

describe("artworkUrl", () => {
  it("apunta al arte oficial de PokeAPI de ese Pokémon", () => {
    expect(artworkUrl(25)).toBe(
      "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png",
    );
    expect(artworkUrl(1025)).toMatch(/\/official-artwork\/1025\.png$/);
  });

  it.each([0, -3, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rechaza el id %s (no es un número de Pokédex)", (id) => {
    expect(() => artworkUrl(id)).toThrow(RangeError);
  });
});

describe("spriteUrl", () => {
  it("apunta al sprite pequeño de PokeAPI de ese Pokémon", () => {
    expect(spriteUrl(25)).toBe("https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png");
    expect(spriteUrl(1025)).toMatch(/\/sprites\/pokemon\/1025\.png$/);
  });

  it.each([0, -3, 1.5, Number.NaN])("rechaza el id %s (no es un número de Pokédex)", (id) => {
    expect(() => spriteUrl(id)).toThrow(RangeError);
  });
});

describe("typeIconUrl", () => {
  it("apunta al icono oficial (Escarlata y Púrpura) de PokeAPI, con el número del tipo", () => {
    expect(typeIconUrl("normal")).toBe(
      "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/types/generation-ix/scarlet-violet/1.png",
    );
    expect(typeIconUrl("fire")).toMatch(/\/scarlet-violet\/10\.png$/);
    expect(typeIconUrl("fairy")).toMatch(/\/scarlet-violet\/18\.png$/);
  });

  it("cada uno de los 18 tipos tiene su propia imagen, del 1 al 18 en el orden de los tipos", () => {
    const numbers = TYPE_NAMES.map((type) => Number(/(\d+)\.png$/.exec(typeIconUrl(type))![1]));
    expect(numbers).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
  });

  it("rechaza un tipo que no existe", () => {
    expect(() => typeIconUrl("sonido" as never)).toThrow(RangeError);
  });
});
