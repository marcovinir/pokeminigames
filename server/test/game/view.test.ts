import { describe, expect, it } from "vitest";
import { buildGameEnded, buildRoomState } from "../../src/game/engine/view.js";
import { CHOSEN_3, Harness, RANDOM_3 } from "./harness.js";

describe("vistas de la partida", () => {
  it("incluye la hora del servidor con la que se generó el estado", () => {
    const h = new Harness({ config: RANDOM_3 });
    h.advance(1234);
    expect(buildRoomState(h.state, 1, "ABC234", h.catalog, h.now).serverNow).toBe(h.now);
  });

  it("antes de empezar: fase, jugadores y sin ronda", () => {
    const h = new Harness({ config: RANDOM_3 });
    h.dispatch({ type: "PLAYER_JOINED", userId: "u2", username: "misty" });
    h.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
    const view = buildRoomState(h.state, 1, "ABC234", h.catalog, h.now);

    expect(view).toMatchObject({ code: "ABC234", phase: "waiting", mySeat: 1, roundsPlayed: 0, round: null, startsAt: null });
    expect(view.players).toEqual([
      { seat: 1, username: "ash", connected: true, totalStats: 0, teamSize: 0 },
      { seat: 2, username: "misty", connected: false, totalStats: 0, teamSize: 0 },
    ]);
    expect(view.myTeam).toEqual([]);
    expect(view.opponentTeam).toEqual([]);
  });

  it("un invitado aparece con guest: true en el asiento de la vista de los dos; las cuentas no llevan la clave", () => {
    const h = new Harness({ config: RANDOM_3, creator: { userId: "guest_c", username: "inv", guest: true } });
    h.dispatch({ type: "PLAYER_JOINED", userId: "u2", username: "misty" });
    for (const seat of [1, 2] as const) {
      expect(buildRoomState(h.state, seat, "ABC234", h.catalog, h.now).players).toEqual([
        { seat: 1, username: "inv", connected: false, totalStats: 0, teamSize: 0, guest: true },
        { seat: 2, username: "misty", connected: false, totalStats: 0, teamSize: 0 },
      ]);
    }
    const joined = new Harness({ config: RANDOM_3 });
    joined.dispatch({ type: "PLAYER_JOINED", userId: "guest_x", username: "inv", guest: true });
    expect(buildRoomState(joined.state, 1, "ABC234", joined.catalog, joined.now).players[1]).toMatchObject({ username: "inv", guest: true });
  });

  it("muestra el equipo propio y el que el rival ya reveló al cerrarse las rondas", () => {
    const h = new Harness({ config: RANDOM_3, rng: [0] });
    h.startGame();
    h.submit(1, "Alfa");
    h.submit(2, "Beto");

    const mine = buildRoomState(h.state, 1, "ABC234", h.catalog, h.now);
    expect(mine.myTeam.map((p) => p.id)).toEqual([1]);
    expect(mine.opponentTeam.map((p) => p.id)).toEqual([2]);
    expect(mine.opponentTeam[0]).toMatchObject({ names: { es: "Beto" }, totalStats: 400 });
    expect(mine.players.find((p) => p.seat === 2)).toMatchObject({ totalStats: 400, teamSize: 1 });

    const theirs = buildRoomState(h.state, 2, "ABC234", h.catalog, h.now);
    expect(theirs.myTeam.map((p) => p.id)).toEqual([2]);
    expect(theirs.opponentTeam.map((p) => p.id)).toEqual([1]);
  });

  it("no adelanta nada: con la ronda abierta, lo que el rival ya escribió no aparece en su equipo ni en ninguna parte", () => {
    const h = new Harness({ config: RANDOM_3, rng: [0] });
    h.startGame();
    h.submit(2, "Beto");

    const mine = buildRoomState(h.state, 1, "ABC234", h.catalog, h.now);
    expect(mine.phase).toBe("round_active");
    expect(mine.opponentTeam).toEqual([]);
    expect(JSON.stringify(mine)).not.toContain("Beto");
  });

  it("el equipo del rival llega en el orden en que lo ganó (con dos Pokémon, para que el orden importe)", () => {
    const h = new Harness({ config: RANDOM_3, rng: [0, 1] });
    h.startGame();
    h.submit(1, "Alfa"); // ronda 1: fuego + volador
    h.submit(2, "Beto");
    h.advance(6000); // termina la pausa y empieza la ronda 2 (agua + tierra)
    expect(h.state.round?.number).toBe(2);
    h.submit(1, "Épsilon");
    h.submit(2, "Delta");
    const theirs = buildRoomState(h.state, 1, "X", h.catalog, h.now).opponentTeam.map((p) => p.id);
    expect(theirs).toEqual([2, 4]); // Beto (ronda 1) y después Delta (ronda 2), no al revés
    const mine = buildRoomState(h.state, 2, "X", h.catalog, h.now).opponentTeam.map((p) => p.id);
    expect(mine).toEqual([1, 5]);
  });

  it("en una ronda activa incluye el par, el plazo y si ya respondí", () => {
    const h = new Harness({ config: RANDOM_3, rng: [0] });
    h.startGame();
    h.submit(1, "Alfa");
    const mine = buildRoomState(h.state, 1, "X", h.catalog, h.now);
    const theirs = buildRoomState(h.state, 2, "X", h.catalog, h.now);
    expect(mine.round).toMatchObject({ number: 1, pair: ["flying", "fire"], answered: true, typeChosen: false });
    expect(theirs.round?.answered).toBe(false);
    expect(mine.phase).toBe("round_active");
  });

  it("en la elección de tipos indica si ya elegí, sin revelar el tipo del rival", () => {
    const h = new Harness({ config: CHOSEN_3 });
    h.startGame();
    h.choose(1, "fire");
    const mine = buildRoomState(h.state, 1, "X", h.catalog, h.now);
    const theirs = buildRoomState(h.state, 2, "X", h.catalog, h.now);
    expect(mine.round).toMatchObject({ pair: null, typeChosen: true });
    expect(theirs.round).toMatchObject({ pair: null, typeChosen: false });
    expect(JSON.stringify(theirs)).not.toContain("fire");
  });

  it("informa la cuenta atrás y la gracia de reconexión del rival", () => {
    const h = new Harness({ config: RANDOM_3, rng: [0] });
    h.seatBoth();
    expect(buildRoomState(h.state, 1, "X", h.catalog, h.now).startsAt).toBe(h.state.startsAt);

    h.advance(5000);
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
    const view = buildRoomState(h.state, 1, "X", h.catalog, h.now);
    expect(view.startsAt).toBeNull();
    expect(view.opponentGraceEndsAt).toBe(h.now + 30_000);
    expect(buildRoomState(h.state, 2, "X", h.catalog, h.now).opponentGraceEndsAt).toBeNull();
  });

  it("el resumen final incluye los dos equipos completos", () => {
    const h = new Harness({ config: { ...RANDOM_3, roundsLimit: 3 }, rng: [0] });
    h.startGame();
    h.dispatch({ type: "LEAVE", seat: 2 });
    const ended = buildGameEnded(h.state, h.catalog);
    expect(ended).toEqual({ winnerSeat: 1, reason: "forfeit", teams: { 1: [], 2: [] }, totals: { 1: 0, 2: 0 } });
  });
});
