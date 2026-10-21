import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { GUEST_SESSION_TTL_MS, createGuestSessions } from "../../src/auth/guest-sessions.js";
import { createTokenService } from "../../src/auth/tokens.js";

const secret = "s".repeat(40);
const START = 1_800_000_000_000;
let now = START;
const sessions = createGuestSessions({ secret, ttlMs: GUEST_SESSION_TTL_MS, now: () => now });
const tokens = createTokenService({ secret, accessTtlSeconds: 3600 });

describe("sesiones de invitado (la cookie firmada)", () => {
  it("dura 24 horas", () => {
    expect(GUEST_SESSION_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("issue crea un id guest_ de 16 bytes y una cookie que read devuelve; dos sesiones nunca repiten id", () => {
    now = START;
    const first = sessions.issue("inv_1");
    const second = sessions.issue("inv_1");
    expect(first.id).toMatch(/^guest_[A-Za-z0-9_-]{22}$/);
    expect(second.id).not.toBe(first.id);
    expect(first.username).toBe("inv_1");
    expect(first.expiresAt.getTime()).toBe(START + GUEST_SESSION_TTL_MS);
    expect(sessions.read(first.cookie)).toEqual({ id: first.id, username: "inv_1" });
  });

  it("issue con un id existente renueva la cookie sin cambiar de identidad (la partida en curso está sentada con ese id)", () => {
    now = START;
    const first = sessions.issue("inv_1");
    now = START + 60 * 60 * 1000;
    const renewed = sessions.issue("inv_1", first.id);
    expect(renewed.id).toBe(first.id);
    expect(renewed.expiresAt.getTime()).toBe(now + GUEST_SESSION_TTL_MS);
  });

  it("vale hasta que pasan 24 h (un segundo antes todavía) y después read da null", () => {
    now = START;
    const { cookie, id } = sessions.issue("inv_1");
    now = START + GUEST_SESSION_TTL_MS - 1000;
    expect(sessions.read(cookie)).toEqual({ id, username: "inv_1" });
    now = START + GUEST_SESSION_TTL_MS + 1000;
    expect(sessions.read(cookie)).toBeNull();
  });

  it("read da null (sin lanzar) con una cookie manipulada, firmada con otra clave o que no es un texto", () => {
    now = START;
    const { cookie } = sessions.issue("inv_1");
    const [header, , signature] = cookie.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "guest_otro", username: "inv_1", aud: "guest-session" })).toString("base64url");
    expect(sessions.read(`${header}.${forged}.${signature}`)).toBeNull();
    const other = createGuestSessions({ secret: "o".repeat(40), ttlMs: GUEST_SESSION_TTL_MS, now: () => now });
    expect(sessions.read(other.issue("inv_1").cookie)).toBeNull();
    for (const value of [undefined, null, 42, "", "no-es-un-jwt", {}]) expect(sessions.read(value)).toBeNull();
  });

  it("un token de acceso no sirve como cookie de invitado y la cookie no sirve como token de acceso (verifyAccessToken lanza 401)", () => {
    now = START;
    expect(sessions.read(tokens.signAccessToken({ sub: "guest_abc", username: "inv_1", guest: true }))).toBeNull();
    const { cookie } = sessions.issue("inv_1");
    // La firma es válida y el `aud` es lo que la distingue: un token de acceso nunca lo lleva.
    expect(() => jwt.verify(cookie, secret, { algorithms: ["HS256"], clockTimestamp: Math.floor(START / 1000) })).not.toThrow();
    expect(() => tokens.verifyAccessToken(cookie)).toThrowError(expect.objectContaining({ status: 401, code: "UNAUTHORIZED" }));
  });
});
