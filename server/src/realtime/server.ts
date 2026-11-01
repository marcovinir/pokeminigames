import type { Server as HttpServer } from "node:http";
import { BID_STEPS, type BattleMove, type BidStep, type ClientToServerEvents, TYPE_NAMES, type ErrorCode, type Seat, type ServerToClientEvents } from "@pokemon-minigames/shared";
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
const bidSchema = z.object({ step: z.custom<BidStep | null>((value) => value === null || BID_STEPS.includes(value as BidStep)), turnId: z.number().int() });
const passSchema = z.object({ turnId: z.number().int() });
const lineupSchema = z.strictObject({ order: z.array(z.number().int()).max(6) });
const moveSchema = z.strictObject({ move: z.string().min(1).max(40) });
const pauseSchema = z.strictObject({ choice: z.strictObject({ titular: z.number().int() }) });
const switchSchema = z.strictObject({ pokemonId: z.number().int() });
const stillHereSchema = z.strictObject({ turnId: z.number().int() });

export type GameIoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** Monta Socket.io sobre el servidor HTTP. Cada evento se valida y se delega en la sala. */
export function attachRealtime(httpServer: HttpServer, deps: RealtimeDeps): GameIoServer {
  const io: GameIoServer = new Server(httpServer, {
    cors: deps.env.CORS_ORIGIN ? { origin: deps.env.CORS_ORIGIN, credentials: true } : undefined,
  });

  io.use((socket, next) => {
    const token: unknown = socket.handshake.auth?.token;
    if (typeof token !== "string") return next(new Error("UNAUTHORIZED"));
    try {
      const payload = deps.tokens.verifyAccessToken(token);
      socket.data.user = { userId: payload.sub, username: payload.username, isGuest: payload.guest === true };
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
      // Con una oferta de revancha en marcha, soltarse empieza la cuenta de «se fue» (una recarga vuelve a tiempo).
      deps.manager.rematch.disconnected(room.code, seat);
    }
  }

  socket.on(
    "join-room",
    handle(joinSchema, ({ code }) => {
      // Los dos aceptaron la revancha justo cuando esta persona recargaba o reconectaba: se le dice a qué sala ir.
      const forwarded = deps.manager.rematch.forwardFor(code, user.userId);
      if (forwarded) {
        socket.emit("rematch-room", { code: forwarded });
        return;
      }
      const { room, seat } = deps.manager.connect(user, code);
      if (binding && (binding.room !== room || binding.seat !== seat)) release();

      const previous = broadcaster.bind(room.code, seat, socket);
      binding = { room, seat };
      // Otra pestaña del mismo jugador queda reemplazada. Se desconecta sin avisar a la sala:
      // el asiento no se cae, solo cambia de socket.
      if (previous && previous !== socket) previous.disconnect(true);
      if (room.phase === "finished") {
        // La partida terminó pero la sala sigue viva por una oferta de revancha: se le reenvía el resumen y el estado de la oferta.
        room.replaySummary(seat);
        deps.manager.rematch.reconnected(room.code, seat);
      } else {
        room.dispatch({ type: "PLAYER_CONNECTED", seat });
      }
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
    "auction-bid",
    handle(bidSchema, ({ step, turnId }) => {
      const { room, seat } = requireBinding();
      room.dispatch({ type: "BID", seat, step, turnId });
    }),
  );

  socket.on(
    "auction-pass",
    handle(passSchema, ({ turnId }) => {
      const { room, seat } = requireBinding();
      room.dispatch({ type: "PASS", seat, turnId });
    }),
  );

  socket.on(
    "auction-still-here",
    handle(stillHereSchema, ({ turnId }) => {
      const { room, seat } = requireBinding();
      room.dispatch({ type: "STILL_HERE", seat, turnId });
    }),
  );

  socket.on(
    "auction-ready",
    handle(null, () => {
      const { room, seat } = requireBinding();
      room.dispatch({ type: "READY", seat });
    }),
  );

  socket.on(
    "auction-lineup",
    handle(lineupSchema, ({ order }) => {
      const { room, seat } = requireBinding();
      room.dispatch({ type: "CHOOSE_LINEUP", seat, order });
    }),
  );

  socket.on(
    "auction-move",
    handle(moveSchema, ({ move }) => {
      const { room, seat } = requireBinding();
      room.dispatch({ type: "CHOOSE_MOVE", seat, move });
    }),
  );

  socket.on(
    "auction-switch",
    handle(switchSchema, ({ pokemonId }) => {
      const { room, seat } = requireBinding();
      room.dispatch({ type: "CHOOSE_SWITCH", seat, pokemonId });
    }),
  );

  socket.on(
    "auction-pause",
    handle(pauseSchema, ({ choice }) => {
      const { room, seat } = requireBinding();
      room.dispatch({ type: "PAUSE_CONFIRM", seat, choice });
    }),
  );

  socket.on(
    "rematch-request",
    handle(null, () => {
      const { room, seat } = requireBinding();
      deps.manager.rematch.request(room.code, seat);
    }),
  );

  socket.on(
    "rematch-cancel",
    handle(null, () => {
      const { room, seat } = requireBinding();
      deps.manager.rematch.cancel(room.code, seat);
    }),
  );

  socket.on(
    "leave-room",
    handle(null, () => {
      const { room, seat } = requireBinding();
      room.dispatch({ type: "LEAVE", seat });
      // Salir con una oferta de revancha en marcha: el otro ve «se fue».
      deps.manager.rematch.leave(room.code, seat);
      // Después del LEAVE, para que quien se va también reciba el resumen final.
      binding = null;
      broadcaster.unbind(room.code, seat, socket);
    }),
  );

  socket.on("disconnect", () => release());
}
