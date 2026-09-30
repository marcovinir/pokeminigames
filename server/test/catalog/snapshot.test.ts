import { describe, expect, it } from "vitest";
import {
  type CatalogSnapshot,
  type PokemonSnapshot,
  TYPE_NAMES,
  totalStats,
  typeId,
  validateSnapshot,
} from "../../src/catalog/snapshot.js";

function pokemon(overrides: Partial<PokemonSnapshot> = {}): PokemonSnapshot {
  return {
    id: 6,
    types: ["fire", "flying"],
    stats: { hp: 78, attack: 84, defense: 78, spAttack: 109, spDefense: 85, speed: 100 },
    spriteUrl: "https://example.com/6.png",
    names: { es: "Charizard", en: "Charizard" },
    ...overrides,
  };
}

function snapshot(...list: PokemonSnapshot[]): CatalogSnapshot {
  return { generatedAt: "2026-01-01T00:00:00.000Z", source: "test", pokemon: list };
}

describe("totalStats", () => {
  it("suma las seis stats base (Charizard = 534)", () => {
    expect(totalStats(pokemon().stats)).toBe(534);
  });
});

describe("tipos", () => {
  it("hay 18 tipos y el id es la posición + 1", () => {
    expect(TYPE_NAMES).toHaveLength(18);
    expect(typeId("normal")).toBe(1);
    expect(typeId("fairy")).toBe(18);
  });
});

describe("validateSnapshot", () => {
  it("acepta un snapshot correcto", () => {
    expect(validateSnapshot(snapshot(pokemon(), pokemon({ id: 7, types: ["water"], names: { es: "Squirtle", en: "Squirtle" } })))).toEqual([]);
  });

  it("rechaza un snapshot vacío", () => {
    expect(validateSnapshot(snapshot())).toEqual(["El snapshot no tiene Pokémon"]);
  });

  it("detecta ids repetidos", () => {
    const problems = validateSnapshot(snapshot(pokemon(), pokemon({ names: { es: "Otro", en: "Other" } })));
    expect(problems.some((p) => p.includes("id repetido"))).toBe(true);
  });

  it("detecta cantidades de tipos inválidas y tipos repetidos o desconocidos", () => {
    const problems = validateSnapshot(
      snapshot(
        pokemon({ id: 1, types: [], names: { es: "A", en: "A" } }),
        pokemon({ id: 2, types: ["fire", "fire"], names: { es: "B", en: "B" } }),
        pokemon({ id: 3, types: ["stellar" as never], names: { es: "C", en: "C" } }),
      ),
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        "#1: debe tener 1 o 2 tipos",
        "#2: tipos repetidos",
        '#3: tipo desconocido "stellar"',
      ]),
    );
  });

  it("detecta stats inválidas, sprite vacío y nombres vacíos", () => {
    const problems = validateSnapshot(
      snapshot(
        pokemon({
          stats: { hp: 0, attack: 84, defense: 78, spAttack: 109, spDefense: 85, speed: 100 },
          spriteUrl: "",
          names: { es: "", en: "!!!" },
        }),
      ),
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        "#6: stat hp inválida (0)",
        "#6: sin sprite",
        "#6: nombre es vacío",
        "#6: nombre en vacío",
      ]),
    );
  });

  it("detecta un nombre normalizado que apunta a dos Pokémon distintos", () => {
    const problems = validateSnapshot(
      snapshot(
        pokemon({ id: 1, names: { es: "Mr. Mime", en: "Mr Mime" } }),
        pokemon({ id: 2, names: { es: "Otro", en: "MrMime" } }),
      ),
    );
    expect(problems.some((p) => p.includes('"mrmime" es ambiguo'))).toBe(true);
  });

  it("permite que el nombre en español y en inglés de un mismo Pokémon coincidan", () => {
    expect(validateSnapshot(snapshot(pokemon({ names: { es: "Pikachu", en: "pikachu" } })))).toEqual([]);
  });
});
