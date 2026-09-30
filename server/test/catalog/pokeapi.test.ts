import { describe, expect, it } from "vitest";
import {
  type FetchJson,
  type PokeApiPokemon,
  type PokeApiSpecies,
  fetchCatalog,
  toPokemonSnapshot,
} from "../../src/catalog/pokeapi.js";

const charizard: PokeApiPokemon = {
  id: 6,
  name: "charizard",
  // Desordenado a propósito: el mapeo debe respetar el slot.
  types: [
    { slot: 2, type: { name: "flying" } },
    { slot: 1, type: { name: "fire" } },
  ],
  stats: [
    { base_stat: 78, stat: { name: "hp" } },
    { base_stat: 84, stat: { name: "attack" } },
    { base_stat: 78, stat: { name: "defense" } },
    { base_stat: 109, stat: { name: "special-attack" } },
    { base_stat: 85, stat: { name: "special-defense" } },
    { base_stat: 100, stat: { name: "speed" } },
  ],
  sprites: { front_default: "https://example.com/6.png" },
};

const charizardSpecies: PokeApiSpecies = {
  names: [
    { language: { name: "ja" }, name: "リザードン" },
    { language: { name: "en" }, name: "Charizard" },
    { language: { name: "es" }, name: "Charizard" },
  ],
};

describe("toPokemonSnapshot", () => {
  it("mapea tipos, stats, sprite y nombres", () => {
    expect(toPokemonSnapshot(charizard, charizardSpecies)).toEqual({
      id: 6,
      types: ["fire", "flying"],
      stats: { hp: 78, attack: 84, defense: 78, spAttack: 109, spDefense: 85, speed: 100 },
      spriteUrl: "https://example.com/6.png",
      names: { es: "Charizard", en: "Charizard" },
    });
  });

  it("usa el nombre en inglés cuando falta el español", () => {
    const species = { names: [{ language: { name: "en" }, name: "Charizard" }] };
    expect(toPokemonSnapshot(charizard, species).names).toEqual({ es: "Charizard", en: "Charizard" });
  });

  it("usa el sprite de respaldo cuando PokéAPI no trae uno", () => {
    const pokemon = { ...charizard, sprites: { front_default: null } };
    expect(toPokemonSnapshot(pokemon, charizardSpecies).spriteUrl).toContain("/sprites/pokemon/6.png");
  });

  it("falla con un tipo que no es uno de los 18", () => {
    const pokemon = { ...charizard, types: [{ slot: 1, type: { name: "stellar" } }] };
    expect(() => toPokemonSnapshot(pokemon, charizardSpecies)).toThrow(/stellar/);
  });

  it("falla si falta una stat", () => {
    const pokemon = { ...charizard, stats: charizard.stats.slice(0, 5) };
    expect(() => toPokemonSnapshot(pokemon, charizardSpecies)).toThrow(/speed/);
  });

  it("falla si no hay nombre en inglés", () => {
    expect(() => toPokemonSnapshot(charizard, { names: [] })).toThrow(/inglés/);
  });
});

function fakeApi(count: number, onCall?: (path: string) => Promise<void>): FetchJson {
  return async (path) => {
    await onCall?.(path);
    if (path === "pokemon-species?limit=1") return { count };
    const match = /^(pokemon|pokemon-species)\/(\d+)$/.exec(path);
    if (!match) throw new Error(`ruta inesperada ${path}`);
    const id = Number(match[2]);
    if (match[1] === "pokemon") return { ...charizard, id, name: `p${id}` };
    return { names: [{ language: { name: "en" }, name: `Poke${id}` }] };
  };
}

describe("fetchCatalog", () => {
  it("devuelve los Pokémon ordenados por id aunque las respuestas lleguen desordenadas", async () => {
    const api = fakeApi(10, (path) => new Promise((resolve) => setTimeout(resolve, path.endsWith("/3") ? 30 : 1)));
    const snapshot = await fetchCatalog({ fetchJson: api, concurrency: 4 });
    expect(snapshot.pokemon.map((p) => p.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(snapshot.source).toBe("https://pokeapi.co/api/v2");
  });

  it("no supera la concurrencia indicada", async () => {
    let inFlight = 0;
    let peak = 0;
    const api = fakeApi(20, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight--;
    });
    await fetchCatalog({ fetchJson: api, concurrency: 3 });
    // Cada Pokémon hace 2 peticiones en paralelo: 3 trabajadores × 2.
    expect(peak).toBeLessThanOrEqual(6);
  });

  it("informa el progreso hasta el total", async () => {
    const calls: [number, number][] = [];
    await fetchCatalog({ fetchJson: fakeApi(5), onProgress: (done, total) => calls.push([done, total]) });
    expect(calls).toHaveLength(5);
    expect(calls.at(-1)).toEqual([5, 5]);
  });

  it("se detiene y propaga el error ante el primer fallo", async () => {
    const api = fakeApi(10, async (path) => {
      if (path === "pokemon/4") throw new Error("404 pokemon/4");
    });
    await expect(fetchCatalog({ fetchJson: api })).rejects.toThrow("404 pokemon/4");
  });

  it("funciona con menos Pokémon que trabajadores", async () => {
    const snapshot = await fetchCatalog({ fetchJson: fakeApi(2), concurrency: 8 });
    expect(snapshot.pokemon).toHaveLength(2);
  });
});
