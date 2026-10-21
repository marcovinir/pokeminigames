import { describe, expect, it } from "vitest";
import { Harness } from "./harness.js";

/** Partida aleatoria en la ronda 1 con el par volador/fuego: Alfa (1), Beto (2) y Gama (3). `rng`: [par, ejemplo]. */
function round1(rng: number[]): Harness {
  const h = new Harness({ rng });
  h.startGame();
  return h;
}

describe("motor: ejemplo tras la ronda", () => {
  it("si nadie acierta, el resultado trae un Pokémon libre del par, sorteado con el generador", () => {
    const h = round1([0, 2]);
    h.submit(1, "nada");
    h.submit(2, "tampoco");

    const result = h.last("round-result")!;
    expect(result.results[1].result).toBe("NOT_FOUND");
    expect(result.results[2].result).toBe("NOT_FOUND");
    expect(result.example).toMatchObject({ id: 3, names: { es: "Gama" } });
  });

  it("si solo acierta uno, el ejemplo es otro Pokémon libre: nunca el que se ganó", () => {
    const h = round1([0, 0]);
    h.submit(1, "Alfa");
    h.submit(2, "nada");

    const result = h.last("round-result")!;
    expect(result.results[1].pokemon?.id).toBe(1);
    expect(result.example?.id).toBe(2);
    expect(h.state.owners.has(result.example!.id)).toBe(false);
  });

  it("si aciertan los dos, no hay ejemplo ni se gasta azar", () => {
    const h = round1([0, 0]);
    const before = h.rng.calls;
    h.submit(1, "Alfa");
    h.submit(2, "Beto");

    const result = h.last("round-result")!;
    expect(result).not.toHaveProperty("example");
    expect(h.rng.calls).toBe(before);
  });

  it("si nadie contesta y se acaba el tiempo, también hay ejemplo", () => {
    const h = round1([0, 1]);
    h.advance(15_000);

    const result = h.last("round-result")!;
    expect(result.results[1].result).toBe("NO_ANSWER");
    expect(result.example).toMatchObject({ id: 2 });
  });

  it("el ejemplo no se guarda en el historial de la ronda", () => {
    const h = round1([0, 0]);
    h.submit(1, "nada");
    h.submit(2, "nada");

    const persisted = h.effectsOfKind("persist_round");
    expect(persisted).toHaveLength(1);
    expect(JSON.stringify(persisted[0])).not.toContain("example");
  });
});
