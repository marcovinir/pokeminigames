import type { GameEndedPayload, RoomStateView, RoundResultPayload, RoundStartedPayload } from "@pokemon-minigames/shared";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDatabase } from "../helpers/db.js";
import { sequenceRng } from "../helpers/rng.js";
import { registerUser, type TestUser } from "../helpers/users.js";
import { type RunningServer, TestClient, startServer } from "./client.js";

let server: RunningServer;
let clients: TestClient[] = [];
let ash: TestUser;
let misty: TestUser;
let brock: TestUser;

const ONE_ROUND = { typeMode: "random", lengthMode: "custom", roundsLimit: 1 };

async function boot(options: Parameters<typeof startServer>[1] = {}) {
  server = await startServer({}, { rng: sequenceRng([0, 0, 0]), generateCode: () => "ABC234", ...options });
  ash = await registerUser(server.app, "ash");
  misty = await registerUser(server.app, "misty");
  brock = await registerUser(server.app, "brock");
}

async function connect(user: TestUser | null): Promise<TestClient> {
  const client = new TestClient(server.url, user?.token ?? null);
  clients.push(client);
  await client.connected();
  return client;
}

async function createRoom(body: object = ONE_ROUND): Promise<string> {
  const response = await request(server.app).post("/rooms").set("Authorization", `Bearer ${ash.token}`).send(body);
  await request(server.app).post(`/rooms/${response.body.code}/join`).set("Authorization", `Bearer ${misty.token}`);
  return response.body.code as string;
}

/** Los dos jugadores entran a la sala por socket y empieza la cuenta atrás. */
async function joinBoth(code: string) {
  const one = await connect(ash);
  const two = await connect(misty);
  one.emit("join-room", { code });
  await one.next("room-state");
  two.emit("join-room", { code });
  await two.next("room-state");
  await one.next("game-starting");
  await two.next("game-starting");
  return { one, two };
}

beforeEach(async () => {
  await resetDatabase();
  await boot();
});
afterEach(async () => {
  for (const client of clients) client.close();
  clients = [];
  await server.close();
});
afterAll(() => prisma.$disconnect());

describe("autenticación del handshake", () => {
  it("rechaza la conexión sin token", async () => {
    await expect(connect(null)).rejects.toThrow("UNAUTHORIZED");
  });

  it("rechaza un token inválido o de otro secreto", async () => {
    const client = new TestClient(server.url, "no-es-un-jwt");
    clients.push(client);
    await expect(client.connected()).rejects.toThrow("UNAUTHORIZED");
  });
});

describe("entrar a una sala", () => {
  it("ROOM_NOT_FOUND si el código no existe", async () => {
    const client = await connect(ash);
    client.emit("join-room", { code: "ZZZZZZ" });
    expect(await client.next("error")).toMatchObject({ code: "ROOM_NOT_FOUND" });
  });

  it("NOT_IN_ROOM si el usuario no participa en esa sala", async () => {
    const code = await createRoom();
    const client = await connect(brock);
    client.emit("join-room", { code });
    expect(await client.next("error")).toMatchObject({ code: "NOT_IN_ROOM" });
  });

  it("VALIDATION_ERROR con una carga mal formada", async () => {
    const client = await connect(ash);
    client.emit("join-room", { code: 123 });
    client.emit("join-room");
    expect(await client.next("error")).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await client.next("error")).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("NOT_IN_ROOM si se elige un tipo o se responde sin haber entrado", async () => {
    const client = await connect(ash);
    client.emit("choose-type", { type: "fire" });
    client.emit("submit-pokemon", { text: "Alfa" });
    client.emit("leave-room");
    for (let i = 0; i < 3; i++) expect(await client.next("error")).toMatchObject({ code: "NOT_IN_ROOM" });
  });

  it("al entrar cada jugador recibe su estado; al estar ambos empieza la cuenta atrás", async () => {
    const code = await createRoom();
    const one = await connect(ash);
    one.emit("join-room", { code: code.toLowerCase() });
    const state = await one.next<RoomStateView>("room-state");
    expect(state).toMatchObject({ code: "ABC234", phase: "waiting", mySeat: 1 });
    expect(state.players.map((p) => p.username)).toEqual(["ash", "misty"]);

    const two = await connect(misty);
    two.emit("join-room", { code });
    expect(await two.next<RoomStateView>("room-state")).toMatchObject({ mySeat: 2 });
    expect(await one.next("game-starting")).toMatchObject({ startsAt: expect.any(Number) });
    expect(await two.next("game-starting")).toMatchObject({ startsAt: expect.any(Number) });
  });
});

describe("una ronda por sockets", () => {
  it("cuenta atrás, ronda, respuestas y resultado", async () => {
    const code = await createRoom();
    const { one, two } = await joinBoth(code);
    server.time.advance(5000);

    const started = await one.next<RoundStartedPayload>("round-started");
    expect(started).toMatchObject({ round: 1, type1: "flying", type2: "fire", serverNow: expect.any(Number) });
    await two.next("round-started");

    one.emit("submit-pokemon", { text: "Alfa" });
    expect(await one.next("answer-received")).toEqual({ round: 1 });
    await two.expectNone("answer-received");
    two.emit("submit-pokemon", { text: "Beta" });
    await two.next("answer-received");

    const result = await one.next<RoundResultPayload>("round-result");
    expect(result.results[1]).toMatchObject({ result: "VALID", totalStats: 500 });
    expect(result.results[2]).toMatchObject({ result: "VALID", totalStats: 400 });
    expect(await two.next("round-result")).toEqual(result);

    // La partida era de una sola ronda: termina.
    const ended = await one.next<GameEndedPayload>("game-ended");
    expect(ended).toMatchObject({ winnerSeat: 1, reason: "completed", totals: { 1: 500, 2: 400 } });
    await two.next("game-ended");
  });

  it("responder dos veces da ALREADY_ANSWERED", async () => {
    const code = await createRoom({ typeMode: "random", lengthMode: "custom", roundsLimit: 3 });
    const { one } = await joinBoth(code);
    server.time.advance(5000);
    await one.next("round-started");
    one.emit("submit-pokemon", { text: "Alfa" });
    one.emit("submit-pokemon", { text: "Beto" });
    expect(await one.next("error")).toMatchObject({ code: "ALREADY_ANSWERED" });
  });

  it("rechaza textos de más de 100 caracteres con VALIDATION_ERROR", async () => {
    const code = await createRoom();
    const { one } = await joinBoth(code);
    server.time.advance(5000);
    await one.next("round-started");
    one.emit("submit-pokemon", { text: "x".repeat(101) });
    expect(await one.next("error")).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("límite de frecuencia", () => {
  it("más de 5 eventos por segundo reciben RATE_LIMITED", async () => {
    const client = await connect(ash);
    for (let i = 0; i < 8; i++) client.emit("submit-pokemon", { text: "x" });
    await client.next("error");
    await new Promise((resolve) => setTimeout(resolve, 150));
    const codes = client.all<{ code: string }>("error").map((e) => e.code);
    expect(codes.filter((c) => c === "NOT_IN_ROOM")).toHaveLength(5);
    expect(codes.filter((c) => c === "RATE_LIMITED")).toHaveLength(3);
  });
});

describe("desconexión y reconexión", () => {
  it("si un jugador se cae el rival recibe el aviso; al volver recibe su estado y el rival un aviso", async () => {
    const code = await createRoom({ typeMode: "random", lengthMode: "custom", roundsLimit: 3 });
    const { one, two } = await joinBoth(code);
    server.time.advance(5000);
    await one.next("round-started");
    await two.next("round-started");

    two.close();
    const away = await one.next<{ graceEndsAt: number }>("opponent-disconnected");
    expect(away.graceEndsAt).toBe(server.time.now() + 30_000);

    const back = await connect(misty);
    back.emit("join-room", { code });
    const state = await back.next<RoomStateView>("room-state");
    expect(state).toMatchObject({ mySeat: 2, phase: "round_active", round: { number: 1, answered: false } });
    await one.next("opponent-reconnected");

    // Sigue jugando con normalidad con el socket nuevo.
    back.emit("submit-pokemon", { text: "Beto" });
    expect(await back.next("answer-received")).toEqual({ round: 1 });
  });

  it("si no vuelve en 30 s pierde por desconexión", async () => {
    const code = await createRoom({ typeMode: "random", lengthMode: "custom", roundsLimit: 3 });
    const { one, two } = await joinBoth(code);
    server.time.advance(5000);
    await one.next("round-started");

    two.close();
    await one.next("opponent-disconnected");
    server.time.advance(30_000);
    expect(await one.next<GameEndedPayload>("game-ended")).toMatchObject({ winnerSeat: 1, reason: "disconnect" });
  });

  it("una segunda pestaña reemplaza a la primera sin que el rival vea una caída", async () => {
    const code = await createRoom({ typeMode: "random", lengthMode: "custom", roundsLimit: 3 });
    const { one, two } = await joinBoth(code);
    server.time.advance(5000);
    await one.next("round-started");

    const secondTab = await connect(misty);
    secondTab.emit("join-room", { code });
    await secondTab.next("room-state");
    await two.wasDisconnected(); // la pestaña anterior se cierra
    await one.expectNone("opponent-disconnected");

    secondTab.emit("submit-pokemon", { text: "Beto" });
    expect(await secondTab.next("answer-received")).toEqual({ round: 1 });
  });
});

describe("salir de la sala", () => {
  it("leave-room en plena partida da la victoria al rival y ambos reciben el resumen", async () => {
    const code = await createRoom({ typeMode: "random", lengthMode: "custom", roundsLimit: 3 });
    const { one, two } = await joinBoth(code);
    server.time.advance(5000);
    await one.next("round-started");

    two.emit("leave-room");
    expect(await two.next<GameEndedPayload>("game-ended")).toMatchObject({ winnerSeat: 1, reason: "forfeit" });
    expect(await one.next<GameEndedPayload>("game-ended")).toMatchObject({ winnerSeat: 1, reason: "forfeit" });
  });

  it("una sala terminada ya no admite conexiones: ROOM_NOT_FOUND", async () => {
    const code = await createRoom({ typeMode: "random", lengthMode: "custom", roundsLimit: 3 });
    const { one, two } = await joinBoth(code);
    server.time.advance(5000);
    await one.next("round-started");
    two.emit("leave-room");
    await two.next("game-ended");

    const late = await connect(ash);
    late.emit("join-room", { code });
    expect(await late.next("error")).toMatchObject({ code: "ROOM_NOT_FOUND" });
  });
});
