import { describe, expect, it } from "vitest";
import { START_TIME } from "./harness.js";
import { SILHOUETTE_5, SilhouetteHarness } from "./silhouette-harness.js";

// Catálogo de pruebas: 1 Alfa/Alpha, 2 Beto/Beta, 3 Gama/Gamma… (todos de la 1.ª generación). Con el azar en 0 sale
// siempre el primero de los que quedan: ronda 1 → Alfa, ronda 2 → Beto…
const ROUND_START = START_TIME + 5000;

describe("silueta: sala y conexiones", () => {
  it("una sala nueva espera al segundo jugador y caduca a los 10 minutos", () => {
    const h = new SilhouetteHarness();
    expect(h.state.phase).toBe("waiting");
    expect(h.pending).toEqual([{ at: START_TIME + 10 * 60 * 1000, timer: { kind: "expire" } }]);
    h.advance(10 * 60 * 1000);
    expect(h.state.outcome).toEqual({ winnerSeat: null, reason: "expired" });
  });

  it("quien se une avisa al creador y, conectados los dos, empieza la cuenta atrás de 5 s", () => {
    const h = new SilhouetteHarness();
    h.seatBoth();
    expect(h.payloads("player-joined", 1)).toEqual([{ username: "misty" }]);
    expect(h.state.phase).toBe("starting");
    expect(h.last("game-starting")).toEqual({ startsAt: START_TIME + 5000, serverNow: START_TIME });
  });

  it("si alguien se desconecta en la cuenta atrás se vuelve a esperar", () => {
    const h = new SilhouetteHarness();
    h.seatBoth();
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
    expect(h.state.phase).toBe("waiting");
    h.advance(5000);
    expect(h.state.round).toBeNull();
  });

  it("el creador que se va antes de empezar cancela la sala", () => {
    const h = new SilhouetteHarness();
    h.dispatch({ type: "LEAVE", seat: 1 });
    expect(h.state.outcome).toEqual({ winnerSeat: null, reason: "cancelled" });
  });

  it("abandonar en plena partida le da la victoria al otro", () => {
    const h = new SilhouetteHarness();
    h.startGame();
    h.dispatch({ type: "LEAVE", seat: 2 });
    expect(h.state.outcome).toEqual({ winnerSeat: 1, reason: "forfeit" });
  });

  it("desconectado más de 30 s en plena partida: gana el otro por desconexión", () => {
    const h = new SilhouetteHarness();
    h.startGame();
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
    expect(h.last("opponent-disconnected", 1)?.graceEndsAt).toBe(ROUND_START + 30_000);
    h.advance(30_000);
    expect(h.state.outcome).toEqual({ winnerSeat: 1, reason: "disconnect" });
  });
});

describe("silueta: rondas", () => {
  it("cada ronda sortea un Pokémon de las generaciones, sin repetir, y registra su silueta", () => {
    const h = new SilhouetteHarness();
    h.startGame();
    expect(h.others).toContainEqual({ kind: "register_silhouette", token: "tok1", pokemonId: 1 });
    expect(h.last("silhouette-round-started")).toEqual({
      serverNow: ROUND_START,
      round: 1,
      totalRounds: 5,
      deadline: ROUND_START + 15_000,
      silhouetteUrl: "/silhouettes/tok1",
    });
    expect(h.state.phase).toBe("round_active");
    h.advance(15_000 + 6000);
    expect(h.others).toContainEqual({ kind: "register_silhouette", token: "tok2", pokemonId: 2 });
    expect(h.state.used).toEqual([1, 2]);
  });

  it("responder confirma solo a quien respondió, con sus ms", () => {
    const h = new SilhouetteHarness();
    h.startGame();
    h.advance(3000);
    h.submit(1, "Beto");
    expect(h.payloads("silhouette-answer-received", 1)).toEqual([{ ms: 3000 }]);
    expect(h.payloads("silhouette-answer-received", 2)).toEqual([]);
  });

  it("un solo intento: el segundo envío no cambia nada", () => {
    const h = new SilhouetteHarness();
    h.startGame();
    h.submit(1, "Beto");
    h.submit(1, "Alfa");
    expect(h.errorCodes(1)).toEqual(["ALREADY_ANSWERED"]);
    expect(h.payloads("silhouette-answer-received", 1)).toHaveLength(1);
    h.advance(15_000);
    expect(h.last("silhouette-round-result")?.reveal.answers[1]).toMatchObject({ text: "Beto", correct: false, points: 0 });
  });

  it("si responden los dos la ronda se cierra ya", () => {
    const h = new SilhouetteHarness();
    h.startGame();
    h.advance(2000);
    h.submit(1, "Alfa");
    h.submit(2, "Alpha");
    expect(h.state.phase).toBe("round_result");
    expect(h.last("silhouette-round-result")?.nextRoundAt).toBe(ROUND_START + 2000 + 6000);
  });

  it("al vencer el reloj se cierra con lo que haya; una respuesta tras el plazo no puntúa ni reabre", () => {
    const h = new SilhouetteHarness();
    h.startGame();
    h.advance(15_000);
    expect(h.state.phase).toBe("round_result");
    h.submit(2, "Alfa");
    expect(h.errorCodes(2)).toEqual(["WRONG_PHASE"]);
    expect(h.last("silhouette-round-result")?.reveal.answers[2]).toEqual({ text: null, correct: false, ms: null, points: 0 });
  });

  it("puntos: acierto en 3000 ms → 820 (en español o en inglés); fallo → 0; sin respuesta → 0", () => {
    const h = new SilhouetteHarness();
    h.startGame();
    h.advance(3000);
    h.submit(1, "alpha");
    h.advance(12_000);
    const result = h.last("silhouette-round-result")!;
    expect(result.reveal.answers[1]).toEqual({ text: "alpha", correct: true, ms: 3000, points: 820 });
    expect(result.reveal.answers[2]).toEqual({ text: null, correct: false, ms: null, points: 0 });
    expect(result.totals).toEqual({ 1: 820, 2: 0 });

    h.advance(6000);
    h.submit(2, "Gama");
    h.advance(15_000);
    expect(h.last("silhouette-round-result")?.reveal.answers[2]).toMatchObject({ text: "Gama", correct: false, points: 0 });
  });

  it("el resultado revela el Pokémon y, en la última ronda, llega el fin con las revelaciones", () => {
    const h = new SilhouetteHarness();
    h.startGame();
    h.submit(1, "Alfa");
    h.advance(15_000);
    expect(h.last("silhouette-round-result")?.reveal.pokemon).toMatchObject({ id: 1, names: { es: "Alfa", en: "Alpha" } });
    for (let round = 2; round <= 5; round++) h.advance(6000 + 15_000);
    const lastResult = h.last("silhouette-round-result")!;
    expect(lastResult.reveal.round).toBe(5);
    expect(lastResult.nextRoundAt).toBeNull();
    const ended = h.last("game-ended")!;
    expect(ended).toMatchObject({ winnerSeat: 1, reason: "completed", totals: { 1: 1000, 2: 0 }, teams: { 1: [], 2: [] } });
    expect(ended.silhouette?.reveals.map((r) => r.pokemon.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("empate a puntos: sin ganador", () => {
    const h = new SilhouetteHarness();
    h.startGame();
    for (let round = 1; round <= 5; round++) h.advance(15_000 + 6000);
    expect(h.state.outcome).toEqual({ winnerSeat: null, reason: "completed" });
  });

  it("si la bolsa se agota antes de las rondas, la partida termina con exhausted", () => {
    const h = new SilhouetteHarness({ config: { ...SILHOUETTE_5, rounds: 15 } });
    h.startGame();
    for (let round = 1; round <= 11; round++) h.advance(15_000 + 6000);
    expect(h.state.used).toHaveLength(10);
    expect(h.state.outcome?.reason).toBe("exhausted");
  });

  it("no pide guardar nada", () => {
    const h = new SilhouetteHarness();
    h.startGame();
    h.submit(1, "Alfa");
    for (let round = 1; round <= 5; round++) h.advance(15_000 + 6000);
    expect(h.others.filter((e) => e.kind.startsWith("persist"))).toEqual([]);
  });

  it("una sala de revancha caduca a los 30 s", () => {
    const h = new SilhouetteHarness({ rematch: true });
    expect(h.state.rematch).toBe(true);
    expect(h.pending).toEqual([{ at: START_TIME + 30_000, timer: { kind: "expire" } }]);
  });
});
