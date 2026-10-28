import type { TypeName } from "@pokemon-minigames/shared";

/** Un Pokémon que sirve de ejemplo en la tarjeta de «Doble tipo»: su número y sus dos tipos (en el orden de la Pokédex). */
export interface DobleTipoExample {
  pokemonId: number;
  types: [TypeName, TypeName];
}

/** Los ejemplos de la tarjeta: cada vez que se abre el menú sale uno. Una prueba los compara con el catálogo. */
export const DOBLE_TIPO_EXAMPLES: readonly DobleTipoExample[] = [
  { pokemonId: 6, types: ["fire", "flying"] },
  { pokemonId: 130, types: ["water", "flying"] },
  { pokemonId: 94, types: ["ghost", "poison"] },
  { pokemonId: 448, types: ["fighting", "steel"] },
  { pokemonId: 445, types: ["dragon", "ground"] },
  { pokemonId: 248, types: ["rock", "dark"] },
  { pokemonId: 282, types: ["psychic", "fairy"] },
  { pokemonId: 1, types: ["grass", "poison"] },
];

/** Un fondo del menú: un fanart con el permiso de su autor. */
export interface MenuBackground {
  /** Ruta de la imagen (en `client/public/menu/`). */
  src: string;
  title: string;
  author: string;
  /** Perfil del autor, enlazado en el crédito. */
  authorUrl: string;
}

/**
 * Los fondos del menú. **Solo entra un dibujo con el permiso de su autor** (anotado en `client/public/menu/CREDITOS.md`):
 * vacía, el menú se ve como siempre.
 */
export const MENU_BACKGROUNDS: readonly MenuBackground[] = [];

/** Uno al azar (o nada si la lista está vacía). */
export function pickRandom<T>(items: readonly T[], random: () => number = Math.random): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}
