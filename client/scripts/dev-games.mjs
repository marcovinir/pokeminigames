/**
 * Juega partidas reales de una ronda entre dos cuentas de prueba, con el resultado que le pidas, para
 * llenar el historial y las estadísticas sin jugar a mano.
 *
 *   node client/scripts/dev-games.mjs win win loss draw guest-forfeit cancel
 *
 * Cada argumento es una partida, en orden (la primera es la más antigua):
 *   win            gana la cuenta `anfitrion_x` (el rival responde mal)
 *   loss           gana `rival_y`
 *   draw           empate: nadie acierta
 *   guest-forfeit  `rival_y` abandona: gana `anfitrion_x` con el motivo "abandono"
 *   host-forfeit   `anfitrion_x` abandona: gana `rival_y`
 *   cancel         `anfitrion_x` crea una sala y la cancela (queda abandonada: no cuenta para las estadísticas)
 *
 * Se conecta directamente al servidor del juego (puerto 3000, o el de la variable PORT) y usa el catálogo de
 * `server/data/catalog.snapshot.json`. Crea las cuentas `anfitrion_x` y `rival_y` (contraseña `pikachu-123`) si no
 * existen. Deja datos en la base de datos de desarrollo: al terminar imprime el SQL para borrarlos.
 */
import { readFileSync } from "node:fs";
import { io } from "socket.io-client";

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

async function account(name) {
  const credentials = { email: `${name}@example.com`, password: "pikachu-123" };
  let response = await api("/auth/register", { ...credentials, username: name });
  if (response.status !== 201) response = await api("/auth/login", credentials);
  return { name, token: response.body.accessToken };
}

const connect = (who, code) => {
  const socket = io(BASE, { auth: { token: who.token }, transports: ["websocket"] });
  socket.on("connect", () => socket.emit("join-room", { code }));
  return socket;
};

const validAnswerFor = (round) =>
  snapshot.pokemon.find((p) => p.types.length === 2 && p.types.includes(round.type1) && p.types.includes(round.type2))?.names.en;

async function play(host, guest, outcome) {
  const room = await api("/rooms", { typeMode: "random", lengthMode: "custom", roundsLimit: 1 }, host.token);
  const code = room.body.code;
  await api(`/rooms/${code}/join`, {}, guest.token);
  const hostSocket = connect(host, code);
  const guestSocket = connect(guest, code);
  const ended = new Promise((resolve) => hostSocket.on("game-ended", resolve));

  hostSocket.on("round-started", (round) => {
    const right = validAnswerFor(round);
    setTimeout(() => {
      if (outcome === "host-forfeit") return hostSocket.emit("leave-room");
      if (outcome === "guest-forfeit") return guestSocket.emit("leave-room");
      // Una respuesta que no existe cierra la ronda en el acto (no hay que esperar los 15 s).
      hostSocket.emit("submit-pokemon", { text: outcome === "win" ? right : "zzz" });
      guestSocket.emit("submit-pokemon", { text: outcome === "loss" ? right : "zzz" });
    }, 600);
  });

  const result = await ended;
  hostSocket.disconnect();
  guestSocket.disconnect();
  console.log(`${outcome}: ${result.reason}, ganador: asiento ${result.winnerSeat}, totales`, result.totals);
}

async function cancelRoom(host) {
  const room = await api("/rooms", { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3 }, host.token);
  const socket = io(BASE, { auth: { token: host.token }, transports: ["websocket"] });
  await new Promise((resolve) => {
    socket.on("connect", () => socket.emit("join-room", { code: room.body.code }));
    socket.on("room-state", () => {
      socket.emit("leave-room");
      setTimeout(resolve, 500);
    });
  });
  socket.disconnect();
  console.log(`cancel: sala ${room.body.code} cancelada`);
}

const OUTCOMES = ["win", "loss", "draw", "guest-forfeit", "host-forfeit", "cancel"];
const requested = process.argv.slice(2);
if (requested.length === 0 || requested.some((o) => !OUTCOMES.includes(o))) {
  console.error(`Uso: node client/scripts/dev-games.mjs ${OUTCOMES.join("|")} [...]`);
  process.exit(1);
}

const host = await account("anfitrion_x");
const guest = await account("rival_y");
for (const outcome of requested) {
  if (outcome === "cancel") await cancelRoom(host);
  else await play(host, guest, outcome);
}

console.log(`
Para limpiar la base de datos de desarrollo:
DELETE FROM games WHERE id IN (SELECT game_id FROM game_players WHERE user_id IN (SELECT id FROM users WHERE email IN ('anfitrion_x@example.com', 'rival_y@example.com')));
DELETE FROM users WHERE email IN ('anfitrion_x@example.com', 'rival_y@example.com');`);
process.exit(0);
