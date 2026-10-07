export interface ShutdownDeps {
  /** Cerrarlo cierra también el servidor HTTP sobre el que está montado. */
  io: { close(): Promise<void> };
  prisma: { $disconnect(): Promise<void> };
  logger: { log(message: string): void; error(message: string, error?: unknown): void };
  exit(code: number): void;
  /** Si el cierre tarda más, se sale igualmente. */
  timeoutMs?: number;
}

/**
 * Cierre ordenado al recibir SIGTERM (Render lo envía al dormir o redesplegar) o SIGINT: deja de aceptar conexiones,
 * cierra Socket.io y la base de datos y sale. Si algo no cierra a tiempo, sale con 1 igualmente. Una segunda señal
 * mientras cierra no repite nada. Las partidas a medias se marcan como abandonadas en el próximo arranque.
 */
export function createShutdown({ io, prisma, logger, exit, timeoutMs = 10_000 }: ShutdownDeps): (signal: string) => Promise<void> {
  let started = false;
  return async (signal) => {
    if (started) return;
    started = true;
    logger.log(`${signal} recibido, cerrando...`);

    const forced = setTimeout(() => {
      logger.error(`El cierre tardó más de ${timeoutMs / 1000} segundos; se sale igualmente`, undefined);
      exit(1);
    }, timeoutMs);
    forced.unref();

    let failed = false;
    for (const [label, close] of [
      ["Socket.io", () => io.close()],
      ["la base de datos", () => prisma.$disconnect()],
    ] as const) {
      try {
        await close();
      } catch (error) {
        failed = true;
        logger.error(`No se pudo cerrar ${label}`, error);
      }
    }
    clearTimeout(forced);
    exit(failed ? 1 : 0);
  };
}
