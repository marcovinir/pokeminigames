import type { BaseStats, MoveData, TypeName } from "@pokemon-minigames/shared";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FILLER_MOVES, type RawMove, isUsableMove, selectMoves, toMoveData } from "../../src/game/auction/move-selection.js";

const raw = (over: Partial<Omit<RawMove, "meta">> & { meta?: Partial<RawMove["meta"]> } = {}): RawMove => {
  const { meta, ...rest } = over;
  return {
    name: "prueba",
    names: [{ name: "Prueba", language: { name: "es" } }],
    type: { name: "fire" },
    damage_class: { name: "special" },
    target: { name: "selected-pokemon" },
    power: 90,
    accuracy: 100,
    pp: 15,
    priority: 0,
    stat_changes: [],
    ...rest,
    meta: { category: { name: "damage" }, ailment: { name: "none" }, min_hits: null, max_hits: null, min_turns: null, max_turns: null, drain: 0, healing: 0, ailment_chance: 0, stat_chance: 0, flinch_chance: 0, ...meta },
  };
};

const FLAMETHROWER = raw({ name: "flamethrower", meta: { category: { name: "damage-ailment" }, ailment: { name: "burn" }, ailment_chance: 10 } });
const THUNDER_WAVE = raw({ name: "thunder-wave", type: { name: "electric" }, damage_class: { name: "status" }, power: null, accuracy: 90, meta: { category: { name: "ailment" }, ailment: { name: "paralysis" } } });
const RECOVER = raw({ name: "recover", type: { name: "normal" }, damage_class: { name: "status" }, target: { name: "user" }, power: null, accuracy: null, pp: 5, meta: { category: { name: "heal" }, healing: 50 } });

describe("qué movimientos entran", () => {
  it("acepta un ataque con estado, uno de estado y una curación", () => {
    for (const move of [FLAMETHROWER, THUNDER_WAVE, RECOVER]) expect(isUsableMove(move), move.name).toBe(true);
  });

  it("rechaza los de reglas raras", () => {
    const rare: RawMove[] = [
      raw({ power: 150 }),
      raw({ power: 30 }),
      raw({ priority: 1 }),
      raw({ meta: { min_hits: 2, max_hits: 5 } }),
      raw({ meta: { drain: -33 } }),
      raw({ meta: { drain: 50, category: { name: "damage-heal" } } }),
      raw({ meta: { category: { name: "ohko" } } }),
      raw({ power: null }),
      raw({ damage_class: { name: "status" }, power: null, meta: { category: { name: "field-effect" } } }),
      raw({ damage_class: { name: "status" }, power: null, meta: { category: { name: "ailment" }, ailment: { name: "confusion" } } }),
      raw({ damage_class: { name: "status" }, power: null, meta: { category: { name: "net-good-stats" } }, stat_changes: [{ change: -1, stat: { name: "accuracy" } }] }),
      raw({ name: "solar-beam" }),
      raw({ name: "dig" }),
    ];
    for (const move of rare) expect(isUsableMove(move), JSON.stringify(move.meta)).toBe(false);
  });

  it("un efecto secundario que no está en la lista se ignora, sin perder el ataque", () => {
    const iceBeam = raw({ name: "ice-beam", type: { name: "ice" }, meta: { category: { name: "damage-ailment" }, ailment: { name: "freeze" }, ailment_chance: 10 } });
    expect(isUsableMove(iceBeam)).toBe(true);
    expect(toMoveData(iceBeam).effect).toEqual({});
  });
});

describe("cómo se guarda", () => {
  it("con su nombre en español, su estado y su probabilidad", () => {
    const data = toMoveData(FLAMETHROWER);
    expect(data).toMatchObject({ id: "flamethrower", type: "fire", category: "special", power: 90, accuracy: 100, pp: 15 });
    expect(data.names.es).toBe("Prueba");
    expect(data.effect).toEqual({ ailment: "burn", ailmentChance: 10 });
  });

  it("los stats dicen a quién afectan, y una probabilidad 0 en un movimiento de estado es segura", () => {
    const growl = raw({ name: "growl", damage_class: { name: "status" }, power: null, meta: { category: { name: "net-good-stats" } }, stat_changes: [{ change: -1, stat: { name: "attack" } }] });
    expect(toMoveData(growl).effect.stats).toEqual([{ stat: "attack", change: -1, target: "rival", chance: 100 }]);
    const closeCombat = raw({ name: "close-combat", damage_class: { name: "physical" }, meta: { category: { name: "damage-raise" }, stat_chance: 100 }, stat_changes: [{ change: -1, stat: { name: "defense" } }] });
    expect(toMoveData(closeCombat).effect.stats).toEqual([{ stat: "defense", change: -1, target: "user", chance: 100 }]);
  });

  it("la curación guarda su porcentaje", () => {
    expect(toMoveData(RECOVER).effect).toEqual({ healing: 50 });
  });
});

const stats = (over: Partial<BaseStats> = {}): BaseStats => ({ hp: 80, attack: 80, defense: 80, spAttack: 80, spDefense: 80, speed: 80, ...over });
const attack = (id: string, type: TypeName, power: number, category: "physical" | "special" = "special", accuracy: number | null = 100): MoveData => ({ id, names: { es: id, en: id }, type, category, power, accuracy, pp: 10, effect: {} });
const support = (id: string, effect: MoveData["effect"], accuracy: number | null = null): MoveData => ({ id, names: { es: id, en: id }, type: "normal", category: "status", power: null, accuracy, pp: 10, effect });

describe("qué 4 le tocan", () => {
  const fire = { types: ["fire"] as TypeName[], stats: stats() };

  it("2 de su tipo, 1 de otro y 1 de apoyo", () => {
    const learnable = [attack("f1", "fire", 90), attack("f2", "fire", 75), attack("f3", "fire", 40), attack("n1", "normal", 120), attack("g1", "ground", 90), support("s1", { ailment: "burn" }, 75)];
    expect(selectMoves(fire, learnable)).toEqual(["f1", "f2", "g1", "s1"]);
  });

  it("el de otro tipo es el que cubre más tipos, aunque pegue menos", () => {
    const moves = selectMoves(fire, [attack("f1", "fire", 90), attack("f2", "fire", 75), attack("n1", "normal", 120), attack("r1", "rock", 60)]);
    expect(moves[2]).toBe("r1");
  });

  it("si aprende una curación, esa es su apoyo", () => {
    const moves = selectMoves(fire, [attack("f1", "fire", 90), attack("f2", "fire", 75), attack("g1", "ground", 90), support("s1", { ailment: "sleep" }, 100), support("heal", { healing: 50 })]);
    expect(moves).toContain("heal");
    expect(moves).not.toContain("s1");
  });

  it("prefiere la categoría de su stat más alto", () => {
    const strong = { types: ["fire"] as TypeName[], stats: stats({ attack: 150, spAttack: 40 }) };
    expect(selectMoves(strong, [attack("esp", "fire", 90, "special"), attack("fis", "fire", 75, "physical")])[0]).toBe("fis");
  });

  it("la precisión cuenta", () => {
    expect(selectMoves(fire, [attack("loco", "fire", 110, "special", 50), attack("seguro", "fire", 90)])[0]).toBe("seguro");
  });

  it("sin apoyo ni ataque de su tipo, rellena con sus mejores ataques", () => {
    expect(selectMoves(fire, [attack("n1", "normal", 80), attack("n2", "normal", 70), attack("n3", "normal", 60), attack("n4", "normal", 50), attack("n5", "normal", 40)])).toEqual(["n1", "n2", "n3", "n4"]);
  });

  it("si no llega a 4, completa con ataques normales básicos, sin repetir", () => {
    const moves = selectMoves(fire, [attack("tackle", "normal", 40)]);
    expect(moves).toHaveLength(4);
    expect(new Set(moves).size).toBe(4);
    expect(moves.slice(1).every((id) => FILLER_MOVES.includes(id))).toBe(true);
  });

  it("sin nada que aprender también tiene 4", () => {
    expect(selectMoves(fire, [])).toEqual(FILLER_MOVES.slice(0, 4));
  });

  it("no depende del orden en que llegan", () => {
    const learnable = [attack("b", "fire", 90), attack("a", "fire", 90), attack("c", "ground", 90), support("s", { healing: 50 })];
    expect(selectMoves(fire, [...learnable].reverse())).toEqual(selectMoves(fire, learnable));
    expect(selectMoves(fire, learnable)[0]).toBe("a");
  });
});

const catalogTypes = Object.fromEntries((JSON.parse(readFileSync(new URL("../../data/catalog.snapshot.json", import.meta.url), "utf8")) as { pokemon: { id: number; types: TypeName[] }[] }).pokemon.map((one) => [String(one.id), one.types]));

describe("la instantánea real", () => {
  const snapshot = JSON.parse(readFileSync(new URL("../../data/moves.snapshot.json", import.meta.url), "utf8")) as {
    moves: Record<string, MoveData>;
    abilities: Record<string, { es: string; en: string }>;
    sets: Record<string, { moves: string[]; ability: string | null }>;
  };

  it("los 1025 tienen 4 movimientos distintos, que existen y tienen PP", () => {
    expect(Object.keys(snapshot.sets)).toHaveLength(1025);
    for (const [id, set] of Object.entries(snapshot.sets)) {
      expect(new Set(set.moves).size, id).toBe(4);
      for (const move of set.moves) expect(snapshot.moves[move]?.pp, `${id} ${move}`).toBeGreaterThan(0);
    }
  });

  it("todo movimiento tiene nombre, y toda habilidad también", () => {
    for (const move of Object.values(snapshot.moves)) expect(move.names.es.length).toBeGreaterThan(0);
    for (const set of Object.values(snapshot.sets)) if (set.ability) expect(snapshot.abilities[set.ability]?.es).toBeTruthy();
  });

  it("los ataques con efecto están: Lanzallamas quema y hay ataques que cambian stats", () => {
    expect(snapshot.moves["flamethrower"]?.effect).toEqual({ ailment: "burn", ailmentChance: 10 });
    const attacks = Object.values(snapshot.moves).filter((move) => move.category !== "status");
    expect(attacks.filter((move) => move.effect.ailment).length).toBeGreaterThan(10);
    expect(attacks.filter((move) => move.effect.stats).length).toBeGreaterThan(5);
  });

  it("casi todos llevan un ataque de su tipo, y los que no es porque no aprenden ninguno", () => {
    const withOwn = (id: string) => snapshot.sets[id]!.moves.some((move) => catalogTypes[id]!.includes(snapshot.moves[move]!.type) && snapshot.moves[move]!.category !== "status");
    const missing = Object.keys(snapshot.sets).filter((id) => !withOwn(id));
    expect(missing.length).toBeLessThan(60);
    expect(withOwn("6")).toBe(true);
    expect(snapshot.sets[6]!.moves.some((move) => snapshot.moves[move]!.type === "fire")).toBe(true);
    expect(snapshot.sets[25]!.moves.some((move) => snapshot.moves[move]!.type === "electric")).toBe(true);
  });

  it("quien aprende una curación la lleva", () => {
    expect(snapshot.sets[6]!.moves).toContain("roost");
    expect(snapshot.sets[150]!.moves).toContain("recover");
  });
});
