import type {
  ClientToServerEvents,
  Seat,
  ServerEvent,
  ServerToClientEvents,
} from "@pokemon-minigames/shared";
import type { Socket } from "socket.io";
import type { Broadcaster } from "../game/ports.js";
import type { RoomUser } from "../game/room.js";

export interface SocketData {
  user: RoomUser;
}

export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const keyOf = (code: string, seat: Seat): string => `${code}:${seat}`;

/** Sabe qué socket está sentado en cada asiento de cada sala y les entrega los eventos. */
export class SocketBroadcaster implements Broadcaster {
  private readonly sockets = new Map<string, GameSocket>();

  /** Sienta el socket en el asiento. Devuelve el socket anterior de ese asiento, si lo había. */
  bind(code: string, seat: Seat, socket: GameSocket): GameSocket | undefined {
    const previous = this.sockets.get(keyOf(code, seat));
    this.sockets.set(keyOf(code, seat), socket);
    return previous;
  }

  /** Levanta el socket de su asiento, pero solo si sigue siendo el que lo ocupa. */
  unbind(code: string, seat: Seat, socket: GameSocket): boolean {
    if (this.sockets.get(keyOf(code, seat)) !== socket) return false;
    this.sockets.delete(keyOf(code, seat));
    return true;
  }

  toSeat(code: string, seat: Seat, event: ServerEvent): void {
    const socket = this.sockets.get(keyOf(code, seat));
    // El tipo de `emit` no admite una unión de eventos; `ServerEvent` garantiza que nombre y carga concuerdan.
    (socket?.emit as ((name: string, payload: unknown) => boolean) | undefined)?.call(socket, event.name, event.payload);
  }

  toAll(code: string, event: ServerEvent): void {
    this.toSeat(code, 1, event);
    this.toSeat(code, 2, event);
  }
}
