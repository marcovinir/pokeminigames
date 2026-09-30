import {
  type BaseStats,
  type CatalogSnapshot,
  type PokemonSnapshot,
  TYPE_NAMES,
  type TypeName,
} from "./snapshot.js";

export const POKEAPI_BASE_URL = "https://pokeapi.co/api/v2";

/** Solo los campos de la respuesta de PokéAPI que usamos. */
export interface PokeApiPokemon {
  id: number;
  name: string;
  types: { slot: number; type: { name: string } }[];
  stats: { base_stat: number; stat: { name: string } }[];
  sprites: { front_default: string | null };
}

export interface PokeApiSpecies {
  names: { language: { name: string }; name: string }[];
}

const STAT_KEYS: Record<string, keyof BaseStats> = {
  hp: "hp",
  attack: "attack",
  defense: "defense",
  "special-attack": "spAttack",
  "special-defense": "spDefense",
  speed: "speed",
};

function spriteFallback(id: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
}

export function toPokemonSnapshot(pokemon: PokeApiPokemon, species: PokeApiSpecies): PokemonSnapshot {
  const types = [...pokemon.types]
    .sort((a, b) => a.slot - b.slot)
    .map((entry) => {
      const name = entry.type.name;
      if (!(TYPE_NAMES as readonly string[]).includes(name)) {
        throw new Error(`Pokémon #${pokemon.id}: tipo desconocido "${name}"`);
      }
      return name as TypeName;
    });

  const stats = {} as BaseStats;
  for (const entry of pokemon.stats) {
    const key = STAT_KEYS[entry.stat.name];
    if (key) stats[key] = entry.base_stat;
  }
  for (const key of Object.values(STAT_KEYS)) {
    if (typeof stats[key] !== "number") throw new Error(`Pokémon #${pokemon.id}: falta la stat ${key}`);
  }

  const nameIn = (language: string) => species.names.find((n) => n.language.name === language)?.name;
  const en = nameIn("en");
  if (!en) throw new Error(`Pokémon #${pokemon.id}: no tiene nombre en inglés`);

  return {
    id: pokemon.id,
    types,
    stats,
    spriteUrl: pokemon.sprites.front_default ?? spriteFallback(pokemon.id),
    // Si PokéAPI aún no tiene el nombre en español, se usa el inglés.
    names: { es: nameIn("es") ?? en, en },
  };
}

export type FetchJson = (path: string) => Promise<unknown>;

export interface FetchCatalogOptions {
  fetchJson: FetchJson;
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}

/** Descarga todas las especies y arma el snapshot. Falla ante el primer error. */
export async function fetchCatalog({
  fetchJson,
  concurrency = 8,
  onProgress,
}: FetchCatalogOptions): Promise<CatalogSnapshot> {
  const { count } = (await fetchJson("pokemon-species?limit=1")) as { count: number };
  const results: PokemonSnapshot[] = new Array<PokemonSnapshot>(count);
  let next = 0;
  let done = 0;
  let failed = false;

  async function worker(): Promise<void> {
    while (!failed && next < count) {
      const id = ++next;
      try {
        const [pokemon, species] = await Promise.all([fetchJson(`pokemon/${id}`), fetchJson(`pokemon-species/${id}`)]);
        results[id - 1] = toPokemonSnapshot(pokemon as PokeApiPokemon, species as PokeApiSpecies);
      } catch (error) {
        failed = true;
        throw error;
      }
      onProgress?.(++done, count);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, count) }, worker));

  return { generatedAt: new Date().toISOString(), source: POKEAPI_BASE_URL, pokemon: results };
}
