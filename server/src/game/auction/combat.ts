import { type AuctionItem, type BaseStats, type BattleAction, type BattleMove, type Seat, type TypeName, typeEffectiveness } from "@pokemon-minigames/shared";
import type { Rng } from "../rng.js";
import { CRITICAL_ODDS, combatHp, damage, movesFor } from "./rules.js";

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
}

/** Lo de un asalto: quién pelea, si ya usó Recuperar y si lleva la Cinta. */
export interface CombatSide {
  fighter: Fighter;
  healed: boolean;
  cinta: boolean;
}

const CINTA_MULTIPLIER = 1.25;
const HEAL_FRACTION = 0.25;
const REVIVE_FRACTION = 0.5;

export function newFighter(pokemon: CombatPokemon): Fighter {
  const maxHp = combatHp(pokemon.stats.hp);
  return { pokemon, hp: maxHp, maxHp };
}

export const hpShare = (fighter: Fighter): number => fighter.hp / fighter.maxHp;

/** Los movimientos de un Pokémon: un ataque por tipo, Forcejeo y Recuperar. */
export function movesOf(fighter: Fighter): BattleMove[] {
  return [...movesFor(fighter.pokemon.types).map((move) => move.name), "recuperar"];
}

export function moveEffectiveness(move: BattleMove, defender: Fighter): number {
  if (move === "forcejeo" || move === "recuperar") return 1;
  return defender.pokemon.types.reduce((total, type) => total * typeEffectiveness(move, type), 1);
}

export function moveDamage(attacker: Fighter, defender: Fighter, move: BattleMove, options: { critical?: boolean; cinta?: boolean } = {}): number {
  const attack = movesFor(attacker.pokemon.types).find((one) => one.name === move);
  if (!attack) return 0;
  const physical = attack.category === "physical";
  const dealt = damage({
    power: attack.power,
    attack: physical ? attacker.pokemon.stats.attack : attacker.pokemon.stats.spAttack,
    defense: physical ? defender.pokemon.stats.defense : defender.pokemon.stats.spDefense,
    effectiveness: moveEffectiveness(move, defender),
    critical: options.critical ?? false,
  });
  return options.cinta ? Math.round(dealt * CINTA_MULTIPLIER) : dealt;
}

/** El ataque que más daño hace: es lo que se usa si alguien no elige a tiempo. */
export function bestMove(attacker: Fighter, defender: Fighter): BattleMove {
  return movesFor(attacker.pokemon.types)
    .map((move) => move.name)
    .reduce((top, move) => (moveDamage(attacker, defender, move) > moveDamage(attacker, defender, top) ? move : top));
}

const otherSeat = (seat: Seat): Seat => (seat === 1 ? 2 : 1);

/** Resuelve un turno y modifica a los dos: ataca primero el más rápido, y un debilitado ya no ataca. */
export function resolveTurn(sides: Record<Seat, CombatSide>, choices: Record<Seat, BattleMove>, rng: Rng, options: { criticals?: boolean } = {}): BattleAction[] {
  const [speedA, speedB] = [sides[1].fighter.pokemon.stats.speed, sides[2].fighter.pokemon.stats.speed];
  const first: Seat = speedA === speedB ? (rng.int(2) === 0 ? 1 : 2) : speedA > speedB ? 1 : 2;
  const actions: BattleAction[] = [];
  for (const actor of [first, otherSeat(first)]) {
    const me = sides[actor];
    const rival = sides[otherSeat(actor)];
    if (me.fighter.hp <= 0) continue;
    const move = choices[actor];
    if (move === "recuperar") {
      const healed = Math.min(me.fighter.maxHp - me.fighter.hp, Math.round(me.fighter.maxHp * HEAL_FRACTION));
      me.fighter.hp += healed;
      me.healed = true;
      actions.push({ actor, move, damage: 0, critical: false, effectiveness: 1, healed, actorHp: me.fighter.hp, targetHp: rival.fighter.hp });
      continue;
    }
    const effectiveness = moveEffectiveness(move, rival.fighter);
    const critical = effectiveness !== 0 && options.criticals !== false && rng.int(CRITICAL_ODDS) === 0;
    const dealt = Math.min(rival.fighter.hp, moveDamage(me.fighter, rival.fighter, move, { critical, cinta: me.cinta }));
    rival.fighter.hp -= dealt;
    actions.push({ actor, move, damage: dealt, critical, effectiveness, healed: 0, actorHp: me.fighter.hp, targetHp: rival.fighter.hp });
  }
  return actions;
}

/** Usa un objeto sobre un Pokémon. `false` si no sirve con él. La Cinta no va sobre nadie: la aplica el asalto. */
export function applyItem(item: AuctionItem, target: Fighter): boolean {
  if (item === "pocion") {
    if (target.hp <= 0 || target.hp >= target.maxHp) return false;
    target.hp = target.maxHp;
    return true;
  }
  if (item === "revivir") {
    if (target.hp > 0) return false;
    target.hp = Math.round(target.maxHp * REVIVE_FRACTION);
    return true;
  }
  return false;
}

/** Al llegar al límite de turnos cae quien tiene menos porcentaje de PS; si empatan, el más lento; si no, al azar. */
export function roundLimitLoser(fighters: Record<Seat, Fighter>, rng: Rng): Seat {
  const [a, b] = [fighters[1], fighters[2]];
  const diff = hpShare(a) - hpShare(b) || a.pokemon.stats.speed - b.pokemon.stats.speed;
  if (diff === 0) return rng.int(2) === 0 ? 1 : 2;
  return diff < 0 ? 1 : 2;
}
