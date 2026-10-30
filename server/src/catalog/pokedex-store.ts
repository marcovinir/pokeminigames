import { readFileSync } from "node:fs";
import type { PokedexDetail, PokedexEntry } from "@pokemon-minigames/shared";

export interface PokedexStore {
  entries(): PokedexEntry[];
  detail(id: number): PokedexDetail | undefined;
}

/** La Pokédex en memoria, de solo lectura: lo ligero de cada Pokémon se prepara una vez. */
export function createPokedexStore(details: PokedexDetail[]): PokedexStore {
  const byId = new Map(details.map((detail) => [detail.id, detail]));
  const entries: PokedexEntry[] = details.map(({ id, names, types, total, generation, spriteUrl }) => ({ id, names, types, total, generation, spriteUrl }));
  return {
    entries: () => entries,
    detail: (id) => byId.get(id),
  };
}

/** Lee `server/data/pokedex.snapshot.json` (se versiona con el proyecto: no depende de que PokeAPI responda). */
export function loadPokedex(url: URL): PokedexStore {
  const { pokemon } = JSON.parse(readFileSync(url, "utf8")) as { pokemon: PokedexDetail[] };
  return createPokedexStore(pokemon);
}
