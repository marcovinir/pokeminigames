import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { createTokenService } from "../../src/auth/tokens.js";
import { AppError } from "../../src/http/errors.js";

const secret = "s".repeat(40);
const tokens = createTokenService({ secret, accessTtlSeconds: 3600 });

function expectUnauthorized(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).status).toBe(401);
    expect((error as AppError).code).toBe("UNAUTHORIZED");
    return;
  }
  throw new Error("Se esperaba que lanzara AppError 401");
}

describe("access token", () => {
  it("firma y verifica devolviendo el id y el username", () => {
    const token = tokens.signAccessToken({ sub: "user-1", username: "ash" });
    expect(tokens.verifyAccessToken(token)).toEqual({ sub: "user-1", username: "ash" });
  });

  it("el token de invitado lleva guest:true y vuelve a leerse igual; el de cuenta nunca lo lleva", () => {
    const guest = tokens.verifyAccessToken(tokens.signAccessToken({ sub: "guest_abc", username: "inv_1", guest: true }));
    expect(guest).toEqual({ sub: "guest_abc", username: "inv_1", guest: true });
    const account = tokens.verifyAccessToken(tokens.signAccessToken({ sub: "u1", username: "ash" }));
    expect("guest" in account).toBe(false);
  });

  it("solo guest === true es invitado: false, \"true\" o 1 se leen como cuenta; un aud (la cookie de invitado) se rechaza", () => {
    const sign = (claims: object, options: jwt.SignOptions = {}) =>
      jwt.sign({ username: "ash", ...claims }, secret, { algorithm: "HS256", subject: "u1", expiresIn: 3600, ...options });
    for (const guest of [false, "true", 1]) {
      const read = tokens.verifyAccessToken(sign({ guest }));
      expect("guest" in read, `guest: ${JSON.stringify(guest)}`).toBe(false);
    }
    expectUnauthorized(() => tokens.verifyAccessToken(sign({ guest: true }, { audience: "guest-session" })));
  });

  it("rechaza un token expirado", () => {
    const expired = createTokenService({ secret, accessTtlSeconds: -10 });
    const token = expired.signAccessToken({ sub: "user-1", username: "ash" });
    expectUnauthorized(() => tokens.verifyAccessToken(token));
  });

  it("rechaza un token firmado con otro secreto", () => {
    const other = createTokenService({ secret: "o".repeat(40), accessTtlSeconds: 3600 });
    const token = other.signAccessToken({ sub: "user-1", username: "ash" });
    expectUnauthorized(() => tokens.verifyAccessToken(token));
  });

  it("rechaza un token con el payload manipulado", () => {
    const token = tokens.signAccessToken({ sub: "user-1", username: "ash" });
    const [header, , signature] = token.split(".");
    const payload = Buffer.from(JSON.stringify({ sub: "admin", username: "ash" })).toString("base64url");
    expectUnauthorized(() => tokens.verifyAccessToken(`${header}.${payload}.${signature}`));
  });

  it("rechaza un token sin firma (alg none)", () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ sub: "user-1", username: "ash" })).toString("base64url");
    expectUnauthorized(() => tokens.verifyAccessToken(`${header}.${payload}.`));
  });

  it("rechaza un token firmado con otro algoritmo (HS512)", () => {
    const token = jwt.sign({ username: "ash" }, secret, { algorithm: "HS512", subject: "user-1" });
    expectUnauthorized(() => tokens.verifyAccessToken(token));
  });

  it("rechaza un token válido pero sin username", () => {
    const token = jwt.sign({}, secret, { algorithm: "HS256", subject: "user-1" });
    expectUnauthorized(() => tokens.verifyAccessToken(token));
  });

  it("rechaza texto que no es un JWT", () => {
    expectUnauthorized(() => tokens.verifyAccessToken("esto-no-es-un-jwt"));
    expectUnauthorized(() => tokens.verifyAccessToken(""));
  });
});

describe("refresh token", () => {
  it("genera tokens opacos distintos y suficientemente largos", () => {
    const a = tokens.generateRefreshToken();
    const b = tokens.generateRefreshToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("el hash es determinista, distinto del token y de 64 caracteres hex", () => {
    const token = tokens.generateRefreshToken();
    const hash = tokens.hashRefreshToken(token);
    expect(hash).toBe(tokens.hashRefreshToken(token));
    expect(hash).not.toBe(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
