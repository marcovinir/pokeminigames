import { describe, expect, it } from "vitest";
import { buildGameEnded, buildRoomState } from "../../src/game/engine/view.js";
import { CHOSEN_3, Harness, RANDOM_3 } from "./harness.js";

describe("vistas de la partida", () => {
  it("antes de empezar: fase, jugadores y sin ronda", () => {
    const h = new Harness({ config: RANDOM_3 });
    h.dispatch({ type: "PLAYER_JOINED", userId: "u2", username: "misty" });
    h.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
    const view = buildRoomState(h.state, 1, "ABC234", h.catalog);

    expect(view).toMatchObject({ code: "ABC234", phase: "waiting", mySeat: 1, roundsPlayed: 0, round: null, startsAt: null });
    expect(view.players).toEqual([
      { seat: 1, username: "ash", connected: true, totalStats: 0, teamSize: 0 },
      { seat: 2, username: "misty", connected: false, totalStats: 0, teamSize: 0 },
    ]);
    expect(view.myTeam).toEqual([]);
  });

  it("muestra el equipo propio completo pero del rival solo totales y tamaño", () => {
    const h = new Harness({ config: RANDOM_3, rng: [0] });
    h.startGame();
    h.submit(1, "Alfa");
    h.submit(2, "Beto");

    const mine = buildRoomState(h.state, 1, "ABC234", h.catalog);
    expect(mine.myTeam.map((p) => p.id)).toEqual([1]);
    expect(mine.players.find((p) => p.seat === 2)).toMatchObject({ totalStats: 400, teamSize: 1 });
    const json = JSON.stringify(mine);
    expect(json).not.toContain("Beto");
    expect(json).not.toContain("Beta");

    const theirs = buildRoomState(h.state, 2, "ABC234", h.catalog);
    expect(theirs.myTeam.map((p) => p.id)).toEqual([2]);
    expect(JSON.stringify(theirs)).not.toContain("Alfa");
  });

  it("en una ronda activa incluye el par, el plazo y si ya respondí", () => {
    const h = new Harness({ config: RANDOM_3, rng: [0] });
    h.startGame();
    h.submit(1, "Alfa");
    const mine = buildRoomState(h.state, 1, "X", h.catalog);
    const theirs = buildRoomState(h.state, 2, "X", h.catalog);
    expect(mine.round).toMatchObject({ number: 1, pair: ["flying", "fire"], answered: true, typeChosen: false });
    expect(theirs.round?.answered).toBe(false);
    expect(mine.phase).toBe("round_active");
  });

  it("en la elección de tipos indica si ya elegí, sin revelar el tipo del rival", () => {
    const h = new Harness({ config: CHOSEN_3 });
    h.startGame();
    h.choose(1, "fire");
    const mine = buildRoomState(h.state, 1, "X", h.catalog);
    const theirs = buildRoomState(h.state, 2, "X", h.catalog);
    expect(mine.round).toMatchObject({ pair: null, typeChosen: true });
    expect(theirs.round).toMatchObject({ pair: null, typeChosen: false });
    expect(JSON.stringify(theirs)).not.toContain("fire");
  });

  it("informa la cuenta atrás y la gracia de reconexión del rival", () => {
    const h = new Harness({ config: RANDOM_3, rng: [0] });
    h.seatBoth();
    expect(buildRoomState(h.state, 1, "X", h.catalog).startsAt).toBe(h.state.startsAt);

    h.advance(5000);
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
    const view = buildRoomState(h.state, 1, "X", h.catalog);
    expect(view.startsAt).toBeNull();
    expect(view.opponentGraceEndsAt).toBe(h.now + 30_000);
    expect(buildRoomState(h.state, 2, "X", h.catalog).opponentGraceEndsAt).toBeNull();
  });

  it("el resumen final incluye los dos equipos completos", () => {
    const h = new Harness({ config: { ...RANDOM_3, roundsLimit: 3 }, rng: [0] });
    h.startGame();
    h.dispatch({ type: "LEAVE", seat: 2 });
    const ended = buildGameEnded(h.state, h.catalog);
    expect(ended).toEqual({ winnerSeat: 1, reason: "forfeit", teams: { 1: [], 2: [] }, totals: { 1: 0, 2: 0 } });
  });
});
