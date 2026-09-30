import { type BaseStats, TYPE_NAMES, type TypeName } from "@pokemon-minigames/shared";
import { normalizeName } from "./normalize.js";

// Los tipos y las stats base viven en `shared/` (los usa también el cliente); se re-exportan aquí.
export { TYPE_NAMES };
export type { BaseStats, TypeName };

export interface PokemonSnapshot {
  /** Número de la Pokédex nacional. */
  id: number;
  /** Uno o dos tipos, en el orden de los slots de PokéAPI. */
  types: TypeName[];
  stats: BaseStats;
  spriteUrl: string;
  names: { es: string; en: string };
}

export interface CatalogSnapshot {
  generatedAt: string;
  source: string;
  pokemon: PokemonSnapshot[];
}

export function totalStats(stats: BaseStats): number {
  return stats.hp + stats.attack + stats.defense + stats.spAttack + stats.spDefense + stats.speed;
}

export function typeId(name: TypeName): number {
  return TYPE_NAMES.indexOf(name) + 1;
}

/** Devuelve la lista de problemas del snapshot; vacía si es válido. */
export function validateSnapshot(snapshot: CatalogSnapshot): string[] {
  const problems: string[] = [];
  if (snapshot.pokemon.length === 0) {
    return ["El snapshot no tiene Pokémon"];
  }

  const seenIds = new Set<number>();
  const idsByName = new Map<string, Set<number>>();

  for (const p of snapshot.pokemon) {
    const label = `#${p.id}`;
    if (!Number.isInteger(p.id) || p.id < 1) problems.push(`${label}: id inválido`);
    if (seenIds.has(p.id)) problems.push(`${label}: id repetido`);
    seenIds.add(p.id);

    if (p.types.length < 1 || p.types.length > 2) problems.push(`${label}: debe tener 1 o 2 tipos`);
    for (const type of p.types) {
      if (!(TYPE_NAMES as readonly string[]).includes(type)) problems.push(`${label}: tipo desconocido "${type}"`);
    }
    if (new Set(p.types).size !== p.types.length) problems.push(`${label}: tipos repetidos`);

    for (const [stat, value] of Object.entries(p.stats)) {
      if (!Number.isInteger(value) || value < 1) problems.push(`${label}: stat ${stat} inválida (${value})`);
    }
    if (!p.spriteUrl) problems.push(`${label}: sin sprite`);

    for (const language of ["es", "en"] as const) {
      const name = p.names[language];
      const normalized = name ? normalizeName(name) : "";
      if (!normalized) {
        problems.push(`${label}: nombre ${language} vacío`);
        continue;
      }
      const ids = idsByName.get(normalized) ?? new Set<number>();
      ids.add(p.id);
      idsByName.set(normalized, ids);
    }
  }

  for (const [name, ids] of idsByName) {
    if (ids.size > 1) problems.push(`El nombre normalizado "${name}" es ambiguo: Pokémon ${[...ids].map((i) => `#${i}`).join(", ")}`);
  }
  return problems;
}
