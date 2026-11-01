import { TYPE_NAMES, type TypeName } from "@pokemon-minigames/shared";

const REPO = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites";
const BASE = `${REPO}/pokemon/other/official-artwork`;
const TYPE_ICONS = `${REPO}/types/generation-ix/scarlet-violet`;

function assertPokedexNumber(id: number): void {
  if (!Number.isInteger(id) || id < 1) throw new RangeError(`Número de Pokédex inválido: ${id}`);
}

/** Los que no tienen sprite animado en Showdown: usan el PNG clásico. */
const NO_SHOWDOWN_SPRITE: ReadonlySet<number> = new Set([990, 991, 992, 993, 994, 995, 1006, 1008, 1010, 1017, 1022, 1023, 1024, 1025]);

export type SpriteSide = "front" | "back";

/** El sprite fijo del combate: el PNG clásico, de frente o de espaldas. Existe para todos. */
export function battleStillUrl(id: number, side: SpriteSide): string {
  assertPokedexNumber(id);
  return `${REPO}/pokemon/${side === "back" ? "back/" : ""}${id}.png`;
}

/** El sprite del combate: animado si existe. */
export function battleSpriteUrl(id: number, side: SpriteSide): string {
  assertPokedexNumber(id);
  return NO_SHOWDOWN_SPRITE.has(id) ? battleStillUrl(id, side) : `${REPO}/pokemon/other/showdown/${side === "back" ? "back/" : ""}${id}.gif`;
}

/** El arte oficial grande (475 × 475) de un Pokémon, a partir de su número de Pokédex. */
export function artworkUrl(id: number): string {
  assertPokedexNumber(id);
  return `${BASE}/${id}.png`;
}

/** El sprite pequeño de un Pokémon (el de las listas y las sugerencias), a partir de su número de Pokédex. */
export function spriteUrl(id: number): string {
  assertPokedexNumber(id);
  return `${REPO}/pokemon/${id}.png`;
}

/** El icono oficial de un tipo. En PokeAPI el número de un tipo es su posición en `TYPE_NAMES` más uno. */
export function typeIconUrl(type: TypeName): string {
  const index = TYPE_NAMES.indexOf(type);
  if (index < 0) throw new RangeError(`Tipo desconocido: ${String(type)}`);
  return `${TYPE_ICONS}/${index + 1}.png`;
}
