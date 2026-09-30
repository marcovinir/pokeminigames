import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { prisma } from "../helpers/db.js";

describe("GET /health", () => {
  const app = () => createApp({ env: loadEnv(process.env), prisma });

  it("responde 200 con status ok", async () => {
    const response = await request(app()).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("no expone el encabezado x-powered-by", async () => {
    const response = await request(app()).get("/health");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });
});
