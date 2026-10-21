import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { E2E_DATABASE, adminDatabaseUrl } from "./support/db";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = join(root, "server");
const DATABASE = E2E_DATABASE;
const PORT = Number(process.env.E2E_PORT ?? 4321);

async function recreateDatabase(admin: string, drop: boolean): Promise<void> {
  const client = new pg.Client({ connectionString: admin });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    if (!drop) await client.query(`CREATE DATABASE ${DATABASE}`);
  } finally {
    await client.end();
  }
}

async function waitForHealth(url: string, output: () => string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${url}/health`)).ok) return;
    } catch {
      // Todavía no escucha.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`El servidor de la prueba E2E no respondió en 60 s. Salida:\n${output()}`);
}

/**
 * Prepara todo lo que necesita la prueba y lo deshace al terminar: una base de datos propia (migrada y con el catálogo
 * real) y el servidor de producción (cliente construido y servidor empaquetado, como en Render). No toca la base de
 * desarrollo ni la de pruebas.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  for (const file of [join(serverDir, "dist", "index.js"), join(root, "client", "dist", "index.html")]) {
    if (!existsSync(file)) throw new Error(`Falta ${file}. Ejecuta \`npm run build\` antes de la prueba E2E (\`npm run e2e\` ya lo hace).`);
  }

  const admin = adminDatabaseUrl();
  await recreateDatabase(admin, false);
  const databaseUrl = new URL(admin);
  databaseUrl.pathname = `/${DATABASE}`;
  const env = { ...process.env, DATABASE_URL: databaseUrl.toString() };
  // Prisma y tsx se lanzan directamente con node (sin npx ni shell): funciona igual en Windows y en Linux.
  const prismaCli = join(root, "node_modules", "prisma", "build", "index.js");
  const tsxCli = join(root, "node_modules", "tsx", "dist", "cli.mjs");
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], { cwd: serverDir, env, stdio: "pipe" });
  execFileSync(process.execPath, [tsxCli, "scripts/seed.ts"], { cwd: serverDir, env, stdio: "pipe" });

  let output = "";
  const server: ChildProcess = spawn(process.execPath, ["dist/index.js"], {
    cwd: serverDir,
    env: {
      ...env,
      NODE_ENV: "production",
      PORT: String(PORT),
      JWT_ACCESS_SECRET: "clave-solo-para-la-prueba-e2e-0123456789-abcdef",
      BCRYPT_COST: "4",
      COOKIE_SECURE: "true",
      COOKIE_SAME_SITE: "lax",
      TRUST_PROXY: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", (chunk) => void (output += chunk));
  server.stderr?.on("data", (chunk) => void (output += chunk));
  server.once("exit", (code) => void (output += `\n[el servidor salió con código ${code}]`));

  const url = `http://localhost:${PORT}`;
  try {
    await waitForHealth(url, () => output);
  } catch (error) {
    server.kill();
    await recreateDatabase(admin, true);
    throw error;
  }

  return async () => {
    server.kill();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await recreateDatabase(admin, true);
  };
}
