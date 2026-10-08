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

/** Las variables del Blueprint que traen valor (las demás las pide Render o las genera). */
const fromBlueprint = (): Record<string, string> =>
  Object.fromEntries(service.envVars.filter((variable) => variable.value !== undefined).map((variable) => [variable.key, variable.value!]));
/** Lo que Render completa en el panel: la base de datos y la clave de sesión. */
const placeholders = {
  DATABASE_URL: "postgresql://usuario:clave@ep-ejemplo.neon.tech/neondb?sslmode=require",
  JWT_ACCESS_SECRET: "s".repeat(48),
};

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

  it("pide la clave de Resend y el remitente en el panel, sin valor, y deja el interruptor y el proveedor para el panel", () => {
    const byKey = Object.fromEntries(service.envVars.map((variable) => [variable.key, variable]));
    expect(byKey.RESEND_API_KEY).toEqual({ key: "RESEND_API_KEY", sync: false });
    expect(byKey.MAIL_FROM).toEqual({ key: "MAIL_FROM", sync: false });
    // Se ponen desde el panel de Render (docs/correo.md): si el Blueprint los fijara, una sincronización podría devolver
    // EMAIL_VERIFICATION a «off» sin que nadie lo note.
    expect(byKey.EMAIL_VERIFICATION).toBeUndefined();
    expect(byKey.MAIL_PROVIDER).toBeUndefined();
  });

  it("su configuración la acepta el servidor en producción, con el correo apagado", () => {
    const env = loadEnv({ ...fromBlueprint(), ...placeholders });
    expect(env).toMatchObject({
      NODE_ENV: "production",
      COOKIE_SECURE: true,
      COOKIE_SAME_SITE: "lax",
      TRUST_PROXY: 2,
      CORS_ORIGIN: undefined,
      EMAIL_VERIFICATION: false,
      MAIL_PROVIDER: undefined,
    });
  });

  it("sigue arrancando si en el panel de Render quedan en blanco las variables que el Blueprint pide sin valor", () => {
    const env = loadEnv({ ...fromBlueprint(), ...placeholders, RESEND_API_KEY: "", MAIL_FROM: "" });
    expect(env.EMAIL_VERIFICATION).toBe(false);
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.MAIL_FROM).toBeUndefined();
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

  it("la guía explica las variables del correo y enlaza la guía para activarlo y desactivarlo", () => {
    for (const variable of ["EMAIL_VERIFICATION", "MAIL_PROVIDER", "RESEND_API_KEY", "MAIL_FROM"]) expect(guide).toContain(`\`${variable}\``);
    expect(guide).toContain("(correo.md)");
    // Ya existen la verificación y la recuperación por correo (apagadas hasta que se activan).
    expect(guide).not.toMatch(/recuperación de contraseña por correo ni verificación de correo/);
  });

  it("el README enlaza las guías y .env.example documenta TRUST_PROXY y las variables del correo", () => {
    const readme = read("README.md");
    expect(readme).toContain("docs/despliegue.md");
    expect(readme).toContain("docs/correo.md");
    const example = read("server/.env.example");
    for (const variable of ["TRUST_PROXY", "EMAIL_VERIFICATION", "MAIL_PROVIDER", "RESEND_API_KEY", "MAIL_FROM"]) expect(example).toContain(variable);
  });

  it("el README documenta las rutas nuevas de las cuentas", () => {
    const readme = read("README.md");
    for (const route of ["/auth/options", "/auth/verify-email", "/auth/verification/resend", "/auth/password/forgot", "/auth/password/reset"]) {
      expect(readme).toContain(route);
    }
  });

  it("existe el archivo de versión de Node que lee Render", () => {
    expect(existsSync(new URL(".node-version", root))).toBe(true);
  });
});

describe("guía del correo (docs/correo.md)", () => {
  // Se lee dentro de cada prueba: si el archivo no existe, falla esa prueba y no todo el archivo.
  const guide = (): string => read("docs/correo.md");
  /** El valor de una fila «| `VARIABLE` | `valor` | …» de la tabla de variables de Render. */
  const valueOf = (variable: string): string | undefined => new RegExp("\\| `" + variable + "` \\| `([^`]+)` \\|").exec(guide())?.[1];

  it("recorre el camino completo: dominio, Resend, registros DNS, clave de solo envío, variables de Render, prueba real y marcha atrás", () => {
    for (const piece of ["Resend", "dominio", "SPF", "DKIM", "DMARC", "Sending access", "carpeta de spam", "Marcha atrás"]) {
      expect(guide(), `falta «${piece}»`).toContain(piece);
    }
  });

  it("la clave solo se pega en el panel de Render y la guía no trae ninguna", () => {
    expect(guide()).toMatch(/solo se pega en el panel de Render/);
    expect(guide()).not.toMatch(/re_[A-Za-z0-9_]{20,}/);
  });

  it("los valores que manda poner en Render los acepta el servidor en producción", () => {
    const env = loadEnv({
      ...fromBlueprint(),
      ...placeholders,
      EMAIL_VERIFICATION: valueOf("EMAIL_VERIFICATION"),
      MAIL_PROVIDER: valueOf("MAIL_PROVIDER"),
      MAIL_FROM: valueOf("MAIL_FROM"),
      RESEND_API_KEY: "re_clave_de_prueba",
    });
    expect(env).toMatchObject({ EMAIL_VERIFICATION: true, MAIL_PROVIDER: "resend" });
    expect(env.MAIL_FROM).toMatch(/<[^<>@]+@[^<>@]+>$/);
  });

  it("explica la marcha atrás: EMAIL_VERIFICATION a off", () => {
    expect(guide()).toContain("`EMAIL_VERIFICATION` a `off`");
  });
});
