import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AuthService } from "../../src/auth/auth.service.js";
import { createPasswordHasher } from "../../src/auth/password.js";
import { createTokenService } from "../../src/auth/tokens.js";
import { AppError } from "../../src/http/errors.js";
import { prisma, resetDatabase, warmUpPool } from "../helpers/db.js";

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const tokens = createTokenService({ secret: "s".repeat(40), accessTtlSeconds: 3600 });

let current = new Date("2026-01-01T00:00:00.000Z");
const service = new AuthService({
  prisma,
  hasher: createPasswordHasher(4),
  tokens,
  refreshTtlMs: REFRESH_TTL_MS,
  now: () => current,
});

const ash = { email: "ash@example.com", username: "Ash", password: "pikachu-123" };

async function expectAppError(promise: Promise<unknown>, code: string, status: number) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  expect((error as AppError).status).toBe(status);
}

beforeEach(async () => {
  current = new Date("2026-01-01T00:00:00.000Z");
  await resetDatabase();
});
afterAll(() => prisma.$disconnect());

describe("register", () => {
  it("crea el usuario y devuelve sesión sin exponer el hash", async () => {
    const result = await service.register(ash);
    expect(result.user).toMatchObject({ email: ash.email, username: "Ash" });
    expect(result.user).not.toHaveProperty("passwordHash");
    expect(tokens.verifyAccessToken(result.accessToken).sub).toBe(result.user.id);
    expect(result.refreshExpiresAt).toEqual(new Date(current.getTime() + REFRESH_TTL_MS));
  });

  it("guarda la contraseña hasheada y el refresh token solo como hash", async () => {
    const result = await service.register(ash);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: result.user.id } });
    expect(stored.passwordHash).not.toContain(ash.password);
    const rows = await prisma.refreshToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(tokens.hashRefreshToken(result.refreshToken));
    expect(rows[0]!.tokenHash).not.toBe(result.refreshToken);
  });

  it("rechaza un email repetido", async () => {
    await service.register(ash);
    await expectAppError(service.register({ ...ash, username: "Otro" }), "EMAIL_TAKEN", 409);
  });

  it("rechaza un username repetido sin distinguir mayúsculas", async () => {
    await service.register(ash);
    await expectAppError(
      service.register({ email: "otro@example.com", username: "ASH", password: "pikachu-123" }),
      "USERNAME_TAKEN",
      409,
    );
  });

  it("ante registros simultáneos con el mismo email, uno gana y los demás reciben EMAIL_TAKEN", async () => {
    await warmUpPool();
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => service.register({ ...ash, username: `Ash${i}` })),
    );
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(rejected).toHaveLength(5);
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(AppError);
      expect((r.reason as AppError).code).toBe("EMAIL_TAKEN");
    }
    expect(await prisma.user.count()).toBe(1);
  });
});

describe("login", () => {
  it("entrega una sesión nueva con credenciales correctas", async () => {
    const registered = await service.register(ash);
    const result = await service.login({ email: ash.email, password: ash.password });
    expect(result.user.id).toBe(registered.user.id);
    expect(result.refreshToken).not.toBe(registered.refreshToken);
  });

  it("usa el mismo error para contraseña incorrecta y para email inexistente", async () => {
    await service.register(ash);
    await expectAppError(service.login({ email: ash.email, password: "incorrecta" }), "INVALID_CREDENTIALS", 401);
    await expectAppError(
      service.login({ email: "nadie@example.com", password: "pikachu-123" }),
      "INVALID_CREDENTIALS",
      401,
    );
  });
});

describe("refresh", () => {
  it("rota el token: el anterior queda revocado y el nuevo funciona", async () => {
    const first = await service.register(ash);
    const second = await service.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.user.id).toBe(first.user.id);

    await expectAppError(service.refresh(first.refreshToken), "INVALID_REFRESH_TOKEN", 401);
    await expect(service.refresh(second.refreshToken)).resolves.toBeTruthy();
  });

  it("rechaza un token desconocido", async () => {
    await expectAppError(service.refresh("token-que-no-existe"), "INVALID_REFRESH_TOKEN", 401);
  });

  it("rechaza un token expirado", async () => {
    const session = await service.register(ash);
    current = new Date(current.getTime() + REFRESH_TTL_MS + 1000);
    await expectAppError(service.refresh(session.refreshToken), "INVALID_REFRESH_TOKEN", 401);
  });

  it("ante refrescos simultáneos con el mismo token, solo uno tiene éxito", async () => {
    const session = await service.register(ash);
    await warmUpPool();
    // Muchas peticiones a la vez para que de verdad se solapen las transacciones.
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => service.refresh(session.refreshToken)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(7);
  });
});

describe("logout", () => {
  it("revoca el refresh token", async () => {
    const session = await service.register(ash);
    await service.logout(session.refreshToken);
    await expectAppError(service.refresh(session.refreshToken), "INVALID_REFRESH_TOKEN", 401);
  });

  it("no falla con un token desconocido ni al repetirse", async () => {
    const session = await service.register(ash);
    await service.logout(session.refreshToken);
    await expect(service.logout(session.refreshToken)).resolves.toBeUndefined();
    await expect(service.logout("desconocido")).resolves.toBeUndefined();
  });
});

describe("me", () => {
  it("devuelve el usuario", async () => {
    const session = await service.register(ash);
    await expect(service.me(session.user.id)).resolves.toMatchObject({ email: ash.email });
  });

  it("devuelve UNAUTHORIZED si el usuario ya no existe", async () => {
    await expectAppError(service.me("11111111-1111-4111-8111-111111111111"), "UNAUTHORIZED", 401);
  });
});
