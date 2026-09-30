import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";

describe("GET /health", () => {
  it("responde 200 con status ok", async () => {
    const response = await request(createApp()).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("no expone el encabezado x-powered-by", async () => {
    const response = await request(createApp()).get("/health");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });
});
