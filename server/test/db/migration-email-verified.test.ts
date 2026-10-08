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
 * Prueba la migración de la etapa 7 sobre una base de datos desechable: se aplican todas las anteriores, se crea una
 * cuenta «de antes» y se aplica la nueva. Es lo único que comprueba de verdad que las cuentas que ya existían quedan
 * verificadas (la migración corre una sola vez, en el despliegue).
 */
describe("la migración de las cuentas con correo", () => {
  const last = migrations.at(-1)!;
  const previous = migrations.slice(0, -1);

  it("es la última y se llama como lo que hace", () => {
    expect(last).toMatch(/email_verification_codes$/);
  });

  it("da por verificadas las cuentas que ya existían y deja sin verificar las nuevas", async () => {
    const database = `pokemon_minigames_mig_${randomBytes(4).toString("hex")}`;
    const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${database}"`);
    try {
      const url = new URL(process.env.DATABASE_URL!);
      url.pathname = `/${database}`;
      const client = new pg.Client({ connectionString: url.toString() });
      await client.connect();
      try {
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
        await client.end();
      }
    } finally {
      await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
      await admin.end();
    }
  }, 30_000); // crear una base y aplicar las migraciones tarda más que el límite por defecto cuando la máquina va cargada
});
