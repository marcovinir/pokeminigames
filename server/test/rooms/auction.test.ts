import type { RoomStateView } from "@pokemon-minigames/shared";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { STARTING_MONEY } from "../../src/game/auction/rules.js";
import { prisma, resetDatabase } from "../helpers/db.js";
import { type TestUser, registerUser } from "../helpers/users.js";
import { type RunningServer, TestClient, startServer } from "../realtime/client.js";

let server: RunningServer;
let clients: TestClient[] = [];

beforeEach(async () => {
  await resetDatabase();
  let codes = 0;
  server = await startServer({}, { generateCode: () => (codes++ === 0 ? "SUBAS2" : "SUBAS3") });
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
  return { current: lot.turn === 1 ? one : two, other: lot.turn === 1 ? two : one, lot, code, turnUser: lot.turn === 1 ? ash : misty };
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
    expect(await current.next("auction-sale")).toMatchObject({ lot: 1 });
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

describe("el aviso de inactividad por sockets", () => {
  it("recargar con el aviso abierto lo devuelve, y responder lo cierra", async () => {
    const { current, other, lot, code, turnUser } = await startAuction();
    server.time.advance(60_000);
    const warned = await stateWhere(current, (s) => s.auction?.lot?.warningUntil !== null);
    const until = warned.auction!.lot!.warningUntil;
    await stateWhere(other, (s) => s.auction?.lot?.rivalIdle === true);
    current.close();
    const back = await connect(turnUser, code);
    const again = await stateWhere(back, (s) => s.auction?.lot?.warningUntil !== null);
    expect(again.auction!.lot!.warningUntil).toBe(until);
    back.emit("auction-still-here", { turnId: lot.turnId });
    const calm = await stateWhere(back, (s) => s.auction?.lot?.warningUntil === null);
    expect(calm.auction!.lot!.turnId).toBe(lot.turnId);
  });

  it("rechaza una respuesta mal formada", async () => {
    const { current } = await startAuction();
    current.emit("auction-still-here", { turnId: "x" });
    expect(await current.next("error")).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("el combate por sockets", () => {
  /** Avanza el reloj hasta que la sala llegue a esa fase. */
  function advanceUntil(phase: string): void {
    const room = server.store.get("SUBAS2")!;
    for (let tick = 0; tick < 30_000 && room.phase !== phase; tick++) server.time.advance(1000);
    expect(room.phase).toBe(phase);
  }

  it("alineación y turnos llegan a los dos", async () => {
    const { current, other } = await startAuction();
    advanceUntil("lineup");
    const state = await stateWhere(current, (s) => s.phase === "lineup");
    current.emit("auction-lineup", { order: state.auction!.battle!.myTeam.map((one) => one.pokemon.id).reverse() });
    const rivalState = await stateWhere(other, (s) => s.phase === "lineup");
    other.emit("auction-lineup", { order: rivalState.auction!.battle!.myTeam.map((one) => one.pokemon.id) });
    const mine = await stateWhere(current, (s) => s.phase === "battle");
    const theirs = await stateWhere(other, (s) => s.phase === "battle");
    current.emit("auction-move", { move: mine.auction!.battle!.moves[0]!.move });
    other.emit("auction-move", { move: theirs.auction!.battle!.moves[0]!.move });
    for (const client of [current, other]) expect(await client.next("battle-turn")).toMatchObject({ round: 1, turn: 1 });
  });

  it("rechaza mensajes mal formados", async () => {
    const { current } = await startAuction();
    const bad: [string, unknown][] = [
      ["auction-move", { move: 7 }],
      ["auction-pause", { choice: { titular: "x" } }],
      ["auction-pause", { choice: { titular: 1, extra: true } }],
      ["auction-lineup", { order: "x" }],
    ];
    for (const [name, payload] of bad) {
      current.emit(name as never, payload as never);
      expect(await current.next("error")).toMatchObject({ code: "VALIDATION_ERROR" });
    }
  });

  it("rechaza un cambio mal formado", async () => {
    const { current } = await startAuction();
    current.emit("auction-switch" as never, { pokemonId: "x" } as never);
    expect(await current.next("error")).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("la revancha empieza de cero y conserva las siluetas trampa", async () => {
    const { current, other } = await startAuction();
    advanceUntil("finished");
    for (const client of [current, other]) {
      for (;;) {
        const offer = await client.next<{ status: string }>("rematch-state");
        if (offer.status === "open") break;
      }
    }
    current.emit("rematch-request");
    await other.next("rematch-state");
    other.emit("rematch-request");
    const { code } = await current.next<{ code: string }>("rematch-room");
    current.emit("join-room", { code });
    const state = await stateWhere(current, (s) => s.code === code);
    expect(state.config).toEqual({ game: "subasta", traps: false });
    expect(state.auction!.money).toEqual({ 1: STARTING_MONEY, 2: STARTING_MONEY });
    expect(state.auction!.teamSizes).toEqual({ 1: 0, 2: 0 });
  });
});
