import type { RoomStateView } from "@pokemon-minigames/shared";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDatabase } from "../helpers/db.js";
import { sequenceRng } from "../helpers/rng.js";
import { type TestUser, registerUser } from "../helpers/users.js";
import { type RunningServer, TestClient, startServer } from "../realtime/client.js";

let server: RunningServer;
let clients: TestClient[] = [];

beforeEach(async () => {
  await resetDatabase();
  // Azar en 0: la ronda 1 es el n.º 1 del catálogo de pruebas (Alfa / Alpha).
  server = await startServer({}, { rng: sequenceRng([0]), generateCode: () => "SILUE2" });
});
afterEach(async () => {
  for (const client of clients) client.close();
  clients = [];
  await server.close();
});
afterAll(() => prisma.$disconnect());

const bearer = (user: TestUser) => `Bearer ${user.token}`;

async function connect(user: TestUser, code: string): Promise<{ client: TestClient; state: RoomStateView; seen: TestClient["received"] }> {
  const client = new TestClient(server.url, user.token);
  clients.push(client);
  const seen = client.received;
  await client.connected();
  client.emit("join-room", { code });
  return { client, state: await client.next<RoomStateView>("room-state"), seen };
}

describe("una partida de silueta por sockets (base real)", () => {
  it("dos cuentas juegan una ronda: puntos por rapidez y nada delata al Pokémon antes de la revelación", async () => {
    const ash = await registerUser(server.app, "ash");
    const misty = await registerUser(server.app, "misty");
    const created = await request(server.app).post("/rooms").set("Authorization", bearer(ash)).send({ game: "silueta", rounds: 5, generations: [1] });
    expect(created.status).toBe(201);
    const code = created.body.code as string;
    expect((await request(server.app).get(`/rooms/${code}`).set("Authorization", bearer(ash))).body.config).toEqual({ game: "silueta", rounds: 5, generations: [1] });
    await request(server.app).post(`/rooms/${code}/join`).set("Authorization", bearer(misty)).expect(200);

    const one = await connect(ash, code);
    const two = await connect(misty, code);
    await one.client.next("game-starting");
    server.time.advance(5000);
    const started = await one.client.next<{ silhouetteUrl: string }>("silhouette-round-started");
    expect(started.silhouetteUrl).toMatch(/^\/silhouettes\/[A-Za-z0-9_-]{22}$/);
    await two.client.next("silhouette-round-started");

    server.time.advance(3000);
    one.client.emit("submit-pokemon", { text: "Alfa" });
    expect(await one.client.next("silhouette-answer-received")).toEqual({ ms: 3000 });

    // Antes de la revelación: nada con el nombre, el número ni el arte, y misty no recibe la respuesta de ash.
    for (const [seat, seen] of [[1, one.seen], [2, two.seen]] as const) {
      const text = JSON.stringify(seen);
      for (const leak of ["Alpha", "example.com/1.png", '"id":1,', "official-artwork"]) expect(text, `asiento ${seat}: ${leak}`).not.toContain(leak);
      if (seat === 2) expect(text).not.toContain("Alfa");
    }

    two.client.emit("submit-pokemon", { text: "Beto" });
    const result = await two.client.next<{ reveal: { answers: Record<1 | 2, { points: number; correct: boolean }> }; totals: Record<1 | 2, number> }>("silhouette-round-result");
    expect(result.reveal.answers[1]).toMatchObject({ correct: true, points: 820 });
    expect(result.reveal.answers[2]).toMatchObject({ correct: false, points: 0 });
    expect(result.totals).toEqual({ 1: 820, 2: 0 });
    expect(await prisma.game.count()).toBe(0);
  });
});
