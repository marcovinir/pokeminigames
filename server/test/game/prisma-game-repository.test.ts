import { randomUUID } from "node:crypto";
import type { RoomConfig } from "@pokemon-minigames/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedCatalog } from "../../src/catalog/seed.js";
import type { RoundRecord } from "../../src/game/engine/types.js";
import { createPrismaGameRepository } from "../../src/game/prisma-game-repository.js";
import { fixtureSnapshot } from "../helpers/fixtures.js";
import { prisma, resetCatalog, resetDatabase } from "../helpers/db.js";

const repository = createPrismaGameRepository(prisma);
const config: RoomConfig = { typeMode: "chosen", lengthMode: "custom", roundsLimit: null, statsGoal: 1500 };

let ash: string;
let misty: string;

beforeAll(async () => {
  await resetCatalog();
  await seedCatalog(prisma, fixtureSnapshot());
});
beforeEach(async () => {
  await resetDatabase();
  ash = (await prisma.user.create({ data: { email: "a@example.com", username: "ash", passwordHash: "h" } })).id;
  misty = (await prisma.user.create({ data: { email: "m@example.com", username: "misty", passwordHash: "h" } })).id;
});
afterAll(async () => {
  await resetCatalog();
  await prisma.$disconnect();
});

const sampleRound = (): RoundRecord => ({
  number: 1,
  pair: ["flying", "fire"],
  picks: [
    { seat: 1, userId: ash, text: "Alfa", result: "VALID", pokemonId: 1, submittedAt: 1_700_000_000_123 },
    { seat: 2, userId: misty, text: null, result: "NO_ANSWER", pokemonId: null, submittedAt: null },
  ],
});

/** Una partida entre dos personas, ya terminada (o no) y con la hora de fin fijada para que el orden sea determinista. */
let roomCounter = 0;
async function playedGame(
  first: string,
  second: string,
  how: { status?: "completed" | "abandoned" | "in_progress" | "waiting"; winner?: string | null; reason?: "completed" | "forfeit" | "cancelled"; endedAt?: Date },
): Promise<string> {
  const id = await repository.createGame({ roomCode: `H${++roomCounter}`.padEnd(6, "X"), config, creatorUserId: first });
  await repository.addSecondPlayer(id, second);
  const status = how.status ?? "completed";
  if (status === "in_progress") await repository.markStarted(id);
  if (status === "completed" || status === "abandoned") {
    await repository.finish(id, {
      status,
      reason: status === "abandoned" ? "cancelled" : (how.reason ?? "completed"),
      winnerUserId: how.winner ?? null,
      finalStats: { 1: 100, 2: 90 },
    });
    if (how.endedAt) await prisma.game.update({ where: { id }, data: { endedAt: how.endedAt } });
  }
  return id;
}

describe("headToHead", () => {
  let brock: string;
  beforeEach(async () => {
    roomCounter = 0;
    brock = (await prisma.user.create({ data: { email: "b@example.com", username: "brock", passwordHash: "h" } })).id;
  });

  it("cuenta solo las partidas completadas entre esas dos cuentas (ni abandonadas, ni en curso, ni contra otra persona)", async () => {
    await playedGame(ash, misty, { winner: ash });
    await playedGame(ash, misty, { status: "abandoned" });
    await playedGame(ash, misty, { status: "in_progress" });
    await playedGame(ash, misty, { status: "waiting" });
    await playedGame(ash, brock, { winner: ash });
    await playedGame(misty, brock, { winner: brock });
    expect(await repository.headToHead(ash, misty, 5)).toEqual({ winsA: 1, winsB: 0, draws: 0, recent: ["a"] });
  });

  it("separa las victorias de cada una y los empates, y la forma reciente va de la más reciente a la más antigua y se queda en 5", async () => {
    const day = (n: number) => new Date(Date.UTC(2026, 0, n));
    // De la más antigua a la más reciente: A, B, empate, A, B, empate, A (el creador alterna para probar que no importa el asiento).
    await playedGame(ash, misty, { winner: ash, endedAt: day(1) });
    await playedGame(misty, ash, { winner: misty, endedAt: day(2) });
    await playedGame(ash, misty, { winner: null, endedAt: day(3) });
    await playedGame(misty, ash, { winner: ash, endedAt: day(4) });
    await playedGame(ash, misty, { winner: misty, endedAt: day(5) });
    await playedGame(misty, ash, { winner: null, endedAt: day(6) });
    await playedGame(ash, misty, { winner: ash, endedAt: day(7) });

    expect(await repository.headToHead(ash, misty, 5)).toEqual({ winsA: 3, winsB: 2, draws: 2, recent: ["a", "draw", "b", "a", "draw"] });
    // Visto desde la otra persona es el espejo.
    expect(await repository.headToHead(misty, ash, 5)).toEqual({ winsA: 2, winsB: 3, draws: 2, recent: ["b", "draw", "a", "b", "draw"] });
    expect((await repository.headToHead(ash, misty, 2)).recent).toEqual(["a", "draw"]);
  });

  it("sin partidas devuelve ceros y una lista vacía", async () => {
    expect(await repository.headToHead(ash, misty, 5)).toEqual({ winsA: 0, winsB: 0, draws: 0, recent: [] });
  });

  it("una partida completada por abandono (forfeit) cuenta, como en las estadísticas", async () => {
    await playedGame(ash, misty, { winner: misty, reason: "forfeit" });
    expect(await repository.headToHead(ash, misty, 5)).toEqual({ winsA: 0, winsB: 1, draws: 0, recent: ["b"] });
  });
});

describe("createPrismaGameRepository", () => {
  it("createGame crea la partida en espera con el creador en el asiento 1", async () => {
    const id = await repository.createGame({ roomCode: "ABC234", config, creatorUserId: ash });
    const game = await prisma.game.findUniqueOrThrow({ where: { id }, include: { players: true } });
    expect(game).toMatchObject({
      roomCode: "ABC234",
      typeMode: "chosen",
      lengthMode: "custom",
      roundsLimit: null,
      statsGoal: 1500,
      status: "waiting",
      winnerId: null,
      endedAt: null,
    });
    expect(game.players).toEqual([expect.objectContaining({ userId: ash, seat: 1, finalStats: null })]);
  });

  it("rechaza un código de sala repetido", async () => {
    await repository.createGame({ roomCode: "ABC234", config, creatorUserId: ash });
    await expect(repository.createGame({ roomCode: "ABC234", config, creatorUserId: misty })).rejects.toMatchObject({
      code: "P2002",
    });
  });

  it("addSecondPlayer y removeSecondPlayer manejan el asiento 2", async () => {
    const id = await repository.createGame({ roomCode: "ABC234", config, creatorUserId: ash });
    await repository.addSecondPlayer(id, misty);
    expect(await prisma.gamePlayer.count({ where: { gameId: id } })).toBe(2);
    await repository.removeSecondPlayer(id);
    const players = await prisma.gamePlayer.findMany({ where: { gameId: id } });
    expect(players.map((p) => p.seat)).toEqual([1]);
  });

  it("markStarted pasa la partida a in_progress", async () => {
    const id = await repository.createGame({ roomCode: "ABC234", config, creatorUserId: ash });
    await repository.markStarted(id);
    expect((await prisma.game.findUniqueOrThrow({ where: { id } })).status).toBe("in_progress");
  });

  it("saveRound guarda la ronda con el par ordenado y una fila por jugador", async () => {
    const id = await repository.createGame({ roomCode: "ABC234", config, creatorUserId: ash });
    await repository.addSecondPlayer(id, misty);
    await repository.saveRound(id, sampleRound());

    const round = await prisma.round.findFirstOrThrow({
      where: { gameId: id },
      include: { picks: { orderBy: { result: "asc" } }, type1: true, type2: true },
    });
    expect(round.number).toBe(1);
    expect([round.type1.name, round.type2.name]).toEqual(["flying", "fire"]);
    expect(round.type1Id).toBeLessThan(round.type2Id);

    const valid = round.picks.find((p) => p.result === "VALID")!;
    expect(valid).toMatchObject({ userId: ash, submittedText: "Alfa", pokemonId: 1 });
    expect(valid.submittedAt?.getTime()).toBe(1_700_000_000_123);
    const none = round.picks.find((p) => p.result === "NO_ANSWER")!;
    expect(none).toMatchObject({ userId: misty, submittedText: null, pokemonId: null, submittedAt: null });
  });

  it("saveRound es atómico: si una respuesta es inválida no queda la ronda a medias", async () => {
    const id = await repository.createGame({ roomCode: "ABC234", config, creatorUserId: ash });
    const broken = sampleRound();
    broken.picks[0]!.pokemonId = 999_999; // Pokémon que no existe: viola la clave foránea
    await expect(repository.saveRound(id, broken)).rejects.toThrow();
    expect(await prisma.round.count({ where: { gameId: id } })).toBe(0);
  });

  it("finish guarda el resultado, el motivo, el ganador y los stats finales por asiento", async () => {
    const id = await repository.createGame({ roomCode: "ABC234", config, creatorUserId: ash });
    await repository.addSecondPlayer(id, misty);
    await repository.finish(id, { status: "completed", reason: "forfeit", winnerUserId: misty, finalStats: { 1: 900, 2: 1200 } });

    const game = await prisma.game.findUniqueOrThrow({ where: { id }, include: { players: { orderBy: { seat: "asc" } } } });
    expect(game).toMatchObject({ status: "completed", endReason: "forfeit", winnerId: misty });
    expect(game.endedAt).toBeInstanceOf(Date);
    expect(game.players.map((p) => p.finalStats)).toEqual([900, 1200]);
  });

  it("finish de una partida abandonada no tiene ganador y solo actualiza los asientos que existen", async () => {
    const id = await repository.createGame({ roomCode: "ABC234", config, creatorUserId: ash });
    await repository.finish(id, { status: "abandoned", reason: "cancelled", winnerUserId: null, finalStats: { 1: 0 } });
    const game = await prisma.game.findUniqueOrThrow({ where: { id }, include: { players: true } });
    expect(game).toMatchObject({ status: "abandoned", endReason: "cancelled", winnerId: null });
    expect(game.players).toHaveLength(1);
  });

  it("finish rechaza un motivo que no corresponde al estado y no deja la partida a medias", async () => {
    const id = await repository.createGame({ roomCode: "ABC234", config, creatorUserId: ash });
    await expect(
      repository.finish(id, { status: "completed", reason: "expired", winnerUserId: null, finalStats: { 1: 0 } }),
    ).rejects.toThrow();
    const game = await prisma.game.findUniqueOrThrow({ where: { id } });
    expect(game).toMatchObject({ status: "waiting", endReason: null, endedAt: null });
  });

  it("discardGame borra la partida en espera y sus jugadores y no toca otras partidas", async () => {
    const waiting = await repository.createGame({ roomCode: "ABC234", config, creatorUserId: ash });
    await repository.addSecondPlayer(waiting, misty);
    const other = await repository.createGame({ roomCode: "ZZZ999", config, creatorUserId: misty });

    await repository.discardGame(waiting);

    expect(await prisma.game.findMany({ select: { id: true } })).toEqual([{ id: other }]);
    const players = await prisma.gamePlayer.findMany();
    expect(players.map((p) => [p.gameId, p.userId, p.seat])).toEqual([[other, misty, 1]]);
  });

  it("discardGame solo borra partidas que esperan: una que ya empezó o terminó se queda, y un id que no existe no falla", async () => {
    const started = await repository.createGame({ roomCode: "ABC234", config, creatorUserId: ash });
    await repository.markStarted(started);
    const finished = await repository.createGame({ roomCode: "DEF567", config, creatorUserId: ash });
    await repository.finish(finished, { status: "abandoned", reason: "cancelled", winnerUserId: null, finalStats: {} });

    await repository.discardGame(started);
    await repository.discardGame(finished);
    await expect(repository.discardGame(randomUUID())).resolves.toBeUndefined();

    expect(await prisma.game.count()).toBe(2);
    expect(await prisma.gamePlayer.count()).toBe(2);
  });

  it("abandonUnfinished marca como abandonadas solo las partidas en espera o en curso", async () => {
    const waiting = await repository.createGame({ roomCode: "AAAAAA", config, creatorUserId: ash });
    const playing = await repository.createGame({ roomCode: "BBBBBB", config, creatorUserId: misty });
    await repository.markStarted(playing);
    const done = await prisma.game.create({
      data: { roomCode: "CCCCCC", typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3, status: "completed" },
    });

    await expect(repository.abandonUnfinished()).resolves.toBe(2);

    const status = async (id: string) => (await prisma.game.findUniqueOrThrow({ where: { id } })).status;
    expect(await status(waiting)).toBe("abandoned");
    expect(await status(playing)).toBe("abandoned");
    expect(await status(done.id)).toBe("completed");
    const reason = async (id: string) => (await prisma.game.findUniqueOrThrow({ where: { id } })).endReason;
    expect(await reason(waiting)).toBe("abandoned");
    expect(await reason(playing)).toBe("abandoned");
    expect(await reason(done.id)).toBeNull();
    expect((await prisma.game.findUniqueOrThrow({ where: { id: waiting } })).endedAt).toBeInstanceOf(Date);
    await expect(repository.abandonUnfinished()).resolves.toBe(0);
  });
});
