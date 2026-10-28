import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedCatalog } from "../../src/catalog/seed.js";
import { StatsService } from "../../src/stats/stats.service.js";
import { AppError } from "../../src/http/errors.js";
import { fixtureCatalog, fixtureSnapshot } from "../helpers/fixtures.js";
import { prisma, resetCatalog, resetDatabase } from "../helpers/db.js";
import { seedGame } from "../helpers/games.js";

const service = new StatsService({ prisma, catalog: fixtureCatalog() });
const DAY = 24 * 60 * 60 * 1000;
const day = (n: number) => new Date(Date.UTC(2026, 8, 1) + n * DAY);

let ash: string;
let misty: string;
let brock: string;

beforeAll(async () => {
  await resetCatalog();
  await seedCatalog(prisma, fixtureSnapshot());
});
beforeEach(async () => {
  await resetDatabase();
  const user = async (name: string) =>
    (await prisma.user.create({ data: { email: `${name}@example.com`, username: name, passwordHash: "h" } })).id;
  ash = await user("ash");
  misty = await user("misty");
  brock = await user("brock");
});
afterAll(async () => {
  await resetCatalog();
  await prisma.$disconnect();
});

describe("StatsService.findUserByUsername", () => {
  it("busca sin distinguir mayúsculas y devuelve el nombre tal como se escribió al registrarse", async () => {
    await expect(service.findUserByUsername("ASH")).resolves.toEqual({ id: ash, username: "ash" });
  });

  it("el guion bajo no actúa como comodín", async () => {
    await prisma.user.create({ data: { email: "a_b@example.com", username: "a_b", passwordHash: "h" } });
    await prisma.user.create({ data: { email: "axb@example.com", username: "axb", passwordHash: "h" } });
    await expect(service.findUserByUsername("a_b")).resolves.toMatchObject({ username: "a_b" });
    await expect(service.findUserByUsername("a_c")).resolves.toBeNull();
  });

  it("un nombre que no existe da null", async () => {
    await expect(service.findUserByUsername("nadie")).resolves.toBeNull();
  });
});

describe("StatsService.getStats", () => {
  it("una persona sin partidas tiene todo en cero", async () => {
    const { username, stats } = await service.getStats(ash);
    expect(username).toBe("ash");
    expect(stats).toMatchObject({ played: 0, wins: 0, winRate: null, averagePower: null, bestGameScore: null, topPokemon: [] });
  });

  it("un usuario que no existe da USER_NOT_FOUND", async () => {
    await expect(service.getStats("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({
      status: 404,
      code: "USER_NOT_FOUND",
    });
    await expect(service.getStats("00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(AppError);
  });

  it("cuenta ganadas, empatadas y perdidas, y la mejor partida", async () => {
    await seedGame({ code: "G00001", endedAt: day(1), players: [{ userId: ash, score: 900 }, { userId: misty, score: 400 }], winner: 0 });
    await seedGame({ code: "G00002", endedAt: day(2), players: [{ userId: misty, score: 700 }, { userId: ash, score: 300 }], winner: 0 });
    await seedGame({ code: "G00003", endedAt: day(3), players: [{ userId: ash, score: 500 }, { userId: brock, score: 500 }], winner: null });

    const { stats } = await service.getStats(ash);
    expect(stats).toMatchObject({ played: 3, wins: 1, draws: 1, losses: 1, bestGameScore: 900 });
    expect(stats.winRate).toBeCloseTo(1 / 3);
    expect(stats).toMatchObject({ currentStreak: 0, bestStreak: 1 });
  });

  it("las partidas abandonadas, en espera o en curso no cuentan para nada", async () => {
    await seedGame({ code: "G00001", endedAt: day(1), players: [{ userId: ash, score: 100, wonPokemon: [1] }, { userId: misty, score: 0 }], winner: 0 });
    await seedGame({ code: "G00002", endedAt: day(2), status: "abandoned", reason: "expired", players: [{ userId: ash, score: 999, wonPokemon: [6] }, { userId: misty, score: 0 }] });
    await seedGame({ code: "G00003", endedAt: day(3), status: "in_progress", players: [{ userId: ash, score: null }, { userId: misty, score: null }] });
    await seedGame({ code: "G00004", endedAt: day(4), status: "waiting", players: [{ userId: ash, score: null }, { userId: misty, score: null }] });

    const { stats } = await service.getStats(ash);
    expect(stats).toMatchObject({ played: 1, wins: 1, bestGameScore: 100 });
    expect(stats.topPokemon.map((t) => t.pokemon.id)).toEqual([1]);
  });

  it("la racha sigue el orden de fin de las partidas, no el de creación", async () => {
    // Se crean primero las recientes: la actual debe contar las victorias más nuevas.
    await seedGame({ code: "G00003", endedAt: day(3), players: [{ userId: ash, score: 1 }, { userId: misty, score: 0 }], winner: 0 });
    await seedGame({ code: "G00002", endedAt: day(2), players: [{ userId: ash, score: 1 }, { userId: misty, score: 0 }], winner: 0 });
    await seedGame({ code: "G00001", endedAt: day(1), players: [{ userId: ash, score: 0 }, { userId: misty, score: 1 }], winner: 1 });

    const { stats } = await service.getStats(ash);
    expect(stats).toMatchObject({ currentStreak: 2, bestStreak: 2 });
  });

  it("los Pokémon más ganados y el poder promedio salen solo de las jugadas válidas propias", async () => {
    await seedGame({
      code: "G00001",
      endedAt: day(1),
      players: [
        { userId: ash, score: 1, wonPokemon: [1, 1, 6] },
        { userId: misty, score: 1, wonPokemon: [2, 2, 2, 2] },
      ],
      winner: 0,
    });
    await seedGame({ code: "G00002", endedAt: day(2), players: [{ userId: ash, score: 1, wonPokemon: [1] }, { userId: brock, score: 1, wonPokemon: [3] }], winner: 0 });

    const { stats } = await service.getStats(ash);
    expect(stats.topPokemon.map((t) => [t.pokemon.id, t.wins])).toEqual([
      [1, 3],
      [6, 1],
    ]);
    // Ganó Alfa (500) tres veces y Zeta (600) una: (500 * 3 + 600) / 4 = 525.
    expect(stats.averagePower).toBe(525);
  });

  it("cada persona ve solo lo suyo", async () => {
    await seedGame({ code: "G00001", endedAt: day(1), players: [{ userId: ash, score: 900, wonPokemon: [1] }, { userId: misty, score: 400 }], winner: 0 });
    const mistyStats = (await service.getStats(misty)).stats;
    expect(mistyStats).toMatchObject({ played: 1, wins: 0, losses: 1, topPokemon: [], averagePower: null });
    expect((await service.getStats(brock)).stats.played).toBe(0);
  });
});

describe("StatsService.getHistory", () => {
  const config = { typeMode: "chosen", lengthMode: "custom", roundsLimit: null, statsGoal: 2500 } as const;

  it("devuelve el rival, el marcador visto desde el lado de la persona, el motivo y la configuración", async () => {
    const id = await seedGame({
      code: "SECRET",
      endedAt: day(5),
      reason: "forfeit",
      config,
      players: [{ userId: misty, score: 700 }, { userId: ash, score: 300 }],
      winner: 0,
    });
    const page = await service.getHistory(ash, { limit: 20 });
    expect(page.nextCursor).toBeNull();
    expect(page.games).toEqual([
      {
        id,
        endedAt: day(5).toISOString(),
        result: "lost",
        reason: "forfeit",
        opponent: { username: "misty", avatarId: null },
        myScore: 300,
        opponentScore: 700,
        config: { ...config, typeHints: false },
      },
    ]);
  });

  it("nunca incluye el código de sala ni nada que identifique a la sala", async () => {
    await seedGame({ code: "SECRET", endedAt: day(1), players: [{ userId: ash, score: 1 }, { userId: misty, score: 0 }], winner: 0 });
    const [entry] = (await service.getHistory(ash, { limit: 20 })).games;
    expect(JSON.stringify(entry)).not.toContain("SECRET");
    expect(Object.keys(entry!).sort()).toEqual(["config", "endedAt", "id", "myScore", "opponent", "opponentScore", "reason", "result"]);
  });

  it("una partida anterior a que se guardara el motivo lo trae como null", async () => {
    await seedGame({ code: "G00001", endedAt: day(1), players: [{ userId: ash, score: 1 }, { userId: misty, score: 0 }], winner: 0 });
    expect((await service.getHistory(ash, { limit: 20 })).games[0]!.reason).toBeNull();
  });

  it("solo trae las partidas completadas de esa persona, de la más reciente a la más antigua", async () => {
    await seedGame({ code: "G00001", endedAt: day(1), players: [{ userId: ash, score: 1 }, { userId: misty, score: 0 }], winner: 0 });
    await seedGame({ code: "G00003", endedAt: day(3), players: [{ userId: ash, score: 0 }, { userId: misty, score: 1 }], winner: 1 });
    await seedGame({ code: "G00002", endedAt: day(2), players: [{ userId: ash, score: 1 }, { userId: brock, score: 1 }], winner: null });
    await seedGame({ code: "G00004", endedAt: day(4), status: "abandoned", reason: "cancelled", players: [{ userId: ash, score: 0 }, { userId: misty, score: 0 }] });
    await seedGame({ code: "G00005", endedAt: day(5), players: [{ userId: misty, score: 1 }, { userId: brock, score: 0 }], winner: 0 });

    const page = await service.getHistory(ash, { limit: 20 });
    expect(page.games.map((g) => [g.result, g.opponent.username])).toEqual([
      ["lost", "misty"],
      ["drawn", "brock"],
      ["won", "misty"],
    ]);
  });

  describe("paginación", () => {
    async function fiveGames() {
      // Dos partidas terminan en el mismo instante: el cursor no puede saltarse ni repetir ninguna.
      const ids: string[] = [];
      const dates = [day(1), day(2), day(3), day(3), day(4)];
      for (const [i, endedAt] of dates.entries()) {
        ids.push(await seedGame({ code: `P0000${i}`, endedAt, players: [{ userId: ash, score: i }, { userId: misty, score: 0 }], winner: 0 }));
      }
      return ids;
    }

    it("recorre todas las partidas por páginas, sin repetir ni saltarse ninguna", async () => {
      const ids = await fiveGames();
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const page = await service.getHistory(ash, { limit: 2, before: cursor });
        seen.push(...page.games.map((g) => g.id));
        cursor = page.nextCursor;
        pages++;
      } while (cursor !== null && pages < 10);

      expect(pages).toBe(3);
      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5);
      expect([...seen].sort()).toEqual([...ids].sort());
    });

    it("el orden de las páginas es el mismo que el de pedirlo todo de una vez", async () => {
      await fiveGames();
      const all = (await service.getHistory(ash, { limit: 50 })).games.map((g) => g.id);
      const first = await service.getHistory(ash, { limit: 3 });
      const second = await service.getHistory(ash, { limit: 3, before: first.nextCursor });
      expect([...first.games, ...second.games].map((g) => g.id)).toEqual(all);
    });

    it("si el límite es justo la cantidad de partidas, no hay página siguiente", async () => {
      await fiveGames();
      const page = await service.getHistory(ash, { limit: 5 });
      expect(page.games).toHaveLength(5);
      expect(page.nextCursor).toBeNull();
    });

    it("un cursor que ya pasó la última partida da una página vacía", async () => {
      await fiveGames();
      const last = await service.getHistory(ash, { limit: 4 });
      const page = await service.getHistory(ash, { limit: 4, before: last.nextCursor });
      expect(page.games).toHaveLength(1);
      expect(page.nextCursor).toBeNull();
    });

    it("un cursor inválido es un error 400", async () => {
      await expect(service.getHistory(ash, { limit: 5, before: "basura" })).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });
    });

    it("un cursor con una fecha que la base de datos no admite también es un 400, no un error del servidor", async () => {
      const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
      for (const date of ["-271821-04-20T00:00:00.000Z", "+010000-01-01T00:00:00.000Z", "0000-01-01T00:00:00.000Z"]) {
        const before = Buffer.from(`${date}|${id}`).toString("base64url");
        await expect(service.getHistory(ash, { limit: 5, before })).rejects.toMatchObject({
          status: 400,
          code: "VALIDATION_ERROR",
        });
      }
    });
  });
});

describe("StatsService: el avatar", () => {
  const setAvatar = (userId: string, avatarPokemonId: number | null) => prisma.user.update({ where: { id: userId }, data: { avatarPokemonId } });

  it("getStats trae el avatar de esa cuenta, null si no tiene", async () => {
    await setAvatar(ash, 94);
    expect((await service.getStats(ash)).avatarId).toBe(94);
    expect((await service.getStats(misty)).avatarId).toBeNull();
  });

  it("el historial trae el avatar actual del rival, null si no tiene", async () => {
    await seedGame({ code: "AV0001", endedAt: day(1), players: [{ userId: ash, score: 500 }, { userId: misty, score: 400 }], winner: 0 });
    await seedGame({ code: "AV0002", endedAt: day(2), players: [{ userId: ash, score: 500 }, { userId: brock, score: 400 }], winner: 0 });
    await setAvatar(misty, 25);
    await setAvatar(misty, 6);

    const { games } = await service.getHistory(ash, { limit: 10 });
    expect(games.map((game) => game.opponent)).toEqual([
      { username: "brock", avatarId: null },
      { username: "misty", avatarId: 6 },
    ]);
  });
});
