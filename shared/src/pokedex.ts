import type { BaseStats, TypeName } from "./types.js";

/** Un texto de los juegos y el idioma en que está: PokeAPI no siempre lo trae en español. */
export interface LocalizedText {
  text: string;
  language: "es" | "en";
}

export type EvolutionCondition =
  | { kind: "level"; level: number; timeOfDay?: "day" | "night" }
  | { kind: "item"; item: string }
  | { kind: "trade" }
  | { kind: "friendship"; timeOfDay?: "day" | "night" }
  /** Lo que no se sabe expresar en pocas palabras: se muestra como «condición especial». */
  | { kind: "other" };

/** Un miembro de la cadena de evolución. `condition` es cómo se llega a él (nula en la primera etapa). */
export interface EvolutionNode {
  id: number;
  name: string;
  condition: EvolutionCondition | null;
  next: EvolutionNode[];
}

export interface PokedexAbility {
  name: string;
  hidden: boolean;
  description: LocalizedText | null;
}

/** Lo ligero de un Pokémon: lo que necesita la lista. */
export interface PokedexEntry {
  id: number;
  names: { es: string; en: string };
  types: TypeName[];
  total: number;
  generation: number;
  spriteUrl: string;
}

/** La ficha completa. */
export interface PokedexDetail extends PokedexEntry {
  stats: BaseStats;
  abilities: PokedexAbility[];
  lore: (LocalizedText & { game: string }) | null;
  evolution: EvolutionNode;
}
