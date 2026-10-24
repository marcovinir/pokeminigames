import type { ErrorCode } from "./errors.js";
import type { RematchState } from "./rematch.js";
import type { SilhouetteReveal, SilhouetteStateView } from "./silhouette.js";
import type {
  GameEndReason,
  GamePhase,
  PickResult,
  PokemonView,
  RoomConfig,
  Seat,
  TypeName,
} from "./types.js";

export interface RoomPlayerView {
  seat: Seat;
  username: string;
  /** Solo está (y vale `true`) si es un invitado: sin cuenta, sin estadísticas. Ausente = cuenta. */
  guest?: boolean;
  /** Número de Pokédex de su avatar. Ausente = iniciales (y así un cliente o servidor viejo sigue funcionando). */
  avatarId?: number;
  connected: boolean;
  totalStats: number;
  teamSize: number;
}

/** Estado completo de la partida desde el punto de vista de un jugador. */
export interface RoomStateView {
  /** Hora del servidor (ms) al generar este estado; sirve para calcular el desfase del reloj. */
  serverNow: number;
  code: string;
  phase: GamePhase;
  config: RoomConfig;
  mySeat: Seat;
  players: RoomPlayerView[];
  /** Equipo propio completo. */
  myTeam: PokemonView[];
  /** El equipo del rival: solo lo que ya se reveló al cerrarse cada ronda (nunca lo que escribió en la ronda abierta). */
  opponentTeam: PokemonView[];
  roundsPlayed: number;
  startsAt: number | null;
  /** Solo está (y vale `true`) en las salas que nacen de una revancha. Ausente = sala normal. */
  rematch?: true;
  /** Solo en las salas de silueta: su ronda y sus revelaciones. En ellas `round` es nulo y `totalStats` son puntos. */
  silhouette?: SilhouetteStateView;
  /** Hasta cuándo puede volver el rival si está desconectado. */
  opponentGraceEndsAt: number | null;
  round: {
    number: number;
    pair: [TypeName, TypeName] | null;
    deadline: number | null;
    /** Ya envié mi respuesta en esta ronda. */
    answered: boolean;
    /** Ya elegí mi tipo en esta ronda. */
    typeChosen: boolean;
  } | null;
}

export interface RoundPlayerResult {
  seat: Seat;
  result: PickResult;
  /** Lo que escribió el jugador; nulo si no respondió. */
  text: string | null;
  /** Pokémon que ganó en esta ronda, si lo hubo. */
  pokemon: PokemonView | null;
  totalStats: number;
  teamSize: number;
}

export interface RoundResultPayload {
  round: number;
  /** Cuándo empieza la siguiente ronda (hora del servidor, ms); nulo si la partida terminó. */
  nextRoundAt: number | null;
  type1: TypeName;
  type2: TypeName;
  results: Record<Seat, RoundPlayerResult>;
  /**
   * Un Pokémon de ese par que nadie tiene, para enseñar qué se podía contestar. Solo viene si acertaron 0 o 1 jugadores y
   * queda alguno libre.
   */
  example?: PokemonView;
}

export interface GameEndedPayload {
  winnerSeat: Seat | null;
  reason: GameEndReason;
  teams: Record<Seat, PokemonView[]>;
  totals: Record<Seat, number>;
  /** Solo en la silueta: todas las revelaciones de la partida. En ella `teams` va vacío y `totals` son puntos. */
  silhouette?: { reveals: SilhouetteReveal[] };
}

export interface RoundStartedPayload {
  serverNow: number;
  round: number;
  type1: TypeName;
  type2: TypeName;
  deadline: number;
  /** El par elegido no era válido y el servidor sorteó otro. */
  typesNotice?: "pair_replaced";
}

export interface ClientToServerEvents {
  "join-room": (payload: { code: string }) => void;
  "choose-type": (payload: { type: string }) => void;
  "submit-pokemon": (payload: { text: string }) => void;
  "leave-room": () => void;
  /** Pedir la revancha o aceptar la que pidió el rival. */
  "rematch-request": () => void;
  /** Cancelar la revancha que pedí o rechazar la que pidió el rival. */
  "rematch-cancel": () => void;
}

export interface ServerToClientEvents {
  "room-state": (payload: RoomStateView) => void;
  "player-joined": (payload: { username: string; guest?: boolean; avatarId?: number }) => void;
  "game-starting": (payload: { startsAt: number; serverNow: number }) => void;
  "choose-types": (payload: { round: number; deadline: number; serverNow: number }) => void;
  "type-received": (payload: { round: number }) => void;
  "round-started": (payload: RoundStartedPayload) => void;
  "answer-received": (payload: { round: number }) => void;
  "round-result": (payload: RoundResultPayload) => void;
  "game-ended": (payload: GameEndedPayload) => void;
  "opponent-disconnected": (payload: { graceEndsAt: number; serverNow: number }) => void;
  "opponent-reconnected": () => void;
  error: (payload: { code: ErrorCode; message: string }) => void;
  /** El estado de la oferta de revancha tras terminar la partida (se reenvía al cambiar, al llegar el récord y al reconectar). */
  "rematch-state": (payload: RematchState) => void;
  /** Los dos aceptaron: la sala de la revancha ya existe, hay que entrar a ella. */
  "rematch-room": (payload: { code: string }) => void;
  "silhouette-round-started": (payload: { serverNow: number; round: number; totalRounds: number; deadline: number; silhouetteUrl: string }) => void;
  "silhouette-answer-received": (payload: { ms: number }) => void;
  "silhouette-round-result": (payload: { serverNow: number; reveal: SilhouetteReveal; totals: Record<Seat, number>; nextRoundAt: number | null }) => void;
}

export type ServerEventName = keyof ServerToClientEvents;

/** Un evento del servidor con su nombre y su carga, como unión discriminada. */
export type ServerEvent = {
  [K in ServerEventName]: { name: K; payload: Parameters<ServerToClientEvents[K]>[0] };
}[ServerEventName];
