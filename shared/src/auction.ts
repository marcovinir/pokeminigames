import type { PokemonView, Seat, TypeName } from "./types.js";

export const AUCTION_ITEMS = ["pocion", "revivir", "cinta"] as const;
export type AuctionItem = (typeof AUCTION_ITEMS)[number];

/** Lo que se puede subir sobre la puja actual. */
export const BID_STEPS = [10_000, 50_000, 100_000] as const;
export type BidStep = (typeof BID_STEPS)[number];

/** El lote abierto. De un Pokémon solo va la URL opaca de su silueta: nunca qué Pokémon es. */
export interface AuctionLotView {
  /** Del 1 al 9: lotes de Pokémon y de objetos, en orden. */
  number: number;
  kind: "pokemon" | "item";
  silhouetteUrl?: string;
  item?: AuctionItem;
  price: number;
  currentBid: number | null;
  leader: Seat | null;
  turn: Seat;
  deadline: number;
  /** Lo máximo que puedes pujar tú (reserva lo necesario para completar tu equipo). */
  myLimit: number;
}

/** Un Pokémon comprado, ya revelado. `wasTrap`: la silueta que se vio era de otro. */
export interface AuctionRevealEntry {
  owner: Seat;
  pokemon: PokemonView;
  wasTrap: boolean;
}

/** Lo propio de la subasta en el estado de la sala. Las pujas y el dinero se ven: es una subasta abierta. */
export interface AuctionStateView {
  money: Record<Seat, number>;
  /** Cuántos Pokémon lleva cada uno: quiénes son no se sabe hasta la revelación. */
  teamSizes: Record<Seat, number>;
  items: Record<Seat, AuctionItem[]>;
  lot: AuctionLotView | null;
  reveal: AuctionRevealEntry[];
  /** Desde la revelación hasta el final. */
  battle?: BattleView;
}

/** Cómo se cerró un lote. Sin identidad: el Pokémon no se revela al venderse. */
export interface AuctionSalePayload {
  lot: number;
  kind: "pokemon" | "item";
  /** Nulo si nadie se llevó el objeto. */
  winner: Seat | null;
  paid: number;
  item?: AuctionItem;
}

/** Un movimiento: el ataque de un tipo, Forcejeo (sin tipo) o Recuperar. */
export type BattleMove = TypeName | "forcejeo" | "recuperar";

/** Lo que pasó en un turno, en orden, para animarlo. */
export interface BattleAction {
  actor: Seat;
  move: BattleMove;
  damage: number;
  critical: boolean;
  effectiveness: number;
  healed: number;
  actorHp: number;
  targetHp: number;
}

export interface BattleFighterView {
  pokemon: PokemonView;
  hp: number;
  maxHp: number;
}

export interface BattleMoveView {
  move: BattleMove;
  /** Contra el titular rival; nula hasta que se sabe quién es. */
  effectiveness: number | null;
  /** Recuperar ya se usó en este asalto. */
  used: boolean;
}

/**
 * El combate visto por un jugador. Lo que el rival aún no confirmó no va: ni su titular mientras elige, ni su movimiento,
 * ni siquiera si ya eligió.
 */
export interface BattleView {
  round: number;
  turn: number;
  /** Hasta cuándo se puede decidir; nula mientras se anima un turno. */
  deadline: number | null;
  /** Ya confirmé en este paso (revelación, alineación, movimiento o pausa). */
  confirmed: boolean;
  /** Lo que yo decidí en este paso, para recuperarlo al recargar. Lo del rival nunca va. */
  myLineup: number[] | null;
  myMove: BattleMove | null;
  myPause: PauseChoice | null;
  myTeam: BattleFighterView[];
  rivalTeam: BattleFighterView[];
  myTitular: number | null;
  rivalTitular: number | null;
  moves: BattleMoveView[];
  cinta: Record<Seat, boolean>;
}

/** Lo que alguien decide en la pausa: objetos y quién sale a pelear. */
export interface PauseChoice {
  items: { item: AuctionItem; target: number | null }[];
  titular: number;
}

/** Totales de la partida, para el resumen. */
export interface AuctionSummary {
  damage: Record<Seat, number>;
  spent: Record<Seat, { pokemon: number; items: number }>;
  reveal: AuctionRevealEntry[];
}

