import { type BaseStats, type TypeName, typeEffectiveness } from "@pokemon-minigames/shared";
import type { Rng } from "../rng.js";
import { pickOne } from "../rng.js";
import {
  type AttackMove,
  CRITICAL_ODDS,
  MAX_TURNS_PER_ROUND,
  STARTING_MONEY,
  TEAM_SIZE,
  bidCap,
  combatHp,
  damage,
  drawLots,
  movesFor,
  startingPrice,
} from "./rules.js";

/**
 * Simulador de Subasta Pokémon, para ajustar los números antes de construir el juego. Sus estrategias son simples: sirven
 * para detectar desequilibrios gordos, no para decir que el juego está equilibrado con personas.
 */
export interface AuctionPokemon {
  id: number;
  types: TypeName[];
  total: number;
  stats: BaseStats;
}

type ItemName = "pocion" | "revivir" | "cinta";

const ITEM_PRICES: Record<ItemName, number> = { pocion: 100_000, revivir: 150_000, cinta: 100_000 };
const ITEMS = Object.keys(ITEM_PRICES) as ItemName[];
const BID_STEPS = [10_000, 50_000, 100_000];
const TRAP_ODDS = 6;
const HEAL_FRACTION = 0.25;
const REVIVE_FRACTION = 0.5;
const POTION_BELOW = 0.4;
const HEAL_BELOW = 0.35;
const CINTA_MULTIPLIER = 1.25;

export interface Strategy {
  name: string;
  /** Cuánto paga como máximo por un Pokémon, sobre su precio inicial. Solo ve el total de la silueta mostrada. */
  pokemonFactor: (shownTotal: number) => number;
  itemFactor: number;
}

export const STRATEGIES = {
  tacaña: { name: "tacaña", pokemonFactor: () => 0.95, itemFactor: 0.9 },
  equilibrada: { name: "equilibrada", pokemonFactor: () => 1.3, itemFactor: 1.1 },
  derrochadora: { name: "derrochadora", pokemonFactor: () => 2.5, itemFactor: 1.5 },
  // Reconoce las siluetas: paga mucho por las fuertes y poco por las débiles.
  experta: { name: "experta", pokemonFactor: (total: number) => (total >= 500 ? 2 : total >= 380 ? 1.2 : 0.9), itemFactor: 1.2 },
} satisfies Record<string, Strategy>;

export interface SimulationOptions {
  traps: boolean;
  criticals?: boolean;
}

export interface SimulationResult {
  winner: 0 | 1;
  teamSizes: [number, number];
  moneyLeft: [number, number];
  /** Partes de la subasta: lo que tarda depende de cuántas pujas hubo. */
  bidTurns: number;
  rounds: number;
  turnsPerRound: number[];
  roundsAtLimit: number;
  traps: number;
  criticals: number;
  /** Dinero gastado por cada jugador. */
  spent: [number, number];
}

/** Azar reproducible (mulberry32): la misma semilla da la misma partida. */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
  return { int: (maxExclusive) => Math.floor(next() * maxExclusive) };
}

type Seat = 0 | 1;
const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0);

interface Player {
  strategy: Strategy;
  money: number;
  team: AuctionPokemon[];
  items: ItemName[];
}

/** Una puja abierta por turnos: gana quien no pasa. `null` si los dos pasan sin pujar. */
function runBidding(starter: Seat, price: number, limitOf: (seat: Seat) => number, rng: Rng, count: () => void): { winner: Seat; paid: number } | null {
  let current: number | null = null;
  let leader: Seat | null = null;
  let turn = starter;
  let firstPassed = false;
  for (;;) {
    count();
    const next: number = current === null ? price : current + pickOne(rng, BID_STEPS);
    if (next <= limitOf(turn)) {
      current = next;
      leader = turn;
      turn = other(turn);
      continue;
    }
    if (leader !== null) return { winner: leader, paid: current! };
    if (firstPassed) return null;
    firstPassed = true;
    turn = other(turn);
  }
}

function runAuction(pool: readonly AuctionPokemon[], players: [Player, Player], options: SimulationOptions, rng: Rng, result: SimulationResult): void {
  const lots = drawLots(pool, rng);
  let starter: Seat = rng.int(2) as Seat;
  const countBid = () => {
    result.bidTurns++;
  };
  const pay = (seat: Seat, price: number) => {
    // Si no le alcanza, se lo lleva gratis: todos terminan con su equipo completo.
    const paid = players[seat].money >= price ? price : 0;
    players[seat].money -= paid;
    result.spent[seat] += paid;
  };

  lots.forEach((real, index) => {
    const isTrap = options.traps && rng.int(TRAP_ODDS) === 0;
    let shown = real;
    if (isTrap) {
      shown = pickOne(rng, pool);
      if (shown.id !== real.id) result.traps++;
    }
    const price = startingPrice(shown.total, rng);
    const full = players.map((player) => player.team.length >= TEAM_SIZE);

    if (full[0] || full[1]) {
      const seat: Seat = full[0] ? 1 : 0;
      pay(seat, price);
      players[seat].team.push(real);
    } else {
      const limitOf = (seat: Seat) => {
        const player = players[seat];
        return Math.min(player.money, bidCap(player.money, player.team.length), price * player.strategy.pokemonFactor(shown.total));
      };
      const sale = runBidding(starter, price, limitOf, rng, countBid);
      if (sale) {
        pay(sale.winner, sale.paid);
        players[sale.winner].team.push(real);
      } else {
        const [a, b] = [players[0].team.length, players[1].team.length];
        const seat: Seat = a === b ? starter : a < b ? 0 : 1;
        pay(seat, price);
        players[seat].team.push(real);
      }
    }
    starter = other(starter);

    if ((index + 1) % 2 === 0) {
      const item = pickOne(rng, ITEMS);
      const itemPrice = ITEM_PRICES[item];
      const limitOf = (seat: Seat) => Math.min(players[seat].money, itemPrice * players[seat].strategy.itemFactor);
      const sale = runBidding(starter, itemPrice, limitOf, rng, countBid);
      if (sale) {
        pay(sale.winner, sale.paid);
        players[sale.winner].items.push(item);
      }
      starter = other(starter);
    }
  });
}

interface Fighter {
  pokemon: AuctionPokemon;
  hp: number;
  maxHp: number;
}

interface Side {
  fighters: Fighter[];
  items: ItemName[];
  titular: Fighter | null;
  healed: boolean;
  cinta: boolean;
}

const alive = (side: Side) => side.fighters.filter((fighter) => fighter.hp > 0);
const hpShare = (fighter: Fighter) => fighter.hp / fighter.maxHp;

function moveDamage(attacker: Fighter, defender: Fighter, move: AttackMove, critical: boolean, cinta: boolean): number {
  const physical = move.category === "physical";
  const effectiveness = move.type === null ? 1 : defender.pokemon.types.reduce((total, type) => total * typeEffectiveness(move.type!, type), 1);
  const dealt = damage({
    power: move.power,
    attack: physical ? attacker.pokemon.stats.attack : attacker.pokemon.stats.spAttack,
    defense: physical ? defender.pokemon.stats.defense : defender.pokemon.stats.spDefense,
    effectiveness,
    critical,
  });
  return cinta ? Math.round(dealt * CINTA_MULTIPLIER) : dealt;
}

/** Lo que haría alguien razonable en la pausa: revivir si no le queda nadie o tiene con qué, curar a quien va mal y sacar a su mejor Pokémon. */
function prepare(side: Side): void {
  const fainted = side.fighters.filter((fighter) => fighter.hp <= 0).sort((a, b) => b.pokemon.total - a.pokemon.total);
  if (fainted[0] && side.items.includes("revivir")) {
    side.items.splice(side.items.indexOf("revivir"), 1);
    fainted[0].hp = Math.round(fainted[0].maxHp * REVIVE_FRACTION);
  }
  const hurt = alive(side).sort((a, b) => hpShare(a) - hpShare(b))[0];
  if (hurt && hpShare(hurt) < POTION_BELOW && side.items.includes("pocion")) {
    side.items.splice(side.items.indexOf("pocion"), 1);
    hurt.hp = hurt.maxHp;
  }
  side.cinta = side.items.includes("cinta");
  if (side.cinta) side.items.splice(side.items.indexOf("cinta"), 1);
  if (!side.titular || side.titular.hp <= 0) side.titular = alive(side).sort((a, b) => b.pokemon.total - a.pokemon.total)[0] ?? null;
  side.healed = false;
}

function act(actor: Side, target: Side, options: SimulationOptions, rng: Rng, result: SimulationResult): void {
  const attacker = actor.titular!;
  const defender = target.titular!;
  if (!actor.healed && hpShare(attacker) < HEAL_BELOW) {
    actor.healed = true;
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + Math.round(attacker.maxHp * HEAL_FRACTION));
    return;
  }
  const best = movesFor(attacker.pokemon.types).reduce((top, move) => (moveDamage(attacker, defender, move, false, false) > moveDamage(attacker, defender, top, false, false) ? move : top));
  const critical = options.criticals !== false && rng.int(CRITICAL_ODDS) === 0;
  if (critical) result.criticals++;
  defender.hp -= moveDamage(attacker, defender, best, critical, actor.cinta);
}

function runBattle(players: [Player, Player], options: SimulationOptions, rng: Rng, result: SimulationResult): Seat {
  const sides = players.map((player) => ({
    fighters: player.team.map((pokemon) => ({ pokemon, hp: combatHp(pokemon.stats.hp), maxHp: combatHp(pokemon.stats.hp) })),
    items: [...player.items],
    titular: null,
    healed: false,
    cinta: false,
  })) as [Side, Side];
  // La alineación del principio no gasta objetos: aún no hay nada que curar.
  for (const side of sides) side.titular = alive(side).sort((a, b) => b.pokemon.total - a.pokemon.total)[0]!;

  for (;;) {
    const [a, b] = [sides[0].titular!, sides[1].titular!];
    let turns = 0;
    while (a.hp > 0 && b.hp > 0 && turns < MAX_TURNS_PER_ROUND) {
      turns++;
      const speedA = a.pokemon.stats.speed;
      const speedB = b.pokemon.stats.speed;
      const first: Seat = speedA === speedB ? (rng.int(2) as Seat) : speedA > speedB ? 0 : 1;
      act(sides[first], sides[other(first)], options, rng, result);
      if (sides[other(first)].titular!.hp > 0) act(sides[other(first)], sides[first], options, rng, result);
    }
    if (a.hp > 0 && b.hp > 0) {
      result.roundsAtLimit++;
      const diff = hpShare(a) - hpShare(b) || a.pokemon.stats.speed - b.pokemon.stats.speed;
      const loser = diff === 0 ? rng.int(2) : diff < 0 ? 0 : 1;
      (loser === 0 ? a : b).hp = 0;
    }
    result.rounds++;
    result.turnsPerRound.push(turns);
    for (const side of sides) prepare(side);
    if (!sides[0].titular) return 1;
    if (!sides[1].titular) return 0;
  }
}

/** Juega una partida completa, de la subasta al último Pokémon. */
export function simulateGame(pool: readonly AuctionPokemon[], strategies: [Strategy, Strategy], options: SimulationOptions, rng: Rng): SimulationResult {
  const newPlayer = (strategy: Strategy): Player => ({ strategy, money: STARTING_MONEY, team: [], items: [] });
  const players: [Player, Player] = [newPlayer(strategies[0]), newPlayer(strategies[1])];
  const result: SimulationResult = {
    winner: 0,
    teamSizes: [0, 0],
    moneyLeft: [0, 0],
    bidTurns: 0,
    rounds: 0,
    turnsPerRound: [],
    roundsAtLimit: 0,
    traps: 0,
    criticals: 0,
    spent: [0, 0],
  };
  runAuction(pool, players, options, rng, result);
  result.teamSizes = [players[0].team.length, players[1].team.length];
  result.moneyLeft = [players[0].money, players[1].money];
  result.winner = runBattle(players, options, rng, result);
  return result;
}
