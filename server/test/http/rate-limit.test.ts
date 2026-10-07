import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../../src/http/errors.js";
import { createKeyedLimiter, rateLimitMiddleware } from "../../src/http/rate-limit.js";

const SECOND = 1000;
const MINUTE = 60 * SECOND;

function clock(start = 1_000_000) {
  let current = start;
  return { now: () => current, advance: (ms: number) => void (current += ms) };
}

describe("createKeyedLimiter", () => {
  it("deja pasar hasta el límite y luego bloquea", () => {
    const limiter = createKeyedLimiter({ limit: 3, windowMs: MINUTE, now: clock().now });
    for (let i = 0; i < 3; i++) {
      expect(limiter.check("a")).toEqual({ allowed: true });
      limiter.record("a");
    }
    expect(limiter.check("a")).toMatchObject({ allowed: false });
  });

  it("comprobar no cuenta: solo cuentan los eventos registrados", () => {
    const limiter = createKeyedLimiter({ limit: 1, windowMs: MINUTE, now: clock().now });
    for (let i = 0; i < 10; i++) expect(limiter.check("a")).toEqual({ allowed: true });
    limiter.record("a");
    expect(limiter.check("a")).toMatchObject({ allowed: false });
  });

  it("dice cuántos segundos faltan para el primer hueco, redondeando hacia arriba y nunca menos de 1", () => {
    const time = clock();
    const limiter = createKeyedLimiter({ limit: 2, windowMs: 10 * SECOND, now: time.now });
    limiter.record("a");
    time.advance(3 * SECOND);
    limiter.record("a");
    expect(limiter.check("a")).toEqual({ allowed: false, retryAfterSeconds: 7 });
    time.advance(6_500);
    expect(limiter.check("a")).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  it("la ventana se desliza: los eventos viejos dejan de contar uno a uno", () => {
    const time = clock();
    const limiter = createKeyedLimiter({ limit: 2, windowMs: 10 * SECOND, now: time.now });
    limiter.record("a");
    time.advance(6 * SECOND);
    limiter.record("a");
    expect(limiter.check("a")).toMatchObject({ allowed: false });
    time.advance(4 * SECOND); // el primero cumple 10 s; el segundo no
    expect(limiter.check("a")).toEqual({ allowed: true });
    limiter.record("a");
    expect(limiter.check("a")).toMatchObject({ allowed: false });
    time.advance(10 * SECOND);
    expect(limiter.check("a")).toEqual({ allowed: true });
  });

  it("cada clave tiene su propia cuenta", () => {
    const limiter = createKeyedLimiter({ limit: 1, windowMs: MINUTE, now: clock().now });
    limiter.record("a");
    expect(limiter.check("a")).toMatchObject({ allowed: false });
    expect(limiter.check("b")).toEqual({ allowed: true });
  });

  it("reset olvida lo de una clave (y no falla con una que no existe)", () => {
    const limiter = createKeyedLimiter({ limit: 1, windowMs: MINUTE, now: clock().now });
    limiter.record("a");
    limiter.record("b");
    limiter.reset("a");
    limiter.reset("nunca-vista");
    expect(limiter.check("a")).toEqual({ allowed: true });
    expect(limiter.check("b")).toMatchObject({ allowed: false });
  });

  it("limpia las claves vencidas solas, para que un abuso no llene la memoria", () => {
    const time = clock();
    const limiter = createKeyedLimiter({ limit: 5, windowMs: MINUTE, sweepEveryMs: 30 * SECOND, now: time.now });
    for (let i = 0; i < 5000; i++) limiter.record(`ip-${i}`);
    expect(limiter.size()).toBe(5000);
    time.advance(MINUTE + 31 * SECOND);
    limiter.check("otra"); // basta cualquier uso para que toque limpiar
    expect(limiter.size()).toBe(0);
  });

  it("la limpieza no borra las claves que todavía cuentan", () => {
    const time = clock();
    const limiter = createKeyedLimiter({ limit: 1, windowMs: MINUTE, sweepEveryMs: 10 * SECOND, now: time.now });
    limiter.record("viva");
    time.advance(30 * SECOND);
    limiter.record("vieja");
    time.advance(40 * SECOND); // "viva" ya venció; "vieja" no
    limiter.check("x");
    expect(limiter.size()).toBe(1);
    expect(limiter.check("vieja")).toMatchObject({ allowed: false });
  });

  it.each([
    [0, MINUTE],
    [-1, MINUTE],
    [1.5, MINUTE],
    [1, 0],
    [1, -5],
  ])("rechaza una configuración inválida (límite %s, ventana %s)", (limit, windowMs) => {
    expect(() => createKeyedLimiter({ limit, windowMs })).toThrow(RangeError);
  });
});

describe("rateLimitMiddleware", () => {
  function build(limit: number, time = clock()) {
    const limiter = createKeyedLimiter({ limit, windowMs: MINUTE, now: time.now });
    const app = express();
    app.set("trust proxy", 1);
    app.get("/ping", rateLimitMiddleware({ limiter, keyOf: (req) => req.ip ?? "?" }), (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler);
    return { app, time, limiter };
  }
  const from = (app: express.Express, ip: string) => request(app).get("/ping").set("X-Forwarded-For", ip);

  it("deja pasar hasta el límite y luego responde 429 RATE_LIMITED con la espera", async () => {
    const { app } = build(2);
    expect((await from(app, "1.1.1.1")).status).toBe(200);
    expect((await from(app, "1.1.1.1")).status).toBe(200);
    const blocked = await from(app, "1.1.1.1");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
    expect(blocked.body.error.details).toEqual({ retryAfterSeconds: 60 });
    expect(blocked.headers["retry-after"]).toBe("60");
  });

  it("una petición rechazada no alarga el bloqueo", async () => {
    const { app, time } = build(1);
    await from(app, "1.1.1.1");
    for (let i = 0; i < 5; i++) expect((await from(app, "1.1.1.1")).status).toBe(429);
    time.advance(MINUTE);
    expect((await from(app, "1.1.1.1")).status).toBe(200);
  });

  it("cada IP tiene su propia cuenta (la IP real sale de X-Forwarded-For con proxy de confianza)", async () => {
    const { app } = build(1);
    expect((await from(app, "1.1.1.1")).status).toBe(200);
    expect((await from(app, "1.1.1.1")).status).toBe(429);
    expect((await from(app, "2.2.2.2")).status).toBe(200);
  });
});
