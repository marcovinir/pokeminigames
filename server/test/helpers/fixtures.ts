import type { BaseStats, TypeName } from "@pokemon-minigames/shared";
import { PokemonCatalog, type CatalogPokemon } from "../../src/catalog/pokemon-catalog.js";
import { type CatalogSnapshot, totalStats } from "../../src/catalog/snapshot.js";

/**
 * Catálogo pequeño y conocido para probar el juego. Pares jugables (al menos 2 Pokémon):
 * volador/fuego (1, 2, 3), tierra/agua (4, 5) y veneno/planta (6, 7).
 * El par acero/eléctrico solo tiene al Pokémon 8, así que no es jugable.
 */
export interface FixtureSpec {
  id: number;
  es: string;
  en: string;
  types: TypeName[];
  total: number;
}

export const FIXTURE_SPECS: FixtureSpec[] = [
  { id: 1, es: "Alfa", en: "Alpha", types: ["fire", "flying"], total: 500 },
  { id: 2, es: "Beto", en: "Beta", types: ["fire", "flying"], total: 400 },
  { id: 3, es: "Gama", en: "Gamma", types: ["fire", "flying"], total: 300 },
  { id: 4, es: "Delta", en: "Delta", types: ["water", "ground"], total: 450 },
  { id: 5, es: "Épsilon", en: "Epsilon", types: ["water", "ground"], total: 350 },
  { id: 6, es: "Zeta", en: "Zeta", types: ["grass", "poison"], total: 600 },
  { id: 7, es: "Eta", en: "Eta", types: ["grass", "poison"], total: 200 },
  { id: 8, es: "Teta", en: "Theta", types: ["electric", "steel"], total: 380 },
  { id: 9, es: "Iota", en: "Iota", types: ["fire"], total: 350 },
  { id: 10, es: "Kapa", en: "Kappa", types: ["water"], total: 250 },
];

/** Reparte un total en seis stats enteras positivas que suman exactamente ese total. */
export function statsFor(total: number): BaseStats {
  const base = Math.floor(total / 6);
  const hp = total - base * 5;
  return { hp, attack: base, defense: base, spAttack: base, spDefense: base, speed: base };
}

export function fixtureCatalogPokemon(): CatalogPokemon[] {
  return FIXTURE_SPECS.map((spec) => {
    const stats = statsFor(spec.total);
    return {
      id: spec.id,
      names: { es: spec.es, en: spec.en },
      spriteUrl: `https://example.com/${spec.id}.png`,
      types: spec.types,
      stats,
      totalStats: totalStats(stats),
    };
  });
}

export function fixtureCatalog(): PokemonCatalog {
  return new PokemonCatalog(fixtureCatalogPokemon());
}

/** El mismo catálogo en el formato del snapshot, para cargarlo en la base de datos de pruebas. */
export function fixtureSnapshot(): CatalogSnapshot {
  return {
    generatedAt: "2026-01-01T00:00:00.000Z",
    source: "fixture",
    pokemon: FIXTURE_SPECS.map((spec) => ({
      id: spec.id,
      types: spec.types,
      stats: statsFor(spec.total),
      spriteUrl: `https://example.com/${spec.id}.png`,
      names: { es: spec.es, en: spec.en },
    })),
  };
}
