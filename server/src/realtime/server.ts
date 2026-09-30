import type { Server as HttpServer } from "node:http";
import type { ClientToServerEvents, ErrorCode, Seat, ServerToClientEvents } from "@pokemon-minigames/shared";
import { Server } from "socket.io";
import { z } from "zod";
import type { TokenService } from "../auth/tokens.js";
import type { Env } from "../config/env.js";
import { MAX_ANSWER_LENGTH, SOCKET_EVENTS_PER_SECOND } from "../game/constants.js";
import type { GameRoom } from "../game/room.js";
import type { RoomManager } from "../game/room-manager.js";
import { AppError } from "../http/errors.js";
import type { SocketBroadcaster, GameSocket, SocketData } from "./broadcaster.js";
import { createRateLimiter } from "./rate-limiter.js";

export interface RealtimeDeps {
  env: Env;
  tokens: TokenService;
  manager: RoomManager;
  broadcaster: SocketBroadcaster;
  eventsPerSecond?: number;
  logger?: { error(message: string, error?: unknown): void };
}

const joinSchema = z.object({ code: z.string().min(1).max(20) });
const chooseSchema = z.object({ type: z.string().min(1).max(30) });
const submitSchema = z.object({ text: z.string().max(MAX_ANSWER_LENGTH) });

export type GameIoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** Monta Socket.io sobre el servidor HTTP. Cada evento se valida y se delega en la sala. */
export function attachRealtime(httpServer: HttpServer, deps: RealtimeDeps): GameIoServer {
  const io: GameIoServer = new Server(httpServer, {
    cors: { origin: deps.env.CORS_ORIGIN, credentials: true },
  });

  io.use((socket, next) => {
    const token: unknown = socket.handshake.auth?.token;
    if (typeof token !== "string") return next(new Error("UNAUTHORIZED"));
    try {
      const payload = deps.tokens.verifyAccessToken(token);
      socket.data.user = { userId: payload.sub, username: payload.username };
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket) => registerHandlers(socket, deps));
  return io;
}

function toErrorPayload(error: unknown, deps: RealtimeDeps): { code: ErrorCode; message: string } {
  if (error instanceof AppError) return { code: error.code, message: error.message };
  if (error instanceof z.ZodError) return { code: "VALIDATION_ERROR", message: "Datos inválidos" };
  deps.logger?.error("Error inesperado en un evento de socket", error);
  return { code: "INTERNAL_ERROR", message: "Error interno del servidor" };
}

function registerHandlers(socket: GameSocket, deps: RealtimeDeps): void {
  const { manager, broadcaster } = deps;
  const user = socket.data.user;
  const limiter = createRateLimiter(deps.eventsPerSecond ?? SOCKET_EVENTS_PER_SECOND, 1000);
  let binding: { room: GameRoom; seat: Seat } | null = null;

  /** Ejecuta un evento del cliente: límite de frecuencia, validación y manejo de errores. */
  function handle<T>(schema: z.ZodType<T> | null, action: (payload: T) => void) {
    return (raw?: unknown) => {
      if (!limiter.allow()) {
        socket.emit("error", { code: "RATE_LIMITED", message: "Demasiados eventos seguidos" });
        return;
      }
      try {
        action(schema ? schema.parse(raw) : (undefined as T));
      } catch (error) {
        socket.emit("error", toErrorPayload(error, deps));
      }
    };
  }

  function requireBinding(): { room: GameRoom; seat: Seat } {
    if (!binding) throw new AppError(403, "NOT_IN_ROOM", "Primero entra a una sala");
    return binding;
  }

  /** Suelta el asiento que este socket ocupaba, avisando a la sala si sigue siendo suyo. */
  function release(): void {
    if (!binding) return;
    const { room, seat } = binding;
    binding = null;
    if (broadcaster.unbind(room.code, seat, socket)) {
      room.dispatch({ type: "PLAYER_DISCONNECTED", seat });
    }
  }

  socket.on(
    "join-room",
    handle(joinSchema, ({ code }) => {
      const { room, seat } = deps.manager.connect(user, code);
      if (binding && (binding.room !== room || binding.seat !== seat)) release();

      const previous = broadcaster.bind(room.code, seat, socket);
      binding = { room, seat };
      // Otra pestaña del mismo jugador queda reemplazada. Se desconecta sin avisar a la sala:
      // el asiento no se cae, solo cambia de socket.
      if (previous && previous !== socket) previous.disconnect(true);
      room.dispatch({ type: "PLAYER_CONNECTED", seat });
    }),
  );

  socket.on(
    "choose-type",
    handle(chooseSchema, ({ type }) => {
      const { room, seat } = requireBinding();
      room.dispatch({ type: "CHOOSE_TYPE", seat, typeName: type });
    }),
  );

  socket.on(
    "submit-pokemon",
    handle(submitSchema, ({ text }) => {
      const { room, seat } = requireBinding();
      room.dispatch({ type: "SUBMIT", seat, text });
    }),
  );

  socket.on(
    "leave-room",
    handle(null, () => {
      const { room, seat } = requireBinding();
      room.dispatch({ type: "LEAVE", seat });
      // Después del LEAVE, para que quien se va también reciba el resumen final.
      binding = null;
      broadcaster.unbind(room.code, seat, socket);
    }),
  );

  socket.on("disconnect", () => release());
}
