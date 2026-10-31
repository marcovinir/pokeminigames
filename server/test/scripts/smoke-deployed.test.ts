import type { PokedexDetail } from "@pokemon-minigames/shared";
import { createPokedexStore } from "../../src/catalog/pokedex-store.js";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { type SmokeCheck, runSmoke } from "../../scripts/smoke-deployed.js";
import { buildTestContext } from "../helpers/app.js";
import { prisma, resetDatabase } from "../helpers/db.js";
import { createSilhouetteRegistry } from "../../src/silhouettes/registry.js";

const INDEX = '<!doctype html><html><body><div id="root"></div><script type="module" src="/assets/app.abc123.js"></script></body></html>';

let workdir: string;
let server: Server;
let baseUrl: string;
const POKEMON: PokedexDetail = {
  id: 6,
  names: { es: "Charizard", en: "Charizard" },
  types: ["fire", "flying"],
  total: 534,
  generation: 1,
  spriteUrl: "https://sprite/6.png",
  stats: { hp: 78, attack: 84, defense: 78, spAttack: 109, spDefense: 85, speed: 100 },
  abilities: [],
  lore: null,
  evolution: { id: 6, name: "Charizard", condition: null, next: [] },
};

const requests: { method: string; path: string; origin: string | undefined }[] = [];

beforeAll(async () => {
  await resetDatabase();
  workdir = mkdtempSync(join(tmpdir(), "pm-smoke-"));
  mkdirSync(join(workdir, "assets"));
  writeFileSync(join(workdir, "index.html"), INDEX);
  writeFileSync(join(workdir, "assets", "app.abc123.js"), "console.log('cliente');");

  const { env, tokens, roomManager, catalog } = buildTestContext({ NODE_ENV: "production", COOKIE_SECURE: "true", TRUST_PROXY: "1" });
  const app = createApp({ pokedex: createPokedexStore([POKEMON]), env, prisma, tokens, roomManager, catalog, clientDist: workdir, silhouettes: createSilhouetteRegistry() });
  // Anota todo lo que llega, para comprobar que la prueba de humo no escribe nada.
  const logged = (await import("express")).default();
  logged.use((req, _res, next) => {
    requests.push({ method: req.method, path: req.path, origin: req.get("origin") });
    next();
  });
  logged.use(app);
  server = await new Promise<Server>((resolve) => {
    const listening = logged.listen(0, "127.0.0.1", () => resolve(listening));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(workdir, { recursive: true, force: true });
  await prisma.$disconnect();
});

const failing = (checks: SmokeCheck[]) => checks.filter((c) => !c.ok).map((c) => c.name);
const instant = { sleep: async () => {}, wakeTimeoutMs: 1000 };

describe("la prueba de humo contra un servicio sano", () => {
  it("todas las comprobaciones pasan", async () => {
    const checks = await runSmoke({ baseUrl, expectedNames: 10, ...instant });
    expect(failing(checks)).toEqual([]);
    expect(checks.length).toBeGreaterThanOrEqual(8);
  });

  it("no escribe nada: solo GET y un único POST, que el servidor rechaza antes de procesarlo", async () => {
    requests.length = 0;
    await runSmoke({ baseUrl, expectedNames: 10, ...instant });
    const writes = requests.filter((r) => r.method !== "GET" && r.method !== "HEAD");
    expect(writes).toEqual([{ method: "POST", path: "/auth/login", origin: expect.stringMatching(/^https:\/\/.+\.invalid$/) }]);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.game.count()).toBe(0);
  });

  it("cada comprobación dice su nombre y un detalle legible", async () => {
    const checks = await runSmoke({ baseUrl, expectedNames: 10, ...instant });
    for (const check of checks) {
      expect(check.name.length).toBeGreaterThan(10);
      expect(check.detail.length).toBeGreaterThan(0);
    }
  });
});

describe("cuando algo no está bien", () => {
  it("avisa de que /pokemon/names no trae los nombres esperados", async () => {
    const checks = await runSmoke({ baseUrl, expectedNames: 1025, ...instant });
    expect(failing(checks)).toEqual([expect.stringMatching(/pokemon\/names/)]);
  });

  it("espera a que el servicio despierte: errores de red al principio y luego responde", async () => {
    let calls = 0;
    const flaky = (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (String(input).endsWith("/health") && calls++ < 3) return Promise.reject(new Error("ECONNRESET"));
      return fetch(input, init);
    };
    const checks = await runSmoke({ baseUrl, expectedNames: 10, fetch: flaky, ...instant, wakeTimeoutMs: 60_000, now: (() => { let t = 0; return () => (t += 1000); })() });
    expect(failing(checks)).toEqual([]);
    expect(calls).toBeGreaterThan(3);
  });

  it("si el servicio nunca responde, falla indicando cuánto esperó, sin hacer más comprobaciones", async () => {
    const down = () => Promise.reject(new Error("ECONNREFUSED"));
    let t = 0;
    const checks = await runSmoke({ baseUrl, fetch: down, sleep: async () => {}, wakeTimeoutMs: 90_000, now: () => (t += 10_000) });
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ ok: false });
    expect(checks[0]!.detail).toMatch(/90/);
  });

  it("detecta un cliente que no se sirve (index.html sin el nodo raíz)", async () => {
    const wrong = async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      if (url === `${baseUrl}/`) return new Response("<html>nada</html>", { headers: { "content-type": "text/html", "cache-control": "no-cache" } });
      return fetch(input, init);
    };
    const checks = await runSmoke({ baseUrl, expectedNames: 10, fetch: wrong, ...instant });
    expect(failing(checks).length).toBeGreaterThan(0);
    expect(failing(checks).join(" ")).toMatch(/cliente/i);
  });

  it("detecta una Pokédex vacía o sin ficha", async () => {
    const empty = async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (String(input).endsWith("/pokemon/dex")) return new Response('{"pokemon":[]}', { headers: { "content-type": "application/json" } });
      return fetch(input, init);
    };
    expect(failing(await runSmoke({ baseUrl, expectedNames: 10, fetch: empty, ...instant })).join(" ")).toMatch(/Pokédex/);
    const noDetail = async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (String(input).endsWith("/pokemon/dex/6")) return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
      return fetch(input, init);
    };
    expect(failing(await runSmoke({ baseUrl, expectedNames: 10, fetch: noDetail, ...instant })).join(" ")).toMatch(/Pokédex/);
  });

  it("detecta que una ruta protegida responde sin pedir sesión", async () => {
    const open = async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (String(input).endsWith("/stats")) return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      return fetch(input, init);
    };
    const checks = await runSmoke({ baseUrl, expectedNames: 10, fetch: open, ...instant });
    expect(failing(checks).join(" ")).toMatch(/sesión/);
  });

  it("detecta que el servidor concede CORS a cualquier origen", async () => {
    const wildcard = async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const response = await fetch(input, init);
      const headers = new Headers(response.headers);
      headers.set("access-control-allow-origin", "*");
      return new Response(response.body, { status: response.status, headers });
    };
    const checks = await runSmoke({ baseUrl, expectedNames: 10, fetch: wildcard, ...instant });
    expect(failing(checks).join(" ")).toMatch(/CORS/);
  });

  it("detecta que un origen ajeno puede hacer POST", async () => {
    const lax = async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (init?.method === "POST") return new Response(JSON.stringify({ error: { code: "INVALID_CREDENTIALS" } }), { status: 401, headers: { "content-type": "application/json" } });
      return fetch(input, init);
    };
    const checks = await runSmoke({ baseUrl, expectedNames: 10, fetch: lax, ...instant });
    expect(failing(checks).join(" ")).toMatch(/origen/i);
  });

  it("detecta archivos con hash que no se cachean para siempre", async () => {
    const nocache = async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const response = await fetch(input, init);
      if (!String(input).includes("/assets/")) return response;
      const headers = new Headers(response.headers);
      headers.set("cache-control", "no-cache");
      return new Response(response.body, { status: response.status, headers });
    };
    const checks = await runSmoke({ baseUrl, expectedNames: 10, fetch: nocache, ...instant });
    expect(failing(checks).join(" ")).toMatch(/caché|cachean/i);
  });
});
