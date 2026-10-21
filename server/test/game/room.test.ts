import type { RoomConfig } from "@pokemon-minigames/shared";
import { describe, expect, it, vi } from "vitest";
import { GameRoom, type RoomUser } from "../../src/game/room.js";
import { fixtureCatalog } from "../helpers/fixtures.js";
import { sequenceRng } from "../helpers/rng.js";
import { FakeRepository, FakeTime, RecordingBroadcaster } from "./fakes.js";

const ONE_ROUND: RoomConfig = { typeMode: "random", lengthMode: "custom", roundsLimit: 1, statsGoal: null };
const creator = { userId: "u1", username: "ash", isGuest: false };

function setup(config: RoomConfig = ONE_ROUND, rng: number[] = [0], opts: { gameId?: string | null; creator?: RoomUser; rematch?: boolean } = {}) {
  const time = new FakeTime();
  const broadcaster = new RecordingBroadcaster();
  const repository = new FakeRepository();
  const logger = { error: vi.fn() };
  const room = GameRoom.create(
    {
      clock: time,
      scheduler: time,
      broadcaster,
      repository,
      catalog: fixtureCatalog(),
      rng: sequenceRng(rng),
      logger,
      persistAttempts: 3,
      persistRetryDelayMs: 0,
    },
    { code: "ABC234", gameId: opts.gameId === undefined ? "game-1" : opts.gameId, config, creator: opts.creator ?? creator, rematch: opts.rematch },
  );
  return { room, time, broadcaster, repository, logger };
}

function startGame(room: GameRoom, time: FakeTime) {
  room.dispatch({ type: "PLAYER_JOINED", userId: "u2", username: "misty" });
  room.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
  room.dispatch({ type: "PLAYER_CONNECTED", seat: 2 });
  time.advance(5000);
}

describe("GameRoom", () => {
  it("expone quién participa y en qué asiento", () => {
    const { room } = setup();
    expect(room.code).toBe("ABC234");
    expect(room.seatOf("u1")).toBe(1);
    expect(room.seatOf("u2")).toBeUndefined();
    expect(room.playerCount()).toBe(1);
    expect(room.creatorName()).toBe("ash");

    room.dispatch({ type: "PLAYER_JOINED", userId: "u2", username: "misty" });
    expect(room.seatOf("u2")).toBe(2);
    expect(room.playerCount()).toBe(2);
    expect(room.hasSeat(2)).toBe(true);
  });

  it("al conectarse un jugador se le envía su estado completo", () => {
    const { room, broadcaster } = setup();
    room.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
    const state = broadcaster.last("room-state", 1)!;
    expect(state).toMatchObject({ code: "ABC234", phase: "waiting", mySeat: 1, round: null });
    expect(state.players).toHaveLength(1);
  });

  it("juega una partida completa usando solo los temporizadores y guarda todo en orden", async () => {
    const { room, time, broadcaster, repository } = setup();
    startGame(room, time);
    expect(broadcaster.last("round-started")).toMatchObject({ round: 1, type1: "flying", type2: "fire" });

    room.dispatch({ type: "SUBMIT", seat: 1, text: "Alfa" });
    time.advance(15_000); // el asiento 2 no responde: vence el plazo
    expect(room.phase).toBe("finished");

    const ended = broadcaster.last("game-ended")!;
    expect(ended).toMatchObject({ winnerSeat: 1, reason: "completed", totals: { 1: 500, 2: 0 } });

    await room.idle();
    expect(repository.calls).toEqual(["addSecondPlayer:u2", "markStarted", "saveRound:1", "finish:completed"]);
    expect(repository.rounds[0]!.picks.map((p) => p.result)).toEqual(["VALID", "NO_ANSWER"]);
    expect(repository.finishInput).toEqual({
      status: "completed",
      reason: "completed",
      winnerUserId: "u1",
      finalStats: { 1: 500, 2: 0 },
    });
  });

  it("un empate se guarda sin ganador", async () => {
    const { room, time, repository } = setup();
    startGame(room, time);
    time.advance(15_000); // nadie responde
    await room.idle();
    expect(repository.finishInput).toEqual({
      status: "completed",
      reason: "completed",
      winnerUserId: null,
      finalStats: { 1: 0, 2: 0 },
    });
  });

  it("un abandono voluntario se guarda con su motivo y le da la victoria al rival", async () => {
    const { room, time, repository } = setup();
    startGame(room, time);
    room.dispatch({ type: "LEAVE", seat: 2 });
    await room.idle();
    expect(repository.finishInput).toMatchObject({ status: "completed", reason: "forfeit", winnerUserId: "u1" });
  });

  it("al terminar cancela los temporizadores pendientes y avisa una sola vez", () => {
    const { room, time } = setup();
    const onFinished = vi.fn();
    room.onFinished(onFinished);
    startGame(room, time);
    expect(time.pendingCount).toBeGreaterThan(0);

    room.dispatch({ type: "LEAVE", seat: 2 });
    expect(room.phase).toBe("finished");
    expect(time.pendingCount).toBe(0);
    expect(onFinished).toHaveBeenCalledTimes(1);

    room.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("una sala que nadie completa caduca sola a los 10 minutos", async () => {
    const { room, time, repository } = setup();
    const onFinished = vi.fn();
    room.onFinished(onFinished);
    time.advance(10 * 60 * 1000);
    expect(room.phase).toBe("finished");
    expect(onFinished).toHaveBeenCalledTimes(1);
    await room.idle();
    expect(repository.finishInput).toMatchObject({ status: "abandoned", reason: "expired", winnerUserId: null });
  });

  describe("al terminar: resultado y resumen reenviable (revancha)", () => {
    it("outcome expone el motivo al terminar y es null antes", () => {
      const { room, time } = setup();
      expect(room.outcome).toBeNull();
      startGame(room, time);
      expect(room.outcome).toBeNull();
      room.dispatch({ type: "LEAVE", seat: 2 });
      expect(room.outcome).toEqual({ winnerSeat: 1, reason: "forfeit" });
    });

    it("players() devuelve usuario, nombre e isGuest por asiento", () => {
      const { room } = setup();
      expect(room.players()).toEqual({ 1: { userId: "u1", username: "ash", isGuest: false } });
      room.dispatch({ type: "PLAYER_JOINED", userId: "guest_a", username: "inv", guest: true });
      expect(room.players()).toEqual({
        1: { userId: "u1", username: "ash", isGuest: false },
        2: { userId: "guest_a", username: "inv", isGuest: true },
      });
    });

    it("replaySummary manda room-state (finished) y game-ended solo a ese asiento, con los mismos equipos y totales", () => {
      const { room, time, broadcaster } = setup();
      startGame(room, time);
      room.dispatch({ type: "SUBMIT", seat: 1, text: "Alfa" });
      time.advance(15_000);
      expect(room.phase).toBe("finished");
      const original = broadcaster.last("game-ended")!;

      const before = broadcaster.sent.length;
      room.replaySummary(2);
      const added = broadcaster.sent.slice(before);
      expect(added.map((entry) => [entry.to, entry.event.name])).toEqual([
        [2, "room-state"],
        [2, "game-ended"],
      ]);
      expect(added[0]!.event.payload).toMatchObject({ phase: "finished", mySeat: 2, code: "ABC234" });
      expect(added[1]!.event.payload).toEqual(original);
    });

    it("replaySummary en una sala sin terminar no envía nada", () => {
      const { room, broadcaster } = setup();
      const before = broadcaster.sent.length;
      room.replaySummary(1);
      expect(broadcaster.sent.length).toBe(before);
    });

    it("una sala creada con rematch: true lo dice en su estado y caduca a los 30 s", () => {
      const { room, time, broadcaster } = setup(ONE_ROUND, [0], { rematch: true });
      room.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
      expect(broadcaster.last("room-state", 1)).toMatchObject({ rematch: true });
      time.advance(30_000);
      expect(room.phase).toBe("finished");
    });
  });

  describe("salas con un invitado: sin rastro en la base de datos", () => {
    const guest: RoomUser = { userId: "guest_a", username: "inv", isGuest: true };

    it("una sala con gameId null no se guarda: juega una partida entera y no escribe nada", async () => {
      const { room, time, repository } = setup(ONE_ROUND, [0], { gameId: null, creator: guest });
      expect(room.persisted).toBe(false);
      startGame(room, time);
      room.dispatch({ type: "SUBMIT", seat: 1, text: "Alfa" });
      time.advance(15_000);
      expect(room.phase).toBe("finished");
      await room.idle();
      expect(repository.calls).toEqual([]);
      expect(repository.timeline).toEqual([]);
    });

    it("el creador invitado queda marcado en el estado de la sala", () => {
      const { room, broadcaster } = setup(ONE_ROUND, [0], { gameId: null, creator: guest });
      room.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
      expect(broadcaster.last("room-state", 1)!.players[0]).toMatchObject({ username: "inv", guest: true });
    });

    it("una sala con gameId sí se guarda (persisted)", () => {
      expect(setup().room.persisted).toBe(true);
    });

    it("markNotPersisted descarta la partida una sola vez y deja de guardar asiento, inicio, rondas y final", async () => {
      const { room, time, repository } = setup();
      room.markNotPersisted();
      room.markNotPersisted(); // idempotente
      expect(room.persisted).toBe(false);
      room.dispatch({ type: "PLAYER_JOINED", userId: "guest_a", username: "inv", guest: true });
      room.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
      room.dispatch({ type: "PLAYER_CONNECTED", seat: 2 });
      time.advance(5000);
      room.dispatch({ type: "SUBMIT", seat: 1, text: "Alfa" });
      time.advance(15_000);
      expect(room.phase).toBe("finished");
      await room.idle();
      expect(repository.calls).toEqual(["discardGame:game-1"]);
    });

    it("el descarte espera a lo que ya estaba en la cola y reintenta si falla", async () => {
      const { room, repository } = setup();
      repository.failures.discardGame = 2;
      room.markNotPersisted();
      await room.idle();
      expect(repository.discarded).toEqual(["game-1"]);
      expect(repository.timeline.filter((entry) => entry.startsWith("discardGame:"))).toEqual([
        "discardGame:start",
        "discardGame:fail",
        "discardGame:start",
        "discardGame:fail",
        "discardGame:start",
        "discardGame:end",
      ]);
    });

    it("si el descarte falla siempre, se registra el error y la sala sigue jugando sin guardarse", async () => {
      const { room, time, repository, logger } = setup();
      repository.failures.discardGame = 99;
      room.markNotPersisted();
      room.dispatch({ type: "PLAYER_JOINED", userId: "guest_a", username: "inv", guest: true });
      room.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
      room.dispatch({ type: "PLAYER_CONNECTED", seat: 2 });
      time.advance(5000);
      room.dispatch({ type: "SUBMIT", seat: 1, text: "Alfa" });
      time.advance(15_000);
      await room.idle();
      expect(room.phase).toBe("finished");
      expect(room.persisted).toBe(false);
      expect(repository.calls).toEqual([]);
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error.mock.calls[0]![0]).toContain("descartar");
    });

    it("markNotPersisted en una sala que nunca se guardó no llama a la base de datos", async () => {
      const { room, repository } = setup(ONE_ROUND, [0], { gameId: null, creator: guest });
      room.markNotPersisted();
      await room.idle();
      expect(repository.timeline).toEqual([]);
    });
  });

  describe("guardado en la base de datos", () => {
    it("reintenta una escritura que falla y la deja hecha", async () => {
      const { room, time, repository, logger } = setup();
      repository.failures.saveRound = 2;
      startGame(room, time);
      time.advance(15_000);
      await room.idle();
      expect(repository.calls).toContain("saveRound:1");
      expect(repository.timeline.filter((e) => e === "saveRound:fail")).toHaveLength(2);
      expect(logger.error).not.toHaveBeenCalled();
    });

    it("si una escritura falla siempre, se registra el error y el resto se sigue guardando", async () => {
      const { room, time, repository, logger } = setup();
      repository.failures.saveRound = 99;
      startGame(room, time);
      time.advance(15_000);
      await room.idle();

      expect(room.phase).toBe("finished"); // la partida no se detuvo
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error.mock.calls[0]![0]).toContain("guardar la ronda 1");
      expect(repository.calls).not.toContain("saveRound:1");
      expect(repository.calls).toContain("finish:completed");
    });

    it("las escrituras no se solapan aunque una sea lenta: cada una espera a la anterior", async () => {
      const { room, time, repository } = setup();
      repository.delays.saveRound = 30;
      startGame(room, time);
      time.advance(15_000);
      await room.idle();

      const timeline = repository.timeline.filter((e) => e.startsWith("saveRound") || e.startsWith("finish"));
      expect(timeline).toEqual(["saveRound:start", "saveRound:end", "finish:start", "finish:end"]);
    });
  });

  it("ignora un temporizador viejo que se dispara tras terminar la partida", () => {
    const { room, time, broadcaster } = setup();
    startGame(room, time);
    room.dispatch({ type: "LEAVE", seat: 1 });
    const sentBefore = broadcaster.sent.length;
    time.advance(60_000);
    expect(broadcaster.sent).toHaveLength(sentBefore);
  });
});
