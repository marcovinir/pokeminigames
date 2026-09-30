import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import { createAuthRouter } from "./auth/auth.routes.js";
import { AuthService } from "./auth/auth.service.js";
import { createPasswordHasher } from "./auth/password.js";
import type { TokenService } from "./auth/tokens.js";
import type { Env } from "./config/env.js";
import type { PrismaClient } from "./db/prisma.js";
import type { RoomManager } from "./game/room-manager.js";
import { errorHandler, notFoundHandler } from "./http/errors.js";
import { createRoomsRouter } from "./rooms/rooms.routes.js";

export interface AppDeps {
  env: Env;
  prisma: PrismaClient;
  /** El mismo servicio de tokens que usa Socket.io para autenticar el handshake. */
  tokens: TokenService;
  roomManager: RoomManager;
}

export function createApp({ env, prisma, tokens, roomManager }: AppDeps): Express {
  const authService = new AuthService({
    prisma,
    hasher: createPasswordHasher(env.BCRYPT_COST),
    tokens,
    refreshTtlMs: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });

  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "10kb" }));
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use("/auth", createAuthRouter({ env, authService, tokens }));
  app.use("/rooms", createRoomsRouter({ manager: roomManager, tokens }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
