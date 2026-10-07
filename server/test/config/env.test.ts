import { describe, expect, it } from "vitest";
import { loadEnv } from "../../src/config/env.js";

const valid = {
  DATABASE_URL: "postgresql://postgres:pw@localhost:5432/pokemon_minigames",
  JWT_ACCESS_SECRET: "x".repeat(32),
};

const production = { ...valid, NODE_ENV: "production", COOKIE_SECURE: "true", TRUST_PROXY: "1" };

describe("loadEnv en producción", () => {
  it("acepta una configuración segura y completa", () => {
    const env = loadEnv(production);
    expect(env).toMatchObject({ NODE_ENV: "production", COOKIE_SECURE: true, COOKIE_SAME_SITE: "lax", TRUST_PROXY: 1 });
  });

  it("no inventa un CORS_ORIGIN: con un solo origen no hay CORS que configurar", () => {
    expect(loadEnv(production).CORS_ORIGIN).toBeUndefined();
    expect(loadEnv({ ...production, CORS_ORIGIN: "https://juego.example" }).CORS_ORIGIN).toBe("https://juego.example");
  });

  it("exige la cookie segura", () => {
    expect(() => loadEnv({ ...production, COOKIE_SECURE: "false" })).toThrow(/COOKIE_SECURE/);
    expect(() => loadEnv({ ...valid, NODE_ENV: "production", TRUST_PROXY: "1" })).toThrow(/COOKIE_SECURE/);
  });

  it("rechaza SameSite=none (con un solo origen no hace falta)", () => {
    expect(() => loadEnv({ ...production, COOKIE_SAME_SITE: "none" })).toThrow(/COOKIE_SAME_SITE/);
    expect(loadEnv({ ...production, COOKIE_SAME_SITE: "strict" }).COOKIE_SAME_SITE).toBe("strict");
  });

  it("exige decir cuántos proxies hay delante (si no, todas las IP serían la del proxy)", () => {
    const { TRUST_PROXY: _omitted, ...withoutProxy } = production;
    expect(() => loadEnv(withoutProxy)).toThrow(/TRUST_PROXY/);
  });

  it("nombra todos los problemas a la vez", () => {
    const { TRUST_PROXY: _omitted, ...withoutProxy } = production;
    let message = "";
    try {
      loadEnv({ ...withoutProxy, COOKIE_SECURE: "false", COOKIE_SAME_SITE: "none" });
    } catch (error) {
      message = String(error);
    }
    expect(message).toMatch(/COOKIE_SECURE/);
    expect(message).toMatch(/COOKIE_SAME_SITE/);
    expect(message).toMatch(/TRUST_PROXY/);
  });
});

describe("variables obligatorias que faltan", () => {
  it("en producción, si falta DATABASE_URL se dicen también los demás problemas, todo en español", () => {
    let message = "";
    try {
      loadEnv({ NODE_ENV: "production", JWT_ACCESS_SECRET: "x".repeat(32), COOKIE_SECURE: "false" });
    } catch (error) {
      message = String(error);
    }
    expect(message).toMatch(/DATABASE_URL: es obligatoria/);
    expect(message).toMatch(/COOKIE_SECURE/);
    expect(message).toMatch(/TRUST_PROXY/);
    expect(message).not.toMatch(/Invalid input|expected string/);
  });

  it("falta JWT_ACCESS_SECRET: lo dice en español", () => {
    expect(() => loadEnv({ DATABASE_URL: "postgresql://x" })).toThrow(/JWT_ACCESS_SECRET: es obligatoria/);
  });

  it("un TRUST_PROXY inválido en producción se nombra una sola vez", () => {
    let message = "";
    try {
      loadEnv({ ...valid, NODE_ENV: "production", COOKIE_SECURE: "true", TRUST_PROXY: "abc" });
    } catch (error) {
      message = String(error);
    }
    expect(message.match(/TRUST_PROXY/g)?.length).toBe(1);
  });
});

describe("TRUST_PROXY", () => {
  it("fuera de producción es 0 si no se dice nada", () => {
    expect(loadEnv(valid).TRUST_PROXY).toBe(0);
  });

  it("acepta de 0 a 10 proxies", () => {
    expect(loadEnv({ ...valid, TRUST_PROXY: "0" }).TRUST_PROXY).toBe(0);
    expect(loadEnv({ ...valid, TRUST_PROXY: "10" }).TRUST_PROXY).toBe(10);
  });

  it.each(["-1", "11", "1.5", "abc", "true"])("rechaza %s", (value) => {
    expect(() => loadEnv({ ...valid, TRUST_PROXY: value })).toThrow(/TRUST_PROXY/);
  });
});

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
