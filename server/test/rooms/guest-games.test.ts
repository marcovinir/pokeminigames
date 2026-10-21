import type { GameEndedPayload, RoomStateView, RoundStartedPayload } from "@pokemon-minigames/shared";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type PokemonCatalog, loadCatalog } from "../../src/catalog/pokemon-catalog.js";
import { seedCatalog } from "../../src/catalog/seed.js";
import { prisma, resetCatalog, resetDatabase } from "../helpers/db.js";
import { fixtureSnapshot } from "../helpers/fixtures.js";
import { sequenceRng } from "../helpers/rng.js";
import { type TestUser, enterAsGuest, registerUser } from "../helpers/users.js";
import { type RunningServer, TestClient, startServer } from "../realtime/client.js";

const ONE_ROUND = { typeMode: "random", lengthMode: "custom", roundsLimit: 1 };

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
  server = await startServer({}, { rng: sequenceRng([0]), generateCode: () => "GUEST1", catalog });
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

/** El primero crea, el segundo se une, los dos se conectan y juegan una ronda entera hasta game-ended. */
async function playOneRound(first: TestUser, second: TestUser) {
  const created = await request(server.app).post("/rooms").set("Authorization", bearer(first)).send(ONE_ROUND);
  expect(created.status).toBe(201);
  const code = created.body.code as string;
  await request(server.app).post(`/rooms/${code}/join`).set("Authorization", bearer(second)).expect(200);
  const room = server.store.get(code)!;
  const one = await connect(first, code);
  const two = await connect(second, code);
  await one.next("game-starting");
  server.time.advance(5000);

  expect(await one.next<RoundStartedPayload>("round-started")).toMatchObject({ round: 1 });
  await two.next("round-started");
  one.emit("submit-pokemon", { text: "Alfa" });
  two.emit("submit-pokemon", { text: "Beto" });
  const ended = await one.next<GameEndedPayload>("game-ended");
  await two.next("game-ended");
  await room.idle();
  return { code, room, one, two, ended };
}

const rowCounts = async () => ({
  games: await prisma.game.count(),
  gamePlayers: await prisma.gamePlayer.count(),
  rounds: await prisma.round.count(),
  roundPicks: await prisma.roundPick.count(),
});

describe("partidas con un invitado: ni una fila en la base de datos", () => {
  it("el invitado crea, una cuenta se une y juegan una ronda: no queda ninguna fila y GET /stats de la cuenta sigue con played: 0", async () => {
    const guest = await enterAsGuest(server.app, "inv_1");
    const misty = await registerUser(server.app, "misty");

    const { ended } = await playOneRound(guest, misty);

    expect(ended).toMatchObject({ reason: "completed", totals: { 1: 500, 2: 400 } });
    expect(await rowCounts()).toEqual({ games: 0, gamePlayers: 0, rounds: 0, roundPicks: 0 });
    const stats = await request(server.app).get("/stats").set("Authorization", bearer(misty));
    expect(stats.status).toBe(200);
    expect(stats.body.stats).toMatchObject({ played: 0, wins: 0, losses: 0 });
  });

  it("la cuenta crea, se une un invitado y juegan: la fila `waiting` se descarta y la partida termina bien", async () => {
    const ash = await registerUser(server.app, "ash");
    const guest = await enterAsGuest(server.app, "inv_1");

    const created = await request(server.app).post("/rooms").set("Authorization", bearer(ash)).send(ONE_ROUND);
    expect(created.status).toBe(201);
    expect(await prisma.game.count()).toBe(1); // mientras espera, la cuenta sí tiene su fila
    await request(server.app).post(`/rooms/${created.body.code}/join`).set("Authorization", bearer(guest)).expect(200);
    const room = server.store.get(created.body.code)!;
    await room.idle();
    expect(await rowCounts()).toEqual({ games: 0, gamePlayers: 0, rounds: 0, roundPicks: 0 });

    const one = await connect(ash, created.body.code);
    const two = await connect(guest, created.body.code);
    await one.next("game-starting");
    server.time.advance(5000);
    await one.next("round-started");
    await two.next("round-started");
    one.emit("submit-pokemon", { text: "Alfa" });
    two.emit("submit-pokemon", { text: "Beto" });
    expect(await one.next<GameEndedPayload>("game-ended")).toMatchObject({ reason: "completed" });
    await room.idle();

    expect(await rowCounts()).toEqual({ games: 0, gamePlayers: 0, rounds: 0, roundPicks: 0 });
    const stats = await request(server.app).get("/stats").set("Authorization", bearer(ash));
    expect(stats.body.stats).toMatchObject({ played: 0 });
  });

  it("control: dos cuentas juegan y la partida sí se guarda", async () => {
    const ash = await registerUser(server.app, "ash");
    const misty = await registerUser(server.app, "misty");

    await playOneRound(ash, misty);

    expect(await rowCounts()).toEqual({ games: 1, gamePlayers: 2, rounds: 1, roundPicks: 2 });
    const stats = await request(server.app).get("/stats").set("Authorization", bearer(ash));
    expect(stats.body.stats).toMatchObject({ played: 1, wins: 1 });
  });

  it("GET /rooms/current del invitado devuelve su sala y reconectar por socket (join-room) lo devuelve a su asiento", async () => {
    const guest = await enterAsGuest(server.app, "inv_1");
    const created = await request(server.app).post("/rooms").set("Authorization", bearer(guest)).send(ONE_ROUND);
    expect(created.status).toBe(201);

    const current = await request(server.app).get("/rooms/current").set("Authorization", bearer(guest));
    expect(current.body.room).toEqual({ code: "GUEST1", phase: "waiting" });

    const first = new TestClient(server.url, guest.token);
    clients.push(first);
    await first.connected();
    first.emit("join-room", { code: "GUEST1" });
    expect(await first.next<RoomStateView>("room-state")).toMatchObject({
      mySeat: 1,
      players: [{ seat: 1, username: "inv_1", guest: true }],
    });
    first.close();

    const again = new TestClient(server.url, guest.token);
    clients.push(again);
    await again.connected();
    again.emit("join-room", { code: "GUEST1" });
    expect(await again.next<RoomStateView>("room-state")).toMatchObject({ mySeat: 1, code: "GUEST1" });
  });

  it("quien se une a una sala de un invitado ve al creador marcado como invitado, y el creador recibe player-joined con guest solo si quien llega lo es", async () => {
    const guest = await enterAsGuest(server.app, "inv_1");
    const misty = await registerUser(server.app, "misty");
    await request(server.app).post("/rooms").set("Authorization", bearer(guest)).send(ONE_ROUND).expect(201);
    const one = await connect(guest, "GUEST1");
    await request(server.app).post("/rooms/GUEST1/join").set("Authorization", bearer(misty)).expect(200);
    expect(await one.next("player-joined")).toEqual({ username: "misty" });

    const two = new TestClient(server.url, misty.token);
    clients.push(two);
    await two.connected();
    two.emit("join-room", { code: "GUEST1" });
    expect((await two.next<RoomStateView>("room-state")).players.map((p) => p.guest)).toEqual([true, undefined]);
  });

  it("si quien llega es el invitado, el creador con cuenta recibe player-joined con guest: true", async () => {
    const ash = await registerUser(server.app, "ash");
    const guest = await enterAsGuest(server.app, "inv_1");
    await request(server.app).post("/rooms").set("Authorization", bearer(ash)).send(ONE_ROUND).expect(201);
    const one = await connect(ash, "GUEST1");
    await request(server.app).post("/rooms/GUEST1/join").set("Authorization", bearer(guest)).expect(200);
    expect(await one.next("player-joined")).toEqual({ username: "inv_1", guest: true });
  });

  it("un invitado con el mismo nombre que el creador recibe NAME_IN_USE y la sala sigue libre", async () => {
    const ash = await registerUser(server.app, "ash");
    const same = await enterAsGuest(server.app, "ASH");
    await request(server.app).post("/rooms").set("Authorization", bearer(ash)).send(ONE_ROUND).expect(201);

    const joined = await request(server.app).post("/rooms/GUEST1/join").set("Authorization", bearer(same));
    expect(joined.status).toBe(409);
    expect(joined.body.error.code).toBe("NAME_IN_USE");
    expect(server.store.get("GUEST1")!.hasSeat(2)).toBe(false);
    expect(await prisma.game.count()).toBe(1); // el intento rechazado no descartó la partida de la cuenta
  });
});
