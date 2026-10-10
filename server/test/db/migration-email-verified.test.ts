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
 * Prueba la migración de la etapa 7 sobre un esquema desechable de la base de pruebas: se aplican todas las anteriores, se
 * crea una cuenta «de antes» y se aplica la nueva. Es lo único que comprueba de verdad que las cuentas que ya existían
 * quedan verificadas (la migración corre una sola vez, en el despliegue).
 *
 * Es un esquema y no una base de datos nueva a propósito: `DROP DATABASE … WITH (FORCE)` fuerza un punto de control de todo
 * el clúster, que tras las suites completas tardaba hasta 16 s y hacía que esta prueba agotara su tiempo de vez en cuando.
 * Las migraciones no califican `public` ni crean extensiones, así que con `search_path` apuntando al esquema caen en él.
 */
describe("la migración de las cuentas con correo", () => {
  const last = migrations.at(-1)!;
  const previous = migrations.slice(0, -1);

  it("es la última y se llama como lo que hace", () => {
    expect(last).toMatch(/email_verification_codes$/);
  });

  it("da por verificadas las cuentas que ya existían y deja sin verificar las nuevas", async () => {
    const schema = `mig_${randomBytes(4).toString("hex")}`;
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      // Solo el esquema desechable en la ruta de búsqueda: nada de lo que ya hay en `public` se ve ni se toca.
      await client.query(`SET search_path TO "${schema}"`);
      for (const name of previous) await client.query(sqlOf(name));
      await client.query(
        "INSERT INTO users (id, email, username, password_hash) VALUES (gen_random_uuid(), 'antigua@example.com', 'antigua', 'hash')",
      );

      await client.query(sqlOf(last));

      const before = await client.query("SELECT email_verified_at FROM users WHERE username = 'antigua'");
      expect(before.rows[0].email_verified_at).toBeInstanceOf(Date);

      await client.query(
        "INSERT INTO users (id, email, username, password_hash) VALUES (gen_random_uuid(), 'nueva@example.com', 'nueva', 'hash')",
      );
      const after = await client.query("SELECT email_verified_at FROM users WHERE username = 'nueva'");
      expect(after.rows[0].email_verified_at).toBeNull();
    } finally {
      await client.query("SET search_path TO public");
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
});
