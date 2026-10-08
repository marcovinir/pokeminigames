import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PENDING_ACCOUNT_TTL_MS } from "../../src/auth/code-policy.js";
import { AuthService } from "../../src/auth/auth.service.js";
import { EmailCodeStore, createCodeHasher } from "../../src/auth/email-codes.js";
import { createPasswordHasher } from "../../src/auth/password.js";
import { createTokenService } from "../../src/auth/tokens.js";
import { AppError } from "../../src/http/errors.js";
import { MailerError } from "../../src/mail/mailer.js";
import { MemoryMailer } from "../../src/mail/memory-mailer.js";
import { prisma, resetDatabase, warmUpPool } from "../helpers/db.js";
import { seedGame } from "../helpers/games.js";

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const tokens = createTokenService({ secret: "s".repeat(40), accessTtlSeconds: 3600 });

let current = new Date("2026-01-01T00:00:00.000Z");
const mailer = new MemoryMailer();
const codes = new EmailCodeStore({ prisma, hash: createCodeHasher("s".repeat(40)), now: () => current });
const logged: string[] = [];

function newService(emailVerification: boolean) {
  return new AuthService({
    prisma,
    hasher: createPasswordHasher(4),
    tokens,
    refreshTtlMs: REFRESH_TTL_MS,
    now: () => current,
    emailVerification,
    email: { codes, mailer },
    log: (line) => logged.push(line),
  });
}
const service = newService(true);

const ash = { email: "ash@example.com", username: "Ash", password: "pikachu-123" };

beforeEach(async () => {
  current = new Date("2026-01-01T00:00:00.000Z");
  mailer.clear();
  mailer.failWith = null;
  logged.length = 0;
  await resetDatabase();
});
afterAll(() => prisma.$disconnect());

async function expectAppError(promise: Promise<unknown>, code: string, status: number) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  expect((error as AppError).status).toBe(status);
}

/** El código de seis dígitos del último correo enviado a una dirección. */
function lastCode(email: string): string {
  const mail = mailer.to(email).at(-1);
  if (!mail) throw new Error(`No se envió ningún correo a ${email}`);
  return /(\d{6})/.exec(mail.text)![1]!;
}

const userOf = (email: string) => prisma.user.findUniqueOrThrow({ where: { email } });

describe("registerPending", () => {
  it("crea la cuenta sin verificar, envía un correo con el código y no abre ninguna sesión", async () => {
    await service.registerPending(ash);
    const user = await userOf(ash.email);
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.username).toBe("Ash");
    expect(mailer.to(ash.email)).toHaveLength(1);
    expect(lastCode(ash.email)).toMatch(/^\d{6}$/);
    expect(await prisma.refreshToken.count()).toBe(0);
    expect(await prisma.emailCode.count({ where: { userId: user.id, purpose: "verify_email" } })).toBe(1);
  });

  it("guarda la contraseña hasheada", async () => {
    await service.registerPending(ash);
    const user = await userOf(ash.email);
    expect(user.passwordHash).not.toContain(ash.password);
    expect(await createPasswordHasher(4).verify(ash.password, user.passwordHash)).toBe(true);
  });

  it("un correo que ya es de una cuenta verificada da EMAIL_TAKEN y no envía nada", async () => {
    await service.registerPending(ash);
    await service.verifyEmail({ email: ash.email, code: lastCode(ash.email) });
    mailer.clear();
    await expectAppError(service.registerPending({ ...ash, username: "Otro" }), "EMAIL_TAKEN", 409);
    expect(mailer.sent).toHaveLength(0);
  });

  it("un usuario ocupado por otra cuenta da USERNAME_TAKEN, sin distinguir mayúsculas", async () => {
    await service.registerPending(ash);
    await expectAppError(service.registerPending({ email: "otro@example.com", username: "ASH", password: "pikachu-123" }), "USERNAME_TAKEN", 409);
    expect(await prisma.user.count()).toBe(1);
    expect(mailer.sent).toHaveLength(1);
  });

  it("registrarse otra vez con el correo de una cuenta pendiente la reemplaza: usuario, contraseña y fecha nuevos, y un código nuevo", async () => {
    await service.registerPending(ash);
    const firstCode = lastCode(ash.email);
    current = new Date(current.getTime() + 60_000);

    await service.registerPending({ email: ash.email, username: "Ash2", password: "otra-clave-9" });

    expect(await prisma.user.count()).toBe(1);
    const user = await userOf(ash.email);
    expect(user.username).toBe("Ash2");
    expect(await createPasswordHasher(4).verify("otra-clave-9", user.passwordHash)).toBe(true);
    expect(user.createdAt).toEqual(current);
    expect(mailer.to(ash.email)).toHaveLength(2);
    const secondCode = lastCode(ash.email);
    if (secondCode !== firstCode) await expectAppError(service.verifyEmail({ email: ash.email, code: firstCode }), "INVALID_CODE", 400);
    await expect(service.verifyEmail({ email: ash.email, code: secondCode })).resolves.toBeDefined();
  });

  it("reemplazar la cuenta pendiente puede quedarse con su mismo usuario", async () => {
    await service.registerPending(ash);
    await expect(service.registerPending({ ...ash, password: "otra-clave-9" })).resolves.toBeUndefined();
    expect(await prisma.user.count()).toBe(1);
  });

  it("un usuario ocupado por otra cuenta pendiente de menos de 24 h sigue ocupado", async () => {
    await service.registerPending(ash);
    current = new Date(current.getTime() + PENDING_ACCOUNT_TTL_MS - 1);
    await expectAppError(service.registerPending({ email: "otro@example.com", username: "ash", password: "pikachu-123" }), "USERNAME_TAKEN", 409);
  });

  it("una cuenta pendiente de más de 24 h se considera libre: se borra al registrarse con su usuario o su correo", async () => {
    await service.registerPending(ash);
    current = new Date(current.getTime() + PENDING_ACCOUNT_TTL_MS + 1);

    await service.registerPending({ email: "otro@example.com", username: "ash", password: "pikachu-123" });
    expect(await prisma.user.count()).toBe(1);
    expect((await userOf("otro@example.com")).username).toBe("ash");
    expect(await prisma.user.findUnique({ where: { email: ash.email } })).toBeNull();
    expect(await prisma.emailCode.count()).toBe(1);
  });

  it("una cuenta sin verificar que tiene historial (sesiones o partidas) nunca se reemplaza ni se borra", async () => {
    const legacy = newService(false);
    await legacy.register(ash);
    // Nace con la hora real de la base de datos: se le pone la del reloj de la prueba para que pasen días de verdad.
    await prisma.user.updateMany({ data: { createdAt: current } });
    current = new Date(current.getTime() + 10 * PENDING_ACCOUNT_TTL_MS);

    await expectAppError(service.registerPending({ email: ash.email, username: "Nuevo", password: "pikachu-123" }), "EMAIL_TAKEN", 409);
    await expectAppError(service.registerPending({ email: "otro@example.com", username: "ASH", password: "pikachu-123" }), "USERNAME_TAKEN", 409);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.refreshToken.count()).toBe(1);
  });

  it("una cuenta sin verificar con partidas pero sin sesiones tampoco se reemplaza ni se borra", async () => {
    const legacy = newService(false);
    const first = await legacy.register(ash);
    const second = await legacy.register({ email: "misty@example.com", username: "Misty", password: "pikachu-123" });
    await seedGame({
      code: "ABC234",
      endedAt: new Date(current),
      players: [
        { userId: first.user.id, score: 100 },
        { userId: second.user.id, score: 50 },
      ],
      winner: 0,
    });
    // Solo queda el historial de partidas: las sesiones desaparecen (se cerraron y se limpiaron).
    await prisma.refreshToken.deleteMany();
    await prisma.user.updateMany({ data: { createdAt: current } });
    current = new Date(current.getTime() + 10 * PENDING_ACCOUNT_TTL_MS);

    await expectAppError(service.registerPending({ email: ash.email, username: "Nuevo", password: "pikachu-123" }), "EMAIL_TAKEN", 409);
    await expectAppError(service.registerPending({ email: "otro@example.com", username: "ASH", password: "pikachu-123" }), "USERNAME_TAKEN", 409);
    expect(await prisma.user.count()).toBe(2);
  });

  it("si el proveedor falla, da EMAIL_SEND_FAILED, deja la cuenta pendiente con su código y lo registra sin la dirección ni el código", async () => {
    mailer.failWith = new MailerError(503, "Resend respondió 503");
    await expectAppError(service.registerPending(ash), "EMAIL_SEND_FAILED", 502);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.emailCode.count()).toBe(1);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain("Resend respondió 503");
    expect(logged[0]).not.toContain(ash.email);
    expect(logged[0]).not.toMatch(/\d{6}/);

    // Se puede reintentar: es la misma cuenta pendiente.
    mailer.failWith = null;
    await service.registerPending(ash);
    expect(await prisma.user.count()).toBe(1);
    expect(mailer.to(ash.email)).toHaveLength(1);
  });

  it("dos registros a la vez con el mismo correo dejan una sola cuenta y ningún error que no sea de la aplicación", async () => {
    await warmUpPool();
    const results = await Promise.allSettled([service.registerPending(ash), service.registerPending({ ...ash, username: "Ash2" })]);
    expect(await prisma.user.count()).toBe(1);
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    for (const result of results) {
      if (result.status === "rejected") expect(result.reason).toBeInstanceOf(AppError);
    }
  });
});

describe("verifyEmail", () => {
  it("con el código correcto verifica la cuenta, gasta el código y abre la sesión", async () => {
    await service.registerPending(ash);
    const result = await service.verifyEmail({ email: ash.email, code: lastCode(ash.email) });

    expect(result.user).toMatchObject({ email: ash.email, username: "Ash" });
    expect(tokens.verifyAccessToken(result.accessToken).sub).toBe(result.user.id);
    expect(result.refreshExpiresAt).toEqual(new Date(current.getTime() + REFRESH_TTL_MS));
    expect((await userOf(ash.email)).emailVerifiedAt).toEqual(current);
    expect(await prisma.emailCode.count()).toBe(0);
    expect(await prisma.refreshToken.count()).toBe(1);
  });

  it("el código solo sirve una vez", async () => {
    await service.registerPending(ash);
    const code = lastCode(ash.email);
    await service.verifyEmail({ email: ash.email, code });
    await expectAppError(service.verifyEmail({ email: ash.email, code }), "INVALID_CODE", 400);
  });

  it("un código equivocado, vencido, o un correo que no existe dan el mismo INVALID_CODE", async () => {
    await service.registerPending(ash);
    const code = lastCode(ash.email);
    await expectAppError(service.verifyEmail({ email: ash.email, code: code === "000000" ? "000001" : "000000" }), "INVALID_CODE", 400);
    await expectAppError(service.verifyEmail({ email: "nadie@example.com", code }), "INVALID_CODE", 400);
    current = new Date(current.getTime() + 11 * 60_000);
    await expectAppError(service.verifyEmail({ email: ash.email, code }), "INVALID_CODE", 400);
    expect((await userOf(ash.email)).emailVerifiedAt).toBeNull();
  });

  it("no cambia la fecha de verificación de una cuenta que ya estaba verificada", async () => {
    await service.registerPending(ash);
    const code = lastCode(ash.email);
    const firstDate = new Date("2025-06-01T00:00:00.000Z");
    await prisma.user.update({ where: { email: ash.email }, data: { emailVerifiedAt: firstDate } });
    await service.verifyEmail({ email: ash.email, code });
    expect((await userOf(ash.email)).emailVerifiedAt).toEqual(firstDate);
  });
});

describe("login con la verificación activa", () => {
  it("una cuenta sin verificar con la contraseña correcta da EMAIL_NOT_VERIFIED (403) y no abre sesión", async () => {
    await service.registerPending(ash);
    await expectAppError(service.login({ email: ash.email, password: ash.password }), "EMAIL_NOT_VERIFIED", 403);
    expect(await prisma.refreshToken.count()).toBe(0);
  });

  it("con la contraseña equivocada da INVALID_CREDENTIALS: no delata que la cuenta existe sin verificar", async () => {
    await service.registerPending(ash);
    await expectAppError(service.login({ email: ash.email, password: "mala-clave-1" }), "INVALID_CREDENTIALS", 401);
  });

  it("una cuenta verificada entra", async () => {
    await service.registerPending(ash);
    await service.verifyEmail({ email: ash.email, code: lastCode(ash.email) });
    await expect(service.login({ email: ash.email, password: ash.password })).resolves.toBeDefined();
  });

  it("con la verificación apagada entra aunque la cuenta no esté verificada (todo como antes)", async () => {
    const off = newService(false);
    await off.register(ash);
    expect((await userOf(ash.email)).emailVerifiedAt).toBeNull();
    await expect(off.login({ email: ash.email, password: ash.password })).resolves.toBeDefined();
  });

  it("una cuenta de antes de activar la verificación, sin verificar, tiene que verificar al volver a entrar", async () => {
    const off = newService(false);
    await off.register(ash);
    await expectAppError(service.login({ email: ash.email, password: ash.password }), "EMAIL_NOT_VERIFIED", 403);
  });
});

describe("refresh con la verificación activa", () => {
  it("una sesión de una cuenta sin verificar no se renueva (EMAIL_NOT_VERIFIED) y su token sigue sin gastarse", async () => {
    const off = newService(false);
    const session = await off.register(ash);
    await expectAppError(service.refresh(session.refreshToken), "EMAIL_NOT_VERIFIED", 403);
    const stored = await prisma.refreshToken.findMany();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.revokedAt).toBeNull();
  });

  it("una cuenta verificada renueva como siempre", async () => {
    await service.registerPending(ash);
    const session = await service.verifyEmail({ email: ash.email, code: lastCode(ash.email) });
    await expect(service.refresh(session.refreshToken)).resolves.toBeDefined();
  });
});
