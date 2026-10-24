import { generationOf } from "@pokemon-minigames/shared";
import type { PokemonName } from "../api/types";

/** Solo los nombres de esas generaciones: las sugerencias de una sala de silueta. */
export function namesInGenerations(names: PokemonName[], generations: readonly number[]): PokemonName[] {
  const wanted = new Set(generations);
  return names.filter((name) => wanted.has(generationOf(name.id) ?? 0));
}
