import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { describe, expect, it } from "vitest";

const migrationsDir = join(import.meta.dirname, "../../prisma/migrations");
const migrations = readdirSync(migrationsDir)
  .filter((name) => /^\d{14}_/.test(name))
  .sort();
const sqlOf = (name: string): string => readFileSync(join(migrationsDir, name, "migration.sql"), "utf8");

/**
 * La migración del avatar es aditiva: una columna nueva y nula en `users`. Se prueba sobre un esquema desechable de la base
 * de pruebas (mismo motivo que en la de la verificación del correo): se aplican las anteriores, se crea una cuenta como las
 * que ya hay en producción y se aplica la nueva.
 */
describe("la migración que añade el avatar", () => {
  const last = migrations.find((name) => /add_user_avatar$/.test(name)) ?? "";
  const previous = migrations.slice(0, migrations.indexOf(last));

  it("existe y se llama como lo que hace", () => {
    expect(last).toMatch(/add_user_avatar$/);
  });

  it("añade la columna nula y conserva a las personas", async () => {
    const schema = `mig_${randomBytes(4).toString("hex")}`;
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      for (const name of previous) await client.query(sqlOf(name));

      const id = (
        await client.query(
          "INSERT INTO users (id, email, username, password_hash, theme, theme_mode) VALUES (gen_random_uuid(), 'antigua@example.com', 'antigua', 'hash', 'pokedex', 'oscuro') RETURNING id",
        )
      ).rows[0].id as string;

      await client.query(sqlOf(last));

      const user = await client.query("SELECT email, username, theme, theme_mode, avatar_pokemon_id FROM users WHERE id = $1", [id]);
      expect(user.rows).toEqual([
        { email: "antigua@example.com", username: "antigua", theme: "pokedex", theme_mode: "oscuro", avatar_pokemon_id: null },
      ]);

      const column = await client.query(
        "SELECT data_type, is_nullable FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'users' AND column_name = 'avatar_pokemon_id'",
        [schema],
      );
      expect(column.rows).toEqual([{ data_type: "smallint", is_nullable: "YES" }]);

      await client.query("UPDATE users SET avatar_pokemon_id = 94 WHERE id = $1", [id]);
      expect((await client.query("SELECT avatar_pokemon_id FROM users WHERE id = $1", [id])).rows[0].avatar_pokemon_id).toBe(94);
    } finally {
      await client.query("SET search_path TO public");
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
});
