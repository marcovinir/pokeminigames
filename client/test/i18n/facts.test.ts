import type { PokemonFact } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import { factText } from "../../src/i18n/facts";

const p = (id: number, es: string) => ({ id, es });

describe("factText", () => {
  it("redacta cada tipo de dato en español, con los nombres de los Pokémon y las etiquetas del cliente", () => {
    const cases: [PokemonFact, string][] = [
      [{ kind: "top_stat", stat: "total", pokemon: [p(150, "Mewtwo")], value: 680 }, "El Pokémon con más stats base totales es Mewtwo (680)."],
      [{ kind: "top_stat", stat: "defense", pokemon: [p(213, "Shuckle")], value: 230 }, "El Pokémon con más defensa base es Shuckle (230)."],
      [{ kind: "top_stat", stat: "hp", pokemon: [p(242, "Chansey")], value: 255 }, "El Pokémon con más PS base es Chansey (255)."],
      [{ kind: "top_stat", stat: "spAttack", pokemon: [p(1, "Alfa")], value: 194 }, "El Pokémon con más ataque especial base es Alfa (194)."],
      [{ kind: "lowest_total", pokemon: [p(191, "Sunkern")], value: 180 }, "El Pokémon con menos stats base totales es Sunkern (180)."],
      [{ kind: "type_count", type: "water", count: 134 }, "Hay 134 Pokémon de tipo agua."],
      [{ kind: "type_count", type: "steel", count: 1 }, "Solo hay 1 Pokémon de tipo acero."],
      [{ kind: "dual_type_count", count: 524, total: 1025 }, "524 de los 1025 Pokémon tienen dos tipos."],
      [{ kind: "pair_count", count: 130 }, "Existen 130 combinaciones de dos tipos con al menos un Pokémon."],
      [{ kind: "common_pair", pair: ["flying", "fire"], count: 17 }, "La combinación de tipos más común es volador y fuego: la tienen 17 Pokémon."],
    ];
    for (const [fact, text] of cases) expect(factText(fact), fact.kind).toBe(text);
  });

  it("con un empate lista a todos con «y» y pone el verbo en plural", () => {
    expect(factText({ kind: "top_stat", stat: "speed", pokemon: [p(1, "Alfa"), p(2, "Beto")], value: 200 })).toBe("Los Pokémon con más velocidad base son Alfa y Beto (200).");
    expect(factText({ kind: "lowest_total", pokemon: [p(1, "Alfa"), p(2, "Beto"), p(3, "Gama")], value: 180 })).toBe(
      "Los Pokémon con menos stats base totales son Alfa, Beto y Gama (180).",
    );
  });
});
