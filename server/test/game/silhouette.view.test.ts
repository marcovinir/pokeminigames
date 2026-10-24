import { describe, expect, it } from "vitest";
import { buildSilhouetteGameEnded } from "../../src/game/silhouette/view.js";
import { START_TIME } from "./harness.js";
import { SilhouetteHarness } from "./silhouette-harness.js";

const ROUND_START = START_TIME + 5000;
/** Lo que delataría al Pokémon de la ronda 1 (Alfa, n.º 1). */
const LEAKS = ["Alfa", "Alpha", "official-artwork", "sprites", "example.com/1.png", '"id":1,'];

describe("silueta: vista", () => {
  it("en plena ronda trae la silueta, si ya respondí y las revelaciones anteriores", () => {
    const h = new SilhouetteHarness();
    h.startGame();
    h.submit(1, "Beto");
    h.advance(15_000 + 6000 + 2000);
    h.submit(2, "x");
    const mine = h.view(2);
    expect(mine).toMatchObject({ phase: "round_active", round: null, myTeam: [], opponentTeam: [], roundsPlayed: 1 });
    expect(mine.silhouette).toEqual({
      totalRounds: 5,
      round: { number: 2, deadline: ROUND_START + 21_000 + 15_000, silhouetteUrl: "/silhouettes/tok2", answered: true, answeredMs: 2000 },
      reveals: [expect.objectContaining({ round: 1 })],
    });
    expect(h.view(1).silhouette?.round).toMatchObject({ answered: false, answeredMs: null });
  });

  it("los puntos van en totalStats de cada jugador", () => {
    const h = new SilhouetteHarness();
    h.startGame();
    h.submit(1, "Alfa");
    h.advance(15_000);
    expect(h.view(1).players.map((p) => p.totalStats)).toEqual([1000, 0]);
  });

  it("antes de la revelación nada delata al Pokémon, ni siquiera la respuesta acertada del rival", () => {
    const h = new SilhouetteHarness();
    h.startGame();
    h.submit(1, "Alfa");
    for (const seat of [1, 2] as const) {
      const seen = h.receivedBy(seat) + JSON.stringify(h.view(seat));
      for (const leak of seat === 1 ? LEAKS.filter((l) => l !== "Alfa") : LEAKS) expect(seen, `asiento ${seat}: ${leak}`).not.toContain(leak);
    }
    // Quien respondió ve su propia respuesta solo en el campo de texto de su pantalla, no en el estado de la sala.
    expect(JSON.stringify(h.view(1))).not.toContain("Alfa");
  });

  it("el resumen final lleva puntos, equipos vacíos y todas las revelaciones", () => {
    const h = new SilhouetteHarness();
    h.startGame();
    for (let round = 1; round <= 5; round++) h.advance(15_000 + 6000);
    expect(buildSilhouetteGameEnded(h.state, h.catalog)).toMatchObject({
      winnerSeat: null,
      reason: "completed",
      teams: { 1: [], 2: [] },
      totals: { 1: 0, 2: 0 },
      silhouette: { reveals: expect.any(Array) },
    });
  });
});
