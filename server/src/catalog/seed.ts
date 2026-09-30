import type { PrismaClient } from "../db/prisma.js";
import { normalizeName } from "./normalize.js";
import { type CatalogSnapshot, TYPE_NAMES, totalStats, typeId, validateSnapshot } from "./snapshot.js";

/**
 * Carga el catálogo en la base de datos. Es idempotente: se puede ejecutar de nuevo
 * con un snapshot actualizado y deja los datos al día. Los Pokémon nunca se borran
 * porque las partidas guardadas los referencian.
 */
export async function seedCatalog(prisma: PrismaClient, snapshot: CatalogSnapshot): Promise<{ pokemon: number }> {
  const problems = validateSnapshot(snapshot);
  if (problems.length > 0) {
    throw new Error(`Snapshot inválido:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  }

  const pokemonRows = snapshot.pokemon.map((p) => ({
    id: p.id,
    baseHp: p.stats.hp,
    baseAttack: p.stats.attack,
    baseDefense: p.stats.defense,
    baseSpAttack: p.stats.spAttack,
    baseSpDefense: p.stats.spDefense,
    baseSpeed: p.stats.speed,
    totalStats: totalStats(p.stats),
    spriteUrl: p.spriteUrl,
  }));

  // Una sola transacción: o queda todo cargado o no cambia nada.
  await prisma.$transaction([
    prisma.pokemonName.deleteMany(),
    prisma.pokemonType.deleteMany(),
    ...TYPE_NAMES.map((name, index) =>
      prisma.type.upsert({ where: { id: index + 1 }, create: { id: index + 1, name }, update: { name } }),
    ),
    ...pokemonRows.map(({ id, ...data }) =>
      prisma.pokemon.upsert({ where: { id }, create: { id, ...data }, update: data }),
    ),
    prisma.pokemonType.createMany({
      data: snapshot.pokemon.flatMap((p) =>
        p.types.map((type, index) => ({ pokemonId: p.id, typeId: typeId(type), slot: index + 1 })),
      ),
    }),
    prisma.pokemonName.createMany({
      data: snapshot.pokemon.flatMap((p) => [
        { pokemonId: p.id, language: "es" as const, name: p.names.es, normalizedName: normalizeName(p.names.es) },
        { pokemonId: p.id, language: "en" as const, name: p.names.en, normalizedName: normalizeName(p.names.en) },
      ]),
    }),
  ]);

  return { pokemon: snapshot.pokemon.length };
}
