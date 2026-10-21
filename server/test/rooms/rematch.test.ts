import type { GameEndedPayload, RematchState, RoomStateView, RoundStartedPayload } from "@pokemon-minigames/shared";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type PokemonCatalog, loadCatalog } from "../../src/catalog/pokemon-catalog.js";
import { seedCatalog } from "../../src/catalog/seed.js";
import { prisma, resetCatalog, resetDatabase } from "../helpers/db.js";
import { fixtureSnapshot } from "../helpers/fixtures.js";
import { sequenceRng } from "../helpers/rng.js";
import { type TestUser, enterAsGuest, registerUser } from "../helpers/users.js";
import { type RunningServer, TestClient, startServer } from "../realtime/client.js";

const ONE_ROUND = { typeMode: "random", lengthMode: "custom", roundsLimit: 1, typeHints: true };
const FIVE_MINUTES = 5 * 60 * 1000;

let catalog: PokemonCatalog;
let server: RunningServer;
let clients: TestClient[] = [];

beforeAll(async () => {
  await resetCatalog();
  await seedCatalog(prisma, fixtureSnapshot());
  catalog = await loadCatalog(prisma);
});
beforeEach(async () => {
  await resetDatabase();
  const codes = ["GAME01", "GAME02", "GAME03", "GAME04"];
  server = await startServer({}, { rng: sequenceRng([0, 0, 0, 0]), generateCode: () => codes.shift()!, catalog });
});
afterEach(async () => {
  for (const client of clients) client.close();
  clients = [];
  await server.close();
});
afterAll(async () => {
  await resetCatalog();
  await prisma.$disconnect();
});

const bearer = (user: TestUser) => `Bearer ${user.token}`;

async function connect(user: TestUser, code: string): Promise<TestClient> {
  const client = new TestClient(server.url, user.token);
  clients.push(client);
  await client.connected();
  client.emit("join-room", { code });
  await client.next("room-state");
  return client;
}

/** El primero crea, el segundo se une, juegan una ronda (gana el primero con «Alfa» contra «Beto») y termina la partida. */
async function playFirstGame(first: TestUser, second: TestUser) {
  const created = await request(server.app).post("/rooms").set("Authorization", bearer(first)).send(ONE_ROUND);
  expect(created.status).toBe(201);
  const code = created.body.code as string;
  await request(server.app).post(`/rooms/${code}/join`).set("Authorization", bearer(second)).expect(200);
  const room = server.store.get(code)!;
  const one = await connect(first, code);
  const two = await connect(second, code);
  await one.next("game-starting");
  server.time.advance(5000);
  await one.next<RoundStartedPayload>("round-started");
  await two.next("round-started");
  one.emit("submit-pokemon", { text: "Alfa" });
  two.emit("submit-pokemon", { text: "Beto" });
  await one.next<GameEndedPayload>("game-ended");
  await two.next("game-ended");
  await room.idle();
  return { code, room, one, two };
}

/** Espera el primer rematch-state con ese estado (consume los anteriores). */
async function untilState(client: TestClient, status: RematchState["status"]): Promise<RematchState> {
  for (let i = 0; i < 8; i++) {
    const state = await client.next<RematchState>("rematch-state");
    if (state.status === status) return state;
  }
  throw new Error(`No llegó rematch-state con status ${status}`);
}

/** El primer room-state de esa sala (consume los anteriores: de la sala vieja pueden quedar sin leer). */
async function untilRoom(client: TestClient, code: string): Promise<RoomStateView> {
  for (let i = 0; i < 8; i++) {
    const state = await client.next<RoomStateView>("room-state");
    if (state.code === code) return state;
  }
  throw new Error(`No llegó room-state de la sala ${code}`);
}

const rowCounts = async () => ({
  games: await prisma.game.count(),
  gamePlayers: await prisma.gamePlayer.count(),
  rounds: await prisma.round.count(),
  roundPicks: await prisma.roundPick.count(),
});

describe("revancha de punta a punta", () => {
  it("aceptan los dos: reciben rematch-room, entran, juegan otra ronda y quedan dos partidas guardadas para las dos cuentas", async () => {
    const ash = await registerUser(server.app, "ash");
    const misty = await registerUser(server.app, "misty");
    const { code, one, two } = await playFirstGame(ash, misty);

    await untilState(one, "open");
    await untilState(two, "open");
    one.emit("rematch-request");
    expect((await untilState(two, "theirs")).deadline).not.toBeNull();
    two.emit("rematch-request");
    const [roomOne, roomTwo] = await Promise.all([one.next<{ code: string }>("rematch-room"), two.next<{ code: string }>("rematch-room")]);
    expect(roomOne.code).toBe("GAME02");
    expect(roomTwo.code).toBe("GAME02");
    // La sala vieja ya no está en el almacén y la nueva sí, con los dos asientos ocupados desde el principio.
    expect(server.store.get(code)).toBeUndefined();
    expect(server.store.get("GAME02")?.seatOf(ash.userId)).toBe(1);
    expect(server.store.get("GAME02")?.seatOf(misty.userId)).toBe(2);

    one.emit("join-room", { code: "GAME02" });
    const stateOne = await untilRoom(one, "GAME02");
    expect(stateOne).toMatchObject({ code: "GAME02", rematch: true, mySeat: 1 });
    expect(stateOne.config).toMatchObject({ typeHints: true, roundsLimit: 1 });
    two.emit("join-room", { code: "GAME02" });
    await untilRoom(two, "GAME02");
    await one.next("game-starting");
    server.time.advance(5000);
    await one.next("round-started");
    await two.next("round-started");
    one.emit("submit-pokemon", { text: "Alfa" });
    two.emit("submit-pokemon", { text: "Beto" });
    expect(await one.next<GameEndedPayload>("game-ended")).toMatchObject({ reason: "completed", winnerSeat: 1 });
    await server.store.get("GAME02")?.idle();

    expect(await prisma.game.count()).toBe(2);
    expect(await prisma.gamePlayer.count()).toBe(4);
    for (const user of [ash, misty]) {
      const stats = await request(server.app).get("/stats").set("Authorization", bearer(user));
      expect(stats.body.stats.played).toBe(2);
    }
  });

  it("el récord llega en el rematch-state e incluye la partida recién terminada", async () => {
    const ash = await registerUser(server.app, "ash");
    const misty = await registerUser(server.app, "misty");
    const { one, two } = await playFirstGame(ash, misty);

    await expect.poll(() => one.all<RematchState>("rematch-state").at(-1)?.record).toMatchObject({ mine: 1, theirs: 0, draws: 0, played: 1, recent: ["won"] });
    await expect.poll(() => two.all<RematchState>("rematch-state").at(-1)?.record).toMatchObject({ mine: 0, theirs: 1, played: 1, recent: ["lost"] });
  });

  it("uno rechaza: el otro recibe closed/declined, quien rechazó closed/self, no hay sala nueva y la vieja sale del almacén", async () => {
    const ash = await registerUser(server.app, "ash");
    const misty = await registerUser(server.app, "misty");
    const { code, one, two } = await playFirstGame(ash, misty);
    await untilState(one, "open");
    await untilState(two, "open");

    one.emit("rematch-request");
    await untilState(two, "theirs");
    two.emit("rematch-cancel");
    expect(await untilState(one, "closed")).toMatchObject({ closedReason: "declined" });
    expect(await untilState(two, "closed")).toMatchObject({ closedReason: "self" });
    expect(server.store.get(code)).toBeUndefined();
    expect(server.store.get("GAME02")).toBeUndefined();
    await one.expectNone("rematch-room");
  });

  it("recargar durante la oferta (otro socket del mismo usuario) recupera room-state, game-ended y el estado de la revancha", async () => {
    const ash = await registerUser(server.app, "ash");
    const misty = await registerUser(server.app, "misty");
    const { code, one } = await playFirstGame(ash, misty);
    await untilState(one, "open");
    one.emit("rematch-request");
    await untilState(one, "mine");

    const reloaded = new TestClient(server.url, ash.token);
    clients.push(reloaded);
    await reloaded.connected();
    reloaded.emit("join-room", { code });
    expect(await reloaded.next<RoomStateView>("room-state")).toMatchObject({ phase: "finished", code, mySeat: 1 });
    expect(await reloaded.next<GameEndedPayload>("game-ended")).toMatchObject({ reason: "completed", totals: { 1: 500, 2: 400 } });
    expect(await reloaded.next<RematchState>("rematch-state")).toMatchObject({ status: "mine" });
    // La recarga no cuenta como «se fue»: pasan más de 10 s y la oferta sigue.
    server.time.advance(15_000);
    expect(server.roomManager.rematch.has(code)).toBe(true);
  });

  it("leave-room durante la oferta: el otro ve closed/left", async () => {
    const ash = await registerUser(server.app, "ash");
    const misty = await registerUser(server.app, "misty");
    const { one, two } = await playFirstGame(ash, misty);
    await untilState(one, "open");
    two.emit("leave-room");
    expect(await untilState(one, "closed")).toMatchObject({ closedReason: "left" });
  });

  it("si alguien se desconecta sin volver, a los 10 s el otro ve closed/left", async () => {
    const ash = await registerUser(server.app, "ash");
    const misty = await registerUser(server.app, "misty");
    const { one, two } = await playFirstGame(ash, misty);
    await untilState(one, "open");
    two.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    server.time.advance(10_000);
    expect(await untilState(one, "closed")).toMatchObject({ closedReason: "left" });
  });

  it("a los 5 min sin pedir nada la oferta se cierra con unavailable y el almacén queda vacío", async () => {
    const ash = await registerUser(server.app, "ash");
    const misty = await registerUser(server.app, "misty");
    const { code, one, two } = await playFirstGame(ash, misty);
    await untilState(one, "open");
    server.time.advance(FIVE_MINUTES);
    expect(await untilState(one, "closed")).toMatchObject({ closedReason: "unavailable" });
    expect(await untilState(two, "closed")).toMatchObject({ closedReason: "unavailable" });
    expect(server.store.get(code)).toBeUndefined();
  });

  it("pedir y cancelar sin parar no crea más de una oferta ni ninguna sala (el límite por socket responde RATE_LIMITED)", async () => {
    const ash = await registerUser(server.app, "ash");
    const misty = await registerUser(server.app, "misty");
    const { one } = await playFirstGame(ash, misty);
    await untilState(one, "open");
    for (let i = 0; i < 20; i++) one.emit(i % 2 === 0 ? "rematch-request" : "rematch-cancel");
    await expect.poll(() => one.all<{ code: string }>("error").some((e) => e.code === "RATE_LIMITED")).toBe(true);
    await one.expectNone("rematch-room");
    expect(server.store.get("GAME02")).toBeUndefined();
  });
});

describe("revancha con un invitado: ninguna fila", () => {
  it("el invitado es el creador: sin récord, sin filas en la base de datos y la sala nueva trae guest", async () => {
    const guest = await enterAsGuest(server.app, "inv_1");
    const misty = await registerUser(server.app, "misty");
    const { one, two } = await playFirstGame(guest, misty);
    expect(await rowCounts()).toEqual({ games: 0, gamePlayers: 0, rounds: 0, roundPicks: 0 });

    const open = await untilState(one, "open");
    expect("record" in open).toBe(false);
    await untilState(two, "open");
    one.emit("rematch-request");
    await untilState(two, "theirs");
    two.emit("rematch-request");
    expect((await one.next<{ code: string }>("rematch-room")).code).toBe("GAME02");
    await two.next("rematch-room");

    two.emit("join-room", { code: "GAME02" });
    const state = await untilRoom(two, "GAME02");
    expect(state).toMatchObject({ rematch: true, players: [{ seat: 1, username: "inv_1", guest: true }, { seat: 2, username: "misty" }] });
    expect(await rowCounts()).toEqual({ games: 0, gamePlayers: 0, rounds: 0, roundPicks: 0 });
    expect(one.all<RematchState>("rematch-state").every((s) => s.record === undefined)).toBe(true);
  });

  it("el invitado es quien se une a la sala de una cuenta: tampoco hay récord ni filas", async () => {
    const ash = await registerUser(server.app, "ash");
    const guest = await enterAsGuest(server.app, "inv_1");
    const { one, two } = await playFirstGame(ash, guest);
    expect(await rowCounts()).toEqual({ games: 0, gamePlayers: 0, rounds: 0, roundPicks: 0 });
    one.emit("rematch-request");
    two.emit("rematch-request");
    expect((await one.next<{ code: string }>("rematch-room")).code).toBe("GAME02");
    expect(await rowCounts()).toEqual({ games: 0, gamePlayers: 0, rounds: 0, roundPicks: 0 });
    expect(one.all<RematchState>("rematch-state").every((s) => s.record === undefined)).toBe(true);
  });
});
