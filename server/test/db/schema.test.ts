import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDatabase } from "../helpers/db.js";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

async function createUser(n: number) {
  return prisma.user.create({
    data: { email: `user${n}@example.com`, username: `user${n}`, passwordHash: "hash" },
  });
}

describe("users", () => {
  it("rechaza un username repetido sin distinguir mayúsculas", async () => {
    await prisma.user.create({ data: { email: "a@example.com", username: "Ash", passwordHash: "h" } });
    await expect(
      prisma.user.create({ data: { email: "b@example.com", username: "ash", passwordHash: "h" } }),
    ).rejects.toThrow();
  });

  it("rechaza un email repetido", async () => {
    await prisma.user.create({ data: { email: "a@example.com", username: "ash", passwordHash: "h" } });
    await expect(
      prisma.user.create({ data: { email: "a@example.com", username: "misty", passwordHash: "h" } }),
    ).rejects.toThrow();
  });
});

describe("games", () => {
  const base = { typeMode: "random", roomCode: "POK123" } as const;

  it("acepta rondas fijas de 3 o 5", async () => {
    await expect(
      prisma.game.create({ data: { ...base, lengthMode: "fixed_rounds", roundsLimit: 5 } }),
    ).resolves.toBeTruthy();
  });

  it("rechaza rondas fijas con un número distinto de 3 o 5", async () => {
    await expect(
      prisma.game.create({ data: { ...base, lengthMode: "fixed_rounds", roundsLimit: 4 } }),
    ).rejects.toThrow();
  });

  it("rechaza rondas fijas sin número de rondas", async () => {
    await expect(prisma.game.create({ data: { ...base, lengthMode: "fixed_rounds" } })).rejects.toThrow();
  });

  it("rechaza rondas fijas con meta de stats", async () => {
    await expect(
      prisma.game.create({ data: { ...base, lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: 2500 } }),
    ).rejects.toThrow();
  });

  it("acepta una partida personalizada con solo meta de stats", async () => {
    await expect(
      prisma.game.create({ data: { ...base, lengthMode: "custom", statsGoal: 2500 } }),
    ).resolves.toBeTruthy();
  });

  it("rechaza una partida personalizada sin condición de fin o con las dos", async () => {
    await expect(prisma.game.create({ data: { ...base, lengthMode: "custom" } })).rejects.toThrow();
    await expect(
      prisma.game.create({
        data: { ...base, roomCode: "POK124", lengthMode: "custom", roundsLimit: 10, statsGoal: 2500 },
      }),
    ).rejects.toThrow();
  });

  it("rechaza un código de sala repetido", async () => {
    await prisma.game.create({ data: { ...base, lengthMode: "fixed_rounds", roundsLimit: 3 } });
    await expect(
      prisma.game.create({ data: { ...base, lengthMode: "fixed_rounds", roundsLimit: 3 } }),
    ).rejects.toThrow();
  });
});

describe("rondas y respuestas", () => {
  async function setupRound() {
    await prisma.type.createMany({
      data: [{ id: 1, name: "normal" }, { id: 2, name: "fighting" }],
      skipDuplicates: true,
    });
    const game = await prisma.game.create({
      data: { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3, roomCode: "POK123" },
    });
    const user = await createUser(1);
    const round = await prisma.round.create({
      data: { gameId: game.id, number: 1, type1Id: 1, type2Id: 2 },
    });
    return { game, user, round };
  }

  it("rechaza un par de tipos desordenado o repetido", async () => {
    const { game } = await setupRound();
    await expect(
      prisma.round.create({ data: { gameId: game.id, number: 2, type1Id: 2, type2Id: 1 } }),
    ).rejects.toThrow();
    await expect(
      prisma.round.create({ data: { gameId: game.id, number: 3, type1Id: 1, type2Id: 1 } }),
    ).rejects.toThrow();
  });

  it("rechaza un número de ronda repetido en la misma partida", async () => {
    const { game } = await setupRound();
    await expect(
      prisma.round.create({ data: { gameId: game.id, number: 1, type1Id: 1, type2Id: 2 } }),
    ).rejects.toThrow();
  });

  it("permite una sola respuesta por jugador y ronda", async () => {
    const { user, round } = await setupRound();
    await prisma.roundPick.create({
      data: { roundId: round.id, userId: user.id, result: "NO_ANSWER" },
    });
    await expect(
      prisma.roundPick.create({ data: { roundId: round.id, userId: user.id, result: "NOT_FOUND", submittedText: "x" } }),
    ).rejects.toThrow();
  });

  it("una respuesta VALID exige un Pokémon", async () => {
    const { user, round } = await setupRound();
    await expect(
      prisma.roundPick.create({ data: { roundId: round.id, userId: user.id, result: "VALID" } }),
    ).rejects.toThrow();
  });
});

describe("pokemon", () => {
  const stats = { baseHp: 10, baseAttack: 10, baseDefense: 10, baseSpAttack: 10, baseSpDefense: 10, baseSpeed: 10 };

  it("rechaza un total_stats que no sea la suma de las stats base", async () => {
    await prisma.pokemon.deleteMany({ where: { id: 9001 } });
    await expect(
      prisma.pokemon.create({ data: { id: 9001, ...stats, totalStats: 61, spriteUrl: "u" } }),
    ).rejects.toThrow();
    await expect(
      prisma.pokemon.create({ data: { id: 9001, ...stats, totalStats: 60, spriteUrl: "u" } }),
    ).resolves.toBeTruthy();
    await prisma.pokemon.delete({ where: { id: 9001 } });
  });
});
