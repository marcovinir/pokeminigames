import { describe, expect, it } from "vitest";
import { rivalSeat } from "../../src/game/seats";

describe("rivalSeat", () => {
  it("el rival del asiento 1 es el 2, y al revés", () => {
    expect(rivalSeat(1)).toBe(2);
    expect(rivalSeat(2)).toBe(1);
  });
});
