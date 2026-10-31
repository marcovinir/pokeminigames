import type { AuctionConfig, AuctionRevealEntry, AuctionScene, BattleMove, GamePhase, PauseChoice, Seat } from "@pokemon-minigames/shared";
import type { PokemonCatalog } from "../../catalog/pokemon-catalog.js";
import type { GameOutcome, PlayerState } from "../engine/types.js";
import type { Rng } from "../rng.js";
import type { Fighter } from "./combat.js";

/** `realId` y `token` nunca salen hacia los jugadores antes de la revelación. `shownId` tampoco: solo su silueta. */
export interface AuctionLot {
  realId: number;
  shownId: number;
  price: number;
  token: string | null;
  scene: AuctionScene;
}

/** La puja del lote abierto. `turnId` deja obsoletos los temporizadores de turnos anteriores. */
export interface AuctionBidding {
  starter: Seat;
  turn: Seat;
  currentBid: number | null;
  leader: Seat | null;
  bids: { seat: Seat; amount: number }[];
  retired: Seat | null;
  turnId: number;
  /** Cuándo se abre el aviso de inactividad. */
  idleAt: number;
  warningUntil: number | null;
  stillHere: number;
  /** Se le acabó el plazo estando caído: al volver tiene un último aviso. */
  expiredAway: boolean;
}

/** El combate. `step` deja obsoletos los temporizadores de pasos anteriores. */
export interface AuctionBattle {
  fighters: Record<Seat, Fighter[]>;
  titular: Record<Seat, number | null>;
  round: number;
  turn: number;
  /** Lo que cada uno decidió en el paso actual. Nunca sale hacia el rival antes de resolverse. */
  lineups: Partial<Record<Seat, number[]>>;
  moves: Partial<Record<Seat, BattleMove>>;
  pauses: Partial<Record<Seat, PauseChoice>>;
  healed: Record<Seat, boolean>;
  deadline: number | null;
  step: number;
  /** El asalto ya terminó: al acabar la animación se abre la pausa. */
  roundOver: boolean;
  damage: Record<Seat, number>;
}

export interface AuctionState {
  phase: Extract<GamePhase, "waiting" | "starting" | "auction" | "reveal" | "lineup" | "battle" | "battle_pause" | "finished">;
  config: AuctionConfig;
  players: Partial<Record<Seat, PlayerState>>;
  lots: AuctionLot[];
  lotIndex: number;
  /** Quién empieza el próximo lote: se van turnando. */
  nextStarter: Seat;
  bidding: AuctionBidding | null;
  /** El lote abierto se reparte solo, a este asiento. */
  autoWinner: Seat | null;
  money: Record<Seat, number>;
  /** Los números reales de cada equipo. */
  teams: Record<Seat, number[]>;
  /** Las URL de silueta de lo comprado por cada uno. */
  purchases: Record<Seat, string[]>;
  reveal: AuctionRevealEntry[];
  /** Quién ya confirmó que vio la revelación. */
  readyForBattle: Seat[];
  battle: AuctionBattle | null;
  spent: Record<Seat, number>;
  nextTurnId: number;
  expiresAt: number;
  rematch?: true;
  startsAt: number | null;
  graceEndsAt: Partial<Record<Seat, number>>;
  outcome: GameOutcome | null;
}

export interface AuctionDeps {
  catalog: PokemonCatalog;
  rng: Rng;
  newToken: () => string;
}
