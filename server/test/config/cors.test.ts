import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { prisma } from "../helpers/db.js";

afterAll(() => prisma.$disconnect());

const production = { NODE_ENV: "production", COOKIE_SECURE: "true", TRUST_PROXY: "1" };

describe("CORS según el entorno", () => {
  it("en desarrollo concede CORS al origen del cliente (comportamiento de siempre)", async () => {
    const app = buildTestApp();
    const response = await request(app).get("/health").set("Origin", "http://localhost:5173");
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("en producción sin CORS_ORIGIN no se concede CORS a nadie (ni con comodín)", async () => {
    const app = buildTestApp(production);
    for (const origin of ["http://localhost:5173", "https://malicioso.example"]) {
      const response = await request(app).get("/health").set("Origin", origin);
      expect(response.status).toBe(200);
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    }
  });

  it("en producción con CORS_ORIGIN se concede solo a ese origen", async () => {
    const app = buildTestApp({ ...production, CORS_ORIGIN: "https://juego.example" });
    const allowed = await request(app).get("/health").set("Origin", "https://juego.example");
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://juego.example");
    const other = await request(app).get("/health").set("Origin", "https://otro.example");
    expect(other.headers["access-control-allow-origin"]).not.toBe("https://otro.example");
  });
});
