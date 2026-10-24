import { describe, expect, it } from "vitest";
import { PokemonCatalog } from "../../src/catalog/pokemon-catalog.js";
import { silhouettePoints } from "../../src/game/silhouette/points.js";
import { silhouettePool } from "../../src/game/silhouette/pool.js";
import { fixtureCatalog, fixtureCatalogPokemon } from "../helpers/fixtures.js";

describe("silhouettePoints", () => {
  it.each([
    [0, 1000],
    [3000, 820],
    [7500, 550],
    [15000, 100],
    [-50, 1000],
    [20000, 100],
  ])("%i ms → %i puntos", (ms, points) => {
    expect(silhouettePoints(ms)).toBe(points);
  });
});

describe("silhouettePool", () => {
  // El catálogo de pruebas con números repartidos entre generaciones: 1 (Kanto), 152 (Johto), 906 (Paldea)...
  const spread = new PokemonCatalog(
    fixtureCatalogPokemon().map((pokemon, index) => ({ ...pokemon, id: [1, 25, 151, 152, 251, 252, 494, 906, 1000, 1025][index]! })),
  );

  it("solo devuelve Pokémon de las generaciones elegidas, ordenados", () => {
    expect(silhouettePool(spread, [1])).toEqual([1, 25, 151]);
    expect(silhouettePool(spread, [9, 2])).toEqual([152, 251, 906, 1000, 1025]);
    expect(silhouettePool(spread, [1, 2, 3, 4, 5, 6, 7, 8, 9])).toHaveLength(10);
  });

  it("vacío si ninguno cae en esas generaciones", () => {
    expect(silhouettePool(fixtureCatalog(), [2])).toEqual([]);
  });
});
