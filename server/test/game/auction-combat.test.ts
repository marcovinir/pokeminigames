import type { BaseStats, MoveData, Seat, TypeName } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import { STRUGGLE, type Fighter, availableMoves, bestMove, clearStages, endOfTurn, enterBattle, leaveBattle, moveDamage, moveEffectiveness, newFighter, resolveTurn, roundLimitLoser, stageMultiplier, statusBlockedBy } from "../../src/game/auction/combat.js";
import { getMoveBook } from "../../src/game/auction/move-book.js";

const stats = (over: Partial<BaseStats> = {}): BaseStats => ({ hp: 80, attack: 80, defense: 80, spAttack: 80, spDefense: 80, speed: 80, ...over });

/** Movimientos de prueba: se añaden al libro con su propio identificador. */
function learn(move: Partial<MoveData> & { id: string }): string {
  getMoveBook().moves[move.id] = { names: { es: move.id, en: move.id }, type: "normal", category: "physical", power: 60, accuracy: 100, pp: 10, effect: {}, ...move };
  return move.id;
}
const HIT = learn({ id: "t-hit" });
const FIRE = learn({ id: "t-fire", type: "fire", category: "special" });
const WEAK = learn({ id: "t-weak", power: 50 });
const NORMAL_SPECIAL = learn({ id: "t-spe", category: "special" });
const HEAL = learn({ id: "t-heal", category: "status", power: null, accuracy: null, pp: 2, effect: { healing: 50 } });
const SHAKY = learn({ id: "t-shaky", accuracy: 50 });
const BURN = learn({ id: "t-burn", category: "status", power: null, effect: { ailment: "burn", ailmentChance: 100 } });
const PARA = learn({ id: "t-para", category: "status", power: null, effect: { ailment: "paralysis", ailmentChance: 100 } });
const POISON = learn({ id: "t-poison", category: "status", power: null, effect: { ailment: "poison", ailmentChance: 100 } });
const SLEEP = learn({ id: "t-sleep", category: "status", power: null, effect: { ailment: "sleep", ailmentChance: 100 } });
const THUNDER_WAVE = learn({ id: "t-wave", type: "electric", category: "status", power: null, effect: { ailment: "paralysis", ailmentChance: 100 } });
const SWORDS = learn({ id: "t-swords", category: "status", power: null, accuracy: null, effect: { stats: [{ stat: "attack", change: 2, target: "user", chance: 100 }] } });
const GROWL = learn({ id: "t-growl", category: "status", power: null, effect: { stats: [{ stat: "attack", change: -1, target: "rival", chance: 100 }] } });
const WATER = learn({ id: "t-water", type: "water", category: "special" });
const GROUND = learn({ id: "t-ground", type: "ground" });
const ELECTRIC = learn({ id: "t-electric", type: "electric", category: "special" });

const mon = (id: number, types: TypeName[], moves: string[], options: { stats?: Partial<BaseStats>; ability?: string | null } = {}): Fighter => newFighter({ id, types, stats: stats(options.stats) }, { moves, ability: options.ability ?? null });
const sides = (a: Fighter, b: Fighter): Record<Seat, Fighter> => ({ 1: a, 2: b });

/** Nunca crítico, nunca falla, nunca bloquea y los empates para el asiento 1. */
const calm = { int: (max: number) => max - 1 };
/** El azar más bajo: crítico, bloquea, y falla solo si la precisión es 0. */
const lucky = { int: () => 0 };

const normal = (id = 1) => mon(id, ["normal"], [HIT]);

describe("movimientos y daño", () => {
  it("usa la categoría real del movimiento: físico contra Defensa, especial contra Defensa Especial", () => {
    const attacker = mon(1, ["water"], [HIT, NORMAL_SPECIAL], { stats: { attack: 320, spAttack: 20 } });
    const defender = mon(2, ["water"], [HIT], { stats: { defense: 80, spDefense: 320 } });
    expect(moveDamage(attacker, defender, HIT)).toBeGreaterThan(moveDamage(attacker, defender, NORMAL_SPECIAL) * 3);
  });

  it("la potencia cuenta y su tipo añade la bonificación de 1,5", () => {
    expect(moveDamage(normal(), normal(), HIT)).toBeGreaterThan(moveDamage(normal(), normal(), WEAK));
    const same = moveDamage(mon(1, ["fire"], [FIRE]), mon(2, ["normal"], [HIT]), FIRE);
    const other = moveDamage(mon(1, ["water"], [FIRE]), mon(2, ["normal"], [HIT]), FIRE);
    expect(same / other).toBeCloseTo(1.5, 0);
  });

  it("la eficacia se multiplica por los dos tipos", () => {
    const charizard = mon(6, ["fire", "flying"], [HIT]);
    expect(moveEffectiveness(GROUND, charizard)).toBe(0);
    expect(moveEffectiveness(WATER, charizard)).toBe(2);
    expect(moveDamage(normal(), charizard, GROUND)).toBe(0);
  });
});

describe("PP", () => {
  it("cada uso baja 1, también si falla", () => {
    const a = mon(1, ["normal"], [SHAKY]);
    resolveTurn(sides(a, normal(2)), { 1: SHAKY, 2: null }, { int: (max) => (max === 100 ? 99 : max - 1) });
    expect(a.moves[0]!.pp).toBe(9);
  });

  it("sin PP deja de estar disponible, y sin ninguno solo queda Forcejeo", () => {
    const a = mon(1, ["normal"], [HIT, WEAK]);
    a.moves[0]!.pp = 0;
    expect(availableMoves(a)).toEqual([WEAK]);
    a.moves[1]!.pp = 0;
    expect(availableMoves(a)).toEqual([STRUGGLE]);
  });

  it("Forcejeo no tiene tipo, afecta a todos y le quita 1/4 de sus PS máximos", () => {
    const a = normal();
    a.moves[0]!.pp = 0;
    const ghost = mon(2, ["ghost"], [HIT]);
    const [action] = resolveTurn(sides(a, ghost), { 1: STRUGGLE, 2: null }, calm);
    expect(action!.damage).toBeGreaterThan(0);
    expect(a.hp).toBe(a.maxHp - Math.floor(a.maxHp / 4));
    expect(action!.notes).toContainEqual({ kind: "recoil", seat: 1, damage: Math.floor(a.maxHp / 4) });
  });

  it("el mejor movimiento nunca es uno sin PP; sin ninguno, Forcejeo", () => {
    const a = mon(1, ["normal"], [HIT, WEAK]);
    a.moves[0]!.pp = 0;
    expect(bestMove(a, normal(2))).toBe(WEAK);
    a.moves[1]!.pp = 0;
    expect(bestMove(a, normal(2))).toBe(STRUGGLE);
  });

  it("el mejor movimiento evita al que no afecta", () => {
    const a = mon(1, ["normal"], [HIT, FIRE]);
    expect(bestMove(a, mon(2, ["ghost"], [HIT]))).toBe(FIRE);
  });
});

describe("precisión y curación", () => {
  it("con mala suerte falla y no hace daño", () => {
    const b = normal(2);
    const [action] = resolveTurn(sides(mon(1, ["normal"], [SHAKY]), b), { 1: SHAKY, 2: null }, { int: (max) => (max === 100 ? 99 : max - 1) });
    expect(action).toMatchObject({ missed: true, damage: 0 });
    expect(b.hp).toBe(b.maxHp);
  });

  it("cura el porcentaje real, sin pasar del máximo", () => {
    const a = mon(1, ["normal"], [HEAL]);
    a.hp = 10;
    const [first] = resolveTurn(sides(a, normal(2)), { 1: HEAL, 2: null }, calm);
    expect(first!.healed).toBe(70);
    expect(a.hp).toBe(80);
    a.hp = a.maxHp - 5;
    const [second] = resolveTurn(sides(a, normal(2)), { 1: HEAL, 2: null }, calm);
    expect(second!.healed).toBe(5);
  });

  it("el más rápido actúa primero, y un debilitado ya no ataca", () => {
    const fast = mon(1, ["normal"], [HIT], { stats: { speed: 200 } });
    const slow = mon(2, ["normal"], [HIT], { stats: { speed: 10 } });
    slow.hp = 1;
    const actions = resolveTurn(sides(fast, slow), { 1: HIT, 2: HIT }, calm);
    expect(actions.map((one) => one.actor)).toEqual([1]);
    expect(slow.hp).toBe(0);
  });

  it("sin elección no hace nada", () => {
    expect(resolveTurn(sides(normal(1), normal(2)), { 1: null, 2: null }, calm)).toEqual([]);
  });

  it("un crítico pega más", () => {
    const [plain] = resolveTurn(sides(normal(1), normal(2)), { 1: HIT, 2: null }, calm);
    const [critical] = resolveTurn(sides(normal(1), normal(2)), { 1: HIT, 2: null }, lucky);
    expect(critical!.critical).toBe(true);
    expect(critical!.damage).toBeGreaterThan(plain!.damage);
  });
});

describe("estados", () => {
  it("quemado: pierde 1/16 por turno y su daño físico baja a la mitad", () => {
    const a = normal(1);
    const plain = moveDamage(a, normal(2), HIT);
    a.status = "burn";
    expect(moveDamage(a, normal(2), HIT)).toBe(Math.round(plain / 2));
    expect(moveDamage(mon(1, ["normal"], [NORMAL_SPECIAL]), normal(2), NORMAL_SPECIAL)).toBe(moveDamage(Object.assign(mon(1, ["normal"], [NORMAL_SPECIAL]), { status: "burn" }), normal(2), NORMAL_SPECIAL));
    const notes = endOfTurn(sides(a, normal(2)));
    expect(a.hp).toBe(a.maxHp - Math.floor(a.maxHp / 16));
    expect(notes).toContainEqual({ kind: "residual", seat: 1, cause: "burn", damage: Math.floor(a.maxHp / 16) });
  });

  it("envenenado: pierde 1/8 por turno", () => {
    const a = normal(1);
    a.status = "poison";
    endOfTurn(sides(a, normal(2)));
    expect(a.hp).toBe(a.maxHp - Math.floor(a.maxHp / 8));
  });

  it("el daño de estado no baja de 1 ni deja PS negativos", () => {
    const a = normal(1);
    a.status = "burn";
    a.maxHp = 10;
    a.hp = 1;
    endOfTurn(sides(a, normal(2)));
    expect(a.hp).toBe(0);
  });

  it("paralizado: velocidad a la mitad y 1 de cada 4 turnos sin actuar", () => {
    const a = mon(1, ["normal"], [HIT], { stats: { speed: 100 } });
    a.status = "paralysis";
    const b = mon(2, ["normal"], [HIT], { stats: { speed: 60 } });
    expect(resolveTurn(sides(a, b), { 1: HIT, 2: HIT }, calm).map((one) => one.actor)).toEqual([2, 1]);
    const [blocked] = resolveTurn(sides(a, normal(2)), { 1: HIT, 2: null }, { int: (max) => (max === 4 ? 0 : max - 1) });
    expect(blocked).toMatchObject({ blocked: "paralysis", damage: 0 });
  });

  it("dormido: de 1 a 3 turnos sin actuar, y al despertar actúa", () => {
    const a = normal(1);
    const b = mon(2, ["normal"], [SLEEP]);
    const [slept] = resolveTurn(sides(a, b), { 1: null, 2: SLEEP }, { int: (max) => (max === 3 ? 1 : max - 1) });
    expect(slept!.notes).toContainEqual({ kind: "status", seat: 1, status: "sleep" });
    expect(a.status).toBe("sleep");
    expect(a.sleepTurns).toBe(2);
    for (let turn = 0; turn < 2; turn++) expect(resolveTurn(sides(a, normal(2)), { 1: HIT, 2: null }, calm)[0]).toMatchObject({ blocked: "sleep" });
    expect(resolveTurn(sides(a, normal(2)), { 1: HIT, 2: null }, calm)[0]!.damage).toBeGreaterThan(0);
    expect(a.status).toBeNull();
  });

  it("un solo estado por Pokémon", () => {
    const a = normal(1);
    a.status = "poison";
    const [action] = resolveTurn(sides(a, mon(2, ["normal"], [BURN])), { 1: null, 2: BURN }, calm);
    expect(a.status).toBe("poison");
    expect(action!.notes).toContainEqual({ kind: "no_effect", seat: 1 });
  });

  it("los tipos que no pueden tenerlo no lo reciben", () => {
    expect(statusBlockedBy(mon(1, ["fire"], [HIT]), "burn")).toBe(true);
    expect(statusBlockedBy(mon(1, ["steel"], [HIT]), "poison")).toBe(true);
    expect(statusBlockedBy(mon(1, ["electric"], [HIT]), "paralysis")).toBe(true);
    const ground = mon(1, ["ground"], [HIT]);
    resolveTurn(sides(ground, mon(2, ["electric"], [THUNDER_WAVE])), { 1: null, 2: THUNDER_WAVE }, calm);
    expect(ground.status).toBeNull();
  });

  it("se conserva al cambiar de Pokémon", () => {
    const a = normal(1);
    a.status = "burn";
    leaveBattle(a);
    expect(a.status).toBe("burn");
  });

  it("los movimientos que paralizan, queman o envenenan lo aplican", () => {
    for (const [move, status] of [[PARA, "paralysis"], [BURN, "burn"], [POISON, "poison"]] as const) {
      const a = normal(1);
      resolveTurn(sides(a, mon(2, ["normal"], [move])), { 1: null, 2: move }, calm);
      expect(a.status).toBe(status);
    }
  });
});

describe("niveles de stats", () => {
  it("el multiplicador es el de los juegos", () => {
    expect(stageMultiplier(0)).toBe(1);
    expect(stageMultiplier(2)).toBe(2);
    expect(stageMultiplier(6)).toBe(4);
    expect(stageMultiplier(-2)).toBe(0.5);
    expect(stageMultiplier(-6)).toBe(0.25);
  });

  it("suben y afectan al daño, sin pasar de +6", () => {
    const a = mon(1, ["normal"], [SWORDS, HIT]);
    const before = moveDamage(a, normal(2), HIT);
    for (let turn = 0; turn < 4; turn++) resolveTurn(sides(a, normal(2)), { 1: SWORDS, 2: null }, calm);
    expect(a.stages.attack).toBe(6);
    expect(moveDamage(a, normal(2), HIT)).toBeGreaterThan(before);
  });

  it("bajan al rival", () => {
    const a = normal(1);
    resolveTurn(sides(a, mon(2, ["normal"], [GROWL])), { 1: null, 2: GROWL }, calm);
    expect(a.stages.attack).toBe(-1);
  });

  it("la velocidad cuenta para el orden", () => {
    const a = mon(1, ["normal"], [HIT], { stats: { speed: 50 } });
    a.stages.speed = 2;
    expect(resolveTurn(sides(a, mon(2, ["normal"], [HIT], { stats: { speed: 80 } })), { 1: HIT, 2: HIT }, calm)[0]!.actor).toBe(1);
  });

  it("se pierden al salir y al limpiar", () => {
    const a = normal(1);
    a.stages.attack = 3;
    leaveBattle(a);
    expect(a.stages.attack).toBe(0);
    a.stages.speed = -1;
    clearStages(a);
    expect(a.stages.speed).toBe(0);
  });
});

describe("habilidades", () => {
  const withAbility = (ability: string, types: TypeName[] = ["normal"], over: Partial<BaseStats> = {}) => mon(1, types, [HIT, FIRE, WATER, GROUND, ELECTRIC], { ability, stats: over });

  it("Intimidación baja el Ataque del rival al entrar, salvo Cuerpo Puro", () => {
    const rival = normal(2);
    expect(enterBattle(withAbility("intimidate"), rival, 1)).toContainEqual({ kind: "ability", seat: 1, ability: "intimidate" });
    expect(rival.stages.attack).toBe(-1);
    const pure = mon(2, ["normal"], [HIT], { ability: "clear-body" });
    enterBattle(withAbility("intimidate"), pure, 1);
    expect(pure.stages.attack).toBe(0);
  });

  it("Cuerpo Puro también frena los movimientos que bajan stats", () => {
    const pure = mon(1, ["normal"], [HIT], { ability: "clear-body" });
    resolveTurn(sides(pure, mon(2, ["normal"], [GROWL])), { 1: null, 2: GROWL }, calm);
    expect(pure.stages.attack).toBe(0);
  });

  it("Levitación y Absorbe Fuego anulan su tipo", () => {
    const levitating = withAbility("levitate");
    const [action] = resolveTurn(sides(mon(2, ["ground"], [GROUND]), levitating), { 1: GROUND, 2: null }, calm);
    expect(action).toMatchObject({ damage: 0, effectiveness: 0 });
    expect(action!.notes).toContainEqual({ kind: "ability", seat: 2, ability: "levitate" });
    expect(moveEffectiveness(FIRE, withAbility("flash-fire"))).toBe(0);
    expect(moveEffectiveness(GROUND, levitating)).toBe(0);
  });

  it("Absorbe Agua y Absorbe Electricidad curan 1/4 en lugar de recibir daño", () => {
    for (const [ability, move] of [["water-absorb", WATER], ["volt-absorb", ELECTRIC]] as const) {
      const target = withAbility(ability);
      target.hp = 50;
      resolveTurn(sides(mon(2, ["normal"], [move]), target), { 1: move, 2: null }, calm);
      expect(target.hp).toBe(50 + Math.floor(target.maxHp / 4));
    }
  });

  it("Inmunidad, Flexibilidad e Insomnio impiden su estado", () => {
    expect(statusBlockedBy(withAbility("immunity"), "poison")).toBe(true);
    expect(statusBlockedBy(withAbility("limber"), "paralysis")).toBe(true);
    expect(statusBlockedBy(withAbility("insomnia"), "sleep")).toBe(true);
    expect(statusBlockedBy(withAbility("insomnia"), "burn")).toBe(false);
  });

  it("Mar Llamas, Torrente, Espesura y Enjambre suben su tipo con 1/3 de PS o menos", () => {
    for (const [ability, type] of [["blaze", "fire"], ["torrent", "water"], ["overgrow", "grass"], ["swarm", "bug"]] as const) {
      const move = learn({ id: `t-${type}-pow`, type });
      const a = mon(1, ["normal"], [move], { ability });
      const full = moveDamage(a, normal(2), move);
      a.hp = Math.floor(a.maxHp / 3);
      expect(moveDamage(a, normal(2), move), ability).toBe(Math.round(full * 1.5));
    }
  });

  it("Sebo recibe la mitad de Fuego y Hielo", () => {
    const fat = mon(2, ["normal"], [HIT], { ability: "thick-fat" });
    expect(moveDamage(normal(1), fat, FIRE)).toBe(Math.round(moveDamage(normal(1), normal(2), FIRE) / 2));
  });

  it("Agallas sube el físico con estado, y la quemadura no lo baja", () => {
    const guts = mon(1, ["water"], [HIT], { ability: "guts" });
    const plain = moveDamage(guts, normal(2), HIT);
    guts.status = "burn";
    expect(moveDamage(guts, normal(2), HIT)).toBe(Math.round(plain * 1.5));
  });

  it("Adaptable, Experto y Potencia suben su daño", () => {
    const fire = (ability: string | null) => mon(1, ["fire"], [FIRE], { ability });
    expect(moveDamage(fire("adaptability"), normal(2), FIRE)).toBeGreaterThan(moveDamage(fire(null), normal(2), FIRE));
    const weak = learn({ id: "t-tech", power: 60, type: "water" });
    const strong = learn({ id: "t-notech", power: 70, type: "water" });
    const tech = mon(1, ["normal"], [weak, strong], { ability: "technician" });
    const none = mon(1, ["normal"], [weak, strong]);
    expect(moveDamage(tech, normal(2), weak)).toBeGreaterThan(moveDamage(none, normal(2), weak));
    expect(moveDamage(tech, normal(2), strong)).toBe(moveDamage(none, normal(2), strong));
    expect(moveDamage(mon(1, ["water"], [HIT], { ability: "huge-power" }), normal(2), HIT)).toBeGreaterThan(moveDamage(mon(1, ["water"], [HIT]), normal(2), HIT));
  });

  it("al tocarlo, Elec. Estática, Cuerpo Llama y Punto Tóxico pueden dar su estado", () => {
    for (const [ability, status] of [["static", "paralysis"], ["flame-body", "burn"], ["poison-point", "poison"]] as const) {
      const attacker = normal(1);
      const [action] = resolveTurn(sides(attacker, mon(2, ["water"], [HIT], { ability })), { 1: HIT, 2: null }, { int: (max) => (max === 10 ? 0 : max - 1) });
      expect(attacker.status, ability).toBe(status);
      expect(action!.notes).toContainEqual({ kind: "ability", seat: 2, ability });
    }
  });

  it("al tocarlo, Piel Tosca le quita 1/8", () => {
    const attacker = normal(1);
    resolveTurn(sides(attacker, mon(2, ["water"], [HIT], { ability: "rough-skin" })), { 1: HIT, 2: null }, calm);
    expect(attacker.hp).toBe(attacker.maxHp - Math.floor(attacker.maxHp / 8));
  });

  it("un ataque especial no toca", () => {
    const attacker = mon(1, ["normal"], [NORMAL_SPECIAL]);
    resolveTurn(sides(attacker, mon(2, ["water"], [HIT], { ability: "rough-skin" })), { 1: NORMAL_SPECIAL, 2: null }, calm);
    expect(attacker.hp).toBe(attacker.maxHp);
  });

  it("Robustez deja en 1 PS solo si estaba con los PS llenos", () => {
    const huge = learn({ id: "t-huge", power: 120 });
    const attacker = mon(1, ["normal"], [huge], { stats: { attack: 320 } });
    const full = mon(2, ["water"], [HIT], { ability: "sturdy", stats: { hp: 1, defense: 20 } });
    full.maxHp = 10;
    full.hp = 10;
    resolveTurn(sides(attacker, full), { 1: huge, 2: null }, calm);
    expect(full.hp).toBe(1);
    resolveTurn(sides(attacker, full), { 1: huge, 2: null }, calm);
    expect(full.hp).toBe(0);
  });

  it("Impulso sube su Velocidad al acabar cada turno", () => {
    const fast = mon(1, ["normal"], [HIT], { ability: "speed-boost" });
    endOfTurn(sides(fast, normal(2)));
    expect(fast.stages.speed).toBe(1);
  });

  it("Cura Natural quita el estado al salir", () => {
    const a = mon(1, ["normal"], [HIT], { ability: "natural-cure" });
    a.status = "burn";
    leaveBattle(a);
    expect(a.status).toBeNull();
  });

  it("una habilidad desconocida o ninguna no hace nada", () => {
    for (const ability of ["swift-swim", null]) {
      const a = mon(1, ["normal"], [HIT], { ability });
      expect(enterBattle(a, normal(2), 1)).toEqual([]);
      expect(moveDamage(a, normal(2), HIT)).toBe(moveDamage(normal(1), normal(2), HIT));
    }
  });
});

describe("el conjunto de cada Pokémon", () => {
  it("sale de la instantánea", () => {
    const charizard = newFighter({ id: 6, types: ["fire", "flying"], stats: stats() });
    expect(charizard.moves.map((one) => one.id)).toContain("roost");
    expect(charizard.ability).toBe("blaze");
    expect(charizard.moves.every((one) => one.pp > 0)).toBe(true);
  });
});

describe("el límite de turnos", () => {
  it("cae quien tiene menos porcentaje de PS", () => {
    const a = normal(1);
    a.hp = 10;
    expect(roundLimitLoser(sides(a, normal(2)), calm)).toBe(1);
  });
});
