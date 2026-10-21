import { describe, expect, it } from "vitest";
import type { HeadToHead } from "../../src/game/ports.js";
import { recordFor } from "../../src/game/rematch-record.js";

const head: HeadToHead = { winsA: 3, winsB: 1, draws: 2, recent: ["a", "draw", "b", "a", "draw"] };

describe("recordFor", () => {
  it("el asiento 1 es la persona A y el 2 es el espejo: se invierten mine y theirs, y won y lost", () => {
    expect(recordFor(head, 1)).toEqual({ mine: 3, theirs: 1, draws: 2, played: 6, recent: ["won", "drawn", "lost", "won", "drawn"] });
    expect(recordFor(head, 2)).toEqual({ mine: 1, theirs: 3, draws: 2, played: 6, recent: ["lost", "drawn", "won", "lost", "drawn"] });
  });

  it("played suma victorias, derrotas y empates; sin partidas todo es cero", () => {
    expect(recordFor({ winsA: 1, winsB: 0, draws: 0, recent: ["a"] }, 1).played).toBe(1);
    expect(recordFor({ winsA: 0, winsB: 0, draws: 0, recent: [] }, 2)).toEqual({ mine: 0, theirs: 0, draws: 0, played: 0, recent: [] });
  });
});
