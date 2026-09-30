import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../../src/realtime/rate-limiter.js";

describe("createRateLimiter", () => {
  it("deja pasar hasta el límite dentro de la ventana y rechaza el resto", () => {
    let now = 0;
    const limiter = createRateLimiter(3, 1000, () => now);
    expect([limiter.allow(), limiter.allow(), limiter.allow(), limiter.allow(), limiter.allow()]).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it("la ventana se desliza: pasado el intervalo vuelve a aceptar", () => {
    let now = 0;
    const limiter = createRateLimiter(2, 1000, () => now);
    limiter.allow();
    now = 500;
    limiter.allow();
    now = 999;
    expect(limiter.allow()).toBe(false);
    now = 1000; // el primer evento ya salió de la ventana
    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(false);
  });

  it("los eventos rechazados no alargan el bloqueo", () => {
    let now = 0;
    const limiter = createRateLimiter(1, 1000, () => now);
    limiter.allow();
    for (now = 100; now < 1000; now += 100) expect(limiter.allow()).toBe(false);
    now = 1000;
    expect(limiter.allow()).toBe(true);
  });
});
