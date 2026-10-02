import type { Express } from "express";
import { createApp } from "../../src/app.js";
import type { PokemonCatalog } from "../../src/catalog/pokemon-catalog.js";
import { createTokenService } from "../../src/auth/tokens.js";
import { loadEnv } from "../../src/config/env.js";
import { createPrismaGameRepository } from "../../src/game/prisma-game-repository.js";
import { type Rng, cryptoRng } from "../../src/game/rng.js";
import { RoomManager } from "../../src/game/room-manager.js";
import { InMemoryRoomStore } from "../../src/game/room-store.js";
import { SocketBroadcaster } from "../../src/realtime/broadcaster.js";
import { FakeTime } from "../game/fakes.js";
import { fixtureCatalog } from "./fixtures.js";
import { prisma } from "./db.js";

export interface TestContextOptions {
  /** Azar de las salas (por defecto el real). */
  rng?: Rng;
  /** Fuerza los códigos de sala (por defecto aleatorios). */
  generateCode?: () => string;
  /** Catálogo (por defecto el de pruebas en memoria). */
  catalog?: PokemonCatalog;
}

/**
 * La app completa (y sus piezas) con la configuración de .env.test y la base de datos de pruebas.
 * El tiempo de las salas es simulado (`time.advance`) y el catálogo es el de pruebas.
 */
export function buildTestContext(overrides: Record<string, string> = {}, options: TestContextOptions = {}) {
  const env = loadEnv({ ...process.env, ...overrides });
  const tokens = createTokenService({ secret: env.JWT_ACCESS_SECRET, accessTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS });
  const time = new FakeTime();
  const broadcaster = new SocketBroadcaster();
  const store = new InMemoryRoomStore();
  const catalog = options.catalog ?? fixtureCatalog();
  const roomManager = new RoomManager({
    clock: time,
    scheduler: time,
    broadcaster,
    repository: createPrismaGameRepository(prisma),
    catalog,
    rng: options.rng ?? cryptoRng,
    generateCode: options.generateCode,
    store,
    persistRetryDelayMs: 0,
  });
  const app = createApp({ env, prisma, tokens, roomManager, catalog });
  return { app, env, tokens, time, broadcaster, store, roomManager, catalog };
}

export function buildTestApp(overrides: Record<string, string> = {}): Express {
  return buildTestContext(overrides).app;
}
