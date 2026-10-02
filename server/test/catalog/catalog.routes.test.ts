import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../helpers/db.js";
import { buildTestApp } from "../helpers/app.js";

afterAll(() => prisma.$disconnect());

describe("GET /pokemon/names", () => {
  const app = buildTestApp();

  it("es público: responde sin sesión", async () => {
    const response = await request(app).get("/pokemon/names");
    expect(response.status).toBe(200);
  });

  it("devuelve id y nombres en español e inglés de todos los Pokémon, ordenados por id", async () => {
    const response = await request(app).get("/pokemon/names");
    expect(response.body).toHaveLength(10);
    expect(response.body[0]).toEqual({ id: 1, es: "Alfa", en: "Alpha" });
    expect(response.body[4]).toEqual({ id: 5, es: "Épsilon", en: "Epsilon" });
    const ids = response.body.map((p: { id: number }) => p.id);
    expect(ids).toEqual([...ids].sort((a: number, b: number) => a - b));
  });

  it("no revela nada que sirva para responder: solo id y nombres, sin tipos ni stats", async () => {
    const response = await request(app).get("/pokemon/names");
    for (const entry of response.body) {
      expect(Object.keys(entry).sort()).toEqual(["en", "es", "id"]);
    }
  });

  it("se puede guardar en caché un día", async () => {
    const response = await request(app).get("/pokemon/names");
    expect(response.headers["cache-control"]).toBe("public, max-age=86400");
  });
});
