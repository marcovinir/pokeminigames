import type { GameResult } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import {
  type FinishedGame,
  buildStats,
  computeAveragePower,
  computeRecord,
  computeTopPokemon,
  resultFor,
  sortRecentFirst,
} from "../../src/stats/calculate.js";
import { fixtureCatalog } from "../helpers/fixtures.js";

const catalog = fixtureCatalog();
const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 8, 1);

/** Partidas en orden cronológico (la primera es la más antigua); cada una termina un día después. */
function history(...results: GameResult[]): FinishedGame[] {
  return results.map((result, i) => ({ id: `g${i}`, endedAt: new Date(T0 + i * DAY), result, score: 100 * (i + 1) }));
}

const W = "won";
const D = "drawn";
const L = "lost";

describe("resultFor", () => {
  it("compara el ganador con la persona: ganó, empató (sin ganador) o perdió", () => {
    expect(resultFor("u1", "u1")).toBe("won");
    expect(resultFor(null, "u1")).toBe("drawn");
    expect(resultFor("u2", "u1")).toBe("lost");
  });
});

describe("sortRecentFirst", () => {
  it("ordena por fecha de fin descendente y, a igual fecha, por id descendente", () => {
    const same = new Date(T0);
    const games = [
      { id: "a", endedAt: same },
      { id: "c", endedAt: new Date(T0 - DAY) },
      { id: "b", endedAt: same },
      { id: "d", endedAt: new Date(T0 + DAY) },
    ];
    expect(sortRecentFirst(games).map((g) => g.id)).toEqual(["d", "b", "a", "c"]);
  });

  it("no modifica la lista original", () => {
    const games = history(W, L);
    sortRecentFirst(games);
    expect(games.map((g) => g.id)).toEqual(["g0", "g1"]);
  });
});

describe("computeRecord", () => {
  it("sin partidas: todo en cero y sin porcentaje ni mejor partida", () => {
    expect(computeRecord([])).toEqual({
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      winRate: null,
      currentStreak: 0,
      bestStreak: 0,
      bestGameScore: null,
    });
  });

  it("cuenta ganadas, empatadas y perdidas; los empates cuentan como jugadas en el porcentaje", () => {
    const record = computeRecord(history(W, W, D, L));
    expect(record).toMatchObject({ played: 4, wins: 2, draws: 1, losses: 1, winRate: 0.5 });
  });

  it.each([
    ["una victoria sola", [W], 1, 1],
    ["varias victorias seguidas", [L, W, W, W], 3, 3],
    ["una derrota reciente corta la racha actual pero no la mejor", [W, W, W, L], 0, 3],
    ["un empate reciente también corta la racha", [W, W, W, D], 0, 3],
    ["un empate en medio parte la racha en dos", [W, W, D, W], 1, 2],
    ["la mejor racha puede ser anterior a la actual", [W, W, W, L, W], 1, 3],
    ["sin victorias no hay racha", [L, D, L], 0, 0],
  ] as [string, GameResult[], number, number][])("racha: %s", (_name, results, current, best) => {
    const record = computeRecord(history(...results));
    expect({ current: record.currentStreak, best: record.bestStreak }).toEqual({ current, best });
  });

  it("no depende del orden en que llegan las partidas", () => {
    const games = history(W, W, D, W);
    expect(computeRecord([...games].reverse())).toEqual(computeRecord(games));
  });

  it("con la misma fecha de fin, la partida de id mayor es la más reciente", () => {
    const at = new Date(T0);
    const lostLast: FinishedGame[] = [
      { id: "a", endedAt: at, result: "won", score: 1 },
      { id: "b", endedAt: at, result: "lost", score: 1 },
    ];
    const wonLast: FinishedGame[] = [
      { id: "a", endedAt: at, result: "lost", score: 1 },
      { id: "b", endedAt: at, result: "won", score: 1 },
    ];
    expect(computeRecord(lostLast).currentStreak).toBe(0);
    expect(computeRecord(wonLast).currentStreak).toBe(1);
  });

  it("la mejor partida es el mayor puntaje; ignora los puntajes que no se guardaron", () => {
    const games = history(W, L, W);
    games[1]!.score = null;
    expect(computeRecord(games).bestGameScore).toBe(300);
    expect(computeRecord(games.map((g) => ({ ...g, score: null }))).bestGameScore).toBeNull();
  });
});

describe("computeTopPokemon", () => {
  it("devuelve los 3 más ganados con sus veces, del que más al que menos", () => {
    const top = computeTopPokemon([2, 2, 2, 6, 6, 1, 1, 1, 1, 3], catalog);
    expect(top.map((t) => [t.pokemon.id, t.wins])).toEqual([
      [1, 4],
      [2, 3],
      [6, 2],
    ]);
  });

  it("a igual cantidad gana el de id más bajo, para que el resultado sea siempre el mismo", () => {
    const top = computeTopPokemon([6, 6, 2, 2, 1, 1, 3, 3], catalog);
    expect(top.map((t) => t.pokemon.id)).toEqual([1, 2, 3]);
  });

  it("incluye los datos completos del Pokémon para poder mostrarlo", () => {
    const [first] = computeTopPokemon([1], catalog);
    expect(first).toEqual({
      wins: 1,
      pokemon: {
        id: 1,
        names: { es: "Alfa", en: "Alpha" },
        spriteUrl: "https://example.com/1.png",
        types: ["fire", "flying"],
        stats: expect.objectContaining({ hp: expect.any(Number) }),
        totalStats: 500,
      },
    });
  });

  it("sin Pokémon ganados, o solo ids que ya no existen en el catálogo, la lista está vacía", () => {
    expect(computeTopPokemon([], catalog)).toEqual([]);
    expect(computeTopPokemon([999, 999], catalog)).toEqual([]);
  });

  it("respeta el límite pedido", () => {
    expect(computeTopPokemon([1, 2, 3, 4], catalog, 2)).toHaveLength(2);
  });
});

describe("computeAveragePower", () => {
  it("promedia el total_stats de cada Pokémon ganado, contando las repeticiones", () => {
    expect(computeAveragePower([1, 2], catalog)).toBe(450);
    expect(computeAveragePower([1, 1, 2], catalog)).toBe(466.7);
  });

  it("sin Pokémon ganados no hay promedio", () => {
    expect(computeAveragePower([], catalog)).toBeNull();
    expect(computeAveragePower([999], catalog)).toBeNull();
  });

  it("ignora los ids que no están en el catálogo", () => {
    expect(computeAveragePower([1, 999], catalog)).toBe(500);
  });
});

describe("buildStats", () => {
  it("junta el récord, el top y el promedio", () => {
    const stats = buildStats(history(W, W, L), [1, 1, 6], catalog);
    expect(stats).toMatchObject({
      played: 3,
      wins: 2,
      losses: 1,
      currentStreak: 0,
      bestStreak: 2,
      bestGameScore: 300,
      averagePower: 533.3,
    });
    expect(stats.topPokemon.map((t) => [t.pokemon.id, t.wins])).toEqual([
      [1, 2],
      [6, 1],
    ]);
  });

  it("una persona sin partidas tiene ceros, nulos y listas vacías", () => {
    expect(buildStats([], [], catalog)).toEqual({
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      winRate: null,
      currentStreak: 0,
      bestStreak: 0,
      averagePower: null,
      bestGameScore: null,
      topPokemon: [],
    });
  });
});
