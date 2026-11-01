import type { ServerEvent } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import { type GameView, applyServerEvent, initialGameView } from "../../src/game/apply-event";
import { SERVER_NOW, event, silhouetteReveal, pokemon, roundResult } from "../helpers/events";

/** Aplica los eventos en orden, cada uno "recibido" en el navegador a la hora indicada. */
function play(events: [ServerEvent, number?][], start: GameView = initialGameView): GameView {
  return events.reduce((view, [e, at]) => applyServerEvent(view, e, at ?? SERVER_NOW), start);
}

describe("revancha", () => {
  it("rematch-state guarda la oferta y el desfase del reloj; un room-state nuevo no la borra", () => {
    const view = play([
      [event.roomState({ phase: "finished" })],
      [event.rematchState({ status: "mine", deadline: SERVER_NOW + 60_000 }), SERVER_NOW + 2000],
    ]);
    expect(view.rematchOffer).toMatchObject({ status: "mine", deadline: SERVER_NOW + 60_000 });
    expect(view.clockOffset).toBe(-2000);
    const again = applyServerEvent(view, event.roomState({ phase: "finished" }), SERVER_NOW);
    expect(again.rematchOffer).toMatchObject({ status: "mine" });
  });

  it("room-state con rematch: true marca la sala como de revancha y sin él no", () => {
    expect(play([[event.roomState({ rematch: true })]]).isRematchRoom).toBe(true);
    expect(play([[event.roomState({ rematch: true })], [event.roomState()]]).isRematchRoom).toBe(false);
    expect(initialGameView).toMatchObject({ rematchOffer: null, isRematchRoom: false, nextRoom: null });
  });

  it.each(["open", "mine", "theirs", "starting"] as const)(
    "con la oferta %s, un error de sala desaparecida la cierra como «ya no está disponible» (nadie se queda en una pantalla muerta)",
    (status) => {
      for (const code of ["ROOM_NOT_FOUND", "NOT_IN_ROOM", "ROOM_CLOSED"] as const) {
        const view = play([[event.roomState({ phase: "finished" })], [event.rematchState({ status })], [event.error(code)]]);
        expect(view.rematchOffer, code).toMatchObject({ status: "closed", closedReason: "unavailable", deadline: null });
      }
    },
  );

  it("sin oferta viva, un error de sala desaparecida no la toca", () => {
    const closed = play([[event.roomState({ phase: "finished" })], [event.rematchState({ status: "closed", closedReason: "declined", deadline: null })], [event.error("ROOM_NOT_FOUND")]]);
    expect(closed.rematchOffer).toMatchObject({ status: "closed", closedReason: "declined" });
    expect(play([[event.roomState()], [event.error("ROOM_NOT_FOUND")]]).rematchOffer).toBeNull();
    expect(play([[event.roomState({ phase: "finished" })], [event.rematchState({ status: "mine" })], [event.error("RATE_LIMITED")]]).rematchOffer?.status).toBe("mine");
  });

  it("rematch-room guarda el código de la sala nueva y un room-state posterior lo conserva", () => {
    const view = play([[event.roomState({ phase: "finished" })], [event.rematchRoom("GAME02")]]);
    expect(view.nextRoom).toBe("GAME02");
    expect(applyServerEvent(view, event.roomState({ phase: "finished" }), SERVER_NOW).nextRoom).toBe("GAME02");
  });
});

describe("room-state", () => {
  it("reemplaza el estado completo y calcula el desfase del reloj", () => {
    const view = play([
      [
        event.roomState({
          phase: "round_active",
          mySeat: 2,
          roundsPlayed: 1,
          myTeam: [pokemon(7, 400)],
          round: { number: 2, pair: ["flying", "fire"], deadline: SERVER_NOW + 9000, answered: true, typeChosen: false, opponentAnswered: false },
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
    const before = play([[event.roomState({ phase: "round_active", round: { number: 1, pair: ["flying", "fire"], deadline: 1, answered: false, typeChosen: false, opponentAnswered: false } })], [event.answerReceived(1)]]);
    expect(before.round?.answered).toBe(true);
    const after = applyServerEvent(before, event.roomState({ phase: "round_active", round: { number: 1, pair: ["flying", "fire"], deadline: 1, answered: false, typeChosen: false, opponentAnswered: false } }), SERVER_NOW);
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

  it("room-state y player-joined conservan guest en players y lo quitan si el nuevo jugador no lo es", () => {
    const seat1 = { seat: 1 as const, username: "ash", connected: true, totalStats: 0, teamSize: 0 };
    const fromState = play([[event.roomState({ players: [seat1, { ...seat1, seat: 2, username: "inv", guest: true }] })]]);
    expect(fromState.players.map((p) => p.guest)).toEqual([undefined, true]);

    const alone = play([[event.roomState({ players: [seat1] })]]);
    const guestJoined = applyServerEvent(alone, event.playerJoined("inv", true), SERVER_NOW);
    expect(guestJoined.players[1]).toMatchObject({ seat: 2, username: "inv", guest: true });

    const accountJoined = applyServerEvent(guestJoined, event.playerJoined("misty"), SERVER_NOW);
    expect(accountJoined.players[1]).toMatchObject({ username: "misty" });
    expect("guest" in accountJoined.players[1]!).toBe(false);

    const plain = applyServerEvent(alone, event.playerJoined("misty"), SERVER_NOW);
    expect("guest" in plain.players[1]!).toBe(false);
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

describe("el avatar del rival", () => {
  const seat1 = { seat: 1 as const, username: "ash", connected: true, totalStats: 0, teamSize: 0 };

  it("player-joined trae el avatar del rival a la vista", () => {
    const alone = play([[event.roomState({ players: [seat1] })]]);
    const joined = applyServerEvent(alone, event.playerJoined("misty", false, 25), SERVER_NOW);
    expect(joined.players[1]).toMatchObject({ seat: 2, username: "misty", avatarId: 25 });
  });

  it("un rival nuevo sin avatar no hereda el del anterior", () => {
    const alone = play([[event.roomState({ players: [seat1] })]]);
    const first = applyServerEvent(alone, event.playerJoined("misty", false, 25), SERVER_NOW);
    const second = applyServerEvent(first, event.playerJoined("gary"), SERVER_NOW);
    expect(second.players[1]).toMatchObject({ username: "gary" });
    expect("avatarId" in second.players[1]!).toBe(false);
  });
});

describe("la silueta en la vista", () => {
  const SILHOUETTE = { game: "silueta" as const, rounds: 10 as const, generations: [1] };
  const inRoom = () =>
    play([[event.roomState({ phase: "starting", config: SILHOUETTE, silhouette: { totalRounds: 10, round: null, reveals: [] } })]]);

  it("room-state con silhouette la copia a la vista; sin ella queda en null", () => {
    expect(inRoom().silhouette).toEqual({ totalRounds: 10, round: null, reveals: [], lastReveal: null, nextRoundAt: null });
    expect(play([[event.roomState()]]).silhouette).toBeNull();
  });

  it("room-state en plena ronda recupera la ronda y la última revelación", () => {
    const reveal = silhouetteReveal();
    const view = play([[event.roomState({
      phase: "round_active",
      config: SILHOUETTE,
      silhouette: { totalRounds: 10, round: { number: 2, deadline: SERVER_NOW + 9000, silhouetteUrl: "/silhouettes/tok2", answered: true, answeredMs: 2100, opponentAnswered: false }, reveals: [reveal] },
    })]]);
    expect(view.silhouette).toMatchObject({ round: { number: 2, answered: true, answeredMs: 2100, opponentAnswered: false }, reveals: [reveal], lastReveal: reveal });
  });

  it("silhouette-round-started abre la ronda", () => {
    const view = applyServerEvent(inRoom(), event.silhouetteRoundStarted(1, SERVER_NOW + 15_000, "/silhouettes/tok1"), SERVER_NOW);
    expect(view.phase).toBe("round_active");
    expect(view.silhouette?.round).toEqual({ number: 1, deadline: SERVER_NOW + 15_000, silhouetteUrl: "/silhouettes/tok1", answered: false, answeredMs: null, opponentAnswered: false });
  });

  it("silhouette-answer-received marca que respondí y en cuánto", () => {
    const open = applyServerEvent(inRoom(), event.silhouetteRoundStarted(), SERVER_NOW);
    expect(applyServerEvent(open, event.silhouetteAnswerReceived(3200), SERVER_NOW).silhouette?.round).toMatchObject({ answered: true, answeredMs: 3200, opponentAnswered: false });
  });

  it("silhouette-round-result sin estado previo de la silueta toma el total de rondas de la configuración, no el número de la ronda", () => {
    const start = play([[event.roomState({ phase: "round_active", config: { game: "silueta", rounds: 10, generations: [1] } })]]);
    const view = applyServerEvent({ ...start, silhouette: null }, event.silhouetteRoundResult(silhouetteReveal({ round: 3 }), { 1: 0, 2: 0 }, SERVER_NOW + 6000), SERVER_NOW);
    expect(view.silhouette?.totalRounds).toBe(10);
  });

  it("silhouette-round-result añade la revelación, actualiza los puntos y pasa al resultado", () => {
    const open = applyServerEvent(inRoom(), event.silhouetteRoundStarted(), SERVER_NOW);
    const reveal = silhouetteReveal();
    const view = applyServerEvent(open, event.silhouetteRoundResult(reveal, { 1: 808, 2: 0 }, SERVER_NOW + 6000), SERVER_NOW);
    expect(view.phase).toBe("round_result");
    expect(view.silhouette).toMatchObject({ round: null, reveals: [reveal], lastReveal: reveal, nextRoundAt: SERVER_NOW + 6000 });
    expect(view.players.map((p) => p.totalStats)).toEqual([808, 0]);
    expect(view.roundsPlayed).toBe(1);
  });
});

describe("reconectar en la pausa entre rondas", () => {
  it("el room-state trae el último resultado y la pantalla lo puede enseñar", () => {
    const result = roundResult({ round: 2 });
    const view = play([[event.roomState({ phase: "round_result", roundsPlayed: 2, lastResult: result })]]);
    expect(view.lastResult).toEqual(result);
  });
});

describe("el rival ya respondió", () => {
  const roundActive = (opponentAnswered = false) =>
    event.roomState({ phase: "round_active", round: { number: 1, pair: ["flying", "fire"], deadline: 1, answered: false, typeChosen: false, opponentAnswered } });

  it("opponent-answered de la ronda abierta lo marca; de otra ronda, no", () => {
    const view = play([[roundActive()], [event.opponentAnswered(1)]]);
    expect(view.round?.opponentAnswered).toBe(true);
    const other = play([[roundActive()], [event.opponentAnswered(2)]]);
    expect(other.round?.opponentAnswered).toBe(false);
  });

  it("se lee del room-state (al reconectar) y vuelve a false al empezar otra ronda", () => {
    const view = play([[roundActive(true)]]);
    expect(view.round?.opponentAnswered).toBe(true);
    const next = play([[roundActive(true)], [event.roundStarted(2, SERVER_NOW + 15_000)]]);
    expect(next.round?.opponentAnswered).toBe(false);
  });

  it("en la silueta, igual en su ronda", () => {
    const view = play([[event.roomState({ phase: "round_active", silhouette: { totalRounds: 10, round: null, reveals: [] } })], [event.silhouetteRoundStarted(1)], [event.opponentAnswered(1)]]);
    expect(view.silhouette?.round?.opponentAnswered).toBe(true);
    const other = play([[event.roomState({ phase: "round_active", silhouette: { totalRounds: 10, round: null, reveals: [] } })], [event.silhouetteRoundStarted(1)], [event.opponentAnswered(3)]]);
    expect(other.silhouette?.round?.opponentAnswered).toBe(false);
  });
});

describe("la subasta", () => {
  const auction = { money: { 1: 900, 2: 800 }, teamSizes: { 1: 1, 2: 0 }, purchases: { 1: [], 2: [] }, lot: null, reveal: [] };
  const roomState = (extra: object) =>
    ({
      name: "room-state",
      payload: { code: "ABC", phase: "auction", config: { game: "subasta", traps: true }, mySeat: 1, players: [], myTeam: [], opponentTeam: [], roundsPlayed: 0, startsAt: null, round: null, opponentGraceEndsAt: null, serverNow: 0, ...extra },
    }) as never;

  it("copia su estado de room-state, y sin él queda vacío", () => {
    expect(applyServerEvent(initialGameView, roomState({ auction }), 0).auction).toEqual(auction);
    expect(applyServerEvent({ ...initialGameView, auction: auction as never }, roomState({}), 0).auction).toBeNull();
  });

  it("guarda la última venta y la olvida al llegar otra", () => {
    const sale = { lot: 2, winner: 1, paid: 5 } as const;
    const after = applyServerEvent(initialGameView, { name: "auction-sale", payload: sale }, 0);
    expect(after.lastSale).toEqual(sale);
    expect(applyServerEvent(after, { name: "auction-sale", payload: { lot: 3, winner: 1, paid: 5 } }, 0).lastSale?.lot).toBe(3);
  });

  it("la revelación no cambia la fase: la trae room-state", () => {
    const before = { ...initialGameView, phase: "auction" as const };
    expect(applyServerEvent(before, { name: "auction-reveal", payload: { reveal: [] } }, 0).phase).toBe("auction");
  });
});

describe("el registro del combate", () => {
  const action = { actor: 1, move: "fire", damage: 5, critical: false, effectiveness: 1, healed: 0, actorHp: 9, targetHp: 9 } as const;
  const fighter = (id: number, name: string) => ({ pokemon: pokemon(id, 400, { names: { es: name, en: name } }), hp: 9, maxHp: 9 });
  const battle = { round: 1, turn: 1, scene: "bosque" as const, deadline: null, choosing: true, stepId: 1, warningUntil: null, rivalIdle: false, confirmed: false, myLineup: null, myMove: null, mySwitch: null, myPause: null, myTeam: [fighter(1, "Uno"), fighter(3, "Tres")], rivalTeam: [fighter(2, "Dos"), fighter(4, "Cuatro")], myTitular: 1, rivalTitular: 2, moves: [] };
  const start: GameView = { ...initialGameView, code: "ABC", mySeat: 1, auction: { money: { 1: 0, 2: 0 }, teamSizes: { 1: 3, 2: 3 }, purchases: { 1: [], 2: [] }, lot: null, reveal: [], battle } };
  const turn = (n: number): ServerEvent => ({ name: "battle-turn", payload: { round: 1, turn: n, actions: [action] } });

  it("guarda cada turno con los nombres de quienes pelearon entonces", () => {
    const view = applyServerEvent(start, turn(1), 0);
    expect(view.battleLog).toEqual([{ round: 1, turn: 1, actions: [action], names: { 1: "Uno", 2: "Dos" }, entered: [] }]);
  });

  it("si alguien cambia, el golpe y el registro llevan el nombre de quien entró", () => {
    const view = applyServerEvent(start, { name: "battle-turn", payload: { round: 1, turn: 1, actions: [action], switches: [{ seat: 2, pokemonId: 4 }, { seat: 1, pokemonId: 3 }] } }, 0);
    expect(view.battleLog[0]).toMatchObject({ names: { 1: "Tres", 2: "Cuatro" }, entered: ["Cuatro", "Tres"] });
  });

  it("guarda como mucho los últimos 30", () => {
    let view = start;
    for (let n = 1; n <= 35; n++) view = applyServerEvent(view, turn(n), 0);
    expect(view.battleLog).toHaveLength(30);
    expect(view.battleLog[0]!.turn).toBe(6);
  });

  it("recuerda cómo acabó el asalto", () => {
    const view = applyServerEvent(start, { name: "battle-round-ended", payload: { round: 1, loser: 2, atLimit: false } }, 0);
    expect(view.lastRoundEnd).toEqual({ round: 1, loser: 2, atLimit: false });
  });
});
