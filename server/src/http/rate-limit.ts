import type { RequestHandler } from "express";
import { AppError } from "./errors.js";

export type LimitCheck = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export interface KeyedLimiter {
  /** ¿Cabe otro evento con esta clave? Si no, cuántos segundos faltan para el primer hueco. No cuenta nada. */
  check(key: string): LimitCheck;
  /** Cuenta un evento para la clave. */
  record(key: string): void;
  /** Olvida los eventos de la clave (p. ej. tras un inicio de sesión correcto). */
  reset(key: string): void;
  /** Cuántas claves tienen eventos guardados. */
  size(): number;
}

export interface KeyedLimiterOptions {
  /** Cuántos eventos caben en la ventana. */
  limit: number;
  windowMs: number;
  /** Reloj inyectable para las pruebas. */
  now?: () => number;
  /** Cada cuánto se tira lo vencido de todas las claves (se hace al usar el limitador, sin temporizadores). */
  sweepEveryMs?: number;
}

/**
 * Ventana deslizante por clave, en memoria (hay una sola instancia del servidor): como mucho `limit` eventos en
 * cualquier intervalo de `windowMs`. Las claves vencidas se limpian solas para que un abuso con claves distintas
 * (muchas IP) no llene la memoria.
 */
export function createKeyedLimiter({ limit, windowMs, now = Date.now, sweepEveryMs = 60_000 }: KeyedLimiterOptions): KeyedLimiter {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit debe ser un entero de 1 o más");
  if (!(windowMs > 0)) throw new RangeError("windowMs debe ser mayor que 0");

  const events = new Map<string, number[]>();
  let lastSweep = now();

  const prune = (stamps: number[], current: number): void => {
    while (stamps.length > 0 && current - stamps[0]! >= windowMs) stamps.shift();
  };

  const sweep = (current: number): void => {
    if (current - lastSweep < sweepEveryMs) return;
    lastSweep = current;
    for (const [key, stamps] of events) {
      prune(stamps, current);
      if (stamps.length === 0) events.delete(key);
    }
  };

  return {
    check(key) {
      const current = now();
      sweep(current);
      const stamps = events.get(key);
      if (!stamps) return { allowed: true };
      prune(stamps, current);
      if (stamps.length < limit) return { allowed: true };
      const retryAfterSeconds = Math.max(1, Math.ceil((stamps[0]! + windowMs - current) / 1000));
      return { allowed: false, retryAfterSeconds };
    },
    record(key) {
      const current = now();
      sweep(current);
      const stamps = events.get(key) ?? [];
      prune(stamps, current);
      stamps.push(current);
      events.set(key, stamps);
    },
    reset(key) {
      events.delete(key);
    },
    size: () => events.size,
  };
}

/** El error que reciben los clientes cuando se pasan del límite: 429 con la espera en el cuerpo y en `Retry-After`. */
export function tooManyRequests(retryAfterSeconds: number, message = "Demasiados intentos. Inténtalo de nuevo más tarde."): AppError {
  return new AppError(429, "RATE_LIMITED", message, { retryAfterSeconds });
}

export interface RateLimitMiddlewareOptions {
  limiter: KeyedLimiter;
  /** La clave de cada petición (normalmente su IP). */
  keyOf(req: Parameters<RequestHandler>[0]): string;
}

/** Cuenta cada petición y rechaza con 429 las que pasan del límite (las rechazadas no se cuentan). */
export function rateLimitMiddleware({ limiter, keyOf }: RateLimitMiddlewareOptions): RequestHandler {
  return (req, res, next) => {
    const key = keyOf(req);
    const result = limiter.check(key);
    if (!result.allowed) {
      res.set("Retry-After", String(result.retryAfterSeconds));
      return next(tooManyRequests(result.retryAfterSeconds));
    }
    limiter.record(key);
    next();
  };
}
