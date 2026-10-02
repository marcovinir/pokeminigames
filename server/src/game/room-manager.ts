import type { GamePhase, PublicRoomInfo, RoomConfig, Seat } from "@pokemon-minigames/shared";
import { Prisma } from "../generated/prisma/client.js";
import { AppError } from "../http/errors.js";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "./constants.js";
import type { Rng } from "./rng.js";
import { GameRoom, type GameRoomPorts, type RoomUser } from "./room.js";
import type { RoomStore } from "./room-store.js";

export interface RoomManagerDeps extends GameRoomPorts {
  store: RoomStore;
  /** Reemplazable en las pruebas para forzar códigos conocidos. */
  generateCode?: () => string;
}

const MAX_CODE_ATTEMPTS = 10;

export function generateRoomCode(rng: Rng): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[rng.int(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

const normalizeCode = (code: string): string => code.trim().toUpperCase();

const alreadyInGame = () => new AppError(409, "ALREADY_IN_GAME", "Ya estás en una partida activa");

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Crea y busca salas, y decide quién puede entrar en ellas. */
export class RoomManager {
  /** Usuarios con una sala en proceso de creación (evita que uno cree dos a la vez). */
  private readonly pendingCreates = new Set<string>();

  constructor(private readonly deps: RoomManagerDeps) {}

  async createRoom(user: RoomUser, config: RoomConfig): Promise<{ code: string }> {
    if (this.deps.store.findByUser(user.userId) || this.pendingCreates.has(user.userId)) {
      throw alreadyInGame();
    }
    this.pendingCreates.add(user.userId);
    try {
      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
        const code = this.deps.generateCode?.() ?? generateRoomCode(this.deps.rng);
        if (this.deps.store.get(code)) continue;

        let gameId: string;
        try {
          gameId = await this.deps.repository.createGame({ roomCode: code, config, creatorUserId: user.userId });
        } catch (error) {
          // El código ya se usó en una partida anterior (la base de datos lo exige único).
          if (isUniqueViolation(error)) continue;
          throw error;
        }

        const room = GameRoom.create(this.deps, { code, gameId, config, creator: user });
        room.onFinished(() => this.deps.store.remove(code));
        this.deps.store.add(room);
        return { code };
      }
      throw new Error("No se pudo generar un código de sala único");
    } finally {
      this.pendingCreates.delete(user.userId);
    }
  }

  /** Reserva el asiento 2. Si el usuario ya está en esa sala, no hace nada. */
  joinRoom(user: RoomUser, code: string): { code: string } {
    const room = this.findRoom(code);
    if (room.seatOf(user.userId) !== undefined) return { code: room.code };
    if (room.phase !== "waiting") {
      throw new AppError(409, "ROOM_CLOSED", "La sala ya no admite jugadores");
    }
    if (room.hasSeat(2)) throw new AppError(409, "ROOM_FULL", "La sala está llena");
    // También cuenta quien está creando una sala en este momento: si no, podría quedar sentado en dos.
    if (this.deps.store.findByUser(user.userId) || this.pendingCreates.has(user.userId)) throw alreadyInGame();

    room.dispatch({ type: "PLAYER_JOINED", userId: user.userId, username: user.username });
    return { code: room.code };
  }

  /** La sala activa del usuario, si participa en alguna. */
  currentFor(userId: string): { code: string; phase: GamePhase } | null {
    const room = this.deps.store.findByUser(userId);
    return room ? { code: room.code, phase: room.phase } : null;
  }

  getPublicInfo(code: string): PublicRoomInfo {
    const room = this.findRoom(code);
    return {
      code: room.code,
      phase: room.phase,
      config: room.config,
      creator: room.creatorName(),
      playerCount: room.playerCount(),
    };
  }

  /** Para el socket: la sala y el asiento del usuario, si participa en ella. */
  connect(user: RoomUser, code: string): { room: GameRoom; seat: Seat } {
    const room = this.findRoom(code);
    const seat = room.seatOf(user.userId);
    if (seat === undefined) throw new AppError(403, "NOT_IN_ROOM", "No participas en esa sala");
    return { room, seat };
  }

  private findRoom(code: string): GameRoom {
    const room = this.deps.store.get(normalizeCode(code));
    if (!room) throw new AppError(404, "ROOM_NOT_FOUND", "No existe una sala con ese código");
    return room;
  }
}
