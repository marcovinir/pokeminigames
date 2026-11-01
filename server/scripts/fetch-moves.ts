import { readFileSync, writeFileSync } from "node:fs";
import type { BaseStats, MoveData, TypeName } from "@pokemon-minigames/shared";
import { POKEAPI_BASE_URL } from "../src/catalog/pokeapi.js";
import { FILLER_MOVES, type RawMove, isUsableMove, selectMoves, toMoveData } from "../src/game/auction/move-selection.js";

/** Genera `data/moves.snapshot.json`: los 4 movimientos y la habilidad de cada Pokémon. `npm run moves:fetch -w server` */
const MAX_ATTEMPTS = 4;
const CONCURRENCY = 16;

async function fetchJson<T>(path: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(`${POKEAPI_BASE_URL}/${path}`);
      if (response.ok) return (await response.json()) as T;
      throw new Error(`HTTP ${response.status} en ${path}`);
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
}

async function inPool<T, R>(items: T[], work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]!);
    }
  }));
  return results;
}

interface RawPokemon {
  moves: { move: { name: string } }[];
  abilities: { ability: { name: string }; is_hidden: boolean; slot: number }[];
}
interface RawAbility {
  name: string;
  names: { name: string; language: { name: string } }[];
}

const { pokemon } = JSON.parse(readFileSync(new URL("../data/catalog.snapshot.json", import.meta.url), "utf8")) as { pokemon: { id: number; types: TypeName[]; stats: BaseStats }[] };

console.log("Descargando los Pokémon...");
const raws = await inPool(pokemon, (one) => fetchJson<RawPokemon>(`pokemon/${one.id}`));
const moveNames = [...new Set([...raws.flatMap((raw) => raw.moves.map((one) => one.move.name)), ...FILLER_MOVES])];
console.log(`Descargando ${moveNames.length} movimientos...`);
const rawMoves = await inPool(moveNames, (name) => fetchJson<RawMove>(`move/${name}`));
const usable = new Map<string, MoveData>(rawMoves.filter(isUsableMove).map((move) => [move.name, toMoveData(move)]));
for (const id of FILLER_MOVES) if (!usable.has(id)) throw new Error(`Falta el movimiento básico ${id}`);

const sets: Record<number, { moves: string[]; ability: string | null }> = {};
const frequency = new Map<string, number>();
pokemon.forEach((one, index) => {
  const raw = raws[index]!;
  const learnable = raw.moves.flatMap((entry) => usable.get(entry.move.name) ?? []);
  const ability = raw.abilities.filter((entry) => !entry.is_hidden).sort((a, b) => a.slot - b.slot)[0]?.ability.name ?? null;
  sets[one.id] = { moves: selectMoves(one, learnable), ability };
  if (ability) frequency.set(ability, (frequency.get(ability) ?? 0) + 1);
});

const usedMoves = new Set(Object.values(sets).flatMap((set) => set.moves));
const moves = Object.fromEntries([...usable].filter(([id]) => usedMoves.has(id)));
console.log(`Descargando ${frequency.size} habilidades...`);
const rawAbilities = await inPool([...frequency.keys()], (name) => fetchJson<RawAbility>(`ability/${name}`));
const abilities = Object.fromEntries(rawAbilities.map((raw) => {
  const nameIn = (language: string) => raw.names.find((one) => one.language.name === language)?.name;
  const en = nameIn("en") ?? raw.name;
  return [raw.name, { es: nameIn("es") ?? en, en }];
}));

writeFileSync(new URL("../data/moves.snapshot.json", import.meta.url), `${JSON.stringify({ generatedAt: new Date().toISOString(), source: POKEAPI_BASE_URL, moves, abilities, sets })}\n`);
console.log(`Listo: ${Object.keys(sets).length} Pokémon, ${Object.keys(moves).length} movimientos, ${frequency.size} habilidades.`);
console.log("Habilidades más frecuentes:", [...frequency].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([name, count]) => `${name} ${count}`).join(", "));
