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
