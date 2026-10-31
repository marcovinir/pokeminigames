import type { PokedexDetail } from "@pokemon-minigames/shared";
import { createPokedexStore } from "../../src/catalog/pokedex-store.js";
import type { Express } from "express";
import { createApp } from "../../src/app.js";
import type { RateLimitConfig } from "../../src/http/limits.js";
import type { PokemonCatalog } from "../../src/catalog/pokemon-catalog.js";
import { createTokenService } from "../../src/auth/tokens.js";
import { loadEnv } from "../../src/config/env.js";
import { createPrismaGameRepository } from "../../src/game/prisma-game-repository.js";
import { type Rng, cryptoRng } from "../../src/game/rng.js";
import { RoomManager } from "../../src/game/room-manager.js";
import { InMemoryRoomStore } from "../../src/game/room-store.js";
import { createSilhouetteRegistry } from "../../src/silhouettes/registry.js";
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
  /** Límites de peticiones (por defecto apagados: muchas pruebas registran a más personas de las que permite la IP). */
  rateLimits?: RateLimitConfig;
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
  const silhouettes = createSilhouetteRegistry();
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
    silhouettes,
  });
  const app = createApp({ pokedex: createPokedexStore(TEST_POKEDEX), env, prisma, tokens, roomManager, catalog, rateLimits: options.rateLimits ?? "off", silhouettes });
  return { app, env, tokens, time, broadcaster, store, roomManager, catalog, silhouettes };
}

const TEST_POKEDEX: PokedexDetail[] = [
  {
    id: 6,
    names: { es: "Charizard", en: "Charizard" },
    types: ["fire", "flying"],
    total: 534,
    generation: 1,
    spriteUrl: "https://sprite/6.png",
    stats: { hp: 78, attack: 84, defense: 78, spAttack: 109, spDefense: 85, speed: 100 },
    abilities: [{ name: "Mar Llamas", hidden: false, description: { text: "Potencia el fuego.", language: "es" } }],
    lore: { text: "Escupe fuego.", language: "es", game: "Espada" },
    evolution: { id: 6, name: "Charizard", condition: null, next: [] },
  },
];

export function buildTestApp(overrides: Record<string, string> = {}): Express {
  return buildTestContext(overrides).app;
}
