import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { prisma, resetDatabase } from "../helpers/db.js";

const app = buildTestApp({ NODE_ENV: "production", COOKIE_SECURE: "true", TRUST_PROXY: "1" });
const ash = { email: "ash@example.com", username: "ash", password: "pikachu-123" };
const HOST = "juego.example";
const own = `http://${HOST}`;
const evil = "https://malicioso.example";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

const asBrowser = (origin: string) => ({ Host: HOST, Origin: origin });

describe("el cierre de la brecha CSRF en las rutas reales", () => {
  it("registro e inicio de sesión desde otro sitio se rechazan; desde el propio origen funcionan", async () => {
    const blocked = await request(app).post("/auth/register").set(asBrowser(evil)).send(ash);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("FORBIDDEN");
    const registered = await request(app).post("/auth/register").set(asBrowser(own)).send(ash);
    expect(registered.status).toBe(201);
    expect((await request(app).post("/auth/login").set(asBrowser(evil)).send({ email: ash.email, password: ash.password })).status).toBe(403);
    expect((await request(app).post("/auth/login").set(asBrowser(own)).send({ email: ash.email, password: ash.password })).status).toBe(200);
  });

  it("refresh y logout con la cookie de sesión desde otro sitio se rechazan y la sesión sigue viva", async () => {
    const registered = await request(app).post("/auth/register").set(asBrowser(own)).send(ash);
    const cookie = ((registered.headers["set-cookie"] ?? []) as unknown as string[]).find((c) => c.startsWith("refresh_token="))!.split(";")[0]!;

    expect((await request(app).post("/auth/refresh").set(asBrowser(evil)).set("Cookie", cookie)).status).toBe(403);
    expect((await request(app).post("/auth/logout").set(asBrowser(evil)).set("Cookie", cookie)).status).toBe(403);
    // La cookie no se gastó ni se revocó: sigue sirviendo desde el propio origen.
    expect((await request(app).post("/auth/refresh").set(asBrowser(own)).set("Cookie", cookie)).status).toBe(200);
  });

  it("crear una sala desde otro sitio se rechaza", async () => {
    const registered = await request(app).post("/auth/register").set(asBrowser(own)).send(ash);
    const token = registered.body.accessToken as string;
    const body = { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3 };
    const blocked = await request(app).post("/rooms").set(asBrowser(evil)).set("Authorization", `Bearer ${token}`).send(body);
    expect(blocked.status).toBe(403);
    const allowed = await request(app).post("/rooms").set(asBrowser(own)).set("Authorization", `Bearer ${token}`).send(body);
    expect(allowed.status).toBe(201);
  });

  it("detrás del proxy de Render (HTTPS) el propio origen es el https", async () => {
    const proxied = (origin: string) => ({ Host: HOST, Origin: origin, "X-Forwarded-Proto": "https" });
    expect((await request(app).post("/auth/register").set(proxied(`https://${HOST}`)).send(ash)).status).toBe(201);
    expect((await request(app).post("/auth/login").set(proxied(own)).send({ email: ash.email, password: ash.password })).status).toBe(403);
  });
});
