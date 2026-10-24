import type { GamePhase, Seat, SilhouetteConfig, SilhouetteReveal } from "@pokemon-minigames/shared";
import type { PokemonCatalog } from "../../catalog/pokemon-catalog.js";
import type { GameOutcome, PlayerState } from "../engine/types.js";
import type { Rng } from "../rng.js";

/** Una respuesta guardada: lo escrito y cuándo llegó (hora del servidor). */
export interface SilhouetteAnswerState {
  text: string;
  at: number;
}

/** La ronda en juego. `pokemonId` y `token` nunca salen hacia los jugadores antes de la revelación. */
export interface SilhouetteRoundState {
  number: number;
  pokemonId: number;
  token: string;
  startedAt: number;
  deadline: number;
  answers: Partial<Record<Seat, SilhouetteAnswerState>>;
}

/** Estado de una partida de silueta. En `players[].totalStats` van los puntos (y `team` siempre vacío). */
export interface SilhouetteState {
  phase: Exclude<GamePhase, "choosing_types">;
  config: SilhouetteConfig;
  players: Partial<Record<Seat, PlayerState>>;
  round: SilhouetteRoundState | null;
  roundsPlayed: number;
  /** Pokémon ya sorteados en esta partida (no se repiten). */
  used: number[];
  reveals: SilhouetteReveal[];
  expiresAt: number;
  rematch?: true;
  startsAt: number | null;
  graceEndsAt: Partial<Record<Seat, number>>;
  outcome: GameOutcome | null;
}

export interface SilhouetteDeps {
  catalog: PokemonCatalog;
  rng: Rng;
  /** Un identificador opaco y aleatorio para la URL de la silueta de cada ronda. */
  newToken: () => string;
}
