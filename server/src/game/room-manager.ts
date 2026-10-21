import type { GamePhase, PublicRoomInfo, RoomConfig, Seat } from "@pokemon-minigames/shared";
import { Prisma } from "../generated/prisma/client.js";
import { AppError } from "../http/errors.js";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, REMATCH_END_REASONS, REMATCH_RECENT_GAMES } from "./constants.js";
import { RematchCoordinator, type RematchPlayer } from "./rematch.js";
import { recordFor } from "./rematch-record.js";
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
  /** Las ofertas de revancha de las salas que acaban de terminar. */
  readonly rematch: RematchCoordinator;

  constructor(private readonly deps: RoomManagerDeps) {
    this.rematch = new RematchCoordinator({
      clock: deps.clock,
      scheduler: deps.scheduler,
      broadcaster: deps.broadcaster,
      release: (code) => deps.store.remove(code),
      createRoom: (input) => this.createRematchRoom(input),
      logger: deps.logger,
    });
  }

  async createRoom(user: RoomUser, config: RoomConfig): Promise<{ code: string }> {
    if (this.deps.store.findByUser(user.userId) || this.pendingCreates.has(user.userId)) {
      throw alreadyInGame();
    }
    this.pendingCreates.add(user.userId);
    try {
      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
        const code = this.deps.generateCode?.() ?? generateRoomCode(this.deps.rng);
        if (this.deps.store.get(code)) continue;

        // Un invitado no tiene fila en `users`: su sala no se guarda (y su código solo debe ser único entre las salas vivas).
        let gameId: string | null = null;
        if (!user.isGuest) {
          try {
            gameId = await this.deps.repository.createGame({ roomCode: code, config, creatorUserId: user.userId });
          } catch (error) {
            // El código ya se usó en una partida anterior (la base de datos lo exige único).
            if (isUniqueViolation(error)) continue;
            throw error;
          }
        }

        const room = GameRoom.create(this.deps, { code, gameId, config, creator: user });
        this.track(room);
        return { code };
      }
      throw new Error("No se pudo generar un código de sala único");
    } finally {
      this.pendingCreates.delete(user.userId);
    }
  }

  /**
   * La sala de una revancha: código nuevo, los mismos jugadores en los mismos asientos y la misma configuración (entera).
   * Se guarda en la base de datos solo si **ninguno** es invitado. Si alguno ya está en otra sala lanza `ALREADY_IN_GAME`
   * con el asiento de esa persona.
   */
  async createRematchRoom(input: { players: Record<Seat, RematchPlayer>; config: RoomConfig }): Promise<{ code: string }> {
    const { players, config } = input;
    for (const seat of [1, 2] as const) {
      const { userId } = players[seat];
      if (this.deps.store.findByUser(userId) || this.pendingCreates.has(userId)) {
        throw new AppError(409, "ALREADY_IN_GAME", "Ya estás en una partida activa", { seat });
      }
    }
    const ids = [players[1].userId, players[2].userId];
    for (const id of ids) this.pendingCreates.add(id);
    try {
      const persisted = !players[1].isGuest && !players[2].isGuest;
      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
        const code = this.deps.generateCode?.() ?? generateRoomCode(this.deps.rng);
        if (this.deps.store.get(code)) continue;

        let gameId: string | null = null;
        if (persisted) {
          try {
            gameId = await this.deps.repository.createGame({ roomCode: code, config, creatorUserId: players[1].userId });
          } catch (error) {
            if (isUniqueViolation(error)) continue;
            throw error;
          }
        }

        const room = GameRoom.create(this.deps, { code, gameId, config, creator: players[1], rematch: true });
        // El segundo asiento se ocupa ya: si algún jugador es invitado la sala no se guarda y `persist_seat_taken` se ignora.
        const second = players[2];
        room.dispatch({ type: "PLAYER_JOINED", userId: second.userId, username: second.username, ...(second.isGuest ? { guest: true } : {}) });
        this.track(room);
        return { code };
      }
      throw new Error("No se pudo generar un código de sala único");
    } finally {
      for (const id of ids) this.pendingCreates.delete(id);
    }
  }

  /** Registra la sala y decide qué pasa cuando termina: una oferta de revancha o salir del almacén. */
  private track(room: GameRoom): void {
    room.onFinished(() => this.onRoomFinished(room));
    this.deps.store.add(room);
  }

  /**
   * Una partida que terminó con normalidad abre una oferta de revancha y su sala se queda en el almacén (para poder
   * reconectar al resumen); con cualquier otro motivo se quita al instante, como siempre.
   */
  private onRoomFinished(room: GameRoom): void {
    const reason = room.outcome?.reason;
    const { 1: one, 2: two } = room.players();
    if (!reason || !REMATCH_END_REASONS.includes(reason) || !one || !two) {
      this.deps.store.remove(room.code);
      return;
    }
    // El récord solo existe entre dos cuentas y si esta partida se guardó; se pide cuando ya está escrito el final.
    const record =
      !one.isGuest && !two.isGuest && room.persisted
        ? room
            .idle()
            .then(() => this.deps.repository.headToHead(one.userId, two.userId, REMATCH_RECENT_GAMES))
            .then((head) => recordFor(head, 1))
        : null;
    this.rematch.open({ code: room.code, players: { 1: one, 2: two }, config: room.config, record });
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
    // Dos personas con el mismo nombre en una sala no se distinguirían en pantalla (los invitados eligen su nombre).
    if (room.creatorName().toLowerCase() === user.username.toLowerCase()) {
      throw new AppError(409, "NAME_IN_USE", "Ya hay alguien con ese nombre en la sala");
    }

    // Con un invitado la partida no deja rastro para nadie: se descarta ANTES de sentarlo, para que no se guarde su asiento.
    if (user.isGuest) room.markNotPersisted();
    room.dispatch({ type: "PLAYER_JOINED", userId: user.userId, username: user.username, ...(user.isGuest ? { guest: true } : {}) });
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
