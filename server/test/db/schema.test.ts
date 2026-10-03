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

describe("motivo del fin de la partida", () => {
  const base = { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3 } as const;
  let n = 0;
  const create = (status: "waiting" | "in_progress" | "completed" | "abandoned", endReason?: string) =>
    prisma.game.create({
      data: { ...base, roomCode: `END${++n}`, status, endReason: endReason as never },
    });

  it("acepta una partida sin motivo en cualquier estado (las anteriores a la migración no lo tienen)", async () => {
    for (const status of ["waiting", "in_progress", "completed", "abandoned"] as const) {
      await expect(create(status)).resolves.toBeTruthy();
    }
  });

  it("una partida terminada solo admite los motivos de una partida terminada", async () => {
    for (const reason of ["completed", "forfeit", "disconnect", "exhausted"]) {
      await expect(create("completed", reason)).resolves.toBeTruthy();
    }
    for (const reason of ["cancelled", "expired", "abandoned"]) {
      await expect(create("completed", reason)).rejects.toThrow();
    }
  });

  it("una partida abandonada solo admite los motivos de una sala que no llegó a terminar", async () => {
    for (const reason of ["cancelled", "expired", "abandoned"]) {
      await expect(create("abandoned", reason)).resolves.toBeTruthy();
    }
    for (const reason of ["completed", "forfeit", "disconnect", "exhausted"]) {
      await expect(create("abandoned", reason)).rejects.toThrow();
    }
  });

  it("una partida en espera o en curso no puede tener motivo", async () => {
    await expect(create("waiting", "completed")).rejects.toThrow();
    await expect(create("in_progress", "forfeit")).rejects.toThrow();
  });
});

describe("preferencia de tema", () => {
  const user = (n: number, extra: object) =>
    prisma.user.create({ data: { email: `t${n}@example.com`, username: `tema${n}`, passwordHash: "h", ...extra } });

  it("un usuario nuevo no tiene preferencia", async () => {
    const created = await user(1, {});
    expect(created).toMatchObject({ theme: null, themeMode: null });
  });

  it("acepta tema y modo juntos", async () => {
    await expect(user(2, { theme: "pokedex", themeMode: "oscuro" })).resolves.toMatchObject({
      theme: "pokedex",
      themeMode: "oscuro",
    });
  });

  it("rechaza guardar el tema sin el modo o el modo sin el tema", async () => {
    await expect(user(3, { theme: "clasico" })).rejects.toThrow();
    await expect(user(4, { themeMode: "auto" })).rejects.toThrow();
  });
});

describe("índices por jugador", () => {
  it("existen los índices para buscar partidas y respuestas por usuario", async () => {
    const rows = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE indexname IN ('game_players_user_id_idx', 'round_picks_user_id_idx') ORDER BY indexname`;
    expect(rows.map((r) => r.indexname)).toEqual(["game_players_user_id_idx", "round_picks_user_id_idx"]);
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
