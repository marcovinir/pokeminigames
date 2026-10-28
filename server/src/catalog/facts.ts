import { type BaseStats, type FactPokemon, type PokemonFact, TYPE_NAMES } from "@pokemon-minigames/shared";
import { type CatalogPokemon, PokemonCatalog } from "./pokemon-catalog.js";

const STATS: readonly (keyof BaseStats)[] = ["hp", "attack", "defense", "spAttack", "spDefense", "speed"];

/** Si más Pokémon que esto comparten el máximo o el mínimo, el dato deja de ser una curiosidad y se omite. */
const MAX_TIED = 3;

const named = (pokemon: CatalogPokemon): FactPokemon => ({ id: pokemon.id, es: pokemon.names.es });

/** El valor más alto o más bajo y quiénes lo tienen (por id); `null` si no hay datos o el empate es demasiado grande. */
function extreme(
  list: readonly CatalogPokemon[],
  value: (pokemon: CatalogPokemon) => number,
  pick: "max" | "min",
): { value: number; pokemon: FactPokemon[] } | null {
  if (list.length === 0) return null;
  const values = list.map(value);
  const best = pick === "max" ? Math.max(...values) : Math.min(...values);
  const tied = list.filter((pokemon) => value(pokemon) === best).sort((a, b) => a.id - b.id);
  return tied.length > MAX_TIED ? null : { value: best, pokemon: tied.map(named) };
}

/**
 * Datos curiosos del catálogo para la pantalla de espera de la revancha. Todo sale de los datos (nunca se escribe una
 * cifra a mano), así que siguen siendo ciertos si el catálogo cambia. El cliente los redacta en español.
 */
export function buildFacts(catalog: PokemonCatalog): PokemonFact[] {
  const all = catalog.all();
  const facts: PokemonFact[] = [];

  const top = extreme(all, (pokemon) => pokemon.totalStats, "max");
  if (top) facts.push({ kind: "top_stat", stat: "total", ...top });
  const lowest = extreme(all, (pokemon) => pokemon.totalStats, "min");
  if (lowest) facts.push({ kind: "lowest_total", ...lowest });
  for (const stat of STATS) {
    const best = extreme(all, (pokemon) => pokemon.stats[stat], "max");
    if (best) facts.push({ kind: "top_stat", stat, ...best });
  }

  // El tipo más común y el más raro (antes era un dato por tipo: 18 casi iguales). Con empate no se dice ninguno.
  const typeCounts = TYPE_NAMES.map((type) => ({ type, count: all.filter((pokemon) => pokemon.types.includes(type)).length })).filter(
    ({ count }) => count > 0,
  );
  if (typeCounts.length > 0) {
    for (const which of ["most", "least"] as const) {
      const target = which === "most" ? Math.max(...typeCounts.map((t) => t.count)) : Math.min(...typeCounts.map((t) => t.count));
      const leaders = typeCounts.filter((t) => t.count === target);
      if (leaders.length === 1) facts.push({ kind: "type_extreme", which, type: leaders[0]!.type, count: target });
    }
  }

  if (all.length > 0) {
    facts.push({ kind: "dual_type_count", count: all.filter((pokemon) => pokemon.types.length === 2).length, total: all.length });
  }

  const pairs = new Map<string, { pair: [(typeof TYPE_NAMES)[number], (typeof TYPE_NAMES)[number]]; count: number }>();
  for (const pokemon of all) {
    if (pokemon.types.length !== 2) continue;
    const [one, two] = PokemonCatalog.orderPair(pokemon.types[0]!, pokemon.types[1]!);
    const entry = pairs.get(`${one}|${two}`) ?? { pair: [one, two], count: 0 };
    entry.count++;
    pairs.set(`${one}|${two}`, entry);
  }
  if (pairs.size > 0) {
    facts.push({ kind: "pair_count", count: pairs.size });
    const most = Math.max(...[...pairs.values()].map((entry) => entry.count));
    const leaders = [...pairs.values()].filter((entry) => entry.count === most);
    if (leaders.length === 1) facts.push({ kind: "common_pair", pair: leaders[0]!.pair, count: most });
  }

  return facts;
}
