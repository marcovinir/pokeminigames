import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError, errorHandler, notFoundHandler } from "../../src/http/errors.js";

function buildApp() {
  const app = express();
  app.use(express.json({ limit: "1kb" }));
  app.get("/app-error", () => {
    throw new AppError(409, "EMAIL_TAKEN", "Ese email ya está registrado");
  });
  app.get("/async-error", async () => {
    throw new AppError(401, "UNAUTHORIZED", "Sin sesión");
  });
  app.post("/zod", (req) => {
    z.object({ name: z.string() }).parse(req.body);
  });
  app.get("/boom", () => {
    throw new Error("secreto interno");
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe("manejo de errores HTTP", () => {
  it("convierte un AppError en su estado y código", async () => {
    const response = await request(buildApp()).get("/app-error");
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: { code: "EMAIL_TAKEN", message: "Ese email ya está registrado" } });
  });

  it("también captura errores lanzados en handlers async", async () => {
    const response = await request(buildApp()).get("/async-error");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("convierte un ZodError en 400 con el detalle por campo", async () => {
    const response = await request(buildApp()).post("/zod").send({ name: 5 });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details).toEqual([{ path: "name", message: expect.any(String) }]);
  });

  it("responde 400 cuando el JSON está mal formado", async () => {
    const response = await request(buildApp())
      .post("/zod")
      .set("Content-Type", "application/json")
      .send("{no es json");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("responde 413 cuando el cuerpo supera el límite", async () => {
    const response = await request(buildApp()).post("/zod").send({ name: "x".repeat(5000) });
    expect(response.status).toBe(413);
  });

  it("no filtra el mensaje de un error inesperado", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await request(buildApp()).get("/boom");
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: { code: "INTERNAL_ERROR", message: "Error interno del servidor" } });
    expect(JSON.stringify(response.body)).not.toContain("secreto");
    spy.mockRestore();
  });

  it("devuelve 404 con formato JSON para rutas desconocidas", async () => {
    const response = await request(buildApp()).get("/no-existe");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });
});
