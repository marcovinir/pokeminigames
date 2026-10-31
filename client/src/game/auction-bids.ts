import { type AuctionLotView, BID_STEPS, type BidStep } from "@pokemon-minigames/shared";

export interface BidOption {
  /** `null` abre el lote al precio inicial. */
  step: BidStep | null;
  /** A cuánto queda la puja: es lo que dice el botón. */
  amount: number;
  affordable: boolean;
}

/** Lo que se puede pujar en un lote, con las mismas reglas que el servidor: abrir al precio inicial o subir un salto. */
export function bidOptions(lot: AuctionLotView): BidOption[] {
  const option = (step: BidStep | null, amount: number): BidOption => ({ step, amount, affordable: amount <= lot.myLimit });
  if (lot.currentBid === null) return [option(null, lot.price)];
  const current = lot.currentBid;
  return BID_STEPS.map((step) => option(step, current + step));
}
