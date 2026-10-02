import type { RoomConfig } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import { PokemonCatalog } from "../../src/catalog/pokemon-catalog.js";
import { fixtureCatalogPokemon } from "../helpers/fixtures.js";
import { Harness, RANDOM_3 } from "./harness.js";

const custom = (overrides: Partial<RoomConfig>): RoomConfig => ({
  typeMode: "random",
  lengthMode: "custom",
  roundsLimit: null,
  statsGoal: null,
  ...overrides,
});

/**
 * Las rondas siguen el orden de los pares: con el rng [0, 1, 0] la ronda 1 es volador/fuego,
 * la 2 tierra/agua (índice 1 de [veneno/planta, tierra/agua]) y la 3 veneno/planta.
 * Totales de cada Pokémon: Alfa 500, Beto 400, Delta 450, Épsilon 350, Zeta 600, Eta 200.
 */
function playRound(h: Harness, a: string, b: string): void {
  h.submit(1, a);
  h.submit(2, b);
  h.advance(6000);
}

describe("motor: fin de la partida", () => {
  it("rondas fijas: se juegan todas y gana quien suma más stats", () => {
    const h = new Harness({ config: RANDOM_3, rng: [0, 1, 0] });
    h.startGame();
    playRound(h, "Alfa", "Beto"); // 500 - 400
    playRound(h, "Delta", "Épsilon"); // 450 - 350  → 950 - 750
    expect(h.state.phase).toBe("round_active");
    h.submit(1, "Eta"); // 200
    h.submit(2, "Zeta"); // 600 → 1150 - 1350

    expect(h.state.phase).toBe("finished");
    const ended = h.last("game-ended")!;
    expect(ended).toMatchObject({ winnerSeat: 2, reason: "completed", totals: { 1: 1150, 2: 1350 } });
    expect(ended.teams[1].map((p) => p.id)).toEqual([1, 4, 7]);
    expect(ended.teams[2].map((p) => p.id)).toEqual([2, 5, 6]);

    const end = h.effectsOfKind("persist_end")[0]!;
    expect(end).toMatchObject({ status: "completed", outcome: { winnerSeat: 2, reason: "completed" }, finalStats: { 1: 1150, 2: 1350 } });
    expect(h.effectsOfKind("persist_round")).toHaveLength(3);
  });

  it("el resultado de la última ronda no anuncia una siguiente (nextRoundAt nulo)", () => {
    const h = new Harness({ config: RANDOM_3, rng: [0, 1, 0] });
    h.startGame();
    playRound(h, "Alfa", "Beto");
    expect(h.last("round-result")!.nextRoundAt).not.toBeNull();
    playRound(h, "Delta", "Épsilon");
    h.submit(1, "Eta");
    h.submit(2, "Zeta");
    expect(h.last("round-result")!.nextRoundAt).toBeNull();
  });

  it("al terminar no programa más rondas y el resultado de la última sale antes del fin", () => {
    const h = new Harness({ config: RANDOM_3, rng: [0, 1, 0] });
    h.startGame();
    playRound(h, "Alfa", "Beto");
    playRound(h, "Delta", "Épsilon");
    h.submit(1, "Eta");
    h.submit(2, "Zeta");
    const names = h.emitted.map((e) => e.event.name);
    expect(names.lastIndexOf("round-result")).toBeLessThan(names.lastIndexOf("game-ended"));
    expect(h.pending.filter((p) => p.timer.kind === "result" && p.timer.round === 3)).toEqual([]);
    const before = h.payloads("round-started").length;
    h.advance(60_000);
    expect(h.payloads("round-started")).toHaveLength(before);
  });

  it("personalizada por rondas: termina al jugarse el máximo; el empate no tiene ganador", () => {
    const h = new Harness({ config: custom({ roundsLimit: 2 }), rng: [0, 1] });
    h.startGame();
    playRound(h, "Alfa", "Beto"); // 500 - 400
    h.submit(1, "Épsilon"); // 350
    h.submit(2, "Delta"); // 450 → 850 - 850

    expect(h.state.phase).toBe("finished");
    expect(h.last("game-ended")).toMatchObject({ winnerSeat: null, reason: "completed", totals: { 1: 850, 2: 850 } });
    expect(h.effectsOfKind("persist_end")[0]).toMatchObject({ status: "completed", outcome: { winnerSeat: null } });
  });

  describe("personalizada por meta de stats", () => {
    it("termina al final de la ronda en que alguien alcanza la meta", () => {
      const h = new Harness({ config: custom({ statsGoal: 800 }), rng: [0, 1] });
      h.startGame();
      playRound(h, "Alfa", "Beto"); // 500 - 400: nadie llega a 800
      expect(h.state.phase).toBe("round_active");
      h.submit(1, "Delta"); // 950
      h.submit(2, "Épsilon"); // 750

      expect(h.state.phase).toBe("finished");
      expect(h.last("game-ended")).toMatchObject({ winnerSeat: 1, reason: "completed", totals: { 1: 950, 2: 750 } });
    });

    it("si ambos alcanzan la meta en la misma ronda gana quien tiene más", () => {
      const h = new Harness({ config: custom({ statsGoal: 700 }), rng: [0, 1] });
      h.startGame();
      playRound(h, "Alfa", "Beto");
      h.submit(1, "Delta"); // 950
      h.submit(2, "Épsilon"); // 750: también supera 700

      expect(h.last("game-ended")).toMatchObject({ winnerSeat: 1, totals: { 1: 950, 2: 750 } });
    });

    it("alcanzar la meta a mitad de ronda no corta la ronda: se espera al cierre", () => {
      const h = new Harness({ config: custom({ statsGoal: 500 }), rng: [0] });
      h.startGame();
      h.submit(1, "Alfa"); // ya llega a 500 pero el otro aún no respondió
      expect(h.state.phase).toBe("round_active");
      h.submit(2, "Beto");
      expect(h.state.phase).toBe("finished");
    });
  });

  describe("pares agotados", () => {
    it("si tras una ronda ya no queda ningún par jugable, la partida termina con los totales actuales", () => {
      // Solo el par volador/fuego, con 3 Pokémon: al reclamar 2 queda 1 y deja de ser jugable.
      const catalog = new PokemonCatalog(fixtureCatalogPokemon().filter((p) => p.id <= 3));
      const h = new Harness({ config: RANDOM_3, rng: [0], catalog });
      h.startGame();
      h.submit(1, "Alfa");
      h.submit(2, "Beto");
      h.advance(6000);

      expect(h.state.phase).toBe("finished");
      expect(h.last("game-ended")).toMatchObject({ winnerSeat: 1, reason: "exhausted", totals: { 1: 500, 2: 400 } });
      expect(h.effectsOfKind("persist_end")[0]).toMatchObject({ status: "completed", outcome: { reason: "exhausted" } });
    });

    it("si no hay ningún par jugable desde el principio, termina empatada en la primera ronda", () => {
      const singleTypes = new PokemonCatalog(fixtureCatalogPokemon().filter((p) => p.types.length === 1));
      const h = new Harness({ config: RANDOM_3, catalog: singleTypes });
      h.startGame();
      expect(h.state.phase).toBe("finished");
      expect(h.last("game-ended")).toMatchObject({ winnerSeat: null, reason: "exhausted", totals: { 1: 0, 2: 0 } });
      expect(h.payloads("round-started")).toHaveLength(0);
    });
  });
});
