import { createPrismaClient } from "../../src/db/prisma.js";

export const prisma = createPrismaClient(process.env.DATABASE_URL!);

const DEADLOCK_DETECTED = "40P01";
const MAX_TRUNCATE_ATTEMPTS = 5;

/**
 * Ejecuta un TRUNCATE reintentando si PostgreSQL detecta un deadlock. Ocurre cuando la prueba
 * anterior aún tiene una escritura en vuelo (por ejemplo, el guardado del final de una partida)
 * que toma los mismos bloqueos en otro orden. Esa escritura pierde y se descarta, y el reintento
 * deja las tablas vacías: no hay nada que conservar de una prueba que ya terminó.
 */
async function truncate(sql: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await prisma.$executeRawUnsafe(sql);
      return;
    } catch (error) {
      if (attempt >= MAX_TRUNCATE_ATTEMPTS || !String(error).includes(DEADLOCK_DETECTED)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
    }
  }
}

/** Vacía las tablas mutables. El catálogo (tipos, Pokémon) se conserva. */
export async function resetDatabase(): Promise<void> {
  await truncate('TRUNCATE TABLE "round_picks", "rounds", "game_players", "games", "refresh_tokens", "users" CASCADE');
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
  await truncate('TRUNCATE TABLE "pokemon_names", "pokemon_types", "pokemon", "types" CASCADE');
}
