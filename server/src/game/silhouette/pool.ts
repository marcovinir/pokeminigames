import { generationOf } from "@pokemon-minigames/shared";
import type { PokemonCatalog } from "../../catalog/pokemon-catalog.js";

/** Los números de Pokédex del catálogo que caen en esas generaciones, ordenados: la bolsa de la que se sortea. */
export function silhouettePool(catalog: PokemonCatalog, generations: readonly number[]): number[] {
  const wanted = new Set(generations);
  return catalog
    .all()
    .filter((pokemon) => wanted.has(generationOf(pokemon.id) ?? 0))
    .map((pokemon) => pokemon.id)
    .sort((a, b) => a - b);
}
