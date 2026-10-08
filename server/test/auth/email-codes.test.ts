import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { CODE_TTL_MS, MAX_CODE_ATTEMPTS } from "../../src/auth/code-policy.js";
import { EmailCodeStore, createCodeHasher, generateCode } from "../../src/auth/email-codes.js";
import { AppError } from "../../src/http/errors.js";
import { prisma, resetDatabase, warmUpPool } from "../helpers/db.js";

const SECRET = "s".repeat(40);
let now = new Date("2026-01-01T00:00:00.000Z");
const store = new EmailCodeStore({ prisma, hash: createCodeHasher(SECRET), now: () => now });

beforeEach(async () => {
  now = new Date("2026-01-01T00:00:00.000Z");
  await resetDatabase();
});
afterAll(() => prisma.$disconnect());

async function createUser(n = 1) {
  return prisma.user.create({ data: { email: `user${n}@example.com`, username: `user${n}`, passwordHash: "hash" } });
}

async function expectInvalid(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe("INVALID_CODE");
  expect((error as AppError).status).toBe(400);
}

const attemptsOf = async (userId: string, purpose: "verify_email" | "reset_password" = "verify_email") =>
  (await prisma.emailCode.findUniqueOrThrow({ where: { userId_purpose: { userId, purpose } } })).attempts;

/** Una forma de equivocarse que nunca coincide con el código real. */
const wrong = (code: string): string => (code === "000000" ? "000001" : "000000");

describe("generateCode", () => {
  it("son seis dígitos, con ceros a la izquierda si hace falta", () => {
    expect(generateCode(() => 42)).toBe("000042");
    expect(generateCode(() => 0)).toBe("000000");
    expect(generateCode(() => 999_999)).toBe("999999");
  });

  it("pide al generador un número menor que un millón", () => {
    let seenMax = 0;
    generateCode((max) => {
      seenMax = max;
      return 1;
    });
    expect(seenMax).toBe(1_000_000);
  });

  it("con el generador criptográfico real siempre da seis dígitos", () => {
    for (let i = 0; i < 500; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });
});

describe("createCodeHasher", () => {
  const hash = createCodeHasher(SECRET);

  it("da un hash hexadecimal de 64 caracteres que no contiene el código", () => {
    const value = hash("u1", "verify_email", "123456");
    expect(value).toMatch(/^[0-9a-f]{64}$/);
    expect(value).not.toContain("123456");
  });

  it("es estable, y cambia con la cuenta, el propósito, el código y la clave del servidor", () => {
    const base = hash("u1", "verify_email", "123456");
    expect(hash("u1", "verify_email", "123456")).toBe(base);
    expect(hash("u2", "verify_email", "123456")).not.toBe(base);
    expect(hash("u1", "reset_password", "123456")).not.toBe(base);
    expect(hash("u1", "verify_email", "123457")).not.toBe(base);
    expect(createCodeHasher("otra-clave-distinta-de-32-caracteres-xx")("u1", "verify_email", "123456")).not.toBe(base);
  });
});

describe("issue", () => {
  it("guarda el hash (no el código), vence a los 10 minutos y empieza con 0 intentos", async () => {
    const user = await createUser();
    const code = await store.issue(prisma, user.id, "verify_email");
    expect(code).toMatch(/^\d{6}$/);
    const row = await prisma.emailCode.findUniqueOrThrow({ where: { userId_purpose: { userId: user.id, purpose: "verify_email" } } });
    expect(row.codeHash).toBe(createCodeHasher(SECRET)(user.id, "verify_email", code));
    expect(row.codeHash).not.toContain(code);
    expect(row.expiresAt).toEqual(new Date(now.getTime() + CODE_TTL_MS));
    expect(row.createdAt).toEqual(now);
    expect(row.attempts).toBe(0);
  });

  it("pedir otro código reemplaza al anterior: cambia el hash, el vencimiento, el envío y los intentos", async () => {
    const user = await createUser();
    const first = await store.issue(prisma, user.id, "verify_email");
    await expectInvalid(store.claim(user.id, "verify_email", wrong(first)));
    expect(await attemptsOf(user.id)).toBe(1);

    now = new Date(now.getTime() + 60_000);
    const second = await store.issue(prisma, user.id, "verify_email");
    expect(await prisma.emailCode.count({ where: { userId: user.id } })).toBe(1);
    const row = await prisma.emailCode.findUniqueOrThrow({ where: { userId_purpose: { userId: user.id, purpose: "verify_email" } } });
    expect(row.attempts).toBe(0);
    expect(row.createdAt).toEqual(now);
    expect(row.expiresAt).toEqual(new Date(now.getTime() + CODE_TTL_MS));
    if (second !== first) await expectInvalid(store.claim(user.id, "verify_email", first));
    await expect(store.claim(user.id, "verify_email", second)).resolves.toBeDefined();
  });

  it("cada propósito tiene su propio código", async () => {
    const user = await createUser();
    await store.issue(prisma, user.id, "verify_email");
    await store.issue(prisma, user.id, "reset_password");
    expect(await prisma.emailCode.count({ where: { userId: user.id } })).toBe(2);
  });

  it("se puede usar dentro de una transacción: si se deshace, el código no existe", async () => {
    const user = await createUser();
    await prisma
      .$transaction(async (tx) => {
        await store.issue(tx, user.id, "verify_email");
        throw new Error("deshacer");
      })
      .catch(() => undefined);
    expect(await prisma.emailCode.count()).toBe(0);
  });
});

describe("claim", () => {
  it("con el código correcto devuelve una reclamación que se consume una sola vez", async () => {
    const user = await createUser();
    const code = await store.issue(prisma, user.id, "verify_email");
    const claim = await store.claim(user.id, "verify_email", code);
    await prisma.$transaction((tx) => claim.consume(tx));
    expect(await prisma.emailCode.count()).toBe(0);
    await expectInvalid(store.claim(user.id, "verify_email", code));
  });

  it("un código incorrecto da INVALID_CODE y gasta un intento", async () => {
    const user = await createUser();
    const code = await store.issue(prisma, user.id, "verify_email");
    await expectInvalid(store.claim(user.id, "verify_email", wrong(code)));
    expect(await attemptsOf(user.id)).toBe(1);
  });

  it("el quinto intento, si acierta, vale; tras cuatro fallos todavía queda uno", async () => {
    const user = await createUser();
    const code = await store.issue(prisma, user.id, "verify_email");
    for (let i = 0; i < MAX_CODE_ATTEMPTS - 1; i++) await expectInvalid(store.claim(user.id, "verify_email", wrong(code)));
    await expect(store.claim(user.id, "verify_email", code)).resolves.toBeDefined();
    expect(await attemptsOf(user.id)).toBe(MAX_CODE_ATTEMPTS);
  });

  it("tras cinco fallos el código se bloquea: el sexto intento falla aunque sea el correcto y no gasta más", async () => {
    const user = await createUser();
    const code = await store.issue(prisma, user.id, "verify_email");
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) await expectInvalid(store.claim(user.id, "verify_email", wrong(code)));
    await expectInvalid(store.claim(user.id, "verify_email", code));
    expect(await attemptsOf(user.id)).toBe(MAX_CODE_ATTEMPTS);
  });

  it("pasados 10 minutos ya no vale; un milisegundo antes todavía", async () => {
    const user = await createUser();
    const code = await store.issue(prisma, user.id, "verify_email");
    now = new Date(now.getTime() + CODE_TTL_MS - 1);
    await expect(store.claim(user.id, "verify_email", code)).resolves.toBeDefined();
    now = new Date(now.getTime() + 1);
    await expectInvalid(store.claim(user.id, "verify_email", code));
  });

  it("una cuenta sin código, o que no existe, da el mismo error", async () => {
    const user = await createUser();
    await expectInvalid(store.claim(user.id, "verify_email", "123456"));
    await expectInvalid(store.claim("00000000-0000-4000-8000-000000000000", "verify_email", "123456"));
  });

  it("el código de un propósito no sirve para el otro", async () => {
    const user = await createUser();
    const code = await store.issue(prisma, user.id, "verify_email");
    await expectInvalid(store.claim(user.id, "reset_password", code));
    const reset = await store.issue(prisma, user.id, "reset_password");
    await expectInvalid(store.claim(user.id, "verify_email", reset === code ? wrong(code) : reset));
  });

  it("el código de una cuenta no sirve para otra", async () => {
    const one = await createUser(1);
    const two = await createUser(2);
    const code = await store.issue(prisma, one.id, "verify_email");
    await store.issue(prisma, two.id, "verify_email");
    await expectInvalid(store.claim(two.id, "verify_email", code));
  });

  it("si se pide otro código entre comprobar y consumir, el consumo falla (no se gasta un código que ya no vale)", async () => {
    const user = await createUser();
    const code = await store.issue(prisma, user.id, "verify_email");
    const claim = await store.claim(user.id, "verify_email", code);
    await store.issue(prisma, user.id, "verify_email");
    await expectInvalid(prisma.$transaction((tx) => claim.consume(tx)));
    expect(await prisma.emailCode.count()).toBe(1);
  });
});

describe("claimByEmail", () => {
  it("encuentra la cuenta por su correo y comprueba el código", async () => {
    const user = await createUser();
    const code = await store.issue(prisma, user.id, "verify_email");
    const result = await store.claimByEmail("user1@example.com", "verify_email", code);
    expect(result.userId).toBe(user.id);
    await prisma.$transaction((tx) => result.claim.consume(tx));
    expect(await prisma.emailCode.count()).toBe(0);
  });

  it("un correo que no existe da el mismo INVALID_CODE que un código equivocado", async () => {
    const user = await createUser();
    await store.issue(prisma, user.id, "verify_email");
    await expectInvalid(store.claimByEmail("nadie@example.com", "verify_email", "123456"));
    await expectInvalid(store.claimByEmail("user1@example.com", "verify_email", "000000"));
  });
});

describe("carreras", () => {
  it("20 intentos fallidos a la vez gastan como mucho 5", async () => {
    await warmUpPool();
    const user = await createUser();
    const code = await store.issue(prisma, user.id, "verify_email");
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => store.claim(user.id, "verify_email", wrong(code))));
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(await attemptsOf(user.id)).toBe(MAX_CODE_ATTEMPTS);
  });

  it("20 intentos a la vez, con el correcto entre ellos, no dejan pasar más de 5 comprobaciones", async () => {
    await warmUpPool();
    const user = await createUser();
    const code = await store.issue(prisma, user.id, "verify_email");
    const guesses = Array.from({ length: 20 }, (_, i) => (i === 19 ? code : wrong(code)));
    const results = await Promise.allSettled(guesses.map((guess) => store.claim(user.id, "verify_email", guess)));
    const accepted = results.filter((result) => result.status === "fulfilled").length;
    expect(accepted).toBeLessThanOrEqual(1);
    expect(await attemptsOf(user.id)).toBeLessThanOrEqual(MAX_CODE_ATTEMPTS);
  });

  it("dos peticiones que aciertan a la vez: solo una consume el código", async () => {
    await warmUpPool();
    const user = await createUser();
    const code = await store.issue(prisma, user.id, "verify_email");
    const results = await Promise.allSettled(
      [1, 2].map(async () => {
        const claim = await store.claim(user.id, "verify_email", code);
        await prisma.$transaction((tx) => claim.consume(tx));
      }),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect((rejected.reason as AppError).code).toBe("INVALID_CODE");
  });
});
