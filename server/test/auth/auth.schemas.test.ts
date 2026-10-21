import { describe, expect, it } from "vitest";
import { guestSchema, loginSchema, registerSchema } from "../../src/auth/auth.schemas.js";

const valid = { email: "ash@example.com", username: "ash_01", password: "pikachu-123" };

describe("registerSchema", () => {
  it("acepta datos válidos", () => {
    expect(registerSchema.parse(valid)).toEqual(valid);
  });

  it("normaliza el email a minúsculas y sin espacios, y recorta el username", () => {
    const parsed = registerSchema.parse({ ...valid, email: "  ASH@Example.COM ", username: " ash_01 " });
    expect(parsed.email).toBe("ash@example.com");
    expect(parsed.username).toBe("ash_01");
  });

  it.each([
    ["email sin arroba", { email: "ash.example.com" }],
    ["email vacío", { email: "" }],
    ["username de 2 caracteres", { username: "ab" }],
    ["username de 31 caracteres", { username: "a".repeat(31) }],
    ["username con espacios", { username: "ash ketchum" }],
    ["username con caracteres especiales", { username: "ash<script>" }],
    ["contraseña de 7 caracteres", { password: "1234567" }],
  ])("rechaza %s", (_name, override) => {
    expect(registerSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });

  it("rechaza una contraseña de más de 72 bytes aunque tenga menos de 72 caracteres", () => {
    const password = "ñ".repeat(37); // 37 caracteres, 74 bytes
    expect(password.length).toBeLessThan(72);
    expect(registerSchema.safeParse({ ...valid, password }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: "ñ".repeat(36) }).success).toBe(true);
  });

  it("rechaza campos que no son texto", () => {
    expect(registerSchema.safeParse({ ...valid, username: 123 }).success).toBe(false);
    expect(registerSchema.safeParse(undefined).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("normaliza el email", () => {
    expect(loginSchema.parse({ email: " ASH@example.com ", password: "x" }).email).toBe("ash@example.com");
  });

  it("rechaza una contraseña vacía", () => {
    expect(loginSchema.safeParse({ email: "ash@example.com", password: "" }).success).toBe(false);
  });
});

describe("guestSchema", () => {
  it("acepta un nombre de 3 a 30 letras, números o guion bajo y lo recorta", () => {
    expect(guestSchema.parse({ username: "  inv_01 " })).toEqual({ username: "inv_01" });
    expect(guestSchema.safeParse({ username: "a".repeat(30) }).success).toBe(true);
  });

  it("usa la misma regla de nombre que el registro y no pide nada más", () => {
    for (const username of ["ab", "a".repeat(31), "ash ketchum", "ash<script>", "ñandú", 123, undefined]) {
      expect(guestSchema.safeParse({ username }).success, String(username)).toBe(false);
      expect(registerSchema.safeParse({ ...valid, username }).success, String(username)).toBe(false);
    }
    expect(guestSchema.safeParse(undefined).success).toBe(false);
  });
});
