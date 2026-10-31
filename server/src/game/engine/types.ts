import type { BattleMove, BidStep, PauseChoice } from "@pokemon-minigames/shared";
import type {
  ErrorCode,
  GameEndReason,
  GamePhase,
  PickResult,
  DobleTipoConfig,
  RoundResultPayload,
  Seat,
  ServerEvent,
  TypeName,
} from "@pokemon-minigames/shared";
import type { PokemonCatalog, TypePair } from "../../catalog/pokemon-catalog.js";
import type { Rng } from "../rng.js";

export const SEATS: readonly Seat[] = [1, 2];

export function otherSeat(seat: Seat): Seat {
  return seat === 1 ? 2 : 1;
}

export interface PlayerState {
  seat: Seat;
  userId: string;
  username: string;
  /** Es un invitado (sin cuenta): su partida no se guarda. Solo está, y vale `true`, en los invitados. */
  guest?: boolean;
  /** Su avatar al entrar a la sala. Solo está si eligió uno. */
  avatarId?: number;
  connected: boolean;
  totalStats: number;
  /** Ids de los Pokémon del equipo, en el orden en que se ganaron. */
  team: number[];
}

export interface PickState {
  text: string;
  /** Timestamp del servidor en que llegó la respuesta. */
  at: number;
}

export interface RoundState {
  number: number;
  typeChoices: Partial<Record<Seat, TypeName>>;
  pair: TypePair | null;
  deadline: number | null;
  picks: Partial<Record<Seat, PickState>>;
}

export interface GameOutcome {
  winnerSeat: Seat | null;
  reason: GameEndReason;
}

/** Quién ocupa un asiento en los motores: `guest` y `avatarId` solo están cuando aplican. */
export interface SeatOccupant {
  userId: string;
  username: string;
  guest?: boolean;
  avatarId?: number;
}

export interface GameState {
  phase: GamePhase;
  config: DobleTipoConfig;
  players: Partial<Record<Seat, PlayerState>>;
  round: RoundState | null;
  /** Rondas ya cerradas. */
  roundsPlayed: number;
  /** Pokémon reclamado → asiento que lo tiene. Un Pokémon solo puede estar en un equipo. */
  owners: Map<number, Seat>;
  /** Hora a la que caduca la sala si sigue en espera. */
  expiresAt: number;
  /** Solo está (y vale `true`) en las salas que nacen de una revancha: caducan a los 30 s en vez de a los 10 min. */
  rematch?: true;
  startsAt: number | null;
  /** Si un jugador está desconectado en plena partida: hasta cuándo puede volver. */
  graceEndsAt: Partial<Record<Seat, number>>;
  outcome: GameOutcome | null;
  /** El último resultado emitido: se reenvía en el estado de la sala a quien reconecta durante la pausa. */
  lastResult?: RoundResultPayload;
}

/** Identifica un temporizador. Los datos que lleva sirven para ignorarlo si ya quedó obsoleto. */
export type TimerId =
  | { kind: "expire"; expiresAt: number }
  | { kind: "start"; startsAt: number }
  | { kind: "choose"; round: number }
  | { kind: "round"; round: number }
  | { kind: "result"; round: number }
  | { kind: "grace"; seat: Seat; graceEndsAt: number }
  | { kind: "idle"; turn: number; at: number }
  | { kind: "auto_lot"; lot: number }
  | { kind: "battle"; step: number };

export type GameEvent =
  | { type: "PLAYER_JOINED"; userId: string; username: string; guest?: boolean; avatarId?: number }
  | { type: "PLAYER_CONNECTED"; seat: Seat }
  | { type: "PLAYER_DISCONNECTED"; seat: Seat }
  | { type: "CHOOSE_TYPE"; seat: Seat; typeName: string }
  | { type: "SUBMIT"; seat: Seat; text: string }
  | { type: "BID"; seat: Seat; step: BidStep | null; turnId?: number }
  | { type: "PASS"; seat: Seat; turnId?: number }
  | { type: "STILL_HERE"; seat: Seat; turnId: number }
  | { type: "READY"; seat: Seat }
  | { type: "CHOOSE_LINEUP"; seat: Seat; order: number[] }
  | { type: "CHOOSE_MOVE"; seat: Seat; move: BattleMove }
  | { type: "PAUSE_CONFIRM"; seat: Seat; choice: PauseChoice }
  | { type: "LEAVE"; seat: Seat }
  | { type: "TIMER"; timer: TimerId };

export interface RoundRecordPick {
  seat: Seat;
  userId: string;
  text: string | null;
  result: PickResult;
  pokemonId: number | null;
  submittedAt: number | null;
}

export interface RoundRecord {
  number: number;
  pair: TypePair;
  picks: RoundRecordPick[];
}

export type Effect =
  | { kind: "schedule"; at: number; timer: TimerId }
  | { kind: "emit"; to: Seat | "all"; event: ServerEvent }
  /** El orquestador construye el estado completo de ese jugador y se lo envía. */
  | { kind: "send_state"; to: Seat }
  | { kind: "persist_seat_taken"; userId: string }
  /** La silueta de una ronda: el token opaco de su URL y el Pokémon que dibuja (solo para el servidor). */
  | { kind: "register_silhouette"; token: string; pokemonId: number }
  | { kind: "persist_seat_freed" }
  | { kind: "persist_started" }
  | { kind: "persist_round"; record: RoundRecord }
  | {
      kind: "persist_end";
      status: "completed" | "abandoned";
      outcome: GameOutcome;
      finalStats: Partial<Record<Seat, number>>;
    };

export interface ReduceResult {
  state: GameState;
  effects: Effect[];
}

export interface EngineDeps {
  catalog: PokemonCatalog;
  rng: Rng;
}

export type { ErrorCode };
