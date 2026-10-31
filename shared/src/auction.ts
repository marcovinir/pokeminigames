import type { PokemonView, Seat, TypeName } from "./types.js";

/** El fondo de cada lote. Se sortea sin mirar el Pokémon, para que no lo delate. */
export const AUCTION_SCENES = ["bosque", "volcan", "playa", "noche"] as const;
export type AuctionScene = (typeof AUCTION_SCENES)[number];

/** Lo que se puede subir sobre la puja actual. */
export const BID_STEPS = [10_000, 50_000, 100_000] as const;
export type BidStep = (typeof BID_STEPS)[number];

/** El lote abierto. Del Pokémon solo va la URL opaca de su silueta: nunca qué Pokémon es. */
export interface AuctionLotView {
  /** Del 1 al 12. */
  number: number;
  silhouetteUrl: string;
  scene: AuctionScene;
  price: number;
  currentBid: number | null;
  leader: Seat | null;
  turn: Seat;
  /** Identifica este turno: una pulsación tardía lo manda y el servidor sabe que no era para el turno de ahora. */
  turnId: number;
  /** Las pujas de este lote, de la primera a la última. */
  bids: { seat: Seat; amount: number }[];
  /** Quien se retiró sin haber pujas: ya no vuelve en este lote. */
  retired: Seat | null;
  /** Hasta cuándo puedo responder «Sigo aquí». Solo lo recibe quien tiene el turno. */
  warningUntil: number | null;
  /** El rival lleva tiempo sin decidir. */
  rivalIdle: boolean;
  /** Se reparte solo porque alguien ya completó su equipo: no hay botones. */
  auto: boolean;
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
  /** Las siluetas compradas: quiénes son no se sabe hasta la revelación. */
  purchases: Record<Seat, string[]>;
  lot: AuctionLotView | null;
  reveal: AuctionRevealEntry[];
  /** Desde la revelación hasta el final. */
  battle?: BattleView;
}

/** Cómo se cerró un lote. Sin identidad: el Pokémon no se revela al venderse. */
export interface AuctionSalePayload {
  lot: number;
  winner: Seat;
  paid: number;
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
}

/** Lo que alguien decide en la pausa: quién sale a pelear. */
export interface PauseChoice {
  titular: number;
}

/** Totales de la partida, para el resumen. */
export interface AuctionSummary {
  damage: Record<Seat, number>;
  spent: Record<Seat, number>;
  reveal: AuctionRevealEntry[];
}

