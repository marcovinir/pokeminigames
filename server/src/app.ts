import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import { createAuthRouter } from "./auth/auth.routes.js";
import { GUEST_SESSION_TTL_MS, createGuestSessions } from "./auth/guest-sessions.js";
import { AuthService } from "./auth/auth.service.js";
import { createPasswordHasher } from "./auth/password.js";
import type { TokenService } from "./auth/tokens.js";
import { createCatalogRouter } from "./catalog/catalog.routes.js";
import type { PokedexStore } from "./catalog/pokedex-store.js";
import type { PokemonCatalog } from "./catalog/pokemon-catalog.js";
import type { Env } from "./config/env.js";
import type { PrismaClient } from "./db/prisma.js";
import type { RoomManager } from "./game/room-manager.js";
import { API_PREFIXES } from "./http/api-paths.js";
import { createClientApp } from "./http/client-app.js";
import { errorHandler, notFoundHandler } from "./http/errors.js";
import { DEFAULT_RATE_LIMITS, type RateLimitConfig } from "./http/limits.js";
import { createOriginCheck } from "./http/origin-check.js";
import { createKeyedLimiter, rateLimitMiddleware } from "./http/rate-limit.js";
import { createRoomsRouter } from "./rooms/rooms.routes.js";
import type { SilhouetteRegistry } from "./game/ports.js";
import { createSilhouetteRenderer } from "./silhouettes/renderer.js";
import { createSilhouettesRouter } from "./silhouettes/silhouettes.routes.js";
import { createStatsRouter } from "./stats/stats.routes.js";
import { StatsService } from "./stats/stats.service.js";

export interface AppDeps {
  env: Env;
  prisma: PrismaClient;
  /** El mismo servicio de tokens que usa Socket.io para autenticar el handshake. */
  tokens: TokenService;
  roomManager: RoomManager;
  catalog: PokemonCatalog;
  /** Límites de peticiones; "off" los apaga (solo para pruebas). Por defecto, los de producción. */
  rateLimits?: RateLimitConfig | "off";
  /** Directorio del cliente construido; si existe con su index.html, el servidor lo sirve (un solo origen). */
  clientDist?: string;
  /** El registro de siluetas que comparte con las salas (sin él, uno vacío). */
  /** El mismo registro que usa el `RoomManager`: con uno distinto, todas las siluetas darían 404. */
  silhouettes: SilhouetteRegistry;
  pokedex: PokedexStore;
}

export function createApp({
  env,
  prisma,
  tokens,
  roomManager,
  catalog,
  rateLimits = DEFAULT_RATE_LIMITS,
  clientDist,
  silhouettes,
  pokedex,
}: AppDeps): Express {
  const limits = rateLimits === "off" ? null : rateLimits;
  const limiters = limits && {
    loginFailures: createKeyedLimiter({ ...limits.loginFailures, now: limits.now }),
    loginFailuresByIp: createKeyedLimiter({ ...limits.loginFailuresByIp, now: limits.now }),
    register: createKeyedLimiter({ ...limits.register, now: limits.now }),
    registerFailures: createKeyedLimiter({ ...limits.registerFailures, now: limits.now }),
    guestSessions: createKeyedLimiter({ ...limits.guestSessions, now: limits.now }),
    api: createKeyedLimiter({ ...limits.api, now: limits.now }),
  };

  const guests = createGuestSessions({ secret: env.JWT_ACCESS_SECRET, ttlMs: GUEST_SESSION_TTL_MS });

  const authService = new AuthService({
    prisma,
    hasher: createPasswordHasher(env.BCRYPT_COST),
    tokens,
    refreshTtlMs: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });

  const app = express();
  app.disable("x-powered-by");
  // Cuántos proxies hay delante (en Render se verifica tras desplegar, ver docs/despliegue.md): de eso depende la IP del cliente y el protocolo (req.ip, req.protocol).
  app.set("trust proxy", env.TRUST_PROXY);
  // Sin CORS_ORIGIN (producción, un solo origen) no se instala CORS: no hay otros orígenes a los que conceder nada.
  if (env.CORS_ORIGIN) app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "10kb" }));
  app.use(cookieParser());
  app.use(createOriginCheck({ allowedOrigins: env.CORS_ORIGIN ? [env.CORS_ORIGIN] : [] }));
  // El límite general solo cubre la API: /health (que consulta la plataforma sin parar) y /socket.io quedan fuera.
  if (limiters) app.use([...API_PREFIXES], rateLimitMiddleware({ limiter: limiters.api, keyOf: (req) => req.ip ?? "desconocida" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use("/auth", createAuthRouter({ env, authService, tokens, guests, limiters: limiters ?? undefined }));
  app.use("/rooms", createRoomsRouter({ manager: roomManager, tokens, readAvatar: (userId) => authService.avatarOf(userId) }));
  app.use("/pokemon", createCatalogRouter({ catalog, pokedex }));
  app.use("/silhouettes", createSilhouettesRouter({ registry: silhouettes, renderer: createSilhouetteRenderer({ artUrl: env.SILHOUETTE_ART_URL }) }));
  app.use(createStatsRouter({ service: new StatsService({ prisma, catalog }), tokens }));

  if (clientDist) {
    const client = createClientApp(clientDist);
    if (client) app.use(client);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
