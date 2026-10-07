const BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork";

/** El arte oficial grande (475 × 475) de un Pokémon, a partir de su número de Pokédex. */
export function artworkUrl(id: number): string {
  if (!Number.isInteger(id) || id < 1) throw new RangeError(`Número de Pokédex inválido: ${id}`);
  return `${BASE}/${id}.png`;
}
