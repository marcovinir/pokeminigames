/**
 * Prueba de humo manual: juega una partida de una ronda contra el servidor que ya está
 * corriendo (`npm run dev`), con el catálogo real y temporizadores reales (tarda ~6 s).
 * Deja en la base de datos de desarrollo dos usuarios `smoke*` y una partida: al final
 * imprime el SQL para borrarlos.
 */
import { readFileSync } from "node:fs";
import { io } from "socket.io-client";

const BASE = `http://localhost:${process.env.PORT ?? 3000}`;
const snapshot = JSON.parse(readFileSync(new URL("../data/catalog.snapshot.json", import.meta.url), "utf8")) as {
  pokemon: { id: number; types: string[]; names: { es: string; en: string } }[];
};

async function api(path: string, body?: unknown, token?: string) {
  const res = await fetch(BASE + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

const tag = Math.random().toString(36).slice(2, 7);
const register = async (name: string) =>
  (await api("/auth/register", { email: `${name}@smoke.test`, username: name, password: "pikachu-123" })).body;
const a = await register(`smokea_${tag}`);
const b = await register(`smokeb_${tag}`);

const created = await api("/rooms", { typeMode: "random", lengthMode: "custom", roundsLimit: 1 }, a.accessToken);
console.log("crear sala:", created.status, created.body);
const code = created.body.code as string;
console.log("unirse:", (await api(`/rooms/${code}/join`, {}, b.accessToken)).status);

const connect = (token: string) => io(BASE, { auth: { token }, transports: ["websocket"], reconnection: false });
const one = connect(a.accessToken);
const two = connect(b.accessToken);
const once = <T>(socket: ReturnType<typeof connect>, event: string) =>
  new Promise<T>((resolve) => socket.once(event, resolve as never));

const roundStarted = once<any>(one, "round-started");
const gameEnded = once<any>(one, "game-ended");
await Promise.all([once(one, "connect"), once(two, "connect")]);
one.emit("join-room", { code });
two.emit("join-room", { code });
console.log("esperando la cuenta atrás real de 5 s...");

const round = await roundStarted;
console.log("ronda 1:", round.type1, round.type2);
const valid = snapshot.pokemon.filter(
  (p) => p.types.length === 2 && p.types.includes(round.type1) && p.types.includes(round.type2),
);
console.log("Pokémon válidos para el par:", valid.map((p) => p.names.es).join(", "));
one.emit("submit-pokemon", { text: valid[0]!.names.es });
two.emit("submit-pokemon", { text: valid[1]!.names.en });

const result = await once<any>(one, "round-result");
console.log("resultado:", result.results[1].result, "|", result.results[2].result);
const ended = await gameEnded;
console.log("fin:", ended.reason, "— ganador: asiento", ended.winnerSeat, "— totales", ended.totals);
one.close();
two.close();

console.log(`\nPara limpiar la base de datos de desarrollo:`);
console.log(`DELETE FROM games WHERE room_code = '${code}'; DELETE FROM users WHERE email LIKE '%@smoke.test';`);
