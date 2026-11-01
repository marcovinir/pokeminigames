import type { PokemonView, Seat, TypeName } from "./types.js";

/** El fondo de cada lote y del combate. Se sortea sin mirar el Pokémon, para que no lo delate. */
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

/** El identificador de un movimiento real, o `forcejeo` si ya no quedan PP. */
export type BattleMove = string;

/** Algo que pasó además del golpe, para el registro. */
export type BattleNote =
  | { kind: "status"; seat: Seat; status: Status }
  | { kind: "stat"; seat: Seat; stat: BoostStat; change: number }
  | { kind: "ability"; seat: Seat; ability: string }
  | { kind: "recoil"; seat: Seat; damage: number }
  | { kind: "residual"; seat: Seat; cause: "burn" | "poison"; damage: number }
  | { kind: "no_effect"; seat: Seat }
  | { kind: "failed" }
  | { kind: "woke"; seat: Seat }
  | { kind: "healed"; seat: Seat; amount: number };

export type Status = "burn" | "paralysis" | "poison" | "sleep";
export type BoostStat = "attack" | "defense" | "spAttack" | "spDefense" | "speed";

/** Lo que hace un movimiento además de su daño. Solo los efectos que el combate implementa. */
export interface MoveEffect {
  ailment?: Status;
  ailmentChance?: number;
  stats?: { stat: BoostStat; change: number; target: "user" | "rival"; chance: number }[];
  /** Porcentaje de los PS máximos que cura al usuario. */
  healing?: number;
}

/** Un movimiento real, de la instantánea de PokéAPI. */
export interface MoveData {
  id: string;
  names: { es: string; en: string };
  type: TypeName;
  category: "physical" | "special" | "status";
  power: number | null;
  accuracy: number | null;
  pp: number;
  effect: MoveEffect;
}

/** Quién entró a pelear en un turno: los cambios van antes que los ataques. */
export interface BattleSwitch {
  seat: Seat;
  pokemonId: number;
}

/** Lo que pasó en un turno, en orden, para animarlo. */
export interface BattleAction {
  actor: Seat;
  move: BattleMove;
  moveName: string;
  damage: number;
  critical: boolean;
  effectiveness: number;
  healed: number;
  actorHp: number;
  targetHp: number;
  missed: boolean;
  /** No pudo actuar. */
  blocked: "sleep" | "paralysis" | null;
  notes: BattleNote[];
}

export interface BattleFighterView {
  pokemon: PokemonView;
  hp: number;
  maxHp: number;
  /** Con `active` falso se muestra sin efecto. */
  ability: { id: string; name: string; description: string; active: boolean } | null;
  status: Status | null;
  stages: Partial<Record<BoostStat, number>>;
}

export interface BattleMoveView {
  move: BattleMove;
  name: string;
  /** Nulo en Forcejeo, que no tiene tipo. */
  type: TypeName | null;
  category: "physical" | "special" | "status";
  power: number | null;
  accuracy: number | null;
  pp: number;
  maxPp: number;
  /** Contra el titular rival; nula hasta que se sabe quién es, o si no hace daño. */
  effectiveness: number | null;
  /** Qué hace además, en una frase; nula si solo hace daño. */
  effect: string | null;
}

/**
 * El combate visto por un jugador. Lo que el rival aún no confirmó no va: ni su titular mientras elige, ni su movimiento,
 * ni siquiera si ya eligió.
 */
export interface BattleView {
  round: number;
  turn: number;
  /** El escenario, uno por combate. */
  scene: AuctionScene;
  /** Hasta cuándo se puede decidir en la revelación, la alineación o la pausa. Elegir movimiento no tiene reloj: siempre nula. */
  deadline: number | null;
  /** Se está eligiendo movimiento; falso mientras se anima un turno. */
  choosing: boolean;
  /** Identifica este paso: «Sigo aquí» lo manda para que una pulsación tardía no valga para otro. */
  stepId: number;
  /** Hasta cuándo puedo responder «Sigo aquí». Solo lo recibe quien aún no eligió. */
  warningUntil: number | null;
  /** Yo ya elegí y el rival lleva tiempo sin hacerlo. */
  rivalIdle: boolean;
  /** Ya confirmé en este paso (revelación, alineación, movimiento o pausa). */
  confirmed: boolean;
  /** Lo que yo decidí en este paso, para recuperarlo al recargar. Lo del rival nunca va. */
  myLineup: number[] | null;
  myMove: BattleMove | null;
  /** A quién elegí sacar este turno. */
  mySwitch: number | null;
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

