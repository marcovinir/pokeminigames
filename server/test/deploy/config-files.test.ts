import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { loadEnv } from "../../src/config/env.js";

const root = new URL("../../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, root), "utf8");

type CiWorkflow = { permissions?: Record<string, string> };

type EnvVar = { key: string; value?: string; generateValue?: boolean; sync?: boolean };
type Service = {
  type: string;
  name: string;
  runtime: string;
  plan: string;
  branch: string;
  autoDeployTrigger: string;
  healthCheckPath: string;
  buildCommand: string;
  startCommand: string;
  envVars: EnvVar[];
};

const blueprint = parse(read("render.yaml")) as { services: Service[] };
const service = blueprint.services[0]!;
const ci = parse(read(".github/workflows/ci.yml")) as {
  on: { push: { branches: string[] }; pull_request: unknown };
  jobs: { test: { services: Record<string, { image: string }>; steps: Array<Record<string, unknown>> } };
};
const rootScripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;
const serverScripts = (JSON.parse(read("server/package.json")) as { scripts: Record<string, string> }).scripts;

describe("render.yaml", () => {
  it("define un único servicio web gratuito con comprobación de salud", () => {
    expect(blueprint.services).toHaveLength(1);
    expect(service).toMatchObject({
      type: "web",
      runtime: "node",
      plan: "free",
      branch: "main",
      autoDeployTrigger: "commit",
      healthCheckPath: "/health",
    });
  });

  it("construye, migra y siembra en ese orden, con scripts que existen", () => {
    const steps = service.buildCommand.split("&&").map((step) => step.trim());
    expect(steps).toEqual([
      "npm ci --include=dev",
      "npm run build",
      "npm run db:deploy -w server",
      "npm run db:seed:prod -w server",
    ]);
    expect(rootScripts.build).toBeDefined();
    expect(serverScripts["db:deploy"]).toBeDefined();
    expect(serverScripts["db:seed:prod"]).toBeDefined();
  });

  it("arranca el paquete que genera la construcción", () => {
    expect(service.startCommand).toBe("node server/dist/index.js");
    expect(serverScripts.start).toBe("node dist/index.js");
  });

  it("no guarda secretos: la base de datos se pide y la clave la genera Render", () => {
    const byKey = Object.fromEntries(service.envVars.map((variable) => [variable.key, variable]));
    expect(byKey.DATABASE_URL).toEqual({ key: "DATABASE_URL", sync: false });
    expect(byKey.JWT_ACCESS_SECRET).toEqual({ key: "JWT_ACCESS_SECRET", generateValue: true });
    expect(read("render.yaml")).not.toMatch(/postgres(ql)?:\/\//);
  });

  it("su configuración la acepta el servidor en producción", () => {
    const fromBlueprint = Object.fromEntries(
      service.envVars.filter((variable) => variable.value !== undefined).map((variable) => [variable.key, variable.value!]),
    );
    const env = loadEnv({
      ...fromBlueprint,
      DATABASE_URL: "postgresql://usuario:clave@ep-ejemplo.neon.tech/neondb?sslmode=require",
      JWT_ACCESS_SECRET: "s".repeat(48),
    });
    expect(env).toMatchObject({
      NODE_ENV: "production",
      COOKIE_SECURE: true,
      COOKIE_SAME_SITE: "lax",
      TRUST_PROXY: 3,
      CORS_ORIGIN: undefined,
    });
  });

  it("pide la misma versión de Node que el resto del proyecto", () => {
    const nodeVersion = service.envVars.find((variable) => variable.key === "NODE_VERSION")?.value;
    expect(nodeVersion).toBe(read(".node-version").trim());
  });
});

describe("flujo de CI", () => {
  const steps = ci.jobs.test.steps;
  const runs = steps.map((step) => String(step.run ?? ""));

  it("corre en cada push a main y en cada pull request, con PostgreSQL 18", () => {
    expect(ci.on.push.branches).toEqual(["main"]);
    expect(ci.on.pull_request).toBeDefined();
    expect(ci.jobs.test.services.postgres?.image).toBe("postgres:18");
  });

  it("el token del flujo solo puede leer el contenido del repositorio", () => {
    expect((ci as CiWorkflow).permissions).toEqual({ contents: "read" });
  });

  it("usa la misma versión de Node que el proyecto", () => {
    const setupNode = steps.find((step) => String(step.uses ?? "").startsWith("actions/setup-node"));
    const configured = (setupNode?.with as { "node-version": number | string }) ["node-version"];
    expect(String(configured)).toBe(read(".node-version").trim());
  });

  it("comprueba tipos, pruebas, construcción y E2E, en ese orden", () => {
    const order = ["npm run typecheck", "npm test", "npm run build", "npm run e2e -w e2e"].map((command) =>
      runs.findIndex((run) => run.trim() === command),
    );
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("instala Chromium antes de la prueba E2E y guarda el informe si falla", () => {
    expect(runs.findIndex((run) => run.includes("playwright install"))).toBeLessThan(
      runs.findIndex((run) => run.trim() === "npm run e2e -w e2e"),
    );
    const upload = steps.find((step) => String(step.uses ?? "").startsWith("actions/upload-artifact"));
    expect(upload?.if).toBe("failure()");
  });

  it("crea la base de datos de las pruebas del servidor con la configuración de server/.env.test.example", () => {
    const setup = runs.find((run) => run.includes("server/.env.test")) ?? "";
    const example = read("server/.env.test.example");
    for (const key of ["NODE_ENV", "DATABASE_URL", "JWT_ACCESS_SECRET", "BCRYPT_COST"]) {
      expect(example).toContain(`${key}=`);
      expect(setup).toContain(`${key}=`);
    }
    expect(setup).toContain("createdb pokemon_minigames_test");
  });
});

describe("documentación de despliegue", () => {
  const guide = read("docs/despliegue.md");

  it("explica cada variable de entorno del Blueprint", () => {
    for (const variable of service.envVars) expect(guide).toContain(`\`${variable.key}\``);
  });

  it("no incluye cadenas de conexión con claves reales", () => {
    const connections = guide.match(/postgres(?:ql)?:\/\/\S+/g) ?? [];
    expect(connections.length).toBeGreaterThan(0);
    for (const connection of connections) expect(connection).toMatch(/usuario:clave@/);
  });

  it("la guía lista todos los métodos que comprueba el origen y no promete un aviso que no aparece en el arranque en frío", () => {
    expect(guide).toMatch(/`POST`, `PUT`, `PATCH` y `DELETE`/);
    expect(guide).not.toMatch(/el cliente muestra "El servidor se está despertando…" mientras tanto/);
    expect(guide).toMatch(/el navegador se queda cargando/);
  });

  it("la guía manda comprobar TRUST_PROXY tras el primer despliegue, con las dos pruebas (valor demasiado alto y demasiado bajo)", () => {
    expect(guide).toMatch(/Verificar `TRUST_PROXY`/);
    expect(guide).toMatch(/X-Forwarded-For/);
    expect(guide).toMatch(/401 401 401 401 401 429/);
    expect(guide).toMatch(/otra red/);
    expect(read("render.yaml")).not.toMatch(/en Render, 1/);
  });

  it("el README enlaza la guía y .env.example documenta TRUST_PROXY", () => {
    expect(read("README.md")).toContain("docs/despliegue.md");
    expect(read("server/.env.example")).toContain("TRUST_PROXY");
  });

  it("existe el archivo de versión de Node que lee Render", () => {
    expect(existsSync(new URL(".node-version", root))).toBe(true);
  });
});
