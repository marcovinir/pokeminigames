import { afterAll, describe, expect, it } from "vitest";
import { POOL_DEFAULTS, createPrismaClient } from "../../src/db/prisma.js";
import { prisma as admin } from "../helpers/db.js";

const NEON_SUSPEND_MS = 5 * 60 * 1000;
const APPLICATION = "pm-pool-resilience";

afterAll(() => admin.$disconnect());

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Corta desde fuera las conexiones de un cliente, como hace Neon al apagarse. */
async function cutConnections(application: string): Promise<number> {
  const rows = await admin.$queryRaw<{ cut: boolean }[]>`
    SELECT pg_terminate_backend(pid) AS cut FROM pg_stat_activity WHERE application_name = ${application}`;
  return rows.length;
}

describe("la configuración del pool", () => {
  it("cierra las conexiones inactivas mucho antes de que Neon se apague (a los 5 minutos)", () => {
    expect(POOL_DEFAULTS.idleTimeoutMillis).toBeLessThan(NEON_SUSPEND_MS);
    expect(POOL_DEFAULTS.max).toBeLessThanOrEqual(10);
  });

  it("espera lo suficiente a que la base despierte tras apagarse (arranque en frío)", () => {
    expect(POOL_DEFAULTS.connectionTimeoutMillis).toBeGreaterThanOrEqual(20_000);
  });
});

describe("una base de datos que cierra las conexiones", () => {
  it("no tira el proceso, registra lo ocurrido y la siguiente consulta funciona", async () => {
    const errors: string[] = [];
    const client = createPrismaClient(process.env.DATABASE_URL!, {
      applicationName: APPLICATION,
      onPoolError: (error) => errors.push(error.message),
    });
    try {
      // Abre varias conexiones a la vez para que haya inactivas que cortar.
      await Promise.all([1, 2, 3].map(() => client.$queryRaw`SELECT 1 AS ok FROM pg_sleep(0.2)`));

      expect(await cutConnections(APPLICATION)).toBeGreaterThan(0);
      await pause(300);

      expect(errors.length).toBeGreaterThan(0);
      await expect(client.$queryRaw`SELECT 1 AS ok`).resolves.toEqual([{ ok: 1 }]);
    } finally {
      await client.$disconnect();
    }
  });

  it("sigue funcionando después de varias caídas seguidas", async () => {
    const client = createPrismaClient(process.env.DATABASE_URL!, { applicationName: APPLICATION });
    try {
      for (let round = 0; round < 3; round++) {
        await Promise.all([1, 2].map(() => client.$queryRaw`SELECT 1 AS ok FROM pg_sleep(0.1)`));
        await cutConnections(APPLICATION);
        await pause(200);
        await expect(client.$queryRaw`SELECT ${round} AS round`).resolves.toHaveLength(1);
      }
    } finally {
      await client.$disconnect();
    }
  });
});
