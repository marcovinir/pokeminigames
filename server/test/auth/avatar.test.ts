import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AuthService } from "../../src/auth/auth.service.js";
import { createPasswordHasher } from "../../src/auth/password.js";
import { createTokenService } from "../../src/auth/tokens.js";
import { buildTestApp } from "../helpers/app.js";
import { prisma, resetDatabase } from "../helpers/db.js";

const app = buildTestApp();
const ash = { email: "ash@example.com", username: "ash", password: "pikachu-123" };

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

function refreshCookie(response: request.Response): string {
  const cookies = (response.headers["set-cookie"] ?? []) as unknown as string[];
  return cookies.find((c) => c.startsWith("refresh_token="))!.split(";")[0]!;
}

async function register(user = ash) {
  const response = await request(app).post("/auth/register").send(user);
  return { token: response.body.accessToken as string, cookie: refreshCookie(response), userId: response.body.user.id as string };
}

const save = (token: string, body: unknown) =>
  request(app).put("/auth/me/avatar").set("Authorization", `Bearer ${token}`).send(body as object);

const me = async (token: string) => (await request(app).get("/auth/me").set("Authorization", `Bearer ${token}`)).body.user.avatarId;

describe("el avatar en la respuesta del usuario", () => {
  it("una cuenta nueva tiene avatarId null en registro, login, refresh y /auth/me", async () => {
    const registered = await request(app).post("/auth/register").send(ash);
    expect(registered.body.user.avatarId).toBeNull();

    const login = await request(app).post("/auth/login").send({ email: ash.email, password: ash.password });
    expect(login.body.user.avatarId).toBeNull();

    const refreshed = await request(app).post("/auth/refresh").set("Cookie", refreshCookie(registered));
    expect(refreshed.body.user.avatarId).toBeNull();

    expect(await me(registered.body.accessToken)).toBeNull();
  });

  it("guarda un avatar de la lista y lo devuelve en login, refresh y /auth/me", async () => {
    const { token, cookie } = await register();

    const saved = await save(token, { avatarId: 94 });
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ avatarId: 94 });

    const login = await request(app).post("/auth/login").send({ email: ash.email, password: ash.password });
    expect(login.body.user.avatarId).toBe(94);
    const refreshed = await request(app).post("/auth/refresh").set("Cookie", cookie);
    expect(refreshed.body.user.avatarId).toBe(94);
    expect(await me(token)).toBe(94);
  });

  it("cambiarlo y quitarlo", async () => {
    const { token } = await register();
    await save(token, { avatarId: 94 });
    expect((await save(token, { avatarId: 25 })).body).toEqual({ avatarId: 25 });
    expect(await me(token)).toBe(25);
    expect((await save(token, { avatarId: null })).body).toEqual({ avatarId: null });
    expect(await me(token)).toBeNull();
  });

  it.each([[{ avatarId: 906 }], [{ avatarId: 0 }], [{ avatarId: -1 }], [{ avatarId: 25.5 }], [{ avatarId: "94" }], [{ avatarId: undefined }], [{}]])(
    "rechaza %j sin guardar nada",
    async (body) => {
      const { token } = await register();
      await save(token, { avatarId: 25 });
      const response = await save(token, body);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(await me(token)).toBe(25);
    },
  );

  it("un invitado no puede guardar avatar", async () => {
    const guest = await request(app).post("/auth/guest").send({ username: "inv_1" });
    const response = await save(guest.body.accessToken, { avatarId: 94 });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ACCOUNT_REQUIRED");
  });

  it("sin sesión responde 401", async () => {
    const response = await request(app).put("/auth/me/avatar").send({ avatarId: 94 });
    expect(response.status).toBe(401);
  });

  it("un avatar que ya no está en la lista se sigue leyendo", async () => {
    const { token, userId } = await register();
    await prisma.user.update({ where: { id: userId }, data: { avatarPokemonId: 906 } });
    expect(await me(token)).toBe(906);
  });
});

describe("AuthService.avatarOf", () => {
  const service = new AuthService({
    prisma,
    hasher: createPasswordHasher(4),
    tokens: createTokenService({ secret: "s".repeat(40), accessTtlSeconds: 3600 }),
    refreshTtlMs: 60_000,
  });

  it("devuelve el guardado, null sin avatar y null para una cuenta que no existe", async () => {
    const { token, userId } = await register();
    expect(await service.avatarOf(userId)).toBeNull();
    await save(token, { avatarId: 94 });
    expect(await service.avatarOf(userId)).toBe(94);
    expect(await service.avatarOf("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
