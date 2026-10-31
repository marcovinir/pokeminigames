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

/** Un fondo del menú: un fanart. */
export interface MenuBackground {
  /** Ruta de la imagen (en `client/public/menu/`). */
  src: string;
  title: string;
  /** Vertical (para el teléfono) u horizontal (para pantallas anchas). */
  shape: "portrait" | "landscape";
  /** Su autor, si se sabe; sin él, el crédito dice «autor desconocido» y ofrece «¿Es tuyo?» (lleva a Contacto). */
  author?: string;
  /** Perfil del autor, enlazado en el crédito (solo con `author`). */
  authorUrl?: string;
}

/**
 * Los fondos del menú; cada vez que se abre sale uno. De dónde sale cada uno y quién decidió usarlo se anota en
 * `client/public/menu/CREDITOS.md`; si un autor pide retirarlo o que se le dé crédito, se hace aquí.
 */
export const MENU_BACKGROUNDS: readonly MenuBackground[] = [
  { src: "/menu/umbreon.webp", title: "Umbreon", shape: "portrait" },
  { src: "/menu/espeon.webp", title: "Espeon", shape: "portrait" },
  { src: "/menu/eevee.webp", title: "Eevee", shape: "landscape" },
  { src: "/menu/lucario.webp", title: "Lucario", shape: "landscape" },
  { src: "/menu/charizard.webp", title: "Charizard", shape: "landscape" },
];

/** Uno al azar (o nada si la lista está vacía). */
/** Pokémon de silueta inconfundible para las portadas de «¿Quién es ese Pokémon?» y de la subasta. */
export const SILHOUETTE_COVERS: readonly number[] = [94, 25, 6, 150, 143, 133, 448, 658, 59, 39, 384, 130];

export interface GameCovers {
  silhouette: number;
  auction: number;
}

/** Una silueta para cada juego, siempre distintas: si no, las dos tarjetas se parecerían. */
export function pickCovers(random: () => number = Math.random): GameCovers {
  const index = Math.min(SILHOUETTE_COVERS.length - 1, Math.floor(random() * SILHOUETTE_COVERS.length));
  return { silhouette: SILHOUETTE_COVERS[index]!, auction: SILHOUETTE_COVERS[(index + 1) % SILHOUETTE_COVERS.length]! };
}

export function pickRandom<T>(items: readonly T[], random: () => number = Math.random): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}
