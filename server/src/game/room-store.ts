import type { GameRoom } from "./room.js";

/** Dónde viven las salas activas. Hoy en memoria; una implementación con Redis cabría aquí. */
export interface RoomStore {
  get(code: string): GameRoom | undefined;
  add(room: GameRoom): void;
  remove(code: string): void;
  /** La sala activa (no terminada) en la que participa el usuario, si hay alguna. */
  findByUser(userId: string): GameRoom | undefined;
}

export class InMemoryRoomStore implements RoomStore {
  private readonly rooms = new Map<string, GameRoom>();

  get(code: string): GameRoom | undefined {
    return this.rooms.get(code);
  }

  add(room: GameRoom): void {
    this.rooms.set(room.code, room);
  }

  remove(code: string): void {
    this.rooms.delete(code);
  }

  findByUser(userId: string): GameRoom | undefined {
    // Hay pocas salas activas a la vez: un recorrido lineal es suficiente.
    for (const room of this.rooms.values()) {
      if (room.phase !== "finished" && room.seatOf(userId) !== undefined) return room;
    }
    return undefined;
  }
}
