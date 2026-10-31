import { createServer } from "node:http";
import { join } from "node:path";
import { createApp } from "./app.js";
import { rateLimitsFor } from "./http/limits.js";
import { createTokenService } from "./auth/tokens.js";
import { loadPokedex } from "./catalog/pokedex-store.js";
import { loadCatalog } from "./catalog/pokemon-catalog.js";
import { loadEnv } from "./config/env.js";
import { createPrismaClient } from "./db/prisma.js";
import { createPrismaGameRepository } from "./game/prisma-game-repository.js";
import { systemClock, timerScheduler } from "./game/ports.js";
import { cryptoRng } from "./game/rng.js";
import { RoomManager } from "./game/room-manager.js";
import { InMemoryRoomStore } from "./game/room-store.js";
import { createSilhouetteRegistry } from "./silhouettes/registry.js";
import { SocketBroadcaster } from "./realtime/broadcaster.js";
import { attachRealtime } from "./realtime/server.js";
import { createShutdown } from "./shutdown.js";

const env = loadEnv();
const prisma = createPrismaClient(env.DATABASE_URL, {
  onPoolError: (error) => console.warn(`Base de datos: se cerró una conexión inactiva (${error.message})`),
});
const repository = createPrismaGameRepository(prisma);

// Las salas viven en memoria: lo que quedó a medias antes de reiniciar ya no se puede retomar.
const abandoned = await repository.abandonUnfinished();
if (abandoned > 0) console.log(`${abandoned} partida(s) sin terminar marcadas como abandonadas`);

const catalog = await loadCatalog(prisma);
if (catalog.size === 0) {
  console.error("El catálogo de Pokémon está vacío. Ejecuta `npm run db:seed -w server` y reinicia.");
  process.exit(1);
}
console.log(`Catálogo cargado: ${catalog.size} Pokémon`);

const tokens = createTokenService({
  secret: env.JWT_ACCESS_SECRET,
  accessTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
});
const broadcaster = new SocketBroadcaster();
const silhouettes = createSilhouetteRegistry();
const roomManager = new RoomManager({
  clock: systemClock,
  scheduler: timerScheduler,
  broadcaster,
  repository,
  catalog,
  rng: cryptoRng,
  store: new InMemoryRoomStore(),
  logger: console,
  silhouettes,
});

// El cliente construido y estos datos viven a la misma distancia desde server/src y desde el servidor empaquetado (server/dist).
const pokedex = loadPokedex(new URL("../data/pokedex.snapshot.json", import.meta.url));
const app = createApp({ pokedex, env, prisma, tokens, roomManager, catalog, rateLimits: rateLimitsFor(env.NODE_ENV), clientDist: join(import.meta.dirname, "../../client/dist"), silhouettes });
const server = createServer(app);
const io = attachRealtime(server, { env, tokens, manager: roomManager, broadcaster, logger: console });

server.listen(env.PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${env.PORT}`);
});

const shutdown = createShutdown({ io, prisma, logger: console, exit: (code) => process.exit(code) });

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
