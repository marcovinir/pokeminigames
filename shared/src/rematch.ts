import type { GameResult } from "./stats.js";
import type { BaseStats, TypeName } from "./types.js";

/**
 * Cómo está la oferta de revancha desde el punto de vista de quien la mira:
 * - `open`: se puede pedir; `mine`: yo la pedí y espero al rival; `theirs`: la pidió el rival y decido yo;
 * - `starting`: los dos aceptaron y el servidor está creando la sala; `closed`: terminó sin revancha (ver `closedReason`).
 */
export type RematchStatus = "open" | "mine" | "theirs" | "starting" | "closed";

/**
 * Por qué se cerró la oferta, visto por quien lo recibe: `self` (cancelé yo: no hay aviso), `declined` (mi rival canceló o
 * rechazó), `left` (se fue), `timeout` (pasaron 60 s desde la primera petición), `unavailable` (pasaron 5 minutos sin que
 * nadie la pidiera) y `failed` (no se pudo crear la sala).
 */
export type RematchClosedReason = "self" | "declined" | "left" | "timeout" | "unavailable" | "failed";

/** El récord entre dos cuentas, desde el punto de vista de quien lo mira. `recent`: las últimas partidas, la más reciente primero. */
export interface RematchRecord {
  mine: number;
  theirs: number;
  draws: number;
  played: number;
  recent: GameResult[];
}

export interface RematchState {
  /** Hora del servidor (ms) al generar el estado: sirve para el desfase del reloj. */
  serverNow: number;
  status: RematchStatus;
  /** Hasta cuándo vale el estado actual (hora del servidor, ms): el tope para pedir o el plazo para responder. */
  deadline: number | null;
  closedReason?: RematchClosedReason;
  /** Solo si las dos personas tienen cuenta y la partida recién terminada se guardó. */
  record?: RematchRecord;
}

/** Un Pokémon con su nombre en español, para los datos curiosos. */
export interface FactPokemon {
  id: number;
  es: string;
}

/** Un dato curioso calculado del catálogo; el cliente lo redacta en español con sus etiquetas. */
export type PokemonFact =
  | { kind: "top_stat"; stat: keyof BaseStats | "total"; pokemon: FactPokemon[]; value: number }
  | { kind: "lowest_total"; pokemon: FactPokemon[]; value: number }
  | { kind: "type_count"; type: TypeName; count: number }
  | { kind: "dual_type_count"; count: number; total: number }
  | { kind: "pair_count"; count: number }
  | { kind: "common_pair"; pair: [TypeName, TypeName]; count: number };
