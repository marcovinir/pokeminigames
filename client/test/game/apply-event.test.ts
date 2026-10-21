import type { ServerEvent } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import { type GameView, applyServerEvent, initialGameView } from "../../src/game/apply-event";
import { SERVER_NOW, event, pokemon } from "../helpers/events";

/** Aplica los eventos en orden, cada uno "recibido" en el navegador a la hora indicada. */
function play(events: [ServerEvent, number?][], start: GameView = initialGameView): GameView {
  return events.reduce((view, [e, at]) => applyServerEvent(view, e, at ?? SERVER_NOW), start);
}

describe("room-state", () => {
  it("reemplaza el estado completo y calcula el desfase del reloj", () => {
    const view = play([
      [
        event.roomState({
          phase: "round_active",
          mySeat: 2,
          roundsPlayed: 1,
          myTeam: [pokemon(7, 400)],
          round: { number: 2, pair: ["flying", "fire"], deadline: SERVER_NOW + 9000, answered: true, typeChosen: false },
        }),
        SERVER_NOW - 5000,
      ],
    ]);
    expect(view).toMatchObject({
      code: "ABC234",
      phase: "round_active",
      mySeat: 2,
      roundsPlayed: 1,
      clockOffset: 5000,
      round: { number: 2, pair: ["flying", "fire"], answered: true, typeChosen: false },
    });
    expect(view.myTeam.map((p) => p.id)).toEqual([7]);
    expect(view.players).toHaveLength(2);
  });

  it("vuelve a sincronizar tras una reconexión: lo que el servidor dice pisa lo que había", () => {
    const before = play([[event.roomState({ phase: "round_active", round: { number: 1, pair: ["flying", "fire"], deadline: 1, answered: false, typeChosen: false } })], [event.answerReceived(1)]]);
    expect(before.round?.answered).toBe(true);
    const after = applyServerEvent(before, event.roomState({ phase: "round_active", round: { number: 1, pair: ["flying", "fire"], deadline: 1, answered: false, typeChosen: false } }), SERVER_NOW);
    expect(after.round?.answered).toBe(false);
  });

  it("borra el error anterior y el resumen final", () => {
    const view = play([[event.error("ROOM_FULL")], [event.roomState()]], { ...initialGameView, ended: null });
    expect(view.lastError).toBeNull();
    expect(view.ended).toBeNull();
  });

  it("conserva el último resultado solo si corresponde a la ronda ya jugada (reconexión en la pausa)", () => {
    const withResult = play([[event.roomState({ mySeat: 1 })], [event.roundResult({ round: 2 })]]);
    const same = applyServerEvent(withResult, event.roomState({ phase: "round_result", roundsPlayed: 2 }), SERVER_NOW);
    expect(same.lastResult?.round).toBe(2);
    const other = applyServerEvent(withResult, event.roomState({ phase: "round_active", roundsPlayed: 3 }), SERVER_NOW);
    expect(other.lastResult).toBeNull();
  });
});

describe("eventos de la sala de espera y del inicio", () => {
  it("player-joined agrega al rival si aún no estaba, y le cambia el nombre si ya estaba", () => {
    const alone = play([[event.roomState({ players: [{ seat: 1, username: "ash", connected: true, totalStats: 0, teamSize: 0 }] })]]);
    const joined = applyServerEvent(alone, event.playerJoined("misty"), SERVER_NOW);
    expect(joined.players.map((p) => [p.seat, p.username])).toEqual([[1, "ash"], [2, "misty"]]);

    const renamed = applyServerEvent(joined, event.playerJoined("gary"), SERVER_NOW);
    expect(renamed.players.map((p) => p.username)).toEqual(["ash", "gary"]);
  });

  it("game-starting pasa a la cuenta atrás y mide el desfase", () => {
    const view = play([[event.roomState()], [event.gameStarting(SERVER_NOW + 5000, SERVER_NOW), SERVER_NOW + 2000]]);
    expect(view).toMatchObject({ phase: "starting", startsAt: SERVER_NOW + 5000, clockOffset: -2000 });
  });
});

describe("elección de tipos y rondas", () => {
  it("choose-types abre una ronda sin par y type-received marca que ya elegí", () => {
    const view = play([[event.roomState({ phase: "starting" })], [event.chooseTypes(1, SERVER_NOW + 15_000)]]);
    expect(view).toMatchObject({
      phase: "choosing_types",
      startsAt: null,
      round: { number: 1, pair: null, deadline: SERVER_NOW + 15_000, answered: false, typeChosen: false },
    });
    expect(applyServerEvent(view, event.typeReceived(1), SERVER_NOW).round?.typeChosen).toBe(true);
  });

  it("type-received y answer-received sin ronda no hacen nada", () => {
    expect(applyServerEvent(initialGameView, event.typeReceived(1), SERVER_NOW)).toBe(initialGameView);
    expect(applyServerEvent(initialGameView, event.answerReceived(1), SERVER_NOW)).toBe(initialGameView);
  });

  it("round-started fija el par y el plazo, limpia el resultado anterior y mide el desfase", () => {
    const afterResult = play([[event.roomState({ mySeat: 1 })], [event.roundResult()]]);
    const view = applyServerEvent(afterResult, event.roundStarted(2, SERVER_NOW + 21_000, { serverNow: SERVER_NOW + 6000 }), SERVER_NOW + 6500);
    expect(view).toMatchObject({
      phase: "round_active",
      lastResult: null,
      clockOffset: -500,
      round: { number: 2, pair: ["flying", "fire"], deadline: SERVER_NOW + 21_000, answered: false, typeChosen: false },
    });
  });

  it("round-started conserva que ya elegí el tipo de esa misma ronda y trae el aviso de par reemplazado", () => {
    const view = play([
      [event.roomState()],
      [event.chooseTypes(1, SERVER_NOW + 15_000)],
      [event.typeReceived(1)],
      [event.roundStarted(1, SERVER_NOW + 30_000, { typesNotice: "pair_replaced" })],
    ]);
    expect(view.round).toMatchObject({ number: 1, typeChosen: true, typesNotice: "pair_replaced" });
  });

  it("round-started sin aviso no deja un aviso de una ronda anterior", () => {
    const view = play([
      [event.roomState()],
      [event.roundStarted(1, SERVER_NOW + 15_000, { typesNotice: "pair_replaced" })],
      [event.roundStarted(2, SERVER_NOW + 30_000)],
    ]);
    expect(view.round).not.toHaveProperty("typesNotice");
  });

  it("answer-received marca que ya respondí", () => {
    const view = play([[event.roomState()], [event.roundStarted(1, SERVER_NOW + 15_000)], [event.answerReceived(1)]]);
    expect(view.round?.answered).toBe(true);
  });
});

describe("round-result", () => {
  it("guarda el resultado, actualiza los totales de los dos y suma mi Pokémon al equipo", () => {
    const view = play([[event.roomState({ mySeat: 1 })], [event.roundResult()]]);
    expect(view.phase).toBe("round_result");
    expect(view.roundsPlayed).toBe(1);
    expect(view.lastResult?.round).toBe(1);
    expect(view.players.map((p) => [p.seat, p.totalStats, p.teamSize])).toEqual([[1, 500, 1], [2, 0, 0]]);
    expect(view.myTeam.map((p) => p.id)).toEqual([1]);
  });

  it("desde el asiento 2, el Pokémon que entra al equipo es el del asiento 2", () => {
    const result = event.roundResult({
      results: {
        1: { seat: 1, result: "VALID", text: "a", pokemon: pokemon(1, 500), totalStats: 500, teamSize: 1 },
        2: { seat: 2, result: "VALID", text: "b", pokemon: pokemon(2, 300), totalStats: 300, teamSize: 1 },
      },
    });
    const view = play([[event.roomState({ mySeat: 2 })], [result]]);
    expect(view.myTeam.map((p) => p.id)).toEqual([2]);
  });

  it("un resultado repetido (p. ej. tras reconectar) no duplica el Pokémon en el equipo", () => {
    const view = play([[event.roomState({ mySeat: 1 })], [event.roundResult()], [event.roundResult()]]);
    expect(view.myTeam).toHaveLength(1);
  });

  it("no añade nada al equipo cuando no ganaste ningún Pokémon", () => {
    const result = event.roundResult({
      results: {
        1: { seat: 1, result: "NO_ANSWER", text: null, pokemon: null, totalStats: 0, teamSize: 0 },
        2: { seat: 2, result: "VALID", text: "b", pokemon: pokemon(2, 300), totalStats: 300, teamSize: 1 },
      },
    });
    const view = play([[event.roomState({ mySeat: 1 })], [result]]);
    expect(view.myTeam).toEqual([]);
  });
});

describe("fin de la partida y desconexiones", () => {
  it("game-ended pasa a finished, guarda el resumen y apaga el aviso de desconexión", () => {
    const view = play([[event.roomState({ opponentGraceEndsAt: SERVER_NOW + 30_000 })], [event.gameEnded()]]);
    expect(view.phase).toBe("finished");
    expect(view.ended).toMatchObject({ winnerSeat: 1, reason: "completed" });
    expect(view.opponentGraceEndsAt).toBeNull();
  });

  it("opponent-disconnected marca al rival como desconectado y fija el plazo; reconnected lo deshace", () => {
    const away = play([[event.roomState({ mySeat: 1 })], [event.opponentDisconnected(SERVER_NOW + 30_000, SERVER_NOW), SERVER_NOW + 1000]]);
    expect(away.opponentGraceEndsAt).toBe(SERVER_NOW + 30_000);
    expect(away.clockOffset).toBe(-1000);
    expect(away.players.find((p) => p.seat === 2)?.connected).toBe(false);
    expect(away.players.find((p) => p.seat === 1)?.connected).toBe(true);

    const back = applyServerEvent(away, event.opponentReconnected(), SERVER_NOW);
    expect(back.opponentGraceEndsAt).toBeNull();
    expect(back.players.find((p) => p.seat === 2)?.connected).toBe(true);
  });

  it("error guarda el último error del servidor", () => {
    const view = applyServerEvent(initialGameView, event.error("WRONG_PHASE", "x"), SERVER_NOW);
    expect(view.lastError).toEqual({ code: "WRONG_PHASE", message: "x" });
  });
});

describe("errores recuperables", () => {
  it("un error del servidor se borra en cuanto la partida avanza, para no dejar un aviso viejo a la vista", () => {
    const withError = applyServerEvent(initialGameView, event.error("WRONG_PHASE", "x"), SERVER_NOW);
    expect(withError.lastError).not.toBeNull();
    const next = {
      "choose-types": event.chooseTypes(1, SERVER_NOW + 15_000),
      "round-started": event.roundStarted(1, SERVER_NOW + 15_000),
      "round-result": event.roundResult(),
      "game-ended": event.gameEnded(),
    };
    for (const [name, e] of Object.entries(next)) {
      expect(applyServerEvent(withError, e, SERVER_NOW).lastError, name).toBeNull();
    }
  });

  it("los eventos que no marcan un avance (confirmaciones, avisos del rival) no lo borran", () => {
    const withError = applyServerEvent(initialGameView, event.error("RATE_LIMITED", "x"), SERVER_NOW);
    expect(applyServerEvent(withError, event.answerReceived(1), SERVER_NOW).lastError).not.toBeNull();
    expect(applyServerEvent(withError, event.opponentReconnected(), SERVER_NOW).lastError).not.toBeNull();
  });
});

describe("pureza", () => {
  it("no modifica el estado que recibe", () => {
    const before = play([[event.roomState({ mySeat: 1, myTeam: [pokemon(9)] })], [event.roundStarted(1, SERVER_NOW + 15_000)]]);
    const frozen = structuredClone(before);
    for (const e of [event.answerReceived(1), event.roundResult(), event.gameEnded(), event.opponentDisconnected(1), event.error("RATE_LIMITED")]) {
      applyServerEvent(before, e, SERVER_NOW);
    }
    expect(before).toEqual(frozen);
  });

  it("room-state reconstruye desde cero aunque el estado anterior esté a medias", () => {
    const view = applyServerEvent(initialGameView, event.roomState({ phase: "finished" }), SERVER_NOW);
    expect(view.phase).toBe("finished");
    expect(view.code).toBe("ABC234");
  });
});

describe("equipo del rival (etapa 8)", () => {
  const withRival = (rival: ReturnType<typeof pokemon> | null, round = 1) =>
    event.roundResult({
      round,
      results: {
        1: { seat: 1, result: "VALID", text: "a", pokemon: pokemon(1, 500), totalStats: 500, teamSize: 1 },
        2: rival
          ? { seat: 2, result: "VALID", text: "b", pokemon: rival, totalStats: rival.totalStats, teamSize: 1 }
          : { seat: 2, result: "NOT_FOUND", text: "zzz", pokemon: null, totalStats: 0, teamSize: 0 },
      },
    });

  it("empieza vacío", () => {
    expect(initialGameView.opponentTeam).toEqual([]);
    expect(play([[event.roomState()]]).opponentTeam).toEqual([]);
  });

  it("room-state lo reemplaza con el equipo del rival que manda el servidor (también al reconectar)", () => {
    const view = play([[event.roomState({ opponentTeam: [pokemon(7, 400), pokemon(8, 300)] })]]);
    expect(view.opponentTeam.map((p) => p.id)).toEqual([7, 8]);
  });

  it("round-result suma el Pokémon que ganó el rival (el del otro asiento)", () => {
    const first = play([[event.roomState({ mySeat: 1 })], [withRival(pokemon(2, 300))]]);
    expect(first.opponentTeam.map((p) => p.id)).toEqual([2]);

    // Desde el asiento 2, el rival es el asiento 1: el Pokémon que entra es el del asiento 1.
    const second = play([[event.roomState({ mySeat: 2 })], [withRival(pokemon(2, 300))]]);
    expect(second.opponentTeam.map((p) => p.id)).toEqual([1]);
  });

  it("un resultado repetido no duplica al Pokémon del rival", () => {
    const view = play([[event.roomState({ mySeat: 1 })], [withRival(pokemon(2, 300))], [withRival(pokemon(2, 300))]]);
    expect(view.opponentTeam).toHaveLength(1);
  });

  it("si el rival no ganó nada, su equipo no cambia", () => {
    const view = play([[event.roomState({ mySeat: 1 })], [withRival(null)]]);
    expect(view.opponentTeam).toEqual([]);
  });

  it("conserva el orden en que el rival fue ganando Pokémon", () => {
    const view = play([[event.roomState({ mySeat: 1 })], [withRival(pokemon(5, 300), 1)], [withRival(pokemon(2, 450), 2)]]);
    expect(view.opponentTeam.map((p) => p.id)).toEqual([5, 2]);
  });

  it("un room-state posterior sustituye lo acumulado: manda el servidor", () => {
    const view = play([
      [event.roomState({ mySeat: 1 })],
      [withRival(pokemon(2, 300))],
      [event.roomState({ mySeat: 1, opponentTeam: [pokemon(9, 410)] })],
    ]);
    expect(view.opponentTeam.map((p) => p.id)).toEqual([9]);
  });

  it("lastResult conserva el ejemplo que mandó el servidor", () => {
    const view = play([[event.roomState({ mySeat: 1 })], [event.roundResult({ example: pokemon(25, 480) })]]);
    expect(view.lastResult?.example?.id).toBe(25);
  });
});
