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
 * Prueba la migración que retira la verificación del correo (se descartó el 2026-10-18) sobre un esquema desechable de la
 * base de pruebas: se aplican todas las anteriores (incluida la que creó la tabla de códigos, que ya está aplicada en
 * producción y NO se borra ni se edita), se crea una cuenta con su código y se aplica la nueva.
 *
 * Es un esquema y no una base de datos nueva a propósito: `DROP DATABASE … WITH (FORCE)` fuerza un punto de control de todo
 * el clúster y tras las suites completas tardaba lo bastante como para agotar el tiempo de la prueba.
 */
describe("la migración que retira la verificación del correo", () => {
  const last = migrations.at(-1)!;
  const previous = migrations.slice(0, -1);

  it("es la última y se llama como lo que hace", () => {
    expect(last).toMatch(/remove_email_verification$/);
  });

  it("la migración que creó la tabla de códigos sigue en su sitio (ya está aplicada en producción)", () => {
    expect(migrations.some((name) => /email_verification_codes$/.test(name))).toBe(true);
  });

  it("quita la tabla de códigos, su tipo y la columna de verificación, y conserva a las personas y sus datos", async () => {
    const schema = `mig_${randomBytes(4).toString("hex")}`;
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      // Solo el esquema desechable en la ruta de búsqueda: nada de lo que ya hay en `public` se ve ni se toca.
      await client.query(`SET search_path TO "${schema}"`);
      for (const name of previous) await client.query(sqlOf(name));

      const id = (
        await client.query(
          "INSERT INTO users (id, email, username, password_hash, email_verified_at) VALUES (gen_random_uuid(), 'antigua@example.com', 'antigua', 'hash', now()) RETURNING id",
        )
      ).rows[0].id as string;
      await client.query("INSERT INTO email_codes (user_id, purpose, code_hash, expires_at) VALUES ($1, 'verify_email', 'huella', now())", [id]);

      await client.query(sqlOf(last));

      const user = await client.query("SELECT email, username FROM users WHERE id = $1", [id]);
      expect(user.rows).toEqual([{ email: "antigua@example.com", username: "antigua" }]);

      const columns = await client.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'users'",
        [schema],
      );
      expect(columns.rows.map((row) => row.column_name)).not.toContain("email_verified_at");

      expect((await client.query("SELECT to_regclass('email_codes') AS found")).rows[0].found).toBeNull();
      const type = await client.query(
        "SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'email_code_purpose' AND n.nspname = $1",
        [schema],
      );
      expect(type.rowCount).toBe(0);
    } finally {
      await client.query("SET search_path TO public");
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
});
