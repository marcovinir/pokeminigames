import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AuthService } from "../../src/auth/auth.service.js";
import { EmailCodeStore, createCodeHasher } from "../../src/auth/email-codes.js";
import { createPasswordHasher } from "../../src/auth/password.js";
import { createTokenService } from "../../src/auth/tokens.js";
import { AppError } from "../../src/http/errors.js";
import { MailerError } from "../../src/mail/mailer.js";
import { MemoryMailer } from "../../src/mail/memory-mailer.js";
import { prisma, resetDatabase, warmUpPool } from "../helpers/db.js";

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

function lastCode(email: string): string {
  const mail = mailer.to(email).at(-1);
  if (!mail) throw new Error(`No se envió ningún correo a ${email}`);
  return /(\d{6})/.exec(mail.text)![1]!;
}

const wrong = (code: string): string => (code === "000000" ? "000001" : "000000");

/** Una cuenta verificada con una sesión abierta (se crea con el servicio sin verificación y se verifica a mano). */
async function verifiedAccount() {
  const session = await newService(false).register(ash);
  await prisma.user.update({ where: { email: ash.email }, data: { emailVerifiedAt: current } });
  return session;
}

describe("requestPasswordReset", () => {
  it("a una cuenta que existe le envía un correo con el código para cambiar la contraseña", async () => {
    await verifiedAccount();
    await service.requestPasswordReset(ash.email);
    expect(mailer.to(ash.email)).toHaveLength(1);
    expect(mailer.to(ash.email)[0]!.subject).toBe("Código para cambiar tu contraseña de Pokémon Minigames");
    expect(lastCode(ash.email)).toMatch(/^\d{6}$/);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: ash.email } });
    expect(await prisma.emailCode.count({ where: { userId: user.id, purpose: "reset_password" } })).toBe(1);
  });

  it("a un correo que no existe no le envía nada ni da ningún error", async () => {
    await expect(service.requestPasswordReset("nadie@example.com")).resolves.toBeUndefined();
    expect(mailer.sent).toHaveLength(0);
    expect(await prisma.emailCode.count()).toBe(0);
  });

  it("también sirve para una cuenta que aún no verificó su correo", async () => {
    await service.registerPending(ash);
    mailer.clear();
    await service.requestPasswordReset(ash.email);
    expect(mailer.to(ash.email)).toHaveLength(1);
    expect(mailer.to(ash.email)[0]!.subject).toContain("contraseña");
  });

  it("pedir otro código anula el anterior", async () => {
    await verifiedAccount();
    await service.requestPasswordReset(ash.email);
    const first = lastCode(ash.email);
    await service.requestPasswordReset(ash.email);
    const second = lastCode(ash.email);
    if (first !== second) {
      await expectAppError(service.resetPassword({ email: ash.email, code: first, password: "nueva-clave-1" }), "INVALID_CODE", 400);
    }
    await expect(service.resetPassword({ email: ash.email, code: second, password: "nueva-clave-1" })).resolves.toBeUndefined();
  });

  it("si el proveedor falla no da error (nadie espera la respuesta) y lo anota sin la dirección ni el código", async () => {
    await verifiedAccount();
    mailer.failWith = new MailerError(429, "Resend respondió 429 (rate_limit_exceeded)");
    await expect(service.requestPasswordReset(ash.email)).resolves.toBeUndefined();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain("429");
    expect(logged[0]).not.toContain(ash.email);
    expect(logged[0]).not.toMatch(/\d{6}/);
  });
});

describe("resendVerification", () => {
  it("a una cuenta sin verificar le envía un código nuevo y el anterior deja de valer", async () => {
    await service.registerPending(ash);
    const first = lastCode(ash.email);
    await service.resendVerification(ash.email);
    expect(mailer.to(ash.email)).toHaveLength(2);
    const second = lastCode(ash.email);
    if (first !== second) await expectAppError(service.verifyEmail({ email: ash.email, code: first }), "INVALID_CODE", 400);
    await expect(service.verifyEmail({ email: ash.email, code: second })).resolves.toBeDefined();
  });

  it("a una cuenta ya verificada, o a un correo que no existe, no les envía nada", async () => {
    await verifiedAccount();
    await service.resendVerification(ash.email);
    await service.resendVerification("nadie@example.com");
    expect(mailer.sent).toHaveLength(0);
  });

  it("si el proveedor falla no da error y lo anota", async () => {
    await service.registerPending(ash);
    mailer.failWith = new MailerError(503, "Resend respondió 503");
    await expect(service.resendVerification(ash.email)).resolves.toBeUndefined();
    expect(logged).toHaveLength(1);
  });
});

describe("resetPassword", () => {
  it("con el código correcto cambia la contraseña: la nueva entra y la vieja ya no", async () => {
    await verifiedAccount();
    await service.requestPasswordReset(ash.email);
    await service.resetPassword({ email: ash.email, code: lastCode(ash.email), password: "nueva-clave-1" });

    await expect(service.login({ email: ash.email, password: "nueva-clave-1" })).resolves.toBeDefined();
    await expectAppError(service.login({ email: ash.email, password: ash.password }), "INVALID_CREDENTIALS", 401);
  });

  it("revoca todas las sesiones abiertas de la cuenta", async () => {
    const session = await verifiedAccount();
    await service.login({ email: ash.email, password: ash.password });
    expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(2);

    await service.requestPasswordReset(ash.email);
    await service.resetPassword({ email: ash.email, code: lastCode(ash.email), password: "nueva-clave-1" });

    expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
    await expectAppError(service.refresh(session.refreshToken), "INVALID_REFRESH_TOKEN", 401);
  });

  it("no abre ninguna sesión", async () => {
    await verifiedAccount();
    const before = await prisma.refreshToken.count();
    await service.requestPasswordReset(ash.email);
    await service.resetPassword({ email: ash.email, code: lastCode(ash.email), password: "nueva-clave-1" });
    expect(await prisma.refreshToken.count()).toBe(before);
  });

  it("verifica el correo de una cuenta pendiente (recibir el código ya lo demuestra) y no toca la fecha de una ya verificada", async () => {
    await service.registerPending(ash);
    await service.requestPasswordReset(ash.email);
    await service.resetPassword({ email: ash.email, code: lastCode(ash.email), password: "nueva-clave-1" });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: ash.email } });
    expect(user.emailVerifiedAt).toEqual(current);
    // El código de verificar que seguía pendiente ya no hace falta.
    expect(await prisma.emailCode.count({ where: { userId: user.id } })).toBe(0);

    const firstDate = user.emailVerifiedAt!;
    current = new Date(current.getTime() + 3_600_000);
    await service.requestPasswordReset(ash.email);
    await service.resetPassword({ email: ash.email, code: lastCode(ash.email), password: "otra-clave-22" });
    expect((await prisma.user.findUniqueOrThrow({ where: { email: ash.email } })).emailVerifiedAt).toEqual(firstDate);
  });

  it("un código equivocado, vencido o de un correo que no existe da INVALID_CODE y no cambia nada", async () => {
    await verifiedAccount();
    await service.requestPasswordReset(ash.email);
    const code = lastCode(ash.email);

    await expectAppError(service.resetPassword({ email: ash.email, code: wrong(code), password: "nueva-clave-1" }), "INVALID_CODE", 400);
    await expectAppError(service.resetPassword({ email: "nadie@example.com", code, password: "nueva-clave-1" }), "INVALID_CODE", 400);
    current = new Date(current.getTime() + 11 * 60_000);
    await expectAppError(service.resetPassword({ email: ash.email, code, password: "nueva-clave-1" }), "INVALID_CODE", 400);

    await expect(service.login({ email: ash.email, password: ash.password })).resolves.toBeDefined();
    expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBeGreaterThan(0);
  });

  it("el código solo sirve una vez", async () => {
    await verifiedAccount();
    await service.requestPasswordReset(ash.email);
    const code = lastCode(ash.email);
    await service.resetPassword({ email: ash.email, code, password: "nueva-clave-1" });
    await expectAppError(service.resetPassword({ email: ash.email, code, password: "otra-clave-22" }), "INVALID_CODE", 400);
    await expect(service.login({ email: ash.email, password: "nueva-clave-1" })).resolves.toBeDefined();
  });

  it("el código de verificar el correo no sirve para cambiar la contraseña, ni al revés", async () => {
    await service.registerPending(ash);
    const verifyCode = lastCode(ash.email);
    await expectAppError(service.resetPassword({ email: ash.email, code: verifyCode, password: "nueva-clave-1" }), "INVALID_CODE", 400);

    await service.requestPasswordReset(ash.email);
    const resetCode = lastCode(ash.email);
    await expectAppError(service.verifyEmail({ email: ash.email, code: resetCode === verifyCode ? wrong(resetCode) : resetCode }), "INVALID_CODE", 400);
  });

  it("dos cambios a la vez con el mismo código: solo uno se aplica", async () => {
    await warmUpPool();
    await verifiedAccount();
    await service.requestPasswordReset(ash.email);
    const code = lastCode(ash.email);
    const results = await Promise.allSettled([
      service.resetPassword({ email: ash.email, code, password: "clave-uno-11" }),
      service.resetPassword({ email: ash.email, code, password: "clave-dos-22" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect((rejected.reason as AppError).code).toBe("INVALID_CODE");
  });
});
