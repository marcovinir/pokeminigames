import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedCatalog } from "../../src/catalog/seed.js";
import { EXTERNAL, buildServer } from "../../scripts/build.js";
import { fixtureSnapshot } from "../helpers/fixtures.js";
import { prisma, resetCatalog } from "../helpers/db.js";

const children: ChildProcess[] = [];
let outfile: string;

beforeAll(async () => {
  outfile = await buildServer();
  await resetCatalog();
  await seedCatalog(prisma, fixtureSnapshot());
}, 60_000);

afterAll(async () => {
  for (const child of children) child.kill();
  await resetCatalog();
  await prisma.$disconnect();
});

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });

const productionEnv = (port: number, extra: Record<string, string> = {}) => ({
  ...process.env,
  NODE_ENV: "production",
  PORT: String(port),
  COOKIE_SECURE: "true",
  COOKIE_SAME_SITE: "lax",
  TRUST_PROXY: "1",
  ...extra,
});

function start(env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, [outfile], { env, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  let output = "";
  child.stdout?.on("data", (chunk) => void (output += chunk));
  child.stderr?.on("data", (chunk) => void (output += chunk));
  const exited = new Promise<number | null>((resolve) => child.once("exit", resolve));
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`El servidor no arrancó a tiempo. Salida:\n${output}`)), 30_000);
    const check = setInterval(() => {
      if (output.includes("escuchando")) {
        clearTimeout(timer);
        clearInterval(check);
        resolve();
      }
    }, 50);
    void exited.then(() => {
      clearTimeout(timer);
      clearInterval(check);
      reject(new Error(`El servidor salió antes de arrancar. Salida:\n${output}`));
    });
  });
  return { child, ready, exited, output: () => output };
}

describe("el servidor empaquetado", () => {
  it("el paquete es un solo archivo que lleva dentro el código compartido y deja fuera las dependencias instaladas", () => {
    expect(existsSync(outfile)).toBe(true);
    const text = readFileSync(outfile, "utf8");
    expect(text).toContain("normalizeName"); // viene de shared/, que es TypeScript y no puede quedar fuera
    expect(EXTERNAL).toContain("express");
    expect(EXTERNAL).toContain("@prisma/client");
    expect(EXTERNAL).not.toContain("@pokemon-minigames/shared");
    expect(text).toMatch(/from ["']express["']/);
  });

  it("arranca en modo producción con node, carga el catálogo y responde", async () => {
    const port = await freePort();
    const server = start(productionEnv(port));
    await server.ready;
    expect(server.output()).toContain("Catálogo cargado: 10 Pokémon");

    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ok" });

    const names = (await (await fetch(`http://127.0.0.1:${port}/pokemon/names`)).json()) as unknown[];
    expect(names).toHaveLength(10);
  }, 60_000);

  it("el servidor de producción aplica las protecciones: origen ajeno rechazado y sin CORS", async () => {
    const port = await freePort();
    const server = start(productionEnv(port));
    await server.ready;
    const base = `http://127.0.0.1:${port}`;

    const blocked = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://malicioso.example" },
      body: JSON.stringify({ email: "a@b.co", password: "x" }),
    });
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).error.code).toBe("FORBIDDEN");

    const cors = await fetch(`${base}/health`, { headers: { Origin: "https://malicioso.example" } });
    expect(cors.headers.get("access-control-allow-origin")).toBeNull();
  }, 60_000);

  it("se niega a arrancar con una configuración de producción insegura y dice por qué", async () => {
    const port = await freePort();
    const server = start(productionEnv(port, { COOKIE_SECURE: "false" }));
    await expect(server.ready).rejects.toThrow(/COOKIE_SECURE/);
    expect(await server.exited).not.toBe(0);
  }, 60_000);

  it.skipIf(process.platform === "win32")("al recibir SIGTERM cierra ordenadamente y sale con 0", async () => {
    const port = await freePort();
    const server = start(productionEnv(port));
    await server.ready;
    server.child.kill("SIGTERM");
    expect(await server.exited).toBe(0);
    expect(server.output()).toContain("SIGTERM recibido");
  }, 60_000);
});
