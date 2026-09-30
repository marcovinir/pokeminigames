import type { PickResult, Seat } from "@pokemon-minigames/shared";
import type { CatalogPokemon, PokemonCatalog, TypePair } from "../../catalog/pokemon-catalog.js";
import type { Rng } from "../rng.js";
import { type PickState, SEATS } from "./types.js";

export interface ResolveInput {
  pair: TypePair;
  picks: Partial<Record<Seat, PickState>>;
  /** Pokémon ya reclamados en rondas anteriores y quién los tiene. */
  owners: ReadonlyMap<number, Seat>;
  catalog: PokemonCatalog;
  rng: Rng;
  /** Dos respuestas al mismo Pokémon con menos diferencia que esto cuentan como simultáneas. */
  windowMs: number;
}

export interface PickOutcome {
  result: PickResult;
  pokemonId: number | null;
}

/**
 * Resuelve las respuestas de una ronda. Orden de las comprobaciones: existe, tiene ambos
 * tipos, no está reclamado. ALREADY_OWNED si ya está en tu equipo; TAKEN si lo tiene el
 * rival (de una ronda anterior) o si perdiste la carrera de esta ronda.
 */
export function resolveRound(input: ResolveInput): Record<Seat, PickOutcome> {
  const { pair, picks, owners, catalog, rng, windowMs } = input;
  const outcomes = {} as Record<Seat, PickOutcome>;
  const candidates: Partial<Record<Seat, CatalogPokemon>> = {};

  for (const seat of SEATS) {
    const pick = picks[seat];
    if (!pick) {
      outcomes[seat] = { result: "NO_ANSWER", pokemonId: null };
      continue;
    }
    const pokemon = catalog.resolveName(pick.text);
    if (!pokemon) {
      outcomes[seat] = { result: "NOT_FOUND", pokemonId: null };
    } else if (!catalog.matchesPair(pokemon, pair)) {
      outcomes[seat] = { result: "WRONG_TYPES", pokemonId: null };
    } else {
      const owner = owners.get(pokemon.id);
      if (owner === seat) {
        outcomes[seat] = { result: "ALREADY_OWNED", pokemonId: null };
      } else if (owner !== undefined) {
        outcomes[seat] = { result: "TAKEN", pokemonId: null };
      } else {
        candidates[seat] = pokemon;
      }
    }
  }

  const first = candidates[1];
  const second = candidates[2];
  if (first && second && first.id === second.id) {
    // Carrera por el mismo Pokémon.
    const at1 = picks[1]!.at;
    const at2 = picks[2]!.at;
    let winner: Seat;
    if (Math.abs(at1 - at2) < windowMs) {
      winner = rng.int(2) === 0 ? 1 : 2;
    } else {
      winner = at1 < at2 ? 1 : 2;
    }
    const loser: Seat = winner === 1 ? 2 : 1;
    outcomes[winner] = { result: "VALID", pokemonId: first.id };
    outcomes[loser] = { result: "TAKEN", pokemonId: null };
    return outcomes;
  }

  for (const seat of SEATS) {
    const pokemon = candidates[seat];
    if (pokemon) outcomes[seat] = { result: "VALID", pokemonId: pokemon.id };
  }
  return outcomes;
}
