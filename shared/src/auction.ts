import type { PokemonView, Seat } from "./types.js";

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
