import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GUEST_COOKIE, GUEST_SESSION_TTL_MS, createGuestSessions } from "../../src/auth/guest-sessions.js";
import { DEFAULT_RATE_LIMITS, rateLimitsFor } from "../../src/http/limits.js";
import { buildTestContext } from "../helpers/app.js";
import { prisma, resetDatabase } from "../helpers/db.js";

const { app, env, tokens } = buildTestContext();

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

const cookiesOf = (response: request.Response): string[] => (response.headers["set-cookie"] ?? []) as unknown as string[];
const cookieNamed = (response: request.Response, name: string): string | undefined => cookiesOf(response).find((c) => c.startsWith(`${name}=`));
/** `guest_session=<valor>` listo para mandarlo en la cabecera Cookie. */
const pair = (cookie: string): string => cookie.split(";")[0]!;
/** Una cookie con la forma de «borrada»: vacía y caducada en 1970. */
const isCleared = (cookie: string | undefined): boolean => cookie !== undefined && /^[a-z_]+=;/.test(cookie) && /Expires=Thu, 01 Jan 1970/i.test(cookie);

async function enterAsGuest(username = "inv_1") {
  const response = await request(app).post("/auth/guest").send({ username });
  const cookie = cookieNamed(response, GUEST_COOKIE);
  return { response, cookie: cookie ? pair(cookie) : "" };
}

describe("POST /auth/guest", () => {
  it("201: usuario de invitado sin email, token de acceso de invitado y cookie guest_session httpOnly en /auth", async () => {
    const { response } = await enterAsGuest();
    expect(response.status).toBe(201);
    expect(response.body.user).toEqual({ id: expect.stringMatching(/^guest_[A-Za-z0-9_-]{22}$/), username: "inv_1", guest: true });
    expect(tokens.verifyAccessToken(response.body.accessToken)).toEqual({ sub: response.body.user.id, username: "inv_1", guest: true });

    const cookie = cookieNamed(response, GUEST_COOKIE)!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/auth/);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Expires=/i);
  });

  it("recorta los espacios de los extremos", async () => {
    const response = await request(app).post("/auth/guest").send({ username: "  inv_1  " });
    expect(response.status).toBe(201);
    expect(response.body.user.username).toBe("inv_1");
  });

  it.each([["ab"], ["a".repeat(31)], ["a b c"], ["ash🙂"], [""]])("rechaza el nombre %j con VALIDATION_ERROR (400)", async (username) => {
    const response = await request(app).post("/auth/guest").send({ username });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rechaza un cuerpo vacío o sin nombre con VALIDATION_ERROR", async () => {
    expect((await request(app).post("/auth/guest").send({})).body.error.code).toBe("VALIDATION_ERROR");
    expect((await request(app).post("/auth/guest")).body.error.code).toBe("VALIDATION_ERROR");
  });

  it("no escribe nada en la base de datos: ni usuarios ni sesiones", async () => {
    await enterAsGuest("inv_1");
    await enterAsGuest("inv_2");
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.refreshToken.count()).toBe(0);
  });

  it("el token del invitado vale para /rooms/current pero no para /auth/me (403 ACCOUNT_REQUIRED)", async () => {
    const { response } = await enterAsGuest();
    const bearer = `Bearer ${response.body.accessToken}`;
    expect((await request(app).get("/rooms/current").set("Authorization", bearer)).status).toBe(200);
    const me = await request(app).get("/auth/me").set("Authorization", bearer);
    expect(me.status).toBe(403);
    expect(me.body.error.code).toBe("ACCOUNT_REQUIRED");
  });
});

describe("POST /auth/refresh con la cookie de invitado", () => {
  it("200: el mismo invitado (mismo id y nombre), un token de acceso de invitado y la cookie renovada", async () => {
    const { response, cookie } = await enterAsGuest();
    const refreshed = await request(app).post("/auth/refresh").set("Cookie", cookie);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.user).toEqual(response.body.user);
    expect(tokens.verifyAccessToken(refreshed.body.accessToken)).toEqual({ sub: response.body.user.id, username: "inv_1", guest: true });
    expect(cookieNamed(refreshed, GUEST_COOKIE)).toMatch(/Expires=/i);
  });

  it("401 INVALID_REFRESH_TOKEN con una cookie manipulada, de otra clave o caducada", async () => {
    const { cookie } = await enterAsGuest();
    const tampered = `${cookie.slice(0, -2)}xx`;
    const otherKey = pair(`${GUEST_COOKIE}=${createGuestSessions({ secret: "o".repeat(40), ttlMs: GUEST_SESSION_TTL_MS }).issue("inv_1").cookie}`);
    const expired = pair(`${GUEST_COOKIE}=${createGuestSessions({ secret: env.JWT_ACCESS_SECRET, ttlMs: -1000 }).issue("inv_1").cookie}`);
    for (const value of [tampered, otherKey, expired]) {
      const response = await request(app).post("/auth/refresh").set("Cookie", value);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("INVALID_REFRESH_TOKEN");
    }
  });

  it("sin ninguna cookie sigue dando el 401 de siempre", async () => {
    expect((await request(app).post("/auth/refresh")).status).toBe(401);
  });

  it("con las dos cookies manda la de cuenta", async () => {
    const registered = await request(app).post("/auth/register").send({ email: "ash@example.com", username: "ash", password: "pikachu-123" });
    const account = pair(cookieNamed(registered, "refresh_token")!);
    const { cookie: guest } = await enterAsGuest();
    const refreshed = await request(app).post("/auth/refresh").set("Cookie", [account, guest]);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.user).toMatchObject({ email: "ash@example.com", username: "ash" });
    expect(refreshed.body.user.guest).toBeUndefined();
    // La cuenta sustituye al invitado: la cookie de invitado se borra.
    expect(isCleared(cookieNamed(refreshed, GUEST_COOKIE))).toBe(true);
  });

  it("si la cookie de cuenta ya no vale (sesión revocada) y la de invitado sí, sirve el invitado (no se pierde al recargar)", async () => {
    const { response, cookie } = await enterAsGuest();
    const refreshed = await request(app).post("/auth/refresh").set("Cookie", ["refresh_token=revocada", cookie]);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.user).toEqual(response.body.user);
  });
});

describe("la cuenta sustituye al invitado y salir cierra todo", () => {
  it("iniciar sesión y registrarse con éxito borran guest_session", async () => {
    const { cookie } = await enterAsGuest();
    const registered = await request(app).post("/auth/register").set("Cookie", cookie).send({ email: "ash@example.com", username: "ash", password: "pikachu-123" });
    expect(registered.status).toBe(201);
    expect(isCleared(cookieNamed(registered, GUEST_COOKIE))).toBe(true);

    const login = await request(app).post("/auth/login").set("Cookie", cookie).send({ email: "ash@example.com", password: "pikachu-123" });
    expect(login.status).toBe(200);
    expect(isCleared(cookieNamed(login, GUEST_COOKIE))).toBe(true);
  });

  it("un inicio de sesión fallido no toca la cookie de invitado", async () => {
    const { cookie } = await enterAsGuest();
    const login = await request(app).post("/auth/login").set("Cookie", cookie).send({ email: "nadie@example.com", password: "pikachu-123" });
    expect(login.status).toBe(401);
    expect(cookieNamed(login, GUEST_COOKIE)).toBeUndefined();
  });

  it("logout borra las dos cookies", async () => {
    const { cookie } = await enterAsGuest();
    const logout = await request(app).post("/auth/logout").set("Cookie", [cookie, "refresh_token=cualquiera"]);
    expect(logout.status).toBe(204);
    expect(isCleared(cookieNamed(logout, GUEST_COOKIE))).toBe(true);
    expect(isCleared(cookieNamed(logout, "refresh_token"))).toBe(true);
  });
});

describe("límite de sesiones de invitado por IP", () => {
  it("en producción el límite es de 20 sesiones por hora y por IP", () => {
    expect(DEFAULT_RATE_LIMITS.guestSessions).toEqual({ limit: 20, windowMs: 60 * 60 * 1000 });
    expect(rateLimitsFor("production")).toMatchObject({ guestSessions: { limit: 20, windowMs: 60 * 60 * 1000 } });
  });

  it("la tercera sesión de la misma IP con un límite de 2 da 429 RATE_LIMITED con Retry-After", async () => {
    const limited = buildTestContext({}, { rateLimits: { ...DEFAULT_RATE_LIMITS, guestSessions: { limit: 2, windowMs: 60_000 } } });
    for (const name of ["inv_1", "inv_2"]) expect((await request(limited.app).post("/auth/guest").send({ username: name })).status).toBe(201);
    const third = await request(limited.app).post("/auth/guest").send({ username: "inv_3" });
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe("RATE_LIMITED");
    expect(Number(third.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("con los límites apagados (pruebas y desarrollo) no limita", async () => {
    for (let i = 0; i < 5; i++) expect((await enterAsGuest(`inv_${i}`)).response.status).toBe(201);
  });

  it("un nombre inválido no gasta una sesión del límite", async () => {
    const limited = buildTestContext({}, { rateLimits: { ...DEFAULT_RATE_LIMITS, guestSessions: { limit: 1, windowMs: 60_000 } } });
    expect((await request(limited.app).post("/auth/guest").send({ username: "ab" })).status).toBe(400);
    expect((await request(limited.app).post("/auth/guest").send({ username: "inv_1" })).status).toBe(201);
  });
});
