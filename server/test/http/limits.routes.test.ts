import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_RATE_LIMITS, type RateLimitConfig, rateLimitsFor } from "../../src/http/limits.js";
import { buildTestContext } from "../helpers/app.js";
import { prisma, resetDatabase } from "../helpers/db.js";
import { registerUser } from "../helpers/users.js";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const ash = { email: "ash@example.com", username: "ash", password: "pikachu-123" };
const proxied = { TRUST_PROXY: "1" };

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

/** La aplicación completa con los límites de producción (o los que se pidan) y el reloj de la prueba. */
function setup(limits: Partial<RateLimitConfig> = {}) {
  const holder: { now: () => number } = { now: () => 0 };
  const ctx = buildTestContext(proxied, { rateLimits: { ...DEFAULT_RATE_LIMITS, ...limits, now: () => holder.now() } });
  holder.now = () => ctx.time.now();
  const from = (ip: string) => ({ "X-Forwarded-For": ip });
  const login = (email: string, password: string, ip = "9.9.9.9") =>
    request(ctx.app).post("/auth/login").set(from(ip)).send({ email, password });
  return { ctx, from, login };
}

describe("los límites por defecto son los de la spec", () => {
  it("login 5 fallos / 15 min, registro 5 / hora, API 300 / minuto", () => {
    expect(DEFAULT_RATE_LIMITS.loginFailures).toEqual({ limit: 5, windowMs: 15 * MINUTE });
    expect(DEFAULT_RATE_LIMITS.loginFailuresByIp).toEqual({ limit: 30, windowMs: 15 * MINUTE });
    expect(DEFAULT_RATE_LIMITS.register).toEqual({ limit: 5, windowMs: HOUR });
    expect(DEFAULT_RATE_LIMITS.registerFailures).toEqual({ limit: 20, windowMs: HOUR });
    expect(DEFAULT_RATE_LIMITS.api).toEqual({ limit: 300, windowMs: MINUTE });
  });
});

describe("rateLimitsFor", () => {
  it("solo producción usa los límites; en desarrollo y en pruebas están apagados (todo llega desde la misma IP por el proxy de Vite)", () => {
    expect(rateLimitsFor("production")).toBe(DEFAULT_RATE_LIMITS);
    expect(rateLimitsFor("development")).toBe("off");
    expect(rateLimitsFor("test")).toBe("off");
  });
});

describe("límite de intentos de login", () => {
  async function withAccount() {
    const env = setup();
    await registerUser(env.ctx.app, "ash");
    return env;
  }

  it("tras 5 contraseñas erróneas el sexto intento da 429, aunque la contraseña sea la correcta", async () => {
    const { login } = await withAccount();
    for (let i = 0; i < 5; i++) expect((await login(ash.email, "mala-clave-1")).status).toBe(401);
    const blocked = await login(ash.email, ash.password);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
    expect(blocked.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.headers["retry-after"]).toBe(String(blocked.body.error.details.retryAfterSeconds));
  });

  it("un inicio de sesión correcto reinicia la cuenta", async () => {
    const { login } = await withAccount();
    for (let i = 0; i < 4; i++) await login(ash.email, "mala-clave-1");
    expect((await login(ash.email, ash.password)).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await login(ash.email, "mala-clave-1")).status).toBe(401);
    expect((await login(ash.email, ash.password)).status).toBe(200);
  });

  it("pasados 15 minutos se puede volver a intentar", async () => {
    const { ctx, login } = await withAccount();
    for (let i = 0; i < 5; i++) await login(ash.email, "mala-clave-1");
    expect((await login(ash.email, ash.password)).status).toBe(429);
    ctx.time.advance(15 * MINUTE);
    expect((await login(ash.email, ash.password)).status).toBe(200);
  });

  it("no es un bloqueo de la cuenta: otra IP puede entrar con la contraseña correcta", async () => {
    const { login } = await withAccount();
    for (let i = 0; i < 5; i++) await login(ash.email, "mala-clave-1", "1.1.1.1");
    expect((await login(ash.email, ash.password, "1.1.1.1")).status).toBe(429);
    expect((await login(ash.email, ash.password, "2.2.2.2")).status).toBe(200);
  });

  it("tampoco bloquea a otras cuentas desde la misma IP", async () => {
    const env = await withAccount();
    await registerUser(env.ctx.app, "misty");
    for (let i = 0; i < 5; i++) await env.login(ash.email, "mala-clave-1");
    expect((await env.login("misty@example.com", "pikachu-123")).status).toBe(200);
  });

  it("un correo que no existe se cuenta igual (no se puede saber si existe por cómo responde)", async () => {
    const { login } = await withAccount();
    for (let i = 0; i < 5; i++) expect((await login("nadie@example.com", "mala-clave-1")).status).toBe(401);
    const blocked = await login("nadie@example.com", "mala-clave-1");
    expect(blocked.status).toBe(429);
    expect(Object.keys(blocked.body.error).sort()).toEqual(["code", "details", "message"]);
  });

  it("el correo se compara normalizado (mayúsculas y espacios no sirven para esquivar el límite)", async () => {
    const { login } = await withAccount();
    for (let i = 0; i < 5; i++) await login("  ASH@example.com ", "mala-clave-1");
    expect((await login(ash.email, ash.password)).status).toBe(429);
  });

  it("un cuerpo inválido (400) no cuenta como intento", async () => {
    const { ctx, login } = await withAccount();
    for (let i = 0; i < 10; i++) {
      expect((await request(ctx.app).post("/auth/login").set({ "X-Forwarded-For": "9.9.9.9" }).send({ email: "no-es-email", password: "x" })).status).toBe(400);
    }
    expect((await login(ash.email, ash.password)).status).toBe(200);
  });

  it("insistir estando bloqueado no alarga el bloqueo", async () => {
    const { ctx, login } = await withAccount();
    for (let i = 0; i < 5; i++) await login(ash.email, "mala-clave-1");
    ctx.time.advance(14 * MINUTE);
    for (let i = 0; i < 5; i++) expect((await login(ash.email, "mala-clave-1")).status).toBe(429);
    ctx.time.advance(MINUTE);
    expect((await login(ash.email, ash.password)).status).toBe(200);
  });
});

describe("límite de registros", () => {
  const register = (ctx: ReturnType<typeof setup>["ctx"], n: number, ip = "9.9.9.9") =>
    request(ctx.app).post("/auth/register").set({ "X-Forwarded-For": ip }).send({ email: `u${n}@example.com`, username: `usuario${n}`, password: "pikachu-123" });

  it("a partir del sexto registro por hora desde la misma IP da 429", async () => {
    const { ctx } = setup();
    for (let n = 1; n <= 5; n++) expect((await register(ctx, n)).status).toBe(201);
    const blocked = await register(ctx, 6);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
  });

  it("los intentos fallidos (cuenta repetida) no gastan los 5 registros por hora", async () => {
    const { ctx } = setup();
    expect((await register(ctx, 1)).status).toBe(201);
    for (let i = 0; i < 4; i++) expect((await register(ctx, 1)).status).toBe(409);
    for (let n = 2; n <= 5; n++) expect((await register(ctx, n)).status).toBe(201);
    expect((await register(ctx, 6)).status).toBe(429);
  });

  it("los intentos fallidos tienen su propio tope: el vigésimo primero de la hora da 429", async () => {
    const { ctx } = setup();
    expect((await register(ctx, 1)).status).toBe(201);
    for (let i = 0; i < 20; i++) expect((await register(ctx, 1)).status).toBe(409);
    const blocked = await register(ctx, 1);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    expect((await register(ctx, 1, "2.2.2.2")).status).toBe(409);
  });

  it("diez registros a la vez no esquivan el límite: solo se crean 5 cuentas", async () => {
    const { ctx } = setup();
    const responses = await Promise.all(Array.from({ length: 10 }, (_, i) => register(ctx, i + 1)));
    expect(responses.map((response) => response.status).sort()).toEqual([201, 201, 201, 201, 201, 429, 429, 429, 429, 429]);
  });

  it("otra IP no se ve afectada y pasada una hora se puede volver a registrar", async () => {
    const { ctx } = setup();
    for (let n = 1; n <= 5; n++) await register(ctx, n);
    expect((await register(ctx, 6)).status).toBe(429);
    expect((await register(ctx, 7, "2.2.2.2")).status).toBe(201);
    ctx.time.advance(HOUR);
    expect((await register(ctx, 6)).status).toBe(201);
  });
});

describe("límite general de la API por IP", () => {
  it("pasado el límite por minuto da 429 en cualquier ruta de la API, y vuelve a la normalidad al pasar el minuto", async () => {
    const { ctx, from } = setup({ api: { limit: 5, windowMs: MINUTE } });
    for (let i = 0; i < 5; i++) expect((await request(ctx.app).get("/pokemon/names").set(from("1.1.1.1"))).status).toBe(200);
    for (const path of ["/pokemon/names", "/stats", "/rooms/current", "/users/x/stats", "/auth/me"]) {
      const response = await request(ctx.app).get(path).set(from("1.1.1.1"));
      expect(response.status, path).toBe(429);
      expect(response.body.error.code).toBe("RATE_LIMITED");
    }
    expect((await request(ctx.app).get("/pokemon/names").set(from("2.2.2.2"))).status).toBe(200);
    ctx.time.advance(MINUTE);
    expect((await request(ctx.app).get("/pokemon/names").set(from("1.1.1.1"))).status).toBe(200);
  });

  it("/health no cuenta ni se bloquea (la plataforma lo consulta sin parar)", async () => {
    const { ctx, from } = setup({ api: { limit: 2, windowMs: MINUTE } });
    for (let i = 0; i < 20; i++) expect((await request(ctx.app).get("/health").set(from("1.1.1.1"))).status).toBe(200);
    expect((await request(ctx.app).get("/pokemon/names").set(from("1.1.1.1"))).status).toBe(200);
  });
});

describe("límite de login: peticiones en paralelo y tope por IP", () => {
  async function withAccount() {
    const env = setup();
    await registerUser(env.ctx.app, "ash");
    return env;
  }

  it("diez intentos fallidos a la vez no esquivan el límite: solo 5 llegan a comprobar la contraseña", async () => {
    const { login } = await withAccount();
    const responses = await Promise.all(Array.from({ length: 10 }, () => login(ash.email, "mala-clave-1")));
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429, 429, 429, 429, 429]);
  });

  it("intentos en paralelo con la contraseña correcta no dejan sin cuenta al dueño: los 5 primeros entran y reinician", async () => {
    const { login } = await withAccount();
    const responses = await Promise.all(Array.from({ length: 5 }, () => login(ash.email, ash.password)));
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200, 200]);
    expect((await login(ash.email, "mala-clave-1")).status).toBe(401);
  });

  it("una sola IP no puede probar contraseñas contra muchas cuentas: a partir del intento 31 fallido da 429", async () => {
    const { login } = await withAccount();
    for (let i = 0; i < 30; i++) expect((await login(`otra${i}@example.com`, "mala-clave-1")).status).toBe(401);
    const blocked = await login("otra99@example.com", "mala-clave-1");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    expect((await login(ash.email, ash.password, "8.8.8.8")).status).toBe(200);
  });

  it("los inicios de sesión correctos no cuentan para el tope de la IP", async () => {
    const { login } = await withAccount();
    for (let i = 0; i < 29; i++) await login(`otra${i}@example.com`, "mala-clave-1");
    for (let i = 0; i < 5; i++) expect((await login(ash.email, ash.password)).status).toBe(200);
    expect((await login("otra50@example.com", "mala-clave-1")).status).toBe(401);
    expect((await login("otra51@example.com", "mala-clave-1")).status).toBe(429);
  });

  it("pasados 15 minutos la IP puede volver a intentar", async () => {
    const { ctx, login } = await withAccount();
    for (let i = 0; i < 31; i++) await login(`otra${i}@example.com`, "mala-clave-1");
    expect((await login("otra99@example.com", "mala-clave-1")).status).toBe(429);
    ctx.time.advance(15 * MINUTE + 1000);
    expect((await login("otra99@example.com", "mala-clave-1")).status).toBe(401);
  });
});
