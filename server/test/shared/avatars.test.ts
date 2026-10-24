import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AVATAR_POKEMON, avatarPokemonName, isAvatarPokemon } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";

interface SnapshotPokemon {
  id: number;
  names: { es: string };
}

const snapshot = JSON.parse(readFileSync(join(import.meta.dirname, "../../data/catalog.snapshot.json"), "utf8")) as {
  pokemon: SnapshotPokemon[];
};

describe("los avatares", () => {
  it("son 24, sin repetir, en el orden aprobado", () => {
    expect(AVATAR_POKEMON.map((p) => p.id)).toEqual([
      25, 6, 1, 7, 94, 133, 143, 150, 149, 130, 197, 249, 248, 257, 282, 384, 448, 445, 571, 658, 700, 778, 887, 59,
    ]);
    expect(AVATAR_POKEMON[4]).toEqual({ id: 94, name: "Gengar" });
    expect(AVATAR_POKEMON.at(-1)).toEqual({ id: 59, name: "Arcanine" });
  });

  it.each([
    [25, true],
    [59, true],
    [906, false],
    [0, false],
    [25.5, false],
    ["25", false],
    [null, false],
  ])("isAvatarPokemon(%j) → %s", (value, expected) => {
    expect(isAvatarPokemon(value)).toBe(expected);
  });

  it("el nombre de un avatar fuera de la lista no rompe", () => {
    expect(avatarPokemonName(94)).toBe("Gengar");
    expect(avatarPokemonName(906)).toBe("Pokémon n.º 906");
  });

  it("cada nombre coincide con el del catálogo en español", () => {
    for (const { id, name } of AVATAR_POKEMON) {
      expect(snapshot.pokemon.find((p) => p.id === id)?.names.es, `n.º ${id}`).toBe(name);
    }
  });
});
