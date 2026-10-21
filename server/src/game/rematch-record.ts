import type { GameResult, RematchRecord, Seat } from "@pokemon-minigames/shared";
import type { HeadToHead } from "./ports.js";

/**
 * El récord entre dos cuentas visto desde un asiento: el asiento 1 es la persona A de la consulta y el 2 es su espejo
 * (se invierten `mine` y `theirs`, y `won` y `lost`).
 */
export function recordFor(head: HeadToHead, seat: Seat): RematchRecord {
  const mine = seat === 1 ? head.winsA : head.winsB;
  const theirs = seat === 1 ? head.winsB : head.winsA;
  const resultOf = (outcome: "a" | "b" | "draw"): GameResult => (outcome === "draw" ? "drawn" : (outcome === "a") === (seat === 1) ? "won" : "lost");
  return { mine, theirs, draws: head.draws, played: mine + theirs + head.draws, recent: head.recent.map(resultOf) };
}
