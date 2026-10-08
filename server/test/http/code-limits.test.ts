import { describe, expect, it } from "vitest";
import { type CodeLimiters, createCodeLimits } from "../../src/auth/code-limits.js";
import { DEFAULT_RATE_LIMITS } from "../../src/http/limits.js";
import { createKeyedLimiter } from "../../src/http/rate-limit.js";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

describe("los límites de los códigos por correo son los de la spec", () => {
  it("un envío por correo cada 60 s, 5 por hora, 10 por hora por IP; 5 fallos cada 10 min por correo y 20 por hora por IP", () => {
    expect(DEFAULT_RATE_LIMITS.codeCooldown).toEqual({ limit: 1, windowMs: MINUTE });
    expect(DEFAULT_RATE_LIMITS.codeSendsByEmail).toEqual({ limit: 5, windowMs: HOUR });
    expect(DEFAULT_RATE_LIMITS.codeSendsByIp).toEqual({ limit: 10, windowMs: HOUR });
    expect(DEFAULT_RATE_LIMITS.codeFailuresByEmail).toEqual({ limit: 5, windowMs: 10 * MINUTE });
    expect(DEFAULT_RATE_LIMITS.codeFailuresByIp).toEqual({ limit: 20, windowMs: HOUR });
  });
});

/** Los límites con las cifras de producción y un reloj que se mueve a mano. */
function setup() {
  let now = 0;
  const make = (config: { limit: number; windowMs: number }) => createKeyedLimiter({ ...config, now: () => now });
  const limiters: CodeLimiters = {
    cooldown: make(DEFAULT_RATE_LIMITS.codeCooldown),
    sendsByEmail: make(DEFAULT_RATE_LIMITS.codeSendsByEmail),
    sendsByIp: make(DEFAULT_RATE_LIMITS.codeSendsByIp),
    failuresByEmail: make(DEFAULT_RATE_LIMITS.codeFailuresByEmail),
    failuresByIp: make(DEFAULT_RATE_LIMITS.codeFailuresByIp),
  };
  return { limits: createCodeLimits(limiters), advance: (ms: number) => (now += ms), limiters };
}

describe("envíos de código", () => {
  it("el primero cabe y el segundo al mismo correo tiene que esperar 60 s", () => {
    const { limits, advance } = setup();
    expect(limits.reserveSend("1.1.1.1", "ash@example.com")).toBeNull();
    expect(limits.reserveSend("1.1.1.1", "ash@example.com")).toBe(60);
    advance(30 * SECOND);
    expect(limits.reserveSend("1.1.1.1", "ash@example.com")).toBe(30);
    advance(30 * SECOND);
    expect(limits.reserveSend("1.1.1.1", "ash@example.com")).toBeNull();
  });

  it("la espera es por correo: otro correo desde la misma IP cabe enseguida", () => {
    const { limits } = setup();
    expect(limits.reserveSend("1.1.1.1", "ash@example.com")).toBeNull();
    expect(limits.reserveSend("1.1.1.1", "misty@example.com")).toBeNull();
  });

  it("5 envíos por hora al mismo correo: el sexto espera a que salga el primero de la ventana", () => {
    const { limits, advance } = setup();
    for (let i = 0; i < 5; i++) {
      expect(limits.reserveSend("1.1.1.1", "ash@example.com")).toBeNull();
      advance(MINUTE);
    }
    const wait = limits.reserveSend("1.1.1.1", "ash@example.com");
    expect(wait).toBe(55 * 60);
    advance(55 * MINUTE);
    expect(limits.reserveSend("1.1.1.1", "ash@example.com")).toBeNull();
  });

  it("10 envíos por hora desde una IP, aunque sean a correos distintos", () => {
    const { limits } = setup();
    for (let i = 0; i < 10; i++) expect(limits.reserveSend("1.1.1.1", `persona${i}@example.com`)).toBeNull();
    expect(limits.reserveSend("1.1.1.1", "otra@example.com")).toBe(3600);
    expect(limits.reserveSend("2.2.2.2", "otra@example.com")).toBeNull();
  });

  it("si no cabe no se cuenta: pedir mientras se espera no alarga la espera", () => {
    const { limits, advance } = setup();
    limits.reserveSend("1.1.1.1", "ash@example.com");
    advance(10 * SECOND);
    for (let i = 0; i < 20; i++) limits.reserveSend("1.1.1.1", "ash@example.com");
    advance(50 * SECOND);
    expect(limits.reserveSend("1.1.1.1", "ash@example.com")).toBeNull();
  });

  it("si varias esperas aplican, da la más larga", () => {
    const { limits } = setup();
    for (let i = 0; i < 10; i++) limits.reserveSend("1.1.1.1", `persona${i}@example.com`);
    // El correo tiene 60 s de espera y la IP casi una hora: manda la de la IP.
    limits.reserveSend("2.2.2.2", "ash@example.com");
    expect(limits.reserveSend("1.1.1.1", "ash@example.com")).toBe(3600);
  });

  it("devolver el envío (porque falló por algo nuestro) deja el hueco como estaba en los tres límites", () => {
    const { limits } = setup();
    expect(limits.reserveSend("1.1.1.1", "ash@example.com")).toBeNull();
    limits.releaseSend("1.1.1.1", "ash@example.com");
    expect(limits.reserveSend("1.1.1.1", "ash@example.com")).toBeNull();
  });
});

describe("fallos de código", () => {
  it("5 fallos por correo caben y el sexto intento se rechaza antes de comprobar nada", () => {
    const { limits } = setup();
    for (let i = 0; i < 5; i++) expect(limits.reserveFailure("1.1.1.1", "ash@example.com")).toBeNull();
    expect(limits.reserveFailure("1.1.1.1", "ash@example.com")).toBe(600);
  });

  it("pasados 10 minutos se puede volver a intentar", () => {
    const { limits, advance } = setup();
    for (let i = 0; i < 5; i++) limits.reserveFailure("1.1.1.1", "ash@example.com");
    advance(10 * MINUTE);
    expect(limits.reserveFailure("1.1.1.1", "ash@example.com")).toBeNull();
  });

  it("cuenta igual con un correo que no existe: no hay forma de distinguirlo por el límite", () => {
    const { limits } = setup();
    for (let i = 0; i < 5; i++) limits.reserveFailure("1.1.1.1", "nadie@example.com");
    expect(limits.reserveFailure("1.1.1.1", "nadie@example.com")).toBe(600);
  });

  it("20 fallos por hora desde una IP, aunque sean a correos distintos", () => {
    const { limits } = setup();
    for (let i = 0; i < 20; i++) expect(limits.reserveFailure("1.1.1.1", `persona${i}@example.com`)).toBeNull();
    expect(limits.reserveFailure("1.1.1.1", "otra@example.com")).toBe(3600);
    expect(limits.reserveFailure("2.2.2.2", "otra@example.com")).toBeNull();
  });

  it("acertar reinicia la cuenta del correo y devuelve el hueco de la IP", () => {
    const { limits } = setup();
    for (let i = 0; i < 4; i++) limits.reserveFailure("1.1.1.1", "ash@example.com");
    limits.reserveFailure("1.1.1.1", "ash@example.com"); // el intento que acierta también se reserva antes
    limits.forgiveFailure("1.1.1.1", "ash@example.com");
    for (let i = 0; i < 5; i++) expect(limits.reserveFailure("1.1.1.1", "ash@example.com")).toBeNull();
  });

  it("un fallo nuestro (no de quien escribe el código) se devuelve y no cuenta", () => {
    const { limits } = setup();
    for (let i = 0; i < 5; i++) {
      expect(limits.reserveFailure("1.1.1.1", "ash@example.com")).toBeNull();
      limits.releaseFailure("1.1.1.1", "ash@example.com");
    }
    expect(limits.reserveFailure("1.1.1.1", "ash@example.com")).toBeNull();
  });
});

describe("sin límites (desarrollo y pruebas)", () => {
  it("nada se reserva ni se rechaza", () => {
    const limits = createCodeLimits(undefined);
    for (let i = 0; i < 100; i++) {
      expect(limits.reserveSend("1.1.1.1", "ash@example.com")).toBeNull();
      expect(limits.reserveFailure("1.1.1.1", "ash@example.com")).toBeNull();
    }
    expect(() => limits.releaseSend("1.1.1.1", "ash@example.com")).not.toThrow();
    expect(() => limits.forgiveFailure("1.1.1.1", "ash@example.com")).not.toThrow();
    expect(() => limits.releaseFailure("1.1.1.1", "ash@example.com")).not.toThrow();
  });
});
