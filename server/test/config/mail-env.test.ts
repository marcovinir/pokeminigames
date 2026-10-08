import { describe, expect, it } from "vitest";
import { loadEnv } from "../../src/config/env.js";

const valid = {
  DATABASE_URL: "postgresql://postgres:pw@localhost:5432/pokemon_minigames",
  JWT_ACCESS_SECRET: "x".repeat(32),
};

const production = { ...valid, NODE_ENV: "production", COOKIE_SECURE: "true", TRUST_PROXY: "2" };
const resend = { MAIL_PROVIDER: "resend", RESEND_API_KEY: "re_clave_de_prueba", MAIL_FROM: "Pokémon Minigames <no-responder@ejemplo.me>" };

describe("valores por defecto del correo", () => {
  it("la verificación está apagada, el permiso de la memoria denegado y el proveedor depende del entorno", () => {
    expect(loadEnv(valid)).toMatchObject({ EMAIL_VERIFICATION: false, MAIL_PROVIDER: "console", ALLOW_MEMORY_MAIL: false });
    expect(loadEnv({ ...valid, NODE_ENV: "test" }).MAIL_PROVIDER).toBe("memory");
    // En producción no se inventa un proveedor: sin la verificación no hace falta, y con ella hay que decirlo.
    expect(loadEnv(production).MAIL_PROVIDER).toBeUndefined();
    expect(loadEnv(production).EMAIL_VERIFICATION).toBe(false);
  });

  it("EMAIL_VERIFICATION solo admite on u off", () => {
    expect(loadEnv({ ...valid, EMAIL_VERIFICATION: "on" }).EMAIL_VERIFICATION).toBe(true);
    expect(loadEnv({ ...valid, EMAIL_VERIFICATION: "off" }).EMAIL_VERIFICATION).toBe(false);
    expect(() => loadEnv({ ...valid, EMAIL_VERIFICATION: "si" })).toThrow(/EMAIL_VERIFICATION/);
    expect(() => loadEnv({ ...valid, EMAIL_VERIFICATION: "true" })).toThrow(/EMAIL_VERIFICATION/);
  });

  it("MAIL_PROVIDER solo admite resend, console o memory", () => {
    expect(() => loadEnv({ ...valid, MAIL_PROVIDER: "smtp" })).toThrow(/MAIL_PROVIDER/);
    expect(loadEnv({ ...valid, MAIL_PROVIDER: "memory" }).MAIL_PROVIDER).toBe("memory");
  });

  it("ALLOW_MEMORY_MAIL solo admite true o false", () => {
    expect(loadEnv({ ...valid, ALLOW_MEMORY_MAIL: "true" }).ALLOW_MEMORY_MAIL).toBe(true);
    expect(() => loadEnv({ ...valid, ALLOW_MEMORY_MAIL: "yes" })).toThrow(/ALLOW_MEMORY_MAIL/);
  });
});

describe("Resend", () => {
  it("exige su clave y un remitente, en cualquier entorno", () => {
    expect(() => loadEnv({ ...valid, MAIL_PROVIDER: "resend" })).toThrow(/RESEND_API_KEY/);
    expect(() => loadEnv({ ...valid, MAIL_PROVIDER: "resend", RESEND_API_KEY: "re_x" })).toThrow(/MAIL_FROM/);
    expect(() => loadEnv({ ...valid, MAIL_PROVIDER: "resend", MAIL_FROM: "a@ejemplo.me" })).toThrow(/RESEND_API_KEY/);
    expect(loadEnv({ ...valid, ...resend })).toMatchObject({ MAIL_PROVIDER: "resend", RESEND_API_KEY: "re_clave_de_prueba" });
  });

  it("el remitente es «Nombre <dirección>» o solo la dirección; cualquier otra cosa se rechaza", () => {
    expect(loadEnv({ ...valid, ...resend, MAIL_FROM: "no-responder@ejemplo.me" }).MAIL_FROM).toBe("no-responder@ejemplo.me");
    expect(loadEnv({ ...valid, ...resend }).MAIL_FROM).toBe("Pokémon Minigames <no-responder@ejemplo.me>");
    expect(() => loadEnv({ ...valid, ...resend, MAIL_FROM: "sin-arroba" })).toThrow(/MAIL_FROM/);
    expect(() => loadEnv({ ...valid, ...resend, MAIL_FROM: "Nombre <sin-cierre@ejemplo.me" })).toThrow(/MAIL_FROM/);
  });
});

describe("producción con la verificación activada", () => {
  const on = { ...production, EMAIL_VERIFICATION: "on" };

  it("acepta Resend con su clave y su remitente", () => {
    expect(loadEnv({ ...on, ...resend })).toMatchObject({ EMAIL_VERIFICATION: true, MAIL_PROVIDER: "resend" });
  });

  it("se niega a arrancar sin proveedor y lo dice en español", () => {
    expect(() => loadEnv(on)).toThrow(/MAIL_PROVIDER: con EMAIL_VERIFICATION=on en producción debe ser resend/);
  });

  it("no admite la consola: escribiría los códigos en el registro", () => {
    expect(() => loadEnv({ ...on, MAIL_PROVIDER: "console" })).toThrow(/MAIL_PROVIDER: con EMAIL_VERIFICATION=on en producción debe ser resend/);
  });

  it("la memoria solo se admite con ALLOW_MEMORY_MAIL=true (el servidor de la prueba E2E)", () => {
    expect(() => loadEnv({ ...on, MAIL_PROVIDER: "memory" })).toThrow(/ALLOW_MEMORY_MAIL=true/);
    expect(() => loadEnv({ ...on, MAIL_PROVIDER: "memory", ALLOW_MEMORY_MAIL: "false" })).toThrow(/ALLOW_MEMORY_MAIL=true/);
    expect(loadEnv({ ...on, MAIL_PROVIDER: "memory", ALLOW_MEMORY_MAIL: "true" })).toMatchObject({ MAIL_PROVIDER: "memory", ALLOW_MEMORY_MAIL: true });
  });

  it("con la verificación apagada no se pide nada de correo", () => {
    expect(() => loadEnv(production)).not.toThrow();
    expect(() => loadEnv({ ...production, EMAIL_VERIFICATION: "off", MAIL_PROVIDER: "console" })).not.toThrow();
  });

  it("nombra todos los problemas a la vez", () => {
    let message = "";
    try {
      loadEnv({ ...on, MAIL_PROVIDER: "resend", COOKIE_SECURE: "false" });
    } catch (error) {
      message = String(error);
    }
    expect(message).toMatch(/COOKIE_SECURE/);
    expect(message).toMatch(/RESEND_API_KEY/);
    expect(message).toMatch(/MAIL_FROM/);
  });
});
