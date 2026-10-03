import { THEME_MODES, THEME_NAMES } from "@pokemon-minigames/shared";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { prisma, resetDatabase } from "../helpers/db.js";

const app = buildTestApp();
const ash = { email: "ash@example.com", username: "ash", password: "pikachu-123" };
const misty = { email: "misty@example.com", username: "misty", password: "pikachu-123" };

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

function refreshCookie(response: request.Response): string {
  const cookies = (response.headers["set-cookie"] ?? []) as unknown as string[];
  return cookies.find((c) => c.startsWith("refresh_token="))!.split(";")[0]!;
}

async function register(user = ash) {
  const response = await request(app).post("/auth/register").send(user);
  return { token: response.body.accessToken as string, cookie: refreshCookie(response), userId: response.body.user.id as string };
}

const save = (token: string, body: unknown) =>
  request(app).put("/auth/me/preferences").set("Authorization", `Bearer ${token}`).send(body as object);

describe("la preferencia de tema en la respuesta del usuario", () => {
  it("un usuario nuevo no tiene preferencia (null) en registro, login, refresh y /auth/me", async () => {
    const registered = await request(app).post("/auth/register").send(ash);
    expect(registered.body.user.preferences).toBeNull();

    const login = await request(app).post("/auth/login").send({ email: ash.email, password: ash.password });
    expect(login.body.user.preferences).toBeNull();

    const refreshed = await request(app).post("/auth/refresh").set("Cookie", refreshCookie(registered));
    expect(refreshed.body.user.preferences).toBeNull();

    const me = await request(app).get("/auth/me").set("Authorization", `Bearer ${registered.body.accessToken}`);
    expect(me.body.user.preferences).toBeNull();
  });
});

describe("PUT /auth/me/preferences", () => {
  it("exige sesión", async () => {
    const response = await request(app).put("/auth/me/preferences").send({ theme: "pokedex", themeMode: "oscuro" });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("guarda la preferencia y la devuelve", async () => {
    const { token, userId } = await register();
    const response = await save(token, { theme: "pokedex", themeMode: "oscuro" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ preferences: { theme: "pokedex", themeMode: "oscuro" } });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row).toMatchObject({ theme: "pokedex", themeMode: "oscuro" });
  });

  it("después llega en /auth/me, en el login y en el refresh", async () => {
    const { token, cookie } = await register();
    await save(token, { theme: "clasico", themeMode: "claro" });
    const expected = { theme: "clasico", themeMode: "claro" };

    const me = await request(app).get("/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me.body.user.preferences).toEqual(expected);
    const login = await request(app).post("/auth/login").send({ email: ash.email, password: ash.password });
    expect(login.body.user.preferences).toEqual(expected);
    const refreshed = await request(app).post("/auth/refresh").set("Cookie", cookie);
    expect(refreshed.body.user.preferences).toEqual(expected);
  });

  it("una preferencia nueva reemplaza a la anterior", async () => {
    const { token } = await register();
    await save(token, { theme: "pokedex", themeMode: "oscuro" });
    const response = await save(token, { theme: "clasico", themeMode: "auto" });
    expect(response.body.preferences).toEqual({ theme: "clasico", themeMode: "auto" });
  });

  it.each(THEME_NAMES.flatMap((theme) => THEME_MODES.map((themeMode) => [theme, themeMode] as const)))(
    "acepta la combinación %s + %s",
    async (theme, themeMode) => {
      const { token } = await register();
      expect((await save(token, { theme, themeMode })).status).toBe(200);
    },
  );

  it("cada persona guarda la suya", async () => {
    const one = await register(ash);
    const two = await register(misty);
    await save(one.token, { theme: "pokedex", themeMode: "oscuro" });
    const me = await request(app).get("/auth/me").set("Authorization", `Bearer ${two.token}`);
    expect(me.body.user.preferences).toBeNull();
  });

  it.each([
    ["sin modo", { theme: "pokedex" }],
    ["sin tema", { themeMode: "oscuro" }],
    ["tema inexistente", { theme: "neon", themeMode: "oscuro" }],
    ["modo inexistente", { theme: "pokedex", themeMode: "sepia" }],
    ["valores que no son texto", { theme: 1, themeMode: null }],
    ["cuerpo vacío", {}],
    ["un texto en vez de un objeto", "pokedex"],
  ])("rechaza %s con 400 y no cambia nada", async (_name, body) => {
    const { token, userId } = await register();
    await save(token, { theme: "clasico", themeMode: "claro" });
    const response = await save(token, body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row).toMatchObject({ theme: "clasico", themeMode: "claro" });
  });

  it("si la cuenta ya no existe responde 401, no 500", async () => {
    const { token, userId } = await register();
    await prisma.user.delete({ where: { id: userId } });
    const response = await save(token, { theme: "pokedex", themeMode: "oscuro" });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });
});
