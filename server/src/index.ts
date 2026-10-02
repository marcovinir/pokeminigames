import { createServer } from "node:http";
import { createApp } from "./app.js";
import { createTokenService } from "./auth/tokens.js";
import { loadCatalog } from "./catalog/pokemon-catalog.js";
import { loadEnv } from "./config/env.js";
import { createPrismaClient } from "./db/prisma.js";
import { createPrismaGameRepository } from "./game/prisma-game-repository.js";
import { systemClock, timerScheduler } from "./game/ports.js";
import { cryptoRng } from "./game/rng.js";
import { RoomManager } from "./game/room-manager.js";
import { InMemoryRoomStore } from "./game/room-store.js";
import { SocketBroadcaster } from "./realtime/broadcaster.js";
import { attachRealtime } from "./realtime/server.js";

const env = loadEnv();
const prisma = createPrismaClient(env.DATABASE_URL);
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
const roomManager = new RoomManager({
  clock: systemClock,
  scheduler: timerScheduler,
  broadcaster,
  repository,
  catalog,
  rng: cryptoRng,
  store: new InMemoryRoomStore(),
  logger: console,
});

const app = createApp({ env, prisma, tokens, roomManager, catalog });
const server = createServer(app);
const io = attachRealtime(server, { env, tokens, manager: roomManager, broadcaster, logger: console });

server.listen(env.PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${env.PORT}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} recibido, cerrando...`);
  await io.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
