import type { Seat } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import { PokemonCatalog } from "../../src/catalog/pokemon-catalog.js";
import { type ResolveInput, pickExample, resolveRound } from "../../src/game/engine/resolve.js";
import type { PickState } from "../../src/game/engine/types.js";
import { fixtureCatalog } from "../helpers/fixtures.js";
import { sequenceRng } from "../helpers/rng.js";

const catalog = fixtureCatalog();
// Par volador/fuego: Alfa (1), Beto (2) y Gama (3).
const pair = PokemonCatalog.orderPair("fire", "flying");
const WINDOW = 500;

function resolve(
  picks: Partial<Record<Seat, PickState>>,
  extra: Partial<ResolveInput> = {},
) {
  return resolveRound({ pair, picks, owners: new Map(), catalog, rng: sequenceRng(), windowMs: WINDOW, ...extra });
}

const pick = (text: string, at = 1000): PickState => ({ text, at });

describe("pickExample", () => {
  it("sortea entre los Pokémon del par que nadie tiene, con el generador inyectado", () => {
    expect(pickExample(catalog, pair, new Set(), sequenceRng([0]))?.id).toBe(1);
    expect(pickExample(catalog, pair, new Set(), sequenceRng([2]))?.id).toBe(3);
    // Con Alfa reclamado, el índice 1 de los libres [2, 3] es Gama.
    expect(pickExample(catalog, pair, new Set([1]), sequenceRng([1]))?.id).toBe(3);
  });

  it("nunca devuelve uno reclamado", () => {
    for (let value = 0; value < 6; value++) {
      expect(pickExample(catalog, pair, new Set([1, 3]), sequenceRng([value]))?.id).toBe(2);
    }
  });

  it("sin Pokémon libres devuelve null y no gasta azar", () => {
    const rng = sequenceRng([0]);
    expect(pickExample(catalog, pair, new Set([1, 2, 3]), rng)).toBeNull();
    expect(rng.calls).toBe(0);
  });
});

describe("resolveRound", () => {
  it("acepta dos Pokémon válidos distintos", () => {
    const out = resolve({ 1: pick("Alfa"), 2: pick("Beto") });
    expect(out[1]).toEqual({ result: "VALID", pokemonId: 1 });
    expect(out[2]).toEqual({ result: "VALID", pokemonId: 2 });
  });

  it("acepta el nombre en español o en inglés, con tildes y mayúsculas indistintas", () => {
    const out = resolve({ 1: pick("  ALPHA "), 2: pick("bèto") });
    expect(out[1].pokemonId).toBe(1);
    expect(out[2].pokemonId).toBe(2);
  });

  it("NO_ANSWER cuando un jugador no respondió", () => {
    const out = resolve({ 1: pick("Alfa") });
    expect(out[1].result).toBe("VALID");
    expect(out[2]).toEqual({ result: "NO_ANSWER", pokemonId: null });
    expect(resolve({})[1].result).toBe("NO_ANSWER");
  });

  it("NOT_FOUND para un nombre que no existe, vacío o solo signos", () => {
    const out = resolve({ 1: pick("Pikachu"), 2: pick("   ") });
    expect(out[1].result).toBe("NOT_FOUND");
    expect(out[2].result).toBe("NOT_FOUND");
  });

  it("WRONG_TYPES si no tiene ambos tipos, aunque tenga uno de ellos", () => {
    const out = resolve({ 1: pick("Delta"), 2: pick("Iota") }); // agua/tierra y solo fuego
    expect(out[1]).toEqual({ result: "WRONG_TYPES", pokemonId: null });
    expect(out[2]).toEqual({ result: "WRONG_TYPES", pokemonId: null });
  });

  it("ALREADY_OWNED si ya está en tu propio equipo", () => {
    const out = resolve({ 1: pick("Alfa"), 2: pick("Beto") }, { owners: new Map([[1, 1 as Seat]]) });
    expect(out[1]).toEqual({ result: "ALREADY_OWNED", pokemonId: null });
    expect(out[2].result).toBe("VALID");
  });

  it("TAKEN si ya lo tiene el rival de una ronda anterior", () => {
    const out = resolve({ 1: pick("Alfa"), 2: pick("Beto") }, { owners: new Map([[1, 2 as Seat]]) });
    expect(out[1]).toEqual({ result: "TAKEN", pokemonId: null });
    expect(out[2].result).toBe("VALID");
  });

  describe("carrera por el mismo Pokémon", () => {
    it("gana quien respondió antes si la diferencia es de 500 ms o más", () => {
      const out = resolve({ 1: pick("Alfa", 1000), 2: pick("Alpha", 1500) });
      expect(out[1]).toEqual({ result: "VALID", pokemonId: 1 });
      expect(out[2]).toEqual({ result: "TAKEN", pokemonId: null });

      const reversed = resolve({ 1: pick("Alfa", 2000), 2: pick("Alfa", 1000) });
      expect(reversed[2].result).toBe("VALID");
      expect(reversed[1].result).toBe("TAKEN");
    });

    it("con menos de 500 ms de diferencia decide el azar, no el orden de llegada", () => {
      const seatOneWins = resolve({ 1: pick("Alfa", 1100), 2: pick("Alfa", 1000) }, { rng: sequenceRng([0]) });
      expect(seatOneWins[1].result).toBe("VALID");
      expect(seatOneWins[2].result).toBe("TAKEN");

      const seatTwoWins = resolve({ 1: pick("Alfa", 1000), 2: pick("Alfa", 1100) }, { rng: sequenceRng([1]) });
      expect(seatTwoWins[2].result).toBe("VALID");
      expect(seatTwoWins[1].result).toBe("TAKEN");
    });

    it("499 ms es simultáneo y 500 ms ya no lo es", () => {
      const simultaneous = resolve({ 1: pick("Alfa", 1000), 2: pick("Alfa", 1499) }, { rng: sequenceRng([1]) });
      expect(simultaneous[2].result).toBe("VALID"); // ganó el azar, aunque llegó después

      const notSimultaneous = resolve({ 1: pick("Alfa", 1000), 2: pick("Alfa", 1500) }, { rng: sequenceRng([1]) });
      expect(notSimultaneous[1].result).toBe("VALID"); // gana el más rápido; el azar no se usó
    });

    it("el mismo timestamp exacto también se decide por azar", () => {
      const out = resolve({ 1: pick("Alfa", 1000), 2: pick("Alfa", 1000) }, { rng: sequenceRng([1]) });
      expect(out[2].result).toBe("VALID");
    });

    it("no consume azar cuando no hay carrera", () => {
      const rng = sequenceRng([1]);
      resolve({ 1: pick("Alfa"), 2: pick("Beto") }, { rng });
      expect(rng.calls).toBe(0);
    });

    it("una respuesta inválida al mismo Pokémon no dispara la carrera", () => {
      // El jugador 2 escribe el nombre de Alfa pero Alfa ya es suyo: no compite.
      const out = resolve({ 1: pick("Alfa"), 2: pick("Alfa") }, { owners: new Map([[1, 2 as Seat]]) });
      expect(out[1].result).toBe("TAKEN");
      expect(out[2].result).toBe("ALREADY_OWNED");
    });
  });
});
