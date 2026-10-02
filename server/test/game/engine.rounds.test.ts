import { describe, expect, it } from "vitest";
import { PokemonCatalog } from "../../src/catalog/pokemon-catalog.js";
import { totalStats } from "../../src/catalog/snapshot.js";
import { fixtureCatalogPokemon, statsFor } from "../helpers/fixtures.js";
import { Harness, START_TIME } from "./harness.js";

const T0 = START_TIME + 5000; // la ronda 1 empieza al terminar la cuenta atrás

/** Partida aleatoria en la ronda 1 con el par volador/fuego (Alfa 500, Beto 400, Gama 300). */
function round1(rng: number[] = [0]): Harness {
  const h = new Harness({ rng });
  h.startGame();
  return h;
}

describe("motor: rondas (modo aleatorio)", () => {
  it("anuncia la ronda con el par ordenado y un plazo de 15 segundos", () => {
    const h = round1();
    expect(h.last("round-started")).toEqual({
      serverNow: T0,
      round: 1,
      type1: "flying",
      type2: "fire",
      deadline: T0 + 15_000,
    });
    expect(h.pending).toContainEqual({ at: T0 + 15_000, timer: { kind: "round", round: 1 } });
  });

  it("confirma la recepción solo a quien respondió, sin decir si acertó", () => {
    const h = round1();
    h.submit(1, "Alfa");
    expect(h.payloads("answer-received", 1)).toEqual([{ round: 1 }]);
    expect(h.emitted.filter((e) => e.event.name === "answer-received").every((e) => e.to === 1)).toBe(true);
    expect(h.state.phase).toBe("round_active");
  });

  it("cuando ambos responden cierra la ronda de inmediato y suma los stats", () => {
    const h = round1();
    h.advance(1000);
    h.submit(1, "Alfa");
    h.advance(1000);
    h.submit(2, "Beto");

    expect(h.state.phase).toBe("round_result");
    const result = h.last("round-result")!;
    expect(result).toMatchObject({ round: 1, type1: "flying", type2: "fire" });
    expect(result.results[1]).toMatchObject({ result: "VALID", text: "Alfa", totalStats: 500, teamSize: 1 });
    expect(result.results[1].pokemon).toMatchObject({ id: 1, totalStats: 500 });
    expect(result.results[2]).toMatchObject({ result: "VALID", text: "Beto", totalStats: 400, teamSize: 1 });

    expect(h.state.players[1]?.team).toEqual([1]);
    expect(h.state.players[2]?.team).toEqual([2]);
    expect([...h.state.owners]).toEqual([[1, 1], [2, 2]]);
  });

  it("el resultado indica cuándo empieza la siguiente ronda (6 s después de cerrar)", () => {
    const h = round1();
    h.advance(2000);
    h.submit(1, "Alfa");
    h.submit(2, "Beto");
    expect(h.last("round-result")!.nextRoundAt).toBe(T0 + 2000 + 6000);
    h.advance(6000);
    expect(h.last("round-started")).toMatchObject({ round: 2, serverNow: T0 + 2000 + 6000 });
  });

  it("guarda la ronda con las respuestas de ambos y su timestamp de servidor", () => {
    const h = round1();
    h.advance(1000);
    h.submit(1, "Alfa");
    h.advance(2000);
    h.submit(2, "Pikachu");

    const [record] = h.effectsOfKind("persist_round").map((e) => e.record);
    expect(record).toEqual({
      number: 1,
      pair: ["flying", "fire"],
      picks: [
        { seat: 1, userId: "u1", text: "Alfa", result: "VALID", pokemonId: 1, submittedAt: T0 + 1000 },
        { seat: 2, userId: "u2", text: "Pikachu", result: "NOT_FOUND", pokemonId: null, submittedAt: T0 + 3000 },
      ],
    });
  });

  it("al vencer los 15 segundos cierra la ronda y marca NO_ANSWER a quien no respondió", () => {
    const h = round1();
    h.submit(1, "Alfa");
    h.advance(14_999);
    expect(h.state.phase).toBe("round_active");
    h.advance(1);

    expect(h.state.phase).toBe("round_result");
    const result = h.last("round-result")!;
    expect(result.results[1].result).toBe("VALID");
    expect(result.results[2]).toMatchObject({ result: "NO_ANSWER", text: null, pokemon: null, totalStats: 0, teamSize: 0 });
    const record = h.effectsOfKind("persist_round")[0]!.record;
    expect(record.picks[1]).toMatchObject({ seat: 2, text: null, result: "NO_ANSWER", submittedAt: null });
  });

  it("clasifica cada respuesta: no existe, tipos incorrectos, etc.", () => {
    const h = round1();
    h.submit(1, "Delta"); // agua/tierra: no tiene los tipos del par
    h.submit(2, "Iota"); // solo fuego
    const result = h.last("round-result")!;
    expect(result.results[1].result).toBe("WRONG_TYPES");
    expect(result.results[2].result).toBe("WRONG_TYPES");
    expect(result.results[1].pokemon).toBeNull();
  });

  describe("carrera por el mismo Pokémon", () => {
    it("gana quien respondió antes; el otro recibe TAKEN", () => {
      const h = round1();
      h.advance(1000);
      h.submit(2, "Alpha");
      h.advance(1000);
      h.submit(1, "Alfa");
      const result = h.last("round-result")!;
      expect(result.results[2].result).toBe("VALID");
      expect(result.results[1].result).toBe("TAKEN");
      expect(h.state.players[2]?.team).toEqual([1]);
      expect(h.state.players[1]?.team).toEqual([]);
    });

    it("si llegan con menos de 500 ms de diferencia decide el azar", () => {
      const h = round1([0, 1]); // 0: par volador/fuego; 1: gana el asiento 2
      h.submit(1, "Alfa");
      h.advance(100);
      h.submit(2, "Alfa");
      const result = h.last("round-result")!;
      expect(result.results[2].result).toBe("VALID");
      expect(result.results[1].result).toBe("TAKEN");
    });
  });

  it("el temporizador de la ronda anterior no cierra la ronda siguiente antes de tiempo", () => {
    const h = round1([0, 1]);
    h.advance(1000);
    h.submit(1, "Alfa");
    h.submit(2, "Beto"); // la ronda 1 cierra en T0 + 1 s; su temporizador original sigue pendiente (T0 + 15 s)
    h.advance(6000); // empieza la ronda 2 en T0 + 7 s, con plazo T0 + 22 s
    expect(h.state.round?.number).toBe(2);

    h.advance(9000); // T0 + 16 s: el temporizador de la ronda 1 venció y debe ignorarse
    expect(h.state.phase).toBe("round_active");
    expect(h.state.round?.number).toBe(2);
    expect(h.payloads("round-result")).toHaveLength(1);

    h.advance(6000); // T0 + 22 s: ahora sí vence la ronda 2
    expect(h.payloads("round-result")).toHaveLength(2);
  });

  describe("respuestas rechazadas", () => {
    it("ALREADY_ANSWERED si se responde dos veces; la primera respuesta se conserva", () => {
      const h = round1();
      h.submit(1, "Alfa");
      h.submit(1, "Beto");
      expect(h.errorCodes(1)).toEqual(["ALREADY_ANSWERED"]);
      expect(h.state.round?.picks[1]?.text).toBe("Alfa");
    });

    it("WRONG_PHASE fuera de una ronda activa: antes de empezar y durante la pausa del resultado", () => {
      const h = new Harness({ rng: [0] });
      h.submit(1, "Alfa");
      expect(h.errorCodes(1)).toEqual(["WRONG_PHASE"]);

      h.startGame();
      h.submit(1, "Alfa");
      h.submit(2, "Beto");
      h.submit(1, "Gama"); // la ronda ya cerró
      expect(h.errorCodes(1)).toEqual(["WRONG_PHASE", "WRONG_PHASE"]);
    });

    it("WRONG_PHASE si la respuesta llega después del plazo aunque el temporizador aún no se haya procesado", () => {
      const h = round1();
      h.now = T0 + 15_001;
      h.submit(1, "Alfa");
      expect(h.errorCodes(1)).toEqual(["WRONG_PHASE"]);
      expect(h.state.round?.picks[1]).toBeUndefined();
    });
  });

  describe("siguiente ronda", () => {
    it("tras 6 segundos de pausa arranca sola, sin los pares que ya no son jugables", () => {
      // Ronda 1: par volador/fuego (índice 0). Se reclaman Alfa y Beto, así que solo queda
      // Gama y ese par deja de ser jugable. Ronda 2: entre [veneno/planta, tierra/agua] el índice 1.
      const h = round1([0, 1]);
      h.submit(1, "Alfa");
      h.submit(2, "Beto");
      expect(h.state.phase).toBe("round_result");
      expect(h.pending).toContainEqual({ at: T0 + 6000, timer: { kind: "result", round: 1 } });

      h.advance(5999);
      expect(h.payloads("round-started")).toHaveLength(1);
      h.advance(1);
      expect(h.payloads("round-started")).toHaveLength(2);
      expect(h.last("round-started")).toMatchObject({ round: 2, type1: "ground", type2: "water" });
      expect(h.state.phase).toBe("round_active");
    });

    it("un Pokémon que ya tiene el rival da TAKEN y uno que ya tienes da ALREADY_OWNED", () => {
      // Catálogo con 5 Pokémon volador/fuego: tras reclamar 2 en la ronda 1 el par sigue jugable.
      const extra = (id: number, es: string, en: string, total: number) => {
        const stats = statsFor(total);
        return { id, names: { es, en }, spriteUrl: "u", types: ["fire", "flying"] as ("fire" | "flying")[], stats, totalStats: totalStats(stats) };
      };
      const catalog = new PokemonCatalog([...fixtureCatalogPokemon(), extra(11, "Lambda", "Lambda", 100), extra(12, "Mu", "Mu", 110)]);
      const h = new Harness({ rng: [0, 0], catalog }); // ambas rondas: primer par jugable (volador/fuego)
      h.startGame();
      h.submit(1, "Alfa");
      h.submit(2, "Beto");
      h.advance(6000);
      expect(h.last("round-started")).toMatchObject({ round: 2, type1: "flying", type2: "fire" });

      h.submit(1, "Beto"); // lo tiene el asiento 2
      h.submit(2, "Beto"); // lo tiene él mismo
      const result = h.last("round-result")!;
      expect(result.results[1].result).toBe("TAKEN");
      expect(result.results[2].result).toBe("ALREADY_OWNED");
      expect(h.state.players[1]?.team).toEqual([1]);
      expect(h.state.players[2]?.team).toEqual([2]);
    });
  });
});
