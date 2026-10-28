import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { buildTestContext } from "../helpers/app.js";
import { prisma } from "../helpers/db.js";
import { createSilhouetteRegistry } from "../../src/silhouettes/registry.js";

const INDEX = '<!doctype html><html><body><div id="root"></div><script type="module" src="/assets/app.abc123.js"></script></body></html>';
const IMMUTABLE = "public, max-age=31536000, immutable";

let workdir: string;
let dist: string;

beforeAll(() => {
  workdir = mkdtempSync(join(tmpdir(), "pm-client-"));
  dist = join(workdir, "dist");
  mkdirSync(join(dist, "assets"), { recursive: true });
  writeFileSync(join(dist, "index.html"), INDEX);
  writeFileSync(join(dist, "assets", "app.abc123.js"), "console.log('cliente');");
  writeFileSync(join(dist, "assets", "app.abc123.css"), "body{color:red}");
  writeFileSync(join(dist, "favicon.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
  writeFileSync(join(workdir, "secreto.txt"), "SECRET-CANARY");
});
afterAll(async () => {
  rmSync(workdir, { recursive: true, force: true });
  await prisma.$disconnect();
});

function appWith(clientDist?: string) {
  const ctx = buildTestContext();
  const { env, tokens, roomManager, catalog } = ctx;
  return createApp({ env, prisma, tokens, roomManager, catalog, rateLimits: "off", clientDist, silhouettes: createSilhouetteRegistry() });
}

describe("el cliente construido", () => {
  const app = () => appWith(dist);

  it.each(["/", "/login", "/registro", "/perfil", "/jugador/ash", "/sala/ABC234", "/perfil?x=1"])(
    "%s devuelve index.html para que React Router resuelva la pantalla",
    async (path) => {
      const response = await request(app()).get(path);
      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toMatch(/text\/html/);
      expect(response.text).toBe(INDEX);
      expect(response.headers["cache-control"]).toBe("no-cache");
    },
  );

  it("HEAD también responde (sin cuerpo)", async () => {
    const response = await request(app()).head("/perfil");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/html/);
    expect(response.text ?? "").toBe("");
  });

  it("los archivos con hash se cachean para siempre", async () => {
    const js = await request(app()).get("/assets/app.abc123.js");
    expect(js.status).toBe(200);
    expect(js.headers["content-type"]).toMatch(/javascript/);
    expect(js.headers["cache-control"]).toBe(IMMUTABLE);
    const css = await request(app()).get("/assets/app.abc123.css");
    expect(css.headers["content-type"]).toMatch(/css/);
    expect(css.headers["cache-control"]).toBe(IMMUTABLE);
  });

  it("lo que no está en /assets (index.html, el icono) nunca se cachea sin revalidar", async () => {
    for (const path of ["/index.html", "/favicon.svg"]) {
      const response = await request(app()).get(path);
      expect(response.status, path).toBe(200);
      expect(response.headers["cache-control"], path).toBe("no-cache");
    }
  });

  it("un archivo que no existe (con extensión) da 404 en JSON, no el index.html (que rompería el JavaScript)", async () => {
    for (const path of ["/assets/no-existe.js", "/foto.png", "/robots.txt"]) {
      const response = await request(app()).get(path);
      expect(response.status, path).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    }
  });

  it("una petición que no es GET ni HEAD a una pantalla del cliente da 404 en JSON", async () => {
    for (const method of ["post", "put", "delete"] as const) {
      const response = await request(app())[method]("/perfil");
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    }
  });

  it("Express no distingue mayúsculas en las rutas y el cliente tampoco debe tapar la API por eso", async () => {
    const unknown = await request(app()).get("/Auth/no-existe");
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe("NOT_FOUND");
    expect((await request(app()).get("/ROOMS/current")).status).toBe(401);
    expect((await request(app()).get("/Health")).body).toEqual({ status: "ok" });
  });

  it("no tapa la API: sus rutas siguen respondiendo en JSON", async () => {
    const health = await request(app()).get("/health");
    expect(health.body).toEqual({ status: "ok" });
    for (const path of ["/rooms/current", "/stats", "/stats/history", "/users/ash/stats", "/auth/me"]) {
      const response = await request(app()).get(path);
      expect(response.status, path).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHORIZED");
    }
    const names = await request(app()).get("/pokemon/names");
    expect(names.status).toBe(200);
    expect(Array.isArray(names.body)).toBe(true);
  });

  it("una ruta de la API que no existe sigue dando el 404 en JSON de siempre", async () => {
    const expected: [string, number][] = [
      ["/auth/no-existe", 404],
      ["/rooms/", 401], // el router de salas pide sesión antes de buscar la ruta
      ["/pokemon/xyz/abc", 404],
      ["/stats/nada/mas", 404],
      ["/socket.io/?EIO=4&transport=polling", 404],
    ];
    for (const [path, status] of expected) {
      const response = await request(app()).get(path);
      expect(response.status, path).toBe(status);
      expect(response.headers["content-type"], path).toMatch(/json/);
      expect(response.text, path).not.toContain('id="root"');
    }
  });

  it("no sirve nada de fuera del directorio del cliente", async () => {
    for (const path of ["/..%2fsecreto.txt", "/%2e%2e/secreto.txt", "/assets/..%2f..%2fsecreto.txt", "/..%2f..%2fsecreto.txt", "/%2e%2e%2fsecreto.txt"]) {
      const response = await request(app()).get(path);
      expect(response.text ?? "", path).not.toContain("SECRET-CANARY");
    }
  });
});

describe("sin cliente construido (desarrollo y pruebas)", () => {
  it("todo sigue como antes: lo desconocido da 404 en JSON", async () => {
    const response = await request(appWith(undefined)).get("/perfil");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("un directorio que no existe, o sin index.html, tampoco sirve nada", async () => {
    const empty = mkdtempSync(join(tmpdir(), "pm-empty-"));
    try {
      expect((await request(appWith(join(workdir, "no-existe"))).get("/perfil")).status).toBe(404);
      expect((await request(appWith(empty)).get("/perfil")).status).toBe(404);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
