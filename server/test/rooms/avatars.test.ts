import type { RoomStateView } from "@pokemon-minigames/shared";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDatabase } from "../helpers/db.js";
import { type TestUser, enterAsGuest, registerUser } from "../helpers/users.js";
import { type RunningServer, TestClient, startServer } from "../realtime/client.js";

let server: RunningServer;
let clients: TestClient[] = [];

beforeEach(async () => {
  await resetDatabase();
  server = await startServer({}, { generateCode: () => "AVATA2" });
});
afterEach(async () => {
  for (const client of clients) client.close();
  clients = [];
  await server.close();
});
afterAll(() => prisma.$disconnect());

const bearer = (user: TestUser) => `Bearer ${user.token}`;
const saveAvatar = (user: TestUser, avatarId: number | null) =>
  request(server.app).put("/auth/me/avatar").set("Authorization", bearer(user)).send({ avatarId }).expect(200);

async function connect(user: TestUser, code: string): Promise<{ client: TestClient; state: RoomStateView }> {
  const client = new TestClient(server.url, user.token);
  clients.push(client);
  await client.connected();
  client.emit("join-room", { code });
  return { client, state: await client.next<RoomStateView>("room-state") };
}

async function createRoom(user: TestUser): Promise<string> {
  const created = await request(server.app).post("/rooms").set("Authorization", bearer(user)).send({ typeMode: "random", lengthMode: "custom", roundsLimit: 1 });
  expect(created.status).toBe(201);
  return created.body.code as string;
}

describe("el avatar en la sala (base y sockets reales)", () => {
  it("el rival ve el avatar al unirse y los dos lo ven en el estado de la sala", async () => {
    const ash = await registerUser(server.app, "ash");
    const misty = await registerUser(server.app, "misty");
    await saveAvatar(ash, 94);
    await saveAvatar(misty, 25);

    const code = await createRoom(ash);
    const { client: creator } = await connect(ash, code);
    await request(server.app).post(`/rooms/${code}/join`).set("Authorization", bearer(misty)).expect(200);
    expect(await creator.next("player-joined")).toEqual({ username: "misty", avatarId: 25 });

    const { state } = await connect(misty, code);
    expect(state.players).toMatchObject([
      { username: "ash", avatarId: 94 },
      { username: "misty", avatarId: 25 },
    ]);
  });

  it("un invitado entra sin avatar", async () => {
    const ash = await registerUser(server.app, "ash");
    const guest = await enterAsGuest(server.app, "inv_1");
    const code = await createRoom(ash);
    await request(server.app).post(`/rooms/${code}/join`).set("Authorization", bearer(guest)).expect(200);
    const { state } = await connect(guest, code);
    expect("avatarId" in state.players[1]!).toBe(false);
  });

  it("cambiar el avatar con la sala abierta no cambia esa sala", async () => {
    const ash = await registerUser(server.app, "ash");
    await saveAvatar(ash, 94);
    const code = await createRoom(ash);
    await saveAvatar(ash, 6);
    const { state } = await connect(ash, code);
    expect(state.players[0]).toMatchObject({ username: "ash", avatarId: 94 });
  });
});
