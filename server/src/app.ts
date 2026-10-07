import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import { createAuthRouter } from "./auth/auth.routes.js";
import { AuthService } from "./auth/auth.service.js";
import { createPasswordHasher } from "./auth/password.js";
import type { TokenService } from "./auth/tokens.js";
import { createCatalogRouter } from "./catalog/catalog.routes.js";
import type { PokemonCatalog } from "./catalog/pokemon-catalog.js";
import type { Env } from "./config/env.js";
import type { PrismaClient } from "./db/prisma.js";
import type { RoomManager } from "./game/room-manager.js";
import { errorHandler, notFoundHandler } from "./http/errors.js";
import { createOriginCheck } from "./http/origin-check.js";
import { createRoomsRouter } from "./rooms/rooms.routes.js";
import { createStatsRouter } from "./stats/stats.routes.js";
import { StatsService } from "./stats/stats.service.js";

export interface AppDeps {
  env: Env;
  prisma: PrismaClient;
  /** El mismo servicio de tokens que usa Socket.io para autenticar el handshake. */
  tokens: TokenService;
  roomManager: RoomManager;
  catalog: PokemonCatalog;
}

export function createApp({ env, prisma, tokens, roomManager, catalog }: AppDeps): Express {
  const authService = new AuthService({
    prisma,
    hasher: createPasswordHasher(env.BCRYPT_COST),
    tokens,
    refreshTtlMs: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });

  const app = express();
  app.disable("x-powered-by");
  // Cuántos proxies hay delante (en Render, 1): de eso depende la IP del cliente y el protocolo (req.ip, req.protocol).
  app.set("trust proxy", env.TRUST_PROXY);
  // Sin CORS_ORIGIN (producción, un solo origen) no se instala CORS: no hay otros orígenes a los que conceder nada.
  if (env.CORS_ORIGIN) app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "10kb" }));
  app.use(cookieParser());
  app.use(createOriginCheck({ allowedOrigins: env.CORS_ORIGIN ? [env.CORS_ORIGIN] : [] }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use("/auth", createAuthRouter({ env, authService, tokens }));
  app.use("/rooms", createRoomsRouter({ manager: roomManager, tokens }));
  app.use("/pokemon", createCatalogRouter({ catalog }));
  app.use(createStatsRouter({ service: new StatsService({ prisma, catalog }), tokens }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
