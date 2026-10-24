import type { GameEndReason, DobleTipoConfig, Seat, ServerEvent } from "@pokemon-minigames/shared";
import type { RoundRecord } from "./engine/types.js";

/** Reloj inyectable: en las pruebas se controla a mano. */
export interface Clock {
  now(): number;
}

/** Programa una función para más tarde y devuelve cómo cancelarla. */
export interface Scheduler {
  schedule(delayMs: number, fn: () => void): () => void;
}

/** Envía eventos a los jugadores de una sala. Quién recibe qué lo decide la sala, no el transporte. */
export interface Broadcaster {
  toSeat(code: string, seat: Seat, event: ServerEvent): void;
  toAll(code: string, event: ServerEvent): void;
}

export interface FinishInput {
  status: "completed" | "abandoned";
  /** Por qué terminó; la base de datos exige que sea coherente con `status`. */
  reason: GameEndReason;
  winnerUserId: string | null;
  finalStats: Partial<Record<Seat, number>>;
}

/** El historial completo entre dos cuentas: victorias de cada una, empates y las últimas partidas (la más reciente primero). */
export interface HeadToHead {
  winsA: number;
  winsB: number;
  draws: number;
  recent: ("a" | "b" | "draw")[];
}

export interface GameRepository {
  /** Crea la partida en `waiting` con el creador en el asiento 1 y devuelve su id. */
  createGame(input: { roomCode: string; config: DobleTipoConfig; creatorUserId: string }): Promise<string>;
  addSecondPlayer(gameId: string, userId: string): Promise<void>;
  removeSecondPlayer(gameId: string): Promise<void>;
  markStarted(gameId: string): Promise<void>;
  saveRound(gameId: string, round: RoundRecord): Promise<void>;
  finish(gameId: string, input: FinishInput): Promise<void>;
  /** Borra una partida que sigue `waiting` y sus jugadores (porque entró un invitado y esa partida no se guarda). */
  discardGame(gameId: string): Promise<void>;
  /**
   * El récord entre dos cuentas: solo partidas `completed` (con `endedAt`) en las que participan las dos, como las
   * estadísticas. `recent` es cuántas de las últimas se devuelven. Una lectura: no escribe nada.
   */
  headToHead(userA: string, userB: string, recent: number): Promise<HeadToHead>;
  /** Marca como abandonadas las partidas que quedaron `waiting` o `in_progress` (p. ej. tras reiniciar). */
  abandonUnfinished(): Promise<number>;
}

export const systemClock: Clock = { now: () => Date.now() };

export const timerScheduler: Scheduler = {
  schedule(delayMs, fn) {
    const timer = setTimeout(fn, delayMs);
    // Un temporizador pendiente no debe impedir que el proceso termine.
    timer.unref();
    return () => clearTimeout(timer);
  },
};
