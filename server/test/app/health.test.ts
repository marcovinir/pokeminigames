import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../helpers/db.js";
import { buildTestApp } from "../helpers/app.js";

afterAll(() => prisma.$disconnect());

describe("GET /health", () => {
  const app = buildTestApp();

  it("responde 200 con status ok", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("no expone el encabezado x-powered-by", async () => {
    const response = await request(app).get("/health");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });
});
