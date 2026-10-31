import { describe, expect, it } from "vitest";
import { createRoomSchema } from "../../src/rooms/rooms.schemas.js";

const messages = (body: unknown): string[] => {
  const result = createRoomSchema.safeParse(body);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe("createRoomSchema", () => {
  it("todavía no acepta salas de subasta", () => {
    expect(createRoomSchema.safeParse({ game: "subasta", traps: true }).success).toBe(false);
  });

  it("un cuerpo sin juego sigue validando como hoy y sale como «Doble tipo»", () => {
    expect(createRoomSchema.parse({ typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3 })).toEqual({
      typeMode: "random",
      lengthMode: "fixed_rounds",
      roundsLimit: 3,
      statsGoal: null,
      typeHints: false,
    });
    expect(createRoomSchema.parse({ game: "doble_tipo", typeMode: "chosen", lengthMode: "fixed_rounds", roundsLimit: 5 })).toMatchObject({
      typeMode: "chosen",
      roundsLimit: 5,
    });
  });

  it("la silueta sale con 10 rondas y Kanto por defecto", () => {
    expect(createRoomSchema.parse({ game: "silueta" })).toEqual({ game: "silueta", rounds: 10, generations: [1] });
    expect(createRoomSchema.parse({ game: "silueta", rounds: 15, generations: [3, 1] })).toEqual({ game: "silueta", rounds: 15, generations: [1, 3] });
  });

  it("rechaza rondas que no son 5, 10 o 15", () => {
    expect(createRoomSchema.safeParse({ game: "silueta", rounds: 7 }).success).toBe(false);
  });

  it("exige al menos una generación, sin repetir y de la 1 a la 9", () => {
    expect(messages({ game: "silueta", generations: [] })).toContain("Elige al menos una generación");
    expect(createRoomSchema.safeParse({ game: "silueta", generations: [1, 1] }).success).toBe(false);
    expect(createRoomSchema.safeParse({ game: "silueta", generations: [10] }).success).toBe(false);
  });

  it("no mezcla las formas de los dos juegos", () => {
    expect(createRoomSchema.safeParse({ game: "silueta", typeMode: "random" }).success).toBe(false);
    expect(createRoomSchema.safeParse({ game: "doble_tipo", rounds: 10 }).success).toBe(false);
    expect(createRoomSchema.safeParse({ game: "otro" }).success).toBe(false);
  });
});
