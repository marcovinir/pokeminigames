import type { GameResult, Stats, TopPokemon } from "@pokemon-minigames/shared";
import type { PokemonCatalog } from "../catalog/pokemon-catalog.js";
import { toPokemonView } from "../game/engine/view.js";

/** Cuántos Pokémon se muestran en "los más ganados". */
export const TOP_POKEMON_LIMIT = 3;

/** Una partida completada, vista por una de las dos personas que la jugaron. */
export interface FinishedGame {
  id: string;
  endedAt: Date;
  result: GameResult;
  /** Puntaje final de esta persona; nulo si no se guardó. */
  score: number | null;
}

export type GameRecord = Pick<
  Stats,
  "played" | "wins" | "draws" | "losses" | "winRate" | "currentStreak" | "bestStreak" | "bestGameScore"
>;

/** Un ganador nulo es un empate; si no, gana quien coincide con `winnerId`. */
export function resultFor(winnerId: string | null, userId: string): GameResult {
  if (winnerId === null) return "drawn";
  return winnerId === userId ? "won" : "lost";
}

/** De la más reciente a la más antigua; con la misma fecha de fin, la de id mayor es la más reciente. */
export function sortRecentFirst<T extends { id: string; endedAt: Date }>(games: readonly T[]): T[] {
  return [...games].sort((a, b) => {
    const byDate = b.endedAt.getTime() - a.endedAt.getTime();
    if (byDate !== 0) return byDate;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

export function computeRecord(games: readonly FinishedGame[]): GameRecord {
  const recentFirst = sortRecentFirst(games);
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let bestGameScore: number | null = null;
  for (const game of recentFirst) {
    if (game.result === "won") wins++;
    else if (game.result === "drawn") draws++;
    else losses++;
    if (game.score !== null && (bestGameScore === null || game.score > bestGameScore)) bestGameScore = game.score;
  }

  // La racha actual son las victorias seguidas desde la partida más reciente; un empate o una derrota la corta.
  let currentStreak = 0;
  for (const game of recentFirst) {
    if (game.result !== "won") break;
    currentStreak++;
  }
  let bestStreak = 0;
  let run = 0;
  for (const game of recentFirst) {
    run = game.result === "won" ? run + 1 : 0;
    if (run > bestStreak) bestStreak = run;
  }

  const played = games.length;
  return {
    played,
    wins,
    draws,
    losses,
    winRate: played === 0 ? null : wins / played,
    currentStreak,
    bestStreak,
    bestGameScore,
  };
}

/** Los Pokémon que más veces se ganaron; con la misma cantidad, el de id más bajo. Ignora ids que no están en el catálogo. */
export function computeTopPokemon(
  pokemonIds: readonly number[],
  catalog: PokemonCatalog,
  limit: number = TOP_POKEMON_LIMIT,
): TopPokemon[] {
  const wins = new Map<number, number>();
  for (const id of pokemonIds) {
    if (catalog.get(id)) wins.set(id, (wins.get(id) ?? 0) + 1);
  }
  return [...wins.entries()]
    .sort(([idA, winsA], [idB, winsB]) => winsB - winsA || idA - idB)
    .slice(0, limit)
    .map(([id, count]) => ({ pokemon: toPokemonView(catalog.get(id)!), wins: count }));
}

/** Promedio del total_stats de los Pokémon ganados (cada victoria cuenta), con un decimal; nulo si no hay ninguno. */
export function computeAveragePower(pokemonIds: readonly number[], catalog: PokemonCatalog): number | null {
  let sum = 0;
  let count = 0;
  for (const id of pokemonIds) {
    const pokemon = catalog.get(id);
    if (!pokemon) continue;
    sum += pokemon.totalStats;
    count++;
  }
  return count === 0 ? null : Math.round((sum / count) * 10) / 10;
}

export function buildStats(games: readonly FinishedGame[], wonPokemonIds: readonly number[], catalog: PokemonCatalog): Stats {
  return {
    ...computeRecord(games),
    averagePower: computeAveragePower(wonPokemonIds, catalog),
    topPokemon: computeTopPokemon(wonPokemonIds, catalog),
  };
}
