import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { type Socket, io } from "socket.io-client";
import { type GameIoServer, attachRealtime } from "../../src/realtime/server.js";
import { type TestContextOptions, buildTestContext } from "../helpers/app.js";

const DEFAULT_TIMEOUT_MS = 3000;

export interface RunningServer extends ReturnType<typeof buildTestContext> {
  url: string;
  io: GameIoServer;
  close(): Promise<void>;
}

/** Levanta la app completa con Socket.io en un puerto libre. */
export async function startServer(
  overrides: Record<string, string> = {},
  options: TestContextOptions & { eventsPerSecond?: number } = {},
): Promise<RunningServer> {
  const ctx = buildTestContext(overrides, options);
  const server = createServer(ctx.app);
  const realtime = attachRealtime(server, {
    env: ctx.env,
    tokens: ctx.tokens,
    manager: ctx.roomManager,
    broadcaster: ctx.broadcaster,
    eventsPerSecond: options.eventsPerSecond,
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return { ...ctx, url: `http://localhost:${port}`, io: realtime, close: () => realtime.close() };
}

interface Received {
  name: string;
  payload: unknown;
}

/** Cliente de Socket.io que guarda todo lo que recibe y deja esperar eventos concretos. */
export class TestClient {
  readonly socket: Socket;
  readonly received: Received[] = [];
  private readonly consumed = new Set<number>();
  private readonly waiters = new Set<() => void>();

  constructor(url: string, token: string | null) {
    this.socket = io(url, {
      auth: token === null ? {} : { token },
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    this.socket.onAny((name: string, payload: unknown) => {
      this.received.push({ name, payload });
      for (const wake of this.waiters) wake();
    });
  }

  /** Resuelve al conectar; si el servidor rechaza el handshake, rechaza con su mensaje. */
  connected(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.once("connect", () => resolve());
      this.socket.once("connect_error", (error) => reject(error));
    });
  }

  emit(name: string, payload?: unknown): void {
    this.socket.emit(name, payload);
  }

  /** Espera el siguiente evento con ese nombre que aún no se haya consumido. */
  next<T = unknown>(name: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const check = (): boolean => {
        const index = this.received.findIndex((r, i) => r.name === name && !this.consumed.has(i));
        if (index === -1) return false;
        this.consumed.add(index);
        cleanup();
        resolve(this.received[index]!.payload as T);
        return true;
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`No llegó el evento "${name}" en ${timeoutMs} ms. Recibidos: ${this.received.map((r) => r.name).join(", ")}`));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        this.waiters.delete(check);
      };
      if (!check()) this.waiters.add(check);
    });
  }

  /** Eventos recibidos con ese nombre, consumidos o no. */
  all<T = unknown>(name: string): T[] {
    return this.received.filter((r) => r.name === name).map((r) => r.payload as T);
  }

  /** Da tiempo a que llegue algo que NO debería llegar y comprueba que no llegó. */
  async expectNone(name: string, waitMs = 150): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    if (this.all(name).length > 0) throw new Error(`Llegó un evento inesperado "${name}"`);
  }

  wasDisconnected(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket.disconnected) return resolve();
      const timer = setTimeout(() => reject(new Error("El socket no se desconectó")), timeoutMs);
      this.socket.once("disconnect", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  close(): void {
    this.socket.close();
  }
}
