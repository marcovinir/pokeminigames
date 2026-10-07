import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

export type { PrismaClient };

/**
 * Neon apaga la base tras 5 minutos sin actividad: las conexiones inactivas se cierran mucho antes (10 s) para no
 * guardar ninguna que la base vaya a cortar, y se espera hasta 30 s a que despierte en el primer acceso.
 */
export const POOL_DEFAULTS = { max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 30_000 } as const;

export interface PrismaClientOptions {
  /** Nombre con el que aparecen las conexiones en `pg_stat_activity` (útil para depurar y para las pruebas). */
  applicationName?: string;
  /** Se llama cuando la base cierra una conexión inactiva (Prisma la gestiona; esto solo permite registrarlo). */
  onPoolError?: (error: Error) => void;
}

export function createPrismaClient(connectionString: string, options: PrismaClientOptions = {}): PrismaClient {
  const adapter = new PrismaPg(
    {
      connectionString,
      ...POOL_DEFAULTS,
      ...(options.applicationName ? { application_name: options.applicationName } : {}),
    },
    { onPoolError: options.onPoolError },
  );
  return new PrismaClient({ adapter });
}
