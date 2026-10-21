import { type BaseStats, TYPE_NAMES, type TypeName } from "@pokemon-minigames/shared";
import type { PrismaClient } from "../db/prisma.js";
import { normalizeName } from "./normalize.js";

export interface CatalogPokemon {
  id: number;
  names: { es: string; en: string };
  spriteUrl: string;
  types: TypeName[];
  stats: BaseStats;
  totalStats: number;
}

/** Par de tipos en su orden canónico (el de TYPE_NAMES): así el par no tiene orden ni repetidos. */
export type TypePair = readonly [TypeName, TypeName];

const typeIndex = (type: TypeName): number => TYPE_NAMES.indexOf(type);

interface PairEntry {
  pair: TypePair;
  members: CatalogPokemon[];
}

/** Catálogo de Pokémon en memoria. Durante las partidas nunca se consulta la base de datos. */
export class PokemonCatalog {
  private readonly byId = new Map<number, CatalogPokemon>();
  private readonly byName = new Map<string, CatalogPokemon>();
  private readonly pairs = new Map<string, PairEntry>();

  constructor(pokemon: readonly CatalogPokemon[]) {
    for (const p of pokemon) {
      this.byId.set(p.id, p);

      for (const name of [p.names.es, p.names.en]) {
        const key = normalizeName(name);
        if (!key) continue;
        const existing = this.byName.get(key);
        if (existing && existing.id !== p.id) {
          throw new Error(`Nombre ambiguo en el catálogo: "${key}" (#${existing.id} y #${p.id})`);
        }
        this.byName.set(key, p);
      }

      if (p.types.length === 2) {
        const pair = PokemonCatalog.orderPair(p.types[0]!, p.types[1]!);
        const key = `${pair[0]}|${pair[1]}`;
        const entry = this.pairs.get(key) ?? { pair, members: [] };
        entry.members.push(p);
        this.pairs.set(key, entry);
      }
    }
  }

  get size(): number {
    return this.byId.size;
  }

  get(id: number): CatalogPokemon | undefined {
    return this.byId.get(id);
  }

  /** Todos los Pokémon del catálogo, ordenados por id. */
  all(): readonly CatalogPokemon[] {
    return [...this.byId.values()].sort((a, b) => a.id - b.id);
  }

  /** Nombres en español e inglés de todos los Pokémon, por id. No incluye tipos ni stats. */
  names(): { id: number; es: string; en: string }[] {
    return [...this.byId.values()]
      .sort((a, b) => a.id - b.id)
      .map((p) => ({ id: p.id, es: p.names.es, en: p.names.en }));
  }

  /** Lo mismo que `names()`, con los tipos de cada Pokémon (en el orden de sus ranuras). Solo para las salas con pistas. */
  namesWithTypes(): { id: number; es: string; en: string; types: TypeName[] }[] {
    return [...this.byId.values()]
      .sort((a, b) => a.id - b.id)
      .map((p) => ({ id: p.id, es: p.names.es, en: p.names.en, types: [...p.types] }));
  }

  /** Busca por nombre en español o en inglés, sin distinguir tildes, mayúsculas ni signos. */
  resolveName(text: string): CatalogPokemon | undefined {
    const key = normalizeName(text);
    return key ? this.byName.get(key) : undefined;
  }

  static orderPair(a: TypeName, b: TypeName): TypePair {
    return typeIndex(a) <= typeIndex(b) ? [a, b] : [b, a];
  }

  /** Un Pokémon sirve para un par solo si tiene los dos tipos. */
  matchesPair(pokemon: CatalogPokemon, pair: TypePair): boolean {
    return pair.every((type) => pokemon.types.includes(type));
  }

  /** Los Pokémon de doble tipo de ese par que nadie tiene, en el mismo orden estable que `poolSize` cuenta. */
  freeMembers(pair: TypePair, claimed: ReadonlySet<number>): CatalogPokemon[] {
    const entry = this.pairs.get(`${pair[0]}|${pair[1]}`);
    return entry ? entry.members.filter((p) => !claimed.has(p.id)) : [];
  }

  /** Cuántos Pokémon de doble tipo de ese par siguen sin reclamar. */
  poolSize(pair: TypePair, claimed: ReadonlySet<number>): number {
    const entry = this.pairs.get(`${pair[0]}|${pair[1]}`);
    return entry ? entry.members.filter((p) => !claimed.has(p.id)).length : 0;
  }

  /** Pares con al menos `minPool` Pokémon sin reclamar, en un orden estable. */
  playablePairs(claimed: ReadonlySet<number>, minPool: number): TypePair[] {
    return [...this.pairs.values()]
      .filter((entry) => entry.members.filter((p) => !claimed.has(p.id)).length >= minPool)
      .map((entry) => entry.pair)
      .sort((a, b) => typeIndex(a[0]) - typeIndex(b[0]) || typeIndex(a[1]) - typeIndex(b[1]));
  }
}

/**
 * Carga el catálogo de la base de datos. Ignora los Pokémon incompletos (sin nombre en
 * alguno de los dos idiomas o sin tipos), que pueden quedar al resembrar con un snapshot
 * que ya no los incluye.
 */
export async function loadCatalog(prisma: PrismaClient): Promise<PokemonCatalog> {
  const rows = await prisma.pokemon.findMany({
    orderBy: { id: "asc" },
    include: { types: { orderBy: { slot: "asc" }, include: { type: true } }, names: true },
  });

  const list: CatalogPokemon[] = [];
  for (const row of rows) {
    const es = row.names.find((n) => n.language === "es")?.name;
    const en = row.names.find((n) => n.language === "en")?.name;
    if (!es || !en || row.types.length === 0) continue;
    list.push({
      id: row.id,
      names: { es, en },
      spriteUrl: row.spriteUrl,
      types: row.types.map((t) => t.type.name as TypeName),
      stats: {
        hp: row.baseHp,
        attack: row.baseAttack,
        defense: row.baseDefense,
        spAttack: row.baseSpAttack,
        spDefense: row.baseSpDefense,
        speed: row.baseSpeed,
      },
      totalStats: row.totalStats,
    });
  }
  return new PokemonCatalog(list);
}
