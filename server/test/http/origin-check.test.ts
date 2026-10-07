import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../../src/http/errors.js";
import { createOriginCheck } from "../../src/http/origin-check.js";

function build(options: { allowedOrigins?: string[]; trustProxy?: number } = {}) {
  const app = express();
  app.set("trust proxy", options.trustProxy ?? 0);
  app.use(createOriginCheck({ allowedOrigins: options.allowedOrigins ?? [] }));
  app.all("/x", (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

const HOST = "juego.example";
const own = `http://${HOST}`;
const post = (app: express.Express) => request(app).post("/x").set("Host", HOST);

describe("comprobación de origen", () => {
  it("los GET no se comprueban, vengan de donde vengan", async () => {
    const response = await request(build()).get("/x").set("Host", HOST).set("Origin", "https://malicioso.example");
    expect(response.status).toBe(200);
  });

  it("deja pasar un POST del propio origen", async () => {
    expect((await post(build()).set("Origin", own)).status).toBe(200);
  });

  it("rechaza un POST de otro origen con 403 FORBIDDEN", async () => {
    const response = await post(build()).set("Origin", "https://malicioso.example");
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it.each(["PUT", "DELETE", "PATCH"])("también comprueba %s", async (method) => {
    const app = build();
    const send = (origin: string) => request(app)[method.toLowerCase() as "put" | "delete" | "patch"]("/x").set("Host", HOST).set("Origin", origin);
    expect((await send(own)).status).toBe(200);
    expect((await send("https://malicioso.example")).status).toBe(403);
  });

  it("el esquema y el puerto también cuentan", async () => {
    const app = build();
    expect((await post(app).set("Origin", `https://${HOST}`)).status).toBe(403);
    expect((await post(app).set("Origin", `http://${HOST}:8080`)).status).toBe(403);
    expect((await request(app).post("/x").set("Host", `${HOST}:8080`).set("Origin", `http://${HOST}:8080`)).status).toBe(200);
  });

  it("un origen opaco (\"null\", p. ej. desde un iframe aislado) se rechaza", async () => {
    expect((await post(build()).set("Origin", "null")).status).toBe(403);
  });

  it("sin cabeceras de origen (curl, pruebas, el cliente en desarrollo por el proxy) pasa", async () => {
    expect((await post(build())).status).toBe(200);
  });

  it.each(["same-origin", "none"])("sin Origin, Sec-Fetch-Site=%s pasa", async (site) => {
    expect((await post(build()).set("Sec-Fetch-Site", site)).status).toBe(200);
  });

  it.each(["cross-site", "same-site"])("sin Origin, Sec-Fetch-Site=%s se rechaza", async (site) => {
    const response = await post(build()).set("Sec-Fetch-Site", site);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("el Origin manda sobre Sec-Fetch-Site", async () => {
    expect((await post(build()).set("Origin", own).set("Sec-Fetch-Site", "cross-site")).status).toBe(200);
  });

  it("acepta además los orígenes permitidos de la configuración", async () => {
    const app = build({ allowedOrigins: ["http://localhost:5173"] });
    expect((await post(app).set("Origin", "http://localhost:5173")).status).toBe(200);
    expect((await post(app).set("Origin", "http://localhost:5174")).status).toBe(403);
  });

  it("detrás de un proxy de confianza usa el protocolo que informa el proxy", async () => {
    const app = build({ trustProxy: 1 });
    const secure = post(app).set("X-Forwarded-Proto", "https");
    expect((await secure.set("Origin", `https://${HOST}`)).status).toBe(200);
    expect((await post(app).set("X-Forwarded-Proto", "https").set("Origin", own)).status).toBe(403);
  });

  it("sin proxy de confianza ignora X-Forwarded-Proto (un cliente no puede fingir el protocolo)", async () => {
    const response = await post(build({ trustProxy: 0 })).set("X-Forwarded-Proto", "https").set("Origin", `https://${HOST}`);
    expect(response.status).toBe(403);
  });
});
