import { TYPE_NAMES, type TypeName } from "@pokemon-minigames/shared";

const REPO = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites";
const BASE = `${REPO}/pokemon/other/official-artwork`;
const TYPE_ICONS = `${REPO}/types/generation-ix/scarlet-violet`;

function assertPokedexNumber(id: number): void {
  if (!Number.isInteger(id) || id < 1) throw new RangeError(`Número de Pokédex inválido: ${id}`);
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
