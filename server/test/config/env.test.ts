import { describe, expect, it } from "vitest";
import { loadEnv } from "../../src/config/env.js";

const valid = {
  DATABASE_URL: "postgresql://postgres:pw@localhost:5432/pokemon_minigames",
  JWT_ACCESS_SECRET: "x".repeat(32),
};

describe("loadEnv", () => {
  it("aplica los valores por defecto", () => {
    const env = loadEnv(valid);
    expect(env).toMatchObject({
      NODE_ENV: "development",
      PORT: 3000,
      ACCESS_TOKEN_TTL_SECONDS: 3600,
      REFRESH_TOKEN_TTL_DAYS: 7,
      BCRYPT_COST: 12,
      CORS_ORIGIN: "http://localhost:5173",
      COOKIE_SECURE: false,
      COOKIE_SAME_SITE: "lax",
    });
  });

  it("convierte los números y booleanos que llegan como texto", () => {
    const env = loadEnv({ ...valid, PORT: "8080", COOKIE_SECURE: "true" });
    expect(env.PORT).toBe(8080);
    expect(env.COOKIE_SECURE).toBe(true);
  });

  it("falla y nombra la variable cuando falta DATABASE_URL", () => {
    expect(() => loadEnv({ JWT_ACCESS_SECRET: valid.JWT_ACCESS_SECRET })).toThrow(/DATABASE_URL/);
  });

  it("rechaza un secreto JWT de menos de 32 caracteres", () => {
    expect(() => loadEnv({ ...valid, JWT_ACCESS_SECRET: "corto" })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it("rechaza un puerto fuera de rango", () => {
    expect(() => loadEnv({ ...valid, PORT: "70000" })).toThrow(/PORT/);
  });

  it("rechaza SameSite=none sin cookie segura", () => {
    expect(() => loadEnv({ ...valid, COOKIE_SAME_SITE: "none" })).toThrow(/COOKIE_SAME_SITE/);
    expect(loadEnv({ ...valid, COOKIE_SAME_SITE: "none", COOKIE_SECURE: "true" }).COOKIE_SAME_SITE).toBe("none");
  });
});
