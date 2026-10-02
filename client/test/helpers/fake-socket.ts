import type { SocketLike } from "../../src/game/game-client";

/** Socket de mentira: graba lo que se emite y deja simular lo que envía el servidor. */
export class FakeSocket implements SocketLike {
  connected = false;
  emitted: { event: string; args: unknown[] }[] = [];
  connectCalls = 0;
  disconnectCalls = 0;
  private handlers = new Map<string, Array<(...args: any[]) => void>>();

  on(event: string, handler: (...args: any[]) => void): this {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }

  emit(event: string, ...args: unknown[]): this {
    this.emitted.push({ event, args });
    return this;
  }

  connect(): this {
    this.connectCalls++;
    return this;
  }

  disconnect(): this {
    this.disconnectCalls++;
    this.connected = false;
    return this;
  }

  /** Lo que se ha emitido con ese nombre, solo las cargas. */
  sent(event: string): unknown[] {
    return this.emitted.filter((e) => e.event === event).map((e) => e.args[0]);
  }

  /** Simula un evento que llega del servidor (o del propio socket: connect, disconnect…). */
  trigger(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }

  /** Simula que la conexión se establece. */
  serverConnects(): void {
    this.connected = true;
    this.trigger("connect");
  }

  serverDrops(): void {
    this.connected = false;
    this.trigger("disconnect");
  }
}
