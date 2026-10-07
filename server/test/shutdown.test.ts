import { afterEach, describe, expect, it, vi } from "vitest";
import { createShutdown } from "../src/shutdown.js";

afterEach(() => vi.useRealTimers());

function setup(overrides: { io?: { close(): Promise<void> }; prisma?: { $disconnect(): Promise<void> } } = {}) {
  const calls: string[] = [];
  const logger = { log: vi.fn(), error: vi.fn() };
  const exit = vi.fn((code: number) => void calls.push(`exit:${code}`));
  const io = overrides.io ?? {
    close: async () => {
      calls.push("io.close");
    },
  };
  const prisma = overrides.prisma ?? {
    $disconnect: async () => {
      calls.push("prisma.disconnect");
    },
  };
  const shutdown = createShutdown({ io, prisma, logger, exit, timeoutMs: 10_000 });
  return { shutdown, calls, logger, exit };
}

describe("cierre ordenado", () => {
  it("cierra Socket.io (y con él el servidor HTTP), luego la base de datos y sale con 0", async () => {
    const { shutdown, calls } = setup();
    await shutdown("SIGTERM");
    expect(calls).toEqual(["io.close", "prisma.disconnect", "exit:0"]);
  });

  it("dice qué señal recibió", async () => {
    const { shutdown, logger } = setup();
    await shutdown("SIGTERM");
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("SIGTERM"));
  });

  it("una segunda señal mientras cierra no repite el cierre", async () => {
    const { shutdown, calls } = setup();
    await Promise.all([shutdown("SIGTERM"), shutdown("SIGINT")]);
    expect(calls).toEqual(["io.close", "prisma.disconnect", "exit:0"]);
  });

  it("si cerrar Socket.io falla, igualmente intenta cerrar la base de datos y sale con 1", async () => {
    const { shutdown, calls, logger } = setup({
      io: {
        close: async () => {
          throw new Error("no cierra");
        },
      },
    });
    await shutdown("SIGTERM");
    expect(calls).toEqual(["prisma.disconnect", "exit:1"]);
    expect(logger.error).toHaveBeenCalled();
  });

  it("si cerrar la base de datos falla, sale con 1", async () => {
    const { shutdown, calls } = setup({
      prisma: {
        $disconnect: async () => {
          throw new Error("no desconecta");
        },
      },
    });
    await shutdown("SIGTERM");
    expect(calls).toEqual(["io.close", "exit:1"]);
  });

  it("si algo no cierra en 10 segundos, sale igualmente con 1", async () => {
    vi.useFakeTimers();
    const { shutdown, calls, logger } = setup({ io: { close: () => new Promise<void>(() => {}) } });
    void shutdown("SIGTERM");
    await vi.advanceTimersByTimeAsync(9_999);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(2);
    expect(calls).toEqual(["exit:1"]);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("10"), undefined);
  });

  it("si cierra a tiempo, el temporizador de seguridad no vuelve a salir", async () => {
    vi.useFakeTimers();
    const { shutdown, calls } = setup();
    await shutdown("SIGTERM");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toEqual(["io.close", "prisma.disconnect", "exit:0"]);
  });
});
