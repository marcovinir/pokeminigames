import { readFileSync } from "node:fs";
import type { EvolutionNode, PokedexDetail } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import type { CatalogSnapshot } from "../../src/catalog/snapshot.js";

const read = <T>(file: string): T => JSON.parse(readFileSync(new URL(`../../data/${file}`, import.meta.url), "utf8")) as T;
const { pokemon } = read<{ pokemon: PokedexDetail[] }>("pokedex.snapshot.json");
const catalog = read<CatalogSnapshot>("catalog.snapshot.json");

const members = (node: EvolutionNode): EvolutionNode[] => [node, ...node.next.flatMap(members)];

describe("server/data/pokedex.snapshot.json", () => {
  it("tiene los 1025 Pokémon, en orden y sin huecos", () => {
    expect(pokemon.map((one) => one.id)).toEqual(Array.from({ length: 1025 }, (_, index) => index + 1));
  });

  it("cada uno tiene al menos una habilidad, una generación válida y aparece en su propia cadena", () => {
    for (const one of pokemon) {
      expect(one.abilities.length, `#${one.id}`).toBeGreaterThan(0);
      expect(one.generation, `#${one.id}`).toBeGreaterThanOrEqual(1);
      expect(one.generation, `#${one.id}`).toBeLessThanOrEqual(9);
      expect(members(one.evolution).map((node) => node.id), `#${one.id}`).toContain(one.id);
    }
  });

  it("todo Pokémon de una cadena existe", () => {
    const ids = new Set(pokemon.map((one) => one.id));
    for (const one of pokemon) for (const node of members(one.evolution)) expect(ids.has(node.id), `#${one.id} → #${node.id}`).toBe(true);
  });

  it("nombres y tipos coinciden con el catálogo del juego", () => {
    catalog.pokemon.forEach((one, index) => {
      expect(pokemon[index]!.names, `#${one.id}`).toEqual(one.names);
      expect(pokemon[index]!.types, `#${one.id}`).toEqual(one.types);
    });
  });

  it("casos conocidos: Eevee con 8 ramas, Vaporeon con Piedra Agua, Charmeleon a nivel 16", () => {
    expect(pokemon[132]!.evolution.next).toHaveLength(8);
    expect(pokemon[133]!.evolution.next[0]!.condition).toEqual({ kind: "item", item: "Piedra Agua" });
    expect(pokemon[4]!.evolution.next[0]!.condition).toEqual({ kind: "level", level: 16 });
    expect(pokemon[5]!.total).toBe(534);
  });

  it("los textos en otro idioma están marcados como inglés, nunca sin marcar", () => {
    for (const one of pokemon) if (one.lore) expect(["es", "en"], `#${one.id}`).toContain(one.lore.language);
  });
});
