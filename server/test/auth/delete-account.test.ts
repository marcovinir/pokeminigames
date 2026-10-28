import { deletedUsernameFor } from "@pokemon-minigames/shared";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_RATE_LIMITS } from "../../src/http/limits.js";
import { buildTestApp, buildTestContext } from "../helpers/app.js";
import { prisma, resetDatabase } from "../helpers/db.js";
import { seedGame } from "../helpers/games.js";
import { enterAsGuest } from "../helpers/users.js";

const app = buildTestApp();
const ash = { email: "ash@example.com", username: "Ash", password: "pikachu-123" };
const misty = { email: "misty@example.com", username: "misty", password: "staryu-123" };

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

function refreshCookie(response: request.Response): string {
  const cookies = (response.headers["set-cookie"] ?? []) as unknown as string[];
  return cookies.find((c) => c.startsWith("refresh_token="))!.split(";")[0]!;
}

async function register(target = app, user = ash) {
  const response = await request(target).post("/auth/register").send(user);
  expect(response.status).toBe(201);
  return { token: response.body.accessToken as string, cookie: refreshCookie(response), userId: response.body.user.id as string };
}

const remove = (token: string | null, password: string, target = app) => {
  const req = request(target).delete("/auth/me");
  return (token ? req.set("Authorization", `Bearer ${token}`) : req).send({ password });
};

describe("DELETE /auth/me: borrar la cuenta", () => {
  it("con la contraseña correcta responde 204, borra la cookie y anonimiza la cuenta", async () => {
    const { token, cookie, userId } = await register();
    await request(app).put("/auth/me/avatar").set("Authorization", `Bearer ${token}`).send({ avatarId: 94 });
    await request(app).put("/auth/me/preferences").set("Authorization", `Bearer ${token}`).send({ theme: "pokedex", themeMode: "oscuro" });

    const response = await remove(token, ash.password);
    expect(response.status).toBe(204);
    const cookies = (response.headers["set-cookie"] ?? []) as unknown as string[];
    expect(cookies.some((c) => c.startsWith("refresh_token=;"))).toBe(true);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.email).toBe(`borrada-${userId}@invalid`);
    expect(row.username).toBe(deletedUsernameFor(userId));
    expect(row.avatarPokemonId).toBeNull();
    expect(row.theme).toBeNull();
    expect(row.themeMode).toBeNull();
    expect(await prisma.refreshToken.count({ where: { userId } })).toBe(0);

    expect((await request(app).post("/auth/refresh").set("Cookie", cookie)).status).toBe(401);
    expect((await request(app).post("/auth/login").send({ email: ash.email, password: ash.password })).status).toBe(401);
  });

  it("el nombre y el correo originales quedan libres", async () => {
    const { token } = await register();
    await remove(token, ash.password);
    expect((await request(app).post("/auth/register").send(ash)).status).toBe(201);
  });

  it("las partidas del rival no cambian: su historial sigue con la partida y el rival aparece con el nombre de relleno", async () => {
    const a = await register();
    const b = await register(app, misty);
    await seedGame({ code: "ABC123", endedAt: new Date("2026-10-01T12:00:00Z"), players: [{ userId: a.userId, score: 300 }, { userId: b.userId, score: 500 }], winner: 1 });
    const statsBefore = (await request(app).get("/stats").set("Authorization", `Bearer ${b.token}`)).body;

    expect((await remove(a.token, ash.password)).status).toBe(204);

    const statsAfter = (await request(app).get("/stats").set("Authorization", `Bearer ${b.token}`)).body;
    expect(statsAfter).toEqual(statsBefore);
    const history = (await request(app).get("/stats/history").set("Authorization", `Bearer ${b.token}`)).body;
    expect(history.games).toHaveLength(1);
    expect(history.games[0].opponent.username).toBe(deletedUsernameFor(a.userId));
    expect(history.games[0].opponent.avatarId).toBeNull();
  });

  it("con la contraseña incorrecta responde 401 y no toca nada", async () => {
    const { token, cookie, userId } = await register();
    const response = await remove(token, "otra-cosa-123");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.email).toBe(ash.email);
    expect(row.username).toBe(ash.username);
    expect((await request(app).post("/auth/refresh").set("Cookie", cookie)).status).toBe(200);
  });

  it("con la contraseña de otra cuenta tampoco borra nada", async () => {
    const { token, userId } = await register();
    await register(app, misty);
    expect((await remove(token, misty.password)).status).toBe(401);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).email).toBe(ash.email);
  });

  it("sin sesión responde 401 y un invitado 403, sin borrar nada", async () => {
    await register();
    expect((await remove(null, ash.password)).status).toBe(401);
    const guest = await enterAsGuest(app, "visita");
    expect((await remove(guest.token, ash.password)).status).toBe(403);
    expect(await prisma.user.count({ where: { email: ash.email } })).toBe(1);
  });

  it("sin contraseña responde 400", async () => {
    const { token } = await register();
    expect((await request(app).delete("/auth/me").set("Authorization", `Bearer ${token}`).send({})).status).toBe(400);
  });

  it("los intentos fallidos cuentan en el límite por IP del inicio de sesión", async () => {
    const limited = buildTestContext({}, { rateLimits: { ...DEFAULT_RATE_LIMITS, loginFailuresByIp: { limit: 2, windowMs: 60_000 } } });
    const { token } = await register(limited.app);
    expect((await remove(token, "mal-1-xxxx", limited.app)).status).toBe(401);
    expect((await remove(token, "mal-2-xxxx", limited.app)).status).toBe(401);
    const third = await remove(token, ash.password, limited.app);
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe("RATE_LIMITED");
    expect(Number(third.headers["retry-after"])).toBeGreaterThan(0);
  });
});
