import type { TypeName } from "@pokemon-minigames/shared";
import type { CSSProperties } from "react";
import { mixHex, readableOn } from "./contrast";

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

export interface TypeGradient {
  top: string;
  bottom: string;
  color: string;
}

/**
 * El degradado de relieve de un chip: con texto claro el color del tipo queda arriba y se oscurece hacia abajo; con
 * texto oscuro el color queda abajo y se aclara hacia arriba. Así el texto se lee sobre los dos extremos igual de bien
 * (o mejor) que sobre el color del tipo.
 */
export function typeGradient(type: TypeName): TypeGradient {
  const { background, color } = TYPE_STYLES[type];
  return color === "#ffffff"
    ? { top: background, bottom: mixHex(background, "#000000", 0.28), color }
    : { top: mixHex(background, "#ffffff", 0.3), bottom: background, color };
}

/** El estilo en línea de un chip o tesela de tipo. */
export function typeChipStyle(type: TypeName): CSSProperties {
  const { top, bottom, color } = typeGradient(type);
  return { background: `linear-gradient(180deg, ${top}, ${bottom})`, color };
}
