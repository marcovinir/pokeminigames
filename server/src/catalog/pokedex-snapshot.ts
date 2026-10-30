import type { EvolutionCondition, EvolutionNode, LocalizedText, PokedexAbility, PokedexDetail } from "@pokemon-minigames/shared";
import { type FetchJson, type PokeApiPokemon, type PokeApiSpecies, toPokemonSnapshot } from "./pokeapi.js";
import { totalStats } from "./snapshot.js";

/** Solo los campos de PokéAPI que usa la Pokédex (los de `toPokemonSnapshot` aparte). */
interface PokeApiFlavorEntry {
  flavor_text: string;
  language: { name: string };
  version?: { name: string; url: string };
  version_group?: { name: string; url: string };
}

export interface PokeApiChainLink {
  species: { name: string; url: string };
  evolution_details: PokeApiEvolutionDetails[];
  evolves_to: PokeApiChainLink[];
}

interface PokeApiEvolutionDetails {
  trigger: { name: string };
  item?: { name: string } | null;
  min_level?: number | null;
  min_happiness?: number | null;
  time_of_day?: string;
  [requirement: string]: unknown;
}

export type PokeApiDexPokemon = PokeApiPokemon & { abilities: { is_hidden: boolean; slot: number; ability: { name: string } }[] };

export type PokeApiDexSpecies = PokeApiSpecies & {
  generation: { name: string };
  evolution_chain: { url: string };
  flavor_text_entries: PokeApiFlavorEntry[];
};

interface PokeApiAbility {
  names: PokeApiSpecies["names"];
  flavor_text_entries: PokeApiFlavorEntry[];
}

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix"];

const idFromUrl = (url: string): number => Number(url.replace(/\/$/, "").split("/").pop());
const cleanText = (text: string): string => text.replace(/­/g, "").replace(/[\s\f]+/g, " ").trim();

/** La entrada más reciente en español o, si no hay, en inglés. Nunca se traduce a máquina. */
export function latestLocalized(entries: PokeApiFlavorEntry[]): (LocalizedText & { version: string }) | null {
  for (const language of ["es", "en"] as const) {
    const candidates = entries.filter((entry) => entry.language.name === language);
    if (candidates.length === 0) continue;
    const versionOf = (entry: PokeApiFlavorEntry) => entry.version ?? entry.version_group!;
    const latest = candidates.reduce((best, entry) => (idFromUrl(versionOf(entry).url) > idFromUrl(versionOf(best).url) ? entry : best));
    return { text: cleanText(latest.flavor_text), language, version: versionOf(latest).name };
  }
  return null;
}

/** Los campos de la respuesta que, si traen algo, hacen que la condición no se pueda decir en pocas palabras. */
const KNOWN_FIELDS = new Set(["trigger", "item", "min_level", "min_happiness", "time_of_day", "version_group", "is_default", "base_form_id", "region", "required_pokemon_form", "evolved_pokemon_form"]);

function hasOtherRequirement(details: PokeApiEvolutionDetails): boolean {
  return Object.entries(details).some(([key, value]) => !KNOWN_FIELDS.has(key) && value !== null && value !== false && value !== "" && value !== undefined);
}

const REGIONAL_FORM = /-(alola|galar|hisui|paldea)\b/;
const isRegional = (form: unknown): boolean => REGIONAL_FORM.test((form as { name?: string } | null | undefined)?.name ?? "");

function oneCondition(details: PokeApiEvolutionDetails, itemName: (name: string) => string): EvolutionCondition {
  // Exigir una forma regional es un requisito que la ficha no dice: «nivel 20» engañaría (Clodsire pide un Wooper de Paldea).
  if (hasOtherRequirement(details) || isRegional(details.required_pokemon_form)) return { kind: "other" };
  const time = details.time_of_day ?? "";
  if (time !== "" && time !== "day" && time !== "night") return { kind: "other" };
  const timeOfDay = time === "" ? {} : { timeOfDay: time as "day" | "night" };
  if (details.trigger.name === "use-item" && details.item) return { kind: "item", item: itemName(details.item.name) };
  if (details.trigger.name === "trade") return { kind: "trade" };
  if (details.trigger.name === "level-up" && details.min_level) return { kind: "level", level: details.min_level, ...timeOfDay };
  if (details.trigger.name === "level-up" && details.min_happiness) return { kind: "friendship", ...timeOfDay };
  return { kind: "other" };
}

/**
 * Cómo se evoluciona hoy. Manda lo de los juegos más recientes (Leafeon evolucionaba en un lugar y ahora con piedra) y no
 * cuenta lo que lleva a una forma regional, porque la ficha es de la forma base. Si quedan varias vías a la vez (Lycanroc),
 * reducirlas a una mentiría: es una condición especial.
 */
export function toEvolutionCondition(details: PokeApiEvolutionDetails[], itemName: (name: string) => string): EvolutionCondition {
  const base = details.filter((one) => !isRegional(one.evolved_pokemon_form));
  if (base.length === 0) return { kind: "other" };
  const groupOf = (one: PokeApiEvolutionDetails) => {
    const group = one.version_group as { url?: string } | null | undefined;
    return group?.url ? idFromUrl(group.url) : -1;
  };
  const latest = Math.max(...base.map(groupOf));
  const conditions = base.filter((one) => groupOf(one) === latest).map((one) => oneCondition(one, itemName));
  const distinct = new Set(conditions.map((condition) => JSON.stringify(condition)));
  return distinct.size === 1 ? conditions[0]! : { kind: "other" };
}

/** La cadena desde su primera etapa, con sus ramas. Lo que está fuera de la Pokédex se descarta. */
export function toEvolutionNode(link: PokeApiChainLink, nameOf: (id: number) => string | undefined, itemName: (name: string) => string, isRoot = true): EvolutionNode {
  const id = idFromUrl(link.species.url);
  return {
    id,
    name: nameOf(id) ?? link.species.name,
    condition: isRoot ? null : toEvolutionCondition(link.evolution_details, itemName),
    next: link.evolves_to.filter((next) => nameOf(idFromUrl(next.species.url)) !== undefined).map((next) => toEvolutionNode(next, nameOf, itemName, false)),
  };
}

export interface PokedexDetailLookups {
  abilityOf: (name: string) => Omit<PokedexAbility, "hidden">;
  chain: EvolutionNode;
  gameOf: (version: string) => string;
}

export function toPokedexDetail(pokemon: PokeApiDexPokemon, species: PokeApiDexSpecies, { abilityOf, chain, gameOf }: PokedexDetailLookups): PokedexDetail {
  const base = toPokemonSnapshot(pokemon, species);
  const lore = latestLocalized(species.flavor_text_entries);
  return {
    id: base.id,
    names: base.names,
    types: base.types,
    total: totalStats(base.stats),
    generation: ROMAN.indexOf(species.generation.name.replace("generation-", "")) + 1,
    spriteUrl: base.spriteUrl,
    stats: base.stats,
    abilities: [...pokemon.abilities].sort((a, b) => a.slot - b.slot).map((entry) => ({ ...abilityOf(entry.ability.name), hidden: entry.is_hidden })),
    lore: lore ? { text: lore.text, language: lore.language, game: gameOf(lore.version) } : null,
    evolution: chain,
  };
}

function localizedName(names: PokeApiSpecies["names"], fallback: string): string {
  const inLanguage = (language: string) => names.find((name) => name.language.name === language)?.name;
  return inLanguage("es") ?? inLanguage("en") ?? fallback;
}

/** Corre `work` sobre cada elemento, con un tope de peticiones a la vez. */
async function inPool<T>(items: T[], concurrency: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await work(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

export interface FetchPokedexOptions {
  fetchJson: FetchJson;
  concurrency?: number;
  onProgress?: (stage: string, done: number, total: number) => void;
}

/** Descarga la Pokédex completa. Cada cadena, habilidad, objeto y juego se pide una sola vez. Falla ante el primer error. */
export async function fetchPokedex({ fetchJson, concurrency = 8, onProgress }: FetchPokedexOptions): Promise<PokedexDetail[]> {
  const { count } = (await fetchJson("pokemon-species?limit=1")) as { count: number };
  const ids = Array.from({ length: count }, (_, index) => index + 1);
  const pokemon = new Map<number, PokeApiDexPokemon>();
  const species = new Map<number, PokeApiDexSpecies>();
  let done = 0;
  await inPool(ids, concurrency, async (id) => {
    const [one, its] = await Promise.all([fetchJson(`pokemon/${id}`), fetchJson(`pokemon-species/${id}`)]);
    pokemon.set(id, one as PokeApiDexPokemon);
    species.set(id, its as PokeApiDexSpecies);
    onProgress?.("especies", ++done, count);
  });

  const nameOf = (id: number) => {
    const names = species.get(id)?.names;
    return names ? localizedName(names, String(id)) : undefined;
  };

  const chainIds = [...new Set(ids.map((id) => idFromUrl(species.get(id)!.evolution_chain.url)))];
  const chainLinks = new Map<number, PokeApiChainLink>();
  await inPool(chainIds, concurrency, async (id) => {
    chainLinks.set(id, ((await fetchJson(`evolution-chain/${id}`)) as { chain: PokeApiChainLink }).chain);
  });

  const itemsIn = (link: PokeApiChainLink): string[] => [
    ...link.evolution_details.flatMap((details) => (details.item ? [details.item.name] : [])),
    ...link.evolves_to.flatMap(itemsIn),
  ];
  const itemNames = new Map<string, string>();
  await inPool([...new Set([...chainLinks.values()].flatMap(itemsIn))], concurrency, async (name) => {
    itemNames.set(name, localizedName(((await fetchJson(`item/${name}`)) as { names: PokeApiSpecies["names"] }).names, name));
  });
  const chains = new Map([...chainLinks].map(([id, link]) => [id, toEvolutionNode(link, nameOf, (name) => itemNames.get(name) ?? name)]));

  const abilities = new Map<string, Omit<PokedexAbility, "hidden">>();
  const abilityNames = [...new Set(ids.flatMap((id) => pokemon.get(id)!.abilities.map((entry) => entry.ability.name)))];
  await inPool(abilityNames, concurrency, async (name) => {
    const ability = (await fetchJson(`ability/${name}`)) as PokeApiAbility;
    const description = latestLocalized(ability.flavor_text_entries);
    abilities.set(name, { name: localizedName(ability.names, name), description: description ? { text: description.text, language: description.language } : null });
  });

  const games = new Map<string, string>();
  const versions = [...new Set(ids.flatMap((id) => latestLocalized(species.get(id)!.flavor_text_entries)?.version ?? []))];
  await inPool(versions, concurrency, async (name) => {
    games.set(name, localizedName(((await fetchJson(`version/${name}`)) as { names: PokeApiSpecies["names"] }).names, name));
  });

  return ids.map((id) =>
    toPokedexDetail(pokemon.get(id)!, species.get(id)!, {
      abilityOf: (name) => abilities.get(name)!,
      chain: chains.get(idFromUrl(species.get(id)!.evolution_chain.url))!,
      gameOf: (version) => games.get(version) ?? version,
    }),
  );
}
