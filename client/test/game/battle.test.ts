import type { BattleAction, BattleFighterView } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import { battleSpriteUrl } from "../../src/catalog/artwork";
import { aliveIds, effectivenessLabel, hpTone, moveLabel, turnLines, turnSummary } from "../../src/game/battle";

const fighter = (id: number, hp: number, maxHp = 100): BattleFighterView => ({ pokemon: { id } as never, hp, maxHp });
const action = (over: Partial<BattleAction> = {}): BattleAction => ({ actor: 1, move: "fire", damage: 42, critical: false, effectiveness: 1, healed: 0, actorHp: 100, targetHp: 58, ...over });
const names = { 1: "Charizard", 2: "Mewtwo" };

describe("hpTone", () => {
  it("verde por encima del 50 %, amarilla hasta el 20 %, roja por debajo", () => {
    expect(hpTone(51, 100)).toBe("good");
    expect(hpTone(50, 100)).toBe("warn");
    expect(hpTone(20, 100)).toBe("warn");
    expect(hpTone(19, 100)).toBe("danger");
    expect(hpTone(0, 100)).toBe("danger");
  });
});

describe("battleSpriteUrl", () => {
  it("usa el GIF animado de Showdown", () => {
    expect(battleSpriteUrl(6)).toMatch(/other\/showdown\/6\.gif$/);
  });

  it("los 14 sin animación usan la imagen fija", () => {
    for (const id of [990, 991, 992, 993, 994, 995, 1006, 1008, 1010, 1017, 1022, 1023, 1024, 1025]) expect(battleSpriteUrl(id)).not.toContain("showdown");
    expect(battleSpriteUrl(989)).toContain("showdown");
    expect(battleSpriteUrl(1021)).toContain("showdown");
  });
});

describe("los textos de los movimientos", () => {
  it("tienen nombres genéricos", () => {
    expect(moveLabel("fire")).toBe("Ataque Fuego");
    expect(moveLabel("forcejeo")).toBe("Forcejeo");
    expect(moveLabel("recuperar")).toBe("Recuperar");
  });

  it("la eficacia se lee con coma", () => {
    expect(effectivenessLabel(2)).toBe("×2");
    expect(effectivenessLabel(0.5)).toBe("×0,5");
    expect(effectivenessLabel(0)).toBe("×0");
    expect(effectivenessLabel(null)).toBe("");
  });
});

describe("turnLines", () => {
  it("cuenta el daño, el crítico y la eficacia", () => {
    expect(turnLines([action({ critical: true, effectiveness: 2 })], names)).toEqual(["Charizard usó Ataque Fuego: 42 de daño. ¡Crítico! ¡Es muy eficaz!"]);
    expect(turnLines([action({ effectiveness: 0.5, actor: 2 })], names)).toEqual(["Mewtwo usó Ataque Fuego: 42 de daño. No es muy eficaz."]);
  });

  it("sin efecto y curando", () => {
    expect(turnLines([action({ damage: 0, effectiveness: 0 })], names)).toEqual(["Charizard usó Ataque Fuego: no afecta."]);
    expect(turnLines([action({ move: "recuperar", damage: 0, healed: 30 })], names)).toEqual(["Charizard usó Recuperar: recuperó 30 PS."]);
  });

  it("para el lector de pantalla, una sola frase", () => {
    const summary = turnSummary([action(), action({ actor: 2, move: "recuperar", damage: 0, healed: 9 })], names);
    expect(summary).toBe("Charizard, 42 de daño. Mewtwo, recuperó 9 PS.");
  });
});

describe("aliveIds", () => {
  it("solo los vivos", () => {
    expect(aliveIds([fighter(1, 50), fighter(2, 0), fighter(3, 1)])).toEqual([1, 3]);
  });
});
