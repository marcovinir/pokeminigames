import { BID_STEPS, type BaseStats, type BattleMove, type TypeName } from "@pokemon-minigames/shared";
import type { Rng } from "../rng.js";
import { pickOne } from "../rng.js";
import { type Fighter, bestMove, hpShare, newFighter, resolveTurn, roundLimitLoser } from "./combat.js";
import {
  MAX_TURNS_PER_ROUND,
  STARTING_MONEY,
  TRAP_ODDS,
  TEAM_SIZE,
  bidCap,
  drawLots,
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

const HEAL_BELOW = 0.35;

export interface Strategy {
  name: string;
  /** Cuánto paga como máximo por un Pokémon, sobre su precio inicial. Solo ve el total de la silueta mostrada. */
  pokemonFactor: (shownTotal: number) => number;
}

export const STRATEGIES = {
  tacaña: { name: "tacaña", pokemonFactor: () => 0.95 },
  equilibrada: { name: "equilibrada", pokemonFactor: () => 1.3 },
  derrochadora: { name: "derrochadora", pokemonFactor: () => 2.5 },
  // Reconoce las siluetas: paga mucho por las fuertes y poco por las débiles.
  experta: { name: "experta", pokemonFactor: (total: number) => (total >= 500 ? 2 : total >= 380 ? 1.2 : 0.9) },
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
}

/**
 * Una puja abierta por turnos. Retirarse es definitivo: si hay puja, el otro se la lleva; si no, el otro la abre y se la
 * lleva a ese precio, o también se retira y no hay venta (`null`).
 */
function runBidding(starter: Seat, price: number, limitOf: (seat: Seat) => number, rng: Rng, count: () => void): { winner: Seat; paid: number } | null {
  let current: number | null = null;
  let leader: Seat | null = null;
  let turn = starter;
  let firstRetired = false;
  for (;;) {
    count();
    const next: number = current === null ? price : current + pickOne(rng, BID_STEPS);
    if (next <= limitOf(turn)) {
      current = next;
      leader = turn;
      if (firstRetired) return { winner: leader, paid: current };
      turn = other(turn);
      continue;
    }
    if (leader !== null) return { winner: leader, paid: current! };
    if (firstRetired) return null;
    firstRetired = true;
    turn = other(turn);
  }
}

/** La misma puja con límites fijos y saltos dados, para probar sus reglas. */
export function openingBid(price: number, limits: { first: number; second: number }, steps: readonly number[]): { winner: Seat; paid: number } | null {
  let index = 0;
  const rng: Rng = { int: () => index++ % steps.length };
  const stepAware: Rng = { int: (max) => (max === BID_STEPS.length ? BID_STEPS.indexOf(steps[rng.int(steps.length)] as never) : 0) };
  return runBidding(0, price, (seat) => (seat === 0 ? limits.first : limits.second), stepAware, () => undefined);
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

  const shownIds = new Set(lots.map((lot) => lot.id));
  const decoys = () => pool.filter((one) => !shownIds.has(one.id));

  lots.forEach((real, index) => {
    const isTrap = options.traps && rng.int(TRAP_ODDS) === 0;
    let shown = real;
    if (isTrap) {
      shown = pickOne(rng, decoys());
      shownIds.add(shown.id);
      result.traps++;
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
      // Solo se turnan en los lotes con puja, como en el motor.
      starter = other(starter);
    }
  });
}

interface Side {
  fighters: Fighter[];
  titular: Fighter | null;
  healed: boolean;
}

const alive = (side: Side) => side.fighters.filter((fighter) => fighter.hp > 0);
const strongest = (fighters: Fighter[]) => [...fighters].sort((a, b) => totalOf(b) - totalOf(a))[0] ?? null;
const totalOf = (fighter: Fighter) => (fighter.pokemon as AuctionPokemon).total;

/** Lo que haría alguien razonable en la pausa: sacar a su mejor Pokémon si cayó el titular. */
function prepare(side: Side): void {
  if (!side.titular || side.titular.hp <= 0) side.titular = strongest(alive(side));
  side.healed = false;
}

function choose(me: Side, rival: Side): BattleMove {
  if (!me.healed && hpShare(me.titular!) < HEAL_BELOW) return "recuperar";
  return bestMove(me.titular!, rival.titular!);
}

function runBattle(players: [Player, Player], options: SimulationOptions, rng: Rng, result: SimulationResult): Seat {
  const sides = players.map((player) => ({
    fighters: player.team.map(newFighter),
    titular: null,
    healed: false,
  })) as [Side, Side];
  for (const side of sides) side.titular = strongest(alive(side));

  for (;;) {
    const [a, b] = [sides[0].titular!, sides[1].titular!];
    let turns = 0;
    while (a.hp > 0 && b.hp > 0 && turns < MAX_TURNS_PER_ROUND) {
      turns++;
      const combat = { 1: { fighter: a, healed: sides[0].healed, cinta: false }, 2: { fighter: b, healed: sides[1].healed, cinta: false } };
      const actions = resolveTurn(combat, { 1: choose(sides[0], sides[1]), 2: choose(sides[1], sides[0]) }, rng, { criticals: options.criticals !== false });
      result.criticals += actions.filter((action) => action.critical).length;
      sides[0].healed = combat[1].healed;
      sides[1].healed = combat[2].healed;
    }
    if (a.hp > 0 && b.hp > 0) {
      result.roundsAtLimit++;
      (roundLimitLoser({ 1: a, 2: b }, rng) === 1 ? a : b).hp = 0;
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
  const newPlayer = (strategy: Strategy): Player => ({ strategy, money: STARTING_MONEY, team: [] });
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
