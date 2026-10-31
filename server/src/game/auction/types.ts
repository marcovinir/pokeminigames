import type { AuctionConfig, AuctionItem, AuctionRevealEntry, BattleMove, GamePhase, PauseChoice, Seat } from "@pokemon-minigames/shared";
import type { PokemonCatalog } from "../../catalog/pokemon-catalog.js";
import type { GameOutcome, PlayerState } from "../engine/types.js";
import type { Rng } from "../rng.js";
import type { Fighter } from "./combat.js";

/** `realId` y `token` nunca salen hacia los jugadores antes de la revelación. `shownId` tampoco: solo su silueta. */
export interface AuctionPokemonLot {
  kind: "pokemon";
  realId: number;
  shownId: number;
  price: number;
  token: string | null;
}

export interface AuctionItemLot {
  kind: "item";
  item: AuctionItem;
  price: number;
}

export type AuctionLot = AuctionPokemonLot | AuctionItemLot;

/** La puja del lote abierto. `turnId` deja obsoletos los temporizadores de turnos anteriores. */
export interface AuctionBidding {
  starter: Seat;
  turn: Seat;
  currentBid: number | null;
  leader: Seat | null;
  firstPassed: boolean;
  deadline: number;
  turnId: number;
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
  cinta: Record<Seat, boolean>;
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
  money: Record<Seat, number>;
  /** Los números reales de cada equipo. */
  teams: Record<Seat, number[]>;
  items: Record<Seat, AuctionItem[]>;
  reveal: AuctionRevealEntry[];
  /** Quién ya confirmó que vio la revelación. */
  readyForBattle: Seat[];
  battle: AuctionBattle | null;
  spent: Record<Seat, { pokemon: number; items: number }>;
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
