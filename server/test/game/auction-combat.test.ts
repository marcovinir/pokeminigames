import type { BaseStats, TypeName } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import { type CombatSide, applyItem, bestMove, moveDamage, moveEffectiveness, movesOf, newFighter, resolveTurn, roundLimitLoser } from "../../src/game/auction/combat.js";

const stats = (overrides: Partial<BaseStats> = {}): BaseStats => ({ hp: 80, attack: 80, defense: 80, spAttack: 80, spDefense: 80, speed: 80, ...overrides });
const mon = (id: number, types: TypeName[], overrides: Partial<BaseStats> = {}) => newFighter({ id, types, stats: stats(overrides) });
const side = (fighter: ReturnType<typeof mon>, extra: Partial<CombatSide> = {}): CombatSide => ({ fighter, healed: false, cinta: false, ...extra });
/** Nunca crítico y empates para el asiento 1, salvo que se diga otra cosa. */
const noCrit = { int: (max: number) => max - 1 };
const crit = { int: () => 0 };

describe("movimientos y daño", () => {
  it("un ataque por tipo, Forcejeo y Recuperar", () => {
    expect(movesOf(mon(1, ["fire", "flying"]))).toEqual(["fire", "flying", "forcejeo", "recuperar"]);
    expect(movesOf(mon(1, ["normal"]))).toEqual(["normal", "forcejeo", "recuperar"]);
  });

  it("la eficacia se multiplica por los dos tipos; Forcejeo siempre es ×1", () => {
    const charizard = mon(6, ["fire", "flying"]);
    expect(moveEffectiveness("rock", charizard)).toBe(4);
    expect(moveEffectiveness("ground", charizard)).toBe(0);
    expect(moveEffectiveness("forcejeo", mon(2, ["ghost"]))).toBe(1);
  });

  it("físico contra Defensa y especial contra Defensa Especial", () => {
    const attacker = mon(1, ["normal", "fire"], { attack: 320, spAttack: 20 });
    const defender = mon(2, ["water"], { defense: 80, spDefense: 320 });
    expect(moveDamage(attacker, defender, "normal")).toBe(60);
    expect(moveDamage(attacker, defender, "fire")).toBe(8);
  });

  it("crítico ×1,5 y Cinta +25 %", () => {
    const [a, b] = [mon(1, ["normal"]), mon(2, ["normal"])];
    expect(moveDamage(a, b, "normal")).toBe(30);
    expect(moveDamage(a, b, "normal", { critical: true })).toBe(45);
    expect(moveDamage(a, b, "normal", { cinta: true })).toBe(38);
  });

  it("el mejor movimiento es el que más daño hace; ante una inmunidad, Forcejeo", () => {
    expect(bestMove(mon(1, ["normal"]), mon(2, ["ghost"]))).toBe("forcejeo");
    expect(bestMove(mon(1, ["fire", "water"]), mon(2, ["grass"]))).toBe("fire");
  });
});

describe("un turno", () => {
  it("ataca primero el más rápido", () => {
    const actions = resolveTurn({ 1: side(mon(1, ["normal"], { speed: 50 })), 2: side(mon(2, ["normal"], { speed: 90 })) }, { 1: "normal", 2: "normal" }, noCrit);
    expect(actions.map((action) => action.actor)).toEqual([2, 1]);
  });

  it("si empatan en Velocidad, decide el azar", () => {
    const sides = () => ({ 1: side(mon(1, ["normal"])), 2: side(mon(2, ["normal"])) });
    expect(resolveTurn(sides(), { 1: "normal", 2: "normal" }, { int: () => 0 })[0]!.actor).toBe(1);
    expect(resolveTurn(sides(), { 1: "normal", 2: "normal" }, { int: (max) => (max === 2 ? 1 : 15) })[0]!.actor).toBe(2);
  });

  it("un debilitado ya no ataca", () => {
    const frail = mon(2, ["normal"], { speed: 10 });
    frail.hp = 5;
    const actions = resolveTurn({ 1: side(mon(1, ["normal"], { speed: 90 })), 2: side(frail) }, { 1: "normal", 2: "normal" }, noCrit);
    expect(actions).toHaveLength(1);
    expect(frail.hp).toBe(0);
    expect(actions[0]).toMatchObject({ actor: 1, targetHp: 0 });
  });

  it("los PS no bajan de 0 y el daño contado es el real", () => {
    const frail = mon(2, ["normal"], { speed: 10 });
    frail.hp = 5;
    const [action] = resolveTurn({ 1: side(mon(1, ["normal"], { speed: 90 })), 2: side(frail) }, { 1: "normal", 2: "normal" }, noCrit);
    expect(action!.damage).toBe(5);
  });

  it("marca los críticos, con 1 entre 16", () => {
    const [action] = resolveTurn({ 1: side(mon(1, ["normal"], { speed: 90 })), 2: side(mon(2, ["normal"])) }, { 1: "normal", 2: "forcejeo" }, crit);
    expect(action).toMatchObject({ critical: true, damage: 45 });
  });

  it("Recuperar cura el 25 % sin pasarse, y se marca como usado", () => {
    const hurt = mon(1, ["normal"], { speed: 90 });
    hurt.hp = 120;
    const me = side(hurt);
    const [action] = resolveTurn({ 1: me, 2: side(mon(2, ["ghost"])) }, { 1: "recuperar", 2: "recuperar" }, noCrit);
    expect(action).toMatchObject({ move: "recuperar", healed: 20, actorHp: 140 });
    expect(me.healed).toBe(true);
  });

  it("la Cinta suma daño a quien la lleva", () => {
    const [action] = resolveTurn({ 1: side(mon(1, ["normal"], { speed: 90 }), { cinta: true }), 2: side(mon(2, ["normal"])) }, { 1: "normal", 2: "forcejeo" }, noCrit);
    expect(action!.damage).toBe(38);
  });

  it("sin críticos, si se apagan", () => {
    const [action] = resolveTurn({ 1: side(mon(1, ["normal"], { speed: 90 })), 2: side(mon(2, ["normal"])) }, { 1: "normal", 2: "forcejeo" }, crit, { criticals: false });
    expect(action!.critical).toBe(false);
  });
});

describe("objetos", () => {
  it("Poción Máxima cura del todo a un vivo; no sirve con un debilitado ni con uno sano", () => {
    const hurt = mon(1, ["normal"]);
    hurt.hp = 10;
    expect(applyItem("pocion", hurt)).toBe(true);
    expect(hurt.hp).toBe(140);
    expect(applyItem("pocion", hurt)).toBe(false);
    hurt.hp = 0;
    expect(applyItem("pocion", hurt)).toBe(false);
  });

  it("Revivir devuelve el 50 % a un debilitado; no sirve con un vivo", () => {
    const down = mon(1, ["normal"]);
    down.hp = 0;
    expect(applyItem("revivir", down)).toBe(true);
    expect(down.hp).toBe(70);
    expect(applyItem("revivir", down)).toBe(false);
  });
});

describe("el límite de turnos", () => {
  it("cae quien tiene menos porcentaje; si empatan, el más lento; si siguen iguales, al azar", () => {
    const [a, b] = [mon(1, ["normal"]), mon(2, ["normal"])];
    a.hp = 70;
    expect(roundLimitLoser({ 1: a, 2: b }, noCrit)).toBe(1);
    a.hp = b.hp;
    const [slow, fast] = [mon(1, ["normal"], { speed: 10 }), mon(2, ["normal"], { speed: 90 })];
    expect(roundLimitLoser({ 1: slow, 2: fast }, noCrit)).toBe(1);
    expect(roundLimitLoser({ 1: a, 2: b }, { int: () => 1 })).toBe(2);
  });
});
