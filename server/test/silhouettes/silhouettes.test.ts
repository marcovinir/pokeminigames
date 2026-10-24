import express from "express";
import { PNG } from "pngjs";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../src/http/errors.js";
import { createSilhouetteRegistry } from "../../src/silhouettes/registry.js";
import { createSilhouetteRenderer } from "../../src/silhouettes/renderer.js";
import { createSilhouettesRouter } from "../../src/silhouettes/silhouettes.routes.js";
import { buildTestApp } from "../helpers/app.js";

/** Un PNG de 4×4: la columna izquierda roja y opaca, la derecha azul semitransparente, el resto transparente. */
function artPng(): Buffer {
  const png = new PNG({ width: 4, height: 4 });
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const i = (y * 4 + x) * 4;
      const [r, g, b, a] = x === 0 ? [255, 0, 0, 255] : x === 3 ? [0, 0, 255, 120] : [0, 0, 0, 0];
      png.data[i] = r!;
      png.data[i + 1] = g!;
      png.data[i + 2] = b!;
      png.data[i + 3] = a!;
    }
  }
  return PNG.sync.write(png);
}

function setup(fetchImpl = vi.fn(async () => new Response(new Uint8Array(artPng()), { status: 200 }))) {
  const registry = createSilhouetteRegistry();
  const renderer = createSilhouetteRenderer({ artUrl: "https://arte.test/{id}.png", fetchImpl: fetchImpl as unknown as typeof fetch });
  const app = express();
  app.use("/silhouettes", createSilhouettesRouter({ registry, renderer }));
  app.use(errorHandler);
  return { app, registry, fetchImpl };
}

describe("la ruta de las siluetas", () => {
  it("devuelve un PNG con solo píxeles negros o transparentes y la misma forma", async () => {
    const { app, registry, fetchImpl } = setup();
    registry.register("tok-1", 94);
    const response = await request(app).get("/silhouettes/tok-1").buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => done(null, Buffer.concat(chunks)));
    });
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("image/png");
    expect(response.headers["cache-control"]).toBe("private, max-age=3600");
    expect(fetchImpl).toHaveBeenCalledWith("https://arte.test/94.png", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    const png = PNG.sync.read(response.body as Buffer);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const i = (y * 4 + x) * 4;
        expect([png.data[i], png.data[i + 1], png.data[i + 2]], `(${x},${y})`).toEqual([0, 0, 0]);
        expect(png.data[i + 3], `alfa (${x},${y})`).toBe(x === 0 ? 255 : x === 3 ? 120 : 0);
      }
    }
  });

  it("un token desconocido da 404", async () => {
    const response = await request(setup().app).get("/silhouettes/nada");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("SILHOUETTE_NOT_FOUND");
  });

  it("si el arte no carga da 502", async () => {
    const { app, registry } = setup(vi.fn(async () => new Response("no", { status: 404 })));
    registry.register("tok-1", 94);
    const response = await request(app).get("/silhouettes/tok-1");
    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe("SILHOUETTE_UNAVAILABLE");
  });

  it("el mismo Pokémon se pide al origen una sola vez, y un token ya usado sigue funcionando", async () => {
    const { app, registry, fetchImpl } = setup();
    registry.register("tok-1", 94);
    registry.register("tok-2", 94);
    await request(app).get("/silhouettes/tok-1").expect(200);
    await request(app).get("/silhouettes/tok-2").expect(200);
    await request(app).get("/silhouettes/tok-1").expect(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("la ruta no cae en el cliente: responde JSON", async () => {
    const response = await request(buildTestApp()).get("/silhouettes/nada");
    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/json/);
  });
});

describe("el registro de siluetas", () => {
  it("guarda token → Pokémon y, lleno, olvida los más viejos", () => {
    const registry = createSilhouetteRegistry({ maxEntries: 2 });
    registry.register("a", 1);
    registry.register("b", 2);
    registry.register("c", 3);
    expect(registry.lookup("a")).toBeUndefined();
    expect(registry.lookup("b")).toBe(2);
    expect(registry.lookup("c")).toBe(3);
  });
});

describe("el arte que no responde", () => {
  it("si el origen no contesta a tiempo da 502 (y la pantalla enseña su respaldo)", async () => {
    // Como fetch de verdad: solo termina cuando se aborta con la señal.
    const hanging = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("abortado")))));
    const registry = createSilhouetteRegistry();
    const renderer = createSilhouetteRenderer({ artUrl: "https://arte.test/{id}.png", fetchImpl: hanging as unknown as typeof fetch, timeoutMs: 50 });
    const app = express();
    app.use("/silhouettes", createSilhouettesRouter({ registry, renderer }));
    app.use(errorHandler);
    registry.register("tok-1", 94);
    const response = await request(app).get("/silhouettes/tok-1");
    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe("SILHOUETTE_UNAVAILABLE");
  });
});
