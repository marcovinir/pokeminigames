import type { RoomStateView } from "@pokemon-minigames/shared";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDatabase } from "../helpers/db.js";
import { type TestUser, registerUser } from "../helpers/users.js";
import { type RunningServer, TestClient, startServer } from "../realtime/client.js";

let server: RunningServer;
let clients: TestClient[] = [];

beforeEach(async () => {
  await resetDatabase();
  server = await startServer({}, { generateCode: () => "SUBAS2" });
});
afterEach(async () => {
  for (const client of clients) client.close();
  clients = [];
  await server.close();
});
afterAll(() => prisma.$disconnect());

const bearer = (user: TestUser) => `Bearer ${user.token}`;

async function connect(user: TestUser, code: string): Promise<TestClient> {
  const client = new TestClient(server.url, user.token);
  clients.push(client);
  await client.connected();
  client.emit("join-room", { code });
  return client;
}

/** El siguiente `room-state` que cumpla la condición: los anteriores se descartan. */
async function stateWhere(client: TestClient, ok: (state: RoomStateView) => boolean): Promise<RoomStateView> {
  for (;;) {
    const state = await client.next<RoomStateView>("room-state");
    if (ok(state)) return state;
  }
}

/** Dos cuentas en una subasta recién empezada, con quién tiene el turno y quién no. */
async function startAuction() {
  const ash = await registerUser(server.app, "ash");
  const misty = await registerUser(server.app, "misty");
  const created = await request(server.app).post("/rooms").set("Authorization", bearer(ash)).send({ game: "subasta", traps: false });
  expect(created.status).toBe(201);
  const code = created.body.code as string;
  await request(server.app).post(`/rooms/${code}/join`).set("Authorization", bearer(misty)).expect(200);
  const one = await connect(ash, code);
  const two = await connect(misty, code);
  await one.next("game-starting");
  server.time.advance(5000);
  const state = await stateWhere(one, (s) => s.phase === "auction");
  await stateWhere(two, (s) => s.phase === "auction");
  const lot = state.auction!.lot!;
  return { current: lot.turn === 1 ? one : two, other: lot.turn === 1 ? two : one, lot };
}

describe("subasta por sockets (base real)", () => {
  it("una puja de quien tiene el turno llega a los dos", async () => {
    const { current, other, lot } = await startAuction();
    current.emit("auction-bid", { step: null, turnId: lot.turnId });
    for (const client of [current, other]) {
      const state = await stateWhere(client, (s) => s.auction?.lot?.currentBid !== null);
      expect(state.auction!.lot!.currentBid).toBe(lot.price);
    }
  });

  it("pasar los dos cierra el lote y avisa de la venta", async () => {
    const { current, other, lot } = await startAuction();
    current.emit("auction-pass", { turnId: lot.turnId });
    const state = await other.next<RoomStateView>("room-state");
    other.emit("auction-pass", { turnId: state.auction!.lot!.turnId });
    expect(await current.next("auction-sale")).toMatchObject({ lot: 1, kind: "pokemon" });
  });

  it("rechaza pujas mal formadas sin cambiar nada", async () => {
    const { current, lot } = await startAuction();
    for (const bad of [{ step: 7, turnId: lot.turnId }, { step: null }]) {
      current.emit("auction-bid", bad);
      await current.next("error");
    }
    current.emit("auction-bid", { step: 10_000, turnId: lot.turnId });
    expect(await current.next("error")).toMatchObject({ code: "INVALID_BID" });
  });

  it("listo fuera de la revelación se rechaza por fase", async () => {
    const { current } = await startAuction();
    current.emit("auction-ready");
    expect(await current.next("error")).toMatchObject({ code: "WRONG_PHASE" });
  });

  it("nada delata a los Pokémon durante la puja", async () => {
    const { other } = await startAuction();
    const text = JSON.stringify(other.received);
    expect(text).toMatch(/silhouettes/);
    for (const leak of ["sprites", "official-artwork", "names", "realId", "shownId"]) expect(text, leak).not.toContain(leak);
  });
});
