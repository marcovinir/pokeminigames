import { describe, expect, it } from "vitest";
import { createPasswordHasher } from "../../src/auth/password.js";

const hasher = createPasswordHasher(4);

describe("PasswordHasher", () => {
  it("genera un hash distinto del texto plano", async () => {
    const hash = await hasher.hash("secreto-123");
    expect(hash).not.toContain("secreto-123");
    expect(hash).toMatch(/^\$2[aby]\$04\$/);
  });

  it("verifica la contraseña correcta y rechaza la incorrecta", async () => {
    const hash = await hasher.hash("secreto-123");
    await expect(hasher.verify("secreto-123", hash)).resolves.toBe(true);
    await expect(hasher.verify("otro-secreto", hash)).resolves.toBe(false);
  });

  it("dos hashes de la misma contraseña son distintos (sal aleatoria)", async () => {
    const [a, b] = await Promise.all([hasher.hash("secreto-123"), hasher.hash("secreto-123")]);
    expect(a).not.toBe(b);
  });

  it("distingue mayúsculas y caracteres no ASCII", async () => {
    const hash = await hasher.hash("Contraseña-Ñandú");
    await expect(hasher.verify("contraseña-ñandú", hash)).resolves.toBe(false);
    await expect(hasher.verify("Contraseña-Ñandú", hash)).resolves.toBe(true);
  });
});
