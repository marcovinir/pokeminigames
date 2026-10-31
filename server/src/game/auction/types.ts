import type { AuctionConfig, AuctionItem, AuctionRevealEntry, GamePhase, Seat } from "@pokemon-minigames/shared";
import type { PokemonCatalog } from "../../catalog/pokemon-catalog.js";
import type { GameOutcome, PlayerState } from "../engine/types.js";
import type { Rng } from "../rng.js";

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

export interface AuctionState {
  phase: Extract<GamePhase, "waiting" | "starting" | "auction" | "reveal" | "finished">;
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
