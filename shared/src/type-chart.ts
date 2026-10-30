import { TYPE_NAMES, type TypeName } from "./types.js";

export type Effectiveness = 0 | 0.5 | 1 | 2;

/** Lo que no es ×1, por tipo que ataca (tabla vigente, de la generación 6 en adelante). */
const EXCEPTIONS: Record<TypeName, Partial<Record<TypeName, Effectiveness>>> = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fighting: { normal: 2, flying: 0.5, poison: 0.5, rock: 2, bug: 0.5, ghost: 0, steel: 2, psychic: 0.5, ice: 2, dark: 2, fairy: 0.5 },
  flying: { fighting: 2, rock: 0.5, bug: 2, steel: 0.5, grass: 2, electric: 0.5 },
  poison: { poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, grass: 2, fairy: 2 },
  ground: { flying: 0, poison: 2, rock: 2, bug: 0.5, steel: 2, fire: 2, grass: 0.5, electric: 2 },
  rock: { fighting: 0.5, flying: 2, ground: 0.5, bug: 2, steel: 0.5, fire: 2, ice: 2 },
  bug: { fighting: 0.5, flying: 0.5, poison: 0.5, ghost: 0.5, steel: 0.5, fire: 0.5, grass: 2, psychic: 2, dark: 2, fairy: 0.5 },
  ghost: { normal: 0, ghost: 2, psychic: 2, dark: 0.5 },
  steel: { rock: 2, steel: 0.5, fire: 0.5, water: 0.5, electric: 0.5, ice: 2, fairy: 2 },
  fire: { rock: 0.5, bug: 2, steel: 2, fire: 0.5, water: 0.5, grass: 2, ice: 2, dragon: 0.5 },
  water: { ground: 2, rock: 2, fire: 2, water: 0.5, grass: 0.5, dragon: 0.5 },
  grass: { flying: 0.5, poison: 0.5, ground: 2, rock: 2, bug: 0.5, steel: 0.5, fire: 0.5, water: 2, grass: 0.5, dragon: 0.5 },
  electric: { flying: 2, ground: 0, water: 2, grass: 0.5, electric: 0.5, dragon: 0.5 },
  psychic: { fighting: 2, poison: 2, steel: 0.5, psychic: 0.5, dark: 0 },
  ice: { flying: 2, ground: 2, steel: 0.5, fire: 0.5, water: 0.5, grass: 2, ice: 0.5, dragon: 2 },
  dragon: { steel: 0.5, dragon: 2, fairy: 0 },
  dark: { fighting: 0.5, ghost: 2, psychic: 2, dark: 0.5, fairy: 0.5 },
  fairy: { fighting: 2, poison: 0.5, steel: 0.5, fire: 0.5, dragon: 2, dark: 2 },
};

export function typeEffectiveness(attacker: TypeName, defender: TypeName): Effectiveness {
  return EXCEPTIONS[attacker][defender] ?? 1;
}

/** El daño que recibe una combinación de tipos, sin el ×1. Cada lista va en el orden de `TYPE_NAMES`. */
export interface DamageGroups {
  x4: TypeName[];
  x2: TypeName[];
  x05: TypeName[];
  x025: TypeName[];
  x0: TypeName[];
}

export function damageTaken(types: readonly TypeName[]): DamageGroups {
  const groups: DamageGroups = { x4: [], x2: [], x05: [], x025: [], x0: [] };
  const byMultiplier: Record<number, TypeName[] | undefined> = { 4: groups.x4, 2: groups.x2, 0.5: groups.x05, 0.25: groups.x025, 0: groups.x0 };
  for (const attacker of TYPE_NAMES) {
    byMultiplier[types.reduce((total, defender) => total * typeEffectiveness(attacker, defender), 1)]?.push(attacker);
  }
  return groups;
}
