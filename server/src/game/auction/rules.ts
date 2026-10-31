import type { TypeName } from "@pokemon-minigames/shared";
import type { Rng } from "../rng.js";

/** Valores de Subasta Pokémon. Son de partida: los ajusta lo que diga el simulador (`npm run auction:simulate -w server`). */
export const STARTING_MONEY = 2_000_000;
/** Una silueta trampa de cada tantos lotes. */
export const TRAP_ODDS = 6;
/** Tiempo de turno sin decidir antes del aviso «¿Sigues ahí?»: no hay reloj a la vista. */
export const INACTIVITY_MS = 60_000;
export const INACTIVITY_WARNING_MS = 15_000;
/** Cuántas veces por turno vale «Sigo aquí»: nadie puede hacer esperar al otro para siempre. */
export const MAX_STILL_HERE = 2;
/** Lo que se muestra un lote que se reparte solo porque alguien ya completó su equipo. */
export const AUTO_LOT_MS = 2_000;
/** La revelación: 3 s por Pokémon, y se salta si los dos confirman. */
export const REVEAL_MS = 36_000;
export const LINEUP_MS = 30_000;
/** Lo que espera el servidor tras resolver un turno, para que la pantalla lo anime. */
export const TURN_ANIMATION_MS = 3_000;
export const PAUSE_MS = 15_000;
export const TEAM_SIZE = 6;
export const LOTS_PER_THIRD = 4;
/** Lo que se reserva por cada hueco del equipo, para poder completarlo. */
export const SLOT_RESERVE = 50_000;
export const PRICE_PER_STAT = 300;
export const TYPE_MOVE_POWER = 30;
export const STRUGGLE_POWER = 20;
export const MAX_TURNS_PER_ROUND = 20;
/** Un crítico de cada tantos ataques. */
export const CRITICAL_ODDS = 16;
const CRITICAL_MULTIPLIER = 1.5;
const MIN_DAMAGE = 5;
const MIN_RATIO = 0.25;
const MAX_RATIO = 4;
const HP_BONUS = 60;

export type MoveCategory = "physical" | "special";

export interface AttackMove {
  /** El tipo del ataque, o `forcejeo`. */
  name: TypeName | "forcejeo";
  /** Forcejeo no tiene tipo: siempre hace ×1, y así dos Pokémon inmunes entre sí pueden hacerse daño. */
  type: TypeName | null;
  power: number;
  category: MoveCategory;
}

const PHYSICAL_TYPES: readonly TypeName[] = ["normal", "fighting", "flying", "poison", "ground", "rock", "bug", "ghost", "steel"];

export function combatHp(baseHp: number): number {
  return baseHp + HP_BONUS;
}

/** Físico o especial según el tipo, con la regla de los juegos clásicos. */
export function moveCategory(type: TypeName): MoveCategory {
  return PHYSICAL_TYPES.includes(type) ? "physical" : "special";
}

export function movesFor(types: readonly TypeName[]): AttackMove[] {
  return [
    ...types.map((type) => ({ name: type, type, power: TYPE_MOVE_POWER, category: moveCategory(type) })),
    { name: "forcejeo", type: null, power: STRUGGLE_POWER, category: "physical" },
  ];
}

export interface DamageInput {
  power: number;
  attack: number;
  defense: number;
  effectiveness: number;
  critical?: boolean;
}

/** La raíz y el límite del cociente acercan los extremos: ni Shuckle hace 0,6 de daño ni Chansey cae de un golpe. */
export function damage({ power, attack, defense, effectiveness, critical = false }: DamageInput): number {
  if (effectiveness === 0) return 0;
  const ratio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, attack / defense));
  const dealt = power * Math.sqrt(ratio) * effectiveness * (critical ? CRITICAL_MULTIPLIER : 1);
  return Math.max(MIN_DAMAGE, Math.round(dealt));
}

/** El valor aproximado de una silueta: 300 por punto de stats, ±20 % y redondeado a miles. */
export function startingPrice(total: number, rng: Rng): number {
  const percent = 80 + rng.int(41);
  return Math.round((total * PRICE_PER_STAT * percent) / 100 / 1000) * 1000;
}

/** Lo máximo que se puede pujar por un Pokémon: lo que deja dinero para los huecos que queden después de este lote. */
export function bidCap(money: number, teamSize: number): number {
  const slotsAfterThis = TEAM_SIZE - teamSize - 1;
  return Math.max(0, money - slotsAfterThis * SLOT_RESERVE);
}

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/** Doce lotes en orden al azar: cuatro de cada tercio del catálogo por total de stats. */
export function drawLots<T extends { id: number; total: number }>(pokemon: readonly T[], rng: Rng): T[] {
  const sorted = [...pokemon].sort((a, b) => a.total - b.total || a.id - b.id);
  const lots: T[] = [];
  for (let third = 0; third < 3; third++) {
    const from = Math.floor((sorted.length * third) / 3);
    const to = Math.floor((sorted.length * (third + 1)) / 3);
    const group = sorted.slice(from, to);
    lots.push(...shuffled(group, rng).slice(0, LOTS_PER_THIRD));
  }
  return shuffled(lots, rng);
}
