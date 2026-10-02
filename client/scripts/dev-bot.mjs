/**
 * Segundo jugador simulado para probar el cliente a mano con una sola persona.
 *
 *   node client/scripts/dev-bot.mjs CODIGO [random|chosen]
 *
 * Se registra con un usuario `bot_xxxx`, se une a la sala con ese código y juega: elige siempre
 * el tipo agua (modo elegido) y, 4 segundos después de empezar cada ronda, responde con un
 * Pokémon válido que nadie haya reclamado. Se conecta directamente al servidor del juego
 * (puerto 3000, o el de la variable PORT); usa el catálogo de `server/data/catalog.snapshot.json`.
 *
 * Deja en la base de datos de desarrollo un usuario `bot_*` y la partida: al terminar imprime
 * el SQL para borrarlos.
 */
import { readFileSync } from "node:fs";
import { io } from "socket.io-client";

const code = process.argv[2];
if (!code) {
  console.error("Uso: node client/scripts/dev-bot.mjs CODIGO_DE_SALA");
  process.exit(1);
}
const BASE = `http://localhost:${process.env.PORT ?? 3000}`;
const snapshot = JSON.parse(readFileSync(new URL("../../server/data/catalog.snapshot.json", import.meta.url), "utf8"));

async function api(path, body, token) {
  const response = await fetch(BASE + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

const tag = Math.random().toString(36).slice(2, 6);
const registration = await api("/auth/register", {
  email: `bot_${tag}@example.com`,
  username: `bot_${tag}`,
  password: "pikachu-123",
});
const token = registration.body.accessToken;
console.log(`unirse a ${code}:`, (await api(`/rooms/${code}/join`, {}, token)).status);

const socket = io(BASE, { auth: { token }, transports: ["websocket"] });
const claimed = new Set();

socket.on("connect", () => socket.emit("join-room", { code }));
socket.on("game-starting", () => console.log("[bot] cuenta atrás"));
socket.on("choose-types", () => setTimeout(() => socket.emit("choose-type", { type: "water" }), 1500));
socket.on("round-started", (round) => {
  const valid = snapshot.pokemon.filter(
    (p) => p.types.length === 2 && p.types.includes(round.type1) && p.types.includes(round.type2) && !claimed.has(p.id),
  );
  console.log(`[bot] ronda ${round.round}: ${round.type1}/${round.type2}, ${valid.length} válidos`);
  const pick = valid.at(-1);
  if (pick) setTimeout(() => socket.emit("submit-pokemon", { text: pick.names.en }), 4000);
});
socket.on("round-result", (result) => {
  for (const seat of [1, 2]) if (result.results[seat].pokemon) claimed.add(result.results[seat].pokemon.id);
  console.log("[bot] resultado:", result.results[1].result, "|", result.results[2].result);
});
socket.on("error", (error) => console.log("[bot] error", error));
socket.on("game-ended", (ended) => {
  console.log("[bot] fin:", ended.reason, "— ganador: asiento", ended.winnerSeat, "— totales", ended.totals);
  console.log(`\nPara limpiar la base de datos de desarrollo:\nDELETE FROM games WHERE room_code = '${code}'; DELETE FROM users WHERE email = 'bot_${tag}@example.com';`);
  setTimeout(() => process.exit(0), 300);
});
