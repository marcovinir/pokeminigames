import { describe, expect, it } from "vitest";
import type { HeadToHead } from "../../src/game/ports.js";
import { mirrorRecord, recordFor } from "../../src/game/rematch-record.js";

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

describe("mirrorRecord", () => {
  it("da el mismo récord visto desde el otro lado: invierte mine y theirs, y won y lost; los empates y played no cambian", () => {
    const record = { mine: 3, theirs: 2, draws: 1, played: 6, recent: ["won", "drawn", "lost"] as const };
    expect(mirrorRecord({ ...record, recent: [...record.recent] })).toEqual({ mine: 2, theirs: 3, draws: 1, played: 6, recent: ["lost", "drawn", "won"] });
  });

  it("dos espejos devuelven el original", () => {
    const record = { mine: 1, theirs: 4, draws: 0, played: 5, recent: ["lost", "won"] as ("won" | "lost" | "drawn")[] };
    expect(mirrorRecord(mirrorRecord(record))).toEqual(record);
  });
});
