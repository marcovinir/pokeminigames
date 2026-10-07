import { describe, expect, it } from "vitest";
import { rateLimitMessage, retryAfterOf } from "../../src/i18n/es";

describe("rateLimitMessage", () => {
  it.each([
    [1, "Demasiados intentos. Inténtalo de nuevo en 1 s."],
    [45, "Demasiados intentos. Inténtalo de nuevo en 45 s."],
    [59, "Demasiados intentos. Inténtalo de nuevo en 59 s."],
    [60, "Demasiados intentos. Inténtalo de nuevo en 1 min."],
    [61, "Demasiados intentos. Inténtalo de nuevo en 2 min."],
    [900, "Demasiados intentos. Inténtalo de nuevo en 15 min."],
    [3600, "Demasiados intentos. Inténtalo de nuevo en 60 min."],
  ])("con %s segundos de espera dice: %s", (seconds, expected) => {
    expect(rateLimitMessage(seconds)).toBe(expected);
  });

  it.each([undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY])("sin una espera usable (%s) no inventa un número", (value) => {
    expect(rateLimitMessage(value)).toBe("Demasiados intentos. Inténtalo de nuevo más tarde.");
  });
});

describe("retryAfterOf", () => {
  it("lee la espera de los detalles del error", () => {
    expect(retryAfterOf({ retryAfterSeconds: 42 })).toBe(42);
  });

  it.each([undefined, null, "texto", 7, [], {}, { retryAfterSeconds: "42" }, { retryAfterSeconds: null }])(
    "ignora detalles que no traen un número (%j)",
    (details) => {
      expect(retryAfterOf(details)).toBeUndefined();
    },
  );
});
