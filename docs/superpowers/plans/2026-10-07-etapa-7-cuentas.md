# Pokémon Minigames — Etapa 7: Cuentas con código por correo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que quien crea una cuenta demuestre que controla su correo y que quien olvidó su contraseña pueda recuperarla, las dos cosas con un código de 6 dígitos que llega por correo, detrás de un interruptor apagado por defecto, sin cambiar el juego.

**Architecture:** Un servicio de correo con interfaz (`Mailer`: Resend, consola, memoria) y un almacén de códigos (`email_codes`, una fila por cuenta y propósito, solo el hash con clave) que el servicio de cuentas usa para registrar cuentas *pendientes*, verificarlas y restablecer contraseñas. Las rutas nuevas solo existen con `EMAIL_VERIFICATION=on`; los límites reservan el hueco antes del trabajo, y el contador de intentos de la base de datos es el tope duro. El cliente suma tres pantallas públicas (`/verificar`, `/olvide`, `/restablecer`) con el aspecto del rediseño, y la E2E pasa por la verificación leyendo los códigos de un buzón en memoria.

**Tech Stack:** Sin cambios: Express 5, Prisma 7.10.0 (PostgreSQL 18), zod 4, Vitest + supertest, React 19, Vite 8, Tailwind 4, React Router 8, Playwright. Sin dependencias nuevas: el envío a Resend es un `fetch` (sin SDK).

**Spec:** `docs/superpowers/specs/2026-10-07-etapa-7-cuentas-design.md` (complementa la general y las de las etapas 2 a 6; donde la de la etapa 7 es más específica, manda).

## Global Constraints

- **Interruptor:** `EMAIL_VERIFICATION=on|off`, por defecto `off`. Apagado, el registro y el login son exactamente los de hoy, no aparece «¿Olvidaste tu contraseña?», y `POST /auth/verify-email`, `/auth/verification/resend`, `/auth/password/forgot` y `/auth/password/reset` responden el 404 de siempre. `GET /auth/options` existe siempre.
- **Códigos:** 6 dígitos (`crypto.randomInt(0, 1_000_000)` rellenado), `CODE_TTL = 10 min`, `MAX_CODE_ATTEMPTS = 5`, un solo uso, uno vigente por cuenta y propósito (`verify_email` o `reset_password`); uno nuevo anula el anterior. En la base solo se guarda `HMAC-SHA256(clave, "{userId}:{propósito}:{código}")` con `clave = HMAC-SHA256(JWT_ACCESS_SECRET, "pokemon-minigames:email-code:v1")`, comparado con `timingSafeEqual`. **El código nunca se escribe en un registro ni en un error.**
- **Comprobar un código:** el formato (`^\d{6}$`) y la contraseña nueva se validan antes de tocar los intentos; el intento se reserva con una sola instrucción `UPDATE email_codes SET attempts = attempts + 1 WHERE … AND attempts < 5 AND expires_at > $ahora RETURNING code_hash` antes de comparar; el consumo es un `deleteMany` por hash que debe borrar exactamente una fila. El reloj es el inyectable del servicio, también en el SQL.
- **Cuentas:** `PENDING_ACCOUNT_TTL = 24 h`. Pendiente = sin verificar y sin partidas ni sesiones; una cuenta sin verificar con historial (*heredada*) nunca se reemplaza ni se borra. La migración da por verificadas, con la fecha de la migración, todas las cuentas que ya existen.
- **Límites (solo producción):** espera de 1 envío cada 60 s por correo; 5 envíos por hora por correo y 10 por hora por IP; fallos de código 5 cada 10 min por correo y 20 por hora por IP. El hueco se reserva antes del trabajo y se devuelve si falla por algo nuestro.
- **Sin pistas para curiosos:** `forgot` y `resend` validan solo la forma del correo y contestan `202 { ok: true }` antes de buscar la cuenta y enviar; `verify-email` y `reset` dan el mismo `INVALID_CODE` exista o no el correo; `login` solo responde `EMAIL_NOT_VERIFIED` tras acertar la contraseña.
- **Errores nuevos** en `shared`: `EMAIL_NOT_VERIFIED` (403), `INVALID_CODE` (400) y `EMAIL_SEND_FAILED` (502), con los mensajes «Tu correo aún no está verificado.», «Código incorrecto o vencido. Revisa tu correo o pide uno nuevo.» y «No pudimos enviar el correo. Inténtalo de nuevo en un momento.».
- **Producción:** el servidor se niega a arrancar si con `EMAIL_VERIFICATION=on` el `MAIL_PROVIDER` no es `resend` (con `RESEND_API_KEY` y `MAIL_FROM`) o `memory` con `ALLOW_MEMORY_MAIL=true` (solo lo usa el servidor de la E2E); `console` está prohibido. Con el interruptor apagado no se pide nada de correo. `GET /auth/test-outbox?to=` solo existe con `MAIL_PROVIDER=memory` y, en producción, con `ALLOW_MEMORY_MAIL=true`.
- **Correos:** en español, sin imágenes ni enlaces, solo el código y sin ningún dato personal además de él. «Tu código de verificación es 123456. Caduca en 10 minutos. Si no lo pediste, ignora este mensaje.» y «Tu código para cambiar la contraseña es 123456. Caduca en 10 minutos. Si no lo pediste, ignora este mensaje: tu contraseña no cambia.».
- **Cliente:** las tres pantallas nuevas son públicas (con sesión llevan al lobby); el correo viaja en el estado del router, nunca en la URL; el campo del código quita todo lo que no sea un dígito (también al pegar), lleva el foco al llegar y no anuncia la cuenta atrás cada segundo.
- **Secretos:** la clave de API de Resend nunca se escribe en el chat, en el repositorio ni en un archivo del proyecto: la pega Marco en el panel de Render.
- Mensajes al usuario en español; identificadores de código en inglés. Se sigue TDD.
- Versiones: `prisma`, `@prisma/client` y `@prisma/adapter-pg` siguen fijadas en **7.10.0**. No ejecutes `npm audit fix --force`. Las credenciales y los secretos nunca se versionan.

## Review Focus

Condiciones que la spec no detalla pero que muerden a una persona real; cada una tiene su prueba en la tarea indicada (y su comprobación real en la Task 14).

1. **Adivinar códigos y carreras.** Veinte intentos a la vez no consiguen más de cinco; el quinto, si acierta, vale; un código se gasta una sola vez aunque dos peticiones acierten juntas; uno nuevo reinicia los intentos; el código de verificar no sirve para restablecer ni al revés; pasados 10 minutos ya no vale; los límites por correo e IP bloquean aunque el código sea el verdadero. → Task 4 (`email-codes.test.ts`), Task 8 (`accounts.routes.test.ts`) y Task 12 (bloqueo en el navegador).
2. **Enumeración de correos, también por tiempo.** `forgot` y `resend` contestan lo mismo y *antes* de buscar o enviar; `verify-email` y `reset` fallan igual con un correo que no existe; el login solo avisa de «sin verificar» tras acertar la contraseña; los límites dependen del correo y de la IP, nunca de si hay cuenta. → Task 6, Task 8 y Task 12 (un correo sin cuenta recibe los mismos rechazos y el mismo bloqueo).
3. **Cuentas pendientes y heredadas, y el interruptor.** Registrarse con un correo sin verificar lo reemplaza; las cuentas pendientes de más de 24 h se limpian sin temporizadores; las que tienen partidas o sesiones no se tocan; apagado, nada cambia y las rutas nuevas no existen; la migración da por verificadas las cuentas de hoy; `refresh` de una cuenta sin verificar se rechaza. → Task 2, Task 5 y Task 8.
4. **Correo masivo contra un tercero, cuota y fallos del proveedor.** Un envío por minuto y por correo, cinco por hora, diez por IP; si el proveedor cae el registro dice `EMAIL_SEND_FAILED`, devuelve el hueco y deja la cuenta pendiente para reintentar; un fallo en segundo plano solo se anota, sin dirección ni código ni el texto que devuelve el proveedor; el envío a Resend tiene tiempo máximo. → Task 3, Task 5, Task 7 y Task 8.
5. **El campo del código y el estado perdido.** Pegar «123 456» o «123-456» deja 123456; recargar `/verificar` o `/restablecer` pierde el correo y la pantalla lo pide; la contraseña nueva nunca viaja en el estado del router; pulsar dos veces no envía dos veces; tras verificar se vuelve a la sala que se intentaba abrir. → Task 10 y Task 11.

---

## File Structure

```
pokemon-minigames/
├── render.yaml  README.md  docs/ correo.md (NUEVO)  despliegue.md                        # Task 0 y Task 13
├── shared/src/errors.ts                                                                    # tres códigos de error (Task 1)
├── server/
│   ├── .env.example  prisma/ schema.prisma  migrations/…_email_verification_codes/         # Task 2 y Task 13
│   ├── src/
│   │   ├── config/env.ts                                                                   # variables del correo y reglas de producción (Task 1, 13)
│   │   ├── mail/ mailer  memory-mailer  console-mailer  resend-mailer  templates  create-mailer   # NUEVOS (Task 3)
│   │   ├── auth/ code-policy  email-codes  code-limits  recovery.routes                    # NUEVOS (Task 3, 4, 7, 8)
│   │   │         auth.service  auth.routes  auth.schemas                                   # cuentas pendientes, verificar, restablecer (Task 5, 6, 8)
│   │   ├── http/limits.ts  app.ts                                                          # límites nuevos y el cableado (Task 7, 8)
│   └── test/ config/  db/  mail/  auth/  http/  helpers/app.ts  deploy/
├── client/
│   ├── src/
│   │   ├── i18n/es.ts  api/ types  endpoints  session/ session-store  auth-options           # Task 1, 9
│   │   ├── components/CodeField.tsx                                                         # NUEVO (Task 10)
│   │   ├── pages/ AuthLayout  AuthCard  VerifyEmailPage  PasswordRecoveryPages  use-cooldown  describe-error   # NUEVOS (Task 10, 11)
│   │   │          AuthForm  AuthPages  auth-validation  routes.tsx                          # se reutilizan y se amplían
│   └── test/ i18n/  api/  session/  pages/  helpers/services.tsx
└── e2e/ global-setup.ts  support/app.ts  tests/ accounts.spec.ts (NUEVA)  layout.spec.ts     # Task 12
```

Las piezas se construyen de abajo arriba: configuración y errores, migración, servicio de correo, almacén de códigos, reglas de cuentas, límites y rutas, y solo entonces el cliente y la E2E; la documentación va al final. Cada tarea deja la suite en verde: con el interruptor apagado (que es como corren todas las pruebas que ya existían) nada cambia hasta la Task 12, que enciende el interruptor en el servidor de la E2E.

## Notas de entorno (leer antes de empezar)

- Se parte de `main` con las etapas 1 a 6 completas (629 pruebas de servidor, una más omitida en Windows, y 672 de cliente). La **Task 0 se hace en `main`**, antes de la rama; luego crea la rama `etapa-7-cuentas` y haz en ella las Tasks 1 a 14. Se necesitan PostgreSQL 18 local y los archivos `server/.env` y `server/.env.test` de siempre.
- Todo el código de este plan se ejecutó antes de incluirlo, tarea por tarea, en un clon limpio de `main`: 806 pruebas de servidor y 739 de cliente en verde, `tsc` sin errores en todos los paquetes, la E2E en un navegador real (22 pruebas más la de las capturas, que se omite), 44 mutaciones a propósito detectadas y el recorrido de las pantallas nuevas en el navegador, con la consola como proveedor de correo.
- **No hace falta una cuenta de Resend para ejecutar este plan:** ninguna prueba envía correos de verdad (hay un buzón en memoria, un `fetch` falso para Resend y, en desarrollo, la consola). Resend, el dominio y la clave de API son de la activación (`docs/correo.md`), que hace Marco.
- Tras cambiar `server/prisma/schema.prisma` (Task 2) hay que regenerar el cliente de Prisma, que no se versiona: `npm run db:generate -w server`. Las migraciones de la base de pruebas se aplican solas al correr Vitest; la de desarrollo, con `npm run db:migrate -w server`.
- Si el equipo va justo de CPU, las pruebas pueden agotar los 5 s por defecto: ejecútalas con `--testTimeout=30000 --maxWorkers=2` (no hace falta cambiar nada en el repositorio).
- La E2E necesita un navegador: `npx playwright install chromium` desde `e2e/`, o `E2E_CHANNEL=msedge` / `chrome` para usar el que ya tienes. Entre la Task 12 y las anteriores la E2E no se ejecuta; **una de sus pruebas («olvidé mi contraseña») espera un minuto** porque el servidor deja 60 s entre dos códigos al mismo correo.
- npm 12 bloquea los scripts de instalación de algunas dependencias y lo avisa: es normal.

---

### Task 0: `TRUST_PROXY` a 2 (en `main`, antes de la rama)

**Contexto:** la prueba 1 de `docs/despliegue.md` (sección 5) sobre el sitio en vivo dio seis `401` en vez de `401 401 401 401 401 429` con `TRUST_PROXY=1`: Render pone más de un proxy y el servidor no ve una IP estable por visitante. Los límites de esta etapa (por IP) dependen de ello, así que va antes. Es un cambio mínimo, aparte de la rama.

**Files:**
- Modify: `render.yaml`, `docs/despliegue.md`
- Test (modificar): `server/test/deploy/config-files.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `render.yaml` con `TRUST_PROXY: "2"`; la guía con la tabla de variables y la sección 5 de acuerdo (la prueba correcta es la que pasa las dos comprobaciones: un valor demasiado alto falla la Prueba 1 y uno demasiado bajo falla la Prueba 2).

- [ ] **Step 1: Escribir la prueba que falla**

`server/test/deploy/config-files.test.ts` (el servidor acepta lo que declara el Blueprint y espera `TRUST_PROXY: 2`):

```diff
diff --git a/server/test/deploy/config-files.test.ts b/server/test/deploy/config-files.test.ts
index bca685b..60e2258 100644
--- a/server/test/deploy/config-files.test.ts
+++ b/server/test/deploy/config-files.test.ts
@@ -82,7 +82,7 @@ describe("render.yaml", () => {
       NODE_ENV: "production",
       COOKIE_SECURE: true,
       COOKIE_SAME_SITE: "lax",
-      TRUST_PROXY: 1,
+      TRUST_PROXY: 2,
       CORS_ORIGIN: undefined,
     });
   });
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
cd server && npx vitest run test/deploy
```

Expected: FAIL — `render.yaml` todavía dice `"1"` y la guía no menciona el `2` de partida.

- [ ] **Step 3: Implementar**

`render.yaml` (el valor y su comentario):

```diff
diff --git a/render.yaml b/render.yaml
index b02a7f6..3858c89 100644
--- a/render.yaml
+++ b/render.yaml
@@ -19,10 +19,11 @@ services:
         value: "24"
       - key: NODE_ENV
         value: production
-      # Cuántos proxies hay delante del servidor (de él depende la IP que ven los límites). Se empieza en 1 y se verifica tras
-      # el primer despliegue (docs/despliegue.md, sección 5): hay informes de que Render pone más de uno.
+      # Cuántos proxies hay delante del servidor (de él depende la IP que ven los límites). Con 1 la prueba 1 de
+      # docs/despliegue.md (sección 5) dio seis 401 en el sitio en vivo: Render pone más de un proxy. Se prueba 2 y, si las dos
+      # pruebas no pasan, 3.
       - key: TRUST_PROXY
-        value: "1"
+        value: "2"
       - key: COOKIE_SECURE
         value: "true"
       - key: COOKIE_SAME_SITE
```

`docs/despliegue.md` (la sección 5 y la tabla de variables explican el `2` y cómo corregirlo si las dos pruebas no pasan):

````diff
diff --git a/docs/despliegue.md b/docs/despliegue.md
index 10eca2a..da93d34 100644
--- a/docs/despliegue.md
+++ b/docs/despliegue.md
@@ -48,7 +48,7 @@ Después abre la dirección en dos navegadores (o uno normal y otro privado), cr
 
 ## 5. Verificar `TRUST_PROXY` (una sola vez, tras el primer despliegue)
 
-Los límites de intentos dependen de que el servidor lea bien la IP de cada visitante, y eso depende de cuántos proxies hay entre internet y el servicio. El `render.yaml` parte de `1`, pero Render no documenta la cifra y hay informes de la comunidad de que hacen falta más (hasta 3: [hilo de la comunidad de Render](https://community.render.com/t/what-number-of-proxies-sit-in-front-of-an-express-app-deployed-on-render/35981)). Un valor equivocado es grave en los dos sentidos, y la prueba E2E y la de humo no pueden detectarlo porque en local no hay proxy: se comprueba a mano.
+Los límites de intentos dependen de que el servidor lea bien la IP de cada visitante, y eso depende de cuántos proxies hay entre internet y el servicio. El `render.yaml` parte de `2`: con `1` la prueba 1 dio seis `401` en el sitio en vivo (Render no documenta la cifra y hay informes de la comunidad de que hacen falta más, hasta 3: [hilo de la comunidad de Render](https://community.render.com/t/what-number-of-proxies-sit-in-front-of-an-express-app-deployed-on-render/35981)). Un valor equivocado es grave en los dos sentidos, y la prueba E2E y la de humo no pueden detectarlo porque en local no hay proxy: se comprueba a mano.
 
 **Prueba 1: ¿el valor es demasiado alto?** (el servidor se fiaría de una IP inventada por el visitante y se podrían esquivar todos los límites). Seis intentos de login fallidos, cada uno con una IP falsa distinta en `X-Forwarded-For`:
 
@@ -56,7 +56,7 @@ Los límites de intentos dependen de que el servidor lea bien la IP de cada visi
 for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "%{http_code} " -X POST https://TU-SERVICIO.onrender.com/auth/login -H "Content-Type: application/json" -H "X-Forwarded-For: 10.0.0.$i" -d email:prueba1@example.com; done; echo
 ```
 
-Debe imprimir `401 401 401 401 401 429`: el servidor ignora la IP inventada y cuenta todos los intentos contra tu IP real. Si imprime seis `401`, el valor es demasiado alto: bájalo.
+Debe imprimir `401 401 401 401 401 429`: el servidor ignora la IP inventada y cuenta todos los intentos contra tu IP real. Si imprime seis `401`, el valor es demasiado alto (se fía de una IP inventada) o demasiado bajo (cada petición llega con la IP de un proxy de Render distinto, que cambia de una a otra): no se sabe cuál de los dos hasta probar el siguiente valor, como explica "Cómo cambiarlo".
 
 **Prueba 2: ¿el valor es demasiado bajo?** (todo el mundo compartiría la IP de un proxy de Render y, por ejemplo, solo se podrían hacer 5 registros por hora entre todos). Desde tu computadora haz cinco intentos fallidos con otro correo:
 
@@ -66,7 +66,7 @@ for i in 1 2 3 4 5; do curl -s -o /dev/null -w "%{http_code} " -X POST https://T
 
 Imprime `401 401 401 401 401`. Ahora, desde otra red (el celular con datos móviles, sin wifi), abre `https://TU-SERVICIO.onrender.com/login` e intenta entrar con `prueba2@example.com` y cualquier contraseña: debe decir "Email o contraseña incorrectos." Si dice "Demasiados intentos", las dos redes comparten IP para el servidor: el valor es demasiado bajo, súbelo.
 
-**Cómo cambiarlo:** en el panel de Render, *Environment* → `TRUST_PROXY` → guardar (Render redespliega y, de paso, reinicia los límites, que viven en memoria). Empieza en `1`; si falla la Prueba 2 sube a `2` y luego a `3`, y repite las dos pruebas con cada valor. El correcto es el que pasa las dos. Anótalo en `render.yaml` y súbelo para que el repositorio diga lo mismo que el panel.
+**Cómo cambiarlo:** en el panel de Render, *Environment* → `TRUST_PROXY` → guardar (Render redespliega y, de paso, reinicia los límites, que viven en memoria). Empieza en `2`; si no pasan las dos pruebas prueba `3` (y `1`), y repite las dos pruebas con cada valor. El correcto es el que pasa las dos: un valor demasiado alto falla la Prueba 1, y uno demasiado bajo falla la Prueba 2 y, si los proxies cambian de IP, también la 1. Anótalo en `render.yaml` y súbelo para que el repositorio diga lo mismo que el panel.
 
 ## Variables de entorno
 
@@ -75,7 +75,7 @@ Imprime `401 401 401 401 401`. Ahora, desde otra red (el celular con datos móvi
 | `NODE_ENV` | `production` | Activa las comprobaciones de producción: el servidor se niega a arrancar si algo de lo siguiente falta o es inseguro |
 | `COOKIE_SECURE` | `true` | La cookie de sesión solo viaja por HTTPS |
 | `COOKIE_SAME_SITE` | `lax` | Con un solo origen basta `lax` (`none` se rechaza en producción) |
-| `TRUST_PROXY` | `1` de partida (verifícalo en la sección 5) | Cuántos proxies hay delante; si es menor que los reales el servidor ve la IP de un proxy de Render y los límites de intentos afectan a todo el mundo a la vez, y si es mayor cualquiera puede falsear su IP |
+| `TRUST_PROXY` | `2` de partida (verifícalo en la sección 5) | Cuántos proxies hay delante; si es menor que los reales el servidor ve la IP de un proxy de Render y los límites de intentos afectan a todo el mundo a la vez, y si es mayor cualquiera puede falsear su IP |
 | `JWT_ACCESS_SECRET` | generado por Render | Firma de los tokens de acceso (mínimo 32 caracteres) |
 | `DATABASE_URL` | la cadena de Neon | Conexión a la base de datos |
 | `NODE_VERSION` | `24` | Versión de Node |
````

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
cd server && npx vitest run test/deploy
```

Expected: PASS (**18 pruebas**).

- [ ] **Step 5: Commit (en `main`, todavía sin subir)**

```bash
git add render.yaml docs/despliegue.md server/test/deploy/config-files.test.ts
git commit -m "fix(deploy): TRUST_PROXY=2 de partida (Render pone más de un proxy)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git switch -c etapa-7-cuentas
```

- [ ] **Step 6: Subir `main` y verificar en el sitio en vivo (lo decide y lo hace Marco)**

Subir `main` es una acción compartida: **pide permiso a Marco en ese momento** (la spec y este plan viajan en el mismo `push`). Cuando Render termine de desplegar, Marco ejecuta las dos pruebas de la sección 5 de `docs/despliegue.md` (la 1 desde su máquina, la 2 desde otra red). Si pasan las dos, `TRUST_PROXY=2` queda. Si no, prueba `3` (y `1`): cambia el valor en `render.yaml` y en el panel, y repite las dos pruebas con cada uno. Este paso no bloquea las Tasks 1 a 14, que se hacen en la rama; el resultado solo decide si hay que ajustar el valor antes de activar el correo.

---

### Task 1: Errores compartidos y configuración del correo

**Files:**
- Modify: `shared/src/errors.ts`, `client/src/i18n/es.ts`, `server/src/config/env.ts`
- Create: `server/test/config/mail-env.test.ts`
- Test (modificar): `server/test/shared/contract.test.ts`, `client/test/i18n/es.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: en `shared`, los códigos `EMAIL_NOT_VERIFIED`, `INVALID_CODE` y `EMAIL_SEND_FAILED` en `ERROR_CODES` (los usarán, con los estados 403, 400 y 502, las Tasks 4, 5 y 8); en el cliente, sus mensajes en `ERROR_MESSAGES`. En `Env`: `EMAIL_VERIFICATION: boolean` (por defecto `false`), `MAIL_PROVIDER?: "resend" | "console" | "memory"` (por defecto `console` en desarrollo, `memory` en `test` y sin definir en producción), `RESEND_API_KEY?: string`, `MAIL_FROM?: string` (`Nombre <dirección>` o solo la dirección) y `ALLOW_MEMORY_MAIL: boolean` (por defecto `false`). Con `MAIL_PROVIDER=resend` la clave y el remitente son obligatorios en cualquier entorno; en producción con `EMAIL_VERIFICATION=on` el proveedor debe ser `resend` (o `memory` con `ALLOW_MEMORY_MAIL=true`), y `console` está prohibido. `loadEnv` sigue nombrando todos los problemas a la vez.

- [ ] **Step 1: Escribir las pruebas que fallan**

`server/test/config/mail-env.test.ts` (valores por defecto, `resend`, y las reglas de producción con la verificación activa):

```ts
import { describe, expect, it } from "vitest";
import { loadEnv } from "../../src/config/env.js";

const valid = {
  DATABASE_URL: "postgresql://postgres:pw@localhost:5432/pokemon_minigames",
  JWT_ACCESS_SECRET: "x".repeat(32),
};

const production = { ...valid, NODE_ENV: "production", COOKIE_SECURE: "true", TRUST_PROXY: "2" };
const resend = { MAIL_PROVIDER: "resend", RESEND_API_KEY: "re_clave_de_prueba", MAIL_FROM: "Pokémon Minigames <no-responder@ejemplo.me>" };

describe("valores por defecto del correo", () => {
  it("la verificación está apagada, el permiso de la memoria denegado y el proveedor depende del entorno", () => {
    expect(loadEnv(valid)).toMatchObject({ EMAIL_VERIFICATION: false, MAIL_PROVIDER: "console", ALLOW_MEMORY_MAIL: false });
    expect(loadEnv({ ...valid, NODE_ENV: "test" }).MAIL_PROVIDER).toBe("memory");
    // En producción no se inventa un proveedor: sin la verificación no hace falta, y con ella hay que decirlo.
    expect(loadEnv(production).MAIL_PROVIDER).toBeUndefined();
    expect(loadEnv(production).EMAIL_VERIFICATION).toBe(false);
  });

  it("EMAIL_VERIFICATION solo admite on u off", () => {
    expect(loadEnv({ ...valid, EMAIL_VERIFICATION: "on" }).EMAIL_VERIFICATION).toBe(true);
    expect(loadEnv({ ...valid, EMAIL_VERIFICATION: "off" }).EMAIL_VERIFICATION).toBe(false);
    expect(() => loadEnv({ ...valid, EMAIL_VERIFICATION: "si" })).toThrow(/EMAIL_VERIFICATION/);
    expect(() => loadEnv({ ...valid, EMAIL_VERIFICATION: "true" })).toThrow(/EMAIL_VERIFICATION/);
  });

  it("MAIL_PROVIDER solo admite resend, console o memory", () => {
    expect(() => loadEnv({ ...valid, MAIL_PROVIDER: "smtp" })).toThrow(/MAIL_PROVIDER/);
    expect(loadEnv({ ...valid, MAIL_PROVIDER: "memory" }).MAIL_PROVIDER).toBe("memory");
  });

  it("ALLOW_MEMORY_MAIL solo admite true o false", () => {
    expect(loadEnv({ ...valid, ALLOW_MEMORY_MAIL: "true" }).ALLOW_MEMORY_MAIL).toBe(true);
    expect(() => loadEnv({ ...valid, ALLOW_MEMORY_MAIL: "yes" })).toThrow(/ALLOW_MEMORY_MAIL/);
  });
});

describe("Resend", () => {
  it("exige su clave y un remitente, en cualquier entorno", () => {
    expect(() => loadEnv({ ...valid, MAIL_PROVIDER: "resend" })).toThrow(/RESEND_API_KEY/);
    expect(() => loadEnv({ ...valid, MAIL_PROVIDER: "resend", RESEND_API_KEY: "re_x" })).toThrow(/MAIL_FROM/);
    expect(() => loadEnv({ ...valid, MAIL_PROVIDER: "resend", MAIL_FROM: "a@ejemplo.me" })).toThrow(/RESEND_API_KEY/);
    expect(loadEnv({ ...valid, ...resend })).toMatchObject({ MAIL_PROVIDER: "resend", RESEND_API_KEY: "re_clave_de_prueba" });
  });

  it("el remitente es «Nombre <dirección>» o solo la dirección; cualquier otra cosa se rechaza", () => {
    expect(loadEnv({ ...valid, ...resend, MAIL_FROM: "no-responder@ejemplo.me" }).MAIL_FROM).toBe("no-responder@ejemplo.me");
    expect(loadEnv({ ...valid, ...resend }).MAIL_FROM).toBe("Pokémon Minigames <no-responder@ejemplo.me>");
    expect(() => loadEnv({ ...valid, ...resend, MAIL_FROM: "sin-arroba" })).toThrow(/MAIL_FROM/);
    expect(() => loadEnv({ ...valid, ...resend, MAIL_FROM: "Nombre <sin-cierre@ejemplo.me" })).toThrow(/MAIL_FROM/);
  });
});

describe("producción con la verificación activada", () => {
  const on = { ...production, EMAIL_VERIFICATION: "on" };

  it("acepta Resend con su clave y su remitente", () => {
    expect(loadEnv({ ...on, ...resend })).toMatchObject({ EMAIL_VERIFICATION: true, MAIL_PROVIDER: "resend" });
  });

  it("se niega a arrancar sin proveedor y lo dice en español", () => {
    expect(() => loadEnv(on)).toThrow(/MAIL_PROVIDER: con EMAIL_VERIFICATION=on en producción debe ser resend/);
  });

  it("no admite la consola: escribiría los códigos en el registro", () => {
    expect(() => loadEnv({ ...on, MAIL_PROVIDER: "console" })).toThrow(/MAIL_PROVIDER: con EMAIL_VERIFICATION=on en producción debe ser resend/);
  });

  it("la memoria solo se admite con ALLOW_MEMORY_MAIL=true (el servidor de la prueba E2E)", () => {
    expect(() => loadEnv({ ...on, MAIL_PROVIDER: "memory" })).toThrow(/ALLOW_MEMORY_MAIL=true/);
    expect(() => loadEnv({ ...on, MAIL_PROVIDER: "memory", ALLOW_MEMORY_MAIL: "false" })).toThrow(/ALLOW_MEMORY_MAIL=true/);
    expect(loadEnv({ ...on, MAIL_PROVIDER: "memory", ALLOW_MEMORY_MAIL: "true" })).toMatchObject({ MAIL_PROVIDER: "memory", ALLOW_MEMORY_MAIL: true });
  });

  it("con la verificación apagada no se pide nada de correo", () => {
    expect(() => loadEnv(production)).not.toThrow();
    expect(() => loadEnv({ ...production, EMAIL_VERIFICATION: "off", MAIL_PROVIDER: "console" })).not.toThrow();
  });

  it("nombra todos los problemas a la vez", () => {
    let message = "";
    try {
      loadEnv({ ...on, MAIL_PROVIDER: "resend", COOKIE_SECURE: "false" });
    } catch (error) {
      message = String(error);
    }
    expect(message).toMatch(/COOKIE_SECURE/);
    expect(message).toMatch(/RESEND_API_KEY/);
    expect(message).toMatch(/MAIL_FROM/);
  });
});
```

`server/test/shared/contract.test.ts` (los tres códigos nuevos existen y tienen su estado):

```diff
diff --git a/server/test/shared/contract.test.ts b/server/test/shared/contract.test.ts
index 6c814e3..6d471db 100644
--- a/server/test/shared/contract.test.ts
+++ b/server/test/shared/contract.test.ts
@@ -29,6 +29,10 @@ describe("paquete shared", () => {
     expect(ERROR_CODES).toContain("USER_NOT_FOUND");
   });
 
+  it("incluye los códigos de la verificación por correo (etapa 7)", () => {
+    for (const code of ["EMAIL_NOT_VERIFIED", "INVALID_CODE", "EMAIL_SEND_FAILED"]) expect(ERROR_CODES).toContain(code);
+  });
+
   it("los motivos de fin y las opciones de tema no se repiten", () => {
     expect(new Set(GAME_END_REASONS).size).toBe(GAME_END_REASONS.length);
     expect(GAME_END_REASONS).toHaveLength(7);
```

`client/test/i18n/es.test.ts` (cada código nuevo tiene su mensaje en español):

```diff
diff --git a/client/test/i18n/es.test.ts b/client/test/i18n/es.test.ts
index 946ba51..1c6bb10 100644
--- a/client/test/i18n/es.test.ts
+++ b/client/test/i18n/es.test.ts
@@ -57,4 +57,13 @@ describe("mensajes de error", () => {
     expect(errorMessage("USER_NOT_FOUND")).toBe("No encontramos a ese jugador.");
     expect(errorMessage("USER_NOT_FOUND")).not.toBe(errorMessage("INTERNAL_ERROR"));
   });
+
+  it("los códigos de la verificación por correo tienen su propio mensaje, no el genérico", () => {
+    expect(errorMessage("INVALID_CODE")).toBe("Código incorrecto o vencido. Revisa tu correo o pide uno nuevo.");
+    expect(errorMessage("EMAIL_SEND_FAILED")).toBe("No pudimos enviar el correo. Inténtalo de nuevo en un momento.");
+    expect(errorMessage("EMAIL_NOT_VERIFIED")).toBe("Tu correo aún no está verificado.");
+    for (const code of ["INVALID_CODE", "EMAIL_SEND_FAILED", "EMAIL_NOT_VERIFIED"]) {
+      expect(errorMessage(code)).not.toBe(errorMessage("INTERNAL_ERROR"));
+    }
+  });
 });
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
cd server && npx vitest run test/config test/shared
cd ../client && npx vitest run test/i18n
```

Expected: FAIL — faltan los tres códigos de error, las variables de correo y las reglas de producción.

- [ ] **Step 3: Implementar**

`shared/src/errors.ts` (los tres códigos):

```diff
diff --git a/shared/src/errors.ts b/shared/src/errors.ts
index e36a90c..70a7f68 100644
--- a/shared/src/errors.ts
+++ b/shared/src/errors.ts
@@ -10,6 +10,10 @@ export const ERROR_CODES = [
   "NOT_FOUND",
   "USER_NOT_FOUND",
   "INTERNAL_ERROR",
+  // Cuentas con código por correo (etapa 7)
+  "EMAIL_NOT_VERIFIED",
+  "INVALID_CODE",
+  "EMAIL_SEND_FAILED",
   // Salas (REST)
   "ALREADY_IN_GAME",
   "ROOM_NOT_FOUND",
```

`client/src/i18n/es.ts` (sus mensajes):

```diff
diff --git a/client/src/i18n/es.ts b/client/src/i18n/es.ts
index b420d02..740d1e1 100644
--- a/client/src/i18n/es.ts
+++ b/client/src/i18n/es.ts
@@ -34,6 +34,9 @@ const ERROR_MESSAGES: Record<ErrorCode | typeof NETWORK_ERROR, string> = {
   NOT_FOUND: "No encontramos lo que buscas.",
   USER_NOT_FOUND: "No encontramos a ese jugador.",
   INTERNAL_ERROR: "Algo falló en el servidor. Inténtalo de nuevo.",
+  EMAIL_NOT_VERIFIED: "Tu correo aún no está verificado.",
+  INVALID_CODE: "Código incorrecto o vencido. Revisa tu correo o pide uno nuevo.",
+  EMAIL_SEND_FAILED: "No pudimos enviar el correo. Inténtalo de nuevo en un momento.",
   ALREADY_IN_GAME: "Ya estás en una partida. Vuelve a ella desde el lobby.",
   ROOM_NOT_FOUND: "Esa sala no existe o ya terminó.",
   ROOM_FULL: "Esa sala ya está llena.",
```

`server/src/config/env.ts` (las variables, la regla de Resend y las de producción, que se miran sobre los valores crudos como las que ya existían):

```diff
diff --git a/server/src/config/env.ts b/server/src/config/env.ts
index 64828da..badeac0 100644
--- a/server/src/config/env.ts
+++ b/server/src/config/env.ts
@@ -1,5 +1,8 @@
 import { z } from "zod";
 
+/** «Nombre <dirección>» o solo la dirección. */
+const MAIL_FROM_PATTERN = /^(?:[^<>@\r\n]+<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/;
+
 const envSchema = z
   .object({
     NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
@@ -18,15 +21,38 @@ const envSchema = z
       .default("false")
       .transform((value) => value === "true"),
     COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
+    // Cuentas con código por correo (etapa 7). Apagado, la aplicación se comporta como antes y no pide nada de correo.
+    EMAIL_VERIFICATION: z
+      .enum(["on", "off"], { error: "debe ser on u off" })
+      .default("off")
+      .transform((value) => value === "on"),
+    // Por defecto: consola en desarrollo y memoria en las pruebas; en producción hay que decirlo (con la verificación activa).
+    MAIL_PROVIDER: z.enum(["resend", "console", "memory"], { error: "debe ser resend, console o memory" }).optional(),
+    RESEND_API_KEY: z.string().min(1, "no puede estar vacía").optional(),
+    MAIL_FROM: z.string().regex(MAIL_FROM_PATTERN, "debe ser «Nombre <dirección>» o solo la dirección").optional(),
+    // Solo lo pone el servidor de la prueba E2E: deja usar el buzón en memoria (y su ruta de lectura) en producción.
+    ALLOW_MEMORY_MAIL: z
+      .enum(["true", "false"], { error: "debe ser true o false" })
+      .default("false")
+      .transform((value) => value === "true"),
   })
   .refine((env) => env.COOKIE_SAME_SITE !== "none" || env.COOKIE_SECURE, {
     message: "COOKIE_SAME_SITE=none exige COOKIE_SECURE=true",
     path: ["COOKIE_SAME_SITE"],
   })
+  .refine((env) => env.MAIL_PROVIDER !== "resend" || env.RESEND_API_KEY !== undefined, {
+    message: "es obligatoria con MAIL_PROVIDER=resend",
+    path: ["RESEND_API_KEY"],
+  })
+  .refine((env) => env.MAIL_PROVIDER !== "resend" || env.MAIL_FROM !== undefined, {
+    message: "es obligatorio con MAIL_PROVIDER=resend",
+    path: ["MAIL_FROM"],
+  })
   .transform((env) => ({
     ...env,
     CORS_ORIGIN: env.CORS_ORIGIN ?? (env.NODE_ENV === "production" ? undefined : "http://localhost:5173"),
     TRUST_PROXY: env.TRUST_PROXY ?? 0,
+    MAIL_PROVIDER: env.MAIL_PROVIDER ?? (env.NODE_ENV === "development" ? ("console" as const) : env.NODE_ENV === "test" ? ("memory" as const) : undefined),
   }));
 
 export type Env = z.infer<typeof envSchema>;
@@ -45,6 +71,15 @@ function productionProblems(source: Source): string[] {
   if (source.TRUST_PROXY === undefined || source.TRUST_PROXY === "") {
     problems.push("TRUST_PROXY: en producción es obligatoria (cuántos proxies hay delante; en Render, se verifica según docs/despliegue.md)");
   }
+  if (source.EMAIL_VERIFICATION === "on") {
+    const provider = source.MAIL_PROVIDER;
+    // La consola escribiría los códigos en el registro; la memoria solo la usa el servidor de la prueba E2E. (Un valor desconocido ya lo señala el esquema.)
+    if (provider === undefined || provider === "" || provider === "console") {
+      problems.push("MAIL_PROVIDER: con EMAIL_VERIFICATION=on en producción debe ser resend");
+    } else if (provider === "memory" && source.ALLOW_MEMORY_MAIL !== "true") {
+      problems.push("MAIL_PROVIDER: memory solo se admite en producción con ALLOW_MEMORY_MAIL=true (la prueba E2E); en el servicio real debe ser resend");
+    }
+  }
   return problems;
 }
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
cd server && npx vitest run --testTimeout=30000
cd ../client && npx vitest run --testTimeout=30000
cd .. && npm run typecheck
```

Expected: PASS (servidor: **642 pruebas**, cliente: **673 pruebas**) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: errores y configuración del correo (EMAIL_VERIFICATION, MAIL_PROVIDER, Resend) con reglas de producción" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Migración y esquema de los códigos

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20261007230000_email_verification_codes/migration.sql`, `server/test/db/email-codes.test.ts`, `server/test/db/migration-email-verified.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: la columna `users.email_verified_at` (`timestamptz(3)`, nula; `User.emailVerifiedAt` en Prisma), el tipo `email_code_purpose` (`verify_email`, `reset_password`; `EmailCodePurpose`) y la tabla `email_codes` (`user_id` con `ON DELETE CASCADE`, `purpose`, `code_hash`, `expires_at`, `attempts smallint` con `CHECK (attempts BETWEEN 0 AND 5)`, `created_at`; clave primaria `(user_id, purpose)`; modelo `EmailCode`, con la clave compuesta `userId_purpose`). La migración rellena `email_verified_at` con la fecha actual en todas las cuentas que ya existen.

- [ ] **Step 1: Escribir las pruebas que fallan**

`server/test/db/email-codes.test.ts` (una fila por cuenta y propósito, el borrado en cascada y el tope de intentos que exige la base):

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDatabase } from "../helpers/db.js";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

async function createUser(n = 1) {
  return prisma.user.create({ data: { email: `user${n}@example.com`, username: `user${n}`, passwordHash: "hash" } });
}

const expiresAt = new Date("2026-01-01T00:10:00.000Z");

describe("users.email_verified_at", () => {
  it("una cuenta nueva nace sin verificar", async () => {
    const user = await createUser();
    expect(user.emailVerifiedAt).toBeNull();
  });

  it("se puede marcar como verificada", async () => {
    const user = await createUser();
    const when = new Date("2026-01-01T00:00:00.000Z");
    const updated = await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: when } });
    expect(updated.emailVerifiedAt).toEqual(when);
  });
});

describe("email_codes", () => {
  it("guarda un código por cuenta y propósito, con 0 intentos al empezar", async () => {
    const user = await createUser();
    const code = await prisma.emailCode.create({ data: { userId: user.id, purpose: "verify_email", codeHash: "h1", expiresAt } });
    expect(code).toMatchObject({ userId: user.id, purpose: "verify_email", codeHash: "h1", attempts: 0 });
    expect(code.createdAt).toBeInstanceOf(Date);
  });

  it("una cuenta puede tener a la vez un código de cada propósito", async () => {
    const user = await createUser();
    await prisma.emailCode.create({ data: { userId: user.id, purpose: "verify_email", codeHash: "h1", expiresAt } });
    await prisma.emailCode.create({ data: { userId: user.id, purpose: "reset_password", codeHash: "h2", expiresAt } });
    expect(await prisma.emailCode.count({ where: { userId: user.id } })).toBe(2);
  });

  it("rechaza un segundo código del mismo propósito para la misma cuenta: pedir otro lo reemplaza", async () => {
    const user = await createUser();
    await prisma.emailCode.create({ data: { userId: user.id, purpose: "verify_email", codeHash: "h1", expiresAt } });
    await expect(
      prisma.emailCode.create({ data: { userId: user.id, purpose: "verify_email", codeHash: "h2", expiresAt } }),
    ).rejects.toThrow();
  });

  it("los intentos van de 0 a 5: la base de datos rechaza lo demás", async () => {
    const user = await createUser();
    await expect(
      prisma.emailCode.create({ data: { userId: user.id, purpose: "verify_email", codeHash: "h", expiresAt, attempts: 6 } }),
    ).rejects.toThrow();
    await expect(
      prisma.emailCode.create({ data: { userId: user.id, purpose: "verify_email", codeHash: "h", expiresAt, attempts: -1 } }),
    ).rejects.toThrow();
    const accepted = await prisma.emailCode.create({
      data: { userId: user.id, purpose: "verify_email", codeHash: "h", expiresAt, attempts: 5 },
    });
    expect(accepted.attempts).toBe(5);
  });

  it("no se puede reservar un sexto intento aunque se intente en la propia base de datos", async () => {
    const user = await createUser();
    await prisma.emailCode.create({ data: { userId: user.id, purpose: "verify_email", codeHash: "h", expiresAt, attempts: 5 } });
    await expect(prisma.$executeRaw`UPDATE email_codes SET attempts = attempts + 1 WHERE user_id = ${user.id}::uuid`).rejects.toThrow();
  });

  it("solo admite los propósitos verify_email y reset_password", async () => {
    const user = await createUser();
    await expect(
      prisma.$executeRaw`INSERT INTO email_codes (user_id, purpose, code_hash, expires_at) VALUES (${user.id}::uuid, 'otro', 'h', now())`,
    ).rejects.toThrow();
  });

  it("al borrar la cuenta se borran sus códigos", async () => {
    const user = await createUser();
    await prisma.emailCode.create({ data: { userId: user.id, purpose: "verify_email", codeHash: "h1", expiresAt } });
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.emailCode.count()).toBe(0);
  });

  it("exige una cuenta que exista", async () => {
    await expect(
      prisma.emailCode.create({ data: { userId: "00000000-0000-4000-8000-000000000000", purpose: "verify_email", codeHash: "h", expiresAt } }),
    ).rejects.toThrow();
  });
});
```

`server/test/db/migration-email-verified.test.ts` (aplica todas las migraciones en una base desechable, con una cuenta anterior a esta, y comprueba que queda verificada):

```ts
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { describe, expect, it } from "vitest";

const migrationsDir = join(import.meta.dirname, "../../prisma/migrations");
const migrations = readdirSync(migrationsDir)
  .filter((name) => /^\d{14}_/.test(name))
  .sort();
const sqlOf = (name: string): string => readFileSync(join(migrationsDir, name, "migration.sql"), "utf8");

/**
 * Prueba la migración de la etapa 7 sobre una base de datos desechable: se aplican todas las anteriores, se crea una
 * cuenta «de antes» y se aplica la nueva. Es lo único que comprueba de verdad que las cuentas que ya existían quedan
 * verificadas (la migración corre una sola vez, en el despliegue).
 */
describe("la migración de las cuentas con correo", () => {
  const last = migrations.at(-1)!;
  const previous = migrations.slice(0, -1);

  it("es la última y se llama como lo que hace", () => {
    expect(last).toMatch(/email_verification_codes$/);
  });

  it("da por verificadas las cuentas que ya existían y deja sin verificar las nuevas", async () => {
    const database = `pokemon_minigames_mig_${randomBytes(4).toString("hex")}`;
    const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${database}"`);
    try {
      const url = new URL(process.env.DATABASE_URL!);
      url.pathname = `/${database}`;
      const client = new pg.Client({ connectionString: url.toString() });
      await client.connect();
      try {
        for (const name of previous) await client.query(sqlOf(name));
        await client.query(
          "INSERT INTO users (id, email, username, password_hash) VALUES (gen_random_uuid(), 'antigua@example.com', 'antigua', 'hash')",
        );

        await client.query(sqlOf(last));

        const before = await client.query("SELECT email_verified_at FROM users WHERE username = 'antigua'");
        expect(before.rows[0].email_verified_at).toBeInstanceOf(Date);

        await client.query(
          "INSERT INTO users (id, email, username, password_hash) VALUES (gen_random_uuid(), 'nueva@example.com', 'nueva', 'hash')",
        );
        const after = await client.query("SELECT email_verified_at FROM users WHERE username = 'nueva'");
        expect(after.rows[0].email_verified_at).toBeNull();
      } finally {
        await client.end();
      }
    } finally {
      await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
      await admin.end();
    }
  }, 30_000); // crear una base y aplicar las migraciones tarda más que el límite por defecto cuando la máquina va cargada
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
cd server && npx vitest run test/db/email-codes.test.ts test/db/migration-email-verified.test.ts
```

Expected: FAIL — no existen la columna, el tipo ni la tabla.

- [ ] **Step 3: Implementar**

`server/prisma/schema.prisma` (el enum, la columna y el modelo):

```diff
diff --git a/server/prisma/schema.prisma b/server/prisma/schema.prisma
index 982df3f..bed51b0 100644
--- a/server/prisma/schema.prisma
+++ b/server/prisma/schema.prisma
@@ -75,6 +75,14 @@ enum ThemeMode {
   @@map("theme_mode")
 }
 
+// Para qué sirve un código que llega por correo.
+enum EmailCodePurpose {
+  verify_email
+  reset_password
+
+  @@map("email_code_purpose")
+}
+
 model Type {
   id   Int    @id
   name String @unique
@@ -131,15 +139,18 @@ model PokemonName {
 }
 
 model User {
-  id           String     @id @default(uuid()) @db.Uuid
-  email        String     @unique
-  username     String
-  passwordHash String     @map("password_hash")
-  createdAt    DateTime   @default(now()) @map("created_at") @db.Timestamptz(3)
+  id              String     @id @default(uuid()) @db.Uuid
+  email           String     @unique
+  username        String
+  passwordHash    String     @map("password_hash")
+  createdAt       DateTime   @default(now()) @map("created_at") @db.Timestamptz(3)
   // Preferencia de tema: los dos nulos o los dos con valor (lo exige una restricción).
-  theme        ThemeName?
-  themeMode    ThemeMode? @map("theme_mode")
+  theme           ThemeName?
+  themeMode       ThemeMode? @map("theme_mode")
+  // Cuándo se demostró que la persona controla el correo; nulo mientras no (las cuentas anteriores a la etapa 7 se dieron por verificadas).
+  emailVerifiedAt DateTime?  @map("email_verified_at") @db.Timestamptz(3)
 
+  emailCodes    EmailCode[]
   refreshTokens RefreshToken[]
   gamePlayers   GamePlayer[]
   wonGames      Game[]
@@ -162,6 +173,23 @@ model RefreshToken {
   @@map("refresh_tokens")
 }
 
+// Un código de seis dígitos enviado por correo: una fila por cuenta y propósito (pedir otro reemplaza la fila).
+// Del código solo se guarda un hash con clave. `attempts` va de 0 a 5 (lo exige una restricción de la migración).
+model EmailCode {
+  userId    String           @map("user_id") @db.Uuid
+  purpose   EmailCodePurpose
+  codeHash  String           @map("code_hash")
+  expiresAt DateTime         @map("expires_at") @db.Timestamptz(3)
+  attempts  Int              @default(0) @db.SmallInt
+  // Cuándo se envió.
+  createdAt DateTime         @default(now()) @map("created_at") @db.Timestamptz(3)
+
+  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
+
+  @@id([userId, purpose])
+  @@map("email_codes")
+}
+
 model Game {
   id          String         @id @default(uuid()) @db.Uuid
   roomCode    String         @unique @map("room_code") @db.VarChar(10)
```

`server/prisma/migrations/20261007230000_email_verification_codes/migration.sql` (aditiva; da por verificadas las cuentas que ya existen):

```sql
-- Verificación del correo y recuperación de la contraseña con códigos que llegan por correo (etapa 7).

-- CreateEnum
CREATE TYPE "email_code_purpose" AS ENUM ('verify_email', 'reset_password');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "email_verified_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "email_codes" (
    "user_id" UUID NOT NULL,
    "purpose" "email_code_purpose" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_codes_pkey" PRIMARY KEY ("user_id","purpose")
);

-- AddForeignKey
ALTER TABLE "email_codes" ADD CONSTRAINT "email_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Las cuentas que ya existían se dan por verificadas (con la fecha de esta migración): nadie queda fuera al activar la
-- verificación. Las que se creen después nacen sin verificar.
UPDATE "users" SET "email_verified_at" = CURRENT_TIMESTAMP;

-- Los intentos de un código van de 0 a 5: la base de datos es el tope duro aunque falle cualquier otra protección.
ALTER TABLE "email_codes" ADD CONSTRAINT "email_codes_attempts_check" CHECK ("attempts" BETWEEN 0 AND 5);
```

Regenera el cliente de Prisma (no se versiona) y aplica la migración a la base de desarrollo:

```bash
npm run db:generate -w server
npm run db:migrate -w server
```

Comprueba que el esquema y las migraciones dicen lo mismo (con la `DATABASE_URL` de `server/.env.test`):

```bash
cd server && npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected: `No difference detected.`

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
cd server && npx vitest run --testTimeout=30000
cd .. && npm run typecheck
```

Expected: PASS (servidor: **654 pruebas**) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): email_verified_at y tabla email_codes (migración aditiva; las cuentas de hoy quedan verificadas)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: El servicio de correo

**Files:**
- Create: `server/src/auth/code-policy.ts`, `server/src/mail/mailer.ts`, `server/src/mail/memory-mailer.ts`, `server/src/mail/console-mailer.ts`, `server/src/mail/resend-mailer.ts`, `server/src/mail/templates.ts`, `server/src/mail/create-mailer.ts`
- Test: `server/test/mail/create-mailer.test.ts`, `server/test/mail/memory-and-console.test.ts`, `server/test/mail/resend-mailer.test.ts`, `server/test/mail/templates.test.ts`, `server/test/auth/code-policy.test.ts`

**Interfaces:**
- Consumes: `Env` (Task 1: `MAIL_PROVIDER`, `RESEND_API_KEY`, `MAIL_FROM`).
- Produces:
  - `code-policy.ts`: `CODE_LENGTH = 6`, `CODE_TTL_MINUTES = 10`, `CODE_TTL_MS`, `MAX_CODE_ATTEMPTS = 5`, `PENDING_ACCOUNT_TTL_MS` (24 h).
  - `mailer.ts`: `interface Mail { to: string; subject: string; text: string; html: string }`, `interface Mailer { send(mail: Mail): Promise<void> }`, `class MailerError extends Error` con `status: number | null` (el estado HTTP del proveedor, o `null` si no hubo respuesta) y un mensaje sin la dirección ni el código.
  - `MemoryMailer` (`sent: Mail[]`, `failWith: Error | null`, `to(address): Mail[]`, `clear()`), `ConsoleMailer(log?)` (imprime «[correo simulado] para … — asunto» y el texto), `ResendMailer({ apiKey, from, fetch?, timeoutMs? })` (`POST https://api.resend.com/emails` con `Authorization: Bearer`, cuerpo `{ from, to: [to], subject, text, html }` y `AbortSignal.timeout(8000)`; un error del proveedor lanza `MailerError` con el estado y solo el *nombre* del error, nunca su mensaje).
  - `verificationMail(to, code): Mail` y `passwordResetMail(to, code): Mail` (textos de la spec; HTML mínimo sin enlaces ni imágenes; el código se valida como 6 dígitos y el HTML se escapa), `escapeHtml(text)`.
  - `createMailer(env: { MAIL_PROVIDER?, RESEND_API_KEY?, MAIL_FROM? }, deps?): Mailer`; sin proveedor, un `DisabledMailer` que falla con un error claro si algo intenta enviar.

- [ ] **Step 1: Escribir las pruebas que fallan**

`server/test/mail/templates.test.ts` (textos exactos, sin enlaces ni imágenes, el código validado y el HTML escapado):

```ts
import { describe, expect, it } from "vitest";
import { escapeHtml, passwordResetMail, verificationMail } from "../../src/mail/templates.js";

describe("el correo de verificación", () => {
  const mail = verificationMail("ash@example.com", "048213");

  it("va a la dirección dada y su asunto no lleva datos personales", () => {
    expect(mail.to).toBe("ash@example.com");
    expect(mail.subject).toBe("Tu código de Pokémon Minigames");
  });

  it("el texto lleva solo el código, cuánto dura y qué hacer si no se pidió", () => {
    expect(mail.text).toBe("Tu código de verificación es 048213.\nCaduca en 10 minutos. Si no lo pediste, ignora este mensaje.");
  });

  it("el HTML lleva el mismo código y las mismas frases, sin enlaces, imágenes ni direcciones web", () => {
    expect(mail.html).toContain("048213");
    expect(mail.html).toContain("Caduca en 10 minutos. Si no lo pediste, ignora este mensaje.");
    expect(mail.html).not.toMatch(/href|<img|https?:|<script/i);
    expect(mail.html).toMatch(/^<!doctype html>/i);
    expect(mail.html).toContain('lang="es"');
  });

  it("no lleva el nombre de usuario ni la dirección en el contenido", () => {
    expect(mail.text).not.toContain("ash");
    expect(mail.html).not.toContain("ash@example.com");
  });
});

describe("el correo para cambiar la contraseña", () => {
  const mail = passwordResetMail("ash@example.com", "999000");

  it("tiene su propio asunto y su propio texto, que aclara que la contraseña no cambia si no se pidió", () => {
    expect(mail.subject).toBe("Código para cambiar tu contraseña de Pokémon Minigames");
    expect(mail.text).toBe(
      "Tu código para cambiar la contraseña es 999000.\nCaduca en 10 minutos. Si no lo pediste, ignora este mensaje: tu contraseña no cambia.",
    );
  });

  it("el HTML repite el código y no lleva enlaces", () => {
    expect(mail.html).toContain("999000");
    expect(mail.html).not.toMatch(/href|<img|https?:|<script/i);
  });
});

describe("el código que se escribe en el correo", () => {
  it("tiene que ser de seis dígitos: cualquier otra cosa se rechaza (nada ajeno entra en el correo)", () => {
    for (const bad of ["12345", "1234567", "12a456", "<b>123", "12 456", ""]) {
      expect(() => verificationMail("a@b.co", bad), bad).toThrow(RangeError);
      expect(() => passwordResetMail("a@b.co", bad), bad).toThrow(RangeError);
    }
  });
});

describe("escapeHtml", () => {
  it("escapa los caracteres que cambian el significado del HTML", () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;");
    expect(escapeHtml("sin nada raro")).toBe("sin nada raro");
  });
});
```

`server/test/mail/memory-and-console.test.ts` (el buzón en memoria y la consola):

```ts
import { describe, expect, it } from "vitest";
import { ConsoleMailer } from "../../src/mail/console-mailer.js";
import { MailerError } from "../../src/mail/mailer.js";
import { MemoryMailer } from "../../src/mail/memory-mailer.js";

const mail = { to: "Ash@Example.com", subject: "Tu código", text: "Tu código es 123456.", html: "<p>123456</p>" };

describe("MemoryMailer", () => {
  it("guarda cada mensaje enviado, en orden", async () => {
    const mailer = new MemoryMailer();
    await mailer.send(mail);
    await mailer.send({ ...mail, subject: "Otro" });
    expect(mailer.sent.map((sent) => sent.subject)).toEqual(["Tu código", "Otro"]);
  });

  it("busca por destinatario sin distinguir mayúsculas", async () => {
    const mailer = new MemoryMailer();
    await mailer.send(mail);
    await mailer.send({ ...mail, to: "misty@example.com" });
    expect(mailer.to("ash@example.com")).toHaveLength(1);
    expect(mailer.to("MISTY@example.com")).toHaveLength(1);
    expect(mailer.to("brock@example.com")).toEqual([]);
  });

  it("guarda una copia: cambiar el original después no altera lo enviado", async () => {
    const mailer = new MemoryMailer();
    const original = { ...mail };
    await mailer.send(original);
    original.text = "otra cosa";
    expect(mailer.sent[0]!.text).toBe("Tu código es 123456.");
  });

  it("puede fallar a propósito (para probar qué pasa cuando el proveedor cae) y volver a funcionar", async () => {
    const mailer = new MemoryMailer();
    mailer.failWith = new MailerError(503, "Resend respondió 503");
    await expect(mailer.send(mail)).rejects.toThrow("Resend respondió 503");
    expect(mailer.sent).toHaveLength(0);
    mailer.failWith = null;
    await mailer.send(mail);
    expect(mailer.sent).toHaveLength(1);
  });

  it("clear vacía el buzón", async () => {
    const mailer = new MemoryMailer();
    await mailer.send(mail);
    mailer.clear();
    expect(mailer.sent).toEqual([]);
  });
});

describe("ConsoleMailer", () => {
  it("imprime el destinatario, el asunto y el texto (para probar el flujo en el PC sin Resend)", async () => {
    const lines: string[] = [];
    await new ConsoleMailer((line) => lines.push(line)).send(mail);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("[correo simulado]");
    expect(lines[0]).toContain("Ash@Example.com");
    expect(lines[0]).toContain("Tu código");
    expect(lines[0]).toContain("123456");
  });
});
```

`server/test/mail/resend-mailer.test.ts` (con un `fetch` falso: cuerpo, cabeceras, tiempo máximo y errores sin datos del proveedor):

```ts
import { describe, expect, it } from "vitest";
import { MailerError } from "../../src/mail/mailer.js";
import { ResendMailer } from "../../src/mail/resend-mailer.js";

const mail = { to: "ash@example.com", subject: "Tu código", text: "texto", html: "<p>html</p>" };
const FROM = "Pokémon Minigames <no-responder@ejemplo.me>";

interface Call {
  url: string;
  init: RequestInit;
}

/** Un `fetch` falso que responde (o falla) con lo que se le dé y apunta cada llamada. */
function fakeFetch(outcome: Response | Error) {
  const calls: Call[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (outcome instanceof Error) throw outcome;
    return outcome.clone();
  }) as typeof fetch;
  return { fn, calls };
}

async function failureOf(promise: Promise<unknown>): Promise<MailerError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(MailerError);
  return error as MailerError;
}

describe("ResendMailer", () => {
  it("envía un POST a la API de Resend con la clave, el remitente, el destinatario y el contenido", async () => {
    const { fn, calls } = fakeFetch(new Response(JSON.stringify({ id: "abc" }), { status: 200 }));
    const mailer = new ResendMailer({ apiKey: "re_clave_secreta", from: FROM, fetch: fn });
    await mailer.send(mail);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    expect(calls[0]!.init.method).toBe("POST");
    expect(calls[0]!.init.headers).toMatchObject({ Authorization: "Bearer re_clave_secreta", "Content-Type": "application/json" });
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ from: FROM, to: ["ash@example.com"], subject: "Tu código", text: "texto", html: "<p>html</p>" });
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("una respuesta que no es 2xx lanza un MailerError con el estado y el nombre del error, sin la dirección ni el mensaje del proveedor", async () => {
    const body = { name: "validation_error", message: "La dirección ash@example.com no es válida", statusCode: 422 };
    const { fn } = fakeFetch(new Response(JSON.stringify(body), { status: 422 }));
    const error = await failureOf(new ResendMailer({ apiKey: "re_x", from: FROM, fetch: fn }).send(mail));
    expect(error.status).toBe(422);
    expect(error.message).toContain("422");
    expect(error.message).toContain("validation_error");
    expect(error.message).not.toContain("ash@example.com");
  });

  it("si el cuerpo del error no es JSON, el mensaje lleva solo el estado", async () => {
    const { fn } = fakeFetch(new Response("<html>Bad Gateway</html>", { status: 502 }));
    const error = await failureOf(new ResendMailer({ apiKey: "re_x", from: FROM, fetch: fn }).send(mail));
    expect(error.status).toBe(502);
    expect(error.message).toBe("Resend respondió 502");
  });

  it("agotar la cuota (429) y una clave rechazada (403) son errores con su estado", async () => {
    for (const status of [429, 403]) {
      const { fn } = fakeFetch(new Response(JSON.stringify({ name: "rate_limit_exceeded" }), { status }));
      const error = await failureOf(new ResendMailer({ apiKey: "re_x", from: FROM, fetch: fn }).send(mail));
      expect(error.status).toBe(status);
    }
  });

  it("un fallo de red lanza un MailerError sin estado", async () => {
    const { fn } = fakeFetch(new TypeError("fetch failed"));
    const error = await failureOf(new ResendMailer({ apiKey: "re_x", from: FROM, fetch: fn }).send(mail));
    expect(error.status).toBeNull();
    expect(error.message).toBe("No se pudo conectar con Resend");
  });

  it("si Resend no responde a tiempo, lo dice (y de verdad se corta al pasar el tiempo máximo)", async () => {
    const hanging = ((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      })) as typeof fetch;
    const started = Date.now();
    const error = await failureOf(new ResendMailer({ apiKey: "re_x", from: FROM, fetch: hanging, timeoutMs: 30 }).send(mail));
    expect(error.status).toBeNull();
    expect(error.message).toBe("Resend no respondió a tiempo");
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("espera como máximo 8 segundos si no se dice otra cosa", async () => {
    const seen: AbortSignal[] = [];
    const spy = (async (_url: string | URL | Request, init?: RequestInit) => {
      seen.push(init!.signal!);
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    await new ResendMailer({ apiKey: "re_x", from: FROM, fetch: spy }).send(mail);
    expect(seen[0]!.aborted).toBe(false);
  });

  it("la clave de la API no aparece en ningún mensaje de error", async () => {
    for (const outcome of [new Response("{}", { status: 401 }), new TypeError("fetch failed")]) {
      const { fn } = fakeFetch(outcome);
      const error = await failureOf(new ResendMailer({ apiKey: "re_clave_secreta", from: FROM, fetch: fn }).send(mail));
      expect(error.message).not.toContain("re_clave_secreta");
    }
  });
});
```

`server/test/mail/create-mailer.test.ts` (qué proveedor sale de la configuración):

```ts
import { describe, expect, it } from "vitest";
import { ConsoleMailer } from "../../src/mail/console-mailer.js";
import { createMailer } from "../../src/mail/create-mailer.js";
import { MailerError } from "../../src/mail/mailer.js";
import { MemoryMailer } from "../../src/mail/memory-mailer.js";
import { ResendMailer } from "../../src/mail/resend-mailer.js";

const mail = { to: "ash@example.com", subject: "s", text: "t", html: "<p>t</p>" };

describe("createMailer", () => {
  it("elige la versión según MAIL_PROVIDER", () => {
    expect(createMailer({ MAIL_PROVIDER: "memory" })).toBeInstanceOf(MemoryMailer);
    expect(createMailer({ MAIL_PROVIDER: "console" })).toBeInstanceOf(ConsoleMailer);
    expect(createMailer({ MAIL_PROVIDER: "resend", RESEND_API_KEY: "re_x", MAIL_FROM: "a@ejemplo.me" })).toBeInstanceOf(ResendMailer);
  });

  it("sin proveedor (producción con la verificación apagada) da un envío que falla con un error claro y nunca envía", async () => {
    const mailer = createMailer({});
    const error = await mailer.send(mail).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(MailerError);
    expect((error as MailerError).message).toBe("El envío de correo no está configurado");
  });

  it("Resend sin clave o sin remitente es un error de programación: la configuración ya lo impide", () => {
    expect(() => createMailer({ MAIL_PROVIDER: "resend", MAIL_FROM: "a@ejemplo.me" })).toThrow(/RESEND_API_KEY/);
    expect(() => createMailer({ MAIL_PROVIDER: "resend", RESEND_API_KEY: "re_x" })).toThrow(/MAIL_FROM/);
  });

  it("pasa el fetch y el registro que se le den (para las pruebas)", async () => {
    let called = false;
    const fetch = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as typeof globalThis.fetch;
    await createMailer({ MAIL_PROVIDER: "resend", RESEND_API_KEY: "re_x", MAIL_FROM: "a@ejemplo.me" }, { fetch }).send(mail);
    expect(called).toBe(true);

    const lines: string[] = [];
    await createMailer({ MAIL_PROVIDER: "console" }, { log: (line) => lines.push(line) }).send(mail);
    expect(lines).toHaveLength(1);
  });
});
```

`server/test/auth/code-policy.test.ts` (la política de la spec escrita con números, no con las propias constantes: 6 dígitos, 10 minutos, 5 intentos y 24 horas):

```ts
import { describe, expect, it } from "vitest";
import { CODE_LENGTH, CODE_TTL_MINUTES, CODE_TTL_MS, MAX_CODE_ATTEMPTS, PENDING_ACCOUNT_TTL_MS } from "../../src/auth/code-policy.js";

describe("la política de los códigos", () => {
  it("es la de la spec: 6 dígitos, 10 minutos, 5 intentos y 24 horas para las cuentas pendientes", () => {
    expect(CODE_LENGTH).toBe(6);
    expect(CODE_TTL_MINUTES).toBe(10);
    expect(CODE_TTL_MS).toBe(10 * 60 * 1000);
    expect(MAX_CODE_ATTEMPTS).toBe(5);
    expect(PENDING_ACCOUNT_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
cd server && npx vitest run test/mail test/auth/code-policy.test.ts
```

Expected: FAIL — no existen los módulos de `src/mail` ni `code-policy`.

- [ ] **Step 3: Implementar**

`server/src/auth/code-policy.ts` (las constantes de la spec en un solo sitio):

```ts
/** Las reglas de los códigos que llegan por correo (spec de la etapa 7, secciones 2 y 4). */

/** Dígitos de un código. */
export const CODE_LENGTH = 6;

/** Cuánto vale un código desde que se envía. */
export const CODE_TTL_MINUTES = 10;
export const CODE_TTL_MS = CODE_TTL_MINUTES * 60 * 1000;

/** Intentos que admite un código antes de bloquearse; la base de datos lo exige también. */
export const MAX_CODE_ATTEMPTS = 5;

/** Una cuenta sin verificar y sin historial más vieja que esto se considera libre al registrarse. */
export const PENDING_ACCOUNT_TTL_MS = 24 * 60 * 60 * 1000;
```

`server/src/mail/mailer.ts` (la interfaz y el error):

```ts
/** Un correo listo para enviar. */
export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Quien envía correos: Resend en producción, la consola en desarrollo y la memoria en las pruebas. */
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/**
 * Un correo que no se pudo enviar. `status` es el de la respuesta del proveedor, o nulo si ni siquiera respondió. El mensaje
 * nunca lleva la dirección, el código ni la clave: se escribe en el registro del servidor y a quien usa la aplicación no
 * le llega nada del proveedor.
 */
export class MailerError extends Error {
  constructor(
    readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = "MailerError";
  }
}
```

`server/src/mail/memory-mailer.ts`:

```ts
import type { Mail, Mailer } from "./mailer.js";

/** Guarda los correos en una lista en vez de enviarlos: las pruebas y la E2E leen de ahí los códigos. */
export class MemoryMailer implements Mailer {
  readonly sent: Mail[] = [];
  /** Mientras tenga un error, cada envío falla con él (para probar qué pasa cuando el proveedor cae). */
  failWith: Error | null = null;

  async send(mail: Mail): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.sent.push({ ...mail });
  }

  /** Lo enviado a una dirección (sin distinguir mayúsculas), del más antiguo al más reciente. */
  to(address: string): Mail[] {
    const wanted = address.toLowerCase();
    return this.sent.filter((mail) => mail.to.toLowerCase() === wanted);
  }

  clear(): void {
    this.sent.length = 0;
  }
}
```

`server/src/mail/console-mailer.ts`:

```ts
import type { Mail, Mailer } from "./mailer.js";

/**
 * Imprime el correo en la consola del servidor, para probar el flujo completo en el PC sin Resend. Escribe el código, así
 * que la configuración lo prohíbe en producción.
 */
export class ConsoleMailer implements Mailer {
  constructor(private readonly log: (line: string) => void = console.log) {}

  async send(mail: Mail): Promise<void> {
    this.log(`[correo simulado] para ${mail.to} — ${mail.subject}\n${mail.text}`);
  }
}
```

`server/src/mail/resend-mailer.ts`:

```ts
import { type Mail, type Mailer, MailerError } from "./mailer.js";

const ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_TIMEOUT_MS = 8000;

export interface ResendMailerOptions {
  apiKey: string;
  /** «Nombre <dirección>» o solo la dirección, de un dominio verificado en Resend. */
  from: string;
  /** Reemplazable en las pruebas. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** El nombre del error que informa Resend (`validation_error`, `rate_limit_exceeded`…); nunca su mensaje, que puede repetir la dirección. */
async function providerErrorName(response: Response): Promise<string | null> {
  try {
    const data: unknown = await response.json();
    const name = typeof data === "object" && data !== null ? (data as { name?: unknown }).name : undefined;
    return typeof name === "string" && /^[a-z_]{1,60}$/.test(name) ? name : null;
  } catch {
    return null;
  }
}

const isTimeout = (error: unknown): boolean => error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");

/** Envía por la API HTTP de Resend (Render gratis bloquea el correo por SMTP). Sin SDK: es una sola llamada. */
export class ResendMailer implements Mailer {
  constructor(private readonly options: ResendMailerOptions) {}

  async send(mail: Mail): Promise<void> {
    const doFetch = this.options.fetch ?? globalThis.fetch.bind(globalThis);
    let response: Response;
    try {
      response = await doFetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.options.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: this.options.from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
    } catch (error) {
      throw new MailerError(null, isTimeout(error) ? "Resend no respondió a tiempo" : "No se pudo conectar con Resend");
    }
    if (response.ok) return;
    const name = await providerErrorName(response);
    throw new MailerError(response.status, `Resend respondió ${response.status}${name ? ` (${name})` : ""}`);
  }
}
```

`server/src/mail/templates.ts`:

```ts
import { CODE_LENGTH, CODE_TTL_MINUTES } from "../auth/code-policy.js";
import type { Mail } from "./mailer.js";

/** Escapa lo que cambia el significado del HTML. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Nada ajeno entra en un correo: el código son exactamente seis dígitos o no se escribe. */
function assertCode(code: string): void {
  if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)) throw new RangeError("El código debe tener seis dígitos");
}

/** HTML mínimo con estilos en línea: sin imágenes ni enlaces (nada que rastrear y mejor entrega). */
function page(intro: string, code: string, outro: string): string {
  return `<!doctype html>
<html lang="es">
<body style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#14263f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="420" cellpadding="0" cellspacing="0" style="max-width:420px;background:#ffffff;border-radius:12px;padding:24px">
<tr><td>
<p style="margin:0 0 12px;font-size:16px">${escapeHtml(intro)}</p>
<p style="margin:0 0 16px;font-size:34px;font-weight:bold;letter-spacing:8px;font-family:'Courier New',Courier,monospace">${escapeHtml(code)}</p>
<p style="margin:0;font-size:14px;color:#40536e">${escapeHtml(outro)}</p>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
}

const EXPIRES = `Caduca en ${CODE_TTL_MINUTES} minutos. Si no lo pediste, ignora este mensaje.`;

/** El código para verificar el correo de una cuenta nueva. No lleva el nombre de usuario ni ningún otro dato. */
export function verificationMail(to: string, code: string): Mail {
  assertCode(code);
  return {
    to,
    subject: "Tu código de Pokémon Minigames",
    text: `Tu código de verificación es ${code}.\n${EXPIRES}`,
    html: page("Tu código de verificación es:", code, EXPIRES),
  };
}

/** El código para cambiar la contraseña. Aclara que, si no se pidió, la contraseña no cambia. */
export function passwordResetMail(to: string, code: string): Mail {
  assertCode(code);
  const outro = `Caduca en ${CODE_TTL_MINUTES} minutos. Si no lo pediste, ignora este mensaje: tu contraseña no cambia.`;
  return {
    to,
    subject: "Código para cambiar tu contraseña de Pokémon Minigames",
    text: `Tu código para cambiar la contraseña es ${code}.\n${outro}`,
    html: page("Tu código para cambiar la contraseña es:", code, outro),
  };
}
```

`server/src/mail/create-mailer.ts`:

```ts
import { ConsoleMailer } from "./console-mailer.js";
import { type Mail, type Mailer, MailerError } from "./mailer.js";
import { MemoryMailer } from "./memory-mailer.js";
import { ResendMailer } from "./resend-mailer.js";

/** Lo que el servicio de correo toma de la configuración. */
export interface MailerEnv {
  MAIL_PROVIDER?: "resend" | "console" | "memory";
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
}

export interface MailerDeps {
  fetch?: typeof fetch;
  log?: (line: string) => void;
}

/** Sin proveedor (producción con la verificación apagada) nada debería enviar: si algo lo intenta, falla con un error claro. */
class DisabledMailer implements Mailer {
  async send(_mail: Mail): Promise<void> {
    throw new MailerError(null, "El envío de correo no está configurado");
  }
}

export function createMailer(env: MailerEnv, deps: MailerDeps = {}): Mailer {
  switch (env.MAIL_PROVIDER) {
    case "resend":
      // La configuración ya exige las dos variables con Resend: esto solo protege de un uso equivocado desde el código.
      if (!env.RESEND_API_KEY) throw new Error("Falta RESEND_API_KEY");
      if (!env.MAIL_FROM) throw new Error("Falta MAIL_FROM");
      return new ResendMailer({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM, fetch: deps.fetch });
    case "console":
      return new ConsoleMailer(deps.log);
    case "memory":
      return new MemoryMailer();
    default:
      return new DisabledMailer();
  }
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
cd server && npx vitest run --testTimeout=30000
cd .. && npm run typecheck
```

Expected: PASS (servidor: **681 pruebas**) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): servicio de correo (Resend por fetch, consola y memoria) con plantillas en español" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: El almacén de códigos

**Files:**
- Create: `server/src/auth/email-codes.ts`
- Test: `server/test/auth/email-codes.test.ts`

**Interfaces:**
- Consumes: la tabla `email_codes` (Task 2) y las constantes de `code-policy.ts` (Task 3).
- Produces: `type EmailCodePurpose = "verify_email" | "reset_password"`; `generateCode(random?): string` (6 dígitos con ceros a la izquierda); `createCodeHasher(secret): CodeHasher` con `CodeHasher = (userId, purpose, code) => string` (HMAC con clave derivada del secreto); `class EmailCodeStore({ prisma, hash, now?, random? })` con
  - `issue(db, userId, purpose): Promise<string>` — crea (o reemplaza) la fila y devuelve el código en claro; los intentos vuelven a cero;
  - `claim(userId, purpose, code): Promise<CodeClaim>` — reserva el intento con una sola instrucción SQL, compara en tiempo constante y falla con `AppError(400, "INVALID_CODE")` ante cualquier problema;
  - `claimByEmail(email, purpose, code): Promise<{ userId; claim }>` — igual por el correo; con un correo que no existe usa un identificador inventado y falla igual;
  - `CodeClaim { consume(tx): Promise<void> }` — borra la fila por su hash; si no borra exactamente una, falla con el mismo error.

- [ ] **Step 1: Escribir las pruebas que fallan**

`server/test/auth/email-codes.test.ts` (generación, hash con clave, vencimiento con reloj inyectado, tope de cinco intentos incluso con 20 peticiones a la vez, uso único con dos aciertos simultáneos, propósitos separados y un correo que no existe):

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { CODE_TTL_MS, MAX_CODE_ATTEMPTS } from "../../src/auth/code-policy.js";
import { EmailCodeStore, createCodeHasher, generateCode } from "../../src/auth/email-codes.js";
import { AppError } from "../../src/http/errors.js";
import { prisma, resetDatabase, warmUpPool } from "../helpers/db.js";

const SECRET = "s".repeat(40);
let now = new Date("2026-01-01T00:00:00.000Z");
const store = new EmailCodeStore({ prisma, hash: createCodeHasher(SECRET), now: () => now });

beforeEach(async () => {
  now = new Date("2026-01-01T00:00:00.000Z");
  await resetDatabase();
});
afterAll(() => prisma.$disconnect());

async function createUser(n = 1) {
  return prisma.user.create({ data: { email: `user${n}@example.com`, username: `user${n}`, passwordHash: "hash" } });
}

async function expectInvalid(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe("INVALID_CODE");
  expect((error as AppError).status).toBe(400);
}

const attemptsOf = async (userId: string, purpose: "verify_email" | "reset_password" = "verify_email") =>
  (await prisma.emailCode.findUniqueOrThrow({ where: { userId_purpose: { userId, purpose } } })).attempts;

/** Una forma de equivocarse que nunca coincide con el código real. */
const wrong = (code: string): string => (code === "000000" ? "000001" : "000000");

describe("generateCode", () => {
  it("son seis dígitos, con ceros a la izquierda si hace falta", () => {
    expect(generateCode(() => 42)).toBe("000042");
    expect(generateCode(() => 0)).toBe("000000");
    expect(generateCode(() => 999_999)).toBe("999999");
  });

  it("pide al generador un número menor que un millón", () => {
    let seenMax = 0;
    generateCode((max) => {
      seenMax = max;
      return 1;
    });
    expect(seenMax).toBe(1_000_000);
  });

  it("con el generador criptográfico real siempre da seis dígitos", () => {
    for (let i = 0; i < 500; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });
});

describe("createCodeHasher", () => {
  const hash = createCodeHasher(SECRET);

  it("da un hash hexadecimal de 64 caracteres que no contiene el código", () => {
    const value = hash("u1", "verify_email", "123456");
    expect(value).toMatch(/^[0-9a-f]{64}$/);
    expect(value).not.toContain("123456");
  });

  it("es estable, y cambia con la cuenta, el propósito, el código y la clave del servidor", () => {
    const base = hash("u1", "verify_email", "123456");
    expect(hash("u1", "verify_email", "123456")).toBe(base);
    expect(hash("u2", "verify_email", "123456")).not.toBe(base);
    expect(hash("u1", "reset_password", "123456")).not.toBe(base);
    expect(hash("u1", "verify_email", "123457")).not.toBe(base);
    expect(createCodeHasher("otra-clave-distinta-de-32-caracteres-xx")("u1", "verify_email", "123456")).not.toBe(base);
  });
});

describe("issue", () => {
  it("guarda el hash (no el código), vence a los 10 minutos y empieza con 0 intentos", async () => {
    const user = await createUser();
    const code = await store.issue(prisma, user.id, "verify_email");
    expect(code).toMatch(/^\d{6}$/);
    const row = await prisma.emailCode.findUniqueOrThrow({ where: { userId_purpose: { userId: user.id, purpose: "verify_email" } } });
    expect(row.codeHash).toBe(createCodeHasher(SECRET)(user.id, "verify_email", code));
    expect(row.codeHash).not.toContain(code);
    expect(row.expiresAt).toEqual(new Date(now.getTime() + CODE_TTL_MS));
    expect(row.createdAt).toEqual(now);
    expect(row.attempts).toBe(0);
  });

  it("pedir otro código reemplaza al anterior: cambia el hash, el vencimiento, el envío y los intentos", async () => {
    const user = await createUser();
    const first = await store.issue(prisma, user.id, "verify_email");
    await expectInvalid(store.claim(user.id, "verify_email", wrong(first)));
    expect(await attemptsOf(user.id)).toBe(1);

    now = new Date(now.getTime() + 60_000);
    const second = await store.issue(prisma, user.id, "verify_email");
    expect(await prisma.emailCode.count({ where: { userId: user.id } })).toBe(1);
    const row = await prisma.emailCode.findUniqueOrThrow({ where: { userId_purpose: { userId: user.id, purpose: "verify_email" } } });
    expect(row.attempts).toBe(0);
    expect(row.createdAt).toEqual(now);
    expect(row.expiresAt).toEqual(new Date(now.getTime() + CODE_TTL_MS));
    if (second !== first) await expectInvalid(store.claim(user.id, "verify_email", first));
    await expect(store.claim(user.id, "verify_email", second)).resolves.toBeDefined();
  });

  it("cada propósito tiene su propio código", async () => {
    const user = await createUser();
    await store.issue(prisma, user.id, "verify_email");
    await store.issue(prisma, user.id, "reset_password");
    expect(await prisma.emailCode.count({ where: { userId: user.id } })).toBe(2);
  });

  it("se puede usar dentro de una transacción: si se deshace, el código no existe", async () => {
    const user = await createUser();
    await prisma
      .$transaction(async (tx) => {
        await store.issue(tx, user.id, "verify_email");
        throw new Error("deshacer");
      })
      .catch(() => undefined);
    expect(await prisma.emailCode.count()).toBe(0);
  });
});

describe("claim", () => {
  it("con el código correcto devuelve una reclamación que se consume una sola vez", async () => {
    const user = await createUser();
    const code = await store.issue(prisma, user.id, "verify_email");
    const claim = await store.claim(user.id, "verify_email", code);
    await prisma.$transaction((tx) => claim.consume(tx));
    expect(await prisma.emailCode.count()).toBe(0);
    await expectInvalid(store.claim(user.id, "verify_email", code));
  });

  it("un código incorrecto da INVALID_CODE y gasta un intento", async () => {
    const user = await createUser();
    const code = await store.issue(prisma, user.id, "verify_email");
    await expectInvalid(store.claim(user.id, "verify_email", wrong(code)));
    expect(await attemptsOf(user.id)).toBe(1);
  });

  it("el quinto intento, si acierta, vale; tras cuatro fallos todavía queda uno", async () => {
    const user = await createUser();
    const code = await store.issue(prisma, user.id, "verify_email");
    for (let i = 0; i < MAX_CODE_ATTEMPTS - 1; i++) await expectInvalid(store.claim(user.id, "verify_email", wrong(code)));
    await expect(store.claim(user.id, "verify_email", code)).resolves.toBeDefined();
    expect(await attemptsOf(user.id)).toBe(MAX_CODE_ATTEMPTS);
  });

  it("tras cinco fallos el código se bloquea: el sexto intento falla aunque sea el correcto y no gasta más", async () => {
    const user = await createUser();
    const code = await store.issue(prisma, user.id, "verify_email");
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) await expectInvalid(store.claim(user.id, "verify_email", wrong(code)));
    await expectInvalid(store.claim(user.id, "verify_email", code));
    expect(await attemptsOf(user.id)).toBe(MAX_CODE_ATTEMPTS);
  });

  it("pasados 10 minutos ya no vale; un milisegundo antes todavía", async () => {
    const user = await createUser();
    const code = await store.issue(prisma, user.id, "verify_email");
    now = new Date(now.getTime() + CODE_TTL_MS - 1);
    await expect(store.claim(user.id, "verify_email", code)).resolves.toBeDefined();
    now = new Date(now.getTime() + 1);
    await expectInvalid(store.claim(user.id, "verify_email", code));
  });

  it("una cuenta sin código, o que no existe, da el mismo error", async () => {
    const user = await createUser();
    await expectInvalid(store.claim(user.id, "verify_email", "123456"));
    await expectInvalid(store.claim("00000000-0000-4000-8000-000000000000", "verify_email", "123456"));
  });

  it("el código de un propósito no sirve para el otro", async () => {
    const user = await createUser();
    const code = await store.issue(prisma, user.id, "verify_email");
    await expectInvalid(store.claim(user.id, "reset_password", code));
    const reset = await store.issue(prisma, user.id, "reset_password");
    await expectInvalid(store.claim(user.id, "verify_email", reset === code ? wrong(code) : reset));
  });

  it("el código de una cuenta no sirve para otra", async () => {
    const one = await createUser(1);
    const two = await createUser(2);
    const code = await store.issue(prisma, one.id, "verify_email");
    await store.issue(prisma, two.id, "verify_email");
    await expectInvalid(store.claim(two.id, "verify_email", code));
  });

  it("si se pide otro código entre comprobar y consumir, el consumo falla (no se gasta un código que ya no vale)", async () => {
    const user = await createUser();
    const code = await store.issue(prisma, user.id, "verify_email");
    const claim = await store.claim(user.id, "verify_email", code);
    await store.issue(prisma, user.id, "verify_email");
    await expectInvalid(prisma.$transaction((tx) => claim.consume(tx)));
    expect(await prisma.emailCode.count()).toBe(1);
  });
});

describe("claimByEmail", () => {
  it("encuentra la cuenta por su correo y comprueba el código", async () => {
    const user = await createUser();
    const code = await store.issue(prisma, user.id, "verify_email");
    const result = await store.claimByEmail("user1@example.com", "verify_email", code);
    expect(result.userId).toBe(user.id);
    await prisma.$transaction((tx) => result.claim.consume(tx));
    expect(await prisma.emailCode.count()).toBe(0);
  });

  it("un correo que no existe da el mismo INVALID_CODE que un código equivocado", async () => {
    const user = await createUser();
    await store.issue(prisma, user.id, "verify_email");
    await expectInvalid(store.claimByEmail("nadie@example.com", "verify_email", "123456"));
    await expectInvalid(store.claimByEmail("user1@example.com", "verify_email", "000000"));
  });
});

describe("carreras", () => {
  it("20 intentos fallidos a la vez gastan como mucho 5", async () => {
    await warmUpPool();
    const user = await createUser();
    const code = await store.issue(prisma, user.id, "verify_email");
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => store.claim(user.id, "verify_email", wrong(code))));
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(await attemptsOf(user.id)).toBe(MAX_CODE_ATTEMPTS);
  });

  it("20 intentos a la vez, con el correcto entre ellos, no dejan pasar más de 5 comprobaciones", async () => {
    await warmUpPool();
    const user = await createUser();
    const code = await store.issue(prisma, user.id, "verify_email");
    const guesses = Array.from({ length: 20 }, (_, i) => (i === 19 ? code : wrong(code)));
    const results = await Promise.allSettled(guesses.map((guess) => store.claim(user.id, "verify_email", guess)));
    const accepted = results.filter((result) => result.status === "fulfilled").length;
    expect(accepted).toBeLessThanOrEqual(1);
    expect(await attemptsOf(user.id)).toBeLessThanOrEqual(MAX_CODE_ATTEMPTS);
  });

  it("dos peticiones que aciertan a la vez: solo una consume el código", async () => {
    await warmUpPool();
    const user = await createUser();
    const code = await store.issue(prisma, user.id, "verify_email");
    const results = await Promise.allSettled(
      [1, 2].map(async () => {
        const claim = await store.claim(user.id, "verify_email", code);
        await prisma.$transaction((tx) => claim.consume(tx));
      }),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect((rejected.reason as AppError).code).toBe("INVALID_CODE");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
cd server && npx vitest run test/auth/email-codes.test.ts
```

Expected: FAIL — no existe `src/auth/email-codes`.

- [ ] **Step 3: Implementar**

`server/src/auth/email-codes.ts`:

```ts
import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { AppError } from "../http/errors.js";
import { CODE_LENGTH, CODE_TTL_MS, MAX_CODE_ATTEMPTS } from "./code-policy.js";

export type EmailCodePurpose = "verify_email" | "reset_password";

type Db = Prisma.TransactionClient | PrismaClient;

/** El mismo error para un código equivocado, vencido, bloqueado o de una cuenta que no existe: no delata nada. */
const invalidCode = (): AppError => new AppError(400, "INVALID_CODE", "Código incorrecto o vencido");

/** Seis dígitos aleatorios, con ceros a la izquierda. El generador es reemplazable en las pruebas. */
export function generateCode(random: (max: number) => number = (max) => randomInt(0, max)): string {
  return String(random(10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

export type CodeHasher = (userId: string, purpose: EmailCodePurpose, code: string) => string;

/**
 * Hash con clave de un código: lo único que se guarda en la base de datos. Con una clave que no está en ella, quien copiara
 * la base no podría probar el millón de combinaciones por su cuenta. La clave sale del secreto del servidor con una etiqueta
 * propia, para no usar el mismo secreto en dos sitios; la cuenta y el propósito van dentro, así un hash no sirve en otra fila.
 */
export function createCodeHasher(secret: string): CodeHasher {
  const key = createHmac("sha256", secret).update("pokemon-minigames:email-code:v1").digest();
  return (userId, purpose, code) => createHmac("sha256", key).update(`${userId}:${purpose}:${code}`).digest("hex");
}

/** Comparación de tiempo constante entre dos hashes hexadecimales. */
function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Un código ya comprobado y todavía sin gastar: `consume` lo borra, y solo una petición puede hacerlo. */
export interface CodeClaim {
  consume(tx: Prisma.TransactionClient): Promise<void>;
}

export interface EmailCodeStoreDeps {
  prisma: PrismaClient;
  hash: CodeHasher;
  /** Reloj inyectable para probar el vencimiento (también en el SQL, como parámetro). */
  now?: () => Date;
  random?: (max: number) => number;
}

export class EmailCodeStore {
  private readonly prisma: PrismaClient;
  private readonly hash: CodeHasher;
  private readonly now: () => Date;
  private readonly random: ((max: number) => number) | undefined;

  constructor(deps: EmailCodeStoreDeps) {
    this.prisma = deps.prisma;
    this.hash = deps.hash;
    this.now = deps.now ?? (() => new Date());
    this.random = deps.random;
  }

  /**
   * Crea un código nuevo para la cuenta y el propósito y lo devuelve en claro, para enviarlo. Reemplaza la fila anterior, así
   * que el código de antes deja de valer y los intentos vuelven a cero.
   */
  async issue(db: Db, userId: string, purpose: EmailCodePurpose): Promise<string> {
    const code = generateCode(this.random);
    const now = this.now();
    const data = {
      codeHash: this.hash(userId, purpose, code),
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      attempts: 0,
      createdAt: now,
    };
    await db.emailCode.upsert({
      where: { userId_purpose: { userId, purpose } },
      create: { userId, purpose, ...data },
      update: data,
    });
    return code;
  }

  /**
   * Comprueba un código. El intento se **reserva antes de comparar**, con una sola instrucción SQL (como hace el login con sus
   * límites): así 50 peticiones a la vez no consiguen más de 5 intentos, y el quinto, si acierta, vale. Sin fila que reservar
   * (no existe, venció o ya se gastaron los 5) falla igual que un código equivocado.
   */
  async claim(userId: string, purpose: EmailCodePurpose, code: string): Promise<CodeClaim> {
    const now = this.now();
    const rows = await this.prisma.$queryRaw<{ code_hash: string }[]>`
      UPDATE email_codes SET attempts = attempts + 1
      WHERE user_id = ${userId}::uuid AND purpose = ${purpose}::email_code_purpose
        AND attempts < ${MAX_CODE_ATTEMPTS}::smallint AND expires_at > ${now}::timestamptz
      RETURNING code_hash`;
    const stored = rows[0]?.code_hash;
    if (stored === undefined || !sameHash(stored, this.hash(userId, purpose, code))) throw invalidCode();

    return {
      consume: async (tx) => {
        // Borra solo la fila con ese hash: si mientras tanto otra petición lo gastó o se pidió otro código, no hay nada
        // que borrar y falla. Es lo que hace que un código sirva una sola vez aunque dos peticiones acierten a la vez.
        const deleted = await tx.emailCode.deleteMany({ where: { userId, purpose, codeHash: stored } });
        if (deleted.count !== 1) throw invalidCode();
      },
    };
  }

  /**
   * Lo mismo, por el correo de la cuenta. Con un correo que no existe hace la misma consulta con un identificador inventado,
   * así que falla con el mismo error y casi con el mismo trabajo.
   */
  async claimByEmail(email: string, purpose: EmailCodePurpose, code: string): Promise<{ userId: string; claim: CodeClaim }> {
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    const userId = user?.id ?? randomUUID();
    return { userId, claim: await this.claim(userId, purpose, code) };
  }
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
cd server && npx vitest run --testTimeout=30000
cd .. && npm run typecheck
```

Expected: PASS (servidor: **704 pruebas**) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): almacén de códigos (hash con clave, intento reservado en una sola instrucción, uso único)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Cuentas pendientes, verificar el correo y el login con la verificación activa

**Files:**
- Modify: `server/src/auth/auth.service.ts`
- Test: `server/test/auth/auth.verification.test.ts`

**Interfaces:**
- Consumes: `EmailCodeStore` (Task 4), `Mailer` y `verificationMail` (Task 3), `PENDING_ACCOUNT_TTL_MS` (Task 3), la columna `users.email_verified_at` (Task 2).
- Produces (en `AuthService`): las dependencias nuevas `emailVerification?: boolean` (por defecto `false`: todo como antes), `email?: { codes: EmailCodeStore; mailer: Mailer }` y `log?: (message: string) => void` (por defecto `console.error`); `AuthUser` y las filas llevan `emailVerifiedAt`.
  - `registerPending({ email, username, password }): Promise<void>` — en una transacción: borra las cuentas pendientes de más de 24 h que choquen por correo o usuario; si el correo es de una cuenta verificada o heredada → `AppError(409, "EMAIL_TAKEN")`; si es de una pendiente la **reemplaza** (usuario, contraseña y fecha nuevos; un usuario ocupado por *otra* cuenta → `USERNAME_TAKEN`); si no existe, la crea sin verificar; emite el código (`verify_email`). Después envía **esperando** al proveedor: si falla, `AppError(502, "EMAIL_SEND_FAILED")`, la cuenta queda pendiente y el fallo se anota sin la dirección ni el código.
  - `verifyEmail({ email, code }): Promise<AuthResult>` — reserva el intento, compara, consume el código, fija `emailVerifiedAt` (sin cambiar la fecha de una cuenta que ya estaba verificada) y abre la sesión; cualquier fallo del código es `INVALID_CODE`.
  - Con `emailVerification` activo, `login` responde `AppError(403, "EMAIL_NOT_VERIFIED")` a una cuenta sin verificar **solo tras acertar la contraseña**, y `refresh` también (sin gastar el token).
  - Una cuenta es *pendiente* si está sin verificar y no tiene partidas ni sesiones; una sin verificar con historial es *heredada* y nunca se reemplaza ni se borra.

- [ ] **Step 1: Escribir las pruebas que fallan**

`server/test/auth/auth.verification.test.ts` (registro pendiente y sus choques, reemplazo y limpieza a las 24 h con reloj inyectado, cuentas heredadas intactas —con sesiones y con solo partidas—, proveedor caído, registros simultáneos, verificar y el uso único, y el login y el `refresh` con la verificación activa y apagada):

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PENDING_ACCOUNT_TTL_MS } from "../../src/auth/code-policy.js";
import { AuthService } from "../../src/auth/auth.service.js";
import { EmailCodeStore, createCodeHasher } from "../../src/auth/email-codes.js";
import { createPasswordHasher } from "../../src/auth/password.js";
import { createTokenService } from "../../src/auth/tokens.js";
import { AppError } from "../../src/http/errors.js";
import { MailerError } from "../../src/mail/mailer.js";
import { MemoryMailer } from "../../src/mail/memory-mailer.js";
import { prisma, resetDatabase, warmUpPool } from "../helpers/db.js";
import { seedGame } from "../helpers/games.js";

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const tokens = createTokenService({ secret: "s".repeat(40), accessTtlSeconds: 3600 });

let current = new Date("2026-01-01T00:00:00.000Z");
const mailer = new MemoryMailer();
const codes = new EmailCodeStore({ prisma, hash: createCodeHasher("s".repeat(40)), now: () => current });
const logged: string[] = [];

function newService(emailVerification: boolean) {
  return new AuthService({
    prisma,
    hasher: createPasswordHasher(4),
    tokens,
    refreshTtlMs: REFRESH_TTL_MS,
    now: () => current,
    emailVerification,
    email: { codes, mailer },
    log: (line) => logged.push(line),
  });
}
const service = newService(true);

const ash = { email: "ash@example.com", username: "Ash", password: "pikachu-123" };

beforeEach(async () => {
  current = new Date("2026-01-01T00:00:00.000Z");
  mailer.clear();
  mailer.failWith = null;
  logged.length = 0;
  await resetDatabase();
});
afterAll(() => prisma.$disconnect());

async function expectAppError(promise: Promise<unknown>, code: string, status: number) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  expect((error as AppError).status).toBe(status);
}

/** El código de seis dígitos del último correo enviado a una dirección. */
function lastCode(email: string): string {
  const mail = mailer.to(email).at(-1);
  if (!mail) throw new Error(`No se envió ningún correo a ${email}`);
  return /(\d{6})/.exec(mail.text)![1]!;
}

const userOf = (email: string) => prisma.user.findUniqueOrThrow({ where: { email } });

describe("registerPending", () => {
  it("crea la cuenta sin verificar, envía un correo con el código y no abre ninguna sesión", async () => {
    await service.registerPending(ash);
    const user = await userOf(ash.email);
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.username).toBe("Ash");
    expect(mailer.to(ash.email)).toHaveLength(1);
    expect(lastCode(ash.email)).toMatch(/^\d{6}$/);
    expect(await prisma.refreshToken.count()).toBe(0);
    expect(await prisma.emailCode.count({ where: { userId: user.id, purpose: "verify_email" } })).toBe(1);
  });

  it("guarda la contraseña hasheada", async () => {
    await service.registerPending(ash);
    const user = await userOf(ash.email);
    expect(user.passwordHash).not.toContain(ash.password);
    expect(await createPasswordHasher(4).verify(ash.password, user.passwordHash)).toBe(true);
  });

  it("un correo que ya es de una cuenta verificada da EMAIL_TAKEN y no envía nada", async () => {
    await service.registerPending(ash);
    await service.verifyEmail({ email: ash.email, code: lastCode(ash.email) });
    mailer.clear();
    await expectAppError(service.registerPending({ ...ash, username: "Otro" }), "EMAIL_TAKEN", 409);
    expect(mailer.sent).toHaveLength(0);
  });

  it("un usuario ocupado por otra cuenta da USERNAME_TAKEN, sin distinguir mayúsculas", async () => {
    await service.registerPending(ash);
    await expectAppError(service.registerPending({ email: "otro@example.com", username: "ASH", password: "pikachu-123" }), "USERNAME_TAKEN", 409);
    expect(await prisma.user.count()).toBe(1);
    expect(mailer.sent).toHaveLength(1);
  });

  it("registrarse otra vez con el correo de una cuenta pendiente la reemplaza: usuario, contraseña y fecha nuevos, y un código nuevo", async () => {
    await service.registerPending(ash);
    const firstCode = lastCode(ash.email);
    current = new Date(current.getTime() + 60_000);

    await service.registerPending({ email: ash.email, username: "Ash2", password: "otra-clave-9" });

    expect(await prisma.user.count()).toBe(1);
    const user = await userOf(ash.email);
    expect(user.username).toBe("Ash2");
    expect(await createPasswordHasher(4).verify("otra-clave-9", user.passwordHash)).toBe(true);
    expect(user.createdAt).toEqual(current);
    expect(mailer.to(ash.email)).toHaveLength(2);
    const secondCode = lastCode(ash.email);
    if (secondCode !== firstCode) await expectAppError(service.verifyEmail({ email: ash.email, code: firstCode }), "INVALID_CODE", 400);
    await expect(service.verifyEmail({ email: ash.email, code: secondCode })).resolves.toBeDefined();
  });

  it("reemplazar la cuenta pendiente puede quedarse con su mismo usuario", async () => {
    await service.registerPending(ash);
    await expect(service.registerPending({ ...ash, password: "otra-clave-9" })).resolves.toBeUndefined();
    expect(await prisma.user.count()).toBe(1);
  });

  it("un usuario ocupado por otra cuenta pendiente de menos de 24 h sigue ocupado", async () => {
    await service.registerPending(ash);
    current = new Date(current.getTime() + PENDING_ACCOUNT_TTL_MS - 1);
    await expectAppError(service.registerPending({ email: "otro@example.com", username: "ash", password: "pikachu-123" }), "USERNAME_TAKEN", 409);
  });

  it("una cuenta pendiente de más de 24 h se considera libre: se borra al registrarse con su usuario o su correo", async () => {
    await service.registerPending(ash);
    current = new Date(current.getTime() + PENDING_ACCOUNT_TTL_MS + 1);

    await service.registerPending({ email: "otro@example.com", username: "ash", password: "pikachu-123" });
    expect(await prisma.user.count()).toBe(1);
    expect((await userOf("otro@example.com")).username).toBe("ash");
    expect(await prisma.user.findUnique({ where: { email: ash.email } })).toBeNull();
    expect(await prisma.emailCode.count()).toBe(1);
  });

  it("una cuenta sin verificar que tiene historial (sesiones o partidas) nunca se reemplaza ni se borra", async () => {
    const legacy = newService(false);
    await legacy.register(ash);
    // Nace con la hora real de la base de datos: se le pone la del reloj de la prueba para que pasen días de verdad.
    await prisma.user.updateMany({ data: { createdAt: current } });
    current = new Date(current.getTime() + 10 * PENDING_ACCOUNT_TTL_MS);

    await expectAppError(service.registerPending({ email: ash.email, username: "Nuevo", password: "pikachu-123" }), "EMAIL_TAKEN", 409);
    await expectAppError(service.registerPending({ email: "otro@example.com", username: "ASH", password: "pikachu-123" }), "USERNAME_TAKEN", 409);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.refreshToken.count()).toBe(1);
  });

  it("una cuenta sin verificar con partidas pero sin sesiones tampoco se reemplaza ni se borra", async () => {
    const legacy = newService(false);
    const first = await legacy.register(ash);
    const second = await legacy.register({ email: "misty@example.com", username: "Misty", password: "pikachu-123" });
    await seedGame({
      code: "ABC234",
      endedAt: new Date(current),
      players: [
        { userId: first.user.id, score: 100 },
        { userId: second.user.id, score: 50 },
      ],
      winner: 0,
    });
    // Solo queda el historial de partidas: las sesiones desaparecen (se cerraron y se limpiaron).
    await prisma.refreshToken.deleteMany();
    await prisma.user.updateMany({ data: { createdAt: current } });
    current = new Date(current.getTime() + 10 * PENDING_ACCOUNT_TTL_MS);

    await expectAppError(service.registerPending({ email: ash.email, username: "Nuevo", password: "pikachu-123" }), "EMAIL_TAKEN", 409);
    await expectAppError(service.registerPending({ email: "otro@example.com", username: "ASH", password: "pikachu-123" }), "USERNAME_TAKEN", 409);
    expect(await prisma.user.count()).toBe(2);
  });

  it("si el proveedor falla, da EMAIL_SEND_FAILED, deja la cuenta pendiente con su código y lo registra sin la dirección ni el código", async () => {
    mailer.failWith = new MailerError(503, "Resend respondió 503");
    await expectAppError(service.registerPending(ash), "EMAIL_SEND_FAILED", 502);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.emailCode.count()).toBe(1);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain("Resend respondió 503");
    expect(logged[0]).not.toContain(ash.email);
    expect(logged[0]).not.toMatch(/\d{6}/);

    // Se puede reintentar: es la misma cuenta pendiente.
    mailer.failWith = null;
    await service.registerPending(ash);
    expect(await prisma.user.count()).toBe(1);
    expect(mailer.to(ash.email)).toHaveLength(1);
  });

  it("dos registros a la vez con el mismo correo dejan una sola cuenta y ningún error que no sea de la aplicación", async () => {
    await warmUpPool();
    const results = await Promise.allSettled([service.registerPending(ash), service.registerPending({ ...ash, username: "Ash2" })]);
    expect(await prisma.user.count()).toBe(1);
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    for (const result of results) {
      if (result.status === "rejected") expect(result.reason).toBeInstanceOf(AppError);
    }
  });
});

describe("verifyEmail", () => {
  it("con el código correcto verifica la cuenta, gasta el código y abre la sesión", async () => {
    await service.registerPending(ash);
    const result = await service.verifyEmail({ email: ash.email, code: lastCode(ash.email) });

    expect(result.user).toMatchObject({ email: ash.email, username: "Ash" });
    expect(tokens.verifyAccessToken(result.accessToken).sub).toBe(result.user.id);
    expect(result.refreshExpiresAt).toEqual(new Date(current.getTime() + REFRESH_TTL_MS));
    expect((await userOf(ash.email)).emailVerifiedAt).toEqual(current);
    expect(await prisma.emailCode.count()).toBe(0);
    expect(await prisma.refreshToken.count()).toBe(1);
  });

  it("el código solo sirve una vez", async () => {
    await service.registerPending(ash);
    const code = lastCode(ash.email);
    await service.verifyEmail({ email: ash.email, code });
    await expectAppError(service.verifyEmail({ email: ash.email, code }), "INVALID_CODE", 400);
  });

  it("un código equivocado, vencido, o un correo que no existe dan el mismo INVALID_CODE", async () => {
    await service.registerPending(ash);
    const code = lastCode(ash.email);
    await expectAppError(service.verifyEmail({ email: ash.email, code: code === "000000" ? "000001" : "000000" }), "INVALID_CODE", 400);
    await expectAppError(service.verifyEmail({ email: "nadie@example.com", code }), "INVALID_CODE", 400);
    current = new Date(current.getTime() + 11 * 60_000);
    await expectAppError(service.verifyEmail({ email: ash.email, code }), "INVALID_CODE", 400);
    expect((await userOf(ash.email)).emailVerifiedAt).toBeNull();
  });

  it("no cambia la fecha de verificación de una cuenta que ya estaba verificada", async () => {
    await service.registerPending(ash);
    const code = lastCode(ash.email);
    const firstDate = new Date("2025-06-01T00:00:00.000Z");
    await prisma.user.update({ where: { email: ash.email }, data: { emailVerifiedAt: firstDate } });
    await service.verifyEmail({ email: ash.email, code });
    expect((await userOf(ash.email)).emailVerifiedAt).toEqual(firstDate);
  });
});

describe("login con la verificación activa", () => {
  it("una cuenta sin verificar con la contraseña correcta da EMAIL_NOT_VERIFIED (403) y no abre sesión", async () => {
    await service.registerPending(ash);
    await expectAppError(service.login({ email: ash.email, password: ash.password }), "EMAIL_NOT_VERIFIED", 403);
    expect(await prisma.refreshToken.count()).toBe(0);
  });

  it("con la contraseña equivocada da INVALID_CREDENTIALS: no delata que la cuenta existe sin verificar", async () => {
    await service.registerPending(ash);
    await expectAppError(service.login({ email: ash.email, password: "mala-clave-1" }), "INVALID_CREDENTIALS", 401);
  });

  it("una cuenta verificada entra", async () => {
    await service.registerPending(ash);
    await service.verifyEmail({ email: ash.email, code: lastCode(ash.email) });
    await expect(service.login({ email: ash.email, password: ash.password })).resolves.toBeDefined();
  });

  it("con la verificación apagada entra aunque la cuenta no esté verificada (todo como antes)", async () => {
    const off = newService(false);
    await off.register(ash);
    expect((await userOf(ash.email)).emailVerifiedAt).toBeNull();
    await expect(off.login({ email: ash.email, password: ash.password })).resolves.toBeDefined();
  });

  it("una cuenta de antes de activar la verificación, sin verificar, tiene que verificar al volver a entrar", async () => {
    const off = newService(false);
    await off.register(ash);
    await expectAppError(service.login({ email: ash.email, password: ash.password }), "EMAIL_NOT_VERIFIED", 403);
  });
});

describe("refresh con la verificación activa", () => {
  it("una sesión de una cuenta sin verificar no se renueva (EMAIL_NOT_VERIFIED) y su token sigue sin gastarse", async () => {
    const off = newService(false);
    const session = await off.register(ash);
    await expectAppError(service.refresh(session.refreshToken), "EMAIL_NOT_VERIFIED", 403);
    const stored = await prisma.refreshToken.findMany();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.revokedAt).toBeNull();
  });

  it("una cuenta verificada renueva como siempre", async () => {
    await service.registerPending(ash);
    const session = await service.verifyEmail({ email: ash.email, code: lastCode(ash.email) });
    await expect(service.refresh(session.refreshToken)).resolves.toBeDefined();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
cd server && npx vitest run test/auth/auth.verification.test.ts
```

Expected: FAIL — `registerPending` y `verifyEmail` no existen y `login` no mira la verificación.

- [ ] **Step 3: Implementar**

`server/src/auth/auth.service.ts`:

```diff
diff --git a/server/src/auth/auth.service.ts b/server/src/auth/auth.service.ts
index b564644..0382259 100644
--- a/server/src/auth/auth.service.ts
+++ b/server/src/auth/auth.service.ts
@@ -2,6 +2,10 @@ import { randomBytes } from "node:crypto";
 import type { ThemeMode, ThemeName, ThemePreferences } from "@pokemon-minigames/shared";
 import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
 import { AppError } from "../http/errors.js";
+import { type Mailer, MailerError } from "../mail/mailer.js";
+import { verificationMail } from "../mail/templates.js";
+import { PENDING_ACCOUNT_TTL_MS } from "./code-policy.js";
+import type { EmailCodeStore } from "./email-codes.js";
 import type { PasswordHasher } from "./password.js";
 import type { TokenService } from "./tokens.js";
 
@@ -22,6 +26,7 @@ interface UserRow {
   createdAt: Date;
   theme: ThemeName | null;
   themeMode: ThemeMode | null;
+  emailVerifiedAt: Date | null;
 }
 
 export interface AuthResult {
@@ -38,8 +43,17 @@ export interface AuthServiceDeps {
   refreshTtlMs: number;
   /** Reloj inyectable para poder probar la expiración. */
   now?: () => Date;
+  /** Con la verificación por correo activa, quien no verificó su correo no entra. Apagado (por defecto), todo es como antes. */
+  emailVerification?: boolean;
+  /** Los códigos y el envío de correos; sin esto el servicio no puede registrar con verificación ni recuperar contraseñas. */
+  email?: { codes: EmailCodeStore; mailer: Mailer };
+  /** Dónde se anotan los fallos de envío (por defecto, la consola de errores). */
+  log?: (message: string) => void;
 }
 
+const emailTakenError = () => new AppError(409, "EMAIL_TAKEN", "Ese email ya está registrado");
+const usernameTakenError = () => new AppError(409, "USERNAME_TAKEN", "Ese nombre de usuario ya está en uso");
+
 const INVALID_REFRESH = () =>
   new AppError(401, "INVALID_REFRESH_TOKEN", "Sesión inválida o expirada. Inicia sesión de nuevo.");
 
@@ -60,6 +74,9 @@ export class AuthService {
   private readonly tokens: TokenService;
   private readonly refreshTtlMs: number;
   private readonly now: () => Date;
+  private readonly emailVerification: boolean;
+  private readonly email: AuthServiceDeps["email"];
+  private readonly log: (message: string) => void;
   /** Hash de relleno: se verifica cuando el email no existe para que login tarde igual. */
   private readonly dummyHash: Promise<string>;
 
@@ -69,6 +86,9 @@ export class AuthService {
     this.tokens = deps.tokens;
     this.refreshTtlMs = deps.refreshTtlMs;
     this.now = deps.now ?? (() => new Date());
+    this.emailVerification = deps.emailVerification ?? false;
+    this.email = deps.email;
+    this.log = deps.log ?? ((message) => console.error(message));
     this.dummyHash = deps.hasher.hash(randomBytes(16).toString("hex"));
   }
 
@@ -102,6 +122,8 @@ export class AuthService {
     if (!ok) {
       throw new AppError(401, "INVALID_CREDENTIALS", "Email o contraseña incorrectos");
     }
+    // Solo tras acertar la contraseña: así no se delata a quien no la sabe que la cuenta existe sin verificar.
+    this.assertVerified(user);
     return this.issueSession(this.prisma, user);
   }
 
@@ -115,6 +137,7 @@ export class AuthService {
       if (!record || record.revokedAt !== null || record.expiresAt <= now) {
         throw INVALID_REFRESH();
       }
+      this.assertVerified(record.user);
       // La condición revokedAt = null hace que solo una petición concurrente gane.
       const revoked = await tx.refreshToken.updateMany({
         where: { id: record.id, revokedAt: null },
@@ -160,10 +183,118 @@ export class AuthService {
     return { theme: preferences.theme, themeMode: preferences.themeMode };
   }
 
+  /**
+   * Registro con la verificación por correo activa: crea la cuenta sin verificar (o reemplaza la pendiente del mismo correo),
+   * genera un código y lo envía. No abre ninguna sesión: la abre `verifyEmail`. Si el proveedor falla, la cuenta queda
+   * pendiente y quien se registra puede volver a intentarlo con los mismos datos.
+   */
+  async registerPending(input: { email: string; username: string; password: string }): Promise<void> {
+    const { codes, mailer } = this.requireEmail();
+    const passwordHash = await this.hasher.hash(input.password);
+    const now = this.now();
+
+    let code: string;
+    try {
+      code = await this.prisma.$transaction(async (tx) => {
+        await this.purgeStalePending(tx, input, now);
+        const existing = await tx.user.findUnique({ where: { email: input.email }, select: { id: true, emailVerifiedAt: true } });
+        let userId: string;
+        if (existing) {
+          // Solo se reemplaza una cuenta pendiente: una verificada, o una sin verificar que ya tiene historial, no se toca.
+          if (!(await this.isPending(tx, existing))) throw emailTakenError();
+          await this.assertUsernameFree(tx, input.username, existing.id);
+          await tx.user.update({ where: { id: existing.id }, data: { username: input.username, passwordHash, createdAt: now } });
+          userId = existing.id;
+        } else {
+          await this.assertUsernameFree(tx, input.username, null);
+          // La fecha va explícita (la del reloj del servicio, no la de la base de datos) porque de ella depende cuándo caduca.
+          const created = await tx.user.create({
+            data: { email: input.email, username: input.username, passwordHash, createdAt: now },
+            select: { id: true },
+          });
+          userId = created.id;
+        }
+        return codes.issue(tx, userId, "verify_email");
+      });
+    } catch (error) {
+      // Dos registros simultáneos pueden pasar las comprobaciones; la base de datos decide.
+      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
+        await this.assertAvailable(input.email, input.username);
+      }
+      throw error;
+    }
+
+    try {
+      await mailer.send(verificationMail(input.email, code));
+    } catch (error) {
+      this.logMailFailure(error);
+      throw new AppError(502, "EMAIL_SEND_FAILED", "No pudimos enviar el correo. Inténtalo de nuevo en un momento.");
+    }
+  }
+
+  /** Verifica el correo con el código que llegó y abre la sesión. Cualquier fallo del código es INVALID_CODE. */
+  async verifyEmail(input: { email: string; code: string }): Promise<AuthResult> {
+    const { codes } = this.requireEmail();
+    const { userId, claim } = await codes.claimByEmail(input.email, "verify_email", input.code);
+    const now = this.now();
+    const user = await this.prisma.$transaction(async (tx) => {
+      await claim.consume(tx);
+      const row = await tx.user.findUniqueOrThrow({ where: { id: userId } });
+      // La primera verificación manda: no se cambia la fecha de una cuenta que ya estaba verificada.
+      return row.emailVerifiedAt === null ? tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: now } }) : row;
+    });
+    return this.issueSession(this.prisma, user);
+  }
+
+  private requireEmail(): { codes: EmailCodeStore; mailer: Mailer } {
+    if (!this.email) throw new Error("El servicio de cuentas no tiene configurado el correo");
+    return this.email;
+  }
+
+  /** Con la verificación activa, una cuenta sin verificar no entra ni renueva su sesión. */
+  private assertVerified(user: { emailVerifiedAt: Date | null }): void {
+    if (this.emailVerification && user.emailVerifiedAt === null) {
+      throw new AppError(403, "EMAIL_NOT_VERIFIED", "Verifica tu correo para entrar");
+    }
+  }
+
+  /** Pendiente: sin verificar y sin historial (ni sesiones ni partidas), así que nadie pierde nada si se reemplaza o se borra. */
+  private async isPending(db: Prisma.TransactionClient, user: { id: string; emailVerifiedAt: Date | null }): Promise<boolean> {
+    if (user.emailVerifiedAt !== null) return false;
+    const games = await db.gamePlayer.count({ where: { userId: user.id } });
+    if (games > 0) return false;
+    return (await db.refreshToken.count({ where: { userId: user.id } })) === 0;
+  }
+
+  /** Borra las cuentas pendientes de más de 24 h que chocan por correo o usuario con un registro nuevo (sin temporizadores). */
+  private async purgeStalePending(tx: Prisma.TransactionClient, input: { email: string; username: string }, now: Date): Promise<void> {
+    const cutoff = new Date(now.getTime() - PENDING_ACCOUNT_TTL_MS);
+    await tx.$executeRaw`
+      DELETE FROM users u
+      WHERE u.email_verified_at IS NULL AND u.created_at < ${cutoff}::timestamptz
+        AND (u.email = ${input.email} OR lower(u.username) = lower(${input.username}))
+        AND NOT EXISTS (SELECT 1 FROM game_players g WHERE g.user_id = u.id)
+        AND NOT EXISTS (SELECT 1 FROM refresh_tokens r WHERE r.user_id = u.id)`;
+  }
+
+  /** El usuario no lo tiene otra cuenta (sin distinguir mayúsculas); `exceptUserId` es la cuenta que se está reemplazando. */
+  private async assertUsernameFree(db: Prisma.TransactionClient, username: string, exceptUserId: string | null): Promise<void> {
+    const taken = await db.$queryRaw<{ id: string }[]>`
+      SELECT id FROM users
+      WHERE lower(username) = lower(${username}) AND (${exceptUserId}::uuid IS NULL OR id <> ${exceptUserId}::uuid) LIMIT 1`;
+    if (taken.length > 0) throw usernameTakenError();
+  }
+
+  /** Anota un fallo de envío sin la dirección ni el código: solo lo que dice el proveedor. */
+  private logMailFailure(error: unknown): void {
+    const reason = error instanceof MailerError ? error.message : error instanceof Error ? error.name : "error desconocido";
+    this.log(`[correo] No se pudo enviar un código: ${reason}`);
+  }
+
   private async assertAvailable(email: string, username: string): Promise<void> {
-    const emailTaken = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
-    if (emailTaken) {
-      throw new AppError(409, "EMAIL_TAKEN", "Ese email ya está registrado");
+    const existingEmail = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
+    if (existingEmail) {
+      throw emailTakenError();
     }
     // Misma comparación que el índice único lower(username). No se usa `mode: "insensitive"`
     // porque Prisma lo traduce a ILIKE y el guion bajo del username actuaría como comodín.
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
cd server && npx vitest run --testTimeout=30000
cd .. && npm run typecheck
```

Expected: PASS (servidor: **727 pruebas**) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): cuentas pendientes, verificar el correo y login/refresh con la verificación activa" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Reenviar el código, «olvidé mi contraseña» y restablecer

**Files:**
- Modify: `server/src/auth/auth.service.ts`
- Test: `server/test/auth/auth.recovery.test.ts`

**Interfaces:**
- Consumes: lo de la Task 5, `passwordResetMail` (Task 3) y `EmailCodeStore.claimByEmail` (Task 4).
- Produces (en `AuthService`):
  - `resendVerification(email): Promise<void>` — a una cuenta que existe y no está verificada le emite y envía un código nuevo (el anterior deja de valer); con cualquier otro correo no hace nada. Nadie espera su respuesta: un fallo del proveedor solo se anota.
  - `requestPasswordReset(email): Promise<void>` — a una cuenta que existe (también si está sin verificar) le emite y envía un código `reset_password`; con otro correo no hace nada ni da error.
  - `resetPassword({ email, code, password }): Promise<void>` — comprueba el código, y en una transacción lo consume, guarda el hash de la contraseña nueva, **revoca todos los tokens de renovación** de la cuenta, da el correo por verificado (sin tocar la fecha de una cuenta ya verificada) y borra un código de verificar que siguiera pendiente. No abre sesión. Cualquier fallo del código es `INVALID_CODE`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`server/test/auth/auth.recovery.test.ts` (qué se envía y a quién, que un correo desconocido no delata nada, un código nuevo anula el anterior, el proveedor caído, y restablecer: la contraseña nueva entra y la vieja no, las sesiones se cierran, no se abre ninguna, un código de un propósito no sirve en el otro y dos cambios simultáneos con el mismo código aplican solo uno):

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AuthService } from "../../src/auth/auth.service.js";
import { EmailCodeStore, createCodeHasher } from "../../src/auth/email-codes.js";
import { createPasswordHasher } from "../../src/auth/password.js";
import { createTokenService } from "../../src/auth/tokens.js";
import { AppError } from "../../src/http/errors.js";
import { MailerError } from "../../src/mail/mailer.js";
import { MemoryMailer } from "../../src/mail/memory-mailer.js";
import { prisma, resetDatabase, warmUpPool } from "../helpers/db.js";

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const tokens = createTokenService({ secret: "s".repeat(40), accessTtlSeconds: 3600 });

let current = new Date("2026-01-01T00:00:00.000Z");
const mailer = new MemoryMailer();
const codes = new EmailCodeStore({ prisma, hash: createCodeHasher("s".repeat(40)), now: () => current });
const logged: string[] = [];

function newService(emailVerification: boolean) {
  return new AuthService({
    prisma,
    hasher: createPasswordHasher(4),
    tokens,
    refreshTtlMs: REFRESH_TTL_MS,
    now: () => current,
    emailVerification,
    email: { codes, mailer },
    log: (line) => logged.push(line),
  });
}
const service = newService(true);

const ash = { email: "ash@example.com", username: "Ash", password: "pikachu-123" };

beforeEach(async () => {
  current = new Date("2026-01-01T00:00:00.000Z");
  mailer.clear();
  mailer.failWith = null;
  logged.length = 0;
  await resetDatabase();
});
afterAll(() => prisma.$disconnect());

async function expectAppError(promise: Promise<unknown>, code: string, status: number) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  expect((error as AppError).status).toBe(status);
}

function lastCode(email: string): string {
  const mail = mailer.to(email).at(-1);
  if (!mail) throw new Error(`No se envió ningún correo a ${email}`);
  return /(\d{6})/.exec(mail.text)![1]!;
}

const wrong = (code: string): string => (code === "000000" ? "000001" : "000000");

/** Una cuenta verificada con una sesión abierta (se crea con el servicio sin verificación y se verifica a mano). */
async function verifiedAccount() {
  const session = await newService(false).register(ash);
  await prisma.user.update({ where: { email: ash.email }, data: { emailVerifiedAt: current } });
  return session;
}

describe("requestPasswordReset", () => {
  it("a una cuenta que existe le envía un correo con el código para cambiar la contraseña", async () => {
    await verifiedAccount();
    await service.requestPasswordReset(ash.email);
    expect(mailer.to(ash.email)).toHaveLength(1);
    expect(mailer.to(ash.email)[0]!.subject).toBe("Código para cambiar tu contraseña de Pokémon Minigames");
    expect(lastCode(ash.email)).toMatch(/^\d{6}$/);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: ash.email } });
    expect(await prisma.emailCode.count({ where: { userId: user.id, purpose: "reset_password" } })).toBe(1);
  });

  it("a un correo que no existe no le envía nada ni da ningún error", async () => {
    await expect(service.requestPasswordReset("nadie@example.com")).resolves.toBeUndefined();
    expect(mailer.sent).toHaveLength(0);
    expect(await prisma.emailCode.count()).toBe(0);
  });

  it("también sirve para una cuenta que aún no verificó su correo", async () => {
    await service.registerPending(ash);
    mailer.clear();
    await service.requestPasswordReset(ash.email);
    expect(mailer.to(ash.email)).toHaveLength(1);
    expect(mailer.to(ash.email)[0]!.subject).toContain("contraseña");
  });

  it("pedir otro código anula el anterior", async () => {
    await verifiedAccount();
    await service.requestPasswordReset(ash.email);
    const first = lastCode(ash.email);
    await service.requestPasswordReset(ash.email);
    const second = lastCode(ash.email);
    if (first !== second) {
      await expectAppError(service.resetPassword({ email: ash.email, code: first, password: "nueva-clave-1" }), "INVALID_CODE", 400);
    }
    await expect(service.resetPassword({ email: ash.email, code: second, password: "nueva-clave-1" })).resolves.toBeUndefined();
  });

  it("si el proveedor falla no da error (nadie espera la respuesta) y lo anota sin la dirección ni el código", async () => {
    await verifiedAccount();
    mailer.failWith = new MailerError(429, "Resend respondió 429 (rate_limit_exceeded)");
    await expect(service.requestPasswordReset(ash.email)).resolves.toBeUndefined();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain("429");
    expect(logged[0]).not.toContain(ash.email);
    expect(logged[0]).not.toMatch(/\d{6}/);
  });
});

describe("resendVerification", () => {
  it("a una cuenta sin verificar le envía un código nuevo y el anterior deja de valer", async () => {
    await service.registerPending(ash);
    const first = lastCode(ash.email);
    await service.resendVerification(ash.email);
    expect(mailer.to(ash.email)).toHaveLength(2);
    const second = lastCode(ash.email);
    if (first !== second) await expectAppError(service.verifyEmail({ email: ash.email, code: first }), "INVALID_CODE", 400);
    await expect(service.verifyEmail({ email: ash.email, code: second })).resolves.toBeDefined();
  });

  it("a una cuenta ya verificada, o a un correo que no existe, no les envía nada", async () => {
    await verifiedAccount();
    await service.resendVerification(ash.email);
    await service.resendVerification("nadie@example.com");
    expect(mailer.sent).toHaveLength(0);
  });

  it("si el proveedor falla no da error y lo anota", async () => {
    await service.registerPending(ash);
    mailer.failWith = new MailerError(503, "Resend respondió 503");
    await expect(service.resendVerification(ash.email)).resolves.toBeUndefined();
    expect(logged).toHaveLength(1);
  });
});

describe("resetPassword", () => {
  it("con el código correcto cambia la contraseña: la nueva entra y la vieja ya no", async () => {
    await verifiedAccount();
    await service.requestPasswordReset(ash.email);
    await service.resetPassword({ email: ash.email, code: lastCode(ash.email), password: "nueva-clave-1" });

    await expect(service.login({ email: ash.email, password: "nueva-clave-1" })).resolves.toBeDefined();
    await expectAppError(service.login({ email: ash.email, password: ash.password }), "INVALID_CREDENTIALS", 401);
  });

  it("revoca todas las sesiones abiertas de la cuenta", async () => {
    const session = await verifiedAccount();
    await service.login({ email: ash.email, password: ash.password });
    expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(2);

    await service.requestPasswordReset(ash.email);
    await service.resetPassword({ email: ash.email, code: lastCode(ash.email), password: "nueva-clave-1" });

    expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
    await expectAppError(service.refresh(session.refreshToken), "INVALID_REFRESH_TOKEN", 401);
  });

  it("no abre ninguna sesión", async () => {
    await verifiedAccount();
    const before = await prisma.refreshToken.count();
    await service.requestPasswordReset(ash.email);
    await service.resetPassword({ email: ash.email, code: lastCode(ash.email), password: "nueva-clave-1" });
    expect(await prisma.refreshToken.count()).toBe(before);
  });

  it("verifica el correo de una cuenta pendiente (recibir el código ya lo demuestra) y no toca la fecha de una ya verificada", async () => {
    await service.registerPending(ash);
    await service.requestPasswordReset(ash.email);
    await service.resetPassword({ email: ash.email, code: lastCode(ash.email), password: "nueva-clave-1" });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: ash.email } });
    expect(user.emailVerifiedAt).toEqual(current);
    // El código de verificar que seguía pendiente ya no hace falta.
    expect(await prisma.emailCode.count({ where: { userId: user.id } })).toBe(0);

    const firstDate = user.emailVerifiedAt!;
    current = new Date(current.getTime() + 3_600_000);
    await service.requestPasswordReset(ash.email);
    await service.resetPassword({ email: ash.email, code: lastCode(ash.email), password: "otra-clave-22" });
    expect((await prisma.user.findUniqueOrThrow({ where: { email: ash.email } })).emailVerifiedAt).toEqual(firstDate);
  });

  it("un código equivocado, vencido o de un correo que no existe da INVALID_CODE y no cambia nada", async () => {
    await verifiedAccount();
    await service.requestPasswordReset(ash.email);
    const code = lastCode(ash.email);

    await expectAppError(service.resetPassword({ email: ash.email, code: wrong(code), password: "nueva-clave-1" }), "INVALID_CODE", 400);
    await expectAppError(service.resetPassword({ email: "nadie@example.com", code, password: "nueva-clave-1" }), "INVALID_CODE", 400);
    current = new Date(current.getTime() + 11 * 60_000);
    await expectAppError(service.resetPassword({ email: ash.email, code, password: "nueva-clave-1" }), "INVALID_CODE", 400);

    await expect(service.login({ email: ash.email, password: ash.password })).resolves.toBeDefined();
    expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBeGreaterThan(0);
  });

  it("el código solo sirve una vez", async () => {
    await verifiedAccount();
    await service.requestPasswordReset(ash.email);
    const code = lastCode(ash.email);
    await service.resetPassword({ email: ash.email, code, password: "nueva-clave-1" });
    await expectAppError(service.resetPassword({ email: ash.email, code, password: "otra-clave-22" }), "INVALID_CODE", 400);
    await expect(service.login({ email: ash.email, password: "nueva-clave-1" })).resolves.toBeDefined();
  });

  it("el código de verificar el correo no sirve para cambiar la contraseña, ni al revés", async () => {
    await service.registerPending(ash);
    const verifyCode = lastCode(ash.email);
    await expectAppError(service.resetPassword({ email: ash.email, code: verifyCode, password: "nueva-clave-1" }), "INVALID_CODE", 400);

    await service.requestPasswordReset(ash.email);
    const resetCode = lastCode(ash.email);
    await expectAppError(service.verifyEmail({ email: ash.email, code: resetCode === verifyCode ? wrong(resetCode) : resetCode }), "INVALID_CODE", 400);
  });

  it("dos cambios a la vez con el mismo código: solo uno se aplica", async () => {
    await warmUpPool();
    await verifiedAccount();
    await service.requestPasswordReset(ash.email);
    const code = lastCode(ash.email);
    const results = await Promise.allSettled([
      service.resetPassword({ email: ash.email, code, password: "clave-uno-11" }),
      service.resetPassword({ email: ash.email, code, password: "clave-dos-22" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect((rejected.reason as AppError).code).toBe("INVALID_CODE");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
cd server && npx vitest run test/auth/auth.recovery.test.ts
```

Expected: FAIL — `resendVerification`, `requestPasswordReset` y `resetPassword` no existen.

- [ ] **Step 3: Implementar**

`server/src/auth/auth.service.ts` (se añaden los tres métodos y el ayudante que envía sin esperar respuesta):

```diff
diff --git a/server/src/auth/auth.service.ts b/server/src/auth/auth.service.ts
index 0382259..a067fc3 100644
--- a/server/src/auth/auth.service.ts
+++ b/server/src/auth/auth.service.ts
@@ -3,7 +3,7 @@ import type { ThemeMode, ThemeName, ThemePreferences } from "@pokemon-minigames/
 import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
 import { AppError } from "../http/errors.js";
 import { type Mailer, MailerError } from "../mail/mailer.js";
-import { verificationMail } from "../mail/templates.js";
+import { passwordResetMail, verificationMail } from "../mail/templates.js";
 import { PENDING_ACCOUNT_TTL_MS } from "./code-policy.js";
 import type { EmailCodeStore } from "./email-codes.js";
 import type { PasswordHasher } from "./password.js";
@@ -246,6 +246,59 @@ export class AuthService {
     return this.issueSession(this.prisma, user);
   }
 
+  /**
+   * Reenvía el código de verificación a una cuenta que existe y no está verificada; con cualquier otro correo no hace nada.
+   * Nadie espera su respuesta (la ruta contesta antes de llamarlo), así que un fallo del proveedor solo se anota.
+   */
+  async resendVerification(email: string): Promise<void> {
+    const { codes, mailer } = this.requireEmail();
+    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, emailVerifiedAt: true } });
+    if (!user || user.emailVerifiedAt !== null) return;
+    const code = await codes.issue(this.prisma, user.id, "verify_email");
+    await this.sendQuietly(mailer, verificationMail(email, code));
+  }
+
+  /** Envía el código para cambiar la contraseña a una cuenta que existe (también a una sin verificar); con otro correo no hace nada. */
+  async requestPasswordReset(email: string): Promise<void> {
+    const { codes, mailer } = this.requireEmail();
+    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
+    if (!user) return;
+    const code = await codes.issue(this.prisma, user.id, "reset_password");
+    await this.sendQuietly(mailer, passwordResetMail(email, code));
+  }
+
+  /**
+   * Cambia la contraseña con el código que llegó. Revoca todas las sesiones abiertas de la cuenta y no abre ninguna. Recibir
+   * el código ya demuestra el correo, así que también lo da por verificado. Cualquier fallo del código es INVALID_CODE.
+   */
+  async resetPassword(input: { email: string; code: string; password: string }): Promise<void> {
+    const { codes } = this.requireEmail();
+    const { userId, claim } = await codes.claimByEmail(input.email, "reset_password", input.code);
+    // El hash (que tarda) va después de comprobar el código: con uno inválido no se gasta ese trabajo.
+    const passwordHash = await this.hasher.hash(input.password);
+    const now = this.now();
+    await this.prisma.$transaction(async (tx) => {
+      await claim.consume(tx);
+      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { emailVerifiedAt: true } });
+      await tx.user.update({
+        where: { id: userId },
+        data: { passwordHash, ...(user.emailVerifiedAt === null ? { emailVerifiedAt: now } : {}) },
+      });
+      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
+      // Un código de verificar que siguiera pendiente ya no hace falta.
+      await tx.emailCode.deleteMany({ where: { userId, purpose: "verify_email" } });
+    });
+  }
+
+  /** Envía un correo del que nadie espera respuesta: si falla, solo se anota. */
+  private async sendQuietly(mailer: Mailer, mail: Parameters<Mailer["send"]>[0]): Promise<void> {
+    try {
+      await mailer.send(mail);
+    } catch (error) {
+      this.logMailFailure(error);
+    }
+  }
+
   private requireEmail(): { codes: EmailCodeStore; mailer: Mailer } {
     if (!this.email) throw new Error("El servicio de cuentas no tiene configurado el correo");
     return this.email;
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
cd server && npx vitest run --testTimeout=30000
cd .. && npm run typecheck
```

Expected: PASS (servidor: **743 pruebas**) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): reenviar el código, «olvidé mi contraseña» y restablecer (cierra las sesiones y no abre ninguna)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Los límites de los códigos

**Files:**
- Modify: `server/src/http/limits.ts`
- Create: `server/src/auth/code-limits.ts`
- Test: `server/test/http/code-limits.test.ts`

**Interfaces:**
- Consumes: `createKeyedLimiter` y `KeyedLimiter`/`LimitCheck` de `server/src/http/rate-limit.ts` (etapa 5).
- Produces: en `RateLimitConfig` y `DEFAULT_RATE_LIMITS`, `codeCooldown` (1 por 60 s), `codeSendsByEmail` (5 por hora), `codeSendsByIp` (10 por hora), `codeFailuresByEmail` (5 por 10 min) y `codeFailuresByIp` (20 por hora). `code-limits.ts`: `interface CodeLimiters { cooldown; sendsByEmail; sendsByIp; failuresByEmail; failuresByIp }` (cinco `KeyedLimiter`) y `interface CodeLimits` con
  - `reserveSend(ip, email): number | null` / `releaseSend(ip, email)` — un envío (registro, login sin verificar, reenviar, olvidé);
  - `reserveFailure(ip, email): number | null` / `forgiveFailure(ip, email)` / `releaseFailure(ip, email)` — una comprobación de código: se cuenta como fallo hasta demostrar lo contrario, acertar reinicia la cuenta del correo y devuelve el hueco de la IP, y un fallo nuestro se devuelve sin contar;
  - `reserve*` devuelve `null` si cabe o los segundos de espera (la mayor si aplican varios límites), y **no cuenta lo que no cabe**; las claves son el correo y la IP, nunca si existe la cuenta; `createCodeLimits(limiters?)` sin limitadores no reserva ni rechaza nada (desarrollo y pruebas).

- [ ] **Step 1: Escribir las pruebas que fallan**

`server/test/http/code-limits.test.ts` (los valores de la spec, la espera por correo, el tope por hora, el tope por IP con correos distintos, lo que no cabe no se cuenta, la más larga de las esperas, devolver un hueco, acertar reinicia, y un correo inexistente cuenta igual):

```ts
import { describe, expect, it } from "vitest";
import { type CodeLimiters, createCodeLimits } from "../../src/auth/code-limits.js";
import { DEFAULT_RATE_LIMITS } from "../../src/http/limits.js";
import { createKeyedLimiter } from "../../src/http/rate-limit.js";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

describe("los límites de los códigos por correo son los de la spec", () => {
  it("un envío por correo cada 60 s, 5 por hora, 10 por hora por IP; 5 fallos cada 10 min por correo y 20 por hora por IP", () => {
    expect(DEFAULT_RATE_LIMITS.codeCooldown).toEqual({ limit: 1, windowMs: MINUTE });
    expect(DEFAULT_RATE_LIMITS.codeSendsByEmail).toEqual({ limit: 5, windowMs: HOUR });
    expect(DEFAULT_RATE_LIMITS.codeSendsByIp).toEqual({ limit: 10, windowMs: HOUR });
    expect(DEFAULT_RATE_LIMITS.codeFailuresByEmail).toEqual({ limit: 5, windowMs: 10 * MINUTE });
    expect(DEFAULT_RATE_LIMITS.codeFailuresByIp).toEqual({ limit: 20, windowMs: HOUR });
  });
});

/** Los límites con las cifras de producción y un reloj que se mueve a mano. */
function setup() {
  let now = 0;
  const make = (config: { limit: number; windowMs: number }) => createKeyedLimiter({ ...config, now: () => now });
  const limiters: CodeLimiters = {
    cooldown: make(DEFAULT_RATE_LIMITS.codeCooldown),
    sendsByEmail: make(DEFAULT_RATE_LIMITS.codeSendsByEmail),
    sendsByIp: make(DEFAULT_RATE_LIMITS.codeSendsByIp),
    failuresByEmail: make(DEFAULT_RATE_LIMITS.codeFailuresByEmail),
    failuresByIp: make(DEFAULT_RATE_LIMITS.codeFailuresByIp),
  };
  return { limits: createCodeLimits(limiters), advance: (ms: number) => (now += ms), limiters };
}

describe("envíos de código", () => {
  it("el primero cabe y el segundo al mismo correo tiene que esperar 60 s", () => {
    const { limits, advance } = setup();
    expect(limits.reserveSend("1.1.1.1", "ash@example.com")).toBeNull();
    expect(limits.reserveSend("1.1.1.1", "ash@example.com")).toBe(60);
    advance(30 * SECOND);
    expect(limits.reserveSend("1.1.1.1", "ash@example.com")).toBe(30);
    advance(30 * SECOND);
    expect(limits.reserveSend("1.1.1.1", "ash@example.com")).toBeNull();
  });

  it("la espera es por correo: otro correo desde la misma IP cabe enseguida", () => {
    const { limits } = setup();
    expect(limits.reserveSend("1.1.1.1", "ash@example.com")).toBeNull();
    expect(limits.reserveSend("1.1.1.1", "misty@example.com")).toBeNull();
  });

  it("5 envíos por hora al mismo correo: el sexto espera a que salga el primero de la ventana", () => {
    const { limits, advance } = setup();
    for (let i = 0; i < 5; i++) {
      expect(limits.reserveSend("1.1.1.1", "ash@example.com")).toBeNull();
      advance(MINUTE);
    }
    const wait = limits.reserveSend("1.1.1.1", "ash@example.com");
    expect(wait).toBe(55 * 60);
    advance(55 * MINUTE);
    expect(limits.reserveSend("1.1.1.1", "ash@example.com")).toBeNull();
  });

  it("10 envíos por hora desde una IP, aunque sean a correos distintos", () => {
    const { limits } = setup();
    for (let i = 0; i < 10; i++) expect(limits.reserveSend("1.1.1.1", `persona${i}@example.com`)).toBeNull();
    expect(limits.reserveSend("1.1.1.1", "otra@example.com")).toBe(3600);
    expect(limits.reserveSend("2.2.2.2", "otra@example.com")).toBeNull();
  });

  it("si no cabe no se cuenta: pedir mientras se espera no alarga la espera", () => {
    const { limits, advance } = setup();
    limits.reserveSend("1.1.1.1", "ash@example.com");
    advance(10 * SECOND);
    for (let i = 0; i < 20; i++) limits.reserveSend("1.1.1.1", "ash@example.com");
    advance(50 * SECOND);
    expect(limits.reserveSend("1.1.1.1", "ash@example.com")).toBeNull();
  });

  it("si varias esperas aplican, da la más larga", () => {
    const { limits } = setup();
    for (let i = 0; i < 10; i++) limits.reserveSend("1.1.1.1", `persona${i}@example.com`);
    // El correo tiene 60 s de espera y la IP casi una hora: manda la de la IP.
    limits.reserveSend("2.2.2.2", "ash@example.com");
    expect(limits.reserveSend("1.1.1.1", "ash@example.com")).toBe(3600);
  });

  it("devolver el envío (porque falló por algo nuestro) deja el hueco como estaba en los tres límites", () => {
    const { limits } = setup();
    expect(limits.reserveSend("1.1.1.1", "ash@example.com")).toBeNull();
    limits.releaseSend("1.1.1.1", "ash@example.com");
    expect(limits.reserveSend("1.1.1.1", "ash@example.com")).toBeNull();
  });
});

describe("fallos de código", () => {
  it("5 fallos por correo caben y el sexto intento se rechaza antes de comprobar nada", () => {
    const { limits } = setup();
    for (let i = 0; i < 5; i++) expect(limits.reserveFailure("1.1.1.1", "ash@example.com")).toBeNull();
    expect(limits.reserveFailure("1.1.1.1", "ash@example.com")).toBe(600);
  });

  it("pasados 10 minutos se puede volver a intentar", () => {
    const { limits, advance } = setup();
    for (let i = 0; i < 5; i++) limits.reserveFailure("1.1.1.1", "ash@example.com");
    advance(10 * MINUTE);
    expect(limits.reserveFailure("1.1.1.1", "ash@example.com")).toBeNull();
  });

  it("cuenta igual con un correo que no existe: no hay forma de distinguirlo por el límite", () => {
    const { limits } = setup();
    for (let i = 0; i < 5; i++) limits.reserveFailure("1.1.1.1", "nadie@example.com");
    expect(limits.reserveFailure("1.1.1.1", "nadie@example.com")).toBe(600);
  });

  it("20 fallos por hora desde una IP, aunque sean a correos distintos", () => {
    const { limits } = setup();
    for (let i = 0; i < 20; i++) expect(limits.reserveFailure("1.1.1.1", `persona${i}@example.com`)).toBeNull();
    expect(limits.reserveFailure("1.1.1.1", "otra@example.com")).toBe(3600);
    expect(limits.reserveFailure("2.2.2.2", "otra@example.com")).toBeNull();
  });

  it("acertar reinicia la cuenta del correo y devuelve el hueco de la IP", () => {
    const { limits } = setup();
    for (let i = 0; i < 4; i++) limits.reserveFailure("1.1.1.1", "ash@example.com");
    limits.reserveFailure("1.1.1.1", "ash@example.com"); // el intento que acierta también se reserva antes
    limits.forgiveFailure("1.1.1.1", "ash@example.com");
    for (let i = 0; i < 5; i++) expect(limits.reserveFailure("1.1.1.1", "ash@example.com")).toBeNull();
  });

  it("un fallo nuestro (no de quien escribe el código) se devuelve y no cuenta", () => {
    const { limits } = setup();
    for (let i = 0; i < 5; i++) {
      expect(limits.reserveFailure("1.1.1.1", "ash@example.com")).toBeNull();
      limits.releaseFailure("1.1.1.1", "ash@example.com");
    }
    expect(limits.reserveFailure("1.1.1.1", "ash@example.com")).toBeNull();
  });
});

describe("sin límites (desarrollo y pruebas)", () => {
  it("nada se reserva ni se rechaza", () => {
    const limits = createCodeLimits(undefined);
    for (let i = 0; i < 100; i++) {
      expect(limits.reserveSend("1.1.1.1", "ash@example.com")).toBeNull();
      expect(limits.reserveFailure("1.1.1.1", "ash@example.com")).toBeNull();
    }
    expect(() => limits.releaseSend("1.1.1.1", "ash@example.com")).not.toThrow();
    expect(() => limits.forgiveFailure("1.1.1.1", "ash@example.com")).not.toThrow();
    expect(() => limits.releaseFailure("1.1.1.1", "ash@example.com")).not.toThrow();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
cd server && npx vitest run test/http/code-limits.test.ts
```

Expected: FAIL — no existe `src/auth/code-limits` ni los límites nuevos.

- [ ] **Step 3: Implementar**

`server/src/http/limits.ts` (los cinco límites nuevos):

```diff
diff --git a/server/src/http/limits.ts b/server/src/http/limits.ts
index e75a588..d10a4d9 100644
--- a/server/src/http/limits.ts
+++ b/server/src/http/limits.ts
@@ -17,6 +17,16 @@ export interface RateLimitConfig {
   registerFailures: WindowLimit;
   /** Peticiones a toda la API por IP. */
   api: WindowLimit;
+  /** Espera entre dos envíos de código al mismo correo, exista o no una cuenta con ese correo. */
+  codeCooldown: WindowLimit;
+  /** Envíos de código por correo. */
+  codeSendsByEmail: WindowLimit;
+  /** Envíos de código por IP, a cualquier correo (contra usar el formulario para escribir a terceros y gastar la cuota del proveedor). */
+  codeSendsByIp: WindowLimit;
+  /** Códigos equivocados por correo, exista o no la cuenta: el límite no puede delatarlo. */
+  codeFailuresByEmail: WindowLimit;
+  /** Códigos equivocados por IP sumando todos los correos. */
+  codeFailuresByIp: WindowLimit;
   /** Reloj inyectable para las pruebas. */
   now?: () => number;
 }
@@ -27,6 +37,11 @@ export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
   register: { limit: 5, windowMs: HOUR },
   registerFailures: { limit: 20, windowMs: HOUR },
   api: { limit: 300, windowMs: MINUTE },
+  codeCooldown: { limit: 1, windowMs: MINUTE },
+  codeSendsByEmail: { limit: 5, windowMs: HOUR },
+  codeSendsByIp: { limit: 10, windowMs: HOUR },
+  codeFailuresByEmail: { limit: 5, windowMs: 10 * MINUTE },
+  codeFailuresByIp: { limit: 20, windowMs: HOUR },
 };
 
 /**
```

`server/src/auth/code-limits.ts`:

```ts
import type { KeyedLimiter, LimitCheck } from "../http/rate-limit.js";

/** Los cinco limitadores de los códigos por correo (se crean en app.ts a partir de la configuración de límites). */
export interface CodeLimiters {
  cooldown: KeyedLimiter;
  sendsByEmail: KeyedLimiter;
  sendsByIp: KeyedLimiter;
  failuresByEmail: KeyedLimiter;
  failuresByIp: KeyedLimiter;
}

/**
 * Cómo usan las rutas los límites: el hueco se **reserva antes de hacer el trabajo** y se devuelve si falla por algo nuestro,
 * como en el login. `reserve*` da `null` si cabe o los segundos de espera (la mayor si aplican varios límites).
 * Las claves son el correo y la IP, nunca si existe una cuenta: así el límite no delata qué correos están registrados.
 */
export interface CodeLimits {
  /** Un envío de código (registro, login sin verificar, reenviar, olvidé la contraseña). */
  reserveSend(ip: string, email: string): number | null;
  releaseSend(ip: string, email: string): void;
  /** Una comprobación de código (verificar o restablecer): se cuenta como fallo hasta que se demuestre lo contrario. */
  reserveFailure(ip: string, email: string): number | null;
  /** El código era correcto: se reinicia la cuenta del correo y se devuelve el hueco de la IP. */
  forgiveFailure(ip: string, email: string): void;
  /** La comprobación falló por algo nuestro y no cuenta como fallo de quien escribió el código. */
  releaseFailure(ip: string, email: string): void;
}

function longestWait(checks: LimitCheck[]): number | null {
  const waits = checks.flatMap((check) => (check.allowed ? [] : [check.retryAfterSeconds]));
  return waits.length > 0 ? Math.max(...waits) : null;
}

/** Sin limitadores (desarrollo y pruebas) nada se reserva ni se rechaza. */
export function createCodeLimits(limiters?: CodeLimiters): CodeLimits {
  if (!limiters) {
    return { reserveSend: () => null, releaseSend() {}, reserveFailure: () => null, forgiveFailure() {}, releaseFailure() {} };
  }
  const { cooldown, sendsByEmail, sendsByIp, failuresByEmail, failuresByIp } = limiters;
  return {
    reserveSend(ip, email) {
      const wait = longestWait([cooldown.check(email), sendsByEmail.check(email), sendsByIp.check(ip)]);
      if (wait !== null) return wait;
      cooldown.record(email);
      sendsByEmail.record(email);
      sendsByIp.record(ip);
      return null;
    },
    releaseSend(ip, email) {
      cooldown.release(email);
      sendsByEmail.release(email);
      sendsByIp.release(ip);
    },
    reserveFailure(ip, email) {
      const wait = longestWait([failuresByEmail.check(email), failuresByIp.check(ip)]);
      if (wait !== null) return wait;
      failuresByEmail.record(email);
      failuresByIp.record(ip);
      return null;
    },
    forgiveFailure(ip, email) {
      failuresByEmail.reset(email);
      failuresByIp.release(ip);
    },
    releaseFailure(ip, email) {
      failuresByEmail.release(email);
      failuresByIp.release(ip);
    },
  };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
cd server && npx vitest run --testTimeout=30000
cd .. && npm run typecheck
```

Expected: PASS (servidor: **758 pruebas**) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): límites de los códigos por correo (espera, envíos por correo e IP, fallos de código)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Las rutas

**Files:**
- Modify: `server/src/app.ts`, `server/src/auth/auth.routes.ts`, `server/src/auth/auth.schemas.ts`
- Create: `server/src/auth/recovery.routes.ts`
- Test: `server/test/auth/accounts.routes.test.ts`; `server/test/helpers/app.ts` (modificar)

**Interfaces:**
- Consumes: todo lo anterior: `AuthService` (Tasks 5 y 6), `CodeLimits` (Task 7), `Mailer`/`createMailer` y `MemoryMailer` (Task 3), `EmailCodeStore`/`createCodeHasher` (Task 4) y `Env.EMAIL_VERIFICATION` (Task 1).
- Produces:
  - `GET /auth/options` → `200 { emailVerification: boolean }` (siempre existe).
  - `POST /auth/register`: apagado, `201 { user, accessToken }` y cookie como siempre; activo, `202 { verification: "required", email }` sin sesión (el hueco de los envíos se reserva antes y se devuelve si el envío no llega a hacerse).
  - `POST /auth/login`: activo y cuenta sin verificar, con la contraseña correcta, `403 EMAIL_NOT_VERIFIED` y un código nuevo en segundo plano si el límite de envíos lo permite. `POST /auth/refresh` de una cuenta sin verificar: `403 EMAIL_NOT_VERIFIED`.
  - Solo con el interruptor activo (apagado responden el 404 de siempre): `POST /auth/verify-email` `{ email, code }` → `200 { user, accessToken }` y cookie; `POST /auth/verification/resend` y `POST /auth/password/forgot` `{ email }` → `202 { ok: true }` **siempre y antes de buscar la cuenta y enviar**; `POST /auth/password/reset` `{ email, code, password }` → `204`. El formato del código y la contraseña nueva se validan **antes** de reservar el intento.
  - `GET /auth/test-outbox?to=<correo>` → `200 { messages: [{ to, subject, text }] }`, solo con `MAIL_PROVIDER=memory` y, en producción, `ALLOW_MEMORY_MAIL=true`.
  - `createApp({ …, mailer? })` (por defecto `createMailer(env)`) y, para las pruebas, `buildTestContext(overrides, { mailer })`, que devuelve el `mailer` (por defecto un `MemoryMailer`).

- [ ] **Step 1: Escribir las pruebas que fallan**

`server/test/helpers/app.ts` (el ayudante de las pruebas acepta un `mailer` y lo devuelve):

```diff
diff --git a/server/test/helpers/app.ts b/server/test/helpers/app.ts
index be9eebc..c313806 100644
--- a/server/test/helpers/app.ts
+++ b/server/test/helpers/app.ts
@@ -3,6 +3,8 @@ import { createApp } from "../../src/app.js";
 import type { RateLimitConfig } from "../../src/http/limits.js";
 import type { PokemonCatalog } from "../../src/catalog/pokemon-catalog.js";
 import { createTokenService } from "../../src/auth/tokens.js";
+import type { Mailer } from "../../src/mail/mailer.js";
+import { MemoryMailer } from "../../src/mail/memory-mailer.js";
 import { loadEnv } from "../../src/config/env.js";
 import { createPrismaGameRepository } from "../../src/game/prisma-game-repository.js";
 import { type Rng, cryptoRng } from "../../src/game/rng.js";
@@ -22,6 +24,8 @@ export interface TestContextOptions {
   catalog?: PokemonCatalog;
   /** Límites de peticiones (por defecto apagados: muchas pruebas registran a más personas de las que permite la IP). */
   rateLimits?: RateLimitConfig;
+  /** Quien envía los correos (por defecto un buzón en memoria; pasa uno propio para leer lo enviado). */
+  mailer?: Mailer;
 }
 
 /**
@@ -46,8 +50,9 @@ export function buildTestContext(overrides: Record<string, string> = {}, options
     store,
     persistRetryDelayMs: 0,
   });
-  const app = createApp({ env, prisma, tokens, roomManager, catalog, rateLimits: options.rateLimits ?? "off" });
-  return { app, env, tokens, time, broadcaster, store, roomManager, catalog };
+  const mailer = options.mailer ?? new MemoryMailer();
+  const app = createApp({ env, prisma, tokens, roomManager, catalog, rateLimits: options.rateLimits ?? "off", mailer });
+  return { app, env, tokens, time, broadcaster, store, roomManager, catalog, mailer };
 }
 
 export function buildTestApp(overrides: Record<string, string> = {}): Express {
```

`server/test/auth/accounts.routes.test.ts` (`/auth/options`; el interruptor apagado deja todo como antes; el registro pendiente; verificar, reenviar, «olvidé» y restablecer, con respuestas idénticas con correos que existen y que no; los límites con los valores de producción: espera de un minuto, tope por hora y por IP, cinco fallos y el sexto bloqueado aunque acierte —al verificar y al restablecer—, acertar devuelve el hueco, el proveedor caído devuelve el hueco; «olvidé» y «reenviar» contestan antes de enviar; el buzón de pruebas solo con `memory` (y nunca en producción sin el permiso, ni con el correo apagado); y ningún código en la consola ni en los errores):

```ts
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MailerError } from "../../src/mail/mailer.js";
import { MemoryMailer } from "../../src/mail/memory-mailer.js";
import { DEFAULT_RATE_LIMITS } from "../../src/http/limits.js";
import { buildTestContext } from "../helpers/app.js";
import { prisma, resetDatabase } from "../helpers/db.js";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const ash = { email: "ash@example.com", username: "ash", password: "pikachu-123" };

beforeEach(resetDatabase);
afterEach(() => vi.restoreAllMocks());
afterAll(() => prisma.$disconnect());

/** La aplicación con la verificación activada y un buzón en memoria que la prueba puede leer. */
function setup(overrides: Record<string, string> = {}, options: Parameters<typeof buildTestContext>[1] = {}) {
  const mailer = new MemoryMailer();
  const ctx = buildTestContext({ EMAIL_VERIFICATION: "on", ...overrides }, { mailer, ...options });
  return { ...ctx, mailer };
}

/** Lo mismo con los límites de producción y el reloj de la prueba. */
function limited(overrides: Record<string, string> = {}) {
  const holder: { now: () => number } = { now: () => 0 };
  const env = setup({ TRUST_PROXY: "1", ...overrides }, { rateLimits: { ...DEFAULT_RATE_LIMITS, now: () => holder.now() } });
  holder.now = () => env.time.now();
  return env;
}

const from = (ip: string) => ({ "X-Forwarded-For": ip });

function codeIn(mailer: MemoryMailer, email: string): string {
  const mail = mailer.to(email).at(-1);
  if (!mail) throw new Error(`No se envió ningún correo a ${email}`);
  return /(\d{6})/.exec(mail.text)![1]!;
}

const wrong = (code: string): string => (code === "000000" ? "000001" : "000000");

function refreshCookie(response: request.Response): string | undefined {
  const cookies = (response.headers["set-cookie"] ?? []) as unknown as string[];
  return cookies.find((c) => c.startsWith("refresh_token="));
}

/** Una cuenta verificada, con su sesión: se registra con el interruptor activo y se verifica con el código del buzón. */
async function verifiedAccount(env: ReturnType<typeof setup>, account = ash) {
  await request(env.app).post("/auth/register").send(account);
  const response = await request(env.app).post("/auth/verify-email").send({ email: account.email, code: codeIn(env.mailer, account.email) });
  expect(response.status).toBe(200);
  return response;
}

const attemptsFor = async (email: string, purpose: "verify_email" | "reset_password" = "verify_email") => {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return (await prisma.emailCode.findUniqueOrThrow({ where: { userId_purpose: { userId: user.id, purpose } } })).attempts;
};

describe("GET /auth/options", () => {
  it("dice si la verificación por correo está activa", async () => {
    expect((await request(setup().app).get("/auth/options")).body).toEqual({ emailVerification: true });
    expect((await request(buildTestContext().app).get("/auth/options")).body).toEqual({ emailVerification: false });
  });
});

describe("con el interruptor apagado todo es como antes", () => {
  const off = () => buildTestContext();

  it("las rutas de los códigos no existen: 404", async () => {
    const { app } = off();
    for (const [method, path] of [
      ["post", "/auth/verify-email"],
      ["post", "/auth/verification/resend"],
      ["post", "/auth/password/forgot"],
      ["post", "/auth/password/reset"],
    ] as const) {
      const response = await request(app)[method](path).send({ email: ash.email, code: "123456", password: "pikachu-123" });
      expect(response.status, path).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    }
  });

  it("registrarse da la sesión en el acto (201) y entrar no pide verificar nada", async () => {
    const { app, mailer } = off();
    const registered = await request(app).post("/auth/register").send(ash);
    expect(registered.status).toBe(201);
    expect(registered.body.accessToken).toEqual(expect.any(String));
    expect(refreshCookie(registered)).toBeDefined();
    expect((await request(app).post("/auth/login").send({ email: ash.email, password: ash.password })).status).toBe(200);
    expect((mailer as MemoryMailer).sent).toHaveLength(0);
  });
});

describe("POST /auth/register con la verificación activa", () => {
  it("crea la cuenta pendiente, envía el código y responde 202 sin sesión", async () => {
    const env = setup();
    const response = await request(env.app).post("/auth/register").send(ash);
    expect(response.status).toBe(202);
    expect(response.body).toEqual({ verification: "required", email: ash.email });
    expect(refreshCookie(response)).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toMatch(/token|password/i);
    expect(env.mailer.to(ash.email)).toHaveLength(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: ash.email } })).emailVerifiedAt).toBeNull();
  });

  it("guarda el correo en minúsculas y responde con él", async () => {
    const env = setup();
    const response = await request(env.app).post("/auth/register").send({ ...ash, email: "ASH@Example.com" });
    expect(response.body.email).toBe("ash@example.com");
    expect(env.mailer.to("ash@example.com")).toHaveLength(1);
  });

  it("datos inválidos: 400 y no se envía nada", async () => {
    const env = setup();
    const response = await request(env.app).post("/auth/register").send({ email: "no-es-email", username: "a", password: "1" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(env.mailer.sent).toHaveLength(0);
  });

  it("un correo de una cuenta verificada: 409 EMAIL_TAKEN; el de una pendiente se reemplaza", async () => {
    const env = setup();
    await verifiedAccount(env);
    const taken = await request(env.app).post("/auth/register").send({ ...ash, username: "otro" });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe("EMAIL_TAKEN");

    const second = { email: "misty@example.com", username: "misty", password: "pikachu-123" };
    expect((await request(env.app).post("/auth/register").send(second)).status).toBe(202);
    expect((await request(env.app).post("/auth/register").send({ ...second, username: "misty2" })).status).toBe(202);
    expect(await prisma.user.count({ where: { email: second.email } })).toBe(1);
    expect(env.mailer.to(second.email)).toHaveLength(2);
  });

  it("si el proveedor falla: 502 EMAIL_SEND_FAILED sin nada del proveedor, y la cuenta queda pendiente", async () => {
    const env = setup();
    env.mailer.failWith = new MailerError(403, "Resend respondió 403 (invalid_api_key) re_clave_secreta");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await request(env.app).post("/auth/register").send(ash);
    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe("EMAIL_SEND_FAILED");
    expect(JSON.stringify(response.body)).not.toMatch(/Resend|403|re_clave/);
    expect(await prisma.user.count()).toBe(1);
  });
});

describe("POST /auth/verify-email", () => {
  it("con el código correcto verifica la cuenta y abre la sesión: 200, usuario, access token y cookie", async () => {
    const env = setup();
    await request(env.app).post("/auth/register").send(ash);
    const response = await request(env.app).post("/auth/verify-email").send({ email: ash.email, code: codeIn(env.mailer, ash.email) });
    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ email: ash.email, username: ash.username });
    expect(response.body.accessToken).toEqual(expect.any(String));
    const cookie = refreshCookie(response);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/auth/);
    expect(JSON.stringify(response.body)).not.toMatch(/password|hash/i);
    expect((await request(env.app).post("/auth/login").send({ email: ash.email, password: ash.password })).status).toBe(200);
  });

  it("un código equivocado, uno ya gastado y un correo que no existe dan el mismo 400 INVALID_CODE con el mismo cuerpo", async () => {
    const env = setup();
    await request(env.app).post("/auth/register").send(ash);
    const code = codeIn(env.mailer, ash.email);
    const bad = await request(env.app).post("/auth/verify-email").send({ email: ash.email, code: wrong(code) });
    const unknown = await request(env.app).post("/auth/verify-email").send({ email: "nadie@example.com", code });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("INVALID_CODE");
    expect(unknown.status).toBe(bad.status);
    expect(unknown.body).toEqual(bad.body);

    await request(env.app).post("/auth/verify-email").send({ email: ash.email, code });
    const spent = await request(env.app).post("/auth/verify-email").send({ email: ash.email, code });
    expect(spent.status).toBe(400);
    expect(spent.body).toEqual(bad.body);
  });

  it("un código con mal formato da 400 VALIDATION_ERROR y no gasta ningún intento", async () => {
    const env = setup();
    await request(env.app).post("/auth/register").send(ash);
    for (const code of ["12345", "1234567", "12a456", "", "abcdef"]) {
      const response = await request(env.app).post("/auth/verify-email").send({ email: ash.email, code });
      expect(response.status, code).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect(await attemptsFor(ash.email)).toBe(0);
  });

  it("antes de verificar, entrar da 403 EMAIL_NOT_VERIFIED y se envía un código nuevo en segundo plano", async () => {
    const env = setup();
    await request(env.app).post("/auth/register").send(ash);
    const login = await request(env.app).post("/auth/login").send({ email: ash.email, password: ash.password });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe("EMAIL_NOT_VERIFIED");
    expect(refreshCookie(login)).toBeUndefined();
    await vi.waitFor(() => expect(env.mailer.to(ash.email)).toHaveLength(2));
    const bad = await request(env.app).post("/auth/login").send({ email: ash.email, password: "mala-clave-1" });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("renovar la sesión de una cuenta sin verificar da 403 EMAIL_NOT_VERIFIED", async () => {
    const off = buildTestContext();
    const registered = await request(off.app).post("/auth/register").send(ash);
    const cookie = refreshCookie(registered)!;
    const on = setup();
    const response = await request(on.app).post("/auth/refresh").set("Cookie", cookie.split(";")[0]!);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("EMAIL_NOT_VERIFIED");
  });
});

describe("POST /auth/verification/resend", () => {
  it("a una cuenta sin verificar le llega un código nuevo; responde 202 { ok: true }", async () => {
    const env = setup();
    await request(env.app).post("/auth/register").send(ash);
    const response = await request(env.app).post("/auth/verification/resend").send({ email: ash.email });
    expect(response.status).toBe(202);
    expect(response.body).toEqual({ ok: true });
    await vi.waitFor(() => expect(env.mailer.to(ash.email)).toHaveLength(2));
  });

  it("contesta lo mismo, con el mismo cuerpo, a una cuenta verificada y a un correo que no existe, y no les envía nada", async () => {
    const env = setup();
    await request(env.app).post("/auth/register").send(ash);
    const pending = await request(env.app).post("/auth/verification/resend").send({ email: ash.email });
    const unknown = await request(env.app).post("/auth/verification/resend").send({ email: "nadie@example.com" });
    expect(unknown.status).toBe(pending.status);
    expect(unknown.body).toEqual(pending.body);
    await vi.waitFor(() => expect(env.mailer.to(ash.email)).toHaveLength(2));
    expect(env.mailer.to("nadie@example.com")).toHaveLength(0);
  });

  it("un correo con mal formato da 400", async () => {
    const response = await request(setup().app).post("/auth/verification/resend").send({ email: "no-es-correo" });
    expect(response.status).toBe(400);
  });
});

describe("recuperar la contraseña", () => {
  it("«olvidé» y «reenviar» contestan antes de buscar la cuenta y de enviar: ni el tiempo delata si el correo existe", async () => {
    const env = setup();
    await request(env.app).post("/auth/register").send(ash);
    const original = env.mailer.send.bind(env.mailer);
    let finished = 0;
    env.mailer.send = async (mail) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await original(mail);
      finished++;
    };
    for (const path of ["/auth/password/forgot", "/auth/verification/resend"]) {
      finished = 0;
      const response = await request(env.app).post(path).send({ email: ash.email });
      expect(response.status, path).toBe(202);
      expect(finished, `${path}: ya había terminado de enviar al contestar`).toBe(0);
      await vi.waitFor(() => expect(finished, path).toBe(1));
    }
  });

  it("«olvidé» contesta 202 { ok: true } y a una cuenta que existe le llega el código en segundo plano", async () => {
    const env = setup();
    await verifiedAccount(env);
    env.mailer.clear();
    const response = await request(env.app).post("/auth/password/forgot").send({ email: ash.email });
    expect(response.status).toBe(202);
    expect(response.body).toEqual({ ok: true });
    await vi.waitFor(() => expect(env.mailer.to(ash.email)).toHaveLength(1));
    expect(env.mailer.to(ash.email)[0]!.subject).toContain("contraseña");
  });

  it("contesta exactamente lo mismo, con el mismo cuerpo y las mismas cabeceras, a un correo que no existe, y no envía nada", async () => {
    const env = setup();
    await verifiedAccount(env);
    env.mailer.clear();
    const unknown = await request(env.app).post("/auth/password/forgot").send({ email: "nadie@example.com" });
    const known = await request(env.app).post("/auth/password/forgot").send({ email: ash.email });
    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    expect(Object.keys(unknown.headers).sort()).toEqual(Object.keys(known.headers).sort());
    await vi.waitFor(() => expect(env.mailer.to(ash.email)).toHaveLength(1));
    expect(env.mailer.to("nadie@example.com")).toHaveLength(0);
  });

  it("cambia la contraseña con el código: 204, la nueva entra, la vieja no y las sesiones abiertas se cierran", async () => {
    const env = setup();
    const verified = await verifiedAccount(env);
    const oldCookie = refreshCookie(verified)!.split(";")[0]!;
    env.mailer.clear();
    await request(env.app).post("/auth/password/forgot").send({ email: ash.email });
    await vi.waitFor(() => expect(env.mailer.to(ash.email)).toHaveLength(1));

    const reset = await request(env.app)
      .post("/auth/password/reset")
      .send({ email: ash.email, code: codeIn(env.mailer, ash.email), password: "nueva-clave-1" });
    expect(reset.status).toBe(204);
    expect(refreshCookie(reset)).toBeUndefined();

    expect((await request(env.app).post("/auth/login").send({ email: ash.email, password: "nueva-clave-1" })).status).toBe(200);
    expect((await request(env.app).post("/auth/login").send({ email: ash.email, password: ash.password })).status).toBe(401);
    expect((await request(env.app).post("/auth/refresh").set("Cookie", oldCookie)).status).toBe(401);
  });

  it("un código equivocado o un correo que no existe dan el mismo 400 INVALID_CODE", async () => {
    const env = setup();
    await verifiedAccount(env);
    env.mailer.clear();
    await request(env.app).post("/auth/password/forgot").send({ email: ash.email });
    await vi.waitFor(() => expect(env.mailer.to(ash.email)).toHaveLength(1));
    const code = codeIn(env.mailer, ash.email);

    const bad = await request(env.app).post("/auth/password/reset").send({ email: ash.email, code: wrong(code), password: "nueva-clave-1" });
    const unknown = await request(env.app).post("/auth/password/reset").send({ email: "nadie@example.com", code, password: "nueva-clave-1" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("INVALID_CODE");
    expect(unknown.body).toEqual(bad.body);
    expect((await request(env.app).post("/auth/login").send({ email: ash.email, password: ash.password })).status).toBe(200);
  });

  it("una contraseña inválida da 400 VALIDATION_ERROR y no gasta ningún intento ni el código", async () => {
    const env = setup();
    await verifiedAccount(env);
    env.mailer.clear();
    await request(env.app).post("/auth/password/forgot").send({ email: ash.email });
    await vi.waitFor(() => expect(env.mailer.to(ash.email)).toHaveLength(1));
    const code = codeIn(env.mailer, ash.email);

    const tooShort = await request(env.app).post("/auth/password/reset").send({ email: ash.email, code, password: "corta" });
    expect(tooShort.status).toBe(400);
    expect(tooShort.body.error.code).toBe("VALIDATION_ERROR");
    const tooLong = await request(env.app).post("/auth/password/reset").send({ email: ash.email, code, password: "x".repeat(73) });
    expect(tooLong.status).toBe(400);
    expect(await attemptsFor(ash.email, "reset_password")).toBe(0);

    expect((await request(env.app).post("/auth/password/reset").send({ email: ash.email, code, password: "nueva-clave-1" })).status).toBe(204);
  });
});

describe("límites con los valores de producción", () => {
  it("«olvidé» dos veces seguidas al mismo correo: la segunda da 429 con la espera, exista o no la cuenta", async () => {
    const env = limited();
    await verifiedAccount(env);
    env.time.advance(MINUTE); // registrarse ya envió un código: la espera de 60 s cuenta desde ahí
    for (const email of [ash.email, "nadie@example.com"]) {
      expect((await request(env.app).post("/auth/password/forgot").set(from("1.1.1.1")).send({ email })).status).toBe(202);
      const blocked = await request(env.app).post("/auth/password/forgot").set(from("1.1.1.1")).send({ email });
      expect(blocked.status, email).toBe(429);
      expect(blocked.body.error.code).toBe("RATE_LIMITED");
      expect(blocked.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
      expect(blocked.headers["retry-after"]).toBe(String(blocked.body.error.details.retryAfterSeconds));
    }
  });

  it("pasados 60 s vuelve a dejar; y como mucho 5 por hora al mismo correo", async () => {
    const env = limited();
    for (let i = 0; i < 5; i++) {
      expect((await request(env.app).post("/auth/password/forgot").set(from("1.1.1.1")).send({ email: ash.email })).status).toBe(202);
      env.time.advance(MINUTE);
    }
    expect((await request(env.app).post("/auth/password/forgot").set(from("1.1.1.1")).send({ email: ash.email })).status).toBe(429);
    env.time.advance(HOUR);
    expect((await request(env.app).post("/auth/password/forgot").set(from("1.1.1.1")).send({ email: ash.email })).status).toBe(202);
  });

  it("10 envíos por hora desde una IP, a cualquier correo; otra IP no se ve afectada", async () => {
    const env = limited();
    for (let i = 0; i < 10; i++) {
      expect((await request(env.app).post("/auth/password/forgot").set(from("1.1.1.1")).send({ email: `persona${i}@example.com` })).status).toBe(202);
    }
    expect((await request(env.app).post("/auth/password/forgot").set(from("1.1.1.1")).send({ email: "otra@example.com" })).status).toBe(429);
    expect((await request(env.app).post("/auth/password/forgot").set(from("2.2.2.2")).send({ email: "otra@example.com" })).status).toBe(202);
  });

  it("5 códigos equivocados por correo: el sexto intento da 429 aunque sea el correcto, y también con un correo que no existe", async () => {
    const env = limited();
    await request(env.app).post("/auth/register").set(from("1.1.1.1")).send(ash);
    const code = codeIn(env.mailer, ash.email);
    for (const email of [ash.email, "nadie@example.com"]) {
      for (let i = 0; i < 5; i++) {
        const response = await request(env.app).post("/auth/verify-email").set(from("3.3.3.3")).send({ email, code: wrong(code) });
        expect(response.status, `${email} ${i}`).toBe(400);
      }
      const blocked = await request(env.app).post("/auth/verify-email").set(from("3.3.3.3")).send({ email, code });
      expect(blocked.status, email).toBe(429);
      expect(blocked.body.error.code).toBe("RATE_LIMITED");
    }
  });

  it("verificar con el código correcto reinicia la cuenta de fallos del correo", async () => {
    const env = limited();
    await request(env.app).post("/auth/register").set(from("1.1.1.1")).send(ash);
    const code = codeIn(env.mailer, ash.email);
    for (let i = 0; i < 4; i++) await request(env.app).post("/auth/verify-email").set(from("1.1.1.1")).send({ email: ash.email, code: wrong(code) });
    expect((await request(env.app).post("/auth/verify-email").set(from("1.1.1.1")).send({ email: ash.email, code })).status).toBe(200);
    // La cuenta de fallos del correo volvió a cero: caben otros cinco antes del bloqueo.
    for (let i = 0; i < 5; i++) {
      const response = await request(env.app).post("/auth/verify-email").set(from("1.1.1.1")).send({ email: ash.email, code: wrong(code) });
      expect(response.status, `${i}`).toBe(400);
    }
  });

  it("restablecer tiene el mismo límite: 5 códigos equivocados y el sexto da 429 aunque sea el correcto, también con un correo que no existe", async () => {
    const env = limited();
    await verifiedAccount(env);
    // El registro acaba de enviar un código al correo: hay que esperar el minuto para pedir el de la contraseña.
    env.time.advance(MINUTE);
    expect((await request(env.app).post("/auth/password/forgot").set(from("3.3.3.3")).send({ email: ash.email })).status).toBe(202);
    await vi.waitFor(() => expect(env.mailer.to(ash.email)).toHaveLength(2));
    const code = codeIn(env.mailer, ash.email);

    for (const email of [ash.email, "nadie@example.com"]) {
      for (let i = 0; i < 5; i++) {
        const response = await request(env.app).post("/auth/password/reset").set(from("3.3.3.3")).send({ email, code: wrong(code), password: "nueva-clave-1" });
        expect(response.status, `${email} ${i}`).toBe(400);
      }
      const blocked = await request(env.app).post("/auth/password/reset").set(from("3.3.3.3")).send({ email, code, password: "nueva-clave-1" });
      expect(blocked.status, email).toBe(429);
      expect(blocked.body.error.code).toBe("RATE_LIMITED");
    }

    // Nada cambió: la contraseña de siempre sigue entrando.
    expect((await request(env.app).post("/auth/login").set(from("4.4.4.4")).send({ email: ash.email, password: ash.password })).status).toBe(200);
  });

  it("si el proveedor falla al registrarse se devuelve el hueco: se puede reintentar enseguida", async () => {
    const env = limited();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    env.mailer.failWith = new MailerError(503, "Resend respondió 503");
    expect((await request(env.app).post("/auth/register").set(from("1.1.1.1")).send(ash)).status).toBe(502);
    env.mailer.failWith = null;
    expect((await request(env.app).post("/auth/register").set(from("1.1.1.1")).send(ash)).status).toBe(202);
  });

  it("registrarse también envía código: el mismo correo dos veces seguidas espera 60 s", async () => {
    const env = limited();
    expect((await request(env.app).post("/auth/register").set(from("1.1.1.1")).send(ash)).status).toBe(202);
    const blocked = await request(env.app).post("/auth/register").set(from("1.1.1.1")).send(ash);
    expect(blocked.status).toBe(429);
    env.time.advance(MINUTE);
    expect((await request(env.app).post("/auth/register").set(from("1.1.1.1")).send(ash)).status).toBe(202);
  });

  it("entrar sin verificar respeta la espera: dos intentos seguidos envían un solo código", async () => {
    const env = limited();
    await request(env.app).post("/auth/register").set(from("1.1.1.1")).send(ash);
    env.time.advance(MINUTE);
    env.mailer.clear();
    for (let i = 0; i < 2; i++) {
      expect((await request(env.app).post("/auth/login").set(from("1.1.1.1")).send({ email: ash.email, password: ash.password })).status).toBe(403);
    }
    await vi.waitFor(() => expect(env.mailer.to(ash.email)).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(env.mailer.to(ash.email)).toHaveLength(1);
  });
});

describe("GET /auth/test-outbox (solo para las pruebas)", () => {
  it("devuelve lo enviado a una dirección con el buzón en memoria", async () => {
    const env = setup();
    await request(env.app).post("/auth/register").send(ash);
    const response = await request(env.app).get("/auth/test-outbox").query({ to: ash.email });
    expect(response.status).toBe(200);
    expect(response.body.messages).toHaveLength(1);
    expect(response.body.messages[0]).toMatchObject({ to: ash.email, subject: "Tu código de Pokémon Minigames" });
    expect(response.body.messages[0].text).toMatch(/\d{6}/);
    expect(Object.keys(response.body.messages[0]).sort()).toEqual(["subject", "text", "to"]);
    expect((await request(env.app).get("/auth/test-outbox").query({ to: "nadie@example.com" })).body.messages).toEqual([]);
    expect((await request(env.app).get("/auth/test-outbox")).status).toBe(400);
  });

  it("no existe con otro proveedor de correo", async () => {
    const consola = setup({ MAIL_PROVIDER: "console" });
    expect((await request(consola.app).get("/auth/test-outbox").query({ to: ash.email })).status).toBe(404);
    const resend = setup({ MAIL_PROVIDER: "resend", RESEND_API_KEY: "re_x", MAIL_FROM: "a@ejemplo.me" });
    expect((await request(resend.app).get("/auth/test-outbox").query({ to: ash.email })).status).toBe(404);
  });

  it("en producción solo existe con ALLOW_MEMORY_MAIL=true (el servidor de la prueba E2E)", async () => {
    const production = { NODE_ENV: "production", COOKIE_SECURE: "true", TRUST_PROXY: "1", EMAIL_VERIFICATION: "on", MAIL_PROVIDER: "memory" };
    expect(() => buildTestContext(production)).toThrow(/ALLOW_MEMORY_MAIL/);
    const e2e = setup({ ...production, ALLOW_MEMORY_MAIL: "true" });
    expect((await request(e2e.app).get("/auth/test-outbox").query({ to: ash.email })).status).toBe(200);
    const real = setup({ ...production, MAIL_PROVIDER: "resend", RESEND_API_KEY: "re_x", MAIL_FROM: "a@ejemplo.me" });
    expect((await request(real.app).get("/auth/test-outbox").query({ to: ash.email })).status).toBe(404);
    // Con la verificación apagada la configuración no pide nada de correo, pero el buzón sigue sin existir en producción sin el permiso.
    const off = setup({ ...production, EMAIL_VERIFICATION: "off" });
    expect((await request(off.app).get("/auth/test-outbox").query({ to: ash.email })).status).toBe(404);
  });
});

describe("los códigos no se escriben en ningún registro", () => {
  it("ni en la consola ni en los errores durante un registro, una verificación y una recuperación completos (también con el proveedor caído)", async () => {
    const logs: string[] = [];
    const capture = (...args: unknown[]) => void logs.push(args.map(String).join(" "));
    vi.spyOn(console, "log").mockImplementation(capture);
    vi.spyOn(console, "info").mockImplementation(capture);
    vi.spyOn(console, "warn").mockImplementation(capture);
    vi.spyOn(console, "error").mockImplementation(capture);

    const env = setup();
    const issued: string[] = [];
    await request(env.app).post("/auth/register").send(ash);
    issued.push(codeIn(env.mailer, ash.email));
    await request(env.app).post("/auth/verify-email").send({ email: ash.email, code: issued[0] });
    await request(env.app).post("/auth/password/forgot").send({ email: ash.email });
    await vi.waitFor(() => expect(env.mailer.to(ash.email)).toHaveLength(2));
    issued.push(codeIn(env.mailer, ash.email));
    env.mailer.failWith = new MailerError(500, "Resend respondió 500");
    await request(env.app).post("/auth/verification/resend").send({ email: "otra@example.com" });
    await request(env.app).post("/auth/register").send({ email: "otra@example.com", username: "otra", password: "pikachu-123" });
    await request(env.app).post("/auth/password/reset").send({ email: ash.email, code: issued[1], password: "nueva-clave-1" });
    await new Promise((resolve) => setTimeout(resolve, 100));

    for (const code of issued) expect(logs.join("\n")).not.toContain(code);
    expect(logs.join("\n")).not.toContain(ash.email);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
cd server && npx vitest run test/auth/accounts.routes.test.ts
```

Expected: FAIL — las rutas nuevas no existen y `createApp` no acepta un `mailer`.

- [ ] **Step 3: Implementar**

`server/src/auth/auth.schemas.ts` (el código de 6 dígitos y los cuerpos nuevos):

```diff
diff --git a/server/src/auth/auth.schemas.ts b/server/src/auth/auth.schemas.ts
index 39b4e90..8120422 100644
--- a/server/src/auth/auth.schemas.ts
+++ b/server/src/auth/auth.schemas.ts
@@ -4,20 +4,29 @@ import { MAX_PASSWORD_BYTES } from "./password.js";
 
 const email = z.string().trim().toLowerCase().pipe(z.email("Email inválido").max(255, "Email demasiado largo"));
 
+const password = z
+  .string()
+  .min(8, "La contraseña debe tener al menos 8 caracteres")
+  .refine((value) => Buffer.byteLength(value, "utf8") <= MAX_PASSWORD_BYTES, {
+    message: `La contraseña no puede superar ${MAX_PASSWORD_BYTES} bytes`,
+  });
+
 export const registerSchema = z.object({
   email,
   username: z
     .string()
     .trim()
     .regex(/^[A-Za-z0-9_]{3,30}$/, "Usa de 3 a 30 letras, números o guion bajo"),
-  password: z
-    .string()
-    .min(8, "La contraseña debe tener al menos 8 caracteres")
-    .refine((value) => Buffer.byteLength(value, "utf8") <= MAX_PASSWORD_BYTES, {
-      message: `La contraseña no puede superar ${MAX_PASSWORD_BYTES} bytes`,
-    }),
+  password,
 });
 
+/** El código de seis dígitos que llega por correo: con otro formato ni siquiera se cuenta como intento. */
+const code = z.string().regex(/^\d{6}$/, "El código son 6 dígitos");
+
+export const emailOnlySchema = z.object({ email });
+export const verifyEmailSchema = z.object({ email, code });
+export const resetPasswordSchema = z.object({ email, code, password });
+
 export const loginSchema = z.object({
   email,
   password: z.string().min(1, "La contraseña es obligatoria").max(1024),
```

`server/src/auth/recovery.routes.ts` (verificar, reenviar, «olvidé» y restablecer; solo se monta con el interruptor activo):

```ts
import { type Request, type Response, Router } from "express";
import { AppError } from "../http/errors.js";
import { tooManyRequests } from "../http/rate-limit.js";
import { emailOnlySchema, resetPasswordSchema, verifyEmailSchema } from "./auth.schemas.js";
import type { AuthResult, AuthService } from "./auth.service.js";
import type { CodeLimits } from "./code-limits.js";

export const SEND_LIMIT_MESSAGE = "Pediste demasiados códigos. Inténtalo de nuevo más tarde.";
const CHECK_LIMIT_MESSAGE = "Demasiados intentos con el código. Inténtalo de nuevo más tarde.";

const clientIp = (req: Request): string => req.ip ?? "desconocida";

/** Si el límite no deja pasar, 429 con la espera en el cuerpo y en `Retry-After`. */
export function rejectWhenBlocked(res: Response, wait: number | null, message: string): void {
  if (wait === null) return;
  res.set("Retry-After", String(wait));
  throw tooManyRequests(wait, message);
}

/** Un fallo en una tarea de segundo plano (nadie espera su respuesta): se anota sin dirección ni código. */
export function logBackgroundFailure(error: unknown): void {
  console.error(`[correo] Falló una tarea en segundo plano: ${error instanceof Error ? error.name : "error desconocido"}`);
}

const isInvalidCode = (error: unknown): boolean => error instanceof AppError && error.code === "INVALID_CODE";

export interface RecoveryRouterDeps {
  authService: AuthService;
  codeLimits: CodeLimits;
  /** Abre la sesión (cookie de refresco y cuerpo) con el resultado de verificar el correo. */
  openSession(res: Response, result: AuthResult): void;
}

/**
 * Verificar el correo, reenviar el código y cambiar la contraseña. Solo se monta con la verificación activa.
 * `resend` y `forgot` contestan siempre lo mismo y **antes** de buscar la cuenta y enviar: ni el cuerpo ni el tiempo de
 * respuesta delatan si el correo existe, y sus límites dependen del correo y la IP, nunca de la cuenta.
 */
export function createRecoveryRouter({ authService, codeLimits, openSession }: RecoveryRouterDeps): Router {
  const router = Router();

  router.post("/verify-email", async (req, res) => {
    // El formato se valida antes de tocar los límites: un código mal escrito no gasta ningún intento.
    const input = verifyEmailSchema.parse(req.body);
    const ip = clientIp(req);
    // El intento se reserva ANTES de comprobar el código (la comprobación espera a la base de datos): si no, los intentos
    // en paralelo pasarían todos con la cuenta aún a cero.
    rejectWhenBlocked(res, codeLimits.reserveFailure(ip, input.email), CHECK_LIMIT_MESSAGE);
    let result: AuthResult;
    try {
      result = await authService.verifyEmail(input);
    } catch (error) {
      // Un fallo nuestro (la base de datos, p. ej.) no es un intento fallido de quien escribió el código.
      if (!isInvalidCode(error)) codeLimits.releaseFailure(ip, input.email);
      throw error;
    }
    codeLimits.forgiveFailure(ip, input.email);
    openSession(res, result);
  });

  router.post("/verification/resend", (req, res) => {
    const { email } = emailOnlySchema.parse(req.body);
    rejectWhenBlocked(res, codeLimits.reserveSend(clientIp(req), email), SEND_LIMIT_MESSAGE);
    void authService.resendVerification(email).catch(logBackgroundFailure);
    res.status(202).json({ ok: true });
  });

  router.post("/password/forgot", (req, res) => {
    const { email } = emailOnlySchema.parse(req.body);
    rejectWhenBlocked(res, codeLimits.reserveSend(clientIp(req), email), SEND_LIMIT_MESSAGE);
    void authService.requestPasswordReset(email).catch(logBackgroundFailure);
    res.status(202).json({ ok: true });
  });

  router.post("/password/reset", async (req, res) => {
    // La contraseña nueva también se valida antes de reservar el intento: una demasiado corta no gasta el código.
    const input = resetPasswordSchema.parse(req.body);
    const ip = clientIp(req);
    rejectWhenBlocked(res, codeLimits.reserveFailure(ip, input.email), CHECK_LIMIT_MESSAGE);
    try {
      await authService.resetPassword(input);
    } catch (error) {
      if (!isInvalidCode(error)) codeLimits.releaseFailure(ip, input.email);
      throw error;
    }
    codeLimits.forgiveFailure(ip, input.email);
    res.status(204).end();
  });

  return router;
}
```

`server/src/auth/auth.routes.ts` (`/options`, el registro pendiente con sus límites, el login sin verificar, el montaje condicional y el buzón de pruebas):

```diff
diff --git a/server/src/auth/auth.routes.ts b/server/src/auth/auth.routes.ts
index b7e260b..3730435 100644
--- a/server/src/auth/auth.routes.ts
+++ b/server/src/auth/auth.routes.ts
@@ -2,9 +2,13 @@ import { type CookieOptions, type Request, type Response, Router } from "express
 import type { Env } from "../config/env.js";
 import { AppError } from "../http/errors.js";
 import { type KeyedLimiter, tooManyRequests } from "../http/rate-limit.js";
+import type { Mailer } from "../mail/mailer.js";
+import { MemoryMailer } from "../mail/memory-mailer.js";
 import { createRequireAuth, getAuth } from "./auth.middleware.js";
 import { loginSchema, preferencesSchema, registerSchema } from "./auth.schemas.js";
 import type { AuthResult, AuthService, AuthUser } from "./auth.service.js";
+import { type CodeLimits, createCodeLimits } from "./code-limits.js";
+import { SEND_LIMIT_MESSAGE, createRecoveryRouter, logBackgroundFailure, rejectWhenBlocked } from "./recovery.routes.js";
 import type { TokenService } from "./tokens.js";
 
 export const REFRESH_COOKIE = "refresh_token";
@@ -15,6 +19,10 @@ export interface AuthRouterDeps {
   tokens: TokenService;
   /** Límites de intentos; sin ellos no se limita nada (las pruebas que no los necesitan). */
   limiters?: { loginFailures?: KeyedLimiter; loginFailuresByIp?: KeyedLimiter; register?: KeyedLimiter; registerFailures?: KeyedLimiter };
+  /** Límites de los códigos por correo; sin ellos no se limita nada. */
+  codeLimits?: CodeLimits;
+  /** Para saber si hay un buzón en memoria (la E2E lee de él los códigos). */
+  mailer?: Mailer;
 }
 
 const clientIp = (req: Request): string => req.ip ?? "desconocida";
@@ -29,7 +37,7 @@ function toUserDto(user: AuthUser) {
   };
 }
 
-export function createAuthRouter({ env, authService, tokens, limiters = {} }: AuthRouterDeps): Router {
+export function createAuthRouter({ env, authService, tokens, limiters = {}, codeLimits = createCodeLimits(), mailer }: AuthRouterDeps): Router {
   const router = Router();
   const requireAuth = createRequireAuth(tokens);
 
@@ -62,15 +70,31 @@ export function createAuthRouter({ env, authService, tokens, limiters = {} }: Au
       throw tooManyRequests(retryAfterSeconds);
     }
     created?.record(ip);
-    let result: AuthResult;
+    let result: AuthResult | null = null;
+    let pendingEmail: string | null = null;
     try {
       const input = registerSchema.parse(req.body);
-      result = await authService.register(input);
+      if (env.EMAIL_VERIFICATION) {
+        // Con la verificación activa se crea la cuenta pendiente y se envía un código, sin abrir sesión. Enviar comparte los
+        // límites de los envíos; el hueco se devuelve más abajo si el envío no llega a hacerse.
+        rejectWhenBlocked(res, codeLimits.reserveSend(ip, input.email), SEND_LIMIT_MESSAGE);
+        pendingEmail = input.email;
+        await authService.registerPending(input);
+      } else {
+        result = await authService.register(input);
+      }
     } catch (error) {
       created?.release(ip);
-      failed?.record(ip);
+      // Lo que no es culpa de quien se registra (nuestro límite de envíos o un proveedor caído) no cuenta como intento fallido.
+      const ours = error instanceof AppError && (error.code === "RATE_LIMITED" || error.code === "EMAIL_SEND_FAILED");
+      if (!ours) failed?.record(ip);
+      if (pendingEmail !== null) codeLimits.releaseSend(ip, pendingEmail);
       throw error;
     }
+    if (result === null) {
+      res.status(202).json({ verification: "required", email: pendingEmail });
+      return;
+    }
     startSession(res, result);
     res.status(201).json({ user: toUserDto(result.user), accessToken: result.accessToken });
   });
@@ -104,6 +128,10 @@ export function createAuthRouter({ env, authService, tokens, limiters = {} }: Au
         loginFailures?.release(attemptKey);
         loginFailuresByIp?.release(ip);
       }
+      if (error instanceof AppError && error.code === "EMAIL_NOT_VERIFIED" && codeLimits.reserveSend(ip, input.email) === null) {
+        // La contraseña era correcta pero falta verificar el correo: se envía un código nuevo, sin esperar al proveedor.
+        void authService.resendVerification(input.email).catch(logBackgroundFailure);
+      }
       throw error;
     }
     loginFailures?.reset(attemptKey);
@@ -144,5 +172,33 @@ export function createAuthRouter({ env, authService, tokens, limiters = {} }: Au
     res.json({ preferences: await authService.savePreferences(getAuth(res).userId, preferences) });
   });
 
+  router.get("/options", (_req, res) => {
+    res.json({ emailVerification: env.EMAIL_VERIFICATION });
+  });
+
+  // Verificar, reenviar y recuperar solo existen con la verificación activa; apagada, la aplicación es la de antes.
+  if (env.EMAIL_VERIFICATION) {
+    router.use(
+      createRecoveryRouter({
+        authService,
+        codeLimits,
+        openSession(res, result) {
+          startSession(res, result);
+          res.json({ user: toUserDto(result.user), accessToken: result.accessToken });
+        },
+      }),
+    );
+  }
+
+  // Solo para la E2E y las pruebas: lee lo que hay en el buzón en memoria. Con otro proveedor, o en producción sin
+  // ALLOW_MEMORY_MAIL, la ruta no existe.
+  if (mailer instanceof MemoryMailer && env.MAIL_PROVIDER === "memory" && (env.NODE_ENV !== "production" || env.ALLOW_MEMORY_MAIL)) {
+    router.get("/test-outbox", (req, res) => {
+      const to = typeof req.query.to === "string" ? req.query.to : "";
+      if (to === "") throw new AppError(400, "VALIDATION_ERROR", "Falta el correo (to)");
+      res.json({ messages: mailer.to(to).map(({ subject, text, to: address }) => ({ to: address, subject, text })) });
+    });
+  }
+
   return router;
 }
```

`server/src/app.ts` (el almacén de códigos, los cinco limitadores y el correo):

```diff
diff --git a/server/src/app.ts b/server/src/app.ts
index ed57659..4343fa5 100644
--- a/server/src/app.ts
+++ b/server/src/app.ts
@@ -3,6 +3,8 @@ import cors from "cors";
 import express, { type Express } from "express";
 import { createAuthRouter } from "./auth/auth.routes.js";
 import { AuthService } from "./auth/auth.service.js";
+import { createCodeLimits } from "./auth/code-limits.js";
+import { EmailCodeStore, createCodeHasher } from "./auth/email-codes.js";
 import { createPasswordHasher } from "./auth/password.js";
 import type { TokenService } from "./auth/tokens.js";
 import { createCatalogRouter } from "./catalog/catalog.routes.js";
@@ -16,6 +18,8 @@ import { errorHandler, notFoundHandler } from "./http/errors.js";
 import { DEFAULT_RATE_LIMITS, type RateLimitConfig } from "./http/limits.js";
 import { createOriginCheck } from "./http/origin-check.js";
 import { createKeyedLimiter, rateLimitMiddleware } from "./http/rate-limit.js";
+import { createMailer } from "./mail/create-mailer.js";
+import type { Mailer } from "./mail/mailer.js";
 import { createRoomsRouter } from "./rooms/rooms.routes.js";
 import { createStatsRouter } from "./stats/stats.routes.js";
 import { StatsService } from "./stats/stats.service.js";
@@ -31,9 +35,11 @@ export interface AppDeps {
   rateLimits?: RateLimitConfig | "off";
   /** Directorio del cliente construido; si existe con su index.html, el servidor lo sirve (un solo origen). */
   clientDist?: string;
+  /** Quien envía los correos (por defecto, el que dice la configuración: Resend, la consola o la memoria). */
+  mailer?: Mailer;
 }
 
-export function createApp({ env, prisma, tokens, roomManager, catalog, rateLimits = DEFAULT_RATE_LIMITS, clientDist }: AppDeps): Express {
+export function createApp({ env, prisma, tokens, roomManager, catalog, rateLimits = DEFAULT_RATE_LIMITS, clientDist, mailer = createMailer(env) }: AppDeps): Express {
   const limits = rateLimits === "off" ? null : rateLimits;
   const limiters = limits && {
     loginFailures: createKeyedLimiter({ ...limits.loginFailures, now: limits.now }),
@@ -42,12 +48,25 @@ export function createApp({ env, prisma, tokens, roomManager, catalog, rateLimit
     registerFailures: createKeyedLimiter({ ...limits.registerFailures, now: limits.now }),
     api: createKeyedLimiter({ ...limits.api, now: limits.now }),
   };
+  const codeLimits = createCodeLimits(
+    limits
+      ? {
+          cooldown: createKeyedLimiter({ ...limits.codeCooldown, now: limits.now }),
+          sendsByEmail: createKeyedLimiter({ ...limits.codeSendsByEmail, now: limits.now }),
+          sendsByIp: createKeyedLimiter({ ...limits.codeSendsByIp, now: limits.now }),
+          failuresByEmail: createKeyedLimiter({ ...limits.codeFailuresByEmail, now: limits.now }),
+          failuresByIp: createKeyedLimiter({ ...limits.codeFailuresByIp, now: limits.now }),
+        }
+      : undefined,
+  );
 
   const authService = new AuthService({
     prisma,
     hasher: createPasswordHasher(env.BCRYPT_COST),
     tokens,
     refreshTtlMs: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
+    emailVerification: env.EMAIL_VERIFICATION,
+    email: { codes: new EmailCodeStore({ prisma, hash: createCodeHasher(env.JWT_ACCESS_SECRET) }), mailer },
   });
 
   const app = express();
@@ -65,7 +84,7 @@ export function createApp({ env, prisma, tokens, roomManager, catalog, rateLimit
   app.get("/health", (_req, res) => {
     res.json({ status: "ok" });
   });
-  app.use("/auth", createAuthRouter({ env, authService, tokens, limiters: limiters ?? undefined }));
+  app.use("/auth", createAuthRouter({ env, authService, tokens, limiters: limiters ?? undefined, codeLimits, mailer }));
   app.use("/rooms", createRoomsRouter({ manager: roomManager, tokens }));
   app.use("/pokemon", createCatalogRouter({ catalog }));
   app.use(createStatsRouter({ service: new StatsService({ prisma, catalog }), tokens }));
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
cd server && npx vitest run --testTimeout=30000
cd .. && npm run typecheck
```

Expected: PASS (servidor: **793 pruebas**, una más omitida en Windows) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): rutas de verificar, reenviar, olvidé y restablecer (solo con el interruptor activo) y buzón de pruebas" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Cliente — API y sesión

**Files:**
- Modify: `client/src/api/types.ts`, `client/src/api/endpoints.ts`, `client/src/session/session-store.ts`
- Create: `client/src/session/auth-options.ts`, `client/test/session/auth-options.test.tsx`
- Test (modificar): `client/test/api/endpoints.test.ts`, `client/test/session/session-store.test.ts`, `client/test/helpers/services.tsx`

**Interfaces:**
- Consumes: las rutas de la Task 8 y los mensajes de error de la Task 1.
- Produces:
  - `types.ts`: `interface VerificationRequired { verification: "required"; email: string }`.
  - `Endpoints.auth`: `register(input): Promise<AuthSession | VerificationRequired>`, `options(): Promise<{ emailVerification: boolean }>`, `verifyEmail({ email, code }): Promise<AuthSession>` (guarda el token), `resendCode(email): Promise<void>`, `forgotPassword(email): Promise<void>`, `resetPassword({ email, code, password }): Promise<void>` (acepta el `204`); todas las llamadas nuevas van sin token. Tipos exportados `VerifyEmailInput` y `ResetPasswordInput`.
  - Almacén de sesión: `register(input): Promise<VerificationRequired | null>` (con la verificación activa deja la sesión como estaba y devuelve el correo) y `verifyEmail(input): Promise<void>` (abre la sesión).
  - `session/auth-options.ts`: `useEmailVerification(): boolean` — una sola consulta a `auth.options()` por conjunto de servicios, `false` mientras carga o si falla (una consulta fallida no se recuerda).
  - El ayudante de las pruebas `fakeServices()` trae `options`, `verifyEmail`, `resendCode`, `forgotPassword` y `resetPassword` simulados.

- [ ] **Step 1: Escribir las pruebas que fallan**

`client/test/helpers/services.tsx` (los simulacros nuevos de `fakeServices()`):

```diff
diff --git a/client/test/helpers/services.tsx b/client/test/helpers/services.tsx
index d5aad22..2e15dd6 100644
--- a/client/test/helpers/services.tsx
+++ b/client/test/helpers/services.tsx
@@ -57,6 +57,11 @@ export function fakeServices(): FakeServices {
       refresh: vi.fn(async () => null),
       logout: vi.fn(async () => {}),
       savePreferences: vi.fn(async () => {}),
+      options: vi.fn(async () => ({ emailVerification: false })),
+      verifyEmail: vi.fn(async () => ({ user: ASH, accessToken: "tok" })),
+      resendCode: vi.fn(async () => {}),
+      forgotPassword: vi.fn(async () => {}),
+      resetPassword: vi.fn(async () => {}),
     },
     rooms: {
       create: vi.fn(async () => ({ code: "ABC234" })),
```

`client/test/api/endpoints.test.ts`:

```diff
diff --git a/client/test/api/endpoints.test.ts b/client/test/api/endpoints.test.ts
index 67f748e..a3b69ba 100644
--- a/client/test/api/endpoints.test.ts
+++ b/client/test/api/endpoints.test.ts
@@ -22,7 +22,7 @@ describe("endpoints de autenticación", () => {
   it("register y login envían los datos, guardan el token y devuelven la sesión", async () => {
     const { api, endpoints, fetchMock } = setup(() => json(200, session));
     const registered = await endpoints.auth.register({ email: "ash@example.com", username: "ash", password: "pikachu-123" });
-    expect(registered.user.username).toBe("ash");
+    expect("user" in registered && registered.user.username).toBe("ash");
     expect(lastCall(fetchMock)).toEqual({
       url: "/auth/register",
       method: "POST",
@@ -56,6 +56,73 @@ describe("endpoints de autenticación", () => {
   });
 });
 
+describe("endpoints de las cuentas con código por correo", () => {
+  const headersOf = (fetchMock: ReturnType<typeof setup>["fetchMock"]) => (fetchMock.mock.calls.at(-1)![1]?.headers ?? {}) as Record<string, string>;
+
+  it("register con la verificación activa devuelve «hay que verificar» y no guarda ningún token", async () => {
+    const { api, endpoints } = setup(() => json(202, { verification: "required", email: "ash@example.com" }));
+    await expect(endpoints.auth.register({ email: "ash@example.com", username: "ash", password: "pikachu-123" })).resolves.toEqual({
+      verification: "required",
+      email: "ash@example.com",
+    });
+    expect(api.getToken()).toBeNull();
+  });
+
+  it("options pregunta si la verificación está activa, sin token", async () => {
+    const { api, endpoints, fetchMock } = setup(() => json(200, { emailVerification: true }));
+    api.setToken("tok");
+    await expect(endpoints.auth.options()).resolves.toEqual({ emailVerification: true });
+    expect(lastCall(fetchMock)).toMatchObject({ url: "/auth/options", method: "GET" });
+    expect(headersOf(fetchMock).Authorization).toBeUndefined();
+  });
+
+  it("verifyEmail envía el correo y el código, abre la sesión y guarda el token", async () => {
+    const { api, endpoints, fetchMock } = setup(() => json(200, session));
+    await expect(endpoints.auth.verifyEmail({ email: "ash@example.com", code: "123456" })).resolves.toMatchObject({ accessToken: "tok" });
+    expect(lastCall(fetchMock)).toEqual({ url: "/auth/verify-email", method: "POST", body: { email: "ash@example.com", code: "123456" } });
+    expect(api.getToken()).toBe("tok");
+  });
+
+  it("un código incorrecto lanza el error en español y no deja token", async () => {
+    const { api, endpoints } = setup(() => json(400, { error: { code: "INVALID_CODE", message: "x" } }));
+    await expect(endpoints.auth.verifyEmail({ email: "a@b.co", code: "000000" })).rejects.toMatchObject({
+      code: "INVALID_CODE",
+      message: "Código incorrecto o vencido. Revisa tu correo o pide uno nuevo.",
+    });
+    expect(api.getToken()).toBeNull();
+  });
+
+  it("resendCode, forgotPassword y resetPassword envían lo suyo, sin token, y no devuelven nada", async () => {
+    const { api, endpoints, fetchMock } = setup(() => json(202, { ok: true }));
+    api.setToken("tok");
+    await expect(endpoints.auth.resendCode("ash@example.com")).resolves.toBeUndefined();
+    expect(lastCall(fetchMock)).toEqual({ url: "/auth/verification/resend", method: "POST", body: { email: "ash@example.com" } });
+    expect(headersOf(fetchMock).Authorization).toBeUndefined();
+
+    await expect(endpoints.auth.forgotPassword("ash@example.com")).resolves.toBeUndefined();
+    expect(lastCall(fetchMock)).toEqual({ url: "/auth/password/forgot", method: "POST", body: { email: "ash@example.com" } });
+    expect(headersOf(fetchMock).Authorization).toBeUndefined();
+  });
+
+  it("resetPassword acepta el 204 sin cuerpo", async () => {
+    const { endpoints, fetchMock } = setup(() => json(204));
+    await expect(endpoints.auth.resetPassword({ email: "ash@example.com", code: "123456", password: "nueva-clave-1" })).resolves.toBeUndefined();
+    expect(lastCall(fetchMock)).toEqual({
+      url: "/auth/password/reset",
+      method: "POST",
+      body: { email: "ash@example.com", code: "123456", password: "nueva-clave-1" },
+    });
+  });
+
+  it("un 429 del reenvío dice cuánto esperar", async () => {
+    const { endpoints } = setup(() => json(429, { error: { code: "RATE_LIMITED", message: "x", details: { retryAfterSeconds: 42 } } }));
+    await expect(endpoints.auth.resendCode("ash@example.com")).rejects.toMatchObject({
+      code: "RATE_LIMITED",
+      message: "Demasiados intentos. Inténtalo de nuevo en 42 s.",
+    });
+  });
+});
+
 describe("endpoints de salas", () => {
   it("create envía la configuración y devuelve el código", async () => {
     const { endpoints, fetchMock } = setup(() => json(201, { code: "ABC234" }));
```

`client/test/session/session-store.test.ts`:

```diff
diff --git a/client/test/session/session-store.test.ts b/client/test/session/session-store.test.ts
index 5c6ac4a..ab6323b 100644
--- a/client/test/session/session-store.test.ts
+++ b/client/test/session/session-store.test.ts
@@ -58,12 +58,36 @@ describe("sesión", () => {
       expect(store.getState().user).toBeNull();
     });
 
-    it("register deja al usuario autenticado", async () => {
+    it("register deja al usuario autenticado y no pide verificar nada", async () => {
       const { store, endpoints } = setup();
-      await store.getState().register({ email: "ash@example.com", username: "ash", password: "pikachu-123" });
+      await expect(store.getState().register({ email: "ash@example.com", username: "ash", password: "pikachu-123" })).resolves.toBeNull();
       expect(endpoints.auth.register).toHaveBeenCalledTimes(1);
       expect(store.getState().user).toEqual(ASH);
     });
+
+    it("con la verificación activa register deja la cuenta pendiente: devuelve el correo y no abre la sesión", async () => {
+      const { store, endpoints } = setup();
+      vi.mocked(endpoints.auth.register).mockResolvedValueOnce({ verification: "required", email: "ash@example.com" });
+      await expect(store.getState().register({ email: "ash@example.com", username: "ash", password: "pikachu-123" })).resolves.toEqual({
+        verification: "required",
+        email: "ash@example.com",
+      });
+      expect(store.getState()).toMatchObject({ status: "loading", user: null });
+    });
+
+    it("verifyEmail abre la sesión con el código", async () => {
+      const { store, endpoints } = setup();
+      await store.getState().verifyEmail({ email: "ash@example.com", code: "123456" });
+      expect(endpoints.auth.verifyEmail).toHaveBeenCalledWith({ email: "ash@example.com", code: "123456" });
+      expect(store.getState()).toMatchObject({ status: "authenticated", user: ASH });
+    });
+
+    it("un código incorrecto lanza el error y no cambia el estado", async () => {
+      const { store, endpoints } = setup();
+      vi.mocked(endpoints.auth.verifyEmail).mockRejectedValueOnce(new ApiError(400, "INVALID_CODE"));
+      await expect(store.getState().verifyEmail({ email: "ash@example.com", code: "000000" })).rejects.toMatchObject({ code: "INVALID_CODE" });
+      expect(store.getState()).toMatchObject({ status: "loading", user: null });
+    });
   });
 
   describe("logout y expiración", () => {
```

`client/test/session/auth-options.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useEmailVerification } from "../../src/session/auth-options";
import { fakeServices, renderWithServices } from "../helpers/services";

function Probe({ name = "sonda" }: { name?: string }) {
  return <p>{`${name}: ${useEmailVerification() ? "activa" : "apagada"}`}</p>;
}

describe("useEmailVerification", () => {
  it("empieza como apagada (todo como antes) y pasa a activa cuando el servidor lo dice", async () => {
    const services = fakeServices();
    vi.mocked(services.endpoints.auth.options).mockResolvedValue({ emailVerification: true });
    renderWithServices(<Probe />, { services });
    expect(screen.getByText("sonda: apagada")).toBeInTheDocument();
    expect(await screen.findByText("sonda: activa")).toBeInTheDocument();
  });

  it("si el servidor dice que está apagada, sigue apagada", async () => {
    const services = fakeServices();
    renderWithServices(<Probe />, { services });
    await waitFor(() => expect(services.endpoints.auth.options).toHaveBeenCalled());
    expect(screen.getByText("sonda: apagada")).toBeInTheDocument();
  });

  it("si la consulta falla se queda apagada, sin romper la pantalla, y la próxima vez se vuelve a preguntar", async () => {
    const services = fakeServices();
    vi.mocked(services.endpoints.auth.options).mockRejectedValueOnce(new Error("sin red"));
    const first = renderWithServices(<Probe />, { services });
    await waitFor(() => expect(services.endpoints.auth.options).toHaveBeenCalledTimes(1));
    expect(screen.getByText("sonda: apagada")).toBeInTheDocument();
    first.unmount();

    vi.mocked(services.endpoints.auth.options).mockResolvedValueOnce({ emailVerification: true });
    renderWithServices(<Probe />, { services });
    expect(await screen.findByText("sonda: activa")).toBeInTheDocument();
    expect(services.endpoints.auth.options).toHaveBeenCalledTimes(2);
  });

  it("varias pantallas a la vez preguntan una sola vez", async () => {
    const services = fakeServices();
    vi.mocked(services.endpoints.auth.options).mockResolvedValue({ emailVerification: true });
    renderWithServices(
      <>
        <Probe name="uno" />
        <Probe name="dos" />
      </>,
      { services },
    );
    expect(await screen.findByText("uno: activa")).toBeInTheDocument();
    expect(await screen.findByText("dos: activa")).toBeInTheDocument();
    expect(services.endpoints.auth.options).toHaveBeenCalledTimes(1);
  });

  it("no hace falta que haya una sesión: se pregunta también a quien aún no entró", async () => {
    const services = fakeServices();
    expect(services.session.getState().status).toBe("loading");
    renderWithServices(<Probe />, { services });
    await waitFor(() => expect(services.endpoints.auth.options).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
cd client && npx vitest run test/api test/session
```

Expected: FAIL — faltan las llamadas nuevas, `verifyEmail` en el almacén y el módulo `auth-options`.

- [ ] **Step 3: Implementar**

`client/src/api/types.ts`:

```diff
diff --git a/client/src/api/types.ts b/client/src/api/types.ts
index 342205c..28698a2 100644
--- a/client/src/api/types.ts
+++ b/client/src/api/types.ts
@@ -15,6 +15,12 @@ export interface AuthSession {
   accessToken: string;
 }
 
+/** La respuesta de registrarse con la verificación por correo activa: la cuenta queda pendiente y llega un código. */
+export interface VerificationRequired {
+  verification: "required";
+  email: string;
+}
+
 export interface PokemonName {
   id: number;
   es: string;
```

`client/src/api/endpoints.ts`:

```diff
diff --git a/client/src/api/endpoints.ts b/client/src/api/endpoints.ts
index dcf66b3..5a4c0ab 100644
--- a/client/src/api/endpoints.ts
+++ b/client/src/api/endpoints.ts
@@ -8,7 +8,7 @@ import type {
   ThemePreferences,
 } from "@pokemon-minigames/shared";
 import type { ApiClient } from "./client";
-import type { AuthSession, PokemonName } from "./types";
+import type { AuthSession, PokemonName, VerificationRequired } from "./types";
 
 export interface Credentials {
   email: string;
@@ -19,6 +19,17 @@ export interface Registration extends Credentials {
   username: string;
 }
 
+export interface VerifyEmailInput {
+  email: string;
+  code: string;
+}
+
+export interface ResetPasswordInput {
+  email: string;
+  code: string;
+  password: string;
+}
+
 export interface CurrentRoom {
   code: string;
   phase: GamePhase;
@@ -27,8 +38,19 @@ export interface CurrentRoom {
 /** Todas las llamadas al servidor que usa la interfaz, agrupadas por tema. */
 export interface Endpoints {
   auth: {
-    register(input: Registration): Promise<AuthSession>;
+    /** Con la verificación activa la cuenta queda pendiente y no hay sesión: llega un código por correo. */
+    register(input: Registration): Promise<AuthSession | VerificationRequired>;
     login(input: Credentials): Promise<AuthSession>;
+    /** ¿Verifica el servidor el correo de las cuentas nuevas? (de ello depende, p. ej., el enlace «olvidé mi contraseña»). */
+    options(): Promise<{ emailVerification: boolean }>;
+    /** Verifica el correo con el código que llegó y abre la sesión. */
+    verifyEmail(input: VerifyEmailInput): Promise<AuthSession>;
+    /** Pide otro código de verificación (el servidor contesta lo mismo exista o no la cuenta). */
+    resendCode(email: string): Promise<void>;
+    /** Pide el código para cambiar la contraseña (el servidor contesta lo mismo exista o no la cuenta). */
+    forgotPassword(email: string): Promise<void>;
+    /** Cambia la contraseña con el código; no abre sesión. */
+    resetPassword(input: ResetPasswordInput): Promise<void>;
     /** Renueva la sesión con la cookie de refresco; `null` si no hay sesión. */
     refresh(): Promise<AuthSession | null>;
     logout(): Promise<void>;
@@ -64,8 +86,23 @@ export function createEndpoints(api: ApiClient): Endpoints {
 
   return {
     auth: {
-      register: (input) => startSession("/auth/register", input),
+      async register(input) {
+        const result = await api.request<AuthSession | VerificationRequired>("POST", "/auth/register", { body: input, auth: false });
+        if ("accessToken" in result) api.setToken(result.accessToken);
+        return result;
+      },
       login: (input) => startSession("/auth/login", input),
+      options: () => api.request<{ emailVerification: boolean }>("GET", "/auth/options", { auth: false }),
+      verifyEmail: (input) => startSession("/auth/verify-email", input),
+      async resendCode(email) {
+        await api.request<unknown>("POST", "/auth/verification/resend", { body: { email }, auth: false });
+      },
+      async forgotPassword(email) {
+        await api.request<unknown>("POST", "/auth/password/forgot", { body: { email }, auth: false });
+      },
+      async resetPassword(input) {
+        await api.request<unknown>("POST", "/auth/password/reset", { body: input, auth: false });
+      },
       refresh: () => api.refreshSession(),
       async logout() {
         try {
```

`client/src/session/session-store.ts`:

```diff
diff --git a/client/src/session/session-store.ts b/client/src/session/session-store.ts
index 29ffa64..0cf6527 100644
--- a/client/src/session/session-store.ts
+++ b/client/src/session/session-store.ts
@@ -1,6 +1,6 @@
 import { type StoreApi, createStore } from "zustand";
-import type { Credentials, Endpoints, Registration } from "../api/endpoints";
-import type { AuthUser } from "../api/types";
+import type { Credentials, Endpoints, Registration, VerifyEmailInput } from "../api/endpoints";
+import type { AuthUser, VerificationRequired } from "../api/types";
 
 export type SessionStatus = "loading" | "authenticated" | "anonymous";
 
@@ -10,7 +10,10 @@ export interface SessionState {
   /** Al cargar la aplicación: intenta recuperar la sesión con la cookie de refresco. Solo corre una vez. */
   bootstrap(): Promise<void>;
   login(credentials: Credentials): Promise<void>;
-  register(registration: Registration): Promise<void>;
+  /** Abre la sesión (y devuelve `null`) o, con la verificación activa, deja la cuenta pendiente y devuelve el correo al que llegó el código. */
+  register(registration: Registration): Promise<VerificationRequired | null>;
+  /** Verifica el correo con el código que llegó y abre la sesión. */
+  verifyEmail(input: VerifyEmailInput): Promise<void>;
   logout(): Promise<void>;
   /** La sesión se perdió (no se pudo renovar): hay que volver a iniciar sesión. */
   expire(): void;
@@ -37,7 +40,14 @@ export function createSessionStore(endpoints: Endpoints): StoreApi<SessionState>
     },
 
     async register(registration) {
-      const session = await endpoints.auth.register(registration);
+      const result = await endpoints.auth.register(registration);
+      if ("verification" in result) return result;
+      set({ status: "authenticated", user: result.user });
+      return null;
+    },
+
+    async verifyEmail(input) {
+      const session = await endpoints.auth.verifyEmail(input);
       set({ status: "authenticated", user: session.user });
     },
```

`client/src/session/auth-options.ts`:

```ts
import { useEffect, useState } from "react";
import type { Endpoints } from "../api/endpoints";
import { useServices } from "../services";

/** Una consulta por conjunto de servicios: las pantallas de acceso no la repiten al cambiar de una a otra. */
const asked = new WeakMap<Endpoints, Promise<boolean>>();

/**
 * ¿Verifica el servidor el correo de las cuentas? Mientras no se sabe (o si la consulta falla) es `false`: la aplicación se
 * comporta como antes y no ofrece, por ejemplo, «¿Olvidaste tu contraseña?». Una consulta fallida no se recuerda.
 */
export function useEmailVerification(): boolean {
  const { endpoints } = useServices();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let alive = true;
    let answer = asked.get(endpoints);
    if (!answer) {
      answer = endpoints.auth.options().then(
        (options) => options.emailVerification,
        () => {
          asked.delete(endpoints);
          return false;
        },
      );
      asked.set(endpoints, answer);
    }
    void answer.then((value) => {
      if (alive) setEnabled(value);
    });
    return () => {
      alive = false;
    };
  }, [endpoints]);

  return enabled;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
cd client && npx vitest run --testTimeout=30000
cd .. && npm run typecheck
```

Expected: PASS (cliente: **688 pruebas**) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): llamadas de verificar, reenviar, olvidé y restablecer, y la consulta de si la verificación está activa" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Cliente — «Verifica tu correo»

**Files:**
- Modify: `client/src/pages/AuthForm.tsx`, `client/src/pages/AuthPages.tsx`, `client/src/pages/auth-validation.ts`, `client/src/routes.tsx`
- Create: `client/src/components/CodeField.tsx`, `client/src/pages/AuthLayout.tsx`, `client/src/pages/AuthCard.tsx`, `client/src/pages/VerifyEmailPage.tsx`, `client/src/pages/use-cooldown.ts`
- Test: `client/test/pages/verify-email.test.tsx`; `client/test/pages/routes.test.tsx` (modificar)

**Interfaces:**
- Consumes: `session.verifyEmail`, `session.register` y `endpoints.auth.resendCode` (Task 9), `ApiError` y los mensajes de la Task 1, y los componentes del rediseño (`Card`, `TextField`, `Button`, `Notice`, `rise`).
- Produces:
  - `CodeField({ value, onChange(code), error?, autoFocus? })` y `digitsOnly(value)`: campo «Código» con teclado numérico, `autocomplete="one-time-code"` y sin `maxLength`; solo deja dígitos (como mucho 6), también al pegar «123 456» o «123-456».
  - `useCooldown(initialSeconds = 0): { remaining: number; start(seconds = 60): void }` — cuenta atrás calculada con la hora (no se atrasa en una pestaña en segundo plano); sin cuenta en marcha no hay temporizador.
  - `AuthLayout({ children })` (el lema a un lado y el formulario al otro) y `AuthCard({ title, children, footer? })`, que `AuthForm` reutiliza.
  - `VerifyEmailPage`: lee `{ email?, notice?, returnTo? }` del estado del router; con el correo, «Te enviamos un código de 6 dígitos a {correo}. Escríbelo aquí.»; sin él (se recargó la página) pide el correo además del código. «Verificar» abre la sesión y lleva a `returnTo ?? "/"`; «Reenviar código» espera 60 s tras cada envío («espera N s», sin anunciarse cada segundo); «Usar otro correo» vuelve al registro.
  - `validateEmail(email)` y `validateVerification({ email, code })` en `auth-validation.ts`.
  - `RegisterPage` lleva a `/verificar` con `{ email }` cuando el servidor pide verificar; `LoginPage`, ante `EMAIL_NOT_VERIFIED`, a `/verificar` con `{ email, notice: "Tu correo aún no está verificado. Te enviamos un código.", returnTo }`.
  - Ruta pública `/verificar` (con sesión lleva al lobby).

- [ ] **Step 1: Escribir las pruebas que fallan**

`client/test/pages/verify-email.test.tsx` (el campo del código y su pegado, la validación, la cuenta atrás, la pantalla: correo conocido y perdido, verificar y volver a donde se iba, código incorrecto y espera del servidor, no enviar dos veces, el reenvío con su espera, y cómo el registro y el login llevan hasta ella):

```tsx
import { act, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/client";
import { CodeField, digitsOnly } from "../../src/components/CodeField";
import { LoginPage, RegisterPage } from "../../src/pages/AuthPages";
import { VerifyEmailPage } from "../../src/pages/VerifyEmailPage";
import { validateVerification } from "../../src/pages/auth-validation";
import { useCooldown } from "../../src/pages/use-cooldown";
import { ASH, fakeServices, renderRoute } from "../helpers/services";

/** Solo el reloj y los intervalos: con setTimeout simulado, findBy* de Testing Library no avanzaría nunca. */
const FAKE: { toFake: ("setInterval" | "clearInterval" | "Date")[] } = { toFake: ["setInterval", "clearInterval", "Date"] };

afterEach(() => vi.useRealTimers());

describe("digitsOnly", () => {
  it("deja solo los dígitos, como mucho seis, también al pegar con espacios o guiones", () => {
    expect(digitsOnly("123456")).toBe("123456");
    expect(digitsOnly("123 456")).toBe("123456");
    expect(digitsOnly("123-456")).toBe("123456");
    expect(digitsOnly("12a3b4")).toBe("1234");
    expect(digitsOnly("1234567890")).toBe("123456");
    expect(digitsOnly(" código: 048213 ")).toBe("048213");
    expect(digitsOnly("")).toBe("");
  });
});

describe("CodeField", () => {
  it("es un campo numérico que el navegador y el teléfono reconocen como código de un solo uso", () => {
    renderRoute("/x", <CodeField value="" onChange={() => {}} />, { route: "/x" });
    const field = screen.getByLabelText("Código");
    expect(field).toHaveAttribute("inputmode", "numeric");
    expect(field).toHaveAttribute("autocomplete", "one-time-code");
    // Sin maxlength: pegar «123 456» (7 caracteres) no debe cortarse antes de limpiarlo.
    expect(field).not.toHaveAttribute("maxlength");
  });

  it("al escribir o pegar entrega solo los dígitos", async () => {
    const onChange = vi.fn();
    renderRoute("/x", <CodeField value="" onChange={onChange} />, { route: "/x" });
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Código"));
    await user.paste("123 456");
    expect(onChange).toHaveBeenLastCalledWith("123456");
  });
});

describe("validateVerification", () => {
  it("pide un email válido y un código de seis dígitos", () => {
    expect(validateVerification({ email: "ash@example.com", code: "123456" })).toEqual({});
    expect(validateVerification({ email: "ash", code: "12345" })).toEqual({
      email: "Escribe un email válido.",
      code: "El código son 6 dígitos.",
    });
    expect(validateVerification({ email: "ash@example.com", code: "" }).code).toBe("El código son 6 dígitos.");
  });
});

describe("useCooldown", () => {
  it("empieza en 0, cuenta hacia atrás de segundo en segundo al arrancarla y se puede reiniciar", () => {
    vi.useFakeTimers(FAKE);
    const { result } = renderHook(() => useCooldown());
    expect(result.current.remaining).toBe(0);

    act(() => result.current.start(3));
    expect(result.current.remaining).toBe(3);
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current.remaining).toBe(2);
    act(() => void vi.advanceTimersByTime(2000));
    expect(result.current.remaining).toBe(0);

    act(() => result.current.start(60));
    expect(result.current.remaining).toBe(60);
    act(() => void vi.advanceTimersByTime(10_000));
    expect(result.current.remaining).toBe(50);
    act(() => result.current.start(5));
    expect(result.current.remaining).toBe(5);
  });

  it("puede empezar ya en marcha", () => {
    vi.useFakeTimers(FAKE);
    const { result } = renderHook(() => useCooldown(60));
    expect(result.current.remaining).toBe(60);
  });

  it("no deja temporizadores vivos: ni al terminar ni al desmontarse", () => {
    vi.useFakeTimers(FAKE);
    const { result, unmount } = renderHook(() => useCooldown());
    act(() => result.current.start(2));
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    act(() => void vi.advanceTimersByTime(2000));
    expect(vi.getTimerCount()).toBe(0);

    act(() => result.current.start(30));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

type Services = ReturnType<typeof fakeServices>;

function renderVerify(
  state: { email?: string; notice?: string; returnTo?: string } | null = { email: "ash@example.com" },
  services: Services = fakeServices(),
) {
  const route = state === null ? "/verificar" : { pathname: "/verificar", state };
  const utils = renderRoute("/verificar", <VerifyEmailPage />, { services, route });
  return { user: userEvent.setup(), ...utils };
}

describe("pantalla «Verifica tu correo»", () => {
  it("dice a qué correo llegó el código y tiene el campo, el botón, el reenvío y la salida para usar otro correo", () => {
    renderVerify();
    expect(screen.getByRole("heading", { name: "Verifica tu correo" })).toBeInTheDocument();
    expect(screen.getByText("Te enviamos un código de 6 dígitos a ash@example.com. Escríbelo aquí.")).toBeInTheDocument();
    expect(screen.getByLabelText("Código")).toHaveFocus();
    expect(screen.getByRole("button", { name: "Verificar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Usar otro correo" })).toHaveAttribute("href", "/registro");
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("muestra el aviso que trae la pantalla de la que se viene (entrar sin haber verificado)", () => {
    renderVerify({ email: "ash@example.com", notice: "Tu correo aún no está verificado. Te enviamos un código." });
    expect(screen.getByRole("status")).toHaveTextContent("Tu correo aún no está verificado. Te enviamos un código.");
  });

  it("sin el correo (se recargó la página) lo pide además del código", async () => {
    const { services, user } = renderVerify(null);
    expect(screen.getByText("Escribe tu correo y el código de 6 dígitos que te enviamos.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.type(screen.getByLabelText("Código"), "123456");
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    await waitFor(() => expect(services.endpoints.auth.verifyEmail).toHaveBeenCalledWith({ email: "ash@example.com", code: "123456" }));
  });

  it("verifica con el código, abre la sesión y va al lobby", async () => {
    const { services, user } = renderVerify();
    await user.type(screen.getByLabelText("Código"), "123456");
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/"));
    expect(services.endpoints.auth.verifyEmail).toHaveBeenCalledWith({ email: "ash@example.com", code: "123456" });
    expect(services.session.getState()).toMatchObject({ status: "authenticated", user: ASH });
  });

  it("si se venía de una pantalla que pedía sesión (una sala, por ejemplo), tras verificar vuelve a ella", async () => {
    const { user } = renderVerify({ email: "ash@example.com", returnTo: "/sala/ABC234" });
    await user.type(screen.getByLabelText("Código"), "123456");
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/sala/ABC234"));
  });

  it("pegar «123 456» deja 123456 en el campo", async () => {
    const { user } = renderVerify();
    await user.click(screen.getByLabelText("Código"));
    await user.paste("123 456");
    expect(screen.getByLabelText("Código")).toHaveValue("123456");
  });

  it("con un código incompleto marca el campo y no llama al servidor", async () => {
    const { services, user } = renderVerify();
    await user.type(screen.getByLabelText("Código"), "123");
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("El código son 6 dígitos.");
    expect(screen.getByLabelText("Código")).toHaveAttribute("aria-invalid", "true");
    expect(services.endpoints.auth.verifyEmail).not.toHaveBeenCalled();
  });

  it("un código incorrecto se explica en español y se puede reintentar", async () => {
    const { services, user } = renderVerify();
    vi.mocked(services.endpoints.auth.verifyEmail).mockRejectedValueOnce(new ApiError(400, "INVALID_CODE"));
    await user.type(screen.getByLabelText("Código"), "000000");
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Código incorrecto o vencido. Revisa tu correo o pide uno nuevo.");
    expect(screen.getByRole("button", { name: "Verificar" })).toBeEnabled();
    expect(screen.getByTestId("location")).toHaveTextContent("/verificar");
  });

  it("si el servidor pide esperar lo dice con los segundos", async () => {
    const { services, user } = renderVerify();
    vi.mocked(services.endpoints.auth.verifyEmail).mockRejectedValueOnce(new ApiError(429, "RATE_LIMITED", { retryAfterSeconds: 90 }));
    await user.type(screen.getByLabelText("Código"), "123456");
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Demasiados intentos. Inténtalo de nuevo en 2 min.");
  });

  it("mientras envía no permite enviar dos veces", async () => {
    const { services, user } = renderVerify();
    let release!: () => void;
    vi.mocked(services.endpoints.auth.verifyEmail).mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve({ user: ASH, accessToken: "t" }))),
    );
    await user.type(screen.getByLabelText("Código"), "123456");
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    expect(screen.getByRole("button", { name: "Verificar" })).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(services.endpoints.auth.verifyEmail).toHaveBeenCalledTimes(1);
    release();
  });
});

describe("reenviar el código", () => {
  function renderWithClock(state: { email?: string } | null = { email: "ash@example.com" }) {
    vi.useFakeTimers(FAKE);
    const services = fakeServices();
    const utils = renderRoute("/verificar", <VerifyEmailPage />, { services, route: state === null ? "/verificar" : { pathname: "/verificar", state } });
    return { ...utils, services, user: userEvent.setup() };
  }

  it("al llegar desde el registro ya se envió un código: el botón espera 60 s y luego se activa", async () => {
    renderWithClock();
    const button = screen.getByRole("button", { name: /Reenviar código/ });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Reenviar código (espera 60 s)");
    act(() => void vi.advanceTimersByTime(30_000));
    expect(screen.getByRole("button", { name: /Reenviar código/ })).toHaveTextContent("espera 30 s");
    act(() => void vi.advanceTimersByTime(30_000));
    expect(screen.getByRole("button", { name: "Reenviar código" })).toBeEnabled();
  });

  it("al reenviar pide el código para ese correo, lo avisa y vuelve a esperar", async () => {
    const { services, user } = renderWithClock();
    act(() => void vi.advanceTimersByTime(60_000));
    await user.click(screen.getByRole("button", { name: "Reenviar código" }));
    expect(services.endpoints.auth.resendCode).toHaveBeenCalledWith("ash@example.com");
    expect(await screen.findByRole("status")).toHaveTextContent("Te enviamos un código nuevo a ash@example.com.");
    expect(screen.getByRole("button", { name: /Reenviar código/ })).toBeDisabled();
  });

  it("si el servidor pide esperar lo dice (y no dispara dos peticiones)", async () => {
    const { services, user } = renderWithClock();
    act(() => void vi.advanceTimersByTime(60_000));
    vi.mocked(services.endpoints.auth.resendCode).mockRejectedValueOnce(new ApiError(429, "RATE_LIMITED", { retryAfterSeconds: 40 }));
    await user.click(screen.getByRole("button", { name: "Reenviar código" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Demasiados intentos. Inténtalo de nuevo en 40 s.");
    expect(services.endpoints.auth.resendCode).toHaveBeenCalledTimes(1);
  });

  it("sin el correo (se recargó la página) el reenvío está disponible y pide el correo escrito", async () => {
    const { services, user } = renderWithClock(null);
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.click(screen.getByRole("button", { name: "Reenviar código" }));
    expect(services.endpoints.auth.resendCode).toHaveBeenCalledWith("ash@example.com");
  });

  it("sin correo escrito no reenvía y lo dice", async () => {
    const { services, user } = renderWithClock(null);
    await user.click(screen.getByRole("button", { name: "Reenviar código" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Escribe un email válido.");
    expect(services.endpoints.auth.resendCode).not.toHaveBeenCalled();
  });
});

describe("el registro y el inicio de sesión llevan a verificar", () => {
  it("registrarse con la verificación activa lleva a /verificar con el correo, sin abrir sesión", async () => {
    const services = fakeServices();
    vi.mocked(services.endpoints.auth.register).mockResolvedValueOnce({ verification: "required", email: "ash@example.com" });
    renderRoute("/registro", <RegisterPage />, { services, route: "/registro" });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.type(screen.getByLabelText("Nombre de usuario"), "ash");
    await user.type(screen.getByLabelText("Contraseña"), "pikachu-123");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/verificar"));
    expect(JSON.parse(screen.getByTestId("location").dataset.state!)).toEqual({ email: "ash@example.com" });
    expect(services.session.getState().status).toBe("loading");
  });

  it("entrar sin haber verificado lleva a /verificar con el correo y el aviso", async () => {
    const services = fakeServices();
    vi.mocked(services.endpoints.auth.login).mockRejectedValueOnce(new ApiError(403, "EMAIL_NOT_VERIFIED"));
    renderRoute("/login", <LoginPage />, { services, route: "/login" });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "pikachu-123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/verificar"));
    expect(JSON.parse(screen.getByTestId("location").dataset.state!)).toEqual({
      email: "ash@example.com",
      notice: "Tu correo aún no está verificado. Te enviamos un código.",
      returnTo: "/",
    });
  });

  it("entrar sin haber verificado desde una pantalla que pedía sesión recuerda a dónde se iba", async () => {
    const services = fakeServices();
    vi.mocked(services.endpoints.auth.login).mockRejectedValueOnce(new ApiError(403, "EMAIL_NOT_VERIFIED"));
    renderRoute("/login", <LoginPage />, {
      services,
      route: { pathname: "/login", state: { from: { pathname: "/sala/ABC234" } } },
    });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "pikachu-123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/verificar"));
    expect(JSON.parse(screen.getByTestId("location").dataset.state!)).toMatchObject({ email: "ash@example.com", returnTo: "/sala/ABC234" });
  });

  it("los demás errores del login se siguen mostrando en el formulario", async () => {
    const services = fakeServices();
    vi.mocked(services.endpoints.auth.login).mockRejectedValueOnce(new ApiError(401, "INVALID_CREDENTIALS"));
    renderRoute("/login", <LoginPage />, { services, route: "/login" });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "mala");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email o contraseña incorrectos.");
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
  });
});
```

`client/test/pages/routes.test.tsx` (`/verificar` es pública; con sesión lleva al lobby):

```diff
diff --git a/client/test/pages/routes.test.tsx b/client/test/pages/routes.test.tsx
index 1b77df3..60c51d3 100644
--- a/client/test/pages/routes.test.tsx
+++ b/client/test/pages/routes.test.tsx
@@ -37,6 +37,19 @@ describe("rutas del perfil", () => {
   });
 });
 
+describe("rutas de las cuentas con código por correo", () => {
+  it("/verificar es pública: quien no ha entrado ve la pantalla de verificación", async () => {
+    renderApp("/verificar", (s) => s.session.setState({ status: "anonymous", user: null }));
+    expect(await screen.findByRole("heading", { name: "Verifica tu correo" })).toBeInTheDocument();
+  });
+
+  it("con sesión, /verificar lleva al lobby (como el login)", async () => {
+    renderApp("/verificar", (s) => signIn(s));
+    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/"));
+    expect(screen.queryByRole("heading", { name: "Verifica tu correo" })).not.toBeInTheDocument();
+  });
+});
+
 describe("guardas de ruta", () => {
   it("mientras se recupera la sesión muestra una pantalla de carga, no el formulario", () => {
     renderApp("/");
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
cd client && npx vitest run test/pages/verify-email.test.tsx test/pages/routes.test.tsx
```

Expected: FAIL — faltan `CodeField`, `useCooldown`, `VerifyEmailPage`, la validación y la ruta.

- [ ] **Step 3: Implementar**

`client/src/components/CodeField.tsx`:

```tsx
import { TextField } from "./TextField";

/** Deja solo los dígitos y como mucho seis, también al pegar «123 456» o «123-456». */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

export interface CodeFieldProps {
  value: string;
  onChange(code: string): void;
  error?: string | null;
  autoFocus?: boolean;
}

/**
 * El código de seis dígitos que llega por correo: teclado numérico y `one-time-code` para que el navegador o el teléfono
 * lo propongan. No lleva `maxLength`: pegar «123 456» (siete caracteres) se cortaría antes de poder limpiarlo.
 */
export function CodeField({ value, onChange, error, autoFocus }: CodeFieldProps) {
  return (
    <TextField
      label="Código"
      value={value}
      onChange={(event) => onChange(digitsOnly(event.target.value))}
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="000000"
      inputClassName="font-num text-center text-2xl tracking-[0.3em]"
      autoFocus={autoFocus}
      error={error}
    />
  );
}
```

`client/src/pages/use-cooldown.ts`:

```ts
import { useCallback, useEffect, useState } from "react";

/**
 * Una cuenta atrás de segundos enteros (p. ej. la espera entre dos códigos). Se calcula a partir de la hora, no de contar
 * ticks, así que no se atrasa si la pestaña estuvo en segundo plano. Sin cuenta en marcha no hay ningún temporizador.
 */
export function useCooldown(initialSeconds = 0): { remaining: number; start(seconds?: number): void } {
  const [endsAt, setEndsAt] = useState(() => (initialSeconds > 0 ? Date.now() + initialSeconds * 1000 : 0));
  const [, setTick] = useState(0);
  const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  const running = remaining > 0;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => clearInterval(timer);
  }, [running, endsAt]);

  const start = useCallback((seconds = 60) => setEndsAt(Date.now() + seconds * 1000), []);
  return { remaining, start };
}
```

`client/src/pages/AuthLayout.tsx` y `client/src/pages/AuthCard.tsx` (la estructura de las pantallas de acceso, que antes vivía dentro de `AuthForm`):

```tsx
import type { ReactNode } from "react";
import { AuthHero } from "./AuthHero";

/** El lema y la explicación a un lado y el formulario al otro (uno encima del otro en pantallas estrechas). */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-4xl grid-cols-1 items-center gap-8 md:grid-cols-2 md:gap-12">
      <AuthHero />
      {children}
    </div>
  );
}
```

```tsx
import type { ReactNode } from "react";
import { Card } from "../components/Card";
import { rise } from "../components/rise";

/** La tarjeta de las pantallas de acceso: título, contenido y, abajo, un pie con enlaces. */
export function AuthCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <Card as="section" tone="raised" style={rise(1)} className="animate-rise mx-auto w-full max-w-sm p-6">
      <h1 className="mb-5 font-display text-2xl font-semibold">{title}</h1>
      {children}
      {footer ? <p className="mt-5 border-t-(length:--frame) border-line pt-4 text-sm text-muted">{footer}</p> : null}
    </Card>
  );
}
```

`client/src/pages/AuthForm.tsx` (usa `AuthCard`):

```diff
diff --git a/client/src/pages/AuthForm.tsx b/client/src/pages/AuthForm.tsx
index 20e79be..5bdda60 100644
--- a/client/src/pages/AuthForm.tsx
+++ b/client/src/pages/AuthForm.tsx
@@ -1,11 +1,10 @@
 import { type FormEvent, type ReactNode, useState } from "react";
 import { ApiError } from "../api/client";
 import { Button } from "../components/Button";
-import { Card } from "../components/Card";
 import { Notice } from "../components/Notice";
-import { rise } from "../components/rise";
 import { TextField } from "../components/TextField";
 import { errorMessage, rateLimitMessage, retryAfterOf } from "../i18n/es";
+import { AuthCard } from "./AuthCard";
 import { type FieldErrors, serverFieldErrors } from "./auth-validation";
 
 export interface AuthFormProps {
@@ -56,8 +55,7 @@ export function AuthForm({ title, submitLabel, withUsername = false, validate, o
   }
 
   return (
-    <Card as="section" tone="raised" style={rise(1)} className="animate-rise mx-auto w-full max-w-sm p-6">
-      <h1 className="mb-5 font-display text-2xl font-semibold">{title}</h1>
+    <AuthCard title={title} footer={footer}>
       <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
         {formError ? <Notice tone="danger">{formError}</Notice> : null}
         <TextField
@@ -91,7 +89,6 @@ export function AuthForm({ title, submitLabel, withUsername = false, validate, o
           {submitLabel}
         </Button>
       </form>
-      <p className="mt-5 border-t-(length:--frame) border-line pt-4 text-sm text-muted">{footer}</p>
-    </Card>
+    </AuthCard>
   );
 }
```

`client/src/pages/auth-validation.ts`:

```diff
diff --git a/client/src/pages/auth-validation.ts b/client/src/pages/auth-validation.ts
index efa53be..e5afecf 100644
--- a/client/src/pages/auth-validation.ts
+++ b/client/src/pages/auth-validation.ts
@@ -23,6 +23,19 @@ export function validateLogin(input: { email: string; password: string }): Field
   return errors;
 }
 
+/** Solo el correo (para pedir un código). */
+export function validateEmail(email: string): { email?: string } {
+  const message = emailError(email);
+  return message ? { email: message } : {};
+}
+
+/** El correo y el código de seis dígitos que llegó. */
+export function validateVerification(input: { email: string; code: string }): { email?: string; code?: string } {
+  const errors: { email?: string; code?: string } = { ...validateEmail(input.email) };
+  if (!/^\d{6}$/.test(input.code)) errors.code = "El código son 6 dígitos.";
+  return errors;
+}
+
 export function validateRegistration(input: { email: string; username: string; password: string }): FieldErrors {
   const errors: FieldErrors = {};
   const email = emailError(input.email);
```

`client/src/pages/VerifyEmailPage.tsx`:

```tsx
import { type FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ApiError } from "../api/client";
import { Button } from "../components/Button";
import { CodeField } from "../components/CodeField";
import { Notice } from "../components/Notice";
import { TextField } from "../components/TextField";
import { errorMessage } from "../i18n/es";
import { useServices } from "../services";
import { AuthCard } from "./AuthCard";
import { AuthLayout } from "./AuthLayout";
import { validateEmail, validateVerification } from "./auth-validation";
import { useCooldown } from "./use-cooldown";

/** Lo que trae la pantalla de la que se viene (registro o login): el correo al que se envió el código y un aviso. */
interface VerifyState {
  email?: string;
  notice?: string;
  /** La pantalla que se intentaba abrir antes de pedir sesión (una sala, por ejemplo); por defecto, el lobby. */
  returnTo?: string;
}

/** El servidor deja un código nuevo por correo cada 60 s. */
const RESEND_SECONDS = 60;

const describe = (error: unknown): string => (error instanceof ApiError ? error.message : errorMessage(undefined));

/** Verificar el correo con el código de seis dígitos y abrir la sesión. */
export function VerifyEmailPage() {
  const { session, endpoints } = useServices();
  const navigate = useNavigate();
  const state = useLocation().state as VerifyState | null;
  // El correo viaja en el estado del router (nunca en la URL). Si se perdió (se recargó la página), se pide.
  const known = state?.email ?? "";
  const [email, setEmail] = useState(known);
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<{ email?: string; code?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(state?.notice ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  // Quien llega con el correo viene de que se le acaba de enviar un código: antes de pedir otro hay que esperar.
  const cooldown = useCooldown(known ? RESEND_SECONDS : 0);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    const clean = email.trim();
    const found = validateVerification({ email: clean, code });
    setErrors(found);
    setFormError(null);
    setInfo(null);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await session.getState().verifyEmail({ email: clean, code });
      navigate(state?.returnTo ?? "/", { replace: true });
    } catch (error) {
      setFormError(describe(error));
      setSubmitting(false);
    }
  }

  async function handleResend(): Promise<void> {
    if (cooldown.remaining > 0 || resending) return;
    const clean = email.trim();
    const found = validateEmail(clean);
    setErrors(found);
    setFormError(null);
    setInfo(null);
    if (found.email) return;

    setResending(true);
    try {
      await endpoints.auth.resendCode(clean);
      setInfo(`Te enviamos un código nuevo a ${clean}.`);
      cooldown.start(RESEND_SECONDS);
    } catch (error) {
      setFormError(describe(error));
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthLayout>
      <AuthCard
        title="Verifica tu correo"
        footer={
          <Link to="/registro" className="font-semibold text-accent underline">
            Usar otro correo
          </Link>
        }
      >
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {info ? <Notice>{info}</Notice> : null}
          {formError ? <Notice tone="danger">{formError}</Notice> : null}
          <p className="text-sm">
            {known ? `Te enviamos un código de 6 dígitos a ${known}. Escríbelo aquí.` : "Escribe tu correo y el código de 6 dígitos que te enviamos."}
          </p>
          {known ? null : (
            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setErrors((current) => ({ ...current, email: undefined }));
              }}
              error={errors.email}
            />
          )}
          <CodeField
            value={code}
            onChange={(next) => {
              setCode(next);
              setErrors((current) => ({ ...current, code: undefined }));
            }}
            error={errors.code}
            autoFocus={Boolean(known)}
          />
          <Button type="submit" variant="primary" size="lg" loading={submitting}>
            Verificar
          </Button>
          <Button type="button" disabled={cooldown.remaining > 0 || resending} onClick={() => void handleResend()}>
            {cooldown.remaining > 0 ? `Reenviar código (espera ${cooldown.remaining} s)` : "Reenviar código"}
          </Button>
        </form>
      </AuthCard>
    </AuthLayout>
  );
}
```

`client/src/pages/AuthPages.tsx` (el registro y el login llevan a verificar):

```diff
diff --git a/client/src/pages/AuthPages.tsx b/client/src/pages/AuthPages.tsx
index 7ea7802..4e4f1aa 100644
--- a/client/src/pages/AuthPages.tsx
+++ b/client/src/pages/AuthPages.tsx
@@ -1,8 +1,8 @@
-import type { ReactNode } from "react";
 import { Link, useLocation, useNavigate } from "react-router";
+import { ApiError } from "../api/client";
 import { useServices } from "../services";
 import { AuthForm } from "./AuthForm";
-import { AuthHero } from "./AuthHero";
+import { AuthLayout } from "./AuthLayout";
 import { validateLogin, validateRegistration } from "./auth-validation";
 
 /** A dónde volver tras iniciar sesión: la pantalla que se intentó abrir, o el lobby. */
@@ -11,16 +11,6 @@ function useReturnPath(): string {
   return state?.from?.pathname ?? "/";
 }
 
-/** El lema y la explicación a un lado y el formulario al otro (uno encima del otro en pantallas estrechas). */
-function AuthLayout({ children }: { children: ReactNode }) {
-  return (
-    <div className="mx-auto grid max-w-4xl grid-cols-1 items-center gap-8 md:grid-cols-2 md:gap-12">
-      <AuthHero />
-      {children}
-    </div>
-  );
-}
-
 export function LoginPage() {
   const { session } = useServices();
   const navigate = useNavigate();
@@ -33,8 +23,17 @@ export function LoginPage() {
         submitLabel="Entrar"
         validate={validateLogin}
         onSubmit={async ({ email, password }) => {
-          await session.getState().login({ email, password });
-          navigate(returnTo, { replace: true });
+          try {
+            await session.getState().login({ email, password });
+            navigate(returnTo, { replace: true });
+          } catch (error) {
+            // La contraseña era correcta pero falta verificar el correo (el servidor ya envió un código nuevo): a verificarlo.
+            if (error instanceof ApiError && error.code === "EMAIL_NOT_VERIFIED") {
+              navigate("/verificar", { state: { email, notice: "Tu correo aún no está verificado. Te enviamos un código.", returnTo } });
+              return;
+            }
+            throw error;
+          }
         }}
         footer={
           <>
@@ -61,7 +60,12 @@ export function RegisterPage() {
         withUsername
         validate={validateRegistration}
         onSubmit={async ({ email, username, password }) => {
-          await session.getState().register({ email, username, password });
+          const pending = await session.getState().register({ email, username, password });
+          // Con la verificación activa no hay sesión todavía: el código llegó por correo.
+          if (pending) {
+            navigate("/verificar", { state: { email: pending.email } });
+            return;
+          }
           navigate("/", { replace: true });
         }}
         footer={
```

`client/src/routes.tsx`:

```diff
diff --git a/client/src/routes.tsx b/client/src/routes.tsx
index 0a295ea..1cfb02f 100644
--- a/client/src/routes.tsx
+++ b/client/src/routes.tsx
@@ -4,6 +4,7 @@ import { useSession } from "./services";
 import { LoginPage, RegisterPage } from "./pages/AuthPages";
 import { LobbyPage } from "./pages/Lobby";
 import { ProfilePage } from "./pages/profile/ProfilePage";
+import { VerifyEmailPage } from "./pages/VerifyEmailPage";
 import { RoomPage } from "./pages/room/RoomPage";
 
 /** Rutas que exigen sesión: sin ella llevan a /login y, tras entrar, vuelven a donde se iba. */
@@ -29,6 +30,7 @@ export function AppRoutes() {
       <Route element={<PublicOnly />}>
         <Route path="/login" element={<LoginPage />} />
         <Route path="/registro" element={<RegisterPage />} />
+        <Route path="/verificar" element={<VerifyEmailPage />} />
       </Route>
       <Route element={<RequireAuth />}>
         <Route path="/" element={<LobbyPage />} />
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
cd client && npx vitest run --testTimeout=30000
cd .. && npm run typecheck
```

Expected: PASS (cliente: **716 pruebas**) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): pantalla «Verifica tu correo» (campo de código, reenvío con espera, registro y login que llevan a ella)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Cliente — «Olvidé mi contraseña» y «Nueva contraseña»

**Files:**
- Modify: `client/src/pages/AuthForm.tsx`, `client/src/pages/AuthPages.tsx`, `client/src/pages/VerifyEmailPage.tsx`, `client/src/pages/auth-validation.ts`, `client/src/routes.tsx`
- Create: `client/src/pages/PasswordRecoveryPages.tsx`, `client/src/pages/describe-error.ts`
- Test: `client/test/pages/password-recovery.test.tsx`; `client/test/pages/routes.test.tsx` (modificar)

**Interfaces:**
- Consumes: `endpoints.auth.forgotPassword` y `resetPassword` (Task 9), `useEmailVerification` (Task 9), y de la Task 10 `AuthLayout`, `AuthCard`, `CodeField`, `useCooldown`, `validateEmail`, `validateVerification`.
- Produces:
  - `describeError(error: unknown): string` (`pages/describe-error.ts`): el mensaje en español de un `ApiError` (el 429 ya dice cuánto esperar) o uno genérico; la pantalla de verificar pasa a usarlo.
  - `validateReset({ email, code, password }): { email?; code?; password? }` — las reglas de siempre (6 dígitos; contraseña de 8 caracteres a 72 bytes).
  - `ForgotPasswordPage` («Recupera tu contraseña»): pide el correo, llama a `forgotPassword` y **siempre** sigue a `/restablecer` con `{ email, notice: "Si existe una cuenta con ese correo, te enviamos un código." }` (salvo un error del servidor, como la espera de un 429).
  - `ResetPasswordPage` («Nueva contraseña»): código y contraseña nueva; al terminar, `resetPassword` y a `/login` con `{ notice: "Contraseña cambiada. Inicia sesión con la nueva." }`, **sin la contraseña en el estado**; sin el correo (se recargó) lo pide; «Reenviar código» con la espera de 60 s.
  - `AuthForm` acepta `notice?: string` (un aviso de éxito arriba) y `extra?: ReactNode` (justo bajo la contraseña); `LoginPage` ofrece «¿Olvidaste tu contraseña?» (enlace a `/olvide`) **solo** con la verificación activa y muestra el aviso que traiga `location.state.notice`.
  - Rutas públicas `/olvide` y `/restablecer` (con sesión llevan al lobby).

- [ ] **Step 1: Escribir las pruebas que fallan**

`client/test/pages/password-recovery.test.tsx` (la validación; «olvidé» siempre sigue a restablecer; restablecer con el correo conocido y perdido, errores de formato y del servidor, la contraseña que no viaja, el reenvío con su cuenta atrás; y el enlace y el aviso en el login):

```tsx
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/client";
import { LoginPage } from "../../src/pages/AuthPages";
import { ForgotPasswordPage, ResetPasswordPage } from "../../src/pages/PasswordRecoveryPages";
import { validateReset } from "../../src/pages/auth-validation";
import { fakeServices, renderRoute } from "../helpers/services";

afterEach(() => vi.useRealTimers());

/** Solo el reloj y los intervalos: con setTimeout simulado, findBy* de Testing Library no avanzaría nunca. */
const FAKE: { toFake: ("setInterval" | "clearInterval" | "Date")[] } = { toFake: ["setInterval", "clearInterval", "Date"] };

type Services = ReturnType<typeof fakeServices>;

describe("validateReset", () => {
  it("pide un email válido, un código de seis dígitos y una contraseña de 8 a 72 bytes", () => {
    expect(validateReset({ email: "ash@example.com", code: "123456", password: "nueva-clave-1" })).toEqual({});
    expect(validateReset({ email: "ash", code: "123", password: "corta" })).toEqual({
      email: "Escribe un email válido.",
      code: "El código son 6 dígitos.",
      password: "La contraseña debe tener al menos 8 caracteres.",
    });
    expect(validateReset({ email: "ash@example.com", code: "123456", password: "ñ".repeat(37) }).password).toContain("72 bytes");
  });
});

function renderForgot(services: Services = fakeServices()) {
  const utils = renderRoute("/olvide", <ForgotPasswordPage />, { services, route: "/olvide" });
  return { ...utils, services, user: userEvent.setup() };
}

describe("pantalla «Recupera tu contraseña»", () => {
  it("explica qué pasa, pide el correo y deja volver al inicio de sesión", () => {
    renderForgot();
    expect(screen.getByRole("heading", { name: "Recupera tu contraseña" })).toBeInTheDocument();
    expect(screen.getByText("Escribe el correo de tu cuenta y te enviamos un código.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveFocus();
    expect(screen.getByRole("button", { name: "Enviar código" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a iniciar sesión" })).toHaveAttribute("href", "/login");
  });

  it("con un correo inválido lo marca y no llama al servidor", async () => {
    const { services, user } = renderForgot();
    await user.type(screen.getByLabelText("Email"), "ash");
    await user.click(screen.getByRole("button", { name: "Enviar código" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Escribe un email válido.");
    expect(services.endpoints.auth.forgotPassword).not.toHaveBeenCalled();
  });

  it("pide el código con el correo recortado y sigue a /restablecer con el correo y el aviso de siempre", async () => {
    const { services, user } = renderForgot();
    await user.type(screen.getByLabelText("Email"), "  ash@example.com ");
    await user.click(screen.getByRole("button", { name: "Enviar código" }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/restablecer"));
    expect(services.endpoints.auth.forgotPassword).toHaveBeenCalledWith("ash@example.com");
    expect(JSON.parse(screen.getByTestId("location").dataset.state!)).toEqual({
      email: "ash@example.com",
      notice: "Si existe una cuenta con ese correo, te enviamos un código.",
    });
  });

  it("si el servidor pide esperar lo dice con los segundos y no sigue", async () => {
    const { services, user } = renderForgot();
    vi.mocked(services.endpoints.auth.forgotPassword).mockRejectedValueOnce(new ApiError(429, "RATE_LIMITED", { retryAfterSeconds: 45 }));
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar código" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Demasiados intentos. Inténtalo de nuevo en 45 s.");
    expect(screen.getByTestId("location")).toHaveTextContent("/olvide");
    expect(screen.getByRole("button", { name: "Enviar código" })).toBeEnabled();
  });

  it("un fallo de red se explica sin nada técnico", async () => {
    const { services, user } = renderForgot();
    vi.mocked(services.endpoints.auth.forgotPassword).mockRejectedValueOnce(new ApiError(0, "NETWORK"));
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar código" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo conectar con el servidor");
  });

  it("mientras envía no permite enviar dos veces", async () => {
    const { services, user } = renderForgot();
    let release!: () => void;
    vi.mocked(services.endpoints.auth.forgotPassword).mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)));
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar código" }));
    expect(screen.getByRole("button", { name: "Enviar código" })).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(services.endpoints.auth.forgotPassword).toHaveBeenCalledTimes(1);
    release();
  });
});

function renderReset(state: { email?: string; notice?: string } | null = { email: "ash@example.com", notice: "Si existe una cuenta con ese correo, te enviamos un código." }, services: Services = fakeServices()) {
  const route = state === null ? "/restablecer" : { pathname: "/restablecer", state };
  const utils = renderRoute("/restablecer", <ResetPasswordPage />, { services, route });
  return { ...utils, services, user: userEvent.setup() };
}

async function fillReset(user: ReturnType<typeof userEvent.setup>, code = "123456", password = "nueva-clave-1") {
  await user.type(screen.getByLabelText("Código"), code);
  await user.type(screen.getByLabelText("Nueva contraseña"), password);
  await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
}

describe("pantalla «Nueva contraseña»", () => {
  it("muestra el aviso que trae, pide el código y la contraseña nueva, y deja volver al inicio de sesión", () => {
    renderReset();
    expect(screen.getByRole("heading", { name: "Nueva contraseña" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Si existe una cuenta con ese correo, te enviamos un código.");
    expect(screen.getByLabelText("Código")).toHaveFocus();
    expect(screen.getByLabelText("Nueva contraseña")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("Nueva contraseña")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText("Nueva contraseña")).toHaveAccessibleDescription("Mínimo 8 caracteres.");
    expect(screen.getByRole("link", { name: "Volver a iniciar sesión" })).toHaveAttribute("href", "/login");
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("cambia la contraseña y vuelve al inicio de sesión con el aviso de éxito", async () => {
    const { services, user } = renderReset();
    await fillReset(user);
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/login"));
    expect(services.endpoints.auth.resetPassword).toHaveBeenCalledWith({ email: "ash@example.com", code: "123456", password: "nueva-clave-1" });
    const state = JSON.parse(screen.getByTestId("location").dataset.state!);
    expect(state).toEqual({ notice: "Contraseña cambiada. Inicia sesión con la nueva." });
    expect(JSON.stringify(state)).not.toContain("nueva-clave-1");
    expect(services.session.getState().status).toBe("loading");
  });

  it("con datos inválidos marca cada campo y no llama al servidor", async () => {
    const { services, user } = renderReset();
    await fillReset(user, "123", "corta");
    expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual([
      "El código son 6 dígitos.",
      "La contraseña debe tener al menos 8 caracteres.",
    ]);
    expect(services.endpoints.auth.resetPassword).not.toHaveBeenCalled();
  });

  it("un código incorrecto se explica en español y se puede reintentar", async () => {
    const { services, user } = renderReset();
    vi.mocked(services.endpoints.auth.resetPassword).mockRejectedValueOnce(new ApiError(400, "INVALID_CODE"));
    await fillReset(user, "000000");
    expect(await screen.findByRole("alert")).toHaveTextContent("Código incorrecto o vencido. Revisa tu correo o pide uno nuevo.");
    expect(screen.getByRole("button", { name: "Cambiar contraseña" })).toBeEnabled();
    expect(screen.getByTestId("location")).toHaveTextContent("/restablecer");
  });

  it("los errores de contraseña del servidor se ponen junto al campo", async () => {
    const { services, user } = renderReset();
    vi.mocked(services.endpoints.auth.resetPassword).mockRejectedValueOnce(
      new ApiError(400, "VALIDATION_ERROR", [{ path: "password", message: "La contraseña no puede superar 72 bytes" }]),
    );
    await fillReset(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("La contraseña no puede superar 72 bytes");
    expect(screen.getByLabelText("Nueva contraseña")).toHaveAttribute("aria-invalid", "true");
  });

  it("sin el correo (se recargó la página) lo pide además del código y la contraseña", async () => {
    const { services, user } = renderReset(null);
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await fillReset(user);
    await waitFor(() =>
      expect(services.endpoints.auth.resetPassword).toHaveBeenCalledWith({ email: "ash@example.com", code: "123456", password: "nueva-clave-1" }),
    );
  });

  it("pegar «123 456» deja 123456 en el campo del código", async () => {
    const { user } = renderReset();
    await user.click(screen.getByLabelText("Código"));
    await user.paste("123 456");
    expect(screen.getByLabelText("Código")).toHaveValue("123456");
  });

  it("mientras envía no permite enviar dos veces", async () => {
    const { services, user } = renderReset();
    let release!: () => void;
    vi.mocked(services.endpoints.auth.resetPassword).mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)));
    await fillReset(user);
    expect(screen.getByRole("button", { name: "Cambiar contraseña" })).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(services.endpoints.auth.resetPassword).toHaveBeenCalledTimes(1);
    release();
  });
});

describe("reenviar el código para cambiar la contraseña", () => {
  it("al llegar ya se envió uno: espera 60 s; luego pide otro con el mismo correo y lo dice sin asegurar nada", async () => {
    vi.useFakeTimers(FAKE);
    const { services, user } = renderReset();
    expect(screen.getByRole("button", { name: /Reenviar código/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Reenviar código/ })).toHaveTextContent("Reenviar código (espera 60 s)");
    act(() => void vi.advanceTimersByTime(60_000));

    await user.click(screen.getByRole("button", { name: "Reenviar código" }));
    expect(services.endpoints.auth.forgotPassword).toHaveBeenCalledWith("ash@example.com");
    expect(await screen.findByRole("status")).toHaveTextContent("Si existe una cuenta con ese correo, te enviamos un código nuevo.");
    expect(screen.getByRole("button", { name: /Reenviar código/ })).toBeDisabled();
  });

  it("si el servidor pide esperar lo dice", async () => {
    vi.useFakeTimers(FAKE);
    const { services, user } = renderReset();
    act(() => void vi.advanceTimersByTime(60_000));
    vi.mocked(services.endpoints.auth.forgotPassword).mockRejectedValueOnce(new ApiError(429, "RATE_LIMITED", { retryAfterSeconds: 20 }));
    await user.click(screen.getByRole("button", { name: "Reenviar código" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Demasiados intentos. Inténtalo de nuevo en 20 s.");
  });
});

describe("el inicio de sesión ofrece recuperar la contraseña", () => {
  function renderLogin(options: { emailVerification: boolean; state?: unknown }) {
    const services = fakeServices();
    vi.mocked(services.endpoints.auth.options).mockResolvedValue({ emailVerification: options.emailVerification });
    const route = options.state === undefined ? "/login" : { pathname: "/login", state: options.state };
    renderRoute("/login", <LoginPage />, { services, route });
    return { services, user: userEvent.setup() };
  }

  it("con la verificación activa aparece «¿Olvidaste tu contraseña?», que lleva a /olvide", async () => {
    renderLogin({ emailVerification: true });
    expect(await screen.findByRole("link", { name: "¿Olvidaste tu contraseña?" })).toHaveAttribute("href", "/olvide");
  });

  it("con la verificación apagada no aparece (todo como antes)", async () => {
    const { services } = renderLogin({ emailVerification: false });
    await waitFor(() => expect(services.endpoints.auth.options).toHaveBeenCalled());
    expect(screen.queryByRole("link", { name: "¿Olvidaste tu contraseña?" })).not.toBeInTheDocument();
  });

  it("muestra el aviso de éxito que trae al volver de cambiar la contraseña", () => {
    renderLogin({ emailVerification: false, state: { notice: "Contraseña cambiada. Inicia sesión con la nueva." } });
    expect(screen.getByRole("status")).toHaveTextContent("Contraseña cambiada. Inicia sesión con la nueva.");
  });

  it("sin aviso no hay ningún mensaje", () => {
    renderLogin({ emailVerification: false });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
```

`client/test/pages/routes.test.tsx` (`/olvide` y `/restablecer` son públicas):

```diff
diff --git a/client/test/pages/routes.test.tsx b/client/test/pages/routes.test.tsx
index 60c51d3..3c0833c 100644
--- a/client/test/pages/routes.test.tsx
+++ b/client/test/pages/routes.test.tsx
@@ -48,6 +48,25 @@ describe("rutas de las cuentas con código por correo", () => {
     await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/"));
     expect(screen.queryByRole("heading", { name: "Verifica tu correo" })).not.toBeInTheDocument();
   });
+
+  it("/olvide y /restablecer son públicas: quien no ha entrado ve sus pantallas", async () => {
+    for (const [route, title] of [
+      ["/olvide", "Recupera tu contraseña"],
+      ["/restablecer", "Nueva contraseña"],
+    ] as const) {
+      const { unmount } = renderApp(route, (s) => s.session.setState({ status: "anonymous", user: null }));
+      expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
+      unmount();
+    }
+  });
+
+  it("con sesión, /olvide y /restablecer llevan al lobby", async () => {
+    for (const route of ["/olvide", "/restablecer"]) {
+      const { unmount } = renderApp(route, (s) => signIn(s));
+      await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/"));
+      unmount();
+    }
+  });
 });
 
 describe("guardas de ruta", () => {
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
cd client && npx vitest run test/pages/password-recovery.test.tsx test/pages/routes.test.tsx
```

Expected: FAIL — falta el módulo `PasswordRecoveryPages`, `validateReset`, el enlace del login y las rutas.

- [ ] **Step 3: Implementar**

`client/src/pages/describe-error.ts`:

```ts
import { ApiError } from "../api/client";
import { errorMessage } from "../i18n/es";

/** El mensaje en español de un error de una llamada (el 429 ya dice cuánto esperar); cualquier otro fallo, uno genérico. */
export function describeError(error: unknown): string {
  return error instanceof ApiError ? error.message : errorMessage(undefined);
}
```

`client/src/pages/auth-validation.ts` (la regla de la contraseña se comparte y se añade `validateReset`):

```diff
diff --git a/client/src/pages/auth-validation.ts b/client/src/pages/auth-validation.ts
index e5afecf..fe2e4b6 100644
--- a/client/src/pages/auth-validation.ts
+++ b/client/src/pages/auth-validation.ts
@@ -14,6 +14,15 @@ function emailError(email: string): string | undefined {
   return EMAIL.test(email.trim()) ? undefined : "Escribe un email válido.";
 }
 
+/** La regla de la contraseña: de 8 caracteres a 72 bytes (bcrypt solo mira los 72 primeros). */
+function passwordError(password: string): string | undefined {
+  if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
+  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
+    return `La contraseña no puede superar ${MAX_PASSWORD_BYTES} bytes (las tildes y los emoji ocupan más de uno).`;
+  }
+  return undefined;
+}
+
 /** Las mismas reglas que aplica el servidor, para avisar antes de enviar. */
 export function validateLogin(input: { email: string; password: string }): FieldErrors {
   const errors: FieldErrors = {};
@@ -41,11 +50,16 @@ export function validateRegistration(input: { email: string; username: string; p
   const email = emailError(input.email);
   if (email) errors.email = email;
   if (!USERNAME.test(input.username.trim())) errors.username = "Usa de 3 a 30 letras, números o guion bajo.";
-  if (input.password.length < 8) {
-    errors.password = "La contraseña debe tener al menos 8 caracteres.";
-  } else if (new TextEncoder().encode(input.password).length > MAX_PASSWORD_BYTES) {
-    errors.password = `La contraseña no puede superar ${MAX_PASSWORD_BYTES} bytes (las tildes y los emoji ocupan más de uno).`;
-  }
+  const password = passwordError(input.password);
+  if (password) errors.password = password;
+  return errors;
+}
+
+/** El correo, el código de seis dígitos y la contraseña nueva. */
+export function validateReset(input: { email: string; code: string; password: string }): { email?: string; code?: string; password?: string } {
+  const errors: { email?: string; code?: string; password?: string } = { ...validateVerification(input) };
+  const password = passwordError(input.password);
+  if (password) errors.password = password;
   return errors;
 }
```

`client/src/pages/PasswordRecoveryPages.tsx`:

```tsx
import { type FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ApiError } from "../api/client";
import { Button } from "../components/Button";
import { CodeField } from "../components/CodeField";
import { Notice } from "../components/Notice";
import { TextField } from "../components/TextField";
import { useServices } from "../services";
import { AuthCard } from "./AuthCard";
import { AuthLayout } from "./AuthLayout";
import { serverFieldErrors, validateEmail, validateReset } from "./auth-validation";
import { describeError } from "./describe-error";
import { useCooldown } from "./use-cooldown";

/** El servidor contesta lo mismo exista o no la cuenta: la pantalla tampoco asegura nada. */
const SENT_NOTICE = "Si existe una cuenta con ese correo, te enviamos un código.";
const RESENT_NOTICE = "Si existe una cuenta con ese correo, te enviamos un código nuevo.";
const CHANGED_NOTICE = "Contraseña cambiada. Inicia sesión con la nueva.";

/** El servidor deja un código nuevo por correo cada 60 s. */
const RESEND_SECONDS = 60;

const backToLogin = (
  <Link to="/login" className="font-semibold text-accent underline">
    Volver a iniciar sesión
  </Link>
);

/** Pide el correo y envía el código para cambiar la contraseña; sigue a la pantalla donde se escribe. */
export function ForgotPasswordPage() {
  const { endpoints } = useServices();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    const clean = email.trim();
    const found = validateEmail(clean);
    setEmailError(found.email);
    setFormError(null);
    if (found.email) return;

    setSubmitting(true);
    try {
      await endpoints.auth.forgotPassword(clean);
      navigate("/restablecer", { state: { email: clean, notice: SENT_NOTICE } });
    } catch (error) {
      setFormError(describeError(error));
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <AuthCard title="Recupera tu contraseña" footer={backToLogin}>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {formError ? <Notice tone="danger">{formError}</Notice> : null}
          <p className="text-sm">Escribe el correo de tu cuenta y te enviamos un código.</p>
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setEmailError(undefined);
            }}
            error={emailError}
          />
          <Button type="submit" variant="primary" size="lg" loading={submitting}>
            Enviar código
          </Button>
        </form>
      </AuthCard>
    </AuthLayout>
  );
}

/** Lo que trae la pantalla de la que se viene: el correo al que se envió el código y un aviso. */
interface ResetState {
  email?: string;
  notice?: string;
}

/** Cambia la contraseña con el código que llegó. No abre sesión: vuelve al inicio de sesión con un aviso. */
export function ResetPasswordPage() {
  const { endpoints } = useServices();
  const navigate = useNavigate();
  const state = useLocation().state as ResetState | null;
  // El correo viaja en el estado del router (nunca en la URL). Si se perdió (se recargó la página), se pide.
  const known = state?.email ?? "";
  const [email, setEmail] = useState(known);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; code?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(state?.notice ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  // Quien llega con el correo viene de que se le acaba de enviar un código: antes de pedir otro hay que esperar.
  const cooldown = useCooldown(known ? RESEND_SECONDS : 0);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    const clean = email.trim();
    const found = validateReset({ email: clean, code, password });
    setErrors(found);
    setFormError(null);
    setInfo(null);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await endpoints.auth.resetPassword({ email: clean, code, password });
      navigate("/login", { state: { notice: CHANGED_NOTICE } });
    } catch (error) {
      const fields = error instanceof ApiError ? serverFieldErrors(error) : {};
      setErrors({ email: fields.email, password: fields.password });
      // Si el servidor señaló campos concretos, el aviso general sobra.
      setFormError(fields.email || fields.password ? null : describeError(error));
      setSubmitting(false);
    }
  }

  async function handleResend(): Promise<void> {
    if (cooldown.remaining > 0 || resending) return;
    const clean = email.trim();
    const found = validateEmail(clean);
    setErrors(found);
    setFormError(null);
    setInfo(null);
    if (found.email) return;

    setResending(true);
    try {
      await endpoints.auth.forgotPassword(clean);
      setInfo(RESENT_NOTICE);
      cooldown.start(RESEND_SECONDS);
    } catch (error) {
      setFormError(describeError(error));
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthLayout>
      <AuthCard title="Nueva contraseña" footer={backToLogin}>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {info ? <Notice>{info}</Notice> : null}
          {formError ? <Notice tone="danger">{formError}</Notice> : null}
          {known ? null : (
            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setErrors((current) => ({ ...current, email: undefined }));
              }}
              error={errors.email}
            />
          )}
          <CodeField
            value={code}
            onChange={(next) => {
              setCode(next);
              setErrors((current) => ({ ...current, code: undefined }));
            }}
            error={errors.code}
            autoFocus={Boolean(known)}
          />
          <TextField
            label="Nueva contraseña"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setErrors((current) => ({ ...current, password: undefined }));
            }}
            error={errors.password}
            hint="Mínimo 8 caracteres."
          />
          <Button type="submit" variant="primary" size="lg" loading={submitting}>
            Cambiar contraseña
          </Button>
          <Button type="button" disabled={cooldown.remaining > 0 || resending} onClick={() => void handleResend()}>
            {cooldown.remaining > 0 ? `Reenviar código (espera ${cooldown.remaining} s)` : "Reenviar código"}
          </Button>
        </form>
      </AuthCard>
    </AuthLayout>
  );
}
```

`client/src/pages/VerifyEmailPage.tsx` (usa `describeError`):

```diff
diff --git a/client/src/pages/VerifyEmailPage.tsx b/client/src/pages/VerifyEmailPage.tsx
index ec652ea..4d87d60 100644
--- a/client/src/pages/VerifyEmailPage.tsx
+++ b/client/src/pages/VerifyEmailPage.tsx
@@ -1,15 +1,14 @@
 import { type FormEvent, useState } from "react";
 import { Link, useLocation, useNavigate } from "react-router";
-import { ApiError } from "../api/client";
 import { Button } from "../components/Button";
 import { CodeField } from "../components/CodeField";
 import { Notice } from "../components/Notice";
 import { TextField } from "../components/TextField";
-import { errorMessage } from "../i18n/es";
 import { useServices } from "../services";
 import { AuthCard } from "./AuthCard";
 import { AuthLayout } from "./AuthLayout";
 import { validateEmail, validateVerification } from "./auth-validation";
+import { describeError } from "./describe-error";
 import { useCooldown } from "./use-cooldown";
 
 /** Lo que trae la pantalla de la que se viene (registro o login): el correo al que se envió el código y un aviso. */
@@ -23,8 +22,6 @@ interface VerifyState {
 /** El servidor deja un código nuevo por correo cada 60 s. */
 const RESEND_SECONDS = 60;
 
-const describe = (error: unknown): string => (error instanceof ApiError ? error.message : errorMessage(undefined));
-
 /** Verificar el correo con el código de seis dígitos y abrir la sesión. */
 export function VerifyEmailPage() {
   const { session, endpoints } = useServices();
@@ -57,7 +54,7 @@ export function VerifyEmailPage() {
       await session.getState().verifyEmail({ email: clean, code });
       navigate(state?.returnTo ?? "/", { replace: true });
     } catch (error) {
-      setFormError(describe(error));
+      setFormError(describeError(error));
       setSubmitting(false);
     }
   }
@@ -77,7 +74,7 @@ export function VerifyEmailPage() {
       setInfo(`Te enviamos un código nuevo a ${clean}.`);
       cooldown.start(RESEND_SECONDS);
     } catch (error) {
-      setFormError(describe(error));
+      setFormError(describeError(error));
     } finally {
       setResending(false);
     }
```

`client/src/pages/AuthForm.tsx` (`notice` y `extra`):

```diff
diff --git a/client/src/pages/AuthForm.tsx b/client/src/pages/AuthForm.tsx
index 5bdda60..27fb604 100644
--- a/client/src/pages/AuthForm.tsx
+++ b/client/src/pages/AuthForm.tsx
@@ -15,6 +15,10 @@ export interface AuthFormProps {
   validate(values: { email: string; username: string; password: string }): FieldErrors;
   onSubmit(values: { email: string; username: string; password: string }): Promise<void>;
   footer: ReactNode;
+  /** Un aviso de éxito que trae la pantalla de la que se viene (p. ej. «Contraseña cambiada»). */
+  notice?: string;
+  /** Algo que va justo debajo de la contraseña (p. ej. «¿Olvidaste tu contraseña?»). */
+  extra?: ReactNode;
 }
 
 /** El 429 dice cuánto esperar; los demás errores ya traen su mensaje en español. */
@@ -22,7 +26,7 @@ const describe = (error: ApiError): string =>
   error.code === "RATE_LIMITED" ? rateLimitMessage(retryAfterOf(error.details)) : error.message;
 
 /** Formulario común de inicio de sesión y registro: valida, envía y muestra los errores del servidor. */
-export function AuthForm({ title, submitLabel, withUsername = false, validate, onSubmit, footer }: AuthFormProps) {
+export function AuthForm({ title, submitLabel, withUsername = false, validate, onSubmit, footer, notice, extra }: AuthFormProps) {
   const [values, setValues] = useState({ email: "", username: "", password: "" });
   const [errors, setErrors] = useState<FieldErrors>({});
   const [formError, setFormError] = useState<string | null>(null);
@@ -57,6 +61,7 @@ export function AuthForm({ title, submitLabel, withUsername = false, validate, o
   return (
     <AuthCard title={title} footer={footer}>
       <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
+        {notice ? <Notice tone="success">{notice}</Notice> : null}
         {formError ? <Notice tone="danger">{formError}</Notice> : null}
         <TextField
           label="Email"
@@ -85,6 +90,7 @@ export function AuthForm({ title, submitLabel, withUsername = false, validate, o
           error={errors.password}
           hint={withUsername ? "Mínimo 8 caracteres." : undefined}
         />
+        {extra ? <div className="-mt-1">{extra}</div> : null}
         <Button type="submit" variant="primary" size="lg" loading={submitting}>
           {submitLabel}
         </Button>
```

`client/src/pages/AuthPages.tsx` (el enlace «¿Olvidaste tu contraseña?» y el aviso del login):

```diff
diff --git a/client/src/pages/AuthPages.tsx b/client/src/pages/AuthPages.tsx
index 4e4f1aa..1581731 100644
--- a/client/src/pages/AuthPages.tsx
+++ b/client/src/pages/AuthPages.tsx
@@ -1,6 +1,7 @@
 import { Link, useLocation, useNavigate } from "react-router";
 import { ApiError } from "../api/client";
 import { useServices } from "../services";
+import { useEmailVerification } from "../session/auth-options";
 import { AuthForm } from "./AuthForm";
 import { AuthLayout } from "./AuthLayout";
 import { validateLogin, validateRegistration } from "./auth-validation";
@@ -15,6 +16,9 @@ export function LoginPage() {
   const { session } = useServices();
   const navigate = useNavigate();
   const returnTo = useReturnPath();
+  // Con la verificación apagada no hay correos que enviar: no se ofrece recuperar la contraseña.
+  const emailVerification = useEmailVerification();
+  const notice = (useLocation().state as { notice?: string } | null)?.notice;
 
   return (
     <AuthLayout>
@@ -22,6 +26,14 @@ export function LoginPage() {
         title="Iniciar sesión"
         submitLabel="Entrar"
         validate={validateLogin}
+        notice={notice}
+        extra={
+          emailVerification ? (
+            <Link to="/olvide" className="text-sm font-semibold text-accent underline">
+              ¿Olvidaste tu contraseña?
+            </Link>
+          ) : undefined
+        }
         onSubmit={async ({ email, password }) => {
           try {
             await session.getState().login({ email, password });
```

`client/src/routes.tsx`:

```diff
diff --git a/client/src/routes.tsx b/client/src/routes.tsx
index 1cfb02f..f94f169 100644
--- a/client/src/routes.tsx
+++ b/client/src/routes.tsx
@@ -4,6 +4,7 @@ import { useSession } from "./services";
 import { LoginPage, RegisterPage } from "./pages/AuthPages";
 import { LobbyPage } from "./pages/Lobby";
 import { ProfilePage } from "./pages/profile/ProfilePage";
+import { ForgotPasswordPage, ResetPasswordPage } from "./pages/PasswordRecoveryPages";
 import { VerifyEmailPage } from "./pages/VerifyEmailPage";
 import { RoomPage } from "./pages/room/RoomPage";
 
@@ -31,6 +32,8 @@ export function AppRoutes() {
         <Route path="/login" element={<LoginPage />} />
         <Route path="/registro" element={<RegisterPage />} />
         <Route path="/verificar" element={<VerifyEmailPage />} />
+        <Route path="/olvide" element={<ForgotPasswordPage />} />
+        <Route path="/restablecer" element={<ResetPasswordPage />} />
       </Route>
       <Route element={<RequireAuth />}>
         <Route path="/" element={<LobbyPage />} />
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
cd client && npx vitest run --testTimeout=30000
cd .. && npm run typecheck
```

Expected: PASS (cliente: **739 pruebas**) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): «olvidé mi contraseña» y «nueva contraseña» (el enlace solo aparece con la verificación activa)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: E2E — cuentas con código en un navegador real

**Files:**
- Modify: `e2e/global-setup.ts`, `e2e/support/app.ts`, `e2e/tests/layout.spec.ts`
- Create: `e2e/tests/accounts.spec.ts`

**Interfaces:**
- Consumes: el buzón `GET /auth/test-outbox?to=` (Task 8) y las tres pantallas (Tasks 10 y 11).
- Produces (en `e2e/support/app.ts`): `startRegistration(player)` (rellena el registro y llega a «Verifica tu correo» con la cuenta sin verificar), `mailbox(context, email)` (lo «enviado» a una dirección, del más antiguo al más reciente), `codeFor(player, after = 0)` (el código del último correo; espera a que haya más de `after` correos, porque «olvidé» y «reenviar» envían en segundo plano), `wrongCode(real)`, `enterCode(page, code)` y `register(player)`, que **ahora verifica**: todas las E2E que ya existían pasan por el código. El servidor de la E2E corre con `EMAIL_VERIFICATION=on`, `MAIL_PROVIDER=memory` y `ALLOW_MEMORY_MAIL=true`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`e2e/support/app.ts` (los ayudantes; `register` lee el código del buzón):

```diff
diff --git a/e2e/support/app.ts b/e2e/support/app.ts
index 8d1ee4b..0aa594a 100644
--- a/e2e/support/app.ts
+++ b/e2e/support/app.ts
@@ -41,13 +41,69 @@ export async function newPlayer(browser: Browser, label: string): Promise<Player
   return { name, email: `${name}@example.com`, ip, context, page };
 }
 
-export async function register({ page, name, email }: Player): Promise<void> {
+/** Rellena el registro y llega a la pantalla del código: la cuenta queda creada pero sin verificar. */
+export async function startRegistration({ page, name, email }: Player): Promise<void> {
   await page.goto("/registro");
   await page.getByLabel("Email").fill(email);
   await page.getByLabel("Nombre de usuario").fill(name);
   await page.getByLabel("Contraseña").fill(PASSWORD);
   await page.getByRole("button", { name: "Crear cuenta" }).click();
-  await expect(page.getByRole("heading", { name: "Lobby" })).toBeVisible();
+  await expect(page.getByRole("heading", { name: "Verifica tu correo" })).toBeVisible();
+}
+
+interface MailboxMessage {
+  to: string;
+  subject: string;
+  text: string;
+}
+
+/**
+ * Los correos que el servidor de la prueba «envió» a esa dirección, del más antiguo al más reciente. El servidor de la
+ * E2E usa `MAIL_PROVIDER=memory` y guarda los mensajes en vez de enviarlos; esta ruta solo existe así.
+ */
+export async function mailbox(context: BrowserContext, email: string): Promise<MailboxMessage[]> {
+  const response = await context.request.get(`/auth/test-outbox?to=${encodeURIComponent(email)}`);
+  expect(response.ok(), "el buzón de pruebas no responde (¿el servidor de la E2E tiene MAIL_PROVIDER=memory?)").toBe(true);
+  return ((await response.json()) as { messages: MailboxMessage[] }).messages;
+}
+
+/**
+ * El código del último correo que llegó a la dirección de la persona. Espera a que haya más de `after` correos: el
+ * registro envía antes de contestar, pero «olvidé mi contraseña» y «reenviar» envían en segundo plano.
+ */
+export async function codeFor(player: Player, after = 0): Promise<string> {
+  let text = "";
+  await expect
+    .poll(
+      async () => {
+        const messages = await mailbox(player.context, player.email);
+        text = messages.at(-1)?.text ?? "";
+        return messages.length;
+      },
+      { message: `no llegó ningún correo con el código a ${player.email}` },
+    )
+    .toBeGreaterThan(after);
+  const code = /\b(\d{6})\b/.exec(text)?.[1];
+  if (!code) throw new Error(`El correo no trae un código de seis dígitos:\n${text}`);
+  return code;
+}
+
+/** Un código de seis dígitos que no es el verdadero. */
+export function wrongCode(real: string): string {
+  return real === "000000" ? "111111" : "000000";
+}
+
+/** Escribe el código en la pantalla de verificar el correo y pulsa «Verificar». */
+export async function enterCode(page: Page, code: string): Promise<void> {
+  await page.getByLabel("Código", { exact: true }).fill(code);
+  await page.getByRole("button", { name: "Verificar", exact: true }).click();
+}
+
+/** Crea la cuenta y la verifica con el código del correo; termina dentro del lobby. */
+export async function register(player: Player): Promise<void> {
+  await startRegistration(player);
+  await enterCode(player.page, await codeFor(player));
+  await expect(player.page.getByRole("heading", { name: "Lobby" })).toBeVisible();
 }
 
 export async function logIn(page: Page, email: string, password: string): Promise<void> {
```

`e2e/tests/accounts.spec.ts` (registro con código: uno equivocado no abre la cuenta y el verdadero sirve una vez; entrar sin verificar lleva a verificar; cinco códigos equivocados bloquean, también desde otra IP; el cambio de contraseña tiene el mismo bloqueo y un correo sin cuenta contesta igual; «olvidé mi contraseña» completo, con el minuto de espera que impone el servidor, la contraseña de antes que ya no sirve y la sesión abierta que se cierra):

```ts
import { type Page, expect, test } from "@playwright/test";
import { PASSWORD, codeFor, enterCode, logIn, mailbox, newPlayer, register, startRegistration, wrongCode } from "../support/app";

/**
 * Las cuentas con código por correo, en un navegador real. El servidor de la prueba corre con `EMAIL_VERIFICATION=on` y
 * `MAIL_PROVIDER=memory`: los correos no salen de la máquina y el código se lee del buzón de pruebas.
 */

const WRONG_CODE_MESSAGE = "Código incorrecto o vencido. Revisa tu correo o pide uno nuevo.";
const TEN_MINUTE_BLOCK = /^Demasiados intentos\. Inténtalo de nuevo en (9|10) min\.$/;
const NEW_PASSWORD = "squirtle-456";

/** Escribe el código en la pantalla de verificar el correo, lo envía y devuelve el estado HTTP que contestó el servidor. */
async function submitVerification(page: Page, code: string): Promise<number> {
  const reply = page.waitForResponse((r) => r.url().endsWith("/auth/verify-email"));
  await page.getByLabel("Código", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Verificar", exact: true }).click();
  return (await reply).status();
}

/** Escribe el código y la contraseña nueva en la pantalla de restablecer, los envía y devuelve el estado HTTP. */
async function submitReset(page: Page, code: string): Promise<number> {
  const reply = page.waitForResponse((r) => r.url().endsWith("/auth/password/reset"));
  await page.getByLabel("Código", { exact: true }).fill(code);
  await page.getByLabel("Nueva contraseña").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Cambiar contraseña" }).click();
  return (await reply).status();
}

test("registrarse pide el código que llega por correo: uno equivocado no abre la cuenta y el verdadero solo sirve una vez", async ({ browser }) => {
  const ash = await newPlayer(browser, "verifica");
  // Otro navegador y la misma IP: así se comprueba el código, no una cookie ni el estado de la pantalla.
  const stranger = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": ash.ip } });
  try {
    await startRegistration(ash);
    await expect(ash.page.getByText(`Te enviamos un código de 6 dígitos a ${ash.email}.`)).toBeVisible();
    // El servidor deja un código nuevo por correo cada 60 s: hasta entonces el botón espera.
    await expect(ash.page.getByRole("button", { name: /^Reenviar código \(espera \d+ s\)$/ })).toBeDisabled();

    const code = await codeFor(ash);
    await enterCode(ash.page, wrongCode(code));
    await expect(ash.page.getByRole("alert")).toHaveText(WRONG_CODE_MESSAGE);
    await expect(ash.page).toHaveURL(/\/verificar$/);

    await enterCode(ash.page, code);
    await expect(ash.page.getByRole("heading", { name: "Lobby" })).toBeVisible();

    // Un código vale una sola vez: usarlo de nuevo recibe el mismo rechazo de siempre.
    const page = await stranger.newPage();
    await page.goto("/verificar");
    await page.getByLabel("Email").fill(ash.email);
    await enterCode(page, code);
    await expect(page.getByRole("alert")).toHaveText(WRONG_CODE_MESSAGE);
  } finally {
    await ash.context.close();
    await stranger.close();
  }
});

test("una cuenta sin verificar no entra con la contraseña: el acceso lleva a verificar y el código del registro sirve", async ({ browser }) => {
  const pending = await newPlayer(browser, "pendiente");
  const later = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": pending.ip } });
  try {
    await startRegistration(pending);
    const code = await codeFor(pending);

    const page = await later.newPage();
    await logIn(page, pending.email, PASSWORD);
    await expect(page.getByRole("heading", { name: "Verifica tu correo" })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Tu correo aún no está verificado. Te enviamos un código.");
    await expect(page.getByText(`Te enviamos un código de 6 dígitos a ${pending.email}.`)).toBeVisible();

    // Dentro del minuto de espera no sale otro correo: el código del registro sigue valiendo.
    await enterCode(page, code);
    await expect(page.getByRole("heading", { name: "Lobby" })).toBeVisible();
  } finally {
    await pending.context.close();
    await later.close();
  }
});

test("cinco códigos equivocados bloquean la comprobación, aunque el sexto lleve el código verdadero y venga de otra IP", async ({ browser }) => {
  const pending = await newPlayer(browser, "bloqueo");
  const elsewhere = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": "10.250.251.252" } });
  try {
    await startRegistration(pending);
    const code = await codeFor(pending);

    for (let attempt = 1; attempt <= 5; attempt++) {
      expect(await submitVerification(pending.page, wrongCode(code))).toBe(400);
      await expect(pending.page.getByRole("alert")).toHaveText(WRONG_CODE_MESSAGE);
    }

    // El sexto, ya con el código verdadero, está bloqueado: ni siquiera se mira el código.
    expect(await submitVerification(pending.page, code)).toBe(429);
    await expect(pending.page.getByRole("alert")).toHaveText(TEN_MINUTE_BLOCK);
    await expect(pending.page.getByRole("heading", { name: "Verifica tu correo" })).toBeVisible();

    // El límite es del correo, no de la IP: desde otra IP el código verdadero tampoco se comprueba.
    const page = await elsewhere.newPage();
    await page.goto("/verificar");
    await page.getByLabel("Email").fill(pending.email);
    expect(await submitVerification(page, code)).toBe(429);
  } finally {
    await pending.context.close();
    await elsewhere.close();
  }
});

test("el cambio de contraseña tiene el mismo bloqueo, y un correo sin cuenta contesta igual que uno con cuenta", async ({ browser }) => {
  // Nunca se registra: no hay cuenta ni código, y aun así cada intento recibe el mismo rechazo y el sexto el mismo bloqueo.
  const ghost = await newPlayer(browser, "fantasma");
  try {
    await ghost.page.goto("/restablecer");
    await ghost.page.getByLabel("Email").fill(ghost.email);

    for (let attempt = 1; attempt <= 5; attempt++) {
      expect(await submitReset(ghost.page, "123456")).toBe(400);
      await expect(ghost.page.getByRole("alert")).toHaveText(WRONG_CODE_MESSAGE);
    }
    expect(await submitReset(ghost.page, "123456")).toBe(429);
    await expect(ghost.page.getByRole("alert")).toHaveText(TEN_MINUTE_BLOCK);
    expect(await mailbox(ghost.context, ghost.email)).toEqual([]);
  } finally {
    await ghost.context.close();
  }
});

test("«olvidé mi contraseña»: el código cambia la contraseña, la anterior deja de servir y las sesiones abiertas se cierran", async ({ browser }) => {
  // El registro acaba de enviar un código a este correo y el servidor deja 60 s entre dos envíos: la prueba espera ese minuto.
  test.setTimeout(150_000);
  const owner = await newPlayer(browser, "olvido");
  const phone = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": owner.ip } });
  try {
    await register(owner);
    const alreadySent = (await mailbox(owner.context, owner.email)).length;

    const page = await phone.newPage();
    await page.goto("/login");
    await page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).click();
    await expect(page.getByRole("heading", { name: "Recupera tu contraseña" })).toBeVisible();
    await page.getByLabel("Email").fill(owner.email);
    await page.getByRole("button", { name: "Enviar código" }).click();

    // Pedirlo antes de tiempo no lo envía y la pantalla dice cuánto falta.
    const early = page.getByRole("alert");
    await expect(early).toHaveText(/^Demasiados intentos\. Inténtalo de nuevo en \d+ (s|min)\.$/);
    await expect(page.getByRole("heading", { name: "Recupera tu contraseña" })).toBeVisible();
    const [, amount, unit] = /en (\d+) (s|min)\./.exec((await early.textContent()) ?? "") ?? [];
    await page.waitForTimeout((Number(amount) * (unit === "min" ? 60 : 1) + 1) * 1000);

    await page.getByRole("button", { name: "Enviar código" }).click();
    await expect(page.getByRole("heading", { name: "Nueva contraseña" })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Si existe una cuenta con ese correo, te enviamos un código.");

    await page.getByLabel("Código", { exact: true }).fill(await codeFor(owner, alreadySent));
    await page.getByLabel("Nueva contraseña").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Contraseña cambiada. Inicia sesión con la nueva.");

    // Cambiar la contraseña no inicia sesión: hay que entrar con la nueva, y la de antes ya no sirve.
    await logIn(page, owner.email, PASSWORD);
    await expect(page.getByRole("alert")).toHaveText("Email o contraseña incorrectos.");
    await logIn(page, owner.email, NEW_PASSWORD);
    await expect(page.getByRole("heading", { name: "Lobby" })).toBeVisible();

    // La sesión que ya estaba abierta en el otro navegador se cerró con el cambio.
    await owner.page.reload();
    await expect(owner.page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  } finally {
    await owner.context.close();
    await phone.close();
  }
});
```

`e2e/tests/layout.spec.ts` (las pantallas del código caben de 360 a 1280 px y el campo del código se ve entero):

```diff
diff --git a/e2e/tests/layout.spec.ts b/e2e/tests/layout.spec.ts
index 863b081..93db73b 100644
--- a/e2e/tests/layout.spec.ts
+++ b/e2e/tests/layout.spec.ts
@@ -73,6 +73,28 @@ test("sin sesión el encabezado y el menú de apariencia caben en todos los anch
   }
 });
 
+test("sin sesión las pantallas del código por correo caben en todos los anchos, con el campo del código entero a la vista", async ({ browser }) => {
+  const visitor = await newPlayer(browser, "codigo");
+  try {
+    for (const width of WIDTHS) {
+      await visitor.page.setViewportSize({ width, height: 740 });
+      for (const [path, heading, withCode] of [
+        ["/verificar", "Verifica tu correo", true],
+        ["/olvide", "Recupera tu contraseña", false],
+        ["/restablecer", "Nueva contraseña", true],
+      ] as const) {
+        const where = `${width} px, ${path}`;
+        await visitor.page.goto(path);
+        await expect(visitor.page.getByRole("heading", { name: heading })).toBeVisible();
+        await expectNoSideScroll(visitor.page, where);
+        if (withCode) await expectInsideViewport(visitor.page, visitor.page.getByLabel("Código", { exact: true }), `${where}: el campo del código`);
+      }
+    }
+  } finally {
+    await visitor.context.close();
+  }
+});
+
 for (const [kind, label] of [
   ["corto", "ash"],
   ["de 30 letras", longName("a")],
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm run build
cd e2e && E2E_CHANNEL=msedge npx playwright test accounts
```

Expected: FAIL — el servidor de la prueba todavía tiene la verificación apagada: tras «Crear cuenta» no aparece «Verifica tu correo» (las 5 pruebas fallan al esperar ese encabezado o la ruta `/auth/test-outbox`).

- [ ] **Step 3: Implementar**

`e2e/global-setup.ts` (el servidor de la prueba enciende la verificación con el buzón en memoria):

```diff
diff --git a/e2e/global-setup.ts b/e2e/global-setup.ts
index 4af5aaf..20a006a 100644
--- a/e2e/global-setup.ts
+++ b/e2e/global-setup.ts
@@ -80,6 +80,11 @@ export default async function globalSetup(): Promise<() => Promise<void>> {
       COOKIE_SECURE: "true",
       COOKIE_SAME_SITE: "lax",
       TRUST_PROXY: "1",
+      // Las cuentas piden el código del correo, y los correos no salen: quedan en un buzón en memoria que la prueba lee
+      // en /auth/test-outbox (en producción esa ruta solo existe con ALLOW_MEMORY_MAIL=true, que solo pone este servidor).
+      EMAIL_VERIFICATION: "on",
+      MAIL_PROVIDER: "memory",
+      ALLOW_MEMORY_MAIL: "true",
     },
     stdio: ["ignore", "pipe", "pipe"],
   });
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
E2E_CHANNEL=msedge npm run e2e
```

Expected: **22 pruebas pasan** y 1 se omite (la de las capturas del README); tarda unos 5 minutos (la de «olvidé mi contraseña» espera un minuto); la base `pokemon_minigames_e2e` desaparece al terminar.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(e2e): cuentas con código por correo en un navegador real (registro, olvidé, bloqueo, login sin verificar)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Documentación y configuración de despliegue

**Files:**
- Modify: `render.yaml`, `docs/despliegue.md`, `README.md`, `server/.env.example`, `server/src/config/env.ts`
- Create: `docs/correo.md`
- Test (modificar): `server/test/config/mail-env.test.ts`, `server/test/deploy/config-files.test.ts`

**Interfaces:**
- Consumes: las variables de la Task 1 y las rutas de la Task 8.
- Produces: `render.yaml` declara `RESEND_API_KEY` y `MAIL_FROM` con `sync: false` (sin valor: la clave es un secreto) y **no** fija `EMAIL_VERIFICATION` ni `MAIL_PROVIDER`, que se ponen en el panel de Render al activar (si el Blueprint los fijara, una sincronización podría devolver el interruptor a `off`). Según la documentación de Render, al actualizar un Blueprint que ya existe **se ignoran las variables `sync: false`**: no se crean solas y Marco las añade a mano en el panel (la guía lo dice). `loadEnv` trata en blanco (o solo espacios) `EMAIL_VERIFICATION`, `MAIL_PROVIDER`, `RESEND_API_KEY`, `MAIL_FROM` y `ALLOW_MEMORY_MAIL` como no definidas: una variable que se deja vacía en el panel (la clave que aún no se pegó) no debe dejar al servicio sin arrancar por algo que, con el correo apagado, nadie usa; cualquier otra variable en blanco sigue siendo un error. `docs/correo.md` es la guía paso a paso para Marco (dominio, cuenta de Resend, registros DNS, clave de solo envío, las cuatro variables de Render, prueba real y marcha atrás); `docs/despliegue.md` explica las variables nuevas y el apartado de activar y desactivar; el README documenta las rutas y las variables.

- [ ] **Step 1: Escribir las pruebas que fallan**

`server/test/config/mail-env.test.ts` (las variables de correo en blanco):

```diff
diff --git a/server/test/config/mail-env.test.ts b/server/test/config/mail-env.test.ts
index 925509f..41dbbcf 100644
--- a/server/test/config/mail-env.test.ts
+++ b/server/test/config/mail-env.test.ts
@@ -90,3 +90,36 @@ describe("producción con la verificación activada", () => {
     expect(message).toMatch(/MAIL_FROM/);
   });
 });
+
+describe("variables de correo en blanco", () => {
+  // Una variable que se deja en blanco en el panel de Render (la clave que aún no se pegó, por ejemplo) es lo mismo que no
+  // tenerla: el servicio no debe quedarse sin arrancar por eso.
+  const blank = { EMAIL_VERIFICATION: "", MAIL_PROVIDER: "", RESEND_API_KEY: "", MAIL_FROM: "", ALLOW_MEMORY_MAIL: "" };
+
+  it("en producción arranca con el correo apagado, como si no estuvieran", () => {
+    const env = loadEnv({ ...production, ...blank });
+    expect(env).toMatchObject({ EMAIL_VERIFICATION: false, MAIL_PROVIDER: undefined, ALLOW_MEMORY_MAIL: false });
+    expect(env.RESEND_API_KEY).toBeUndefined();
+    expect(env.MAIL_FROM).toBeUndefined();
+  });
+
+  it("también las que solo tienen espacios", () => {
+    const env = loadEnv({ ...production, RESEND_API_KEY: "  ", MAIL_FROM: " " });
+    expect(env.RESEND_API_KEY).toBeUndefined();
+    expect(env.MAIL_FROM).toBeUndefined();
+  });
+
+  it("con la verificación encendida, un proveedor en blanco no vale: hay que decir resend", () => {
+    expect(() => loadEnv({ ...production, EMAIL_VERIFICATION: "on", MAIL_PROVIDER: "" })).toThrow(/debe ser resend/);
+  });
+
+  it("con resend, una clave o un remitente en blanco cuentan como faltantes", () => {
+    expect(() => loadEnv({ ...production, ...resend, RESEND_API_KEY: "" })).toThrow(/RESEND_API_KEY/);
+    expect(() => loadEnv({ ...production, ...resend, MAIL_FROM: "" })).toThrow(/MAIL_FROM/);
+  });
+
+  it("solo se perdona el correo: las demás variables en blanco siguen siendo un error", () => {
+    expect(() => loadEnv({ ...production, JWT_ACCESS_SECRET: "" })).toThrow(/JWT_ACCESS_SECRET/);
+    expect(() => loadEnv({ ...production, COOKIE_SECURE: "" })).toThrow(/COOKIE_SECURE/);
+  });
+});
```

`server/test/deploy/config-files.test.ts` (el Blueprint pide la clave y el remitente sin valor y no fija el interruptor; el servidor arranca con lo que declara, también con esas variables en blanco en el panel; las guías explican las variables, la de `docs/correo.md` recorre el camino completo, no contiene ninguna clave y sus valores los acepta el servidor; el README y `.env.example` los documentan):

```diff
diff --git a/server/test/deploy/config-files.test.ts b/server/test/deploy/config-files.test.ts
index 60e2258..d7740d3 100644
--- a/server/test/deploy/config-files.test.ts
+++ b/server/test/deploy/config-files.test.ts
@@ -31,6 +31,15 @@ const ci = parse(read(".github/workflows/ci.yml")) as {
 const rootScripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;
 const serverScripts = (JSON.parse(read("server/package.json")) as { scripts: Record<string, string> }).scripts;
 
+/** Las variables del Blueprint que traen valor (las demás las pide Render o las genera). */
+const fromBlueprint = (): Record<string, string> =>
+  Object.fromEntries(service.envVars.filter((variable) => variable.value !== undefined).map((variable) => [variable.key, variable.value!]));
+/** Lo que Render completa en el panel: la base de datos y la clave de sesión. */
+const placeholders = {
+  DATABASE_URL: "postgresql://usuario:clave@ep-ejemplo.neon.tech/neondb?sslmode=require",
+  JWT_ACCESS_SECRET: "s".repeat(48),
+};
+
 describe("render.yaml", () => {
   it("define un único servicio web gratuito con comprobación de salud", () => {
     expect(blueprint.services).toHaveLength(1);
@@ -69,24 +78,36 @@ describe("render.yaml", () => {
     expect(read("render.yaml")).not.toMatch(/postgres(ql)?:\/\//);
   });
 
-  it("su configuración la acepta el servidor en producción", () => {
-    const fromBlueprint = Object.fromEntries(
-      service.envVars.filter((variable) => variable.value !== undefined).map((variable) => [variable.key, variable.value!]),
-    );
-    const env = loadEnv({
-      ...fromBlueprint,
-      DATABASE_URL: "postgresql://usuario:clave@ep-ejemplo.neon.tech/neondb?sslmode=require",
-      JWT_ACCESS_SECRET: "s".repeat(48),
-    });
+  it("pide la clave de Resend y el remitente en el panel, sin valor, y deja el interruptor y el proveedor para el panel", () => {
+    const byKey = Object.fromEntries(service.envVars.map((variable) => [variable.key, variable]));
+    expect(byKey.RESEND_API_KEY).toEqual({ key: "RESEND_API_KEY", sync: false });
+    expect(byKey.MAIL_FROM).toEqual({ key: "MAIL_FROM", sync: false });
+    // Se ponen desde el panel de Render (docs/correo.md): si el Blueprint los fijara, una sincronización podría devolver
+    // EMAIL_VERIFICATION a «off» sin que nadie lo note.
+    expect(byKey.EMAIL_VERIFICATION).toBeUndefined();
+    expect(byKey.MAIL_PROVIDER).toBeUndefined();
+  });
+
+  it("su configuración la acepta el servidor en producción, con el correo apagado", () => {
+    const env = loadEnv({ ...fromBlueprint(), ...placeholders });
     expect(env).toMatchObject({
       NODE_ENV: "production",
       COOKIE_SECURE: true,
       COOKIE_SAME_SITE: "lax",
       TRUST_PROXY: 2,
       CORS_ORIGIN: undefined,
+      EMAIL_VERIFICATION: false,
+      MAIL_PROVIDER: undefined,
     });
   });
 
+  it("sigue arrancando si en el panel de Render quedan en blanco las variables que el Blueprint pide sin valor", () => {
+    const env = loadEnv({ ...fromBlueprint(), ...placeholders, RESEND_API_KEY: "", MAIL_FROM: "" });
+    expect(env.EMAIL_VERIFICATION).toBe(false);
+    expect(env.RESEND_API_KEY).toBeUndefined();
+    expect(env.MAIL_FROM).toBeUndefined();
+  });
+
   it("pide la misma versión de Node que el resto del proyecto", () => {
     const nodeVersion = service.envVars.find((variable) => variable.key === "NODE_VERSION")?.value;
     expect(nodeVersion).toBe(read(".node-version").trim());
@@ -167,12 +188,64 @@ describe("documentación de despliegue", () => {
     expect(read("render.yaml")).not.toMatch(/en Render, 1/);
   });
 
-  it("el README enlaza la guía y .env.example documenta TRUST_PROXY", () => {
-    expect(read("README.md")).toContain("docs/despliegue.md");
-    expect(read("server/.env.example")).toContain("TRUST_PROXY");
+  it("la guía explica las variables del correo y enlaza la guía para activarlo y desactivarlo", () => {
+    for (const variable of ["EMAIL_VERIFICATION", "MAIL_PROVIDER", "RESEND_API_KEY", "MAIL_FROM"]) expect(guide).toContain(`\`${variable}\``);
+    expect(guide).toContain("(correo.md)");
+    // Ya existen la verificación y la recuperación por correo (apagadas hasta que se activan).
+    expect(guide).not.toMatch(/recuperación de contraseña por correo ni verificación de correo/);
+  });
+
+  it("el README enlaza las guías y .env.example documenta TRUST_PROXY y las variables del correo", () => {
+    const readme = read("README.md");
+    expect(readme).toContain("docs/despliegue.md");
+    expect(readme).toContain("docs/correo.md");
+    const example = read("server/.env.example");
+    for (const variable of ["TRUST_PROXY", "EMAIL_VERIFICATION", "MAIL_PROVIDER", "RESEND_API_KEY", "MAIL_FROM"]) expect(example).toContain(variable);
+  });
+
+  it("el README documenta las rutas nuevas de las cuentas", () => {
+    const readme = read("README.md");
+    for (const route of ["/auth/options", "/auth/verify-email", "/auth/verification/resend", "/auth/password/forgot", "/auth/password/reset"]) {
+      expect(readme).toContain(route);
+    }
   });
 
   it("existe el archivo de versión de Node que lee Render", () => {
     expect(existsSync(new URL(".node-version", root))).toBe(true);
   });
 });
+
+describe("guía del correo (docs/correo.md)", () => {
+  // Se lee dentro de cada prueba: si el archivo no existe, falla esa prueba y no todo el archivo.
+  const guide = (): string => read("docs/correo.md");
+  /** El valor de una fila «| `VARIABLE` | `valor` | …» de la tabla de variables de Render. */
+  const valueOf = (variable: string): string | undefined => new RegExp("\\| `" + variable + "` \\| `([^`]+)` \\|").exec(guide())?.[1];
+
+  it("recorre el camino completo: dominio, Resend, registros DNS, clave de solo envío, variables de Render, prueba real y marcha atrás", () => {
+    for (const piece of ["Resend", "dominio", "SPF", "DKIM", "DMARC", "Sending access", "carpeta de spam", "Marcha atrás"]) {
+      expect(guide(), `falta «${piece}»`).toContain(piece);
+    }
+  });
+
+  it("la clave solo se pega en el panel de Render y la guía no trae ninguna", () => {
+    expect(guide()).toMatch(/solo se pega en el panel de Render/);
+    expect(guide()).not.toMatch(/re_[A-Za-z0-9_]{20,}/);
+  });
+
+  it("los valores que manda poner en Render los acepta el servidor en producción", () => {
+    const env = loadEnv({
+      ...fromBlueprint(),
+      ...placeholders,
+      EMAIL_VERIFICATION: valueOf("EMAIL_VERIFICATION"),
+      MAIL_PROVIDER: valueOf("MAIL_PROVIDER"),
+      MAIL_FROM: valueOf("MAIL_FROM"),
+      RESEND_API_KEY: "re_clave_de_prueba",
+    });
+    expect(env).toMatchObject({ EMAIL_VERIFICATION: true, MAIL_PROVIDER: "resend" });
+    expect(env.MAIL_FROM).toMatch(/<[^<>@]+@[^<>@]+>$/);
+  });
+
+  it("explica la marcha atrás: EMAIL_VERIFICATION a off", () => {
+    expect(guide()).toContain("`EMAIL_VERIFICATION` a `off`");
+  });
+});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
cd server && npx vitest run test/config/mail-env.test.ts test/deploy
```

Expected: FAIL — el Blueprint no declara las variables, las en blanco impiden arrancar y no existen `docs/correo.md` ni las menciones en el README y la guía.

- [ ] **Step 3: Implementar**

`server/src/config/env.ts` (en blanco = no definida, solo para las variables del correo):

```diff
diff --git a/server/src/config/env.ts b/server/src/config/env.ts
index badeac0..cff8840 100644
--- a/server/src/config/env.ts
+++ b/server/src/config/env.ts
@@ -59,6 +59,19 @@ export type Env = z.infer<typeof envSchema>;
 
 type Source = Record<string, string | undefined>;
 
+/**
+ * Una variable del correo que queda en blanco en el panel de Render (la clave que aún no se pegó, por ejemplo) cuenta como no
+ * definida: de otro modo el servicio no arrancaría por algo que, con el correo apagado, nadie usa. Solo se perdonan las del
+ * correo; cualquier otra variable en blanco sigue siendo un error.
+ */
+const MAIL_VARIABLES = ["EMAIL_VERIFICATION", "MAIL_PROVIDER", "RESEND_API_KEY", "MAIL_FROM", "ALLOW_MEMORY_MAIL"] as const;
+
+function withoutBlankMailSettings(source: Source): Source {
+  const kept = { ...source };
+  for (const name of MAIL_VARIABLES) if (kept[name]?.trim() === "") delete kept[name];
+  return kept;
+}
+
 /**
  * Las reglas de producción se miran sobre los valores crudos, no sobre el resultado de zod: zod no ejecuta las reglas
  * cruzadas si falta una variable obligatoria, y así olvidar DATABASE_URL ocultaría el resto de los problemas.
@@ -83,7 +96,8 @@ function productionProblems(source: Source): string[] {
   return problems;
 }
 
-export function loadEnv(source: Source = process.env): Env {
+export function loadEnv(rawSource: Source = process.env): Env {
+  const source = withoutBlankMailSettings(rawSource);
   const result = envSchema.safeParse(source);
   const problems = [
     ...(result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)),
```

`render.yaml`:

```diff
diff --git a/render.yaml b/render.yaml
index 3858c89..ad44fa1 100644
--- a/render.yaml
+++ b/render.yaml
@@ -33,3 +33,11 @@ services:
       # La cadena de conexión de Neon (la directa, no la del pooler): se pega al crear el servicio y no se versiona.
       - key: DATABASE_URL
         sync: false
+      # Cuentas con código por correo (guía: docs/correo.md). Se activan desde el panel de Render, no desde este archivo:
+      # EMAIL_VERIFICATION=on y MAIL_PROVIDER=resend, junto con estas dos. Sin ellas (o con la verificación apagada) la
+      # aplicación funciona como antes. Aquí solo quedan declaradas, sin valor (la clave es un secreto y no se versiona):
+      # Render ignora las variables `sync: false` al actualizar un Blueprint que ya existe, así que se añaden a mano.
+      - key: RESEND_API_KEY
+        sync: false
+      - key: MAIL_FROM
+        sync: false
```

`server/.env.example`:

```diff
diff --git a/server/.env.example b/server/.env.example
index 512f23b..5dd5977 100644
--- a/server/.env.example
+++ b/server/.env.example
@@ -25,3 +25,15 @@ COOKIE_SAME_SITE=lax
 # Cuántos proxies hay delante del servidor (0 = ninguno). Define de dónde sale la IP de cada petición, que usan los
 # límites de intentos. En producción es obligatorio; en Render se verifica tras desplegar (docs/despliegue.md, sección 5).
 TRUST_PROXY=0
+
+# Cuentas con código por correo (etapa 7). Con off la aplicación funciona como siempre y no pide nada de correo; con on,
+# registrarse y «olvidé mi contraseña» envían un código de 6 dígitos al correo. Guía: docs/correo.md.
+EMAIL_VERIFICATION=off
+
+# console (desarrollo): el correo "se envía" a la consola del servidor, sin Resend. resend: lo envía Resend (obligatorio en
+# producción con EMAIL_VERIFICATION=on). Si no se define, es console en desarrollo.
+MAIL_PROVIDER=console
+
+# Solo con MAIL_PROVIDER=resend. La clave se crea en resend.com con permiso solo de envío y no se sube a git.
+# RESEND_API_KEY=
+# MAIL_FROM=Pokémon Minigames <no-responder@tu-dominio.me>
```

`docs/correo.md` (la guía para Marco; el valor `tu-dominio.me` es un ejemplo, y la clave solo se pega en el panel de Render):

```markdown
# Correo: cuentas con código (Resend)

Esta guía activa en el sitio en vivo las **cuentas con código por correo**: al registrarse llega un código de 6 dígitos que hay que escribir para abrir la cuenta, y el inicio de sesión gana el enlace «¿Olvidaste tu contraseña?», que también funciona con un código por correo. Los correos los envía **Resend**, un servicio con capa gratuita. Render (capa gratuita) bloquea el correo directo por SMTP, así que hace falta un servicio como Resend que se use por internet.

Con lo que viene de fábrica (`EMAIL_VERIFICATION` apagada) el juego funciona exactamente como antes; nada de esto es obligatorio hasta que decidas activarlo.

## Qué cambia cuando lo activas

- **Registro:** la cuenta se crea, llega un correo con el código y solo entra quien lo escribe. Un código dura 10 minutos, vale una sola vez y se bloquea tras 5 intentos equivocados.
- **Olvidé mi contraseña:** el enlace está en la pantalla de inicio de sesión. Se escribe el correo, llega un código y se elige una contraseña nueva. Al cambiarla se cierran las sesiones abiertas.
- **Límites:** un código nuevo por correo cada 60 segundos, y como máximo 5 por hora por correo y 10 por hora por IP. La capa gratuita de Resend permite 100 correos al día (y tiene un tope mensual; míralo en [resend.com/pricing](https://resend.com/pricing)).
- Nadie puede saber desde fuera si un correo tiene cuenta: la pantalla contesta lo mismo en los dos casos.
- **Cuentas que ya existen:** las de antes de esta versión quedan verificadas. Las que se hayan creado con el interruptor apagado y nunca verificaron su correo tendrán que hacerlo la primera vez que inicien sesión con el interruptor encendido: el servidor les envía el código.

## Antes de empezar

Necesitas:

1. **Un dominio propio.** Es lo único que puede costar dinero. El juego sigue en su dirección de `onrender.com`; el dominio solo sirve para que los correos salgan con un remitente tuyo (por ejemplo `no-responder@tu-dominio.me`).
2. **Una cuenta gratuita en Resend** ([resend.com](https://resend.com)).
3. **Acceso al panel de Render**, donde ya está el servicio `pokemon-minigames`.

Calcula media hora de trabajo más la espera de los registros DNS (de unos minutos a unas horas).

> **La clave de API es un secreto: solo se pega en el panel de Render.** Nunca en el chat, en un archivo del repositorio, en una captura ni en un correo. Si por error se muestra en algún sitio, bórrala en Resend y crea otra (paso 4).

## 1. Conseguir un dominio

- Si tienes el **GitHub Student Developer Pack**, mira [education.github.com/pack](https://education.github.com/pack): ha incluido un dominio gratis por un año (por ejemplo un `.me` en Namecheap). Confirma allí que la oferta sigue vigente y sigue sus pasos.
- Si no, compra uno barato (unos pocos dólares al año) en cualquier registrador: Namecheap, Porkbun, Cloudflare Registrar…

Anota el nombre completo del dominio (en esta guía, `tu-dominio.me`). No hace falta que apunte a ninguna página.

## 2. Crear la cuenta de Resend

1. Entra en [resend.com](https://resend.com) → **Sign up** (con GitHub o con un correo) y confirma tu correo.
2. Déjala en el plan **Free**. No pide tarjeta.

## 3. Añadir el dominio en Resend y verificarlo

1. En Resend abre **Domains** → **Add Domain**.
2. Escribe el dominio. Resend recomienda enviar desde un **subdominio** (por ejemplo `mail.tu-dominio.me`) para que la reputación de los correos del juego no se mezcle con nada más; sirve cualquiera de las dos formas. Si usas el subdominio, el remitente del paso 5 será `no-responder@mail.tu-dominio.me`.
3. Elige la región más cercana que ofrezca (por ejemplo N. Virginia o São Paulo).
4. Resend muestra los **registros DNS** que hay que crear: la autenticación del remitente (**SPF**, un registro `TXT` y uno `MX`; en dominios nuevos a veces los muestra como `CNAME`) y la firma de los mensajes (**DKIM**, un registro `TXT`). Añade **exactamente los que Resend te muestra en su pestaña *Records***.
5. En el panel DNS de tu registrador (en Namecheap: *Domain List* → *Manage* → *Advanced DNS* → *Add New Record*) crea cada registro con el mismo tipo, nombre y valor. Si tu panel ya añade el dominio al final del nombre, escribe solo la parte de la izquierda (`resend._domainkey`, no `resend._domainkey.tu-dominio.me`). El `MX` lleva además la prioridad que indica Resend. Deja el TTL en *Automatic*.
6. **Recomendado: DMARC.** Crea un registro `TXT` con nombre `_dmarc` y valor `v=DMARC1; p=none;` (vigila sin rechazar nada). Resend lo explica en su sección DMARC.
7. De vuelta en Resend pulsa **Verify DNS Records**. El estado pasa de *Pending* a **Verified**; tarda de minutos a unas horas (Resend lo intenta durante 72 horas). No sigas hasta ver *Verified*.

## 4. Crear la clave de API

1. En Resend abre **API Keys** → **Create API Key**.
2. Nombre: `pokemon-minigames`. Permiso (*Permission*): **Sending access**, que solo permite enviar correos: si la clave se filtra, nadie puede leer ni borrar nada. Dominio (*Domain*): el que verificaste.
3. Resend muestra la clave **una sola vez** (empieza por `re_`). Cópiala y pasa al paso 5 sin cerrar la pestaña. Si la pierdes, bórrala y crea otra.

## 5. Poner las variables en Render

En [dashboard.render.com](https://dashboard.render.com) → servicio `pokemon-minigames` → **Environment** → **+ Add Environment Variable**. Añade estas cuatro variables (Render no las crea sola en un servicio que ya existe) y guarda **una sola vez**, con todas a la vez:

| Variable | Valor | Para qué |
|---|---|---|
| `RESEND_API_KEY` | la clave `re_…` que copiaste en el paso 4 | Permite enviar |
| `MAIL_FROM` | `Pokémon Minigames <no-responder@tu-dominio.me>` | El remitente: el dominio tiene que ser el que verificaste |
| `MAIL_PROVIDER` | `resend` | Envía con Resend |
| `EMAIL_VERIFICATION` | `on` | Enciende las cuentas con código |

Al guardar, elige **Save and deploy** (vuelve a desplegar la misma versión con las variables nuevas; con *Save only* no se despliega nada). En **Logs** debe aparecer `Servidor escuchando`. Si en cambio dice `Variables de entorno inválidas`, el mensaje nombra la variable (por ejemplo `RESEND_API_KEY: es obligatoria con MAIL_PROVIDER=resend`): corrígela y guarda; mientras tanto el servicio anterior sigue sirviendo.

## 6. Probar de verdad

1. Abre el sitio en una ventana privada y **regístrate con tu correo real**. Debe aparecer «Verifica tu correo».
2. Busca el mensaje «Tu código de Pokémon Minigames» (si no está en la bandeja, mira la **carpeta de spam**; en un dominio nuevo es normal al principio, y marcarlo como «no es spam» ayuda). Escribe el código: entras al lobby.
3. Cierra sesión y vuelve a entrar con tu contraseña: no pide código.
4. Cierra sesión otra vez, pulsa **¿Olvidaste tu contraseña?**, escribe tu correo, recibe el código, elige una contraseña nueva e inicia sesión con ella.

Si algo falla, mira la tabla del final.

## Marcha atrás

Si algo sale mal o quieres parar los correos: en Render → **Environment** pon `EMAIL_VERIFICATION` a `off` y guarda con **Save and deploy**. El sitio vuelve a funcionar exactamente como antes: registrarse no pide código y desaparece «¿Olvidaste tu contraseña?». Las cuentas creadas mientras estuvo activa se conservan, y las que aún no se habían verificado pueden iniciar sesión sin hacerlo. No hace falta borrar las demás variables.

## Si algo no funciona

| Qué ves | Qué mirar |
|---|---|
| «No pudimos enviar el correo. Inténtalo de nuevo en un momento.» | Resend rechazó el envío: clave mal copiada o borrada, dominio todavía sin verificar, o `MAIL_FROM` con un dominio distinto del verificado. En Resend, la sección **Logs** o **Emails** dice el motivo. |
| No llega nada, pero tampoco hay error | La carpeta de spam. Después, en Resend → **Emails**, el estado del mensaje (*Delivered*, *Bounced*…). |
| «Demasiados intentos. Inténtalo de nuevo en…» | Se alcanzó un límite (un código por minuto, 5 por hora, 5 intentos de código cada 10 minutos). La pantalla dice cuánto esperar. |
| El servicio no arranca: `Variables de entorno inválidas` | El mensaje nombra la variable que falta o está mal escrita. |
| Se acaba la cuota de Resend (100 al día) | El registro dice que no pudo enviar el correo. Espera al día siguiente o aplica la marcha atrás. |

## Probar en tu computadora sin Resend

En `server/.env` pon `EMAIL_VERIFICATION=on` (el proveedor de partida en desarrollo es `console`). Arranca el servidor con `npm run dev`: cada correo «se envía» a la consola del servidor con la línea `[correo simulado] para …`, y de ahí copias el código. En producción, con la verificación activa, el servidor **no** admite `console` (escribiría los códigos en el registro) y se niega a arrancar.
```

`docs/despliegue.md`:

```diff
diff --git a/docs/despliegue.md b/docs/despliegue.md
index da93d34..c549319 100644
--- a/docs/despliegue.md
+++ b/docs/despliegue.md
@@ -80,17 +80,27 @@ Imprime `401 401 401 401 401`. Ahora, desde otra red (el celular con datos móvi
 | `DATABASE_URL` | la cadena de Neon | Conexión a la base de datos |
 | `NODE_VERSION` | `24` | Versión de Node |
 | `CORS_ORIGIN` | *(no se define)* | Con un solo origen no hay CORS; solo se usaría si se alojara el cliente en otro dominio |
+| `EMAIL_VERIFICATION` | *(no se define)*: apagada | `on` activa las cuentas con código por correo (registro y «olvidé mi contraseña»); apagada, la aplicación funciona como siempre. Se cambia en el panel, no en `render.yaml` |
+| `MAIL_PROVIDER` | `resend` al activarla | Quién envía los correos. Con la verificación activa en producción solo se admite `resend` (`console` escribiría los códigos en el registro y `memory` es solo de la prueba E2E) |
+| `RESEND_API_KEY` | la clave de Resend (secreto) | Se añade a mano en el panel: `render.yaml` solo la declara, sin valor (Render ignora las variables `sync: false` al actualizar un Blueprint que ya existe). Con permiso solo de envío |
+| `MAIL_FROM` | `Pokémon Minigames <no-responder@tu-dominio.me>` | El remitente, con un dominio verificado en Resend |
 
 ## Seguridad: qué hay y qué no
 
 - Cookie `Secure` + `SameSite=Lax` y comprobación de origen en todas las peticiones que cambian algo (`POST`, `PUT`, `PATCH` y `DELETE`): una petición que el navegador dice venir de otro sitio se rechaza con 403.
 - Límites de peticiones por IP, en memoria: 5 intentos de login fallidos cada 15 minutos por IP y correo y 30 por IP sumando todos los correos (un login correcto reinicia la cuenta), 5 registros por hora por IP y 300 peticiones por minuto a la API. Al pasarse responde 429 con `Retry-After`.
-- No hay Helmet ni política de contenido (CSP), recuperación de contraseña por correo ni verificación de correo. El servicio es una sola instancia: los límites y las salas viven en su memoria.
+- Con las cuentas con código por correo activadas (apagadas de partida; ver más abajo), el código de 6 dígitos dura 10 minutos, vale una vez y se bloquea tras 5 intentos; se guarda solo como huella y nunca se escribe en el registro, y las respuestas no revelan si un correo tiene cuenta. Los envíos están limitados por correo y por IP (un código por minuto, 5 por hora por correo, 10 por hora por IP).
+- No hay Helmet ni política de contenido (CSP). El servicio es una sola instancia: los límites y las salas viven en su memoria.
+
+## Activar y desactivar las cuentas con código por correo
+
+Vienen **apagadas**: el despliegue con este código no cambia nada visible. Para activarlas hace falta un dominio, una cuenta de Resend y cuatro variables en el panel de Render; todo el camino, paso a paso, está en [`docs/correo.md`](correo.md). Para volver atrás basta con poner `EMAIL_VERIFICATION=off` en el panel.
 
 ## Actualizar y solucionar problemas
 
 - Cada `push` a `main` redespliega solo (`autoDeployTrigger: commit`). Las migraciones nuevas se aplican en cada compilación. Un redespliegue abandona las partidas en curso.
-- **"Variables de entorno inválidas" al arrancar:** el mensaje dice cuál falta (`COOKIE_SECURE`, `COOKIE_SAME_SITE` o `TRUST_PROXY`).
+- **"Variables de entorno inválidas" al arrancar:** el mensaje dice cuál falta (`COOKIE_SECURE`, `COOKIE_SAME_SITE` o `TRUST_PROXY`; con el correo activado, `MAIL_PROVIDER`, `RESEND_API_KEY` o `MAIL_FROM`). Mientras el arranque falle, Render sigue sirviendo el despliegue anterior.
 - **403 `FORBIDDEN` al iniciar sesión:** la petición llegó con un `Origin` distinto del propio servicio. Si usas un dominio propio asegúrate de entrar siempre por él.
 - **429 `RATE_LIMITED`:** se superó un límite; la respuesta dice cuántos segundos esperar.
+- **502 `EMAIL_SEND_FAILED` al registrarse o pedir un código:** Resend rechazó el envío (clave, dominio sin verificar, remitente de otro dominio o cuota diaria agotada). Ver [`docs/correo.md`](correo.md).
 - **La primera visita tarda:** es el servicio despertando. La prueba de humo y el aviso en pantalla ya lo esperan.
```

`README.md`:

````diff
diff --git a/README.md b/README.md
index 2c1878b..e4fbb77 100644
--- a/README.md
+++ b/README.md
@@ -58,6 +58,8 @@ npm run dev
 npm run dev:client
 ```
 
+Las cuentas con código por correo (verificar el correo al registrarse y «olvidé mi contraseña») vienen apagadas. Para probarlas en tu máquina pon `EMAIL_VERIFICATION=on` en `server/.env`: sin proveedor de correo, los mensajes se imprimen en la consola del servidor (`MAIL_PROVIDER=console`).
+
 En desarrollo el servidor de Vite hace de proxy de `/auth`, `/rooms`, `/pokemon`, `/stats`, `/users` y `/socket.io` al servidor del juego, de modo que cliente y API comparten origen y la cookie de sesión funciona. Abre `http://localhost:5173`, crea una cuenta y una sala; para jugar necesitas un segundo jugador (otro navegador o una ventana privada, con otra cuenta).
 
 ## Comandos
@@ -68,7 +70,7 @@ En desarrollo el servidor de Vite hace de proxy de `/auth`, `/rooms`, `/pokemon`
 | `npm run dev:client` | Cliente web con recarga en caliente |
 | `npm run build` | Construye el cliente (`client/dist`) y empaqueta el servidor (`server/dist/index.js`) |
 | `npm start` | Arranca la construcción de producción (necesita las variables de `NODE_ENV=production`, ver la guía de despliegue) |
-| `npm run e2e` | Construye y ejecuta las pruebas E2E (una partida completa, recargar en plena ronda, el límite de login, el tema y, en un navegador real, el diseño en móvil, el foco del teclado, el movimiento y las tipografías): crea su propia base de datos, la borra al terminar |
+| `npm run e2e` | Construye y ejecuta las pruebas E2E (una partida completa, recargar en plena ronda, el límite de login, las cuentas con código por correo, el tema y, en un navegador real, el diseño en móvil, el foco del teclado, el movimiento y las tipografías): crea su propia base de datos, la borra al terminar |
 | `npm test` | Todas las pruebas: servidor (usan la base `pokemon_minigames_test`) y cliente |
 | `npm run typecheck` | Verifica los tipos con `tsc` en todos los paquetes |
 | `npm run db:migrate -w server` | Crea/aplica migraciones en desarrollo |
@@ -81,10 +83,16 @@ Variable opcional del cliente: `VITE_API_URL` (URL base del servidor; vacía = e
 
 ## Producción y pruebas E2E
 
-El servidor sirve el cliente construido, la API y Socket.io desde un solo origen, así que en producción no hay CORS y la cookie de sesión es `Secure` + `SameSite=Lax`. Las peticiones que cambian algo se rechazan si vienen de otro origen (403 `FORBIDDEN`) y hay límites por IP en memoria: 5 intentos de login fallidos cada 15 minutos por IP y correo (y 30 por IP sumando todos los correos), 5 registros por hora y 300 peticiones por minuto a la API (429 `RATE_LIMITED` con `Retry-After`). Cómo desplegarlo, qué esperar de la capa gratuita y cómo comprobarlo: [`docs/despliegue.md`](docs/despliegue.md).
+El servidor sirve el cliente construido, la API y Socket.io desde un solo origen, así que en producción no hay CORS y la cookie de sesión es `Secure` + `SameSite=Lax`. Las peticiones que cambian algo se rechazan si vienen de otro origen (403 `FORBIDDEN`) y hay límites por IP en memoria: 5 intentos de login fallidos cada 15 minutos por IP y correo (y 30 por IP sumando todos los correos), 5 registros por hora y 300 peticiones por minuto a la API (429 `RATE_LIMITED` con `Retry-After`). Cómo desplegarlo, qué esperar de la capa gratuita y cómo comprobarlo: [`docs/despliegue.md`](docs/despliegue.md). Cómo activar las cuentas con código por correo en el sitio en vivo (dominio, Resend, variables de Render y marcha atrás): [`docs/correo.md`](docs/correo.md).
 
 `npm run e2e` necesita Chromium: `npx playwright install chromium` desde `e2e/`, o define `E2E_CHANNEL=msedge` (o `chrome`) para usar el navegador ya instalado. Con `E2E_ADMIN_DATABASE_URL` (o tu `server/.env`) crea la base `pokemon_minigames_e2e`. En GitHub, [`.github/workflows/ci.yml`](.github/workflows/ci.yml) corre tipos, pruebas, construcción y E2E en cada push a `main` y en cada pull request.
 
+## Cuentas con código por correo
+
+Con `EMAIL_VERIFICATION=on`, registrarse crea la cuenta pendiente y envía un código de 6 dígitos al correo (`/verificar`); sin escribirlo no se abre sesión. En el inicio de sesión aparece «¿Olvidaste tu contraseña?» (`/olvide` → `/restablecer`), que cambia la contraseña con otro código y cierra las sesiones abiertas. Un código dura 10 minutos, vale una vez y se bloquea tras 5 intentos; se guarda solo como huella (HMAC) y nunca se escribe en el registro; las respuestas no revelan si un correo tiene cuenta; hay límites de envío (un código por minuto por correo, 5 por hora por correo y 10 por hora por IP) y de intentos (5 cada 10 minutos por correo y 20 por hora por IP). Apagada (`off`, el valor de partida) la aplicación se comporta como antes y las rutas nuevas no existen.
+
+Los correos los envía [Resend](https://resend.com) (`MAIL_PROVIDER=resend`, con `RESEND_API_KEY` y `MAIL_FROM`); en desarrollo, la consola del servidor, y en las pruebas, un buzón en memoria.
+
 ## Estadísticas y perfil
 
 En **Mi perfil** (`/perfil`) cada persona ve sus partidas jugadas, ganadas, empatadas y perdidas, el porcentaje de victorias, la racha actual y la mejor, sus 3 Pokémon más ganados, el poder promedio de los Pokémon que ganó, su mejor partida y el historial de sus partidas (con el motivo del fin: abandono, desconexión, etc.). Al terminar una partida se puede abrir el perfil del rival (`/jugador/:username`), que solo muestra estadísticas. Solo cuentan las partidas completadas; las abandonadas no. Todo se calcula al pedirlo a partir de las partidas guardadas (no hay tablas de estadísticas aparte).
@@ -102,8 +110,13 @@ Para regenerar las capturas de arriba: `E2E_SCREENSHOTS=1 npm run e2e -w e2e --
 | Método y ruta | Descripción |
 |---|---|
 | `GET /health` | Estado del servidor |
-| `POST /auth/register` | Crea la cuenta; devuelve `user` (con su `preferences` de tema, nulas al principio) y `accessToken` y fija la cookie de refresco |
-| `POST /auth/login` | Inicia sesión |
+| `GET /auth/options` | Público. `{ emailVerification }`: si la verificación por correo está activa (el cliente muestra «¿Olvidaste tu contraseña?» solo entonces) |
+| `POST /auth/register` | Crea la cuenta; devuelve `user` (con su `preferences` de tema, nulas al principio) y `accessToken` y fija la cookie de refresco. Con la verificación activa no abre sesión: responde `202 { verification: "required", email }` y envía el código |
+| `POST /auth/login` | Inicia sesión. Con la verificación activa, una cuenta sin verificar recibe `403 EMAIL_NOT_VERIFIED` (tras acertar la contraseña) y un código nuevo |
+| `POST /auth/verify-email` | Solo con la verificación activa. `{ email, code }`: verifica el correo, abre la sesión y devuelve lo mismo que el login; `400 INVALID_CODE` ante cualquier fallo del código |
+| `POST /auth/verification/resend` | Solo con la verificación activa. `{ email }`: envía un código nuevo; siempre `202 { ok: true }`, exista o no la cuenta |
+| `POST /auth/password/forgot` | Solo con la verificación activa. `{ email }`: envía el código para cambiar la contraseña; siempre `202 { ok: true }` |
+| `POST /auth/password/reset` | Solo con la verificación activa. `{ email, code, password }`: cambia la contraseña, cierra las demás sesiones y da el correo por verificado; `204` sin abrir sesión |
 | `POST /auth/refresh` | Renueva la sesión con la cookie (rota el refresh token) |
 | `POST /auth/logout` | Cierra la sesión y borra la cookie |
 | `GET /auth/me` | Usuario actual |
````

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
cd server && npx vitest run --testTimeout=30000
cd .. && npm run typecheck
```

Expected: PASS (servidor: **806 pruebas**, una más omitida en Windows) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: guía del correo (Resend), variables de Render y activar/desactivar; las variables de correo en blanco no impiden arrancar" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Verificación final, mutaciones y entrega

**Files:** ninguno nuevo (verificación; si algo falla, se corrige en la tarea que lo introdujo).

- [ ] **Step 1: Verificación completa**

```bash
npm test
npm run typecheck
npm run build
git status
```

Expected: **1545 pruebas pasan** (806 de servidor, una más omitida en Windows, y 739 de cliente); `tsc` sin errores en los cuatro paquetes; el build deja `client/dist` y `server/dist/index.js`; `git status` no muestra nada pendiente (ni `.env`, ni `dist`, ni `e2e/test-results`).

- [ ] **Step 2: Presupuestos de tamaño**

```bash
cd client && npx vite build
```

Expected: el JavaScript comprimido ronda los 119 KB (+3 KB sobre la etapa 6; el presupuesto sigue siendo +40 KB sobre los 109 KB de partida) y el CSS sin comprimir queda en unos 37 KB (por debajo de los 40 KB).

- [ ] **Step 3: La E2E con navegadores reales**

```bash
E2E_CHANNEL=msedge npm run e2e
```

Expected: **22 pruebas pasan** y 1 se omite (la de las capturas); la base `pokemon_minigames_e2e` desaparece al terminar.

- [ ] **Step 4: Comprobar que las pruebas detectan fallos**

Rompe a propósito cada protección crítica, ejecuta la prueba indicada y restaura. Cada fila debe fallar; después de cada una, `git checkout -- <archivo>`.

| # | Archivo y cambio | Prueba que debe fallar |
|---|---|---|
| 1 | `server/src/auth/email-codes.ts`: el contador de intentos deja pasar muchos más de 5: `attempts < ${MAX_CODE_ATTEMPTS}` → `attempts < 5000` | `email-codes.test.ts` → «tras cinco fallos el código se bloquea: el sexto intento falla aunque sea el correcto y no gasta más» |
| 2 | `server/src/auth/email-codes.ts`: el código no vence: se quita `expires_at > ahora` de la reserva | `email-codes.test.ts` → «pasados 10 minutos ya no vale; un milisegundo antes todavía» |
| 3 | `server/src/auth/email-codes.ts`: un código se puede gastar dos veces: se quita la comprobación de que el borrado afectó a una fila | `email-codes.test.ts` → «si se pide otro código entre comprobar y consumir, el consumo falla (no se gasta un código que ya no vale)» y «dos peticiones que aciertan a la vez: solo una consume el código» |
| 4 | `server/src/auth/email-codes.ts`: el hash ya no incluye el propósito (un código de verificar valdría para restablecer) | `email-codes.test.ts` → «es estable, y cambia con la cuenta, el propósito, el código y la clave del servidor» |
| 5 | `server/src/auth/email-codes.ts`: el hash ya no incluye la cuenta | `email-codes.test.ts` → «es estable, y cambia con la cuenta, el propósito, el código y la clave del servidor» |
| 6 | `server/src/auth/email-codes.ts`: cualquier hash se da por bueno: la comparación devuelve siempre `true` | `email-codes.test.ts` → «pedir otro código reemplaza al anterior: cambia el hash, el vencimiento, el envío y los intentos» y «un código incorrecto da INVALID_CODE y gasta un intento» |
| 7 | `server/src/auth/email-codes.ts`: un código nuevo no reinicia los intentos del anterior | `email-codes.test.ts` → «pedir otro código reemplaza al anterior: cambia el hash, el vencimiento, el envío y los intentos» |
| 8 | `server/src/auth/auth.service.ts`: restablecer la contraseña ya no cierra las sesiones abiertas | `auth.recovery.test.ts` → «revoca todas las sesiones abiertas de la cuenta» |
| 9 | `server/src/auth/auth.service.ts`: restablecer la contraseña ya no da el correo por verificado | `auth.recovery.test.ts` → «verifica el correo de una cuenta pendiente (recibir el código ya lo demuestra) y no toca la fecha de una ya verificada» |
| 10 | `server/src/auth/auth.service.ts`: al restablecer queda vivo el código de verificar pendiente | `auth.recovery.test.ts` → «verifica el correo de una cuenta pendiente (recibir el código ya lo demuestra) y no toca la fecha de una ya verificada» |
| 11 | `server/src/auth/auth.service.ts`: una cuenta sin verificar entra con la contraseña correcta | `auth.verification.test.ts` → «una cuenta sin verificar con la contraseña correcta da EMAIL_NOT_VERIFIED (403) y no abre sesión» y «una cuenta de antes de activar la verificación, sin verificar, tiene que verificar al volver a entrar» |
| 12 | `server/src/auth/auth.service.ts`: una cuenta sin verificar renueva su sesión | `auth.verification.test.ts` → «una sesión de una cuenta sin verificar no se renueva (EMAIL_NOT_VERIFIED) y su token sigue sin gastarse» |
| 13 | `server/src/auth/auth.service.ts`: una cuenta con partidas se considera pendiente (se podría reemplazar) | `auth.verification.test.ts` → «una cuenta sin verificar con partidas pero sin sesiones tampoco se reemplaza ni se borra» |
| 14 | `server/src/auth/auth.service.ts`: una cuenta con sesiones abiertas se considera pendiente | `auth.verification.test.ts` → «una cuenta sin verificar que tiene historial (sesiones o partidas) nunca se reemplaza ni se borra» |
| 15 | `server/src/auth/auth.service.ts`: la limpieza borra también cuentas heredadas con partidas | `auth.verification.test.ts` → «una cuenta sin verificar con partidas pero sin sesiones tampoco se reemplaza ni se borra» |
| 16 | `server/src/auth/auth.service.ts`: la limpieza borra también las cuentas pendientes recientes (menos de 24 h) | `auth.verification.test.ts` → «un usuario ocupado por otra cuenta da USERNAME_TAKEN, sin distinguir mayúsculas» y «un usuario ocupado por otra cuenta pendiente de menos de 24 h sigue ocupado» |
| 17 | `server/src/auth/auth.service.ts`: «olvidé mi contraseña» delata que el correo no existe (falla con un error) | `auth.recovery.test.ts` → «a un correo que no existe no le envía nada ni da ningún error» |
| 18 | `server/src/auth/auth.service.ts`: reenviar el código de verificar escribe a cuentas ya verificadas | `auth.recovery.test.ts` → «a una cuenta ya verificada, o a un correo que no existe, no les envía nada» |
| 19 | `server/src/auth/recovery.routes.ts`: verificar el correo no reserva el intento: no hay límite de fallos | `accounts.routes.test.ts` → «5 códigos equivocados por correo: el sexto intento da 429 aunque sea el correcto, y también con un correo que no existe» |
| 20 | `server/src/auth/recovery.routes.ts`: restablecer la contraseña no reserva el intento: no hay límite de fallos | `accounts.routes.test.ts` → «restablecer tiene el mismo límite: 5 códigos equivocados y el sexto da 429 aunque sea el correcto, también con un correo que no existe» |
| 21 | `server/src/auth/recovery.routes.ts`: un código acertado no devuelve el hueco del límite de fallos | `accounts.routes.test.ts` → «verificar con el código correcto reinicia la cuenta de fallos del correo» y «restablecer tiene el mismo límite: 5 códigos equivocados y el sexto da 429 aunque sea el correcto, también con un correo que no existe» |
| 22 | `server/src/auth/recovery.routes.ts`: «olvidé mi contraseña» espera al envío para contestar (el tiempo delata si la cuenta existe) | `accounts.routes.test.ts` → ««olvidé» y «reenviar» contestan antes de buscar la cuenta y de enviar: ni el tiempo delata si el correo existe» |
| 23 | `server/src/auth/recovery.routes.ts`: «olvidé mi contraseña» no reserva el límite de envíos | `accounts.routes.test.ts` → ««olvidé» dos veces seguidas al mismo correo: la segunda da 429 con la espera, exista o no la cuenta» y «pasados 60 s vuelve a dejar; y como mucho 5 por hora al mismo correo» |
| 24 | `server/src/auth/auth.routes.ts`: las rutas de códigos se montan aunque el interruptor esté apagado | `accounts.routes.test.ts` → «las rutas de los códigos no existen: 404» |
| 25 | `server/src/auth/auth.routes.ts`: el buzón de pruebas se monta con otro proveedor (por ejemplo resend) | `accounts.routes.test.ts` → «no existe con otro proveedor de correo» |
| 26 | `server/src/auth/auth.routes.ts`: el buzón de pruebas se monta en producción sin ALLOW_MEMORY_MAIL | `accounts.routes.test.ts` → «en producción solo existe con ALLOW_MEMORY_MAIL=true (el servidor de la prueba E2E)» |
| 27 | `server/src/auth/auth.routes.ts`: el login sin verificar manda un código nuevo aunque el límite de envíos lo impida | `accounts.routes.test.ts` → «entrar sin verificar respeta la espera: dos intentos seguidos envían un solo código» |
| 28 | `server/src/config/env.ts`: en producción se admite la consola como proveedor (escribiría los códigos en el registro) | `mail-env.test.ts` → «no admite la consola: escribiría los códigos en el registro» |
| 29 | `server/src/config/env.ts`: en producción se admite la memoria sin ALLOW_MEMORY_MAIL | `mail-env.test.ts` → «la memoria solo se admite con ALLOW_MEMORY_MAIL=true (el servidor de la prueba E2E)» |
| 30 | `server/src/config/env.ts`: una variable de correo en blanco impide arrancar | `mail-env.test.ts` → «en producción arranca con el correo apagado, como si no estuvieran» y «también las que solo tienen espacios» |
| 31 | `server/src/mail/resend-mailer.ts`: el envío a Resend no tiene tiempo máximo | `resend-mailer.test.ts` → «envía un POST a la API de Resend con la clave, el remitente, el destinatario y el contenido» y «si Resend no responde a tiempo, lo dice (y de verdad se corta al pasar el tiempo máximo)» |
| 32 | `server/src/mail/resend-mailer.ts`: el envío a Resend no lleva la clave | `resend-mailer.test.ts` → «envía un POST a la API de Resend con la clave, el remitente, el destinatario y el contenido» |
| 33 | `server/src/mail/resend-mailer.ts`: el mensaje de error de Resend (que puede repetir la dirección) llega al registro | `resend-mailer.test.ts` → «una respuesta que no es 2xx lanza un MailerError con el estado y el nombre del error, sin la dirección ni el mensaje del proveedor» y «si el cuerpo del error no es JSON, el mensaje lleva solo el estado» |
| 34 | `server/src/http/limits.ts`: no hay espera entre dos envíos de código al mismo correo | `accounts.routes.test.ts` → ««olvidé» dos veces seguidas al mismo correo: la segunda da 429 con la espera, exista o no la cuenta» y «registrarse también envía código: el mismo correo dos veces seguidas espera 60 s» |
| 35 | `server/src/http/limits.ts`: el tope de fallos de código por correo sube de 5 a 500 | `accounts.routes.test.ts` → «5 códigos equivocados por correo: el sexto intento da 429 aunque sea el correcto, y también con un correo que no existe» |
| 36 | `server/src/auth/code-policy.ts`: los códigos duran 60 minutos en vez de 10 | `code-policy.test.ts` → «es la de la spec: 6 dígitos, 10 minutos, 5 intentos y 24 horas para las cuentas pendientes» |
| 37 | `client/src/components/CodeField.tsx`: el campo del código deja letras en vez de quitarlas | `verify-email.test.tsx` → «deja solo los dígitos, como mucho seis, también al pegar con espacios o guiones» |
| 38 | `client/src/pages/VerifyEmailPage.tsx`: al llegar del registro se puede pedir otro código sin esperar | `verify-email.test.tsx` → «al llegar desde el registro ya se envió un código: el botón espera 60 s y luego se activa» |
| 39 | `client/src/pages/VerifyEmailPage.tsx`: tras verificar se ignora a dónde se iba | `verify-email.test.tsx` → «si se venía de una pantalla que pedía sesión (una sala, por ejemplo), tras verificar vuelve a ella» |
| 40 | `client/src/pages/PasswordRecoveryPages.tsx`: la contraseña nueva viaja en el estado de la navegación | `password-recovery.test.tsx` → «cambia la contraseña y vuelve al inicio de sesión con el aviso de éxito» |
| 41 | `client/src/pages/PasswordRecoveryPages.tsx`: tras cambiar la contraseña se va al lobby en vez de al inicio de sesión | `password-recovery.test.tsx` → «cambia la contraseña y vuelve al inicio de sesión con el aviso de éxito» |
| 42 | `client/src/pages/AuthPages.tsx`: «¿Olvidaste tu contraseña?» se ofrece aunque la verificación esté apagada | `password-recovery.test.tsx` → «con la verificación apagada no aparece (todo como antes)» |
| 43 | `client/src/session/auth-options.ts`: si falla la consulta de opciones se da la verificación por activa | `auth-options.test.tsx` → «si la consulta falla se queda apagada, sin romper la pantalla, y la próxima vez se vuelve a preguntar» |
| 44 | `client/src/routes.tsx`: /restablecer deja de ser pública | `routes.test.tsx` → «/olvide y /restablecer son públicas: quien no ha entrado ve sus pantallas» |

Al terminar, `git status` no debe mostrar cambios.

- [ ] **Step 5: Recorrer las pantallas nuevas en el navegador, en 375 px y en escritorio**

Pon `EMAIL_VERIFICATION=on` en `server/.env` (sin definir `MAIL_PROVIDER`: en desarrollo es `console`), arranca `npm run dev` y `npm run dev:client`, y recorre con una cuenta inventada (por ejemplo `correo_x@example.com` / `correo_x` / `pikachu-123`):

1. Registro → «Verifica tu correo»: el código sale en la consola del servidor (línea `[correo simulado] para …`). Un código equivocado se explica; el botón «Reenviar código» espera; pegar «123 456» deja 123456; con el verdadero entras al lobby.
2. Cierra sesión. En el login aparece «¿Olvidaste tu contraseña?» → correo → «Nueva contraseña» con el código de la consola → vuelves al login con «Contraseña cambiada…» → entras con la nueva.
3. Recarga `/verificar` y `/restablecer`: piden el correo. Vuelve a poner `EMAIL_VERIFICATION=off` y reinicia el servidor: el enlace «¿Olvidaste tu contraseña?» desaparece y registrarse da la sesión en el acto, como siempre.
4. En cada pantalla nueva, con el tema Clásico y Pokédex (claro y oscuro) y con la ventana a 375 px, comprueba en la consola `document.documentElement.scrollWidth === document.documentElement.clientWidth` y ejecuta la auditoría de contraste (`eval(await (await fetch("/scripts/contrast-audit.js")).text())` y después `await __contrastAuditAll()`).

Expected: sin desplazamiento horizontal; la auditoría devuelve una lista **vacía** en los cuatro temas y modos; sin errores en la consola del navegador (salvo el 401 esperado de `/auth/refresh` cuando no hay sesión). Al terminar, `server/.env` vuelve a `EMAIL_VERIFICATION=off` y borras de la base de desarrollo las cuentas de prueba.

- [ ] **Step 6: Publicar la rama**

```bash
git push -u origin etapa-7-cuentas
```

Expected: rama `etapa-7-cuentas` en `https://github.com/marcovinir/pokemon-minigames`; el primer resultado real de GitHub Actions confirma el CI (la E2E corre con el servidor en `EMAIL_VERIFICATION=on`). La integración a `main` la decide Marco; al subir `main`, Render redespliega solo **con el interruptor apagado**: no cambia nada visible. Para activar el correo, Marco sigue `docs/correo.md` (dominio, Resend, DNS, clave de API pegada solo en el panel de Render y las cuatro variables); la marcha atrás es `EMAIL_VERIFICATION=off`.

---

## Self-Review

**Cobertura de la spec de la etapa 7:**

| Requisito | Tarea |
|---|---|
| §2 Interruptor `EMAIL_VERIFICATION` apagado por defecto; `MAIL_PROVIDER`, `RESEND_API_KEY`, `MAIL_FROM`, `ALLOW_MEMORY_MAIL` | 1 (y 13 para las variables en blanco) |
| §2 Orden de salida: `TRUST_PROXY` primero | 0 |
| §4.1 Migración aditiva (`email_verified_at`, `email_codes`, cuentas de hoy verificadas) | 2 |
| §4.8 `Mailer` con Resend, consola y memoria; plantillas en español | 3 |
| §4.2 y §4.3 Códigos: hash con clave, intento reservado en una sola instrucción, uso único, reloj inyectable | 4 |
| §4.5 y §3 Registro pendiente, reemplazo, limpieza a las 24 h, cuentas heredadas; login y `refresh` sin verificar | 5 |
| §4.6 Reenviar, «olvidé» y restablecer (revoca sesiones, no abre ninguna, verifica el correo) | 6 |
| §4.7 Límites (espera, envíos por correo e IP, fallos de código) | 7 |
| §4.4, §4.6 y §4.10 Rutas, respuestas que no delatan, interruptor apagado = 404, buzón de pruebas | 8 |
| §5 API del cliente, almacén de sesión y consulta de si la verificación está activa | 9 |
| §3 y §5 «Verifica tu correo», campo del código, reenvío con espera, volver a donde se iba | 10 |
| §3 y §5 «Olvidé mi contraseña», «Nueva contraseña», enlace solo con la verificación activa | 11 |
| §7 E2E en navegador real con `memory`; bloqueo tras 5 fallos; login sin verificar | 12 |
| §6 y §10 Guía para Marco, variables de Render, activar y marcha atrás, README | 13 |
| §7 Mutaciones, revisión final, prueba real | 14 (y la prueba real, de Marco, tras activar) |

**Decisiones tomadas al escribir el plan (la spec ya las recoge o no las contradice):** la espera de 60 s entre dos envíos es **por correo, sea cual sea el propósito**, así que quien se acaba de registrar y pide «olvidé» al instante recibe la espera (la E2E lo muestra y la respeta); el bloqueo de cinco fallos se prueba en la E2E sobre la pantalla de verificar y, sin necesidad de ninguna espera, sobre `/restablecer` con un correo que no existe (que además demuestra que no delata nada); `render.yaml` no fija `EMAIL_VERIFICATION` ni `MAIL_PROVIDER` (se ponen en el panel) y el servidor trata en blanco las variables del correo como no definidas; `GET /auth/options` existe siempre para que el cliente sepa si ofrecer «¿Olvidaste tu contraseña?»; tras verificar desde el login se vuelve a la pantalla que se intentaba abrir (`returnTo`), pero desde el registro se va al lobby, como siempre; el buzón en memoria no tiene tope porque solo lo usa el servidor de la E2E, y por eso `ALLOW_MEMORY_MAIL` es la única forma de tenerlo en producción.

**Lo que encontró la verificación real (ya corregido en el código de este plan):** (1) la E2E de «olvidé mi contraseña» tropezó con la espera de 60 s que dejó el registro, y la prueba ahora la espera y comprueba el mensaje; (2) pedir `MAIL_PROVIDER=resend` en el Blueprint habría dejado al servicio sin arrancar hasta tener la clave, y la documentación de Render dice que al actualizar un Blueprint existente se ignoran las variables `sync: false`: ahora `render.yaml` solo declara la clave y el remitente, la guía manda añadir las cuatro variables a mano (guardando con «Save and deploy») y el servidor perdona las del correo que queden en blanco; (3) la spec decía «o a donde se intentaba ir» y la pantalla de verificar siempre iba al lobby: ahora el login le pasa `returnTo`; (4) siete de las mutaciones pasaron la primera vez sin que fallara ninguna prueba (seis protecciones sin vigilante) —el límite de fallos al *restablecer* (solo se probaba al verificar), acertar el código devolviendo el hueco del límite, contestar «olvidé» y «reenviar» *antes* de enviar, el buzón de pruebas en producción con el correo apagado, las cuentas heredadas que solo conservan partidas (dos mutaciones; y las cuentas heredadas de las pruebas nacían con la hora real de la base, no la del reloj de la prueba, así que la limpieza a las 24 h nunca las veía) y los 10 minutos escritos como número—: cada una tiene ya su prueba, que se comprobó rompiendo el código otra vez.

**Fuera de esta etapa:** cambiar el correo de una cuenta, avisar por correo de un cambio de contraseña, SMS o WhatsApp, enlaces mágicos, entrar con Google o GitHub, doble factor, captcha, un panel de administración, y las etapas 8 y 9 (pulido de la partida; revancha en la misma sala y foto de perfil).

**Consistencia de tipos:** los nombres se reutilizan tal como están en los bloques `Interfaces` de cada tarea. Todo el código se escribió y ejecutó antes de incluirlo: 806 pruebas de servidor y 739 de cliente en verde, `tsc` sin errores, la E2E con navegador real, 44 mutaciones a propósito detectadas por las pruebas, y el recorrido de las pantallas nuevas en escritorio y en 375 px con la auditoría de contraste real limpia en los 4 temas y modos.
