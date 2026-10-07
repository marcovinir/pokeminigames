# Pokémon Minigames — Etapa 5: Despliegue, seguridad y pruebas E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar el juego desplegable gratis en Render + Neon como un solo servicio, endurecido para estar expuesto a internet (cookie segura, comprobación de origen, límites de intentos y de peticiones), con una prueba E2E de dos navegadores reales, una prueba de humo contra la URL desplegada y CI en GitHub Actions.

**Architecture:** Express sirve la API, Socket.io y el cliente construido desde un solo origen (`createClientApp`); en producción no hay CORS y la cookie es `Secure` + `SameSite=Lax`. Dos middlewares nuevos protegen la API: `createOriginCheck` (rechaza con 403 las peticiones que cambian algo y vienen de otro sitio) y un limitador de ventana deslizante con claves (`createKeyedLimiter`) aplicado al login, al registro y a toda la API. El servidor se empaqueta con esbuild en un solo archivo, cierra ordenadamente con `SIGTERM` y tiene un pool de conexiones afinado para Neon, que se apaga solo. Un workspace `e2e/` (Playwright) levanta el servidor de producción contra su propia base de datos y juega una partida completa.

**Tech Stack:** Sin cambios en el juego: Node 24, TypeScript 7, Express 5, Socket.io 4.8, Prisma 7.10.0, PostgreSQL 18, Zod 4, Vitest 5, React 19. Nuevos: esbuild (empaquetado), Playwright (E2E), `yaml` (prueba de los archivos de configuración).

**Spec:** `docs/superpowers/specs/2026-10-03-etapa-5-despliegue-design.md` (complementa la general y las de las etapas 2 a 4; donde la de la etapa 5 es más específica, manda).

## Global Constraints

- Un solo servicio y un solo origen: Express sirve la API, Socket.io y `client/dist`. Sin Docker. Costo de operación nulo (Render gratuito sin tarjeta + Neon gratuito).
- Con `NODE_ENV=production` el servidor se niega a arrancar si `COOKIE_SECURE` no es `true`, si `COOKIE_SAME_SITE` es `none` o si falta `TRUST_PROXY` (entero de 0 a 10; en Render se parte de `1` y se verifica tras el primer despliegue). `CORS_ORIGIN` es opcional: sin él no se instala CORS.
- Las peticiones `POST`, `PUT`, `PATCH` y `DELETE` con un `Origin` ajeno (o, sin `Origin`, con `Sec-Fetch-Site` de `cross-site` o `same-site`) se rechazan con `403` y el código `FORBIDDEN`. Los `GET` no se comprueban.
- Límites en memoria (una sola instancia) que responden `429` con `RATE_LIMITED`, `details.retryAfterSeconds` y `Retry-After`: login, 5 intentos **fallidos** en 15 minutos por IP y correo (un login correcto reinicia la cuenta; no es un bloqueo por cuenta) y 30 por IP sumando todos los correos; el intento se reserva antes de comprobar la contraseña; registro, 5 por hora por IP; API, 300 por minuto por IP. `/health` y `/socket.io` no pasan por el límite general.
- Los archivos con hash (`/assets/*`) llevan `Cache-Control: public, max-age=31536000, immutable`; `index.html` y el resto, `no-cache`. Ninguna ruta de la API, `/health` ni `/socket.io` devuelve nunca `index.html`.
- Sin Helmet ni CSP, sin dependencias de producción nuevas. Mensajes al usuario en español; identificadores de código en inglés.
- Las credenciales de PostgreSQL, la cadena de Neon y los secretos nunca se versionan (`server/.env`, `server/.env.test` siguen ignorados). `render.yaml` no contiene ningún secreto.
- Se sigue TDD: cada comportamiento se prueba antes de implementarlo.
- Versiones: `prisma`, `@prisma/client` y `@prisma/adapter-pg` siguen fijadas en **7.10.0**. No ejecutes `npm audit fix --force`.

## Review Focus

Condiciones que la spec no detalla pero que muerden a una persona real; cada una tiene su prueba en la tarea indicada.

1. **Los límites no se vuelven contra personas inocentes.** Solo cuentan los inicios de sesión fallidos y cada correo y cada IP tienen su propia cuenta (quien escribe el correo de otra persona no la deja fuera); un correo que no existe cuenta igual (no se puede averiguar si existe); mayúsculas y espacios del correo no sirven para esquivar el límite; un cuerpo inválido no cuenta; insistir bloqueado no alarga el bloqueo; diez intentos fallidos lanzados a la vez no esquivan el límite; una sola IP no puede probar una contraseña en muchas cuentas; `/health` no se bloquea; lo vencido se limpia solo. → Task 3 (`rate-limit.test.ts`) y Task 4 (`limits.routes.test.ts`).
2. **La comprobación de origen no se esquiva ni rompe a nadie.** Cada método que cambia algo, `Origin` con otro esquema o puerto, el origen opaco `null`, `Sec-Fetch-Site` sin `Origin`, el `Origin` que manda sobre `Sec-Fetch-Site`, `refresh` y `logout` con cookie desde otro sitio, y detrás del proxy de Render (HTTPS) el propio origen sigue siendo válido; sin proxy de confianza un cliente no puede fingir el protocolo. → Task 2.
3. **El cliente servido no tapa nada.** Las pantallas (`/perfil`, `/sala/ABC234`, con parámetros) devuelven el cliente; un archivo que no existe (`/assets/viejo.js`) da 404 en JSON y no un HTML donde se esperaba JavaScript; ninguna ruta de la API ni de Socket.io cae en el cliente; un `POST` a una pantalla da 404; nada de fuera de `dist` se sirve; sin cliente construido todo sigue como antes. → Task 5.
4. **Producción se niega a arrancar mal configurada y lo dice.** Cada combinación insegura, todos los problemas a la vez, sin CORS comodín; el archivo empaquetado arranca con `node`, carga el catálogo y aplica las protecciones. → Task 1, Task 7 y Task 11 (el `render.yaml` real pasa la validación de producción).
5. **La capa gratuita se duerme y se despierta.** Una conexión cortada por la base de datos no tira el servidor y la siguiente consulta funciona; `SIGTERM` cierra ordenadamente y, si algo no cierra, sale a los 10 s; la pantalla de carga avisa a los 5 s de que el servidor se está despertando; un `429` se muestra en español con la espera; la prueba de humo insiste hasta que el servicio despierta. → Task 6, Task 8 y Task 10.

---

## File Structure

```
pokemon-minigames/
├── render.yaml  .node-version  docs/despliegue.md  .github/workflows/ci.yml        # NUEVOS (Task 11)
├── shared/src/errors.ts                          # FORBIDDEN
├── server/
│   ├── scripts/ build.ts  smoke-deployed.ts      # NUEVOS: empaquetado y prueba de humo
│   ├── src/
│   │   ├── config/env.ts                         # reglas de producción, TRUST_PROXY, CORS opcional
│   │   ├── http/ origin-check.ts  rate-limit.ts  limits.ts  api-paths.ts  client-app.ts   # NUEVOS
│   │   ├── auth/auth.routes.ts                   # límites de login y registro
│   │   ├── db/prisma.ts  shutdown.ts             # pool afinado; cierre ordenado (shutdown.ts NUEVO)
│   │   └── app.ts  index.ts  realtime/server.ts  # composición
│   └── test/ config/  http/  auth/  db/  bundle/  scripts/  deploy/  shutdown.test.ts
├── client/
│   ├── src/ components/LoadingScreen.tsx  i18n/es.ts  pages/AuthForm.tsx  routes.tsx
│   └── test/ components/loading-screen.test.tsx  i18n/rate-limit.test.ts  pages/auth-rate-limit.test.tsx
└── e2e/                                          # NUEVO workspace de Playwright
    ├── playwright.config.ts  global-setup.ts  package.json  tsconfig.json
    ├── support/app.ts                            # ayudantes: registrarse, crear sala, responder
    └── tests/ game  reload  theme  login-limit (.spec.ts)
```

Cada pieza nueva de `server/src/http/` hace una sola cosa y no conoce a las demás: el limitador no sabe de Express ni de login, la comprobación de origen no sabe de límites, y `client-app.ts` solo sirve archivos. `app.ts` es el único sitio donde se componen.

## Notas de entorno (leer antes de empezar)

- Se parte de `main` con las etapas 1 a 4 completas (879 pruebas: 487 de servidor y 392 de cliente). Trabaja en una rama `etapa-5-despliegue`.
- `server/.env` y `server/.env.test` ya existen (rol `pokemon_app`). Las pruebas del servidor usan `pokemon_minigames_test` y **borran datos**.
- Todo el código de este plan se ejecutó antes de incluirlo, tarea por tarea, en un clon limpio de `main`: 620 pruebas de servidor y 423 de cliente en verde (más una de servidor que se omite en Windows), `tsc` sin errores, la construcción de producción arrancada contra una base de datos real y la E2E con navegador real (4 pruebas).
- Si el equipo va justo de CPU, las pruebas de interfaz del cliente pueden agotar los 5 s por defecto: ejecútalas con `npx vitest run --testTimeout=30000 --maxWorkers=2` desde `client/` (no hace falta cambiar nada en el repositorio).
- **La E2E necesita un navegador.** Con Chromium propio de Playwright: `npx playwright install chromium` desde `e2e/` (descarga unos 150 MB). Sin descargar nada, usa el que ya tienes: `E2E_CHANNEL=msedge` o `E2E_CHANNEL=chrome` (en PowerShell: `$env:E2E_CHANNEL="msedge"`). Crea y borra su propia base `pokemon_minigames_e2e` con la conexión de `server/.env` (o `E2E_ADMIN_DATABASE_URL`); el rol necesita permiso `CREATEDB`.
- Crear las cuentas de Render y Neon y conectar el repositorio lo hace Marco (Task 12 deja la guía lista); nada de este plan las crea.
- npm 12 bloquea los scripts de instalación de algunas dependencias y lo avisa: es normal.
- Tareas que añaden dependencias de desarrollo (esbuild en la 7, Playwright en la 9, `yaml` en la 11): el comando `npm install` va en su paso de implementación; `package-lock.json` se actualiza solo y se incluye en el commit.

---

### Task 1: Configuración de producción

**Files:**
- Modify: `server/src/config/env.ts`, `server/src/app.ts`, `server/src/realtime/server.ts`
- Create (prueba): `server/test/config/cors.test.ts`
- Test (modificar): `server/test/config/env.test.ts`

**Interfaces:**
- `loadEnv(source)` ya existe. Cambia: `CORS_ORIGIN` pasa a `string | undefined` (por defecto `http://localhost:5173` fuera de producción; en producción, sin definir, queda `undefined`); aparece `TRUST_PROXY: number` (0 a 10, por defecto 0). Con `NODE_ENV=production` falla, nombrando todos los problemas a la vez, si `COOKIE_SECURE` no es `true`, si `COOKIE_SAME_SITE` es `none` o si no se define `TRUST_PROXY`.
- `createApp` solo instala CORS si hay `CORS_ORIGIN` (con un solo origen no hay otros orígenes a los que conceder nada); `attachRealtime` solo pone `cors` en Socket.io si lo hay.

- [ ] **Step 1: Escribir las pruebas que fallan**

`server/test/config/env.test.ts` (reglas de producción y `TRUST_PROXY`):

```diff
diff --git a/server/test/config/env.test.ts b/server/test/config/env.test.ts
index 8c765e3..0bbb929 100644
--- a/server/test/config/env.test.ts
+++ b/server/test/config/env.test.ts
@@ -6,6 +6,63 @@ const valid = {
   JWT_ACCESS_SECRET: "x".repeat(32),
 };
 
+const production = { ...valid, NODE_ENV: "production", COOKIE_SECURE: "true", TRUST_PROXY: "1" };
+
+describe("loadEnv en producción", () => {
+  it("acepta una configuración segura y completa", () => {
+    const env = loadEnv(production);
+    expect(env).toMatchObject({ NODE_ENV: "production", COOKIE_SECURE: true, COOKIE_SAME_SITE: "lax", TRUST_PROXY: 1 });
+  });
+
+  it("no inventa un CORS_ORIGIN: con un solo origen no hay CORS que configurar", () => {
+    expect(loadEnv(production).CORS_ORIGIN).toBeUndefined();
+    expect(loadEnv({ ...production, CORS_ORIGIN: "https://juego.example" }).CORS_ORIGIN).toBe("https://juego.example");
+  });
+
+  it("exige la cookie segura", () => {
+    expect(() => loadEnv({ ...production, COOKIE_SECURE: "false" })).toThrow(/COOKIE_SECURE/);
+    expect(() => loadEnv({ ...valid, NODE_ENV: "production", TRUST_PROXY: "1" })).toThrow(/COOKIE_SECURE/);
+  });
+
+  it("rechaza SameSite=none (con un solo origen no hace falta)", () => {
+    expect(() => loadEnv({ ...production, COOKIE_SAME_SITE: "none" })).toThrow(/COOKIE_SAME_SITE/);
+    expect(loadEnv({ ...production, COOKIE_SAME_SITE: "strict" }).COOKIE_SAME_SITE).toBe("strict");
+  });
+
+  it("exige decir cuántos proxies hay delante (si no, todas las IP serían la del proxy)", () => {
+    const { TRUST_PROXY: _omitted, ...withoutProxy } = production;
+    expect(() => loadEnv(withoutProxy)).toThrow(/TRUST_PROXY/);
+  });
+
+  it("nombra todos los problemas a la vez", () => {
+    const { TRUST_PROXY: _omitted, ...withoutProxy } = production;
+    let message = "";
+    try {
+      loadEnv({ ...withoutProxy, COOKIE_SECURE: "false", COOKIE_SAME_SITE: "none" });
+    } catch (error) {
+      message = String(error);
+    }
+    expect(message).toMatch(/COOKIE_SECURE/);
+    expect(message).toMatch(/COOKIE_SAME_SITE/);
+    expect(message).toMatch(/TRUST_PROXY/);
+  });
+});
+
+describe("TRUST_PROXY", () => {
+  it("fuera de producción es 0 si no se dice nada", () => {
+    expect(loadEnv(valid).TRUST_PROXY).toBe(0);
+  });
+
+  it("acepta de 0 a 10 proxies", () => {
+    expect(loadEnv({ ...valid, TRUST_PROXY: "0" }).TRUST_PROXY).toBe(0);
+    expect(loadEnv({ ...valid, TRUST_PROXY: "10" }).TRUST_PROXY).toBe(10);
+  });
+
+  it.each(["-1", "11", "1.5", "abc", "true"])("rechaza %s", (value) => {
+    expect(() => loadEnv({ ...valid, TRUST_PROXY: value })).toThrow(/TRUST_PROXY/);
+  });
+});
+
 describe("loadEnv", () => {
   it("aplica los valores por defecto", () => {
     const env = loadEnv(valid);
```

`server/test/config/cors.test.ts` (sin `CORS_ORIGIN` el servidor no concede CORS a nadie; con él, solo a ese origen):

```ts
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { prisma } from "../helpers/db.js";

afterAll(() => prisma.$disconnect());

const production = { NODE_ENV: "production", COOKIE_SECURE: "true", TRUST_PROXY: "1" };

describe("CORS según el entorno", () => {
  it("en desarrollo concede CORS al origen del cliente (comportamiento de siempre)", async () => {
    const app = buildTestApp();
    const response = await request(app).get("/health").set("Origin", "http://localhost:5173");
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("en producción sin CORS_ORIGIN no se concede CORS a nadie (ni con comodín)", async () => {
    const app = buildTestApp(production);
    for (const origin of ["http://localhost:5173", "https://malicioso.example"]) {
      const response = await request(app).get("/health").set("Origin", origin);
      expect(response.status).toBe(200);
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    }
  });

  it("en producción con CORS_ORIGIN se concede solo a ese origen", async () => {
    const app = buildTestApp({ ...production, CORS_ORIGIN: "https://juego.example" });
    const allowed = await request(app).get("/health").set("Origin", "https://juego.example");
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://juego.example");
    const other = await request(app).get("/health").set("Origin", "https://otro.example");
    expect(other.headers["access-control-allow-origin"]).not.toBe("https://otro.example");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
git switch -c etapa-5-despliegue
npm test -w server -- test/config
```

Expected: FAIL — `TRUST_PROXY` no existe en `Env`, producción acepta `COOKIE_SECURE=false` y, sin `CORS_ORIGIN`, el servidor sigue concediendo CORS a `http://localhost:5173` (el valor por defecto).

- [ ] **Step 3: Implementar**

`server/src/config/env.ts`:

```diff
diff --git a/server/src/config/env.ts b/server/src/config/env.ts
index aa3d455..11637ff 100644
--- a/server/src/config/env.ts
+++ b/server/src/config/env.ts
@@ -9,7 +9,10 @@ const envSchema = z
     ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
     REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
     BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
-    CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
+    // Con un solo origen (producción) no hay CORS que configurar; en desarrollo el valor por defecto es Vite.
+    CORS_ORIGIN: z.string().min(1).optional(),
+    // Cuántos proxies hay delante del servidor (en Render se verifica tras desplegar): sin eso la IP y el protocolo que se leen son los del proxy.
+    TRUST_PROXY: z.coerce.number().int().min(0).max(10).optional(),
     COOKIE_SECURE: z
       .enum(["true", "false"])
       .default("false")
@@ -19,7 +22,19 @@ const envSchema = z
   .refine((env) => env.COOKIE_SAME_SITE !== "none" || env.COOKIE_SECURE, {
     message: "COOKIE_SAME_SITE=none exige COOKIE_SECURE=true",
     path: ["COOKIE_SAME_SITE"],
-  });
+  })
+  .superRefine((env, context) => {
+    if (env.NODE_ENV !== "production") return;
+    const problem = (path: string, message: string) => context.addIssue({ code: "custom", path: [path], message });
+    if (!env.COOKIE_SECURE) problem("COOKIE_SECURE", "en producción debe ser true");
+    if (env.COOKIE_SAME_SITE === "none") problem("COOKIE_SAME_SITE", "en producción no puede ser none (cliente y API comparten origen)");
+    if (env.TRUST_PROXY === undefined) problem("TRUST_PROXY", "en producción es obligatoria (cuántos proxies hay delante; en Render, se verifica según docs/despliegue.md)");
+  })
+  .transform((env) => ({
+    ...env,
+    CORS_ORIGIN: env.CORS_ORIGIN ?? (env.NODE_ENV === "production" ? undefined : "http://localhost:5173"),
+    TRUST_PROXY: env.TRUST_PROXY ?? 0,
+  }));
 
 export type Env = z.infer<typeof envSchema>;
```

`server/src/app.ts` (CORS solo si hay origen configurado):

```diff
diff --git a/server/src/app.ts b/server/src/app.ts
index ebdf6e2..184f895 100644
--- a/server/src/app.ts
+++ b/server/src/app.ts
@@ -34,7 +34,8 @@ export function createApp({ env, prisma, tokens, roomManager, catalog }: AppDeps
 
   const app = express();
   app.disable("x-powered-by");
-  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
+  // Sin CORS_ORIGIN (producción, un solo origen) no se instala CORS: no hay otros orígenes a los que conceder nada.
+  if (env.CORS_ORIGIN) app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
   app.use(express.json({ limit: "10kb" }));
   app.use(cookieParser());
```

`server/src/realtime/server.ts`:

```diff
diff --git a/server/src/realtime/server.ts b/server/src/realtime/server.ts
index 28ced7e..725d7f8 100644
--- a/server/src/realtime/server.ts
+++ b/server/src/realtime/server.ts
@@ -29,7 +29,7 @@ export type GameIoServer = Server<ClientToServerEvents, ServerToClientEvents, Re
 /** Monta Socket.io sobre el servidor HTTP. Cada evento se valida y se delega en la sala. */
 export function attachRealtime(httpServer: HttpServer, deps: RealtimeDeps): GameIoServer {
   const io: GameIoServer = new Server(httpServer, {
-    cors: { origin: deps.env.CORS_ORIGIN, credentials: true },
+    cors: deps.env.CORS_ORIGIN ? { origin: deps.env.CORS_ORIGIN, credentials: true } : undefined,
   });
 
   io.use((socket, next) => {
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w server -- test/config
npm run typecheck
```

Expected: PASS (22 pruebas) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): configuración de producción obligatoria (cookie segura, TRUST_PROXY) y CORS opcional" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Comprobación de origen

**Files:**
- Create: `server/src/http/origin-check.ts`, `server/test/http/origin-check.test.ts`, `server/test/auth/origin.test.ts`
- Modify: `shared/src/errors.ts`, `client/src/i18n/es.ts`, `server/src/app.ts`
- Test (modificar): `client/test/i18n/es.test.ts`

**Interfaces:**
- Consumes: `Env.CORS_ORIGIN` y `Env.TRUST_PROXY` (Task 1), `AppError` (`server/src/http/errors.ts`).
- Produces: `createOriginCheck({ allowedOrigins: readonly string[] }): RequestHandler` — pasa los `GET`; en `POST`, `PUT`, `PATCH` y `DELETE` acepta un `Origin` igual al propio (`${req.protocol}://${req.get("host")}`) o presente en `allowedOrigins`, y rechaza cualquier otro (incluido `"null"`) con `AppError(403, "FORBIDDEN")`; sin `Origin` rechaza `Sec-Fetch-Site: cross-site` y `same-site` y deja pasar el resto.
- Produces: el código de error `"FORBIDDEN"` en `shared/` y su mensaje en el cliente (`Record<ErrorCode, string>` obliga a traducirlo en la misma tarea). `createApp` activa `app.set("trust proxy", env.TRUST_PROXY)` y el middleware tras `cookieParser`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`server/test/http/origin-check.test.ts` (la comprobación aislada, método por método y cabecera por cabecera):

```ts
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
```

`server/test/auth/origin.test.ts` (la aplicación entera: registro, login, refresh y logout con cookie desde otro sitio, salas, y detrás del proxy de Render):

```ts
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { prisma, resetDatabase } from "../helpers/db.js";

const app = buildTestApp({ NODE_ENV: "production", COOKIE_SECURE: "true", TRUST_PROXY: "1" });
const ash = { email: "ash@example.com", username: "ash", password: "pikachu-123" };
const HOST = "juego.example";
const own = `http://${HOST}`;
const evil = "https://malicioso.example";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

const asBrowser = (origin: string) => ({ Host: HOST, Origin: origin });

describe("el cierre de la brecha CSRF en las rutas reales", () => {
  it("registro e inicio de sesión desde otro sitio se rechazan; desde el propio origen funcionan", async () => {
    const blocked = await request(app).post("/auth/register").set(asBrowser(evil)).send(ash);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("FORBIDDEN");
    const registered = await request(app).post("/auth/register").set(asBrowser(own)).send(ash);
    expect(registered.status).toBe(201);
    expect((await request(app).post("/auth/login").set(asBrowser(evil)).send({ email: ash.email, password: ash.password })).status).toBe(403);
    expect((await request(app).post("/auth/login").set(asBrowser(own)).send({ email: ash.email, password: ash.password })).status).toBe(200);
  });

  it("refresh y logout con la cookie de sesión desde otro sitio se rechazan y la sesión sigue viva", async () => {
    const registered = await request(app).post("/auth/register").set(asBrowser(own)).send(ash);
    const cookie = ((registered.headers["set-cookie"] ?? []) as unknown as string[]).find((c) => c.startsWith("refresh_token="))!.split(";")[0]!;

    expect((await request(app).post("/auth/refresh").set(asBrowser(evil)).set("Cookie", cookie)).status).toBe(403);
    expect((await request(app).post("/auth/logout").set(asBrowser(evil)).set("Cookie", cookie)).status).toBe(403);
    // La cookie no se gastó ni se revocó: sigue sirviendo desde el propio origen.
    expect((await request(app).post("/auth/refresh").set(asBrowser(own)).set("Cookie", cookie)).status).toBe(200);
  });

  it("crear una sala desde otro sitio se rechaza", async () => {
    const registered = await request(app).post("/auth/register").set(asBrowser(own)).send(ash);
    const token = registered.body.accessToken as string;
    const body = { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3 };
    const blocked = await request(app).post("/rooms").set(asBrowser(evil)).set("Authorization", `Bearer ${token}`).send(body);
    expect(blocked.status).toBe(403);
    const allowed = await request(app).post("/rooms").set(asBrowser(own)).set("Authorization", `Bearer ${token}`).send(body);
    expect(allowed.status).toBe(201);
  });

  it("detrás del proxy de Render (HTTPS) el propio origen es el https", async () => {
    const proxied = (origin: string) => ({ Host: HOST, Origin: origin, "X-Forwarded-Proto": "https" });
    expect((await request(app).post("/auth/register").set(proxied(`https://${HOST}`)).send(ash)).status).toBe(201);
    expect((await request(app).post("/auth/login").set(proxied(own)).send({ email: ash.email, password: ash.password })).status).toBe(403);
  });
});
```

`client/test/i18n/es.test.ts`:

```diff
diff --git a/client/test/i18n/es.test.ts b/client/test/i18n/es.test.ts
index 81cec6b..946ba51 100644
--- a/client/test/i18n/es.test.ts
+++ b/client/test/i18n/es.test.ts
@@ -48,6 +48,11 @@ describe("textos del historial", () => {
 });
 
 describe("mensajes de error", () => {
+  it("una petición de otro origen tiene su propio mensaje, no el genérico", () => {
+    expect(errorMessage("FORBIDDEN")).toBe("Esa petición no está permitida desde este sitio.");
+    expect(errorMessage("FORBIDDEN")).not.toBe(errorMessage("INTERNAL_ERROR"));
+  });
+
   it("un jugador inexistente tiene su propio mensaje, no el genérico", () => {
     expect(errorMessage("USER_NOT_FOUND")).toBe("No encontramos a ese jugador.");
     expect(errorMessage("USER_NOT_FOUND")).not.toBe(errorMessage("INTERNAL_ERROR"));
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w server -- test/http/origin-check.test.ts test/auth/origin.test.ts
npm test -w client -- test/i18n/es.test.ts
```

Expected: FAIL — no existe `src/http/origin-check.ts`, y el código `FORBIDDEN` no existe en `shared/`.

- [ ] **Step 3: Implementar**

`shared/src/errors.ts`:

```diff
diff --git a/shared/src/errors.ts b/shared/src/errors.ts
index 71960f6..e36a90c 100644
--- a/shared/src/errors.ts
+++ b/shared/src/errors.ts
@@ -5,6 +5,7 @@ export const ERROR_CODES = [
   "USERNAME_TAKEN",
   "INVALID_CREDENTIALS",
   "UNAUTHORIZED",
+  "FORBIDDEN",
   "INVALID_REFRESH_TOKEN",
   "NOT_FOUND",
   "USER_NOT_FOUND",
```

`server/src/http/origin-check.ts`:

```ts
import type { RequestHandler } from "express";
import { AppError } from "./errors.js";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface OriginCheckOptions {
  /** Orígenes adicionales aceptados (p. ej. el cliente de desarrollo). El propio servidor siempre se acepta. */
  allowedOrigins: readonly string[];
}

/**
 * Defensa contra CSRF además de `SameSite=Lax`: una petición que cambia algo se rechaza si el navegador dice que viene
 * de otro sitio. Con `Origin` manda ese: tiene que ser el propio servidor (o uno permitido). Sin él (curl, pruebas, el
 * cliente en desarrollo por el proxy de Vite) se mira `Sec-Fetch-Site`. Los `GET` no se tocan.
 * El propio origen se calcula con el protocolo y el `Host` que ve el servidor (con `trust proxy`, el del proxy).
 */
export function createOriginCheck({ allowedOrigins }: OriginCheckOptions): RequestHandler {
  const forbidden = () => new AppError(403, "FORBIDDEN", "Origen no permitido");
  return (req, _res, next) => {
    if (!UNSAFE_METHODS.has(req.method)) return next();

    const origin = req.get("origin");
    if (origin !== undefined) {
      const own = `${req.protocol}://${req.get("host")}`;
      return origin === own || allowedOrigins.includes(origin) ? next() : next(forbidden());
    }

    const site = req.get("sec-fetch-site");
    return site === "cross-site" || site === "same-site" ? next(forbidden()) : next();
  };
}
```

`client/src/i18n/es.ts`:

```diff
diff --git a/client/src/i18n/es.ts b/client/src/i18n/es.ts
index 910a9f2..7f4cff6 100644
--- a/client/src/i18n/es.ts
+++ b/client/src/i18n/es.ts
@@ -29,6 +29,7 @@ const ERROR_MESSAGES: Record<ErrorCode | typeof NETWORK_ERROR, string> = {
   USERNAME_TAKEN: "Ese nombre de usuario ya está en uso.",
   INVALID_CREDENTIALS: "Email o contraseña incorrectos.",
   UNAUTHORIZED: "Tu sesión expiró. Inicia sesión de nuevo.",
+  FORBIDDEN: "Esa petición no está permitida desde este sitio.",
   INVALID_REFRESH_TOKEN: "Tu sesión expiró. Inicia sesión de nuevo.",
   NOT_FOUND: "No encontramos lo que buscas.",
   USER_NOT_FOUND: "No encontramos a ese jugador.",
```

`server/src/app.ts` (confianza en el proxy y el middleware):

```diff
diff --git a/server/src/app.ts b/server/src/app.ts
index 184f895..5f563f0 100644
--- a/server/src/app.ts
+++ b/server/src/app.ts
@@ -11,6 +11,7 @@ import type { Env } from "./config/env.js";
 import type { PrismaClient } from "./db/prisma.js";
 import type { RoomManager } from "./game/room-manager.js";
 import { errorHandler, notFoundHandler } from "./http/errors.js";
+import { createOriginCheck } from "./http/origin-check.js";
 import { createRoomsRouter } from "./rooms/rooms.routes.js";
 import { createStatsRouter } from "./stats/stats.routes.js";
 import { StatsService } from "./stats/stats.service.js";
@@ -34,10 +35,13 @@ export function createApp({ env, prisma, tokens, roomManager, catalog }: AppDeps
 
   const app = express();
   app.disable("x-powered-by");
+  // Cuántos proxies hay delante (en Render se verifica tras desplegar, ver docs/despliegue.md): de eso depende la IP del cliente y el protocolo (req.ip, req.protocol).
+  app.set("trust proxy", env.TRUST_PROXY);
   // Sin CORS_ORIGIN (producción, un solo origen) no se instala CORS: no hay otros orígenes a los que conceder nada.
   if (env.CORS_ORIGIN) app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
   app.use(express.json({ limit: "10kb" }));
   app.use(cookieParser());
+  app.use(createOriginCheck({ allowedOrigins: env.CORS_ORIGIN ? [env.CORS_ORIGIN] : [] }));
 
   app.get("/health", (_req, res) => {
     res.json({ status: "ok" });
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w server
npm test -w client -- test/i18n
npm run typecheck
```

Expected: PASS (todo el servidor: **524 pruebas**, y 8 de cliente en `test/i18n`) y `tsc` sin errores en todos los paquetes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): comprobación de origen en las peticiones que cambian algo (403 FORBIDDEN)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Limitador de ventana deslizante

**Files:**
- Create: `server/src/http/rate-limit.ts`, `server/test/http/rate-limit.test.ts`

**Interfaces:**
- Produces: `createKeyedLimiter({ limit, windowMs, now?, sweepEveryMs? }): KeyedLimiter` con `check(key): { allowed: true } | { allowed: false; retryAfterSeconds }` (no cuenta nada), `record(key)`, `reset(key)`, `release(key)` (devuelve el último hueco reservado) y `size()`; lanza `RangeError` si `limit` no es un entero de 1 o más o si `windowMs` no es mayor que 0. Ventana deslizante: como mucho `limit` eventos en cualquier intervalo de `windowMs`; las claves vencidas se limpian solas al usar el limitador (cada `sweepEveryMs`, 60 s por defecto), sin temporizadores.
- Produces: `tooManyRequests(retryAfterSeconds, message?): AppError` (429, `RATE_LIMITED`, `details: { retryAfterSeconds }`) y `rateLimitMiddleware({ limiter, keyOf }): RequestHandler` (cuenta cada petición; las rechazadas no se cuentan; responde con `Retry-After`).
- Nota: `RATE_LIMITED` ya existe en `shared/` y en los textos del cliente desde la etapa 2.

- [ ] **Step 1: Escribir las pruebas que fallan**

`server/test/http/rate-limit.test.ts` (reloj falso: la ventana que se desliza, claves independientes, `reset`, limpieza de memoria, `Retry-After`, configuración inválida y el middleware):

```ts
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../../src/http/errors.js";
import { createKeyedLimiter, rateLimitMiddleware } from "../../src/http/rate-limit.js";

const SECOND = 1000;
const MINUTE = 60 * SECOND;

function clock(start = 1_000_000) {
  let current = start;
  return { now: () => current, advance: (ms: number) => void (current += ms) };
}

describe("createKeyedLimiter", () => {
  it("deja pasar hasta el límite y luego bloquea", () => {
    const limiter = createKeyedLimiter({ limit: 3, windowMs: MINUTE, now: clock().now });
    for (let i = 0; i < 3; i++) {
      expect(limiter.check("a")).toEqual({ allowed: true });
      limiter.record("a");
    }
    expect(limiter.check("a")).toMatchObject({ allowed: false });
  });

  it("comprobar no cuenta: solo cuentan los eventos registrados", () => {
    const limiter = createKeyedLimiter({ limit: 1, windowMs: MINUTE, now: clock().now });
    for (let i = 0; i < 10; i++) expect(limiter.check("a")).toEqual({ allowed: true });
    limiter.record("a");
    expect(limiter.check("a")).toMatchObject({ allowed: false });
  });

  it("dice cuántos segundos faltan para el primer hueco, redondeando hacia arriba y nunca menos de 1", () => {
    const time = clock();
    const limiter = createKeyedLimiter({ limit: 2, windowMs: 10 * SECOND, now: time.now });
    limiter.record("a");
    time.advance(3 * SECOND);
    limiter.record("a");
    expect(limiter.check("a")).toEqual({ allowed: false, retryAfterSeconds: 7 });
    time.advance(6_500);
    expect(limiter.check("a")).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  it("la ventana se desliza: los eventos viejos dejan de contar uno a uno", () => {
    const time = clock();
    const limiter = createKeyedLimiter({ limit: 2, windowMs: 10 * SECOND, now: time.now });
    limiter.record("a");
    time.advance(6 * SECOND);
    limiter.record("a");
    expect(limiter.check("a")).toMatchObject({ allowed: false });
    time.advance(4 * SECOND); // el primero cumple 10 s; el segundo no
    expect(limiter.check("a")).toEqual({ allowed: true });
    limiter.record("a");
    expect(limiter.check("a")).toMatchObject({ allowed: false });
    time.advance(10 * SECOND);
    expect(limiter.check("a")).toEqual({ allowed: true });
  });

  it("cada clave tiene su propia cuenta", () => {
    const limiter = createKeyedLimiter({ limit: 1, windowMs: MINUTE, now: clock().now });
    limiter.record("a");
    expect(limiter.check("a")).toMatchObject({ allowed: false });
    expect(limiter.check("b")).toEqual({ allowed: true });
  });

  it("reset olvida lo de una clave (y no falla con una que no existe)", () => {
    const limiter = createKeyedLimiter({ limit: 1, windowMs: MINUTE, now: clock().now });
    limiter.record("a");
    limiter.record("b");
    limiter.reset("a");
    limiter.reset("nunca-vista");
    expect(limiter.check("a")).toEqual({ allowed: true });
    expect(limiter.check("b")).toMatchObject({ allowed: false });
  });

  it("release devuelve el último hueco reservado de una clave (y no falla con una que no existe)", () => {
    const time = clock();
    const limiter = createKeyedLimiter({ limit: 2, windowMs: MINUTE, now: time.now });
    limiter.record("a");
    time.advance(SECOND);
    limiter.record("a");
    expect(limiter.check("a").allowed).toBe(false);
    limiter.release("a");
    expect(limiter.check("a").allowed).toBe(true);
    limiter.release("a");
    expect(limiter.size()).toBe(0);
    expect(() => limiter.release("nunca-vista")).not.toThrow();
  });

  it("limpia las claves vencidas solas, para que un abuso no llene la memoria", () => {
    const time = clock();
    const limiter = createKeyedLimiter({ limit: 5, windowMs: MINUTE, sweepEveryMs: 30 * SECOND, now: time.now });
    for (let i = 0; i < 5000; i++) limiter.record(`ip-${i}`);
    expect(limiter.size()).toBe(5000);
    time.advance(MINUTE + 31 * SECOND);
    limiter.check("otra"); // basta cualquier uso para que toque limpiar
    expect(limiter.size()).toBe(0);
  });

  it("la limpieza no borra las claves que todavía cuentan", () => {
    const time = clock();
    const limiter = createKeyedLimiter({ limit: 1, windowMs: MINUTE, sweepEveryMs: 10 * SECOND, now: time.now });
    limiter.record("viva");
    time.advance(30 * SECOND);
    limiter.record("vieja");
    time.advance(40 * SECOND); // "viva" ya venció; "vieja" no
    limiter.check("x");
    expect(limiter.size()).toBe(1);
    expect(limiter.check("vieja")).toMatchObject({ allowed: false });
  });

  it.each([
    [0, MINUTE],
    [-1, MINUTE],
    [1.5, MINUTE],
    [1, 0],
    [1, -5],
  ])("rechaza una configuración inválida (límite %s, ventana %s)", (limit, windowMs) => {
    expect(() => createKeyedLimiter({ limit, windowMs })).toThrow(RangeError);
  });
});

describe("rateLimitMiddleware", () => {
  function build(limit: number, time = clock()) {
    const limiter = createKeyedLimiter({ limit, windowMs: MINUTE, now: time.now });
    const app = express();
    app.set("trust proxy", 1);
    app.get("/ping", rateLimitMiddleware({ limiter, keyOf: (req) => req.ip ?? "?" }), (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler);
    return { app, time, limiter };
  }
  const from = (app: express.Express, ip: string) => request(app).get("/ping").set("X-Forwarded-For", ip);

  it("deja pasar hasta el límite y luego responde 429 RATE_LIMITED con la espera", async () => {
    const { app } = build(2);
    expect((await from(app, "1.1.1.1")).status).toBe(200);
    expect((await from(app, "1.1.1.1")).status).toBe(200);
    const blocked = await from(app, "1.1.1.1");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
    expect(blocked.body.error.details).toEqual({ retryAfterSeconds: 60 });
    expect(blocked.headers["retry-after"]).toBe("60");
  });

  it("una petición rechazada no alarga el bloqueo", async () => {
    const { app, time } = build(1);
    await from(app, "1.1.1.1");
    for (let i = 0; i < 5; i++) expect((await from(app, "1.1.1.1")).status).toBe(429);
    time.advance(MINUTE);
    expect((await from(app, "1.1.1.1")).status).toBe(200);
  });

  it("cada IP tiene su propia cuenta (la IP real sale de X-Forwarded-For con proxy de confianza)", async () => {
    const { app } = build(1);
    expect((await from(app, "1.1.1.1")).status).toBe(200);
    expect((await from(app, "1.1.1.1")).status).toBe(429);
    expect((await from(app, "2.2.2.2")).status).toBe(200);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w server -- test/http/rate-limit.test.ts
```

Expected: FAIL — no existe `src/http/rate-limit.ts`.

- [ ] **Step 3: Implementar**

`server/src/http/rate-limit.ts`:

```ts
import type { RequestHandler } from "express";
import { AppError } from "./errors.js";

export type LimitCheck = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export interface KeyedLimiter {
  /** ¿Cabe otro evento con esta clave? Si no, cuántos segundos faltan para el primer hueco. No cuenta nada. */
  check(key: string): LimitCheck;
  /** Cuenta un evento para la clave. */
  record(key: string): void;
  /** Olvida los eventos de la clave (p. ej. tras un inicio de sesión correcto). */
  reset(key: string): void;
  /** Devuelve el último hueco que se reservó con `record` (p. ej. cuando el intento no llegó a ser un fallo). */
  release(key: string): void;
  /** Cuántas claves tienen eventos guardados. */
  size(): number;
}

export interface KeyedLimiterOptions {
  /** Cuántos eventos caben en la ventana. */
  limit: number;
  windowMs: number;
  /** Reloj inyectable para las pruebas. */
  now?: () => number;
  /** Cada cuánto se tira lo vencido de todas las claves (se hace al usar el limitador, sin temporizadores). */
  sweepEveryMs?: number;
}

/**
 * Ventana deslizante por clave, en memoria (hay una sola instancia del servidor): como mucho `limit` eventos en
 * cualquier intervalo de `windowMs`. Las claves vencidas se limpian solas para que un abuso con claves distintas
 * (muchas IP) no llene la memoria.
 */
export function createKeyedLimiter({ limit, windowMs, now = Date.now, sweepEveryMs = 60_000 }: KeyedLimiterOptions): KeyedLimiter {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit debe ser un entero de 1 o más");
  if (!(windowMs > 0)) throw new RangeError("windowMs debe ser mayor que 0");

  const events = new Map<string, number[]>();
  let lastSweep = now();

  const prune = (stamps: number[], current: number): void => {
    while (stamps.length > 0 && current - stamps[0]! >= windowMs) stamps.shift();
  };

  const sweep = (current: number): void => {
    if (current - lastSweep < sweepEveryMs) return;
    lastSweep = current;
    for (const [key, stamps] of events) {
      prune(stamps, current);
      if (stamps.length === 0) events.delete(key);
    }
  };

  return {
    check(key) {
      const current = now();
      sweep(current);
      const stamps = events.get(key);
      if (!stamps) return { allowed: true };
      prune(stamps, current);
      if (stamps.length < limit) return { allowed: true };
      const retryAfterSeconds = Math.max(1, Math.ceil((stamps[0]! + windowMs - current) / 1000));
      return { allowed: false, retryAfterSeconds };
    },
    record(key) {
      const current = now();
      sweep(current);
      const stamps = events.get(key) ?? [];
      prune(stamps, current);
      stamps.push(current);
      events.set(key, stamps);
    },
    reset(key) {
      events.delete(key);
    },
    release(key) {
      const stamps = events.get(key);
      if (!stamps) return;
      stamps.pop();
      if (stamps.length === 0) events.delete(key);
    },
    size: () => events.size,
  };
}

/** El error que reciben los clientes cuando se pasan del límite: 429 con la espera en el cuerpo y en `Retry-After`. */
export function tooManyRequests(retryAfterSeconds: number, message = "Demasiados intentos. Inténtalo de nuevo más tarde."): AppError {
  return new AppError(429, "RATE_LIMITED", message, { retryAfterSeconds });
}

export interface RateLimitMiddlewareOptions {
  limiter: KeyedLimiter;
  /** La clave de cada petición (normalmente su IP). */
  keyOf(req: Parameters<RequestHandler>[0]): string;
}

/** Cuenta cada petición y rechaza con 429 las que pasan del límite (las rechazadas no se cuentan). */
export function rateLimitMiddleware({ limiter, keyOf }: RateLimitMiddlewareOptions): RequestHandler {
  return (req, res, next) => {
    const key = keyOf(req);
    const result = limiter.check(key);
    if (!result.allowed) {
      res.set("Retry-After", String(result.retryAfterSeconds));
      return next(tooManyRequests(result.retryAfterSeconds));
    }
    limiter.record(key);
    next();
  };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w server -- test/http/rate-limit.test.ts
npm run typecheck
```

Expected: PASS (17 pruebas) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): limitador de ventana deslizante con claves y middleware de límite (429)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Límites de login, registro y API

**Files:**
- Create: `server/src/http/limits.ts`, `server/src/http/api-paths.ts`, `server/test/http/limits.routes.test.ts`
- Modify: `server/src/auth/auth.routes.ts`, `server/src/app.ts`
- Test (modificar): `server/test/helpers/app.ts`

**Interfaces:**
- Consumes: `createKeyedLimiter`, `rateLimitMiddleware`, `tooManyRequests` (Task 3).
- Produces: `RateLimitConfig { loginFailures, loginFailuresByIp, register, api: { limit, windowMs }; now? }` y `DEFAULT_RATE_LIMITS` (5 / 15 min, 30 / 15 min, 5 / 1 h, 300 / 1 min) en `limits.ts`; `API_PREFIXES` (`/auth`, `/rooms`, `/pokemon`, `/stats`, `/users`) en `api-paths.ts`.
- `createApp({ …, rateLimits?: RateLimitConfig | "off" })`: por defecto activos; `"off"` los apaga. El ayudante de pruebas `createTestApp({ rateLimits })` los deja **apagados por defecto** (muchas pruebas registran a más personas de las que permite una IP).
- `createAuthRouter({ …, limiters?: { loginFailures?, loginFailuresByIp?, register? } })`. Hay dos cuentas de fallos: por `${req.ip}|${email}` y por `req.ip` sumando todos los correos. El hueco se reserva en las dos **antes** de comprobar la contraseña (bcrypt tarda: contar al terminar dejaba pasar peticiones en paralelo); `INVALID_CREDENTIALS` lo conserva, un login correcto reinicia la clave de IP y correo y devuelve el hueco de la IP, y cualquier otro error (la base de datos, p. ej.) devuelve ambos. Un bloqueado recibe 429 aunque acierte la contraseña y no alarga el bloqueo. El límite general cubre `API_PREFIXES` y no `/health` ni `/socket.io`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`server/test/helpers/app.ts` (la opción `rateLimits`, apagada por defecto):

```diff
diff --git a/server/test/helpers/app.ts b/server/test/helpers/app.ts
index a26b88d..be9eebc 100644
--- a/server/test/helpers/app.ts
+++ b/server/test/helpers/app.ts
@@ -1,5 +1,6 @@
 import type { Express } from "express";
 import { createApp } from "../../src/app.js";
+import type { RateLimitConfig } from "../../src/http/limits.js";
 import type { PokemonCatalog } from "../../src/catalog/pokemon-catalog.js";
 import { createTokenService } from "../../src/auth/tokens.js";
 import { loadEnv } from "../../src/config/env.js";
@@ -19,6 +20,8 @@ export interface TestContextOptions {
   generateCode?: () => string;
   /** Catálogo (por defecto el de pruebas en memoria). */
   catalog?: PokemonCatalog;
+  /** Límites de peticiones (por defecto apagados: muchas pruebas registran a más personas de las que permite la IP). */
+  rateLimits?: RateLimitConfig;
 }
 
 /**
@@ -43,7 +46,7 @@ export function buildTestContext(overrides: Record<string, string> = {}, options
     store,
     persistRetryDelayMs: 0,
   });
-  const app = createApp({ env, prisma, tokens, roomManager, catalog });
+  const app = createApp({ env, prisma, tokens, roomManager, catalog, rateLimits: options.rateLimits ?? "off" });
   return { app, env, tokens, time, broadcaster, store, roomManager, catalog };
 }
```

`server/test/http/limits.routes.test.ts` (login, registro y límite general, con reloj falso y `X-Forwarded-For` para simular distintas IP):

```ts
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_RATE_LIMITS, type RateLimitConfig } from "../../src/http/limits.js";
import { buildTestContext } from "../helpers/app.js";
import { prisma, resetDatabase } from "../helpers/db.js";
import { registerUser } from "../helpers/users.js";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const ash = { email: "ash@example.com", username: "ash", password: "pikachu-123" };
const proxied = { TRUST_PROXY: "1" };

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

/** La aplicación completa con los límites de producción (o los que se pidan) y el reloj de la prueba. */
function setup(limits: Partial<RateLimitConfig> = {}) {
  const holder: { now: () => number } = { now: () => 0 };
  const ctx = buildTestContext(proxied, { rateLimits: { ...DEFAULT_RATE_LIMITS, ...limits, now: () => holder.now() } });
  holder.now = () => ctx.time.now();
  const from = (ip: string) => ({ "X-Forwarded-For": ip });
  const login = (email: string, password: string, ip = "9.9.9.9") =>
    request(ctx.app).post("/auth/login").set(from(ip)).send({ email, password });
  return { ctx, from, login };
}

describe("los límites por defecto son los de la spec", () => {
  it("login 5 fallos / 15 min, registro 5 / hora, API 300 / minuto", () => {
    expect(DEFAULT_RATE_LIMITS.loginFailures).toEqual({ limit: 5, windowMs: 15 * MINUTE });
    expect(DEFAULT_RATE_LIMITS.loginFailuresByIp).toEqual({ limit: 30, windowMs: 15 * MINUTE });
    expect(DEFAULT_RATE_LIMITS.register).toEqual({ limit: 5, windowMs: HOUR });
    expect(DEFAULT_RATE_LIMITS.api).toEqual({ limit: 300, windowMs: MINUTE });
  });
});

describe("límite de intentos de login", () => {
  async function withAccount() {
    const env = setup();
    await registerUser(env.ctx.app, "ash");
    return env;
  }

  it("tras 5 contraseñas erróneas el sexto intento da 429, aunque la contraseña sea la correcta", async () => {
    const { login } = await withAccount();
    for (let i = 0; i < 5; i++) expect((await login(ash.email, "mala-clave-1")).status).toBe(401);
    const blocked = await login(ash.email, ash.password);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
    expect(blocked.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.headers["retry-after"]).toBe(String(blocked.body.error.details.retryAfterSeconds));
  });

  it("un inicio de sesión correcto reinicia la cuenta", async () => {
    const { login } = await withAccount();
    for (let i = 0; i < 4; i++) await login(ash.email, "mala-clave-1");
    expect((await login(ash.email, ash.password)).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await login(ash.email, "mala-clave-1")).status).toBe(401);
    expect((await login(ash.email, ash.password)).status).toBe(200);
  });

  it("pasados 15 minutos se puede volver a intentar", async () => {
    const { ctx, login } = await withAccount();
    for (let i = 0; i < 5; i++) await login(ash.email, "mala-clave-1");
    expect((await login(ash.email, ash.password)).status).toBe(429);
    ctx.time.advance(15 * MINUTE);
    expect((await login(ash.email, ash.password)).status).toBe(200);
  });

  it("no es un bloqueo de la cuenta: otra IP puede entrar con la contraseña correcta", async () => {
    const { login } = await withAccount();
    for (let i = 0; i < 5; i++) await login(ash.email, "mala-clave-1", "1.1.1.1");
    expect((await login(ash.email, ash.password, "1.1.1.1")).status).toBe(429);
    expect((await login(ash.email, ash.password, "2.2.2.2")).status).toBe(200);
  });

  it("tampoco bloquea a otras cuentas desde la misma IP", async () => {
    const env = await withAccount();
    await registerUser(env.ctx.app, "misty");
    for (let i = 0; i < 5; i++) await env.login(ash.email, "mala-clave-1");
    expect((await env.login("misty@example.com", "pikachu-123")).status).toBe(200);
  });

  it("un correo que no existe se cuenta igual (no se puede saber si existe por cómo responde)", async () => {
    const { login } = await withAccount();
    for (let i = 0; i < 5; i++) expect((await login("nadie@example.com", "mala-clave-1")).status).toBe(401);
    const blocked = await login("nadie@example.com", "mala-clave-1");
    expect(blocked.status).toBe(429);
    expect(Object.keys(blocked.body.error).sort()).toEqual(["code", "details", "message"]);
  });

  it("el correo se compara normalizado (mayúsculas y espacios no sirven para esquivar el límite)", async () => {
    const { login } = await withAccount();
    for (let i = 0; i < 5; i++) await login("  ASH@example.com ", "mala-clave-1");
    expect((await login(ash.email, ash.password)).status).toBe(429);
  });

  it("un cuerpo inválido (400) no cuenta como intento", async () => {
    const { ctx, login } = await withAccount();
    for (let i = 0; i < 10; i++) {
      expect((await request(ctx.app).post("/auth/login").set({ "X-Forwarded-For": "9.9.9.9" }).send({ email: "no-es-email", password: "x" })).status).toBe(400);
    }
    expect((await login(ash.email, ash.password)).status).toBe(200);
  });

  it("insistir estando bloqueado no alarga el bloqueo", async () => {
    const { ctx, login } = await withAccount();
    for (let i = 0; i < 5; i++) await login(ash.email, "mala-clave-1");
    ctx.time.advance(14 * MINUTE);
    for (let i = 0; i < 5; i++) expect((await login(ash.email, "mala-clave-1")).status).toBe(429);
    ctx.time.advance(MINUTE);
    expect((await login(ash.email, ash.password)).status).toBe(200);
  });
});

describe("límite de registros", () => {
  const register = (ctx: ReturnType<typeof setup>["ctx"], n: number, ip = "9.9.9.9") =>
    request(ctx.app).post("/auth/register").set({ "X-Forwarded-For": ip }).send({ email: `u${n}@example.com`, username: `usuario${n}`, password: "pikachu-123" });

  it("a partir del sexto registro por hora desde la misma IP da 429", async () => {
    const { ctx } = setup();
    for (let n = 1; n <= 5; n++) expect((await register(ctx, n)).status).toBe(201);
    const blocked = await register(ctx, 6);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
  });

  it("los intentos fallidos (cuenta repetida) también cuentan", async () => {
    const { ctx } = setup();
    expect((await register(ctx, 1)).status).toBe(201);
    for (let i = 0; i < 4; i++) expect((await register(ctx, 1)).status).toBe(409);
    expect((await register(ctx, 2)).status).toBe(429);
  });

  it("otra IP no se ve afectada y pasada una hora se puede volver a registrar", async () => {
    const { ctx } = setup();
    for (let n = 1; n <= 5; n++) await register(ctx, n);
    expect((await register(ctx, 6)).status).toBe(429);
    expect((await register(ctx, 7, "2.2.2.2")).status).toBe(201);
    ctx.time.advance(HOUR);
    expect((await register(ctx, 6)).status).toBe(201);
  });
});

describe("límite general de la API por IP", () => {
  it("pasado el límite por minuto da 429 en cualquier ruta de la API, y vuelve a la normalidad al pasar el minuto", async () => {
    const { ctx, from } = setup({ api: { limit: 5, windowMs: MINUTE } });
    for (let i = 0; i < 5; i++) expect((await request(ctx.app).get("/pokemon/names").set(from("1.1.1.1"))).status).toBe(200);
    for (const path of ["/pokemon/names", "/stats", "/rooms/current", "/users/x/stats", "/auth/me"]) {
      const response = await request(ctx.app).get(path).set(from("1.1.1.1"));
      expect(response.status, path).toBe(429);
      expect(response.body.error.code).toBe("RATE_LIMITED");
    }
    expect((await request(ctx.app).get("/pokemon/names").set(from("2.2.2.2"))).status).toBe(200);
    ctx.time.advance(MINUTE);
    expect((await request(ctx.app).get("/pokemon/names").set(from("1.1.1.1"))).status).toBe(200);
  });

  it("/health no cuenta ni se bloquea (la plataforma lo consulta sin parar)", async () => {
    const { ctx, from } = setup({ api: { limit: 2, windowMs: MINUTE } });
    for (let i = 0; i < 20; i++) expect((await request(ctx.app).get("/health").set(from("1.1.1.1"))).status).toBe(200);
    expect((await request(ctx.app).get("/pokemon/names").set(from("1.1.1.1"))).status).toBe(200);
  });
});

describe("límite de login: peticiones en paralelo y tope por IP", () => {
  async function withAccount() {
    const env = setup();
    await registerUser(env.ctx.app, "ash");
    return env;
  }

  it("diez intentos fallidos a la vez no esquivan el límite: solo 5 llegan a comprobar la contraseña", async () => {
    const { login } = await withAccount();
    const responses = await Promise.all(Array.from({ length: 10 }, () => login(ash.email, "mala-clave-1")));
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429, 429, 429, 429, 429]);
  });

  it("intentos en paralelo con la contraseña correcta no dejan sin cuenta al dueño: los 5 primeros entran y reinician", async () => {
    const { login } = await withAccount();
    const responses = await Promise.all(Array.from({ length: 5 }, () => login(ash.email, ash.password)));
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200, 200]);
    expect((await login(ash.email, "mala-clave-1")).status).toBe(401);
  });

  it("una sola IP no puede probar contraseñas contra muchas cuentas: a partir del intento 31 fallido da 429", async () => {
    const { login } = await withAccount();
    for (let i = 0; i < 30; i++) expect((await login(`otra${i}@example.com`, "mala-clave-1")).status).toBe(401);
    const blocked = await login("otra99@example.com", "mala-clave-1");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    expect((await login(ash.email, ash.password, "8.8.8.8")).status).toBe(200);
  });

  it("los inicios de sesión correctos no cuentan para el tope de la IP", async () => {
    const { login } = await withAccount();
    for (let i = 0; i < 29; i++) await login(`otra${i}@example.com`, "mala-clave-1");
    for (let i = 0; i < 5; i++) expect((await login(ash.email, ash.password)).status).toBe(200);
    expect((await login("otra50@example.com", "mala-clave-1")).status).toBe(401);
    expect((await login("otra51@example.com", "mala-clave-1")).status).toBe(429);
  });

  it("pasados 15 minutos la IP puede volver a intentar", async () => {
    const { ctx, login } = await withAccount();
    for (let i = 0; i < 31; i++) await login(`otra${i}@example.com`, "mala-clave-1");
    expect((await login("otra99@example.com", "mala-clave-1")).status).toBe(429);
    ctx.time.advance(15 * MINUTE + 1000);
    expect((await login("otra99@example.com", "mala-clave-1")).status).toBe(401);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w server -- test/http/limits.routes.test.ts
```

Expected: FAIL — no existe `src/http/limits.ts` (y, con él, el ayudante de pruebas no compila).

- [ ] **Step 3: Implementar**

`server/src/http/limits.ts`:

```ts
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export interface WindowLimit {
  limit: number;
  windowMs: number;
}

export interface RateLimitConfig {
  /** Intentos de inicio de sesión **fallidos** por combinación de IP y correo; un login correcto reinicia la cuenta. */
  loginFailures: WindowLimit;
  /** Intentos de inicio de sesión **fallidos** por IP sumando todos los correos (contra probar una contraseña en muchas cuentas). */
  loginFailuresByIp: WindowLimit;
  /** Registros por IP (cuentan todos los intentos, también los que fallan). */
  register: WindowLimit;
  /** Peticiones a toda la API por IP. */
  api: WindowLimit;
  /** Reloj inyectable para las pruebas. */
  now?: () => number;
}

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  loginFailures: { limit: 5, windowMs: 15 * MINUTE },
  loginFailuresByIp: { limit: 30, windowMs: 15 * MINUTE },
  register: { limit: 5, windowMs: HOUR },
  api: { limit: 300, windowMs: MINUTE },
};
```

`server/src/http/api-paths.ts`:

```ts
/**
 * Prefijos de las rutas de la API. Todo lo que no empiece por uno de ellos (ni sea /health ni /socket.io) es una pantalla
 * del cliente. `/health` y `/socket.io` no están aquí a propósito: no pasan por el límite general de peticiones.
 */
export const API_PREFIXES = ["/auth", "/rooms", "/pokemon", "/stats", "/users"] as const;
```

`server/src/auth/auth.routes.ts`:

```diff
diff --git a/server/src/auth/auth.routes.ts b/server/src/auth/auth.routes.ts
index 11a792d..7301190 100644
--- a/server/src/auth/auth.routes.ts
+++ b/server/src/auth/auth.routes.ts
@@ -1,6 +1,7 @@
-import { type CookieOptions, type Response, Router } from "express";
+import { type CookieOptions, type Request, type RequestHandler, type Response, Router } from "express";
 import type { Env } from "../config/env.js";
 import { AppError } from "../http/errors.js";
+import { type KeyedLimiter, rateLimitMiddleware, tooManyRequests } from "../http/rate-limit.js";
 import { createRequireAuth, getAuth } from "./auth.middleware.js";
 import { loginSchema, preferencesSchema, registerSchema } from "./auth.schemas.js";
 import type { AuthResult, AuthService, AuthUser } from "./auth.service.js";
@@ -12,8 +13,12 @@ export interface AuthRouterDeps {
   env: Env;
   authService: AuthService;
   tokens: TokenService;
+  /** Límites de intentos; sin ellos no se limita nada (las pruebas que no los necesitan). */
+  limiters?: { loginFailures?: KeyedLimiter; loginFailuresByIp?: KeyedLimiter; register?: KeyedLimiter };
 }
 
+const clientIp = (req: Request): string => req.ip ?? "desconocida";
+
 function toUserDto(user: AuthUser) {
   return {
     id: user.id,
@@ -24,8 +29,11 @@ function toUserDto(user: AuthUser) {
   };
 }
 
-export function createAuthRouter({ env, authService, tokens }: AuthRouterDeps): Router {
+export function createAuthRouter({ env, authService, tokens, limiters = {} }: AuthRouterDeps): Router {
   const router = Router();
+  const limitRegistrations: RequestHandler = limiters.register
+    ? rateLimitMiddleware({ limiter: limiters.register, keyOf: clientIp })
+    : (_req, _res, next) => next();
   const requireAuth = createRequireAuth(tokens);
 
   // La cookie solo viaja a /auth: el resto de la API nunca la recibe.
@@ -44,7 +52,7 @@ export function createAuthRouter({ env, authService, tokens }: AuthRouterDeps):
     res.clearCookie(REFRESH_COOKIE, cookieOptions);
   }
 
-  router.post("/register", async (req, res) => {
+  router.post("/register", limitRegistrations, async (req, res) => {
     const input = registerSchema.parse(req.body);
     const result = await authService.register(input);
     startSession(res, result);
@@ -53,7 +61,37 @@ export function createAuthRouter({ env, authService, tokens }: AuthRouterDeps):
 
   router.post("/login", async (req, res) => {
     const input = loginSchema.parse(req.body);
-    const result = await authService.login(input);
+    // Dos cuentas de fallos: por IP y correo (no es un bloqueo de la cuenta: nadie puede dejar fuera a otra persona
+    // escribiendo su correo) y por IP sumando todos los correos (nadie puede probar una contraseña en muchas cuentas ni
+    // saturar el servidor con bcrypt). Solo cuentan los intentos fallidos; un inicio de sesión correcto reinicia la cuenta.
+    const ip = clientIp(req);
+    const attemptKey = `${ip}|${input.email}`;
+    const { loginFailures, loginFailuresByIp } = limiters;
+    const waits = [loginFailures?.check(attemptKey), loginFailuresByIp?.check(ip)].flatMap((status) =>
+      status && !status.allowed ? [status.retryAfterSeconds] : [],
+    );
+    if (waits.length > 0) {
+      const retryAfterSeconds = Math.max(...waits);
+      res.set("Retry-After", String(retryAfterSeconds));
+      throw tooManyRequests(retryAfterSeconds, "Demasiados intentos de inicio de sesión. Inténtalo de nuevo más tarde.");
+    }
+    // El hueco se reserva ANTES de comprobar la contraseña (bcrypt tarda): si se contara al terminar, diez peticiones
+    // en paralelo pasarían todas la comprobación con la cuenta aún a cero.
+    loginFailures?.record(attemptKey);
+    loginFailuresByIp?.record(ip);
+    let result: AuthResult;
+    try {
+      result = await authService.login(input);
+    } catch (error) {
+      if (!(error instanceof AppError && error.code === "INVALID_CREDENTIALS")) {
+        // Un fallo nuestro (la base de datos, p. ej.) no es un intento fallido de la persona.
+        loginFailures?.release(attemptKey);
+        loginFailuresByIp?.release(ip);
+      }
+      throw error;
+    }
+    loginFailures?.reset(attemptKey);
+    loginFailuresByIp?.release(ip);
     startSession(res, result);
     res.json({ user: toUserDto(result.user), accessToken: result.accessToken });
   });
```

`server/src/app.ts`:

```diff
diff --git a/server/src/app.ts b/server/src/app.ts
index 5f563f0..a98c10c 100644
--- a/server/src/app.ts
+++ b/server/src/app.ts
@@ -10,8 +10,11 @@ import type { PokemonCatalog } from "./catalog/pokemon-catalog.js";
 import type { Env } from "./config/env.js";
 import type { PrismaClient } from "./db/prisma.js";
 import type { RoomManager } from "./game/room-manager.js";
+import { API_PREFIXES } from "./http/api-paths.js";
 import { errorHandler, notFoundHandler } from "./http/errors.js";
+import { DEFAULT_RATE_LIMITS, type RateLimitConfig } from "./http/limits.js";
 import { createOriginCheck } from "./http/origin-check.js";
+import { createKeyedLimiter, rateLimitMiddleware } from "./http/rate-limit.js";
 import { createRoomsRouter } from "./rooms/rooms.routes.js";
 import { createStatsRouter } from "./stats/stats.routes.js";
 import { StatsService } from "./stats/stats.service.js";
@@ -23,9 +26,19 @@ export interface AppDeps {
   tokens: TokenService;
   roomManager: RoomManager;
   catalog: PokemonCatalog;
+  /** Límites de peticiones; "off" los apaga (solo para pruebas). Por defecto, los de producción. */
+  rateLimits?: RateLimitConfig | "off";
 }
 
-export function createApp({ env, prisma, tokens, roomManager, catalog }: AppDeps): Express {
+export function createApp({ env, prisma, tokens, roomManager, catalog, rateLimits = DEFAULT_RATE_LIMITS }: AppDeps): Express {
+  const limits = rateLimits === "off" ? null : rateLimits;
+  const limiters = limits && {
+    loginFailures: createKeyedLimiter({ ...limits.loginFailures, now: limits.now }),
+    loginFailuresByIp: createKeyedLimiter({ ...limits.loginFailuresByIp, now: limits.now }),
+    register: createKeyedLimiter({ ...limits.register, now: limits.now }),
+    api: createKeyedLimiter({ ...limits.api, now: limits.now }),
+  };
+
   const authService = new AuthService({
     prisma,
     hasher: createPasswordHasher(env.BCRYPT_COST),
@@ -42,11 +55,13 @@ export function createApp({ env, prisma, tokens, roomManager, catalog }: AppDeps
   app.use(express.json({ limit: "10kb" }));
   app.use(cookieParser());
   app.use(createOriginCheck({ allowedOrigins: env.CORS_ORIGIN ? [env.CORS_ORIGIN] : [] }));
+  // El límite general solo cubre la API: /health (que consulta la plataforma sin parar) y /socket.io quedan fuera.
+  if (limiters) app.use([...API_PREFIXES], rateLimitMiddleware({ limiter: limiters.api, keyOf: (req) => req.ip ?? "desconocida" }));
 
   app.get("/health", (_req, res) => {
     res.json({ status: "ok" });
   });
-  app.use("/auth", createAuthRouter({ env, authService, tokens }));
+  app.use("/auth", createAuthRouter({ env, authService, tokens, limiters: limiters ?? undefined }));
   app.use("/rooms", createRoomsRouter({ manager: roomManager, tokens }));
   app.use("/pokemon", createCatalogRouter({ catalog }));
   app.use(createStatsRouter({ service: new StatsService({ prisma, catalog }), tokens }));
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w server
npm run typecheck
```

Expected: PASS (todo el servidor: **561 pruebas**) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): límites de intentos de login, de registros y de peticiones a la API" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: El servidor sirve el cliente

**Files:**
- Create: `server/src/http/client-app.ts`, `server/test/http/client-app.test.ts`
- Modify: `server/src/app.ts`, `server/src/index.ts`

**Interfaces:**
- Consumes: `API_PREFIXES` (Task 4).
- Produces: `createClientApp(distDir: string): Router | null` — `null` si no existe `distDir/index.html` (desarrollo y pruebas: todo sigue igual); si existe, sirve los archivos (`/assets/*` con `Cache-Control: public, max-age=31536000, immutable`, el resto `no-cache`) y devuelve `index.html` para los `GET` y `HEAD` de rutas sin extensión que no sean de la API, `/health` ni `/socket.io`. Un archivo que no existe, un método distinto de `GET`/`HEAD` o una ruta de la API siguen dando el 404 en JSON.
- `createApp({ …, clientDist?: string })` monta ese router **antes** del 404 y **después** de las rutas de la API; `index.ts` pasa `join(import.meta.dirname, "../../client/dist")` (la misma ruta relativa vale desde `server/src` y desde el paquete en `server/dist`).

- [ ] **Step 1: Escribir las pruebas que fallan**

`server/test/http/client-app.test.ts` (construye un `dist` falso en un directorio temporal y la aplicación con `createApp`):

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { buildTestContext } from "../helpers/app.js";
import { prisma } from "../helpers/db.js";

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
  return createApp({ env, prisma, tokens, roomManager, catalog, rateLimits: "off", clientDist });
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
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w server -- test/http/client-app.test.ts
```

Expected: FAIL — no existe `src/http/client-app.ts`.

- [ ] **Step 3: Implementar**

`server/src/http/client-app.ts`:

```ts
import { existsSync } from "node:fs";
import { extname, join, relative } from "node:path";
import express, { type Router } from "express";
import { API_PREFIXES } from "./api-paths.js";

const NOT_CLIENT = [...API_PREFIXES, "/health", "/socket.io"];
const IMMUTABLE = "public, max-age=31536000, immutable";

const isServerPath = (path: string): boolean => NOT_CLIENT.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

/**
 * Sirve el cliente construido (`client/dist`) desde el mismo servicio que la API: un solo origen. Devuelve `null` si
 * no hay cliente construido (desarrollo y pruebas), y entonces todo sigue como antes.
 * - Los archivos con hash de `/assets` se cachean para siempre; el resto (index.html, el icono) siempre se revalida.
 * - Una ruta que no es de la API ni es un archivo (`/perfil`, `/sala/ABC234`) devuelve `index.html`, para que React Router
 *   la resuelva. Un archivo que no existe (`/assets/viejo.js`) no: daría un HTML donde se esperaba JavaScript.
 * - Las rutas de la API, `/health` y `/socket.io` nunca llegan aquí.
 */
export function createClientApp(distDir: string): Router | null {
  const index = join(distDir, "index.html");
  if (!existsSync(index)) return null;

  const router = express.Router();
  router.use(
    express.static(distDir, {
      index: false,
      setHeaders(res, filePath) {
        const inAssets = relative(distDir, filePath).split(/[\\/]/)[0] === "assets";
        res.setHeader("Cache-Control", inAssets ? IMMUTABLE : "no-cache");
      },
    }),
  );
  router.use((req, res, next) => {
    if ((req.method !== "GET" && req.method !== "HEAD") || isServerPath(req.path) || extname(req.path) !== "") return next();
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(index);
  });
  return router;
}
```

`server/src/app.ts` (opción `clientDist`):

```diff
diff --git a/server/src/app.ts b/server/src/app.ts
index a98c10c..474e427 100644
--- a/server/src/app.ts
+++ b/server/src/app.ts
@@ -11,6 +11,7 @@ import type { Env } from "./config/env.js";
 import type { PrismaClient } from "./db/prisma.js";
 import type { RoomManager } from "./game/room-manager.js";
 import { API_PREFIXES } from "./http/api-paths.js";
+import { createClientApp } from "./http/client-app.js";
 import { errorHandler, notFoundHandler } from "./http/errors.js";
 import { DEFAULT_RATE_LIMITS, type RateLimitConfig } from "./http/limits.js";
 import { createOriginCheck } from "./http/origin-check.js";
@@ -28,9 +29,11 @@ export interface AppDeps {
   catalog: PokemonCatalog;
   /** Límites de peticiones; "off" los apaga (solo para pruebas). Por defecto, los de producción. */
   rateLimits?: RateLimitConfig | "off";
+  /** Directorio del cliente construido; si existe con su index.html, el servidor lo sirve (un solo origen). */
+  clientDist?: string;
 }
 
-export function createApp({ env, prisma, tokens, roomManager, catalog, rateLimits = DEFAULT_RATE_LIMITS }: AppDeps): Express {
+export function createApp({ env, prisma, tokens, roomManager, catalog, rateLimits = DEFAULT_RATE_LIMITS, clientDist }: AppDeps): Express {
   const limits = rateLimits === "off" ? null : rateLimits;
   const limiters = limits && {
     loginFailures: createKeyedLimiter({ ...limits.loginFailures, now: limits.now }),
@@ -66,6 +69,11 @@ export function createApp({ env, prisma, tokens, roomManager, catalog, rateLimit
   app.use("/pokemon", createCatalogRouter({ catalog }));
   app.use(createStatsRouter({ service: new StatsService({ prisma, catalog }), tokens }));
 
+  if (clientDist) {
+    const client = createClientApp(clientDist);
+    if (client) app.use(client);
+  }
+
   app.use(notFoundHandler);
   app.use(errorHandler);
   return app;
```

`server/src/index.ts`:

```diff
diff --git a/server/src/index.ts b/server/src/index.ts
index 3a2a35e..9f4160c 100644
--- a/server/src/index.ts
+++ b/server/src/index.ts
@@ -1,4 +1,5 @@
 import { createServer } from "node:http";
+import { join } from "node:path";
 import { createApp } from "./app.js";
 import { createTokenService } from "./auth/tokens.js";
 import { loadCatalog } from "./catalog/pokemon-catalog.js";
@@ -43,7 +44,8 @@ const roomManager = new RoomManager({
   logger: console,
 });
 
-const app = createApp({ env, prisma, tokens, roomManager, catalog });
+// El cliente construido vive en client/dist, a la misma distancia desde server/src y desde el servidor empaquetado (server/dist).
+const app = createApp({ env, prisma, tokens, roomManager, catalog, clientDist: join(import.meta.dirname, "../../client/dist") });
 const server = createServer(app);
 const io = attachRealtime(server, { env, tokens, manager: roomManager, broadcaster, logger: console });
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w server
npm run typecheck
```

Expected: PASS (todo el servidor: **578 pruebas**) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): sirve el cliente construido desde el mismo origen que la API" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Pool de conexiones y cierre ordenado

**Files:**
- Create: `server/src/shutdown.ts`, `server/test/shutdown.test.ts`, `server/test/db/pool-resilience.test.ts`
- Modify: `server/src/db/prisma.ts`, `server/src/index.ts`

**Interfaces:**
- Produces: `POOL_DEFAULTS` (`{ max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 30_000 }`) y `createPrismaClient(connectionString, options?: { applicationName?: string; onPoolError?: (error: Error) => void })`, que pasa esa configuración al pool de `pg`. (Se comprobó al implementar que el adaptador de Prisma ya atiende los errores de las conexiones inactivas: la prueba lo fija para que no se pierda, y `onPoolError` solo permite registrarlos.)
- Produces: `createShutdown({ io, prisma, logger, exit, timeoutMs = 10_000 }): (signal: string) => Promise<void>` — cierra Socket.io (y con él el servidor HTTP), luego la base de datos y sale con `0`; con `1` si algo falla o si pasa `timeoutMs`; una segunda señal mientras cierra no repite nada. `index.ts` lo conecta a `SIGTERM` y `SIGINT`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`server/test/shutdown.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { createShutdown } from "../src/shutdown.js";

afterEach(() => vi.useRealTimers());

function setup(overrides: { io?: { close(): Promise<void> }; prisma?: { $disconnect(): Promise<void> } } = {}) {
  const calls: string[] = [];
  const logger = { log: vi.fn(), error: vi.fn() };
  const exit = vi.fn((code: number) => void calls.push(`exit:${code}`));
  const io = overrides.io ?? {
    close: async () => {
      calls.push("io.close");
    },
  };
  const prisma = overrides.prisma ?? {
    $disconnect: async () => {
      calls.push("prisma.disconnect");
    },
  };
  const shutdown = createShutdown({ io, prisma, logger, exit, timeoutMs: 10_000 });
  return { shutdown, calls, logger, exit };
}

describe("cierre ordenado", () => {
  it("cierra Socket.io (y con él el servidor HTTP), luego la base de datos y sale con 0", async () => {
    const { shutdown, calls } = setup();
    await shutdown("SIGTERM");
    expect(calls).toEqual(["io.close", "prisma.disconnect", "exit:0"]);
  });

  it("dice qué señal recibió", async () => {
    const { shutdown, logger } = setup();
    await shutdown("SIGTERM");
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("SIGTERM"));
  });

  it("una segunda señal mientras cierra no repite el cierre", async () => {
    const { shutdown, calls } = setup();
    await Promise.all([shutdown("SIGTERM"), shutdown("SIGINT")]);
    expect(calls).toEqual(["io.close", "prisma.disconnect", "exit:0"]);
  });

  it("si cerrar Socket.io falla, igualmente intenta cerrar la base de datos y sale con 1", async () => {
    const { shutdown, calls, logger } = setup({
      io: {
        close: async () => {
          throw new Error("no cierra");
        },
      },
    });
    await shutdown("SIGTERM");
    expect(calls).toEqual(["prisma.disconnect", "exit:1"]);
    expect(logger.error).toHaveBeenCalled();
  });

  it("si cerrar la base de datos falla, sale con 1", async () => {
    const { shutdown, calls } = setup({
      prisma: {
        $disconnect: async () => {
          throw new Error("no desconecta");
        },
      },
    });
    await shutdown("SIGTERM");
    expect(calls).toEqual(["io.close", "exit:1"]);
  });

  it("si algo no cierra en 10 segundos, sale igualmente con 1", async () => {
    vi.useFakeTimers();
    const { shutdown, calls, logger } = setup({ io: { close: () => new Promise<void>(() => {}) } });
    void shutdown("SIGTERM");
    await vi.advanceTimersByTimeAsync(9_999);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(2);
    expect(calls).toEqual(["exit:1"]);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("10"), undefined);
  });

  it("si cierra a tiempo, el temporizador de seguridad no vuelve a salir", async () => {
    vi.useFakeTimers();
    const { shutdown, calls } = setup();
    await shutdown("SIGTERM");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toEqual(["io.close", "prisma.disconnect", "exit:0"]);
  });
});
```

`server/test/db/pool-resilience.test.ts` (corta conexiones con `pg_terminate_backend` y comprueba que el servidor sobrevive y que la siguiente consulta funciona):

```ts
import { afterAll, describe, expect, it } from "vitest";
import { POOL_DEFAULTS, createPrismaClient } from "../../src/db/prisma.js";
import { prisma as admin } from "../helpers/db.js";

const NEON_SUSPEND_MS = 5 * 60 * 1000;
const APPLICATION = "pm-pool-resilience";

afterAll(() => admin.$disconnect());

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Corta desde fuera las conexiones de un cliente, como hace Neon al apagarse. */
async function cutConnections(application: string): Promise<number> {
  const rows = await admin.$queryRaw<{ cut: boolean }[]>`
    SELECT pg_terminate_backend(pid) AS cut FROM pg_stat_activity WHERE application_name = ${application}`;
  return rows.length;
}

describe("la configuración del pool", () => {
  it("cierra las conexiones inactivas mucho antes de que Neon se apague (a los 5 minutos)", () => {
    expect(POOL_DEFAULTS.idleTimeoutMillis).toBeLessThan(NEON_SUSPEND_MS);
    expect(POOL_DEFAULTS.max).toBeLessThanOrEqual(10);
  });

  it("espera lo suficiente a que la base despierte tras apagarse (arranque en frío)", () => {
    expect(POOL_DEFAULTS.connectionTimeoutMillis).toBeGreaterThanOrEqual(20_000);
  });
});

describe("una base de datos que cierra las conexiones", () => {
  it("no tira el proceso, registra lo ocurrido y la siguiente consulta funciona", async () => {
    const errors: string[] = [];
    const client = createPrismaClient(process.env.DATABASE_URL!, {
      applicationName: APPLICATION,
      onPoolError: (error) => errors.push(error.message),
    });
    try {
      // Abre varias conexiones a la vez para que haya inactivas que cortar.
      await Promise.all([1, 2, 3].map(() => client.$queryRaw`SELECT 1 AS ok FROM pg_sleep(0.2)`));

      expect(await cutConnections(APPLICATION)).toBeGreaterThan(0);
      await pause(300);

      expect(errors.length).toBeGreaterThan(0);
      await expect(client.$queryRaw`SELECT 1 AS ok`).resolves.toEqual([{ ok: 1 }]);
    } finally {
      await client.$disconnect();
    }
  });

  it("sigue funcionando después de varias caídas seguidas", async () => {
    const client = createPrismaClient(process.env.DATABASE_URL!, { applicationName: APPLICATION });
    try {
      for (let round = 0; round < 3; round++) {
        await Promise.all([1, 2].map(() => client.$queryRaw`SELECT 1 AS ok FROM pg_sleep(0.1)`));
        await cutConnections(APPLICATION);
        await pause(200);
        await expect(client.$queryRaw`SELECT ${round} AS round`).resolves.toHaveLength(1);
      }
    } finally {
      await client.$disconnect();
    }
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w server -- test/shutdown.test.ts test/db/pool-resilience.test.ts
```

Expected: FAIL — no existen `src/shutdown.ts` ni `POOL_DEFAULTS`.

- [ ] **Step 3: Implementar**

`server/src/db/prisma.ts`:

```diff
diff --git a/server/src/db/prisma.ts b/server/src/db/prisma.ts
index 6852520..2f36802 100644
--- a/server/src/db/prisma.ts
+++ b/server/src/db/prisma.ts
@@ -3,6 +3,27 @@ import { PrismaClient } from "../generated/prisma/client.js";
 
 export type { PrismaClient };
 
-export function createPrismaClient(connectionString: string): PrismaClient {
-  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
+/**
+ * Neon apaga la base tras 5 minutos sin actividad: las conexiones inactivas se cierran mucho antes (10 s) para no
+ * guardar ninguna que la base vaya a cortar, y se espera hasta 30 s a que despierte en el primer acceso.
+ */
+export const POOL_DEFAULTS = { max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 30_000 } as const;
+
+export interface PrismaClientOptions {
+  /** Nombre con el que aparecen las conexiones en `pg_stat_activity` (útil para depurar y para las pruebas). */
+  applicationName?: string;
+  /** Se llama cuando la base cierra una conexión inactiva (Prisma la gestiona; esto solo permite registrarlo). */
+  onPoolError?: (error: Error) => void;
+}
+
+export function createPrismaClient(connectionString: string, options: PrismaClientOptions = {}): PrismaClient {
+  const adapter = new PrismaPg(
+    {
+      connectionString,
+      ...POOL_DEFAULTS,
+      ...(options.applicationName ? { application_name: options.applicationName } : {}),
+    },
+    { onPoolError: options.onPoolError },
+  );
+  return new PrismaClient({ adapter });
 }
```

`server/src/shutdown.ts`:

```ts
export interface ShutdownDeps {
  /** Cerrarlo cierra también el servidor HTTP sobre el que está montado. */
  io: { close(): Promise<void> };
  prisma: { $disconnect(): Promise<void> };
  logger: { log(message: string): void; error(message: string, error?: unknown): void };
  exit(code: number): void;
  /** Si el cierre tarda más, se sale igualmente. */
  timeoutMs?: number;
}

/**
 * Cierre ordenado al recibir SIGTERM (Render lo envía al dormir o redesplegar) o SIGINT: deja de aceptar conexiones,
 * cierra Socket.io y la base de datos y sale. Si algo no cierra a tiempo, sale con 1 igualmente. Una segunda señal
 * mientras cierra no repite nada. Las partidas a medias se marcan como abandonadas en el próximo arranque.
 */
export function createShutdown({ io, prisma, logger, exit, timeoutMs = 10_000 }: ShutdownDeps): (signal: string) => Promise<void> {
  let started = false;
  return async (signal) => {
    if (started) return;
    started = true;
    logger.log(`${signal} recibido, cerrando...`);

    const forced = setTimeout(() => {
      logger.error(`El cierre tardó más de ${timeoutMs / 1000} segundos; se sale igualmente`, undefined);
      exit(1);
    }, timeoutMs);
    forced.unref();

    let failed = false;
    for (const [label, close] of [
      ["Socket.io", () => io.close()],
      ["la base de datos", () => prisma.$disconnect()],
    ] as const) {
      try {
        await close();
      } catch (error) {
        failed = true;
        logger.error(`No se pudo cerrar ${label}`, error);
      }
    }
    clearTimeout(forced);
    exit(failed ? 1 : 0);
  };
}
```

`server/src/index.ts`:

```diff
diff --git a/server/src/index.ts b/server/src/index.ts
index 9f4160c..9444def 100644
--- a/server/src/index.ts
+++ b/server/src/index.ts
@@ -12,9 +12,12 @@ import { RoomManager } from "./game/room-manager.js";
 import { InMemoryRoomStore } from "./game/room-store.js";
 import { SocketBroadcaster } from "./realtime/broadcaster.js";
 import { attachRealtime } from "./realtime/server.js";
+import { createShutdown } from "./shutdown.js";
 
 const env = loadEnv();
-const prisma = createPrismaClient(env.DATABASE_URL);
+const prisma = createPrismaClient(env.DATABASE_URL, {
+  onPoolError: (error) => console.warn(`Base de datos: se cerró una conexión inactiva (${error.message})`),
+});
 const repository = createPrismaGameRepository(prisma);
 
 // Las salas viven en memoria: lo que quedó a medias antes de reiniciar ya no se puede retomar.
@@ -53,12 +56,7 @@ server.listen(env.PORT, () => {
   console.log(`Servidor escuchando en http://localhost:${env.PORT}`);
 });
 
-async function shutdown(signal: string): Promise<void> {
-  console.log(`${signal} recibido, cerrando...`);
-  await io.close();
-  await prisma.$disconnect();
-  process.exit(0);
-}
+const shutdown = createShutdown({ io, prisma, logger: console, exit: (code) => process.exit(code) });
 
 process.on("SIGINT", () => void shutdown("SIGINT"));
 process.on("SIGTERM", () => void shutdown("SIGTERM"));
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w server
npm run typecheck
```

Expected: PASS (todo el servidor: **589 pruebas**) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): pool de conexiones afinado para Neon y cierre ordenado con SIGTERM" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Empaquetado del servidor con esbuild

**Files:**
- Create: `server/scripts/build.ts`, `server/test/bundle/bundle.test.ts`
- Modify: `server/package.json`, `package.json`

**Interfaces:**
- Produces: `buildServer({ outfile? }): Promise<string>` (devuelve la ruta del archivo; por defecto `server/dist/index.js`) y `EXTERNAL`, las dependencias de `server/package.json` que quedan fuera del paquete (todas menos `@pokemon-minigames/shared`, cuyo código es TypeScript y debe ir dentro). El cliente de Prisma generado va dentro.
- Scripts nuevos: `npm run build -w server` (empaqueta), `npm start -w server` (`node dist/index.js`); en la raíz, `npm run build` (cliente y servidor) y `npm start`.

- [ ] **Step 1: Escribir la prueba que falla**

`server/test/bundle/bundle.test.ts` (construye el paquete, lo arranca con `node` en modo producción contra la base de pruebas, comprueba que responde y aplica las protecciones, y que se niega a arrancar con una configuración insegura; una de las pruebas se omite en Windows):

```ts
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
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w server -- test/bundle
```

Expected: FAIL — no existe `scripts/build.ts`.

- [ ] **Step 3: Implementar**

`server/scripts/build.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  dependencies: Record<string, string>;
};

/**
 * Todo lo que se instala desde npm queda fuera del archivo (en el despliegue ya está en node_modules), salvo el paquete
 * compartido: su código es TypeScript (`shared/` exporta sus .ts) y tiene que ir dentro.
 */
export const EXTERNAL = Object.keys(pkg.dependencies).filter((name) => name !== "@pokemon-minigames/shared");

/** Empaqueta el servidor en un solo archivo ejecutable con `node` (arranca más rápido y gasta menos memoria que `tsx`). */
export async function buildServer(options: { outfile?: string } = {}): Promise<string> {
  const outfile = options.outfile ?? fileURLToPath(new URL("../dist/index.js", import.meta.url));
  await build({
    entryPoints: [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    outfile,
    external: EXTERNAL,
    sourcemap: true,
    logLevel: "warning",
  });
  return outfile;
}

if (import.meta.filename === process.argv[1]) {
  const outfile = await buildServer();
  console.log(`Servidor empaquetado en ${outfile}`);
}
```

`server/package.json` (scripts `build` y `start`):

```diff
diff --git a/server/package.json b/server/package.json
index feff529..a358aa7 100644
--- a/server/package.json
+++ b/server/package.json
@@ -4,6 +4,8 @@
   "type": "module",
   "scripts": {
     "dev": "tsx watch --env-file=.env src/index.ts",
+    "build": "tsx scripts/build.ts",
+    "start": "node dist/index.js",
     "test": "vitest run",
     "test:watch": "vitest",
     "typecheck": "tsc --noEmit",
```

`package.json` de la raíz:

```diff
diff --git a/package.json b/package.json
index 43467b2..51bf75d 100644
--- a/package.json
+++ b/package.json
@@ -9,7 +9,8 @@
   "scripts": {
     "dev": "npm run dev -w server",
     "dev:client": "npm run dev -w client",
-    "build": "npm run build -w client",
+    "build": "npm run build -w client && npm run build -w server",
+    "start": "npm start -w server",
     "test": "npm test --workspaces --if-present",
     "typecheck": "npm run typecheck --workspaces --if-present"
   }
```

Instalar esbuild como dependencia de desarrollo del servidor:

```bash
npm install -D esbuild@^0.28.2 -w server
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w server -- test/bundle
npm run typecheck
```

Expected: PASS (4 pruebas, una omitida en Windows) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): empaquetado con esbuild en un solo archivo para producción" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: El cliente avisa del arranque lento y traduce el 429

**Files:**
- Create: `client/src/components/LoadingScreen.tsx`, `client/test/components/loading-screen.test.tsx`, `client/test/i18n/rate-limit.test.ts`, `client/test/pages/auth-rate-limit.test.tsx`
- Modify: `client/src/i18n/es.ts`, `client/src/pages/AuthForm.tsx`, `client/src/routes.tsx`

**Interfaces:**
- Consumes: el código `RATE_LIMITED` (con `details.retryAfterSeconds`) que envía el servidor y `Endpoints.auth.*` ya existentes.
- Produces: `SLOW_START_MS` (5000) y `LoadingScreen()` — `role="status"` con "Cargando…" y, pasados 5 s, "El servidor se está despertando, puede tardar hasta un minuto…" (se va al desmontarse); `retryAfterOf(details): number | undefined` y `rateLimitMessage(seconds): string` en `i18n/es.ts` ("Demasiados intentos. Inténtalo de nuevo en 40 s / 9 min." o, sin una espera usable, "…más tarde."). `AuthForm` muestra ese mensaje cuando el error es `RATE_LIMITED`; `routes.tsx` usa `LoadingScreen` mientras se recupera la sesión.

- [ ] **Step 1: Escribir las pruebas que fallan**

`client/test/components/loading-screen.test.tsx` (el aviso aparece a los 5 s y no antes, y se limpia al desmontar):

```tsx
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoadingScreen, SLOW_START_MS } from "../../src/components/LoadingScreen";
import { AppRoutes } from "../../src/routes";
import { fakeServices, renderWithServices } from "../helpers/services";

const HINT = "El servidor se está despertando, puede tardar hasta un minuto…";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("LoadingScreen", () => {
  it("al principio solo dice que está cargando", () => {
    render(<LoadingScreen />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando…");
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });

  it("pasados 5 segundos avisa de que el servidor se está despertando", () => {
    expect(SLOW_START_MS).toBe(5000);
    render(<LoadingScreen />);
    act(() => void vi.advanceTimersByTime(SLOW_START_MS - 1));
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(1));
    expect(screen.getByText(HINT)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(HINT);
  });

  it("si se desmonta antes, no deja un temporizador pendiente", () => {
    const { unmount } = render(<LoadingScreen />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("la pantalla de carga de la sesión", () => {
  it("muestra el aviso si recuperar la sesión tarda, y desaparece cuando el servidor responde", () => {
    const services = fakeServices();
    renderWithServices(<AppRoutes />, { services, route: "/" });
    expect(services.session.getState().status).toBe("loading");
    act(() => void vi.advanceTimersByTime(SLOW_START_MS));
    expect(screen.getByText(HINT)).toBeInTheDocument();

    act(() => services.session.setState({ status: "anonymous", user: null }));
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
  });
});
```

`client/test/i18n/rate-limit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rateLimitMessage, retryAfterOf } from "../../src/i18n/es";

describe("rateLimitMessage", () => {
  it.each([
    [1, "Demasiados intentos. Inténtalo de nuevo en 1 s."],
    [45, "Demasiados intentos. Inténtalo de nuevo en 45 s."],
    [59, "Demasiados intentos. Inténtalo de nuevo en 59 s."],
    [60, "Demasiados intentos. Inténtalo de nuevo en 1 min."],
    [61, "Demasiados intentos. Inténtalo de nuevo en 2 min."],
    [900, "Demasiados intentos. Inténtalo de nuevo en 15 min."],
    [3600, "Demasiados intentos. Inténtalo de nuevo en 60 min."],
  ])("con %s segundos de espera dice: %s", (seconds, expected) => {
    expect(rateLimitMessage(seconds)).toBe(expected);
  });

  it.each([undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY])("sin una espera usable (%s) no inventa un número", (value) => {
    expect(rateLimitMessage(value)).toBe("Demasiados intentos. Inténtalo de nuevo más tarde.");
  });
});

describe("retryAfterOf", () => {
  it("lee la espera de los detalles del error", () => {
    expect(retryAfterOf({ retryAfterSeconds: 42 })).toBe(42);
  });

  it.each([undefined, null, "texto", 7, [], {}, { retryAfterSeconds: "42" }, { retryAfterSeconds: null }])(
    "ignora detalles que no traen un número (%j)",
    (details) => {
      expect(retryAfterOf(details)).toBeUndefined();
    },
  );
});
```

`client/test/pages/auth-rate-limit.test.tsx` (el formulario muestra la espera del 429):

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ApiError } from "../../src/api/client";
import { LoginPage, RegisterPage } from "../../src/pages/AuthPages";
import { fakeServices, renderWithServices } from "../helpers/services";

async function fillLogin(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Email"), "ash@example.com");
  await user.type(screen.getByLabelText("Contraseña"), "pikachu-123");
  await user.click(screen.getByRole("button", { name: "Entrar" }));
}

describe("demasiados intentos en el formulario de acceso", () => {
  it("el 429 se explica en español y dice cuánto esperar", async () => {
    const services = fakeServices();
    services.endpoints.auth.login = async () => {
      throw new ApiError(429, "RATE_LIMITED", { retryAfterSeconds: 540 });
    };
    renderWithServices(<LoginPage />, { services });
    const user = userEvent.setup();
    await fillLogin(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Demasiados intentos. Inténtalo de nuevo en 9 min.");
  });

  it("si el servidor no informa la espera, no inventa una", async () => {
    const services = fakeServices();
    services.endpoints.auth.login = async () => {
      throw new ApiError(429, "RATE_LIMITED");
    };
    renderWithServices(<LoginPage />, { services });
    const user = userEvent.setup();
    await fillLogin(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Demasiados intentos. Inténtalo de nuevo más tarde.");
  });

  it("el botón vuelve a estar disponible para reintentar cuando pase el tiempo", async () => {
    const services = fakeServices();
    services.endpoints.auth.login = async () => {
      throw new ApiError(429, "RATE_LIMITED", { retryAfterSeconds: 30 });
    };
    renderWithServices(<LoginPage />, { services });
    const user = userEvent.setup();
    await fillLogin(user);
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
  });

  it("el registro también explica el 429", async () => {
    const services = fakeServices();
    services.endpoints.auth.register = async () => {
      throw new ApiError(429, "RATE_LIMITED", { retryAfterSeconds: 3000 });
    };
    renderWithServices(<RegisterPage />, { services });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.type(screen.getByLabelText("Nombre de usuario"), "ash");
    await user.type(screen.getByLabelText("Contraseña"), "pikachu-123");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Demasiados intentos. Inténtalo de nuevo en 50 min.");
  });

  it("los otros errores siguen mostrando su propio mensaje", async () => {
    const services = fakeServices();
    services.endpoints.auth.login = async () => {
      throw new ApiError(401, "INVALID_CREDENTIALS");
    };
    renderWithServices(<LoginPage />, { services });
    const user = userEvent.setup();
    await fillLogin(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Email o contraseña incorrectos.");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w client -- test/components/loading-screen.test.tsx test/i18n/rate-limit.test.ts test/pages/auth-rate-limit.test.tsx
```

Expected: FAIL — no existen `LoadingScreen`, `retryAfterOf` ni `rateLimitMessage`.

- [ ] **Step 3: Implementar**

`client/src/components/LoadingScreen.tsx`:

```tsx
import { useEffect, useState } from "react";

/** Si la sesión tarda más que esto en recuperarse, el servidor probablemente se estaba durmiendo (capa gratuita). */
export const SLOW_START_MS = 5000;

export function LoadingScreen() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_START_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div role="status" className="text-center text-muted">
      <p>Cargando…</p>
      {slow ? <p className="mt-2 text-sm">El servidor se está despertando, puede tardar hasta un minuto…</p> : null}
    </div>
  );
}
```

`client/src/i18n/es.ts`:

```diff
diff --git a/client/src/i18n/es.ts b/client/src/i18n/es.ts
index 7f4cff6..b420d02 100644
--- a/client/src/i18n/es.ts
+++ b/client/src/i18n/es.ts
@@ -53,6 +53,22 @@ export function errorMessage(code: string | undefined): string {
   return ERROR_MESSAGES.INTERNAL_ERROR;
 }
 
+/** Los segundos que el servidor pide esperar (`details.retryAfterSeconds` de un 429), si vienen como número. */
+export function retryAfterOf(details: unknown): number | undefined {
+  if (typeof details !== "object" || details === null) return undefined;
+  const value = (details as { retryAfterSeconds?: unknown }).retryAfterSeconds;
+  return typeof value === "number" ? value : undefined;
+}
+
+/** "Demasiados intentos. Inténtalo de nuevo en 9 min."; sin una espera usable, sin número. */
+export function rateLimitMessage(retryAfterSeconds: number | undefined): string {
+  if (retryAfterSeconds === undefined || !Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) {
+    return "Demasiados intentos. Inténtalo de nuevo más tarde.";
+  }
+  const wait = retryAfterSeconds < 60 ? `${Math.ceil(retryAfterSeconds)} s` : `${Math.ceil(retryAfterSeconds / 60)} min`;
+  return `Demasiados intentos. Inténtalo de nuevo en ${wait}.`;
+}
+
 /** Errores tras los que tiene sentido salir de la sala y volver al lobby. */
 export const ROOM_GONE_CODES: readonly string[] = ["ROOM_NOT_FOUND", "NOT_IN_ROOM", "ROOM_CLOSED"];
```

`client/src/pages/AuthForm.tsx`:

```diff
diff --git a/client/src/pages/AuthForm.tsx b/client/src/pages/AuthForm.tsx
index bbb54a8..18386ec 100644
--- a/client/src/pages/AuthForm.tsx
+++ b/client/src/pages/AuthForm.tsx
@@ -3,7 +3,7 @@ import { ApiError } from "../api/client";
 import { Button } from "../components/Button";
 import { Notice } from "../components/Notice";
 import { TextField } from "../components/TextField";
-import { errorMessage } from "../i18n/es";
+import { errorMessage, rateLimitMessage, retryAfterOf } from "../i18n/es";
 import { type FieldErrors, serverFieldErrors } from "./auth-validation";
 
 export interface AuthFormProps {
@@ -16,6 +16,10 @@ export interface AuthFormProps {
   footer: ReactNode;
 }
 
+/** El 429 dice cuánto esperar; los demás errores ya traen su mensaje en español. */
+const describe = (error: ApiError): string =>
+  error.code === "RATE_LIMITED" ? rateLimitMessage(retryAfterOf(error.details)) : error.message;
+
 /** Formulario común de inicio de sesión y registro: valida, envía y muestra los errores del servidor. */
 export function AuthForm({ title, submitLabel, withUsername = false, validate, onSubmit, footer }: AuthFormProps) {
   const [values, setValues] = useState({ email: "", username: "", password: "" });
@@ -44,7 +48,7 @@ export function AuthForm({ title, submitLabel, withUsername = false, validate, o
       const fields = error instanceof ApiError ? serverFieldErrors(error) : {};
       setErrors(fields);
       // Si el servidor señaló campos concretos, el aviso general sobra.
-      setFormError(Object.keys(fields).length > 0 ? null : error instanceof ApiError ? error.message : errorMessage(undefined));
+      setFormError(Object.keys(fields).length > 0 ? null : error instanceof ApiError ? describe(error) : errorMessage(undefined));
       setSubmitting(false);
     }
   }
```

`client/src/routes.tsx`:

```diff
diff --git a/client/src/routes.tsx b/client/src/routes.tsx
index d93ecc4..0a295ea 100644
--- a/client/src/routes.tsx
+++ b/client/src/routes.tsx
@@ -1,18 +1,11 @@
 import { Navigate, Outlet, Route, Routes, useLocation } from "react-router";
+import { LoadingScreen } from "./components/LoadingScreen";
 import { useSession } from "./services";
 import { LoginPage, RegisterPage } from "./pages/AuthPages";
 import { LobbyPage } from "./pages/Lobby";
 import { ProfilePage } from "./pages/profile/ProfilePage";
 import { RoomPage } from "./pages/room/RoomPage";
 
-function LoadingScreen() {
-  return (
-    <p role="status" className="text-center text-muted">
-      Cargando…
-    </p>
-  );
-}
-
 /** Rutas que exigen sesión: sin ella llevan a /login y, tras entrar, vuelven a donde se iba. */
 function RequireAuth() {
   const status = useSession((s) => s.status);
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w client
npm run typecheck
npm run build -w client
```

Expected: PASS (todo el cliente: **423 pruebas**), `tsc` sin errores y `vite build` correcto.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): aviso de servidor que despierta y mensaje del límite de intentos" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Prueba E2E con dos navegadores

**Files:**
- Create: `e2e/package.json`, `e2e/tsconfig.json`, `e2e/playwright.config.ts`, `e2e/global-setup.ts`, `e2e/support/app.ts`, `e2e/tests/game.spec.ts`, `e2e/tests/reload.spec.ts`, `e2e/tests/theme.spec.ts`, `e2e/tests/login-limit.spec.ts`
- Modify: `package.json`, `.gitignore`

**Interfaces:**
- Consumes: la construcción de producción (`client/dist` y `server/dist/index.js`, Task 7), el seed del catálogo real, las protecciones de las Tasks 1 a 6.
- Produces: el workspace `@pokemon-minigames/e2e` y `npm run e2e` (en la raíz construye y ejecuta; `npm run e2e -w e2e` solo ejecuta). La preparación global crea la base `pokemon_minigames_e2e` (con `E2E_ADMIN_DATABASE_URL`, o la conexión de `server/.env`), aplica las migraciones y siembra el catálogo (lanzando Prisma y tsx directamente con `node`, sin shell), arranca `node server/dist/index.js` con `NODE_ENV=production PORT=4321 COOKIE_SECURE=true COOKIE_SAME_SITE=lax TRUST_PROXY=1 BCRYPT_COST=4`, espera a `/health` y, al terminar, detiene el servidor y borra la base. Cada jugador usa su propio `X-Forwarded-For`, así que no comparten límites. `E2E_CHANNEL` elige un navegador ya instalado (`msedge`, `chrome`).
- `support/app.ts`: `newPlayer(browser, name)`, `register`, `logIn`, `createOneRoundRoom`, `joinRoom`, `roundTypes`, `answer`, `fact` y `validAnswerFor` (la respuesta válida sale del snapshot del catálogo).

- [ ] **Step 1: Escribir las pruebas que fallan**

Los ayudantes, `e2e/support/app.ts`:

```ts
import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Browser, type BrowserContext, type Page, expect } from "@playwright/test";

export const PASSWORD = "pikachu-123";

interface SnapshotPokemon {
  types: string[];
  names: { es: string; en: string };
}
const snapshot = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../server/data/catalog.snapshot.json", import.meta.url)), "utf8"),
) as { pokemon: SnapshotPokemon[] };

/** Un Pokémon que tiene los dos tipos del par (el servidor garantiza que cada par tiene al menos dos). */
export function validAnswerFor(types: string[]): string {
  const found = snapshot.pokemon.find((p) => p.types.length === 2 && types.every((type) => p.types.includes(type)));
  if (!found) throw new Error(`No hay ningún Pokémon con los tipos ${types.join(" y ")}`);
  return found.names.en;
}

export interface Player {
  name: string;
  email: string;
  ip: string;
  context: BrowserContext;
  page: Page;
}

/**
 * Una persona con su propio navegador limpio. El servidor de la prueba está configurado como en Render (detrás de un
 * proxy: `TRUST_PROXY=1`) y los límites de peticiones son por IP; cada persona manda una IP distinta en `X-Forwarded-For`
 * para que las pruebas no compartan límites.
 */
export async function newPlayer(browser: Browser, label: string): Promise<Player> {
  const name = `${label}_${randomInt(10_000, 99_999)}`;
  const ip = `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`;
  const context = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": ip } });
  const page = await context.newPage();
  return { name, email: `${name}@example.com`, ip, context, page };
}

export async function register({ page, name, email }: Player): Promise<void> {
  await page.goto("/registro");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Nombre de usuario").fill(name);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("heading", { name: "Lobby" })).toBeVisible();
}

export async function logIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

/** Crea una sala aleatoria de una sola ronda y devuelve su código. */
export async function createOneRoundRoom(page: Page): Promise<string> {
  await page.getByLabel("Largo de la partida").selectOption("custom-rounds");
  await page.getByLabel("Máximo de rondas").fill("1");
  await page.getByRole("button", { name: "Crear sala" }).click();
  const code = page.getByLabel("Código de la sala");
  await expect(code).toBeVisible();
  return ((await code.textContent()) ?? "").trim();
}

export async function joinRoom(page: Page, code: string): Promise<void> {
  await page.getByLabel("Código de sala").fill(code);
  await page.getByRole("button", { name: "Unirse" }).click();
}

/** Espera a que empiece la ronda y devuelve los dos tipos (en inglés) que se enfrentan. */
export async function roundTypes(page: Page): Promise<string[]> {
  const pair = page.getByLabel("Par de tipos");
  await expect(pair).toBeVisible({ timeout: 30_000 });
  return pair.locator("[data-type]").evaluateAll((chips) => chips.map((chip) => (chip as HTMLElement).dataset.type ?? ""));
}

export async function answer(page: Page, text: string): Promise<void> {
  const field = page.getByRole("combobox", { name: "Nombre del Pokémon" });
  await field.fill(text);
  await field.press("Enter");
}

/** El valor que acompaña a una etiqueta de las estadísticas del perfil ("Partidas" → "1"). */
export function fact(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator("xpath=following-sibling::dd");
}
```

La partida completa y el perfil de cada jugador, `e2e/tests/game.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { answer, createOneRoundRoom, fact, joinRoom, newPlayer, register, roundTypes, validAnswerFor } from "../support/app";

test("dos personas juegan una partida completa y el perfil de cada una la cuenta", async ({ browser }) => {
  const ash = await newPlayer(browser, "ash");
  const misty = await newPlayer(browser, "misty");
  try {
    await register(ash);
    await register(misty);

    const code = await createOneRoundRoom(ash.page);
    await joinRoom(misty.page, code);

    // La cuenta atrás de 5 s y la ronda empiezan solas cuando están los dos.
    const types = await roundTypes(ash.page);
    expect(types).toHaveLength(2);
    expect(await roundTypes(misty.page)).toEqual(types);

    // Ash acierta; Misty responde algo que no existe, y eso cierra la ronda al instante.
    await answer(ash.page, validAnswerFor(types));
    await answer(misty.page, "zzzzzz");

    await expect(ash.page.getByRole("heading", { name: "Ganaste" })).toBeVisible({ timeout: 30_000 });
    await expect(misty.page.getByRole("heading", { name: "Perdiste" })).toBeVisible({ timeout: 30_000 });

    // Desde el resumen, Misty abre el perfil de su rival: solo estadísticas, sin historial.
    await misty.page.getByRole("button", { name: `Ver perfil de ${ash.name}` }).click();
    await expect(misty.page.getByRole("heading", { name: ash.name })).toBeVisible();
    await expect(fact(misty.page, "Ganadas")).toHaveText("1");
    await expect(misty.page.getByRole("heading", { name: "Historial" })).toHaveCount(0);

    // El perfil propio de cada una cuenta la partida.
    await ash.page.getByRole("link", { name: "Mi perfil" }).click();
    await expect(ash.page.getByRole("heading", { name: "Tu perfil" })).toBeVisible();
    await expect(fact(ash.page, "Partidas")).toHaveText("1");
    await expect(fact(ash.page, "Ganadas")).toHaveText("1");
    await expect(ash.page.getByRole("list", { name: "Historial de partidas" }).getByRole("listitem")).toHaveCount(1);

    await misty.page.getByRole("link", { name: "Mi perfil" }).click();
    await expect(fact(misty.page, "Partidas")).toHaveText("1");
    await expect(fact(misty.page, "Perdidas")).toHaveText("1");
  } finally {
    await ash.context.close();
    await misty.context.close();
  }
});
```

Recargar en plena ronda, `e2e/tests/reload.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { answer, createOneRoundRoom, joinRoom, newPlayer, register, roundTypes, validAnswerFor } from "../support/app";

test("recargar la página en plena ronda recupera la partida", async ({ browser }) => {
  const ash = await newPlayer(browser, "ash");
  const misty = await newPlayer(browser, "misty");
  try {
    await register(ash);
    await register(misty);
    const code = await createOneRoundRoom(ash.page);
    await joinRoom(misty.page, code);

    const types = await roundTypes(ash.page);
    await roundTypes(misty.page);

    // Ash recarga con la ronda en marcha: el navegador pierde todo salvo la cookie de sesión.
    await ash.page.reload();
    await expect(ash.page).toHaveURL(new RegExp(`/sala/${code}$`));
    expect(await roundTypes(ash.page)).toEqual(types);
    await expect(ash.page.getByRole("timer")).toBeVisible();
    await expect(ash.page.getByRole("combobox", { name: "Nombre del Pokémon" })).toBeEnabled();

    // La partida sigue su curso y termina con normalidad.
    await answer(ash.page, validAnswerFor(types));
    await answer(misty.page, "zzzzzz");
    await expect(ash.page.getByRole("heading", { name: "Ganaste" })).toBeVisible({ timeout: 30_000 });
    await expect(misty.page.getByRole("heading", { name: "Perdiste" })).toBeVisible({ timeout: 30_000 });
  } finally {
    await ash.context.close();
    await misty.context.close();
  }
});
```

El tema del perfil en un navegador nuevo, `e2e/tests/theme.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { PASSWORD, logIn, newPlayer, register } from "../support/app";

test("el tema guardado en el perfil se aplica en un navegador nuevo tras iniciar sesión", async ({ browser }) => {
  const first = await newPlayer(browser, "tema");
  const second = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": first.ip } });
  try {
    await register(first);
    const saved = first.page.waitForResponse((r) => r.url().endsWith("/auth/me/preferences") && r.request().method() === "PUT");
    await first.page.getByRole("combobox", { name: "Tema" }).selectOption("pokedex");
    await saved;
    const savedMode = first.page.waitForResponse((r) => r.url().endsWith("/auth/me/preferences") && r.request().method() === "PUT");
    await first.page.getByRole("combobox", { name: "Modo" }).selectOption("oscuro");
    expect((await savedMode).status()).toBe(200);

    // Otro navegador (sin nada guardado): al iniciar sesión se aplica la preferencia del perfil.
    const page = await second.newPage();
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "clasico");
    await logIn(page, first.email, PASSWORD);
    await expect(page.getByRole("heading", { name: "Lobby" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "pokedex");
    await expect(page.locator("html")).toHaveAttribute("data-mode", "oscuro");
    await expect(page.getByRole("combobox", { name: "Tema" })).toHaveValue("pokedex");
  } finally {
    await first.context.close();
    await second.close();
  }
});
```

El límite de intentos de login, `e2e/tests/login-limit.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { PASSWORD, logIn, newPlayer, register } from "../support/app";

test("tras varias contraseñas erróneas el servidor responde 429 y el mensaje dice cuánto esperar", async ({ browser }) => {
  const owner = await newPlayer(browser, "limite");
  // Otro navegador y la misma IP: así se comprueba el límite por IP y correo, no una cookie.
  const attacker = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": owner.ip } });
  try {
    await register(owner);
    const page = await attacker.newPage();

    for (let attempt = 1; attempt <= 5; attempt++) {
      await logIn(page, owner.email, "mala-clave-1");
      await expect(page.getByRole("alert")).toHaveText("Email o contraseña incorrectos.");
    }

    // El sexto intento, aunque lleve la contraseña correcta, ya está bloqueado.
    await logIn(page, owner.email, PASSWORD);
    await expect(page.getByRole("alert")).toHaveText(/^Demasiados intentos\. Inténtalo de nuevo en (14|15) min\.$/);
    await expect(page).toHaveURL(/\/login$/);

    // No es un bloqueo de la cuenta: desde otra IP la contraseña correcta funciona.
    const other = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": "10.250.250.250" } });
    try {
      const otherPage = await other.newPage();
      await logIn(otherPage, owner.email, PASSWORD);
      await expect(otherPage.getByRole("heading", { name: "Lobby" })).toBeVisible();
    } finally {
      await other.close();
    }
  } finally {
    await owner.context.close();
    await attacker.close();
  }
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm run e2e -w e2e
```

Expected: FAIL — `No workspaces found` (el workspace `e2e` todavía no existe).

- [ ] **Step 3: Implementar**

`e2e/package.json`:

```json
{
  "name": "@pokemon-minigames/e2e",
  "private": true,
  "type": "module",
  "scripts": {
    "e2e": "playwright test",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@playwright/test": "^1.63.0",
    "@types/node": "^24.0.0",
    "@types/pg": "^8.23.1",
    "pg": "^8.23.1",
    "tsx": "^4.23.15",
    "typescript": "^7.0.2"
  }
}
```

`e2e/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "types": ["node"],
    "lib": ["ES2023", "DOM"]
  },
  "include": ["*.ts", "support", "tests"]
}
```

`e2e/playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

const port = process.env.E2E_PORT ?? "4321";

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  // Un solo servidor y una sola base de datos: las pruebas se aíslan por usuario e IP, pero van de a una para que
  // los tiempos (cuenta atrás de 5 s, rondas) no dependan de la carga de la máquina.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "es-CR",
  },
  projects: [
    {
      name: "chromium",
      // Por defecto el Chromium de Playwright (`npx playwright install chromium`). Sin descargarlo, E2E_CHANNEL=msedge
      // o E2E_CHANNEL=chrome usan el navegador que ya tengas instalado.
      use: { ...devices["Desktop Chrome"], channel: process.env.E2E_CHANNEL || undefined },
    },
  ],
});
```

`e2e/global-setup.ts`:

```ts
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = join(root, "server");
const DATABASE = "pokemon_minigames_e2e";
const PORT = Number(process.env.E2E_PORT ?? 4321);

/** Conexión con permiso para crear bases de datos: la variable E2E_ADMIN_DATABASE_URL (CI) o la DATABASE_URL de server/.env. */
function adminUrl(): string {
  if (process.env.E2E_ADMIN_DATABASE_URL) return process.env.E2E_ADMIN_DATABASE_URL;
  const file = join(serverDir, ".env");
  if (!existsSync(file)) {
    throw new Error("Falta server/.env (o la variable E2E_ADMIN_DATABASE_URL) para poder crear la base de datos de la prueba E2E.");
  }
  const line = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("server/.env no define DATABASE_URL.");
  return line.slice("DATABASE_URL=".length).replace(/^"|"$/g, "");
}

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

  const admin = adminUrl();
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
```

`package.json` de la raíz (el workspace y el script):

```diff
diff --git a/package.json b/package.json
index 51bf75d..60d0df5 100644
--- a/package.json
+++ b/package.json
@@ -4,13 +4,15 @@
   "workspaces": [
     "shared",
     "server",
-    "client"
+    "client",
+    "e2e"
   ],
   "scripts": {
     "dev": "npm run dev -w server",
     "dev:client": "npm run dev -w client",
     "build": "npm run build -w client && npm run build -w server",
     "start": "npm start -w server",
+    "e2e": "npm run build && npm run e2e -w e2e",
     "test": "npm test --workspaces --if-present",
     "typecheck": "npm run typecheck --workspaces --if-present"
   }
```

`.gitignore`:

```diff
diff --git a/.gitignore b/.gitignore
index 1b4ffa6..b3fe1ef 100644
--- a/.gitignore
+++ b/.gitignore
@@ -7,3 +7,6 @@ coverage/
 !.env.example
 !.env.test.example
 server/src/generated/
+
+e2e/test-results/
+e2e/playwright-report/
```

Instalar las dependencias del workspace y, si no vas a usar un navegador ya instalado, el Chromium de Playwright:

```bash
npm install
npx playwright install chromium
```

(en Windows, con Edge ya instalado, puedes omitir el segundo y definir `E2E_CHANNEL=msedge`).

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm run e2e
npm run typecheck
```

Expected: **4 pruebas pasan** (partida completa, recarga en plena ronda, tema entre navegadores y límite de intentos; tardan cerca de un minuto), la base `pokemon_minigames_e2e` ya no existe al terminar y `tsc` no da errores. Si falla, el informe queda en `e2e/playwright-report` y las capturas en `e2e/test-results`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(e2e): Playwright con dos navegadores contra el servidor de producción" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Prueba de humo contra la URL desplegada

**Files:**
- Create: `server/scripts/smoke-deployed.ts`, `server/test/scripts/smoke-deployed.test.ts`
- Modify: `server/package.json`, `package.json`

**Interfaces:**
- Produces: `runSmoke({ baseUrl, expectedNames = 1025, wakeTimeoutMs = 90_000, fetch?, sleep?, now? }): Promise<SmokeCheck[]>` con `SmokeCheck { name, ok, detail }`: espera a que `/health` responda (insiste cada 3 s hasta `wakeTimeoutMs`; si no despierta devuelve una sola comprobación fallida) y comprueba el cliente en `/` y en las pantallas, la caché de `index.html` y de los archivos con hash, `/pokemon/names`, las rutas protegidas (401), el 404 en JSON de la API, el rechazo de un origen ajeno (un único `POST` con `Origin` ajeno, que el servidor rechaza antes de procesarlo), la ausencia de CORS y HTTPS. Solo hace `GET` y ese `POST`: no crea cuentas ni escribe nada.
- Scripts: `npm run smoke:deployed -- URL` (en la raíz) y `npm run smoke:deployed -w server -- URL`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`server/test/scripts/smoke-deployed.test.ts` (con un `fetch` falso: el camino feliz y cada comprobación rota por separado, y el despertar con un `sleep` y un reloj falsos):

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { type SmokeCheck, runSmoke } from "../../scripts/smoke-deployed.js";
import { buildTestContext } from "../helpers/app.js";
import { prisma, resetDatabase } from "../helpers/db.js";

const INDEX = '<!doctype html><html><body><div id="root"></div><script type="module" src="/assets/app.abc123.js"></script></body></html>';

let workdir: string;
let server: Server;
let baseUrl: string;
const requests: { method: string; path: string; origin: string | undefined }[] = [];

beforeAll(async () => {
  await resetDatabase();
  workdir = mkdtempSync(join(tmpdir(), "pm-smoke-"));
  mkdirSync(join(workdir, "assets"));
  writeFileSync(join(workdir, "index.html"), INDEX);
  writeFileSync(join(workdir, "assets", "app.abc123.js"), "console.log('cliente');");

  const { env, tokens, roomManager, catalog } = buildTestContext({ NODE_ENV: "production", COOKIE_SECURE: "true", TRUST_PROXY: "1" });
  const app = createApp({ env, prisma, tokens, roomManager, catalog, clientDist: workdir });
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
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w server -- test/scripts
```

Expected: FAIL — no existe `scripts/smoke-deployed.ts`.

- [ ] **Step 3: Implementar**

`server/scripts/smoke-deployed.ts`:

```ts
/**
 * Prueba de humo contra la URL de un servicio desplegado (Render):
 *
 *   npm run smoke:deployed -- https://mi-servicio.onrender.com
 *
 * No crea cuentas ni escribe nada: solo GET y un único POST con un origen ajeno que el servidor rechaza antes de
 * procesarlo. Espera a que el servicio despierte (la capa gratuita lo duerme) y comprueba lo que se puede ver desde fuera.
 */
export interface SmokeCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface SmokeOptions {
  baseUrl: string;
  /** Cuántos nombres de Pokémon debe traer `/pokemon/names` (1025 con el catálogo real). */
  expectedNames?: number;
  /** Cuánto esperar a que el servicio despierte. */
  wakeTimeoutMs?: number;
  /** Inyectables para las pruebas. */
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const FOREIGN_ORIGIN = "https://origen-ajeno.invalid";
const WAKE_POLL_MS = 3000;

export async function runSmoke(options: SmokeOptions): Promise<SmokeCheck[]> {
  const base = options.baseUrl.replace(/\/+$/, "");
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const wakeTimeoutMs = options.wakeTimeoutMs ?? 90_000;
  const expectedNames = options.expectedNames ?? 1025;

  const checks: SmokeCheck[] = [];
  const check = async (name: string, run: () => Promise<string>): Promise<void> => {
    try {
      checks.push({ name, ok: true, detail: await run() });
    } catch (error) {
      checks.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
    }
  };
  const expect = (condition: boolean, message: string): void => {
    if (!condition) throw new Error(message);
  };
  const json = async (response: Response): Promise<any> => response.json().catch(() => null);

  // 1. El servicio responde (puede estar durmiendo: se insiste hasta que despierte).
  const started = now();
  let healthy = false;
  while (!healthy && now() - started < wakeTimeoutMs) {
    try {
      const response = await doFetch(`${base}/health`);
      healthy = response.ok && (await json(response))?.status === "ok";
    } catch {
      // Sigue durmiendo o arrancando.
    }
    if (!healthy) await sleep(WAKE_POLL_MS);
  }
  if (!healthy) {
    return [{ name: "El servicio responde en /health", ok: false, detail: `no respondió en ${Math.round(wakeTimeoutMs / 1000)} s` }];
  }
  checks.push({ name: "El servicio responde en /health", ok: true, detail: `respondió tras ${Math.round((now() - started) / 1000)} s` });

  // 2 y 3. El cliente.
  let indexHtml = "";
  await check("Sirve el cliente en la raíz (HTML con el nodo raíz de React, sin caché)", async () => {
    const response = await doFetch(`${base}/`);
    indexHtml = await response.text();
    expect(response.status === 200, `responde ${response.status}`);
    expect((response.headers.get("content-type") ?? "").includes("text/html"), "no es HTML");
    expect(indexHtml.includes('id="root"'), "el HTML no tiene el nodo raíz de React");
    expect((response.headers.get("cache-control") ?? "").includes("no-cache"), "index.html debería revalidarse siempre (no-cache)");
    return "200 text/html";
  });

  await check("Las pantallas del cliente (/perfil, /login, /sala/ABC234) devuelven el cliente", async () => {
    for (const path of ["/perfil", "/login", "/sala/ABC234"]) {
      const response = await doFetch(`${base}${path}`);
      expect(response.status === 200 && (await response.text()).includes('id="root"'), `${path} no devuelve el cliente (${response.status})`);
    }
    return "3 rutas";
  });

  await check("Los archivos con hash del cliente se cachean para siempre", async () => {
    const asset = /(?:src|href)="(\/assets\/[^"]+)"/.exec(indexHtml)?.[1];
    expect(asset !== undefined, "index.html no enlaza ningún archivo de /assets");
    const response = await doFetch(`${base}${asset}`);
    expect(response.status === 200, `${asset} responde ${response.status}`);
    expect((response.headers.get("cache-control") ?? "").includes("immutable"), `${asset} no lleva Cache-Control inmutable`);
    return asset!;
  });

  // 4. La API.
  await check(`/pokemon/names trae los ${expectedNames} nombres`, async () => {
    const response = await doFetch(`${base}/pokemon/names`);
    const names = await json(response);
    expect(response.status === 200 && Array.isArray(names), `responde ${response.status}`);
    expect(names.length === expectedNames, `trae ${names.length} nombres y se esperaban ${expectedNames}`);
    expect(names.every((n: any) => typeof n.id === "number" && typeof n.es === "string" && typeof n.en === "string"), "algún nombre no tiene id, es y en");
    return `${names.length} nombres`;
  });

  await check("Las rutas protegidas piden sesión (401 UNAUTHORIZED)", async () => {
    for (const path of ["/stats", "/stats/history", "/rooms/current", "/auth/me"]) {
      const response = await doFetch(`${base}${path}`);
      expect(response.status === 401 && (await json(response))?.error?.code === "UNAUTHORIZED", `${path} no pide sesión (${response.status})`);
    }
    return "4 rutas";
  });

  await check("Una ruta de la API que no existe da 404 en JSON", async () => {
    const response = await doFetch(`${base}/auth/no-existe`);
    expect(response.status === 404 && (await json(response))?.error?.code === "NOT_FOUND", `responde ${response.status}`);
    return "404 NOT_FOUND";
  });

  // 5. Seguridad.
  await check("Rechaza una petición que cambia algo desde un origen ajeno (403 FORBIDDEN)", async () => {
    const response = await doFetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: FOREIGN_ORIGIN },
      body: JSON.stringify({ email: "humo@example.com", password: "no-importa" }),
    });
    expect(response.status === 403 && (await json(response))?.error?.code === "FORBIDDEN", `responde ${response.status}: debería rechazar el origen ajeno`);
    return "403 FORBIDDEN";
  });

  await check("No concede CORS a otros orígenes", async () => {
    const response = await doFetch(`${base}/health`, { headers: { Origin: FOREIGN_ORIGIN } });
    const allowed = response.headers.get("access-control-allow-origin");
    expect(allowed === null, `concede CORS a ${allowed}`);
    return "sin cabecera de CORS";
  });

  await check("La dirección usa HTTPS", async () => {
    const url = new URL(base);
    expect(url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1", `usa ${url.protocol}`);
    return url.protocol;
  });

  return checks;
}

if (import.meta.filename === process.argv[1]) {
  const baseUrl = process.argv[2];
  if (!baseUrl) {
    console.error("Uso: npm run smoke:deployed -- https://mi-servicio.onrender.com");
    process.exit(2);
  }
  console.log(`Prueba de humo de ${baseUrl} (si el servicio duerme, puede tardar hasta un minuto)...\n`);
  const checks = await runSmoke({ baseUrl });
  for (const { name, ok, detail } of checks) console.log(`${ok ? "OK    " : "FALLA "} ${name} — ${detail}`);
  const failed = checks.filter((c) => !c.ok).length;
  console.log(failed === 0 ? "\nTodo bien." : `\n${failed} comprobación(es) fallaron.`);
  // exitCode y no process.exit(): en Windows, salir con conexiones fetch aún cerrándose aborta Node con un error de libuv.
  process.exitCode = failed === 0 ? 0 : 1;
}
```

`server/package.json`:

```diff
diff --git a/server/package.json b/server/package.json
index a358aa7..d6cc97b 100644
--- a/server/package.json
+++ b/server/package.json
@@ -15,6 +15,7 @@
     "db:seed": "tsx --env-file=.env scripts/seed.ts",
     "catalog:fetch": "tsx scripts/fetch-catalog.ts",
     "smoke": "tsx scripts/smoke-game.ts",
+    "smoke:deployed": "tsx scripts/smoke-deployed.ts",
     "postinstall": "prisma generate"
   },
   "dependencies": {
```

`package.json` de la raíz:

```diff
diff --git a/package.json b/package.json
index 60d0df5..b207f32 100644
--- a/package.json
+++ b/package.json
@@ -13,6 +13,7 @@
     "build": "npm run build -w client && npm run build -w server",
     "start": "npm start -w server",
     "e2e": "npm run build && npm run e2e -w e2e",
+    "smoke:deployed": "npm run smoke:deployed -w server --",
     "test": "npm test --workspaces --if-present",
     "typecheck": "npm run typecheck --workspaces --if-present"
   }
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w server -- test/scripts
npm run typecheck
```

Expected: PASS (11 pruebas) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): prueba de humo contra la URL desplegada (sin escribir nada)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Configuración de Render, CI y guía de despliegue

**Files:**
- Create: `render.yaml`, `.node-version`, `.github/workflows/ci.yml`, `docs/despliegue.md`, `server/test/deploy/config-files.test.ts`
- Modify: `server/package.json`, `server/.env.example`, `README.md`

**Interfaces:**
- Consumes: `npm run build` (Task 7), `loadEnv` (Task 1), los scripts de la raíz y del servidor.
- La guía incluye la sección 5, "Verificar `TRUST_PROXY`", con dos pruebas manuales (IP inventada en `X-Forwarded-For`, y dos redes distintas) porque el número de proxies de Render no está documentado; `render.yaml` parte de `1`.
- Produces: el script `db:seed:prod` del servidor (`tsx scripts/seed.ts`, sin `--env-file`: en Render las variables ya están en el entorno); `render.yaml` con un único servicio web gratuito (`buildCommand`: `npm ci --include=dev && npm run build && npm run db:deploy -w server && npm run db:seed:prod -w server`; `startCommand`: `node server/dist/index.js`; `DATABASE_URL` con `sync: false` y `JWT_ACCESS_SECRET` con `generateValue: true`); el flujo de CI; la guía `docs/despliegue.md`; `.node-version` con `24`.

- [ ] **Step 1: Escribir la prueba que falla**

`server/test/deploy/config-files.test.ts` (lee los archivos reales: el Blueprint define un servicio gratuito con salud, construye en el orden correcto con scripts que existen, no guarda secretos y su configuración la acepta `loadEnv` en producción; el CI usa PostgreSQL 18, la misma versión de Node y el orden tipos → pruebas → construcción → E2E; la guía explica cada variable y no contiene claves reales; el README enlaza la guía):

```ts
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { loadEnv } from "../../src/config/env.js";

const root = new URL("../../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, root), "utf8");

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
      TRUST_PROXY: 1,
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
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm install -D yaml -w server
npm test -w server -- test/deploy
```

Expected: FAIL — no existen `render.yaml`, el flujo de CI, `.node-version` ni la guía.

- [ ] **Step 3: Implementar**

`render.yaml`:

```yaml
# Blueprint de Render: un solo servicio web gratuito que sirve la API, Socket.io y el cliente construido (un solo origen).
# Guía paso a paso: docs/despliegue.md
services:
  - type: web
    name: pokemon-minigames
    runtime: node
    plan: free
    # Cerca de Costa Rica; elige la misma región (AWS US East 1, N. Virginia) al crear el proyecto de Neon.
    region: virginia
    branch: main
    autoDeployTrigger: commit
    healthCheckPath: /health
    # Con NODE_ENV=production npm omite las dependencias de desarrollo, y hacen falta para construir (Vite, esbuild, tsx,
    # Prisma): por eso --include=dev. El catálogo se siembra de nuevo en cada despliegue (es idempotente).
    buildCommand: npm ci --include=dev && npm run build && npm run db:deploy -w server && npm run db:seed:prod -w server
    startCommand: node server/dist/index.js
    envVars:
      - key: NODE_VERSION
        value: "24"
      - key: NODE_ENV
        value: production
      # Cuántos proxies hay delante del servidor (de él depende la IP que ven los límites). Se empieza en 1 y se verifica tras
      # el primer despliegue (docs/despliegue.md, sección 5): hay informes de que Render pone más de uno.
      - key: TRUST_PROXY
        value: "1"
      - key: COOKIE_SECURE
        value: "true"
      - key: COOKIE_SAME_SITE
        value: lax
      - key: JWT_ACCESS_SECRET
        generateValue: true
      # La cadena de conexión de Neon (la directa, no la del pooler): se pega al crear el servicio y no se versiona.
      - key: DATABASE_URL
        sync: false
```

`.node-version` (Render y las herramientas de versiones de Node lo leen):

```
24
```

`.github/workflows/ci.yml` (PostgreSQL 18 como servicio; la E2E crea su propia base con `E2E_ADMIN_DATABASE_URL`; si falla, sube el informe):

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    services:
      postgres:
        image: postgres:18
        env:
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      PGHOST: localhost
      PGUSER: postgres
      PGPASSWORD: postgres
      # La prueba E2E crea y borra su propia base de datos con esta conexión.
      E2E_ADMIN_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/postgres
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm

      - name: Instalar dependencias
        run: npm ci

      - name: Base de datos de las pruebas del servidor
        run: |
          createdb pokemon_minigames_test
          cat > server/.env.test <<'EOF'
          NODE_ENV=test
          DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pokemon_minigames_test
          JWT_ACCESS_SECRET=clave-solo-para-pruebas-0123456789-abcdefghij
          BCRYPT_COST=4
          EOF

      - name: Tipos
        run: npm run typecheck

      - name: Pruebas del servidor y del cliente
        run: npm test

      - name: Construir (cliente y servidor)
        run: npm run build

      - name: Instalar Chromium para la prueba E2E
        run: npx playwright install --with-deps chromium
        working-directory: e2e

      - name: Prueba E2E (dos navegadores juegan una partida completa)
        run: npm run e2e -w e2e

      - name: Informe de la prueba E2E
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: informe-e2e
          path: |
            e2e/playwright-report
            e2e/test-results
          if-no-files-found: ignore
```

`server/package.json` (el script de siembra para producción; `yaml` ya quedó instalado en el paso anterior):

```diff
diff --git a/server/package.json b/server/package.json
index d6cc97b..b746516 100644
--- a/server/package.json
+++ b/server/package.json
@@ -13,6 +13,7 @@
     "db:migrate": "prisma migrate dev",
     "db:deploy": "prisma migrate deploy",
     "db:seed": "tsx --env-file=.env scripts/seed.ts",
+    "db:seed:prod": "tsx scripts/seed.ts",
     "catalog:fetch": "tsx scripts/fetch-catalog.ts",
     "smoke": "tsx scripts/smoke-game.ts",
     "smoke:deployed": "tsx scripts/smoke-deployed.ts",
```

`server/.env.example`:

```diff
diff --git a/server/.env.example b/server/.env.example
index f23f91a..512f23b 100644
--- a/server/.env.example
+++ b/server/.env.example
@@ -13,9 +13,15 @@ ACCESS_TOKEN_TTL_SECONDS=3600
 REFRESH_TOKEN_TTL_DAYS=7
 BCRYPT_COST=12
 
-# Origen del frontend (Vite) que puede llamar a la API con cookies.
+# Origen del frontend (Vite) que puede llamar a la API con cookies. En producción no se define: el servidor
+# sirve el cliente desde su mismo origen y no hay CORS.
 CORS_ORIGIN=http://localhost:5173
 
-# En producción con frontend y backend en dominios distintos: COOKIE_SECURE=true y COOKIE_SAME_SITE=none.
+# En producción (NODE_ENV=production) el servidor exige COOKIE_SECURE=true, un SameSite distinto de none y TRUST_PROXY.
+# Ver docs/despliegue.md.
 COOKIE_SECURE=false
 COOKIE_SAME_SITE=lax
+
+# Cuántos proxies hay delante del servidor (0 = ninguno). Define de dónde sale la IP de cada petición, que usan los
+# límites de intentos. En producción es obligatorio; en Render se verifica tras desplegar (docs/despliegue.md, sección 5).
+TRUST_PROXY=0
```

`docs/despliegue.md`, la guía paso a paso (para Marco, que es quien crea las cuentas):

````markdown
# Despliegue en Render y Neon

Esta guía deja el juego en internet sin gastar nada: **Render** aloja un único servicio (la API, los WebSockets y el cliente ya construido, todo en el mismo origen) y **Neon** aloja la base de datos PostgreSQL. No hace falta tarjeta en ninguno de los dos ni Docker.

## Qué esperar de la capa gratuita

- **El servicio se duerme** tras 15 minutos sin tráfico (ni peticiones ni mensajes de WebSocket). El primer acceso después tarda cerca de un minuto en despertar; el cliente muestra "El servidor se está despertando…" mientras tanto.
- **Las partidas viven en la memoria del servicio.** Si el servicio se reinicia (un despliegue nuevo, por ejemplo), las partidas que estaban en curso se marcan como abandonadas. Con el servicio dormido no puede haber partidas activas.
- **Neon apaga la base de datos** tras 5 minutos sin consultas y la despierta sola en la siguiente (la primera consulta tarda un poco). El servidor cierra las conexiones inactivas a los 10 segundos para no guardar ninguna que Neon vaya a cortar.
- Límites vigentes al escribir esto (2026-10): Render da 750 horas de servicio al mes y Neon 0,5 GB y 100 horas de cómputo. Compruébalos en [render.com/docs/free](https://render.com/docs/free) y [neon.com/pricing](https://neon.com/pricing) antes de depender de ellos.

## 1. Crear la base de datos en Neon

1. Entra en [neon.com](https://neon.com) y crea una cuenta.
2. Crea un proyecto. Elige la región **AWS US East 1 (N. Virginia)**, la misma del `render.yaml`, para que la base y el servicio estén cerca.
3. En el panel del proyecto abre **Connect** y copia la cadena de conexión **directa** (la que *no* tiene `-pooler` en el nombre del servidor). Se parece a:

   ```
   postgresql://usuario:clave@ep-algo-123456.us-east-1.aws.neon.tech/neondb?sslmode=require
   ```

   Es un secreto: no la subas a git ni la pegues en ningún sitio que no sea el panel de Render.

## 2. Crear el servicio en Render

1. Entra en [render.com](https://render.com), crea una cuenta y conéctala con tu cuenta de GitHub dándole acceso al repositorio `pokemon-minigames`.
2. **New → Blueprint** y elige el repositorio. Render lee [`render.yaml`](../render.yaml) y muestra el servicio `pokemon-minigames` (plan `free`).
3. Render te pide el valor de `DATABASE_URL`: pega la cadena de Neon del paso anterior. El resto de variables ya vienen en el archivo (`JWT_ACCESS_SECRET` lo genera Render).
4. **Apply**. Render construye y despliega.

## 3. El primer despliegue

La compilación hace, en este orden: instalar las dependencias (con las de desarrollo, que hacen falta para construir), construir el cliente y el servidor, aplicar las migraciones de la base de datos y sembrar el catálogo de 1025 Pokémon. Tarda unos minutos. Lo ves en la pestaña **Logs**; al final debe aparecer `Catálogo cargado: 1025 Pokémon` y `Servidor escuchando`.

Si falla, lo más común es una `DATABASE_URL` mal copiada (revisa que termine en `?sslmode=require` y no tenga espacios).

## 4. Comprobar que todo está bien

Render te da una dirección `https://pokemon-minigames-xxxx.onrender.com`. Desde tu máquina, con el repositorio clonado:

```bash
npm run smoke:deployed -- https://pokemon-minigames-xxxx.onrender.com
```

Espera a que el servicio despierte (hasta 90 segundos) y comprueba, sin crear cuentas ni escribir nada: que responde, que sirve el cliente y sus archivos con la caché correcta, que `/pokemon/names` trae los 1025 nombres, que las rutas protegidas piden sesión, que rechaza peticiones de orígenes ajenos y que no concede CORS. Todas las líneas deben decir `OK`.

Después abre la dirección en dos navegadores (o uno normal y otro privado), crea una cuenta en cada uno, crea una sala en uno y únete con el código desde el otro.

## 5. Verificar `TRUST_PROXY` (una sola vez, tras el primer despliegue)

Los límites de intentos dependen de que el servidor lea bien la IP de cada visitante, y eso depende de cuántos proxies hay entre internet y el servicio. El `render.yaml` parte de `1`, pero Render no documenta la cifra y hay informes de la comunidad de que hacen falta más (hasta 3: [hilo de la comunidad de Render](https://community.render.com/t/what-number-of-proxies-sit-in-front-of-an-express-app-deployed-on-render/35981)). Un valor equivocado es grave en los dos sentidos, y la prueba E2E y la de humo no pueden detectarlo porque en local no hay proxy: se comprueba a mano.

**Prueba 1: ¿el valor es demasiado alto?** (el servidor se fiaría de una IP inventada por el visitante y se podrían esquivar todos los límites). Seis intentos de login fallidos, cada uno con una IP falsa distinta en `X-Forwarded-For`:

```bash
for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "%{http_code} " -X POST https://TU-SERVICIO.onrender.com/auth/login -H "Content-Type: application/json" -H "X-Forwarded-For: 10.0.0.$i" -d email:prueba1@example.com; done; echo
```

Debe imprimir `401 401 401 401 401 429`: el servidor ignora la IP inventada y cuenta todos los intentos contra tu IP real. Si imprime seis `401`, el valor es demasiado alto: bájalo.

**Prueba 2: ¿el valor es demasiado bajo?** (todo el mundo compartiría la IP de un proxy de Render y, por ejemplo, solo se podrían hacer 5 registros por hora entre todos). Desde tu computadora haz cinco intentos fallidos con otro correo:

```bash
for i in 1 2 3 4 5; do curl -s -o /dev/null -w "%{http_code} " -X POST https://TU-SERVICIO.onrender.com/auth/login -H "Content-Type: application/json" -d email:prueba2@example.com; done; echo
```

Imprime `401 401 401 401 401`. Ahora, desde otra red (el celular con datos móviles, sin wifi), abre `https://TU-SERVICIO.onrender.com/login` e intenta entrar con `prueba2@example.com` y cualquier contraseña: debe decir "Email o contraseña incorrectos." Si dice "Demasiados intentos", las dos redes comparten IP para el servidor: el valor es demasiado bajo, súbelo.

**Cómo cambiarlo:** en el panel de Render, *Environment* → `TRUST_PROXY` → guardar (Render redespliega y, de paso, reinicia los límites, que viven en memoria). Empieza en `1`; si falla la Prueba 2 sube a `2` y luego a `3`, y repite las dos pruebas con cada valor. El correcto es el que pasa las dos. Anótalo en `render.yaml` y súbelo para que el repositorio diga lo mismo que el panel.

## Variables de entorno

| Variable | Valor en Render | Para qué |
|---|---|---|
| `NODE_ENV` | `production` | Activa las comprobaciones de producción: el servidor se niega a arrancar si algo de lo siguiente falta o es inseguro |
| `COOKIE_SECURE` | `true` | La cookie de sesión solo viaja por HTTPS |
| `COOKIE_SAME_SITE` | `lax` | Con un solo origen basta `lax` (`none` se rechaza en producción) |
| `TRUST_PROXY` | `1` de partida (verifícalo en la sección 5) | Cuántos proxies hay delante; si es menor que los reales el servidor ve la IP de un proxy de Render y los límites de intentos afectan a todo el mundo a la vez, y si es mayor cualquiera puede falsear su IP |
| `JWT_ACCESS_SECRET` | generado por Render | Firma de los tokens de acceso (mínimo 32 caracteres) |
| `DATABASE_URL` | la cadena de Neon | Conexión a la base de datos |
| `NODE_VERSION` | `24` | Versión de Node |
| `CORS_ORIGIN` | *(no se define)* | Con un solo origen no hay CORS; solo se usaría si se alojara el cliente en otro dominio |

## Seguridad: qué hay y qué no

- Cookie `Secure` + `SameSite=Lax` y comprobación de origen en todas las peticiones que cambian algo (`POST`, `PUT`, `DELETE`): una petición que el navegador dice venir de otro sitio se rechaza con 403.
- Límites de peticiones por IP, en memoria: 5 intentos de login fallidos cada 15 minutos por IP y correo y 30 por IP sumando todos los correos (un login correcto reinicia la cuenta), 5 registros por hora por IP y 300 peticiones por minuto a la API. Al pasarse responde 429 con `Retry-After`.
- No hay Helmet ni política de contenido (CSP), recuperación de contraseña por correo ni verificación de correo. El servicio es una sola instancia: los límites y las salas viven en su memoria.

## Actualizar y solucionar problemas

- Cada `push` a `main` redespliega solo (`autoDeployTrigger: commit`). Las migraciones nuevas se aplican en cada compilación. Un redespliegue abandona las partidas en curso.
- **"Variables de entorno inválidas" al arrancar:** el mensaje dice cuál falta (`COOKIE_SECURE`, `COOKIE_SAME_SITE` o `TRUST_PROXY`).
- **403 `FORBIDDEN` al iniciar sesión:** la petición llegó con un `Origin` distinto del propio servicio. Si usas un dominio propio asegúrate de entrar siempre por él.
- **429 `RATE_LIMITED`:** se superó un límite; la respuesta dice cuántos segundos esperar.
- **La primera visita tarda:** es el servicio despertando. La prueba de humo y el aviso en pantalla ya lo esperan.
````

`README.md` (estado, estructura, comandos y la sección de producción y E2E):

```diff
diff --git a/README.md b/README.md
index 120c856..884d120 100644
--- a/README.md
+++ b/README.md
@@ -2,7 +2,7 @@
 
 Juego web de 2 jugadores en tiempo real: en cada ronda se enfrenta un par de tipos Pokémon y cada jugador tiene 15 s para nombrar un Pokémon que tenga ambos. Gana quien acumule más stats base. El diseño completo está en [`docs/superpowers/specs/`](docs/superpowers/specs/).
 
-**Estado:** etapa 4 de 5 (servidor y cliente web completos y jugables, con estadísticas, historial y perfil). Falta el despliegue (etapa 5).
+**Estado:** etapa 5 de 5. El juego está completo (servidor, cliente web, estadísticas, perfil y temas) y listo para desplegarse gratis en Render y Neon: la guía está en [`docs/despliegue.md`](docs/despliegue.md).
 
 ## Estructura
 
@@ -11,6 +11,7 @@ Juego web de 2 jugadores en tiempo real: en cada ronda se enfrenta un par de tip
 | `server/` | API REST (Express) y tiempo real (Socket.io), motor de juego, Prisma y PostgreSQL |
 | `client/` | Cliente web: React 19, Vite, Tailwind, Zustand y React Router |
 | `shared/` | Tipos de eventos, payloads, códigos de error y `normalizeName`, compartidos por servidor y cliente |
+| `e2e/` | Prueba de extremo a extremo con Playwright: dos navegadores reales juegan contra la construcción de producción |
 
 ## Requisitos
 
@@ -47,16 +48,25 @@ En desarrollo el servidor de Vite hace de proxy de `/auth`, `/rooms`, `/pokemon`
 |---|---|
 | `npm run dev` | Servidor del juego en modo desarrollo con recarga |
 | `npm run dev:client` | Cliente web con recarga en caliente |
-| `npm run build` | Construye el cliente para producción (`client/dist`) |
+| `npm run build` | Construye el cliente (`client/dist`) y empaqueta el servidor (`server/dist/index.js`) |
+| `npm start` | Arranca la construcción de producción (necesita las variables de `NODE_ENV=production`, ver la guía de despliegue) |
+| `npm run e2e` | Construye y ejecuta la prueba E2E: crea su propia base de datos, la borra al terminar |
 | `npm test` | Todas las pruebas: servidor (usan la base `pokemon_minigames_test`) y cliente |
 | `npm run typecheck` | Verifica los tipos con `tsc` en todos los paquetes |
 | `npm run db:migrate -w server` | Crea/aplica migraciones en desarrollo |
 | `npm run db:seed -w server` | Carga el catálogo desde `server/data/catalog.snapshot.json` |
 | `npm run catalog:fetch -w server` | Vuelve a descargar el catálogo de PokéAPI al snapshot |
 | `npm run smoke -w server` | Juega una partida real de una ronda contra el servidor en marcha |
+| `npm run smoke:deployed -- URL` | Comprueba un despliegue en internet sin escribir nada (despierta el servicio si hace falta) |
 
 Variable opcional del cliente: `VITE_API_URL` (URL base del servidor; vacía = el mismo origen).
 
+## Producción y pruebas E2E
+
+El servidor sirve el cliente construido, la API y Socket.io desde un solo origen, así que en producción no hay CORS y la cookie de sesión es `Secure` + `SameSite=Lax`. Las peticiones que cambian algo se rechazan si vienen de otro origen (403 `FORBIDDEN`) y hay límites por IP en memoria: 5 intentos de login fallidos cada 15 minutos por IP y correo (y 30 por IP sumando todos los correos), 5 registros por hora y 300 peticiones por minuto a la API (429 `RATE_LIMITED` con `Retry-After`). Cómo desplegarlo, qué esperar de la capa gratuita y cómo comprobarlo: [`docs/despliegue.md`](docs/despliegue.md).
+
+`npm run e2e` necesita Chromium: `npx playwright install chromium` desde `e2e/`, o define `E2E_CHANNEL=msedge` (o `chrome`) para usar el navegador ya instalado. Con `E2E_ADMIN_DATABASE_URL` (o tu `server/.env`) crea la base `pokemon_minigames_e2e`. En GitHub, [`.github/workflows/ci.yml`](.github/workflows/ci.yml) corre tipos, pruebas, construcción y E2E en cada push a `main` y en cada pull request.
+
 ## Estadísticas y perfil
 
 En **Mi perfil** (`/perfil`) cada persona ve sus partidas jugadas, ganadas, empatadas y perdidas, el porcentaje de victorias, la racha actual y la mejor, sus 3 Pokémon más ganados, el poder promedio de los Pokémon que ganó, su mejor partida y el historial de sus partidas (con el motivo del fin: abandono, desconexión, etc.). Al terminar una partida se puede abrir el perfil del rival (`/jugador/:username`), que solo muestra estadísticas. Solo cuentan las partidas completadas; las abandonadas no. Todo se calcula al pedirlo a partir de las partidas guardadas (no hay tablas de estadísticas aparte).
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w server -- test/deploy
npm run typecheck
```

Expected: PASS (16 pruebas) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(deploy): render.yaml, flujo de CI, guía de despliegue y script de siembra para producción" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Verificación real, mutaciones y cierre

**Files:** ninguno nuevo (verificación; si algo falla, se corrige en la tarea que lo introdujo).

- [ ] **Step 1: Verificación completa**

```bash
npm test
npm run typecheck
npm run build
git status
```

Expected: **1043 pruebas pasan** (620 de servidor, una más omitida en Windows, y 423 de cliente); `tsc` sin errores en los cuatro paquetes; el build deja `client/dist` y `server/dist/index.js`; `git status` no muestra nada pendiente (ni `.env`, ni `.env.test`, ni `dist`, ni `e2e/test-results`).

- [ ] **Step 2: La E2E con navegadores reales**

```bash
npm run e2e
```

Expected: 4 pruebas pasan (con `E2E_CHANNEL=msedge` o `chrome` si no instalaste el Chromium de Playwright) y la base `pokemon_minigames_e2e` desaparece al terminar (`psql -l` no la lista).

- [ ] **Step 3: Arrancar la construcción de producción en local y pasarle la prueba de humo**

Con tu base de desarrollo migrada y sembrada (`npm run db:deploy -w server` y `npm run db:seed -w server`) y la construcción hecha, arranca el servidor empaquetado en otra terminal. Tu `server/.env` de desarrollo define `CORS_ORIGIN` (el cliente de Vite), y con él el servidor concede CORS a ese origen, justo lo que la prueba de humo vigila; en producción no existe. Haz una copia sin esa línea (los archivos `.env.*` no se versionan) y úsala; los valores que ya están en el entorno no se pisan, por eso el resto se define aquí:

```bash
cd server
grep -v '^CORS_ORIGIN' .env > .env.prod-local
NODE_ENV=production PORT=3100 COOKIE_SECURE=true COOKIE_SAME_SITE=lax TRUST_PROXY=0 node --env-file=.env.prod-local dist/index.js
```

(en PowerShell: `Get-Content .env | Where-Object { $_ -notmatch '^CORS_ORIGIN' } | Set-Content .env.prod-local`, y luego `$env:NODE_ENV="production"; $env:PORT="3100"; $env:COOKIE_SECURE="true"; $env:COOKIE_SAME_SITE="lax"; $env:TRUST_PROXY="0"; node --env-file=.env.prod-local dist/index.js`)

Expected: imprime `Catálogo cargado: 1025 Pokémon` y `Servidor escuchando`. En la terminal de la raíz:

```bash
npm run smoke:deployed -- http://localhost:3100
```

Expected: todas las líneas dicen `OK` y termina con `Todo bien.` (con el `.env` de desarrollo sin filtrar, `No concede CORS a otros orígenes` falla y el comando sale con código 1: es la comprobación haciendo su trabajo).

Comprueba con `curl` las protecciones reales (el correo `nadie@example.com` no existe: da 401 y cuenta como intento fallido):

```bash
curl -s -i -X POST http://localhost:3100/auth/login -H "Content-Type: application/json" -H "Origin: https://sitio-ajeno.example" -d '{"email":"nadie@example.com","password":"x12345678"}' | head -n 1
for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "%{http_code} " -X POST http://localhost:3100/auth/login -H "Content-Type: application/json" -d '{"email":"nadie@example.com","password":"x12345678"}'; done; echo
```

Expected: la primera línea es `HTTP/1.1 403 Forbidden`; la segunda imprime `401 401 401 401 401 429` (el sexto intento ya está limitado). Para volver a probar, reinicia el servidor (los límites viven en su memoria).

- [ ] **Step 4: Cortar las conexiones de la base de datos con el servidor en marcha**

Con el servidor del paso anterior funcionando, haz una consulta que toque la base de datos (un login con un correo que no existe da 401 y abre una conexión; `/pokemon/names` no sirve, el catálogo está en memoria), corta todas las conexiones que tiene abiertas (como haría Neon al apagarse) y repite la consulta antes de 10 s, que es cuando el servidor las cierra solo.:

```bash
login() { curl -s -o /dev/null -w "%{http_code} " -X POST http://localhost:3100/auth/login -H "Content-Type: application/json" -d "{\"email\":\"corte$RANDOM@example.com\",\"password\":\"x12345678\"}"; }
login
psql -U pokemon_app -d pokemon_minigames -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'pokemon_minigames' AND pid <> pg_backend_pid();"
login; login; login; echo
```

Expected: `psql` informa de al menos una conexión terminada; los cuatro `login` imprimen `401` (el servidor sigue vivo y la consulta tras el corte funciona) y la terminal del servidor muestra `Base de datos: se cerró una conexión inactiva (terminando la conexión debido a una orden del administrador)`. Después detén el servidor con Ctrl+C: debe imprimir `SIGINT recibido, cerrando...` y salir sin error. Borra `server/.env.prod-local`.

- [ ] **Step 5: Recorrido manual con el bot**

Arranca el servidor de producción como en el paso 3, abre `http://localhost:3100` (Chromium acepta la cookie `Secure` en `localhost`), crea una cuenta y una sala, une al bot (`PORT=3100 node client/scripts/dev-bot.mjs CODIGO`) y juega una partida entera. Comprueba: que recargar la página recupera la partida, que `/perfil` muestra la partida, que `/jugador/nadie` muestra "No encontramos a ese jugador." y que cinco contraseñas erróneas seguidas en `/login` muestran, al sexto intento, "Demasiados intentos. Inténtalo de nuevo en 15 min." Al terminar, borra al bot y tus datos de prueba con el SQL que imprime el bot.

- [ ] **Step 6: Comprobar que las pruebas detectan fallos**

Rompe a propósito cada protección crítica, ejecuta la prueba indicada y restaura. Cada fila debe fallar; después de cada una, `git checkout -- <archivo>`.

| # | Archivo y cambio | Prueba que debe fallar |
|---|---|---|
| 1 | `server/src/app.ts`: se quita la comprobación de origen: se borra `app.use(createOriginCheck(…))` | `origin.test.ts` → «registro e inicio de sesión desde otro sitio se rechazan; desde el propio origen funcionan» y «refresh y logout con la cookie de sesión desde otro sitio se rechazan y la sesión sigue viva» |
| 2 | `server/src/http/origin-check.ts`: sin `Origin`, `Sec-Fetch-Site: same-site` ya no se rechaza: `site === "cross-site" || site === "same-site"` → solo `cross-site` | `origin-check.test.ts` → «sin Origin, Sec-Fetch-Site=same-site se rechaza» |
| 3 | `server/src/http/origin-check.ts`: un `Origin` ajeno pasa: `origin === own || … ? next() : next(forbidden())` → `next()` | `origin-check.test.ts` → «rechaza un POST de otro origen con 403 FORBIDDEN» y «también comprueba PUT» |
| 4 | `server/src/http/rate-limit.ts`: el limitador no limpia memoria: `if (current - lastSweep < sweepEveryMs) return;` → `return;` | `rate-limit.test.ts` → «limpia las claves vencidas solas, para que un abuso no llene la memoria» y «la limpieza no borra las claves que todavía cuentan» |
| 5 | `server/src/http/rate-limit.ts`: cabe un evento de más: `stamps.length < limit` → `stamps.length <= limit` | `rate-limit.test.ts` → «deja pasar hasta el límite y luego bloquea» y «comprobar no cuenta: solo cuentan los eventos registrados» |
| 6 | `server/src/auth/auth.routes.ts`: el limitador cuenta los aciertos: tras un login correcto se llama a `record` en vez de a `reset` | `limits.routes.test.ts` → «un inicio de sesión correcto reinicia la cuenta» y «intentos en paralelo con la contraseña correcta no dejan sin cuenta al dueño: los 5 primeros entran y reinician» |
| 7 | `server/src/auth/auth.routes.ts`: el límite pasa a ser por cuenta, no por IP y correo: la clave es solo `input.email` | `limits.routes.test.ts` → «no es un bloqueo de la cuenta: otra IP puede entrar con la contraseña correcta» |
| 8 | `server/src/auth/auth.routes.ts`: el registro deja de limitarse: se quita `limitRegistrations` de la ruta | `limits.routes.test.ts` → «a partir del sexto registro por hora desde la misma IP da 429» y «los intentos fallidos (cuenta repetida) también cuentan» |
| 9 | `server/src/auth/auth.routes.ts`: el tope por IP nunca cuenta: se quita `loginFailuresByIp?.record(ip);` | `limits.routes.test.ts` → «una sola IP no puede probar contraseñas contra muchas cuentas: a partir del intento 31 fallido da 429» y «los inicios de sesión correctos no cuentan para el tope de la IP» |
| 10 | `server/src/auth/auth.routes.ts`: el fallo se cuenta al terminar de comprobar la contraseña y no antes (las peticiones en paralelo lo esquivan) | `limits.routes.test.ts` → «diez intentos fallidos a la vez no esquivan el límite: solo 5 llegan a comprobar la contraseña» y «los inicios de sesión correctos no cuentan para el tope de la IP» |
| 11 | `server/src/app.ts`: el límite general también cuenta `/health`: se quita `[...API_PREFIXES]` del `app.use` | `limits.routes.test.ts` → «/health no cuenta ni se bloquea (la plataforma lo consulta sin parar)» |
| 12 | `server/src/http/client-app.ts`: el fallback tapa la API: se quita `isServerPath(req.path)` de la condición | `client-app.test.ts` → «una ruta de la API que no existe sigue dando el 404 en JSON de siempre» |
| 13 | `server/src/http/client-app.ts`: un archivo que no existe devuelve `index.html`: se quita la comprobación de la extensión | `client-app.test.ts` → «un archivo que no existe (con extensión) da 404 en JSON, no el index.html (que rompería el JavaScript)» |
| 14 | `server/src/http/client-app.ts`: todo se cachea para siempre, también `index.html`: `inAssets ? IMMUTABLE : "no-cache"` → `IMMUTABLE` | `client-app.test.ts` → «lo que no está en /assets (index.html, el icono) nunca se cachea sin revalidar» |
| 15 | `server/src/config/env.ts`: producción acepta `SameSite=none`: se quita esa regla | `env.test.ts` → «rechaza SameSite=none (con un solo origen no hace falta)» |
| 16 | `server/src/config/env.ts`: producción arranca sin `TRUST_PROXY`: se quita esa regla | `env.test.ts` → «exige decir cuántos proxies hay delante (si no, todas las IP serían la del proxy)» y «nombra todos los problemas a la vez» |
| 17 | `server/src/app.ts`: CORS se concede a cualquier origen: `cors({ origin: env.CORS_ORIGIN, … })` → `cors({ origin: true, … })` | `cors.test.ts` → «en producción con CORS_ORIGIN se concede solo a ese origen» |
| 18 | `server/src/shutdown.ts`: un cierre que falla sale con 0: `exit(failed ? 1 : 0)` → `exit(0)` | `shutdown.test.ts` → «si cerrar Socket.io falla, igualmente intenta cerrar la base de datos y sale con 1» y «si cerrar la base de datos falla, sale con 1» |
| 19 | `server/src/db/prisma.ts`: las conexiones inactivas se cierran a los 10 minutos, después de que Neon se apague: `idleTimeoutMillis: 10_000` → `600_000` | `pool-resilience.test.ts` → «cierra las conexiones inactivas mucho antes de que Neon se apague (a los 5 minutos)» |
| 20 | `server/scripts/build.ts`: el paquete deja fuera el código compartido (que es TypeScript): `EXTERNAL` pasa a incluir `@pokemon-minigames/shared` | `bundle.test.ts` → «el paquete es un solo archivo que lleva dentro el código compartido y deja fuera las dependencias instaladas» y «arranca en modo producción con node, carga el catálogo y responde» |
| 21 | `client/src/components/LoadingScreen.tsx`: el aviso de arranque lento tarda un minuto: `SLOW_START_MS = 5000` → `60000` | `loading-screen.test.tsx` → «pasados 5 segundos avisa de que el servidor se está despertando» |
| 22 | `client/src/i18n/es.ts`: la espera del `429` se redondea hacia abajo (promete menos de lo que falta): `Math.ceil(retryAfterSeconds / 60)` → `Math.floor` | `rate-limit.test.ts` → «con 61 segundos de espera dice: Demasiados intentos. Inténtalo de nuevo en 2 min.» |
| 23 | `render.yaml`: el Blueprint deja de ser gratuito: `plan: free` → `plan: starter` | `config-files.test.ts` → «define un único servicio web gratuito con comprobación de salud» |
| 24 | `.github/workflows/ci.yml`: el CI prueba contra otra versión de PostgreSQL: `postgres:18` → `postgres:17` | `config-files.test.ts` → «corre en cada push a main y en cada pull request, con PostgreSQL 18» |

Al terminar, `git status` no debe mostrar cambios.

- [ ] **Step 7: Publicar la rama y entregar la guía**

```bash
git push -u origin etapa-5-despliegue
```

Expected: rama `etapa-5-despliegue` en `https://github.com/marcovinir/pokemon-minigames`; el primer resultado real de GitHub Actions confirma el CI (no se puede ejecutar desde aquí). La integración a `main` la decide Marco. Después, Marco sigue `docs/despliegue.md` (crear Neon, crear el Blueprint en Render, pegar `DATABASE_URL`) y ejecuta `npm run smoke:deployed -- https://SU-SERVICIO.onrender.com`. **Antes de anunciar el juego**, hace las dos pruebas de la sección 5 de la guía (verificar `TRUST_PROXY`): ni la E2E ni la prueba de humo pueden detectar un valor equivocado, porque en local no hay proxy.

---

## Self-Review

**Cobertura de la spec de la etapa 5:**

| Requisito | Tarea |
|---|---|
| §4.1 Producción exige cookie segura, `SameSite` distinto de `none` y `TRUST_PROXY`; `CORS_ORIGIN` opcional | 1 (y 11: el `render.yaml` real lo cumple) |
| §4.2 Comprobación de origen (`FORBIDDEN`), cada método y cabecera, detrás del proxy | 2 |
| §4.3 Limitador con claves, ventana deslizante, reloj inyectable, limpieza, `429` con `Retry-After` | 3 |
| §4.3 Login (5 fallos / 15 min por IP y correo, éxito reinicia; más 30 por IP sumando correos y el intento reservado antes de comprobar la contraseña), registro (5 / hora), API (300 / min) | 4 |
| §3.1 Servir el cliente, caché, fallback de React sin tapar la API, 404 en JSON | 5 |
| §3.3 Pool para Neon y §3.4 cierre ordenado con `SIGTERM` | 6 |
| §3.2 Empaquetado con esbuild, arranque con `node`, plan B documentado | 7 |
| §3.4 Aviso de arranque lento y §4.3 mensaje del `429` en el cliente | 8 |
| §5.1 Playwright: base propia, servidor de producción, dos contextos, cuatro escenarios | 9 |
| §5.2 Prueba de humo sin escritura contra la URL desplegada | 10 |
| §3.2 `render.yaml`, §5.3 GitHub Actions, §6 guía de despliegue y README | 11 |
| §7 Verificación real (producción en local, E2E, corte de la base de datos, bot) y mutaciones | 12 |

**Decisiones tomadas al escribir el plan (la spec ya las recoge o no las contradice):** el límite general solo cubre los prefijos de la API (`API_PREFIXES`), no `/health` (la plataforma lo consulta sin parar) ni `/socket.io`; la comprobación de origen incluye `PATCH`; el pool de Prisma ya atiende los errores de las conexiones inactivas (la spec suponía que podían tirar el proceso: se comprobó que no, y se conservan el afinado, el aviso en el registro y la prueba que lo fija); la E2E lanza Prisma y tsx directamente con `node` (sin `npx` ni shell) para que funcione igual en Windows y en Linux; y `E2E_CHANNEL` permite usar un navegador ya instalado en lugar de descargar Chromium.

**Hallazgos de la verificación real (ya corregidos en el código de este plan):** (1) `smoke:deployed` abortaba en Windows con un error de libuv al terminar con `process.exit` (el código de salida no era el esperado); ahora fija `process.exitCode`; (2) la verificación local con el `.env` de desarrollo hacía fallar "No concede CORS a otros orígenes" porque ese archivo define `CORS_ORIGIN`: el paso 3 de la Task 12 usa una copia sin esa línea; (3) `cors` con `origin: undefined` no concede nada (no cae en el comodín `*` como suponía la spec), así que la guarda `if (env.CORS_ORIGIN)` es por claridad y no por seguridad: se corrigieron el comentario y la mutación que la protege (ahora es `origin: true`); (4) `/pokemon/names` no sirve para probar el corte de la base de datos porque el catálogo está en memoria: el paso 4 usa un login, que sí consulta la base.

**Lo que encontró la revisión final independiente de toda la rama (ya corregido en el código de este plan, cada punto con su prueba):** (1) el límite de login contaba el fallo al terminar de comprobar la contraseña, así que diez peticiones en paralelo pasaban todas la comprobación con la cuenta a cero (`limits.routes.test.ts`, con `Promise.all`); ahora el hueco se reserva antes y `release` lo devuelve si el error no fue de credenciales; (2) sin un tope por IP, una sola IP podía probar una contraseña común contra muchas cuentas y saturar la CPU con bcrypt; ahora hay 30 fallos por IP en 15 minutos sumando todos los correos (los logins correctos no cuentan); (3) el número de proxies de Render no está documentado y hay informes de la comunidad de que hacen falta hasta 3: la guía manda verificar `TRUST_PROXY` con dos pruebas (un valor bajo hace que todo el mundo comparta IP; uno alto permite falsear la IP) y `render.yaml` sigue en `1`, el valor que falla de forma visible.

**Pendientes menores de esa revisión (corregidos después, en un commit aparte de la rama `etapa-5-menores`, cada uno con su prueba; los bloques de código de este plan muestran la versión anterior a esos arreglos):** (1) si faltaba del todo una variable obligatoria (p. ej. `DATABASE_URL`), `loadEnv` mostraba solo ese error y en inglés: ahora las reglas de producción se miran sobre los valores crudos y los mensajes de las variables que faltan están en español, todo a la vez (`env.test.ts`); (2) el registro contaba también los intentos fallidos, así que cinco nombres ocupados bloqueaban una hora: ahora los 5 por hora son cuentas creadas (el hueco se reserva antes de crearla, se devuelve si falla y el paralelo no lo esquiva) y los fallos tienen su propio tope de 20 por hora (`limits.routes.test.ts`); (3) los límites estaban activos también en desarrollo, donde todo llega desde `::1` por el proxy de Vite: ahora solo producción los usa (`rateLimitsFor`); (4) el `429` general fuera de los formularios no decía cuánto esperar: ahora el mensaje de `ApiError` incluye la espera en cualquier pantalla (`client.test.ts`); (5) la guía prometía el aviso de servidor despertando en un arranque en frío, pero quien espera es el propio HTML: la frase dice ahora qué pasa de verdad; (6) la guía listaba POST, PUT y DELETE sin PATCH; (7) `isServerPath` distinguía mayúsculas y Express no (`/Auth/x` devolvía el cliente): ahora compara en minúsculas (`client-app.test.ts`); (8) el CI no declaraba permisos: ahora `permissions: contents: read`. Sobre el reintento de la E2E en CI: el informe de GitHub (`reporter: github`) ya marca como advertencia una prueba que solo pasó al reintentar, así que la inestabilidad no queda oculta. Sigue sin cambiarse `CORS_ORIGIN=*` en producción (decisión registrada en la revisión final).

**Lo que no se puede probar desde aquí:** el flujo de GitHub Actions (se valida su estructura con una prueba y el primer resultado real llega al subir la rama) y el despliegue en Render y Neon (lo hace Marco con la guía; la prueba de humo comprueba el resultado). Una de las pruebas del paquete se omite en Windows (la señal `SIGTERM` real no existe allí).

**Fuera de esta etapa:** dominio propio, Helmet y CSP, Redis o varias instancias, Docker, recuperación de contraseña y verificación de correo, monitoreo y alertas, copias de seguridad más allá de las de Neon, y mantener el servicio despierto con un ping periódico. Pendientes menores de las etapas 3 y 4 que siguen abiertos: `room-state` sin `nextRoundAt` (y los otros siete listados en el plan de la etapa 3) y los cuatro de la revisión de la etapa 4 (`getStats` sin instantánea común, guardados de tema que podrían llegar desordenados, `hasChoice` con un `localStorage` corrupto, y el "?" si faltara el rival).

**Consistencia de tipos:** los nombres se reutilizan tal como están en los bloques `Interfaces` de cada tarea. Todo el código se escribió y ejecutó antes de incluirlo: 620 pruebas de servidor y 423 de cliente en verde, `tsc` sin errores, la construcción de producción arrancada contra una base de datos real, la E2E con navegador real, 24 mutaciones a propósito detectadas por las pruebas, y la prueba de humo contra el servidor de producción en local.
