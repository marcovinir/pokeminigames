import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedCatalog } from "../../src/catalog/seed.js";
import { buildTestContext } from "../helpers/app.js";
import { prisma, resetCatalog, resetDatabase } from "../helpers/db.js";
import { fixtureSnapshot } from "../helpers/fixtures.js";
import { seedGame } from "../helpers/games.js";
import { type TestUser, registerUser } from "../helpers/users.js";

const DAY = 24 * 60 * 60 * 1000;
const day = (n: number) => new Date(Date.UTC(2026, 8, 1) + n * DAY);

let ctx = buildTestContext();
let ash: TestUser;
let misty: TestUser;

beforeAll(async () => {
  await resetCatalog();
  await seedCatalog(prisma, fixtureSnapshot());
});
beforeEach(async () => {
  await resetDatabase();
  ctx = buildTestContext();
  ash = await registerUser(ctx.app, "ash");
  misty = await registerUser(ctx.app, "misty");
});
afterAll(async () => {
  await resetCatalog();
  await prisma.$disconnect();
});

const auth = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });
const get = (path: string, user: TestUser = ash) => request(ctx.app).get(path).set(auth(user));

/** Una partida ganada por ash contra misty, con Alfa (500) y Zeta (600) en su equipo. */
async function ashBeatsMisty(code = "G00001", endedAt = day(1)) {
  return seedGame({
    code,
    endedAt,
    reason: "completed",
    players: [
      { userId: ash.userId, score: 1100, wonPokemon: [1, 6] },
      { userId: misty.userId, score: 0 },
    ],
    winner: 0,
  });
}

describe("autenticación de las rutas de estadísticas", () => {
  it.each([
    ["GET /stats", () => request(ctx.app).get("/stats")],
    ["GET /stats/history", () => request(ctx.app).get("/stats/history")],
    ["GET /users/:username/stats", () => request(ctx.app).get("/users/misty/stats")],
  ])("%s responde 401 sin token", async (_name, call) => {
    const response = await call();
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("responde 401 con un token inválido", async () => {
    const response = await request(ctx.app).get("/stats").set("Authorization", "Bearer basura");
    expect(response.status).toBe(401);
  });
});

describe("GET /stats", () => {
  it("una persona sin partidas recibe todo en cero", async () => {
    const response = await get("/stats");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      username: "ash",
      avatarId: null,
      stats: {
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        winRate: null,
        currentStreak: 0,
        bestStreak: 0,
        averagePower: null,
        bestGameScore: null,
        topPokemon: [],
      },
    });
  });

  it("refleja las partidas completadas de quien pregunta", async () => {
    await ashBeatsMisty();
    const { stats } = (await get("/stats")).body;
    expect(stats).toMatchObject({ played: 1, wins: 1, winRate: 1, currentStreak: 1, bestGameScore: 1100, averagePower: 550 });
    expect(stats.topPokemon.map((t: { pokemon: { id: number }; wins: number }) => [t.pokemon.id, t.wins])).toEqual([
      [1, 1],
      [6, 1],
    ]);
    expect((await get("/stats", misty)).body.stats).toMatchObject({ played: 1, wins: 0, losses: 1 });
  });
});

describe("GET /users/:username/stats", () => {
  it("devuelve las estadísticas de otra persona, sin distinguir mayúsculas en el nombre", async () => {
    await ashBeatsMisty();
    const response = await get("/users/ASH/stats", misty);
    expect(response.status).toBe(200);
    expect(response.body.username).toBe("ash");
    expect(response.body.stats).toMatchObject({ played: 1, wins: 1 });
  });

  it("no revela nada privado: ni correo, ni identificadores, ni historial, ni códigos de sala", async () => {
    await seedGame({
      code: "SECRET",
      endedAt: day(1),
      players: [
        { userId: ash.userId, score: 1, wonPokemon: [1] },
        { userId: misty.userId, score: 0 },
      ],
      winner: 0,
    });
    const response = await get("/users/ash/stats", misty);
    const text = JSON.stringify(response.body);
    expect(Object.keys(response.body).sort()).toEqual(["avatarId", "stats", "username"]);
    expect(text).not.toContain("@example.com");
    expect(text).not.toContain(ash.userId);
    expect(text).not.toContain("SECRET");
    expect(text).not.toMatch(/passwordHash|email|history|roomCode/);
  });

  it("un nombre que no existe responde 404 con USER_NOT_FOUND", async () => {
    const response = await get("/users/nadie/stats");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("USER_NOT_FOUND");
  });

  it.each(["a", "x".repeat(31), "con espacio", "raro!", "%25", "ñandú"])(
    "un nombre que nunca podría existir (%s) también responde 404",
    async (name) => {
      const response = await get(`/users/${encodeURIComponent(name)}/stats`);
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("USER_NOT_FOUND");
    },
  );

  it("el guion bajo del nombre no se toma por un comodín", async () => {
    await registerUser(ctx.app, "a_b");
    expect((await get("/users/a_b/stats")).status).toBe(200);
    expect((await get("/users/a_c/stats")).status).toBe(404);
  });

  it("un usuario llamado history no choca con /stats/history", async () => {
    const history = await registerUser(ctx.app, "history");
    expect((await get("/users/history/stats")).body.username).toBe("history");
    const own = await get("/stats/history", history);
    expect(own.status).toBe(200);
    expect(own.body).toEqual({ games: [], nextCursor: null });
  });
});

describe("GET /stats/history", () => {
  it("sin partidas devuelve una lista vacía y sin cursor", async () => {
    const response = await get("/stats/history");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ games: [], nextCursor: null });
  });

  it("lista las partidas completadas con el rival, el marcador y la configuración, sin el código de sala", async () => {
    const id = await ashBeatsMisty("SECRET");
    const response = await get("/stats/history");
    expect(response.body.games).toEqual([
      {
        id,
        endedAt: day(1).toISOString(),
        result: "won",
        reason: "completed",
        opponent: { username: "misty", avatarId: null },
        myScore: 1100,
        opponentScore: 0,
        config: { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null, typeHints: false },
      },
    ]);
    expect(JSON.stringify(response.body)).not.toContain("SECRET");
  });

  it("cada persona ve solo su propio historial", async () => {
    await ashBeatsMisty();
    const brock = await registerUser(ctx.app, "brock");
    expect((await get("/stats/history", brock)).body.games).toEqual([]);
    expect((await get("/stats/history", misty)).body.games).toHaveLength(1);
  });

  it("pagina con el cursor que devuelve la página anterior", async () => {
    for (const n of [1, 2, 3]) await ashBeatsMisty(`G0000${n}`, day(n));
    const first = await get("/stats/history?limit=2");
    expect(first.body.games).toHaveLength(2);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await get(`/stats/history?limit=2&before=${first.body.nextCursor}`);
    expect(second.body.games).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
    expect(second.body.games[0].endedAt).toBe(day(1).toISOString());
  });

  it("el límite por defecto es 20", async () => {
    for (let n = 1; n <= 21; n++) await ashBeatsMisty(`G${String(n).padStart(5, "0")}`, day(n));
    const response = await get("/stats/history");
    expect(response.body.games).toHaveLength(20);
    expect(response.body.nextCursor).not.toBeNull();
  });

  it.each(["0", "51", "-1", "1.5", "abc", ""])("un límite inválido (%s) responde 400", async (limit) => {
    const response = await get(`/stats/history?limit=${limit}`);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("acepta los límites de los extremos: 1 y 50", async () => {
    await ashBeatsMisty();
    expect((await get("/stats/history?limit=1")).status).toBe(200);
    expect((await get("/stats/history?limit=50")).status).toBe(200);
  });

  it("un cursor inválido responde 400", async () => {
    for (const before of ["basura", "x".repeat(300)]) {
      const response = await get(`/stats/history?before=${before}`);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }
  });
});

describe("las estadísticas y el avatar", () => {
  it("GET /stats y /users/:username/stats traen el avatar de esa cuenta", async () => {
    await request(ctx.app).put("/auth/me/avatar").set(auth(misty)).send({ avatarId: 25 }).expect(200);
    expect((await get("/stats")).body.avatarId).toBeNull();
    expect((await get("/users/misty/stats")).body.avatarId).toBe(25);
    expect((await get("/stats", misty)).body.avatarId).toBe(25);
  });
});
