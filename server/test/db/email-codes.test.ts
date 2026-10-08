import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDatabase } from "../helpers/db.js";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

async function createUser(n = 1) {
  return prisma.user.create({ data: { email: `user${n}@example.com`, username: `user${n}`, passwordHash: "hash" } });
}

const expiresAt = new Date("2026-01-01T00:10:00.000Z");

describe("users.email_verified_at", () => {
  it("una cuenta nueva nace sin verificar", async () => {
    const user = await createUser();
    expect(user.emailVerifiedAt).toBeNull();
  });

  it("se puede marcar como verificada", async () => {
    const user = await createUser();
    const when = new Date("2026-01-01T00:00:00.000Z");
    const updated = await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: when } });
    expect(updated.emailVerifiedAt).toEqual(when);
  });
});

describe("email_codes", () => {
  it("guarda un código por cuenta y propósito, con 0 intentos al empezar", async () => {
    const user = await createUser();
    const code = await prisma.emailCode.create({ data: { userId: user.id, purpose: "verify_email", codeHash: "h1", expiresAt } });
    expect(code).toMatchObject({ userId: user.id, purpose: "verify_email", codeHash: "h1", attempts: 0 });
    expect(code.createdAt).toBeInstanceOf(Date);
  });

  it("una cuenta puede tener a la vez un código de cada propósito", async () => {
    const user = await createUser();
    await prisma.emailCode.create({ data: { userId: user.id, purpose: "verify_email", codeHash: "h1", expiresAt } });
    await prisma.emailCode.create({ data: { userId: user.id, purpose: "reset_password", codeHash: "h2", expiresAt } });
    expect(await prisma.emailCode.count({ where: { userId: user.id } })).toBe(2);
  });

  it("rechaza un segundo código del mismo propósito para la misma cuenta: pedir otro lo reemplaza", async () => {
    const user = await createUser();
    await prisma.emailCode.create({ data: { userId: user.id, purpose: "verify_email", codeHash: "h1", expiresAt } });
    await expect(
      prisma.emailCode.create({ data: { userId: user.id, purpose: "verify_email", codeHash: "h2", expiresAt } }),
    ).rejects.toThrow();
  });

  it("los intentos van de 0 a 5: la base de datos rechaza lo demás", async () => {
    const user = await createUser();
    await expect(
      prisma.emailCode.create({ data: { userId: user.id, purpose: "verify_email", codeHash: "h", expiresAt, attempts: 6 } }),
    ).rejects.toThrow();
    await expect(
      prisma.emailCode.create({ data: { userId: user.id, purpose: "verify_email", codeHash: "h", expiresAt, attempts: -1 } }),
    ).rejects.toThrow();
    const accepted = await prisma.emailCode.create({
      data: { userId: user.id, purpose: "verify_email", codeHash: "h", expiresAt, attempts: 5 },
    });
    expect(accepted.attempts).toBe(5);
  });

  it("no se puede reservar un sexto intento aunque se intente en la propia base de datos", async () => {
    const user = await createUser();
    await prisma.emailCode.create({ data: { userId: user.id, purpose: "verify_email", codeHash: "h", expiresAt, attempts: 5 } });
    await expect(prisma.$executeRaw`UPDATE email_codes SET attempts = attempts + 1 WHERE user_id = ${user.id}::uuid`).rejects.toThrow();
  });

  it("solo admite los propósitos verify_email y reset_password", async () => {
    const user = await createUser();
    await expect(
      prisma.$executeRaw`INSERT INTO email_codes (user_id, purpose, code_hash, expires_at) VALUES (${user.id}::uuid, 'otro', 'h', now())`,
    ).rejects.toThrow();
  });

  it("al borrar la cuenta se borran sus códigos", async () => {
    const user = await createUser();
    await prisma.emailCode.create({ data: { userId: user.id, purpose: "verify_email", codeHash: "h1", expiresAt } });
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.emailCode.count()).toBe(0);
  });

  it("exige una cuenta que exista", async () => {
    await expect(
      prisma.emailCode.create({ data: { userId: "00000000-0000-4000-8000-000000000000", purpose: "verify_email", codeHash: "h", expiresAt } }),
    ).rejects.toThrow();
  });
});
