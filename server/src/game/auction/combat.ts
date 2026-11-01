import { type BaseStats, type BattleAction, type BattleMove, type BattleNote, type BoostStat, type MoveData, type Seat, type Status, type TypeName, typeEffectiveness } from "@pokemon-minigames/shared";
import type { Rng } from "../rng.js";
import { CONTACT_STATUS, attackerModifier, defenderModifier, guardsStatus, healsWhenHit, isImmuneByAbility } from "./abilities.js";
import { type MoveSet, getMoveBook, moveSetOf } from "./move-book.js";
import { CONTACT_ODDS, CRITICAL_ODDS, PARALYSIS_ODDS, POWER_SCALE, STAB, STRUGGLE_POWER, combatHp, damage } from "./rules.js";

/**
 * Las reglas del combate. Las usan el motor y el simulador: si fueran dos copias, los números del simulador dejarían de
 * decir nada sobre el juego real.
 */
export interface CombatPokemon {
  id: number;
  types: TypeName[];
  stats: BaseStats;
}

export interface Fighter {
  pokemon: CombatPokemon;
  hp: number;
  maxHp: number;
  moves: { id: string; pp: number }[];
  status: Status | null;
  sleepTurns: number;
  stages: Record<BoostStat, number>;
  ability: string | null;
}

/** Solo aparece sin PP en ningún movimiento: no tiene tipo y le cuesta vida a quien lo usa. */
export const STRUGGLE = "forcejeo";
const STRUGGLE_MOVE: MoveData = { id: STRUGGLE, names: { es: "Forcejeo", en: "Struggle" }, type: "normal", category: "physical", power: STRUGGLE_POWER, accuracy: null, pp: 1, effect: {} };
const STRUGGLE_RECOIL = 4;
const MAX_STAGE = 6;
const ABSORB_HEAL = 4;
const ROUGH_SKIN_LOSS = 8;
const BURN_LOSS = 16;
const POISON_LOSS = 8;
const MAX_SLEEP_TURNS = 3;
/** Los tipos que no pueden tener un estado. */
const STATUS_IMMUNE: Partial<Record<Status, TypeName[]>> = { burn: ["fire"], poison: ["poison", "steel"], paralysis: ["electric"] };

const noStages = (): Record<BoostStat, number> => ({ attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 });
const otherSeat = (seat: Seat): Seat => (seat === 1 ? 2 : 1);

export function moveData(id: string): MoveData | undefined {
  return id === STRUGGLE ? STRUGGLE_MOVE : getMoveBook().moves[id];
}

export function newFighter(pokemon: CombatPokemon, set: MoveSet = moveSetOf(pokemon.id)): Fighter {
  const maxHp = combatHp(pokemon.stats.hp);
  const moves = set.moves.map((id) => ({ id, pp: moveData(id)?.pp ?? 1 }));
  return { pokemon, hp: maxHp, maxHp, moves, status: null, sleepTurns: 0, stages: noStages(), ability: set.ability };
}

export const hpShare = (fighter: Fighter): number => fighter.hp / fighter.maxHp;

/** Los que puede usar ahora. Sin PP en ninguno, Forcejeo. */
export function availableMoves(fighter: Fighter): BattleMove[] {
  const withPp = fighter.moves.filter((move) => move.pp > 0).map((move) => move.id);
  return withPp.length > 0 ? withPp : [STRUGGLE];
}

export function stageMultiplier(stage: number): number {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

const effectiveStat = (fighter: Fighter, stat: BoostStat): number => fighter.pokemon.stats[stat] * stageMultiplier(fighter.stages[stat]);

export function moveEffectiveness(id: BattleMove, defender: Fighter): number {
  const move = moveData(id);
  if (!move || id === STRUGGLE) return 1;
  if (isImmuneByAbility(defender.ability, move.type)) return 0;
  return defender.pokemon.types.reduce((total, type) => total * typeEffectiveness(move.type, type), 1);
}

export function moveDamage(attacker: Fighter, defender: Fighter, id: BattleMove, options: { critical?: boolean } = {}): number {
  const move = moveData(id);
  if (!move || move.category === "status") return 0;
  const physical = move.category === "physical";
  const sameType = id !== STRUGGLE && attacker.pokemon.types.includes(move.type);
  const stab = sameType ? (attacker.ability === "adaptability" ? 2 : STAB) : 1;
  const burned = attacker.status === "burn" && physical && attacker.ability !== "guts" ? 0.5 : 1;
  const inPinch = attacker.hp * 3 <= attacker.maxHp;
  const modifier = attackerModifier(attacker.ability, move, inPinch, attacker.status !== null) * defenderModifier(defender.ability, move);
  return damage({
    power: (move.power ?? 0) * POWER_SCALE * stab * burned * modifier,
    attack: effectiveStat(attacker, physical ? "attack" : "spAttack"),
    defense: effectiveStat(defender, physical ? "defense" : "spDefense"),
    effectiveness: moveEffectiveness(id, defender),
    critical: options.critical ?? false,
  });
}

/** El ataque que más daño hace: es lo que se usa si alguien no elige a tiempo. */
export function bestMove(attacker: Fighter, defender: Fighter): BattleMove {
  const available = availableMoves(attacker);
  const attacks = available.filter((id) => moveData(id)?.category !== "status");
  if (attacks.length === 0) return available[0]!;
  return attacks.reduce((top, id) => (moveDamage(attacker, defender, id) > moveDamage(attacker, defender, top) ? id : top));
}

/** Si el tipo o la habilidad impiden un estado. */
export function statusBlockedBy(fighter: Fighter, status: Status): boolean {
  return guardsStatus(fighter.ability, status) || fighter.pokemon.types.some((type) => STATUS_IMMUNE[status]?.includes(type));
}

function applyStatus(target: Fighter, seat: Seat, status: Status, rng: Rng, notes: BattleNote[]): boolean {
  if (target.status !== null || target.hp <= 0 || statusBlockedBy(target, status)) return false;
  target.status = status;
  if (status === "sleep") target.sleepTurns = 1 + rng.int(MAX_SLEEP_TURNS);
  notes.push({ kind: "status", seat, status });
  return true;
}

function changeStat(target: Fighter, seat: Seat, stat: BoostStat, change: number, fromRival: boolean, notes: BattleNote[]): boolean {
  if (fromRival && change < 0 && (target.ability === "clear-body" || (target.ability === "hyper-cutter" && stat === "attack"))) {
    notes.push({ kind: "ability", seat, ability: target.ability });
    return false;
  }
  const next = Math.max(-MAX_STAGE, Math.min(MAX_STAGE, target.stages[stat] + change));
  if (next === target.stages[stat]) return false;
  notes.push({ kind: "stat", seat, stat, change: next - target.stages[stat] });
  target.stages[stat] = next;
  return true;
}

export function clearStages(fighter: Fighter): void {
  fighter.stages = noStages();
}

/** Sale del combate: pierde sus niveles de stats y conserva el estado, salvo Cura Natural. */
export function leaveBattle(fighter: Fighter): void {
  clearStages(fighter);
  if (fighter.ability === "natural-cure") {
    fighter.status = null;
    fighter.sleepTurns = 0;
  }
}

/** Lo que pasa al salir a pelear: al cambiar y al empezar un asalto. */
export function enterBattle(fighter: Fighter, rival: Fighter, seat: Seat): BattleNote[] {
  if (fighter.ability !== "intimidate") return [];
  const notes: BattleNote[] = [{ kind: "ability", seat, ability: "intimidate" }];
  changeStat(rival, otherSeat(seat), "attack", -1, true, notes);
  return notes;
}

function applyEffects(move: MoveData, me: Fighter, rival: Fighter, actor: Seat, rng: Rng, notes: BattleNote[]): boolean {
  const target = otherSeat(actor);
  let applied = false;
  const { ailment, ailmentChance = 100, stats = [] } = move.effect;
  if (ailment && rng.int(100) < ailmentChance) applied = applyStatus(rival, target, ailment, rng, notes) || applied;
  // Una sola tirada por movimiento: si sube cinco stats, suben los cinco o ninguno.
  if (stats.length === 0 || rng.int(100) >= stats[0]!.chance) return applied;
  for (const change of stats) {
    const onUser = change.target === "user";
    applied = changeStat(onUser ? me : rival, onUser ? actor : target, change.stat, change.change, !onUser, notes) || applied;
  }
  return applied;
}

/** No actúa si duerme, o a veces si está paralizado. */
function blockedBy(me: Fighter, seat: Seat, rng: Rng, notes: BattleNote[]): "sleep" | "paralysis" | null {
  if (me.status === "sleep") {
    if (me.sleepTurns > 0) {
      me.sleepTurns--;
      return "sleep";
    }
    me.status = null;
    notes.push({ kind: "woke", seat });
  }
  return me.status === "paralysis" && rng.int(PARALYSIS_ODDS) === 0 ? "paralysis" : null;
}

function useMove(id: BattleMove, me: Fighter, rival: Fighter, actor: Seat, rng: Rng, options: { criticals?: boolean }): BattleAction {
  const move = moveData(id) ?? STRUGGLE_MOVE;
  const target = otherSeat(actor);
  const notes: BattleNote[] = [];
  const action: BattleAction = { actor, move: id, moveName: move.names.es, damage: 0, critical: false, effectiveness: 1, healed: 0, actorHp: me.hp, targetHp: rival.hp, missed: false, blocked: blockedBy(me, actor, rng, notes), notes };
  const finish = () => ({ ...action, actorHp: me.hp, targetHp: rival.hp });
  if (action.blocked) return finish();

  const slot = me.moves.find((one) => one.id === id);
  if (slot) slot.pp--;
  if (move.accuracy !== null && rng.int(100) >= move.accuracy) {
    action.missed = true;
    return finish();
  }

  if (move.category === "status") {
    if (move.effect.healing) {
      action.healed = Math.min(me.maxHp - me.hp, Math.round((me.maxHp * move.effect.healing) / 100));
      me.hp += action.healed;
      if (action.healed === 0) notes.push({ kind: "failed" });
      return finish();
    }
    action.effectiveness = move.effect.ailment ? moveEffectiveness(id, rival) : 1;
    if (action.effectiveness === 0) return finish();
    const before = notes.length;
    if (!applyEffects(move, me, rival, actor, rng, notes) && notes.length === before) notes.push(move.effect.ailment ? { kind: "no_effect", seat: target } : { kind: "failed" });
    return finish();
  }

  action.effectiveness = moveEffectiveness(id, rival);
  if (action.effectiveness === 0) {
    if (isImmuneByAbility(rival.ability, move.type)) {
      notes.push({ kind: "ability", seat: target, ability: rival.ability! });
      if (healsWhenHit(rival.ability)) {
        const amount = Math.min(rival.maxHp - rival.hp, Math.floor(rival.maxHp / ABSORB_HEAL));
        rival.hp += amount;
        notes.push({ kind: "healed", seat: target, amount });
      }
    }
    return finish();
  }
  action.critical = options.criticals !== false && rng.int(CRITICAL_ODDS) === 0;
  let dealt = Math.min(rival.hp, moveDamage(me, rival, id, { critical: action.critical }));
  if (rival.ability === "sturdy" && rival.hp === rival.maxHp && dealt >= rival.hp) {
    dealt = rival.hp - 1;
    notes.push({ kind: "ability", seat: target, ability: "sturdy" });
  }
  rival.hp -= dealt;
  action.damage = dealt;

  if (id === STRUGGLE) {
    const recoil = Math.min(me.hp, Math.floor(me.maxHp / STRUGGLE_RECOIL));
    me.hp -= recoil;
    notes.push({ kind: "recoil", seat: actor, damage: recoil });
  } else if (rival.hp > 0) {
    applyEffects(move, me, rival, actor, rng, notes);
  }
  // Un ataque físico es el que toca: los juegos lo deciden movimiento por movimiento, aquí basta con eso.
  if (move.category === "physical" && dealt > 0 && rival.ability) {
    const status = CONTACT_STATUS[rival.ability];
    if (status && rng.int(CONTACT_ODDS) < 3 && applyStatus(me, actor, status, rng, notes)) notes.push({ kind: "ability", seat: target, ability: rival.ability });
    if (rival.ability === "rough-skin" && me.hp > 0) {
      const lost = Math.min(me.hp, Math.floor(me.maxHp / ROUGH_SKIN_LOSS));
      me.hp -= lost;
      notes.push({ kind: "ability", seat: target, ability: "rough-skin" }, { kind: "recoil", seat: actor, damage: lost });
    }
  }
  return finish();
}

const speedOf = (fighter: Fighter): number => effectiveStat(fighter, "speed") * (fighter.status === "paralysis" ? 0.5 : 1);

/** Resuelve un turno y modifica a los dos: ataca primero el más rápido, y un debilitado ya no ataca. Sin elección (cambió de Pokémon) no hace nada. */
export function resolveTurn(sides: Record<Seat, Fighter>, choices: Record<Seat, BattleMove | null>, rng: Rng, options: { criticals?: boolean } = {}): BattleAction[] {
  const [speedA, speedB] = [speedOf(sides[1]), speedOf(sides[2])];
  const first: Seat = speedA === speedB ? (rng.int(2) === 0 ? 1 : 2) : speedA > speedB ? 1 : 2;
  const actions: BattleAction[] = [];
  for (const actor of [first, otherSeat(first)]) {
    const me = sides[actor];
    const move = choices[actor];
    // Si el rival cayó por su propio retroceso, no hay a quién atacar.
    if (me.hp <= 0 || move === null || sides[otherSeat(actor)].hp <= 0) continue;
    actions.push(useMove(move, me, sides[otherSeat(actor)], actor, rng, options));
  }
  return actions;
}

/** Lo que pasa al acabar el turno: la quemadura, el veneno e Impulso. */
export function endOfTurn(sides: Record<Seat, Fighter>): BattleNote[] {
  const notes: BattleNote[] = [];
  for (const seat of [1, 2] as const) {
    const fighter = sides[seat];
    if (fighter.hp <= 0) continue;
    if (fighter.status === "burn" || fighter.status === "poison") {
      const lost = Math.min(fighter.hp, Math.max(1, Math.floor(fighter.maxHp / (fighter.status === "burn" ? BURN_LOSS : POISON_LOSS))));
      fighter.hp -= lost;
      notes.push({ kind: "residual", seat, cause: fighter.status, damage: lost });
    }
    if (fighter.hp > 0 && fighter.ability === "speed-boost" && changeStat(fighter, seat, "speed", 1, false, notes)) notes.push({ kind: "ability", seat, ability: "speed-boost" });
  }
  return notes;
}

/** Si caen los dos en el mismo turno, solo uno pierde el asalto: el más lento; si empatan, al azar. */
export function bothFallenLoser(fighters: Record<Seat, Fighter>, rng: Rng): Seat {
  const diff = fighters[1].pokemon.stats.speed - fighters[2].pokemon.stats.speed;
  if (diff === 0) return rng.int(2) === 0 ? 1 : 2;
  return diff < 0 ? 1 : 2;
}

/** Al llegar al límite de turnos cae quien tiene menos porcentaje de PS; si empatan, el más lento; si no, al azar. */
export function roundLimitLoser(fighters: Record<Seat, Fighter>, rng: Rng): Seat {
  const [a, b] = [fighters[1], fighters[2]];
  const diff = hpShare(a) - hpShare(b) || a.pokemon.stats.speed - b.pokemon.stats.speed;
  if (diff === 0) return rng.int(2) === 0 ? 1 : 2;
  return diff < 0 ? 1 : 2;
}
