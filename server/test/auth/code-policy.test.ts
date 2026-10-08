import { describe, expect, it } from "vitest";
import { CODE_LENGTH, CODE_TTL_MINUTES, CODE_TTL_MS, MAX_CODE_ATTEMPTS, PENDING_ACCOUNT_TTL_MS } from "../../src/auth/code-policy.js";

describe("la política de los códigos", () => {
  it("es la de la spec: 6 dígitos, 10 minutos, 5 intentos y 24 horas para las cuentas pendientes", () => {
    expect(CODE_LENGTH).toBe(6);
    expect(CODE_TTL_MINUTES).toBe(10);
    expect(CODE_TTL_MS).toBe(10 * 60 * 1000);
    expect(MAX_CODE_ATTEMPTS).toBe(5);
    expect(PENDING_ACCOUNT_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});
