import type { Seat } from "@pokemon-minigames/shared";

/** El asiento de enfrente. */
export function rivalSeat(seat: Seat): Seat {
  return seat === 1 ? 2 : 1;
}
