import { createPrismaClient } from "../../src/db/prisma.js";

export const prisma = createPrismaClient(process.env.DATABASE_URL!);

/** Vacía las tablas mutables. El catálogo (tipos, Pokémon) se conserva. */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "round_picks", "rounds", "game_players", "games", "refresh_tokens", "users" CASCADE',
  );
}

/**
 * Abre varias conexiones del pool antes de una prueba de concurrencia. Sin esto, las
 * peticiones esperan a que se abran las conexiones y terminan ejecutándose casi en serie,
 * con lo que la carrera que se quiere probar nunca ocurre.
 */
export async function warmUpPool(connections = 8): Promise<void> {
  await Promise.all(
    Array.from({ length: connections }, () => prisma.$queryRaw`SELECT 1 AS ok FROM pg_sleep(0.2)`),
  );
}

/** Vacía también el catálogo. Solo para las pruebas del seed. */
export async function resetCatalog(): Promise<void> {
  await resetDatabase();
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "pokemon_names", "pokemon_types", "pokemon", "types" CASCADE',
  );
}
