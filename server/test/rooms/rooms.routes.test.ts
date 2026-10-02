import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDatabase } from "../helpers/db.js";
import { buildTestContext } from "../helpers/app.js";
import { registerUser, type TestUser } from "../helpers/users.js";

let ctx = buildTestContext();
let ash: TestUser;
let misty: TestUser;
let brock: TestUser;

const validBody = { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3 };

beforeEach(async () => {
  await resetDatabase();
  ctx = buildTestContext();
  ash = await registerUser(ctx.app, "ash");
  misty = await registerUser(ctx.app, "misty");
  brock = await registerUser(ctx.app, "brock");
});
afterAll(() => prisma.$disconnect());

const auth = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });
const createRoom = (user: TestUser, body: unknown = validBody) =>
  request(ctx.app).post("/rooms").set(auth(user)).send(body as object);

describe("autenticación de las rutas de salas", () => {
  it.each([
    ["POST /rooms", () => request(ctx.app).post("/rooms").send(validBody)],
    ["GET /rooms/current", () => request(ctx.app).get("/rooms/current")],
    ["GET /rooms/:code", () => request(ctx.app).get("/rooms/ABC234")],
    ["POST /rooms/:code/join", () => request(ctx.app).post("/rooms/ABC234/join")],
  ])("%s responde 401 sin token", async (_name, call) => {
    const response = await call();
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("responde 401 con un token inválido", async () => {
    const response = await request(ctx.app).post("/rooms").set("Authorization", "Bearer basura").send(validBody);
    expect(response.status).toBe(401);
  });
});

describe("POST /rooms", () => {
  it("crea la sala y la partida en la base de datos", async () => {
    const response = await createRoom(ash);
    expect(response.status).toBe(201);
    expect(response.body.code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);

    const game = await prisma.game.findUniqueOrThrow({
      where: { roomCode: response.body.code },
      include: { players: true },
    });
    expect(game).toMatchObject({ status: "waiting", typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3 });
    expect(game.players.map((p) => [p.userId, p.seat])).toEqual([[ash.userId, 1]]);
  });

  it.each([
    ["rondas fijas de 5", { typeMode: "chosen", lengthMode: "fixed_rounds", roundsLimit: 5 }],
    ["personalizada con 10 rondas", { typeMode: "random", lengthMode: "custom", roundsLimit: 10 }],
    ["personalizada con 1 ronda", { typeMode: "random", lengthMode: "custom", roundsLimit: 1 }],
    ["personalizada con 20 rondas", { typeMode: "random", lengthMode: "custom", roundsLimit: 20 }],
    ["personalizada con meta 500", { typeMode: "chosen", lengthMode: "custom", statsGoal: 500 }],
    ["personalizada con meta 5000", { typeMode: "chosen", lengthMode: "custom", statsGoal: 5000 }],
  ])("acepta %s", async (_name, body) => {
    const response = await createRoom(ash, body);
    expect(response.status).toBe(201);
  });

  it.each([
    ["modo de tipos desconocido", { typeMode: "x", lengthMode: "fixed_rounds", roundsLimit: 3 }],
    ["rondas fijas de 4", { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 4 }],
    ["rondas fijas sin número", { typeMode: "random", lengthMode: "fixed_rounds" }],
    ["rondas fijas con meta de stats", { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: 1000 }],
    ["personalizada sin condición de fin", { typeMode: "random", lengthMode: "custom" }],
    ["personalizada con las dos condiciones", { typeMode: "random", lengthMode: "custom", roundsLimit: 5, statsGoal: 1000 }],
    ["personalizada con 0 rondas", { typeMode: "random", lengthMode: "custom", roundsLimit: 0 }],
    ["personalizada con 21 rondas", { typeMode: "random", lengthMode: "custom", roundsLimit: 21 }],
    ["personalizada con meta 499", { typeMode: "random", lengthMode: "custom", statsGoal: 499 }],
    ["personalizada con meta 5001", { typeMode: "random", lengthMode: "custom", statsGoal: 5001 }],
    ["rondas decimales", { typeMode: "random", lengthMode: "custom", roundsLimit: 2.5 }],
    ["rondas como texto", { typeMode: "random", lengthMode: "custom", roundsLimit: "3" }],
  ])("rechaza %s con 400", async (_name, body) => {
    const response = await createRoom(ash, body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rechaza un cuerpo vacío", async () => {
    const response = await request(ctx.app).post("/rooms").set(auth(ash));
    expect(response.status).toBe(400);
  });

  it("409 ALREADY_IN_GAME si el usuario ya está en una partida activa", async () => {
    await createRoom(ash);
    const response = await createRoom(ash);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ALREADY_IN_GAME");
  });
});

describe("GET /rooms/current", () => {
  const current = (user: TestUser) => request(ctx.app).get("/rooms/current").set(auth(user));

  it("devuelve room: null (con 200) si el usuario no tiene ninguna partida activa", async () => {
    const response = await current(ash);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ room: null });
  });

  it("devuelve el código y la fase de la sala activa, para el creador y para quien se unió", async () => {
    const { body } = await createRoom(ash);
    expect((await current(ash)).body).toEqual({ room: { code: body.code, phase: "waiting" } });
    expect((await current(misty)).body).toEqual({ room: null });

    await request(ctx.app).post(`/rooms/${body.code}/join`).set(auth(misty));
    expect((await current(misty)).body).toEqual({ room: { code: body.code, phase: "waiting" } });
  });

  it("deja de devolver la sala cuando la partida termina", async () => {
    await createRoom(ash);
    ctx.time.advance(10 * 60 * 1000); // caduca sin que nadie se una
    expect((await current(ash)).body).toEqual({ room: null });
  });

  it("no se confunde con un código de sala llamado current", async () => {
    const response = await current(ash);
    expect(response.body).not.toHaveProperty("error");
  });
});

describe("GET /rooms/:code", () => {
  it("devuelve la información pública de la sala", async () => {
    const { body } = await createRoom(ash, { typeMode: "chosen", lengthMode: "custom", statsGoal: 2500 });
    const response = await request(ctx.app).get(`/rooms/${body.code.toLowerCase()}`).set(auth(misty));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      code: body.code,
      phase: "waiting",
      config: { typeMode: "chosen", lengthMode: "custom", roundsLimit: null, statsGoal: 2500 },
      creator: "ash",
      playerCount: 1,
    });
  });

  it("404 ROOM_NOT_FOUND para un código inexistente", async () => {
    const response = await request(ctx.app).get("/rooms/ZZZZZZ").set(auth(ash));
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("ROOM_NOT_FOUND");
  });
});

describe("POST /rooms/:code/join", () => {
  it("reserva el asiento 2 y lo guarda en la base de datos", async () => {
    const { body } = await createRoom(ash);
    const room = ctx.store.get(body.code)!;
    const response = await request(ctx.app).post(`/rooms/${body.code}/join`).set(auth(misty));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ code: body.code });

    await room.idle();
    const players = await prisma.gamePlayer.findMany({ where: { game: { roomCode: body.code } }, orderBy: { seat: "asc" } });
    expect(players.map((p) => [p.userId, p.seat])).toEqual([[ash.userId, 1], [misty.userId, 2]]);
    const info = await request(ctx.app).get(`/rooms/${body.code}`).set(auth(ash));
    expect(info.body.playerCount).toBe(2);
  });

  it("es idempotente para quien ya está en la sala", async () => {
    const { body } = await createRoom(ash);
    const again = await request(ctx.app).post(`/rooms/${body.code}/join`).set(auth(ash));
    expect(again.status).toBe(200);
  });

  it("409 ROOM_FULL si ya hay dos jugadores", async () => {
    const { body } = await createRoom(ash);
    await request(ctx.app).post(`/rooms/${body.code}/join`).set(auth(misty));
    const response = await request(ctx.app).post(`/rooms/${body.code}/join`).set(auth(brock));
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ROOM_FULL");
  });

  it("404 ROOM_NOT_FOUND si el código no existe", async () => {
    const response = await request(ctx.app).post("/rooms/ZZZZZZ/join").set(auth(ash));
    expect(response.status).toBe(404);
  });

  it("409 ALREADY_IN_GAME si quien se une ya participa en otra sala", async () => {
    await createRoom(ash);
    const other = await createRoom(misty);
    const response = await request(ctx.app).post(`/rooms/${other.body.code}/join`).set(auth(ash));
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ALREADY_IN_GAME");
  });

  it("dos personas intentando entrar a la vez: una obtiene el asiento y la otra ROOM_FULL", async () => {
    const { body } = await createRoom(ash);
    const [a, b] = await Promise.all([
      request(ctx.app).post(`/rooms/${body.code}/join`).set(auth(misty)),
      request(ctx.app).post(`/rooms/${body.code}/join`).set(auth(brock)),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });
});
