import { TYPE_NAMES, damageTaken, typeEffectiveness } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import reference from "./fixtures/type-chart.pokeapi.json";

describe("tabla de tipos", () => {
  it("los 324 valores coinciden con PokeAPI", () => {
    for (const attacker of TYPE_NAMES) {
      for (const defender of TYPE_NAMES) {
        expect(typeEffectiveness(attacker, defender), `${attacker} → ${defender}`).toBe(reference[attacker][defender]);
      }
    }
  });

  it("Charizard (fuego y volador): ×4 roca, ×0 tierra, ×¼ planta y bicho", () => {
    expect(damageTaken(["fire", "flying"])).toEqual({
      x4: ["rock"],
      x2: ["water", "electric"],
      x05: ["fighting", "steel", "fire", "fairy"],
      x025: ["bug", "grass"],
      x0: ["ground"],
    });
  });

  it("un solo tipo no da ×4 ni ×¼", () => {
    const groups = damageTaken(["normal"]);
    expect([groups.x4, groups.x025]).toEqual([[], []]);
    expect(groups.x0).toEqual(["ghost"]);
  });
});
