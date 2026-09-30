import type { RoomConfig } from "@pokemon-minigames/shared";
import { describe, expect, it, vi } from "vitest";
import { GameRoom } from "../../src/game/room.js";
import { fixtureCatalog } from "../helpers/fixtures.js";
import { sequenceRng } from "../helpers/rng.js";
import { FakeRepository, FakeTime, RecordingBroadcaster } from "./fakes.js";

const ONE_ROUND: RoomConfig = { typeMode: "random", lengthMode: "custom", roundsLimit: 1, statsGoal: null };
const creator = { userId: "u1", username: "ash" };

function setup(config: RoomConfig = ONE_ROUND, rng: number[] = [0]) {
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
    { code: "ABC234", gameId: "game-1", config, creator },
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
    expect(repository.finishInput).toEqual({ status: "completed", winnerUserId: "u1", finalStats: { 1: 500, 2: 0 } });
  });

  it("un empate se guarda sin ganador", async () => {
    const { room, time, repository } = setup();
    startGame(room, time);
    time.advance(15_000); // nadie responde
    await room.idle();
    expect(repository.finishInput).toEqual({ status: "completed", winnerUserId: null, finalStats: { 1: 0, 2: 0 } });
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
    expect(repository.finishInput).toMatchObject({ status: "abandoned", winnerUserId: null });
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
