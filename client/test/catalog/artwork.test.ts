import { describe, expect, it } from "vitest";
import { artworkUrl } from "../../src/catalog/artwork";

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
