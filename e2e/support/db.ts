import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const E2E_DATABASE = "pokemon_minigames_e2e";

/** Conexión con permiso para crear bases de datos: la variable E2E_ADMIN_DATABASE_URL (CI) o la DATABASE_URL de server/.env. */
export function adminDatabaseUrl(): string {
  if (process.env.E2E_ADMIN_DATABASE_URL) return process.env.E2E_ADMIN_DATABASE_URL;
  const file = join(root, "server", ".env");
  if (!existsSync(file)) {
    throw new Error("Falta server/.env (o la variable E2E_ADMIN_DATABASE_URL) para poder crear la base de datos de la prueba E2E.");
  }
  const line = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("server/.env no define DATABASE_URL.");
  return line.slice("DATABASE_URL=".length).replace(/^"|"$/g, "");
}

/** Cuántas partidas guardadas hay con ese código de sala (la base de datos de la prueba E2E es la que usa el servidor). */
export async function gamesWithRoomCode(code: string): Promise<number> {
  const url = new URL(adminDatabaseUrl());
  url.pathname = `/${E2E_DATABASE}`;
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const result = await client.query("SELECT count(*)::int AS n FROM games WHERE room_code = $1", [code]);
    return result.rows[0].n as number;
  } finally {
    await client.end();
  }
}
