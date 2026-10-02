import type { TypeName } from "@pokemon-minigames/shared";
import { readableOn } from "./contrast";

const TYPE_BACKGROUNDS: Record<TypeName, string> = {
  normal: "#a8a77a",
  fighting: "#c22e28",
  flying: "#a98ff3",
  poison: "#a33ea1",
  ground: "#e2bf65",
  rock: "#b6a136",
  bug: "#a6b91a",
  ghost: "#735797",
  steel: "#b7b7ce",
  fire: "#ee8130",
  water: "#6390f0",
  grass: "#7ac74c",
  electric: "#f7d02c",
  psychic: "#f95587",
  ice: "#96d9d6",
  dragon: "#6f35fc",
  dark: "#705746",
  fairy: "#d685ad",
};

export interface TypeStyle {
  background: string;
  color: string;
}

/** Color de cada tipo y el texto que se lee bien sobre él, igual en todos los temas y modos. */
export const TYPE_STYLES: Record<TypeName, TypeStyle> = Object.fromEntries(
  Object.entries(TYPE_BACKGROUNDS).map(([type, background]) => [type, { background, color: readableOn(background) }]),
) as Record<TypeName, TypeStyle>;
