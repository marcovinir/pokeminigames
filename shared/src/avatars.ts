/** Un Pokémon que se puede elegir como avatar: su número de Pokédex y su nombre en español. */
export interface AvatarPokemon {
  id: number;
  name: string;
}

/** Los 24 avatares que eligió Marco (populares, de varias generaciones), en el orden en que se muestran. */
export const AVATAR_POKEMON: readonly AvatarPokemon[] = [
  { id: 25, name: "Pikachu" },
  { id: 6, name: "Charizard" },
  { id: 1, name: "Bulbasaur" },
  { id: 7, name: "Squirtle" },
  { id: 94, name: "Gengar" },
  { id: 133, name: "Eevee" },
  { id: 143, name: "Snorlax" },
  { id: 150, name: "Mewtwo" },
  { id: 149, name: "Dragonite" },
  { id: 130, name: "Gyarados" },
  { id: 197, name: "Umbreon" },
  { id: 249, name: "Lugia" },
  { id: 248, name: "Tyranitar" },
  { id: 257, name: "Blaziken" },
  { id: 282, name: "Gardevoir" },
  { id: 384, name: "Rayquaza" },
  { id: 448, name: "Lucario" },
  { id: 445, name: "Garchomp" },
  { id: 571, name: "Zoroark" },
  { id: 658, name: "Greninja" },
  { id: 700, name: "Sylveon" },
  { id: 778, name: "Mimikyu" },
  { id: 887, name: "Dragapult" },
  { id: 59, name: "Arcanine" },
];

const BY_ID = new Map(AVATAR_POKEMON.map((pokemon) => [pokemon.id, pokemon.name]));

/** Es el número de uno de los 24: lo único que el servidor acepta al guardar un avatar. */
export function isAvatarPokemon(value: unknown): value is number {
  return typeof value === "number" && BY_ID.has(value);
}

/**
 * El nombre de un avatar. Si la lista cambia, quien ya tenía uno que salió de ella lo conserva: de ese solo se sabe el
 * número, así que se nombra por él.
 */
export function avatarPokemonName(id: number): string {
  return BY_ID.get(id) ?? `Pokémon n.º ${id}`;
}
