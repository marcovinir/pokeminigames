import { describe, expect, it } from "vitest";
import { CHOSEN_3, Harness, START_TIME } from "./harness.js";

const T0 = START_TIME + 5000; // empieza la elección de tipos de la ronda 1

function chosenGame(rng: number[] = []): Harness {
  const h = new Harness({ config: CHOSEN_3, rng });
  h.startGame();
  return h;
}

describe("motor: elección de tipos (modo elegido)", () => {
  it("abre la elección de tipos con un plazo de 15 segundos, sin anunciar todavía el par", () => {
    const h = chosenGame();
    expect(h.state.phase).toBe("choosing_types");
    expect(h.last("choose-types")).toEqual({ round: 1, deadline: T0 + 15_000 });
    expect(h.payloads("round-started")).toHaveLength(0);
    expect(h.pending).toContainEqual({ at: T0 + 15_000, timer: { kind: "choose", round: 1 } });
  });

  it("con dos tipos distintos y jugables, el par sale ordenado y sin aviso", () => {
    const h = chosenGame();
    h.choose(1, "fire");
    expect(h.payloads("type-received", 1)).toEqual([{ round: 1 }]);
    expect(h.state.phase).toBe("choosing_types"); // falta el otro jugador
    h.advance(3000);
    h.choose(2, "flying");

    expect(h.state.phase).toBe("round_active");
    expect(h.last("round-started")).toEqual({ round: 1, type1: "flying", type2: "fire", deadline: T0 + 3000 + 15_000 });
  });

  it("el tipo elegido es secreto: el rival no recibe confirmación de tu elección", () => {
    const h = chosenGame();
    h.choose(1, "fire");
    expect(h.payloads("type-received", 2)).toEqual([]);
  });

  describe("elecciones rechazadas", () => {
    it("INVALID_TYPE para un tipo que no existe", () => {
      const h = chosenGame();
      h.choose(1, "banana");
      h.choose(1, "stellar");
      expect(h.errorCodes(1)).toEqual(["INVALID_TYPE", "INVALID_TYPE"]);
      expect(h.state.round?.typeChoices[1]).toBeUndefined();
    });

    it("ALREADY_CHOSEN si se elige dos veces; se conserva la primera", () => {
      const h = chosenGame();
      h.choose(1, "fire");
      h.choose(1, "water");
      expect(h.errorCodes(1)).toEqual(["ALREADY_CHOSEN"]);
      expect(h.state.round?.typeChoices[1]).toBe("fire");
    });

    it("WRONG_PHASE si se elige fuera de la fase de elección", () => {
      const h = new Harness({ config: CHOSEN_3 });
      h.choose(1, "fire"); // la partida aún no empezó
      expect(h.errorCodes(1)).toEqual(["WRONG_PHASE"]);

      h.startGame();
      h.choose(1, "fire");
      h.choose(2, "flying");
      h.choose(1, "water"); // la ronda ya está activa
      expect(h.errorCodes(1)).toEqual(["WRONG_PHASE", "WRONG_PHASE"]);
    });
  });

  describe("pares no válidos: el servidor sortea uno jugable y avisa", () => {
    it("los dos eligen el mismo tipo", () => {
      const h = chosenGame([1]); // entre [volador/fuego, veneno/planta, tierra/agua] el índice 1
      h.choose(1, "fire");
      h.choose(2, "fire");
      expect(h.last("round-started")).toMatchObject({ type1: "poison", type2: "grass", typesNotice: "pair_replaced" });
    });

    it("el par no tiene Pokémon de doble tipo jugables (acero/eléctrico solo tiene uno)", () => {
      const h = chosenGame([2]);
      h.choose(1, "steel");
      h.choose(2, "electric");
      expect(h.last("round-started")).toMatchObject({ type1: "ground", type2: "water", typesNotice: "pair_replaced" });
    });

    it("el par no existe en ningún Pokémon (hielo/siniestro)", () => {
      const h = chosenGame([0]);
      h.choose(1, "ice");
      h.choose(2, "dark");
      expect(h.last("round-started")).toMatchObject({ type1: "flying", type2: "fire", typesNotice: "pair_replaced" });
    });
  });

  describe("tiempo agotado", () => {
    it("a quien no elige se le sortea un tipo; si el par resulta válido no hay aviso", () => {
      const h = chosenGame([2]); // el tipo sorteado es TYPE_NAMES[2] = flying
      h.choose(1, "fire");
      h.advance(15_000);
      expect(h.state.round?.typeChoices[2]).toBe("flying");
      expect(h.last("round-started")).toMatchObject({ type1: "flying", type2: "fire", deadline: T0 + 15_000 + 15_000 });
      expect(h.last("round-started")).not.toHaveProperty("typesNotice");
    });

    it("si nadie elige se sortean los dos tipos", () => {
      const h = chosenGame([9, 2]); // fire y flying
      h.advance(15_000);
      expect(h.last("round-started")).toMatchObject({ type1: "flying", type2: "fire" });
      expect(h.payloads("round-started")[0]).not.toHaveProperty("typesNotice");
    });

    it("si los tipos sorteados forman un par inválido se sortea un par jugable con aviso", () => {
      const h = chosenGame([0, 0, 0]); // normal y normal → inválido → par jugable índice 0
      h.advance(15_000);
      expect(h.last("round-started")).toMatchObject({ type1: "flying", type2: "fire", typesNotice: "pair_replaced" });
    });
  });

  it("el temporizador de elección que quedó obsoleto no vuelve a resolver la ronda", () => {
    const h = chosenGame();
    h.advance(1000);
    h.choose(1, "fire");
    h.choose(2, "flying"); // se resuelve antes del plazo
    const started = h.payloads("round-started").length;
    h.advance(14_500); // pasa el plazo original de la elección (T0 + 15 s)
    expect(h.payloads("round-started")).toHaveLength(started);
    expect(h.state.phase).toBe("round_active");
    expect(h.state.round?.number).toBe(1);
  });
});
