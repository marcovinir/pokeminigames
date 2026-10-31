import {
  GAME_KINDS,
  GAME_SLUGS,
  GENERATIONS,
  SILHOUETTE_DEFAULT_GENERATIONS,
  SILHOUETTE_DEFAULT_ROUNDS,
  SILHOUETTE_ROUNDS,
  type SilhouetteReveal,
  type ServerToClientEvents,
  gameFromSlug,
  gameOf,
  generationOf,
} from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";

describe("los juegos", () => {
  it("son tres, cada uno con su slug de ruta", () => {
    expect(GAME_KINDS).toEqual(["doble_tipo", "silueta", "subasta"]);
    expect(GAME_SLUGS).toEqual({ doble_tipo: "doble-tipo", silueta: "silueta", subasta: "subasta" });
    expect(gameFromSlug("silueta")).toBe("silueta");
    expect(gameFromSlug("doble-tipo")).toBe("doble_tipo");
    expect(gameFromSlug("xyz")).toBeNull();
  });

  it("una configuración sin juego es «Doble tipo»", () => {
    expect(gameOf({})).toBe("doble_tipo");
    expect(gameOf({ game: "doble_tipo" })).toBe("doble_tipo");
    expect(gameOf({ game: "silueta" })).toBe("silueta");
  });

  it("las 9 generaciones con sus rangos y regiones, contiguas de 1 a 1025", () => {
    expect(GENERATIONS.map((g) => [g.n, g.region, g.from, g.to])).toEqual([
      [1, "Kanto", 1, 151],
      [2, "Johto", 152, 251],
      [3, "Hoenn", 252, 386],
      [4, "Sinnoh", 387, 493],
      [5, "Teselia", 494, 649],
      [6, "Kalos", 650, 721],
      [7, "Alola", 722, 809],
      [8, "Galar", 810, 905],
      [9, "Paldea", 906, 1025],
    ]);
    expect(generationOf(1)).toBe(1);
    expect(generationOf(151)).toBe(1);
    expect(generationOf(152)).toBe(2);
    expect(generationOf(1025)).toBe(9);
    expect(generationOf(1026)).toBeNull();
    expect(generationOf(0)).toBeNull();
  });

  it("las opciones de la silueta: 5, 10 o 15 rondas (10 por defecto) y Kanto por defecto", () => {
    expect(SILHOUETTE_ROUNDS).toEqual([5, 10, 15]);
    expect(SILHOUETTE_DEFAULT_ROUNDS).toBe(10);
    expect(SILHOUETTE_DEFAULT_GENERATIONS).toEqual([1]);
  });

  it("los eventos de la silueta existen en el contrato con la carga acordada", () => {
    const reveal = { round: 1, pokemon: {} as SilhouetteReveal["pokemon"], answers: {} as SilhouetteReveal["answers"] };
    const toClient = {
      "silhouette-round-started": (payload: { serverNow: number; round: number; totalRounds: number; deadline: number; silhouetteUrl: string }) => void payload,
      "silhouette-answer-received": (payload: { ms: number }) => void payload,
      "silhouette-round-result": (payload: { serverNow: number; reveal: SilhouetteReveal; totals: Record<1 | 2, number>; nextRoundAt: number | null }) => void payload,
    } satisfies Partial<ServerToClientEvents>;
    expect(Object.keys(toClient)).toEqual(["silhouette-round-started", "silhouette-answer-received", "silhouette-round-result"]);
    expect(reveal.round).toBe(1);
  });
});
