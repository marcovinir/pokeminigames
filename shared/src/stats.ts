import type { GameEndReason, PokemonView, RoomConfig } from "./types.js";

/** Cómo terminó una partida para quien la mira. */
export type GameResult = "won" | "drawn" | "lost";

export const HISTORY_DEFAULT_LIMIT = 20;
export const HISTORY_MAX_LIMIT = 50;

export interface TopPokemon {
  pokemon: PokemonView;
  /** Veces que la persona ganó este Pokémon en una ronda. */
  wins: number;
}

/** Estadísticas de una persona; solo cuentan las partidas completadas. */
export interface Stats {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** De 0 a 1; nulo si no ha jugado ninguna. */
  winRate: number | null;
  /** Victorias consecutivas más recientes; un empate o una derrota la corta. */
  currentStreak: number;
  bestStreak: number;
  /** Promedio de total_stats de los Pokémon ganados, con un decimal; nulo si no ganó ninguno. */
  averagePower: number | null;
  /** Mayor puntaje final de una partida completada; nulo si no ha jugado. */
  bestGameScore: number | null;
  topPokemon: TopPokemon[];
}

/** Respuesta de `GET /stats` y `GET /users/:username/stats`. */
export interface StatsResponse {
  username: string;
  /** Número de Pokédex de su avatar; nulo = iniciales. */
  avatarId: number | null;
  stats: Stats;
}

export interface HistoryEntry {
  id: string;
  /** Fecha de fin, en ISO 8601. */
  endedAt: string;
  result: GameResult;
  /** Nulo en las partidas anteriores a que se guardara el motivo. */
  reason: GameEndReason | null;
  /** El rival con su avatar de hoy (no el que tenía en esa partida); nulo = iniciales. */
  opponent: { username: string; avatarId: number | null };
  myScore: number | null;
  opponentScore: number | null;
  config: RoomConfig;
}

/** Respuesta de `GET /stats/history`. */
export interface HistoryPage {
  games: HistoryEntry[];
  /** Cursor opaco para pedir la página siguiente; nulo en la última. */
  nextCursor: string | null;
}
