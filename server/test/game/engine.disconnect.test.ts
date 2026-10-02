import { describe, expect, it } from "vitest";
import { Harness, START_TIME } from "./harness.js";

const T0 = START_TIME + 5000; // empieza la ronda 1

function inRound(rng: number[] = [0]): Harness {
  const h = new Harness({ rng });
  h.startGame();
  return h;
}

describe("motor: desconexiones", () => {
  it("al caerse un jugador en plena ronda el rival recibe el aviso con los 30 s de gracia", () => {
    const h = inRound();
    h.advance(2000);
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });

    expect(h.state.players[2]?.connected).toBe(false);
    const graceEndsAt = T0 + 2000 + 30_000;
    expect(h.payloads("opponent-disconnected", 1)).toEqual([{ graceEndsAt, serverNow: T0 + 2000 }]);
    expect(h.pending).toContainEqual({ at: graceEndsAt, timer: { kind: "grace", seat: 2, graceEndsAt } });
  });

  it("el reloj de la ronda sigue corriendo: quien se cayó cuenta como sin respuesta", () => {
    const h = inRound();
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
    h.submit(1, "Alfa");
    expect(h.state.phase).toBe("round_active"); // se espera al plazo, no al jugador caído
    h.advance(15_000);

    expect(h.state.phase).toBe("round_result");
    const result = h.last("round-result")!;
    expect(result.results[1].result).toBe("VALID");
    expect(result.results[2].result).toBe("NO_ANSWER");
  });

  it("lo que un jugador respondió antes de caerse sí cuenta", () => {
    const h = inRound();
    h.submit(2, "Beto");
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
    h.advance(15_000);
    expect(h.last("round-result")!.results[2]).toMatchObject({ result: "VALID", totalStats: 400 });
  });

  it("si vuelve dentro de la gracia se avisa al rival, recibe su estado y no pierde", () => {
    const h = inRound();
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
    h.advance(10_000);
    h.clearEmitted();
    h.dispatch({ type: "PLAYER_CONNECTED", seat: 2 });

    expect(h.state.players[2]?.connected).toBe(true);
    expect(h.state.graceEndsAt[2]).toBeUndefined();
    expect(h.payloads("opponent-reconnected", 1)).toHaveLength(1);
    expect(h.sentState.at(-1)).toBe(2);

    h.advance(25_000); // pasan 35 s desde la caída: el temporizador de gracia vence y debe ignorarse
    expect(h.state.phase).not.toBe("finished");
    expect(h.state.outcome).toBeNull();
  });

  it("si no vuelve en 30 s pierde: gana el rival por desconexión", () => {
    const h = inRound();
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
    h.advance(29_999);
    expect(h.state.phase).not.toBe("finished");
    h.advance(1);

    expect(h.state.phase).toBe("finished");
    expect(h.last("game-ended")).toMatchObject({ winnerSeat: 1, reason: "disconnect" });
    expect(h.effectsOfKind("persist_end")[0]).toMatchObject({ status: "completed", outcome: { winnerSeat: 1, reason: "disconnect" } });
  });

  it("si ambos están desconectados al vencer la gracia, la partida queda abandonada sin ganador", () => {
    const h = inRound();
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 1 });
    h.advance(10_000);
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
    h.advance(20_000); // vence la gracia del asiento 1 con el 2 también caído

    expect(h.state.phase).toBe("finished");
    expect(h.state.outcome).toEqual({ winnerSeat: null, reason: "abandoned" });
    expect(h.effectsOfKind("persist_end")[0]).toMatchObject({ status: "abandoned" });
  });

  it("una segunda caída abre una gracia nueva: el temporizador de la primera queda obsoleto", () => {
    const h = inRound();
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
    h.advance(20_000);
    h.dispatch({ type: "PLAYER_CONNECTED", seat: 2 });
    h.advance(5_000);
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 }); // nueva gracia: vence 30 s después
    h.advance(6_000); // aquí vencería la primera (T0 + 30 s) si siguiera vigente
    expect(h.state.phase).not.toBe("finished");
    h.advance(24_000);
    expect(h.state.outcome).toEqual({ winnerSeat: 1, reason: "disconnect" });
  });

  it("también hay gracia si la caída ocurre en la pausa entre rondas", () => {
    const h = inRound();
    h.submit(1, "Alfa");
    h.submit(2, "Beto");
    expect(h.state.phase).toBe("round_result");
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 1 });
    expect(h.payloads("opponent-disconnected", 2)).toHaveLength(1);
    h.advance(30_000);
    expect(h.state.outcome).toEqual({ winnerSeat: 2, reason: "disconnect" });
  });

  it("salir voluntariamente en plena partida da la victoria al rival al instante", () => {
    const h = inRound();
    h.dispatch({ type: "LEAVE", seat: 1 });
    expect(h.state.phase).toBe("finished");
    expect(h.last("game-ended")).toMatchObject({ winnerSeat: 2, reason: "forfeit" });
    expect(h.effectsOfKind("persist_end")[0]).toMatchObject({ status: "completed" });
  });

  it("desconectarse dos veces seguidas o conectarse estando conectado no cambia nada", () => {
    const h = inRound();
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
    const pending = h.pending.length;
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
    expect(h.pending).toHaveLength(pending);

    h.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
    expect(h.payloads("opponent-reconnected", 2)).toHaveLength(0);
  });
});
