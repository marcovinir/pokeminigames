import type { GameEndedPayload, RoundResultPayload, RoundStartedPayload } from "@pokemon-minigames/shared";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type PokemonCatalog, loadCatalog } from "../../src/catalog/pokemon-catalog.js";
import { seedCatalog } from "../../src/catalog/seed.js";
import { prisma, resetCatalog, resetDatabase } from "../helpers/db.js";
import { fixtureSnapshot } from "../helpers/fixtures.js";
import { sequenceRng } from "../helpers/rng.js";
import { registerUser, type TestUser } from "../helpers/users.js";
import { type RunningServer, TestClient, startServer } from "../realtime/client.js";

let catalog: PokemonCatalog;
let server: RunningServer;
let clients: TestClient[] = [];
let ash: TestUser;
let misty: TestUser;

beforeAll(async () => {
  // El catálogo de pruebas también en la base de datos: las respuestas guardadas lo referencian.
  await resetCatalog();
  await seedCatalog(prisma, fixtureSnapshot());
  catalog = await loadCatalog(prisma);
});
beforeEach(async () => {
  await resetDatabase();
});
afterEach(async () => {
  for (const client of clients) client.close();
  clients = [];
  await server?.close();
});
afterAll(async () => {
  await resetCatalog();
  await prisma.$disconnect();
});

async function play(config: object, rngValues: number[]) {
  server = await startServer({}, { rng: sequenceRng(rngValues), generateCode: () => "GAME01", catalog });
  ash = await registerUser(server.app, "ash");
  misty = await registerUser(server.app, "misty");

  const created = await request(server.app).post("/rooms").set("Authorization", `Bearer ${ash.token}`).send(config);
  expect(created.status).toBe(201);
  const code = created.body.code as string;
  const room = server.store.get(code)!;
  await request(server.app).post(`/rooms/${code}/join`).set("Authorization", `Bearer ${misty.token}`).expect(200);

  const connect = async (user: TestUser) => {
    const client = new TestClient(server.url, user.token);
    clients.push(client);
    await client.connected();
    client.emit("join-room", { code });
    await client.next("room-state");
    return client;
  };
  const one = await connect(ash);
  const two = await connect(misty);
  await one.next("game-starting");
  server.time.advance(5000);
  return { code, room, one, two };
}

describe("partida completa de punta a punta", () => {
  it("modo aleatorio, 3 rondas fijas: gana misty y todo queda guardado en la base de datos", async () => {
    const { code, room, one, two } = await play({ typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3 }, [0, 1, 0]);

    // Ronda 1: volador/fuego. Ronda 2: tierra/agua. Ronda 3: veneno/planta.
    const plan: [string, string, string, string][] = [
      ["flying", "fire", "Alfa", "Beto"], // 500 - 400
      ["ground", "water", "Delta", "Épsilon"], // 450 - 350
      ["poison", "grass", "Eta", "Zeta"], // 200 - 600
    ];
    for (const [i, [type1, type2, a, b]] of plan.entries()) {
      expect(await one.next<RoundStartedPayload>("round-started")).toMatchObject({ round: i + 1, type1, type2 });
      await two.next("round-started");
      one.emit("submit-pokemon", { text: a });
      two.emit("submit-pokemon", { text: b });
      await one.next("round-result");
      await two.next("round-result");
      if (i < 2) server.time.advance(6000);
    }

    const ended = await one.next<GameEndedPayload>("game-ended");
    expect(ended).toMatchObject({ winnerSeat: 2, reason: "completed", totals: { 1: 1150, 2: 1350 } });
    await two.next("game-ended");
    await room.idle();

    const game = await prisma.game.findUniqueOrThrow({
      where: { roomCode: code },
      include: {
        players: { orderBy: { seat: "asc" } },
        rounds: { orderBy: { number: "asc" }, include: { picks: true, type1: true, type2: true } },
      },
    });
    expect(game).toMatchObject({ status: "completed", endReason: "completed", winnerId: misty.userId });
    expect(game.endedAt).toBeInstanceOf(Date);
    expect(game.players.map((p) => [p.userId, p.seat, p.finalStats])).toEqual([
      [ash.userId, 1, 1150],
      [misty.userId, 2, 1350],
    ]);
    expect(game.rounds.map((r) => [r.number, r.type1.name, r.type2.name])).toEqual([
      [1, "flying", "fire"],
      [2, "ground", "water"],
      [3, "poison", "grass"],
    ]);
    expect(game.rounds.flatMap((r) => r.picks).filter((p) => p.result === "VALID")).toHaveLength(6);
    const firstRound = game.rounds[0]!;
    const ashPick = firstRound.picks.find((p) => p.userId === ash.userId)!;
    expect(ashPick).toMatchObject({ submittedText: "Alfa", pokemonId: 1, result: "VALID" });
    expect(ashPick.submittedAt).toBeInstanceOf(Date);
  });

  it("modo elegido, personalizada de 2 rondas: empate, sin ganador, y se guarda así", async () => {
    const { code, room, one, two } = await play({ typeMode: "chosen", lengthMode: "custom", roundsLimit: 2 }, [0]);

    // Ronda 1: eligen fuego y volador. Ronda 2: agua y tierra.
    expect(await one.next("choose-types")).toMatchObject({ round: 1 });
    await two.next("choose-types");
    one.emit("choose-type", { type: "fire" });
    expect(await one.next("type-received")).toEqual({ round: 1 });
    two.emit("choose-type", { type: "flying" });
    expect(await one.next<RoundStartedPayload>("round-started")).toMatchObject({ round: 1, type1: "flying", type2: "fire" });
    await two.next("round-started");
    one.emit("submit-pokemon", { text: "Alfa" });
    two.emit("submit-pokemon", { text: "Beto" });
    await one.next("round-result");
    server.time.advance(6000);

    expect(await one.next("choose-types")).toMatchObject({ round: 2 });
    one.emit("choose-type", { type: "water" });
    two.emit("choose-type", { type: "ground" });
    expect(await one.next<RoundStartedPayload>("round-started")).toMatchObject({ round: 2, type1: "ground", type2: "water" });
    one.emit("submit-pokemon", { text: "Épsilon" });
    two.emit("submit-pokemon", { text: "Delta" });
    await one.next("round-result");

    const ended = await one.next<GameEndedPayload>("game-ended");
    expect(ended).toMatchObject({ winnerSeat: null, reason: "completed", totals: { 1: 850, 2: 850 } });
    // No hay una tercera ronda: aunque pase el tiempo no llega ningún anuncio nuevo.
    server.time.advance(60_000);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(one.all<RoundResultPayload>("round-result")).toHaveLength(2);
    expect(one.all("choose-types")).toHaveLength(2);
    await room.idle();

    const game = await prisma.game.findUniqueOrThrow({ where: { roomCode: code }, include: { rounds: true } });
    expect(game).toMatchObject({
      status: "completed",
      endReason: "completed",
      winnerId: null,
      typeMode: "chosen",
      lengthMode: "custom",
      roundsLimit: 2,
    });
    expect(game.rounds).toHaveLength(2);
  }, 15_000);

  it("una partida abandonada por falta de oponente queda marcada como abandonada", async () => {
    let next = 2;
    server = await startServer({}, { rng: sequenceRng([0]), generateCode: () => `GAME0${next++}`, catalog });
    ash = await registerUser(server.app, "ash");
    const created = await request(server.app)
      .post("/rooms")
      .set("Authorization", `Bearer ${ash.token}`)
      .send({ typeMode: "random", lengthMode: "custom", roundsLimit: 1 });
    const room = server.store.get(created.body.code)!;

    server.time.advance(10 * 60 * 1000); // la sala en espera caduca
    await room.idle();

    const game = await prisma.game.findUniqueOrThrow({ where: { roomCode: "GAME02" } });
    expect(game).toMatchObject({ status: "abandoned", endReason: "expired", winnerId: null });
    expect(game.endedAt).toBeInstanceOf(Date);
    // El creador puede abrir otra sala.
    const again = await request(server.app)
      .post("/rooms")
      .set("Authorization", `Bearer ${ash.token}`)
      .send({ typeMode: "random", lengthMode: "custom", roundsLimit: 1 });
    expect(again.status).toBe(201);
  });
});
