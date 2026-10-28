import type { GameEndReason, ServerEvent } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import { type GameView, initialGameView } from "../../src/game/apply-event";
import { effectsForEvent, endOutcome, musicCueFor } from "../../src/sound/cues";
import { event, gameEnded, roundResult, silhouetteReveal } from "../helpers/events";

/** Una vista como la de quien juega en el asiento 1 (o el que se pida). */
const view = (overrides: Partial<GameView> = {}): GameView => ({ ...initialGameView, mySeat: 1, ...overrides });

const effects = (e: ServerEvent, before: GameView = view({ phase: "round_active" }), after: GameView = before) =>
  effectsForEvent(before, e, after).map(({ effect, delayMs }) => [effect, delayMs]);

describe("endOutcome: cómo terminó para mí", () => {
  it("gana mi asiento por cualquier motivo → win; gana el otro → lose", () => {
    for (const reason of ["completed", "forfeit", "disconnect"] as GameEndReason[]) {
      expect(endOutcome(gameEnded({ winnerSeat: 1, reason }), 1)).toBe("win");
      expect(endOutcome(gameEnded({ winnerSeat: 2, reason }), 1)).toBe("lose");
    }
  });

  it("empate de una partida completada → win; sin ganador y sin completar → null", () => {
    expect(endOutcome(gameEnded({ winnerSeat: null, reason: "completed" }), 1)).toBe("win");
    for (const reason of ["cancelled", "expired", "abandoned"] as GameEndReason[]) {
      expect(endOutcome(gameEnded({ winnerSeat: null, reason }), 1)).toBeNull();
    }
  });

  it("sin asiento (no juego) → null", () => {
    expect(endOutcome(gameEnded({ winnerSeat: 1 }), null)).toBeNull();
  });
});

describe("musicCueFor: qué música toca", () => {
  it("menú y lobbies → sala", () => {
    expect(musicCueFor("/", view())).toEqual({ zone: "lobby" });
    expect(musicCueFor("/jugar/doble-tipo", view())).toEqual({ zone: "lobby" });
    expect(musicCueFor("/jugar/silueta", view())).toEqual({ zone: "lobby" });
  });

  it("en una sala, según la fase", () => {
    expect(musicCueFor("/sala/ABC234", view({ phase: "waiting" }))).toEqual({ zone: "lobby" });
    for (const phase of ["starting", "choosing_types", "round_active", "round_result"] as const) {
      expect(musicCueFor("/sala/ABC234", view({ phase }))).toEqual({ zone: "battle" });
    }
  });

  it("al terminar, el tema de final según el resultado; sin ganador y sin completar, vuelve la sala", () => {
    expect(musicCueFor("/sala/ABC234", view({ phase: "finished", ended: gameEnded({ winnerSeat: 1 }) }))).toEqual({ zone: "final", outcome: "win" });
    expect(musicCueFor("/sala/ABC234", view({ phase: "finished", ended: gameEnded({ winnerSeat: 2 }) }))).toEqual({ zone: "final", outcome: "lose" });
    expect(musicCueFor("/sala/ABC234", view({ phase: "finished", ended: gameEnded({ winnerSeat: null, reason: "completed" }) }))).toEqual({ zone: "final", outcome: "win" });
    expect(musicCueFor("/sala/ABC234", view({ phase: "finished", ended: gameEnded({ winnerSeat: null, reason: "cancelled" }) }))).toEqual({ zone: "lobby" });
    expect(musicCueFor("/sala/ABC234", view({ phase: "finished", ended: null }))).toEqual({ zone: "lobby" });
  });

  it("al entrar en una sala, mientras aún no se sabe la fase, no cambia la música (null)", () => {
    expect(musicCueFor("/sala/ABC234", view({ phase: null }))).toBeNull();
  });

  it("mientras se recupera la sesión, o sin sesión, silencio (la página va a llevar a la entrada)", () => {
    expect(musicCueFor("/", view(), "loading")).toEqual({ zone: "none" });
    expect(musicCueFor("/jugar/silueta", view(), "anonymous")).toEqual({ zone: "none" });
    expect(musicCueFor("/", view(), "authenticated")).toEqual({ zone: "lobby" });
  });

  it("en el resto de pantallas, silencio", () => {
    for (const path of ["/login", "/registro", "/privacidad", "/faq", "/perfil", "/jugador/misty"]) {
      expect(musicCueFor(path, view({ phase: "round_active" })), path).toEqual({ zone: "none" });
    }
  });
});

describe("effectsForEvent: qué efectos suenan", () => {
  it("empieza la ronda en los dos juegos", () => {
    expect(effects(event.roundStarted(1, 1))).toEqual([["round", 0]]);
    expect(effects(event.silhouetteRoundStarted(1))).toEqual([["round", 0]]);
  });

  it("Doble tipo: acierto si mi resultado es VALID, fallo si no (también sin responder)", () => {
    expect(effects(event.roundResult())).toEqual([["correct", 0]]);
    const wrong = roundResult();
    wrong.results[1] = { ...wrong.results[1], result: "TAKEN", pokemon: null };
    expect(effects({ name: "round-result", payload: wrong })).toEqual([["wrong", 0]]);
    const none = roundResult();
    none.results[1] = { ...none.results[1], result: "NO_ANSWER", text: null, pokemon: null };
    expect(effects({ name: "round-result", payload: none })).toEqual([["wrong", 0]]);
    // Desde el asiento 2, el mismo resultado por defecto es un fallo.
    expect(effects(event.roundResult(), view({ mySeat: 2, phase: "round_active" }))).toEqual([["wrong", 0]]);
  });

  it("silueta: primero se revela el Pokémon y después, acierto o fallo", () => {
    expect(effects(event.silhouetteRoundResult())).toEqual([["reveal", 0], ["correct", 600]]);
    const missed = silhouetteReveal({ answers: { 1: { text: "Pikachu", correct: false, ms: 2000, points: 0 }, 2: { text: null, correct: false, ms: null, points: 0 } } });
    expect(effects(event.silhouetteRoundResult(missed))).toEqual([["reveal", 0], ["wrong", 600]]);
  });

  it("final de la partida: ganar, perder, empate completado (ganar) y sin completar (nada)", () => {
    expect(effects(event.gameEnded({ winnerSeat: 1 }))).toEqual([["win", 0]]);
    expect(effects(event.gameEnded({ winnerSeat: 2 }))).toEqual([["lose", 0]]);
    expect(effects(event.gameEnded({ winnerSeat: null, reason: "completed" }))).toEqual([["win", 0]]);
    expect(effects(event.gameEnded({ winnerSeat: null, reason: "expired" }))).toEqual([]);
  });

  it("si la partida termina con la última ronda (Doble tipo), el efecto de final espera al de la ronda", () => {
    const lastRound = view({ phase: "round_result", lastResult: roundResult({ nextRoundAt: null }) });
    expect(effects(event.gameEnded({ winnerSeat: 1 }), lastRound)).toEqual([["win", 500]]);
    expect(effects(event.gameEnded({ winnerSeat: 2 }), lastRound)).toEqual([["lose", 500]]);
    // Si no venía de un resultado (abandono en plena ronda), suena al momento.
    expect(effects(event.gameEnded({ winnerSeat: 1, reason: "forfeit" }), view({ phase: "round_active" }))).toEqual([["win", 0]]);
  });

  it("el rival respondió en la ronda abierta; uno atrasado de otra ronda no suena", () => {
    const before = view({ phase: "round_active" });
    const marked = view({ phase: "round_active", round: { number: 1, pair: null, deadline: 1, answered: false, typeChosen: false, opponentAnswered: true } });
    expect(effects(event.opponentAnswered(1), before, marked)).toEqual([["rival", 0]]);
    expect(effects(event.opponentAnswered(2), before, before)).toEqual([]);
  });

  it("reconectar (room-state) y el resto de eventos no suenan", () => {
    const state = event.roomState({ phase: "round_result" });
    expect(effects(state)).toEqual([]);
    expect(effects(event.answerReceived(1))).toEqual([]);
    expect(effects(event.opponentReconnected())).toEqual([]);
  });

  it("sin asiento solo suena el inicio de ronda", () => {
    const watcher = view({ mySeat: null, phase: "round_active" });
    expect(effects(event.roundResult(), watcher)).toEqual([]);
    expect(effects(event.gameEnded(), watcher)).toEqual([]);
    expect(effects(event.roundStarted(1, 1), watcher)).toEqual([["round", 0]]);
  });
});
