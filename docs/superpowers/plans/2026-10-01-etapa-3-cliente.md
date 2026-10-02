# Pokémon Minigames — Etapa 3: Cliente web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que dos personas jueguen una partida completa desde el navegador, en español: registrarse o iniciar sesión, crear una sala o unirse con un código, elegir tipos, nombrar Pokémon contra el reloj, ver el resultado de cada ronda y el resumen final, y recuperar la partida si recargan la página o se cae la conexión. Cada jugador elige entre dos temas visuales (Clásico y Pokédex), en modo claro u oscuro.

**Architecture:** `GameClient` (servicio sin React que envuelve el socket con los tipos de `shared/`) entrega cada evento del servidor a `applyServerEvent`, una función pura que produce el estado nuevo, y este vive en un store de Zustand; los componentes solo leen el store. Los servicios (API, sesión, socket, tema, catálogo) se inyectan por contexto, de modo que las pruebas los reemplazan por dobles. El access token vive solo en memoria y se renueva con la cookie de refresco (una sola renovación aunque fallen varias peticiones a la vez). Los eventos del servidor llevan `serverNow` para corregir el desfase entre el reloj del navegador y el del servidor. Todos los colores salen de tokens CSS por tema y modo.

**Tech Stack:** Vite 8, React 19, React Router 8, Zustand 5, Tailwind 4, `socket.io-client` 4.8, TypeScript 7, Vitest 5 con Testing Library y jsdom 30. Servidor sin cambios de stack (Node 24, Express 5, Socket.io 4.8, Prisma 7.10.0, PostgreSQL 18).

**Spec:** `docs/superpowers/specs/2026-09-30-etapa-3-cliente-design.md` (complementa la general y la de la etapa 2; donde la de la etapa 3 es más específica, manda).

## Global Constraints

- Todo el texto de la interfaz va en español, con ortografía completa; los identificadores de código, en inglés. Los códigos de error (`ErrorCode`) se traducen en un solo lugar (`client/src/i18n/es.ts`).
- El access token solo vive en memoria: nunca en `localStorage`, `sessionStorage` ni en la URL. Lo único que se guarda en el navegador es la preferencia de tema.
- Los componentes usan tokens semánticos (variables CSS) y nunca colores literales, salvo los 18 colores de tipo (con su color de texto calculado por contraste).
- Contraste mínimo WCAG AA: 4,5:1 para texto normal y 3:1 para texto grande, en los dos temas y los dos modos. Un estado de pasar el ratón nunca puede bajar la opacidad del texto.
- Todo cronómetro se calcula como `plazo - (Date.now() + desfase)`, con `desfase = serverNow - Date.now()` medido al recibir el evento. El cronómetro solo muestra: el servidor decide cuándo termina todo.
- El autocompletado no filtra por tipo ni revela respuestas; el texto se normaliza con la misma función que el servidor (`normalizeName`, ahora en `shared/`).
- Durante una ronda, del rival solo se muestran su total y la cantidad de Pokémon.
- La cookie de refresco tiene `Path=/auth`: las llamadas a `/auth/*` van al mismo origen. En desarrollo, Vite hace de proxy de `/auth`, `/rooms`, `/pokemon` y `/socket.io` (con WebSocket) al servidor del juego, sin prefijo.
- Se sigue TDD: cada comportamiento se prueba antes de implementarlo.
- Las dependencias de `server/` no cambian. `prisma`, `@prisma/client` y `@prisma/adapter-pg` siguen fijadas en **7.10.0**. No ejecutes `npm audit fix --force`.
- Las credenciales de PostgreSQL y los secretos nunca se versionan (`server/.env` y `server/.env.test` están en `.gitignore`).

## Review Focus

Condiciones que la spec no detalla pero que muerden a una persona real; cada una tiene su prueba en la tarea indicada.

1. **Reloj y desfase.** Un navegador adelantado o atrasado debe ver el mismo plazo que el servidor; los cronómetros nunca bajan de 0 ni se quedan colgados al cambiar de plazo o al desmontarse; la pausa entre rondas usa `nextRoundAt`, y tras la última ronda no se anuncia una siguiente. → Task 2 (servidor), Task 7 (`clock.test.ts`, `apply-event.test.ts`), Task 9 (`Timer`) y Task 11.
2. **Sesión.** Varias peticiones que reciben 401 a la vez comparten una sola renovación; si la renovación falla se cierra la sesión sin bucles; el arranque consulta al servidor una sola vez (React en modo estricto); al recargar se recupera la sesión; un logout fallido igual cierra la sesión local; las guardas de ruta no muestran el formulario mientras se recupera la sesión. → Task 6 (`client.test.ts`), Task 8 (`session-store.test.ts`) y Task 12 (`routes.test.tsx`).
3. **Reconexión y reemplazo de estado.** `room-state` reemplaza todo lo que había (es la vía de recuperación); un `round-result` repetido tras reconectar no duplica el Pokémon; el socket usa el token vigente en cada reconexión y reintenta una sola vez si el servidor rechaza el token; un socket descartado no vuelve a tocar el estado; si el servidor cierra la conexión (la partida se abrió en otra pestaña) no se queda en "Reconectando…" para siempre, y una caída con la partida ya terminada no borra el resumen. → Task 7 (`apply-event.test.ts`, `game-client.test.ts`) y Task 11 (`room.test.tsx`).
4. **Fuga de información.** El panel del rival nunca muestra nombres de Pokémon; la lista de nombres del autocompletado no trae tipos ni stats ni se filtra por tipo; el campo no corrige ni envía nada por su cuenta (un solo intento por ronda). → Task 3 (`GET /pokemon/names`), Task 9 (`basics.test.tsx`, `autocomplete.test.tsx`) y Task 11.
5. **Accesibilidad y contraste real.** Los tokens cumplen AA por prueba; además se mide el texto que realmente se ve en el navegador (botón del encabezado, hover de los botones, la lista de sugerencias abierta, los cuatro temas/modos); el combobox, los avisos y los resultados se anuncian a los lectores de pantalla; todo es operable con teclado. → Task 4 (`tokens.test.ts`), Task 9, Task 11 y Task 13 (auditoría en el navegador).

---

## File Structure

```
pokemon-minigames/
├── package.json                      # workspaces: shared + server + client; scripts dev, dev:client, build, test, typecheck
├── shared/src/normalize.ts           # NUEVO: normalizeName (antes solo en el servidor)
├── server/                           # tres añadidos para el cliente
│   ├── src/catalog/catalog.routes.ts # NUEVO: GET /pokemon/names
│   └── (serverNow, nextRoundAt, GET /rooms/current en motor, vista, sala y rutas)
└── client/
    ├── index.html                    # script que aplica el tema antes de pintar
    ├── vite.config.ts  tsconfig.json  package.json
    ├── scripts/ contrast-audit.js  dev-bot.mjs
    ├── src/
    │   ├── main.tsx  App.tsx  routes.tsx  services.tsx  index.css
    │   ├── api/        client.ts  endpoints.ts  types.ts
    │   ├── session/    session-store.ts
    │   ├── catalog/    names-store.ts
    │   ├── game/       clock.ts  apply-event.ts  store.ts  game-client.ts  durations.ts
    │   ├── theme/      tokens.css  theme-store.ts  contrast.ts  type-styles.ts
    │   ├── i18n/       es.ts
    │   ├── components/ Button  TextField  TypeChip  Timer  PokemonCard  Panels  Notice  ThemeSwitcher  Header  Autocomplete
    │   └── pages/      AuthForm  AuthPages  auth-validation  Lobby  room-form  room/ (use-room, Waiting, Countdown, TypePicker, Round, RoundResult, Summary, LeaveButton, RoomPage)
    └── test/           setup.ts  helpers/ (events, fake-socket, services)  + una carpeta de pruebas por área
```

La lógica del juego del cliente (`game/`) no importa React salvo `useCountdown`; los componentes solo leen el store y llaman a las acciones de `GameClientApi`.

## Notas de entorno (leer antes de empezar)

- Se parte de `main` con las etapas 1 y 2 completas (351 pruebas). Trabaja en una rama `etapa-3-cliente`.
- `server/.env` y `server/.env.test` ya existen (rol `pokemon_app`). Las pruebas del servidor usan `pokemon_minigames_test` y **borran datos**; las del cliente no usan base de datos.
- Todo el código de este plan se ejecutó antes de incluirlo, tarea por tarea, en un clon limpio de `main`: 366 pruebas de servidor y 303 de cliente en verde, `tsc` sin errores y `vite build` correcto. Además se recorrió una partida completa en un navegador real contra el servidor real, y el código final incorpora lo que halló la revisión independiente de toda la rama (ver Self-Review).
- Puertos: servidor del juego 3000, cliente (Vite) 5173. Si el 3000 está ocupado por un servidor viejo, detenlo antes de arrancar.
- npm 12 bloquea los scripts de instalación de algunas dependencias y lo avisa: es normal, no hace falta aprobarlos.
- En jsdom `new URL(..., import.meta.url)` no sirve con `readFileSync`; las pruebas que leen archivos usan `join(import.meta.dirname, ...)`.
- El navegador de prueba de la Task 13 deja usuarios `anfitrion_*`, `bot_*` y una partida en la base de **desarrollo**; la tarea indica cómo borrarlos.

---

### Task 1: `normalizeName` pasa a `shared/`

**Files:**
- Create: `shared/src/normalize.ts`
- Modify: `shared/src/index.ts`, `server/src/catalog/normalize.ts`, `server/test/shared/contract.test.ts`

**Interfaces:**
- Produces (paquete `@pokemon-minigames/shared`): `normalizeName(input: string): string` (minúsculas, sin tildes ni signos; `♀` → `f`, `♂` → `m`).
- `server/src/catalog/normalize.ts` sigue exportando `normalizeName` (ahora re-exportada desde `shared`; es la **misma** función).

- [ ] **Step 1: Escribir la prueba que falla**

En `server/test/shared/contract.test.ts` se importa `normalizeName` desde ambos lados y se comprueba que es la misma función:

```diff
diff --git a/server/test/shared/contract.test.ts b/server/test/shared/contract.test.ts
index e0fdb89..e14b326 100644
--- a/server/test/shared/contract.test.ts
+++ b/server/test/shared/contract.test.ts
@@ -1,5 +1,6 @@
-import { ERROR_CODES, TYPE_NAMES } from "@pokemon-minigames/shared";
+import { ERROR_CODES, TYPE_NAMES, normalizeName as sharedNormalizeName } from "@pokemon-minigames/shared";
 import { describe, expect, it } from "vitest";
+import { normalizeName as serverNormalizeName } from "../../src/catalog/normalize.js";
 import { TYPE_NAMES as SNAPSHOT_TYPE_NAMES, typeId } from "../../src/catalog/snapshot.js";
 
 describe("paquete shared", () => {
@@ -11,6 +12,12 @@ describe("paquete shared", () => {
     expect(typeId("fairy")).toBe(18);
   });
 
+  it("normalizeName es una sola función: el servidor y el cliente normalizan igual", () => {
+    expect(serverNormalizeName).toBe(sharedNormalizeName);
+    expect(sharedNormalizeName("Nidoran♀")).toBe("nidoranf");
+    expect(sharedNormalizeName("  Épsilon ")).toBe("epsilon");
+  });
+
   it("los códigos de error no se repiten e incluyen los de salas y partida", () => {
     expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
     for (const code of ["ALREADY_IN_GAME", "ROOM_NOT_FOUND", "ROOM_FULL", "ROOM_CLOSED", "NOT_IN_ROOM", "WRONG_PHASE", "ALREADY_ANSWERED", "ALREADY_CHOSEN", "INVALID_TYPE", "RATE_LIMITED"]) {
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
git switch -c etapa-3-cliente
npm test -w server -- test/shared
```

Expected: FAIL — la prueba "normalizeName es una sola función" no pasa (`shared` todavía no exporta `normalizeName`).

- [ ] **Step 3: Mover la función a `shared/`**

`shared/src/normalize.ts`:

```ts
/**
 * Forma canónica para comparar nombres de Pokémon: minúsculas, sin tildes y sin signos.
 * "Nidoran♀" → "nidoranf", "Mr. Mime" → "mrmime", "Flabébé" → "flabebe".
 */
export function normalizeName(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replaceAll("♀", "f")
    .replaceAll("♂", "m")
    .replace(/[^a-z0-9]/g, "");
}
```

En `shared/src/index.ts`:

```diff
diff --git a/shared/src/index.ts b/shared/src/index.ts
index 4793995..2e7b68d 100644
--- a/shared/src/index.ts
+++ b/shared/src/index.ts
@@ -1,4 +1,5 @@
 export * from "./errors.js";
 export * from "./events.js";
+export * from "./normalize.js";
 export * from "./rooms.js";
 export * from "./types.js";
```

Reemplazar `server/src/catalog/normalize.ts` completo (el servidor re-exporta la función de `shared`):

```ts
// La función vive en `shared/` porque el cliente necesita exactamente la misma normalización.
export { normalizeName } from "@pokemon-minigames/shared";
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w server -- test/shared test/catalog/normalize.test.ts
npm run typecheck
```

Expected: PASS (20 pruebas: las 3 de `contract.test.ts` y las 17 de `normalize.test.ts`, que sigue pasando sin cambios) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(shared): normalizeName vive en shared para que el cliente normalice igual que el servidor" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `serverNow` y `nextRoundAt` en los eventos del servidor

**Files:**
- Modify: `shared/src/events.ts`, `server/src/game/engine/engine.ts`, `server/src/game/engine/view.ts`, `server/src/game/room.ts`
- Test (modificar): `server/test/game/engine.lobby.test.ts`, `engine.rounds.test.ts`, `engine.types.test.ts`, `engine.disconnect.test.ts`, `engine.end.test.ts`, `view.test.ts`, `server/test/realtime/realtime.test.ts`

**Interfaces:**
- `RoomStateView.serverNow: number`; `RoundStartedPayload.serverNow: number`; `"game-starting"` pasa a `{ startsAt, serverNow }`; `"choose-types"` a `{ round, deadline, serverNow }`; `"opponent-disconnected"` a `{ graceEndsAt, serverNow }`; `RoundResultPayload.nextRoundAt: number | null` (hora del servidor a la que empieza la siguiente ronda; `null` si la partida terminó).
- `buildRoomState(state, seat, code, catalog, now)` recibe la hora como quinto argumento; `GameRoom.view` le pasa `clock.now()`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Ajustar las pruebas del motor y de la vista. Cada diff cambia lo que se espera de una carga (`serverNow`) o agrega una prueba (`nextRoundAt`):

`server/test/game/engine.lobby.test.ts`:

```diff
diff --git a/server/test/game/engine.lobby.test.ts b/server/test/game/engine.lobby.test.ts
index bcb4189..1e8438a 100644
--- a/server/test/game/engine.lobby.test.ts
+++ b/server/test/game/engine.lobby.test.ts
@@ -48,7 +48,7 @@ describe("motor: sala y conexiones", () => {
       const h = new Harness();
       h.seatBoth();
       expect(h.state.phase).toBe("starting");
-      expect(h.last("game-starting")).toEqual({ startsAt: START_TIME + 5000 });
+      expect(h.last("game-starting")).toEqual({ startsAt: START_TIME + 5000, serverNow: START_TIME });
       expect(h.pending).toContainEqual({ at: START_TIME + 5000, timer: { kind: "start", startsAt: START_TIME + 5000 } });
     });
```

`server/test/game/engine.rounds.test.ts`:

```diff
diff --git a/server/test/game/engine.rounds.test.ts b/server/test/game/engine.rounds.test.ts
index c494344..51d774f 100644
--- a/server/test/game/engine.rounds.test.ts
+++ b/server/test/game/engine.rounds.test.ts
@@ -16,7 +16,13 @@ function round1(rng: number[] = [0]): Harness {
 describe("motor: rondas (modo aleatorio)", () => {
   it("anuncia la ronda con el par ordenado y un plazo de 15 segundos", () => {
     const h = round1();
-    expect(h.last("round-started")).toEqual({ round: 1, type1: "flying", type2: "fire", deadline: T0 + 15_000 });
+    expect(h.last("round-started")).toEqual({
+      serverNow: T0,
+      round: 1,
+      type1: "flying",
+      type2: "fire",
+      deadline: T0 + 15_000,
+    });
     expect(h.pending).toContainEqual({ at: T0 + 15_000, timer: { kind: "round", round: 1 } });
   });
 
@@ -47,6 +53,16 @@ describe("motor: rondas (modo aleatorio)", () => {
     expect([...h.state.owners]).toEqual([[1, 1], [2, 2]]);
   });
 
+  it("el resultado indica cuándo empieza la siguiente ronda (6 s después de cerrar)", () => {
+    const h = round1();
+    h.advance(2000);
+    h.submit(1, "Alfa");
+    h.submit(2, "Beto");
+    expect(h.last("round-result")!.nextRoundAt).toBe(T0 + 2000 + 6000);
+    h.advance(6000);
+    expect(h.last("round-started")).toMatchObject({ round: 2, serverNow: T0 + 2000 + 6000 });
+  });
+
   it("guarda la ronda con las respuestas de ambos y su timestamp de servidor", () => {
     const h = round1();
     h.advance(1000);
```

`server/test/game/engine.types.test.ts`:

```diff
diff --git a/server/test/game/engine.types.test.ts b/server/test/game/engine.types.test.ts
index 851db21..f5baea4 100644
--- a/server/test/game/engine.types.test.ts
+++ b/server/test/game/engine.types.test.ts
@@ -13,7 +13,7 @@ describe("motor: elección de tipos (modo elegido)", () => {
   it("abre la elección de tipos con un plazo de 15 segundos, sin anunciar todavía el par", () => {
     const h = chosenGame();
     expect(h.state.phase).toBe("choosing_types");
-    expect(h.last("choose-types")).toEqual({ round: 1, deadline: T0 + 15_000 });
+    expect(h.last("choose-types")).toEqual({ round: 1, deadline: T0 + 15_000, serverNow: T0 });
     expect(h.payloads("round-started")).toHaveLength(0);
     expect(h.pending).toContainEqual({ at: T0 + 15_000, timer: { kind: "choose", round: 1 } });
   });
@@ -27,7 +27,13 @@ describe("motor: elección de tipos (modo elegido)", () => {
     h.choose(2, "flying");
 
     expect(h.state.phase).toBe("round_active");
-    expect(h.last("round-started")).toEqual({ round: 1, type1: "flying", type2: "fire", deadline: T0 + 3000 + 15_000 });
+    expect(h.last("round-started")).toEqual({
+      serverNow: T0 + 3000,
+      round: 1,
+      type1: "flying",
+      type2: "fire",
+      deadline: T0 + 3000 + 15_000,
+    });
   });
 
   it("el tipo elegido es secreto: el rival no recibe confirmación de tu elección", () => {
```

`server/test/game/engine.disconnect.test.ts`:

```diff
diff --git a/server/test/game/engine.disconnect.test.ts b/server/test/game/engine.disconnect.test.ts
index a977f42..4b86cd1 100644
--- a/server/test/game/engine.disconnect.test.ts
+++ b/server/test/game/engine.disconnect.test.ts
@@ -17,7 +17,7 @@ describe("motor: desconexiones", () => {
 
     expect(h.state.players[2]?.connected).toBe(false);
     const graceEndsAt = T0 + 2000 + 30_000;
-    expect(h.payloads("opponent-disconnected", 1)).toEqual([{ graceEndsAt }]);
+    expect(h.payloads("opponent-disconnected", 1)).toEqual([{ graceEndsAt, serverNow: T0 + 2000 }]);
     expect(h.pending).toContainEqual({ at: graceEndsAt, timer: { kind: "grace", seat: 2, graceEndsAt } });
   });
```

`server/test/game/engine.end.test.ts`:

```diff
diff --git a/server/test/game/engine.end.test.ts b/server/test/game/engine.end.test.ts
index a2e7ea2..cc6718a 100644
--- a/server/test/game/engine.end.test.ts
+++ b/server/test/game/engine.end.test.ts
@@ -44,6 +44,17 @@ describe("motor: fin de la partida", () => {
     expect(h.effectsOfKind("persist_round")).toHaveLength(3);
   });
 
+  it("el resultado de la última ronda no anuncia una siguiente (nextRoundAt nulo)", () => {
+    const h = new Harness({ config: RANDOM_3, rng: [0, 1, 0] });
+    h.startGame();
+    playRound(h, "Alfa", "Beto");
+    expect(h.last("round-result")!.nextRoundAt).not.toBeNull();
+    playRound(h, "Delta", "Épsilon");
+    h.submit(1, "Eta");
+    h.submit(2, "Zeta");
+    expect(h.last("round-result")!.nextRoundAt).toBeNull();
+  });
+
   it("al terminar no programa más rondas y el resultado de la última sale antes del fin", () => {
     const h = new Harness({ config: RANDOM_3, rng: [0, 1, 0] });
     h.startGame();
```

`server/test/game/view.test.ts`:

```diff
diff --git a/server/test/game/view.test.ts b/server/test/game/view.test.ts
index 6c0c56c..4f7ea80 100644
--- a/server/test/game/view.test.ts
+++ b/server/test/game/view.test.ts
@@ -3,11 +3,17 @@ import { buildGameEnded, buildRoomState } from "../../src/game/engine/view.js";
 import { CHOSEN_3, Harness, RANDOM_3 } from "./harness.js";
 
 describe("vistas de la partida", () => {
+  it("incluye la hora del servidor con la que se generó el estado", () => {
+    const h = new Harness({ config: RANDOM_3 });
+    h.advance(1234);
+    expect(buildRoomState(h.state, 1, "ABC234", h.catalog, h.now).serverNow).toBe(h.now);
+  });
+
   it("antes de empezar: fase, jugadores y sin ronda", () => {
     const h = new Harness({ config: RANDOM_3 });
     h.dispatch({ type: "PLAYER_JOINED", userId: "u2", username: "misty" });
     h.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
-    const view = buildRoomState(h.state, 1, "ABC234", h.catalog);
+    const view = buildRoomState(h.state, 1, "ABC234", h.catalog, h.now);
 
     expect(view).toMatchObject({ code: "ABC234", phase: "waiting", mySeat: 1, roundsPlayed: 0, round: null, startsAt: null });
     expect(view.players).toEqual([
@@ -23,14 +29,14 @@ describe("vistas de la partida", () => {
     h.submit(1, "Alfa");
     h.submit(2, "Beto");
 
-    const mine = buildRoomState(h.state, 1, "ABC234", h.catalog);
+    const mine = buildRoomState(h.state, 1, "ABC234", h.catalog, h.now);
     expect(mine.myTeam.map((p) => p.id)).toEqual([1]);
     expect(mine.players.find((p) => p.seat === 2)).toMatchObject({ totalStats: 400, teamSize: 1 });
     const json = JSON.stringify(mine);
     expect(json).not.toContain("Beto");
     expect(json).not.toContain("Beta");
 
-    const theirs = buildRoomState(h.state, 2, "ABC234", h.catalog);
+    const theirs = buildRoomState(h.state, 2, "ABC234", h.catalog, h.now);
     expect(theirs.myTeam.map((p) => p.id)).toEqual([2]);
     expect(JSON.stringify(theirs)).not.toContain("Alfa");
   });
@@ -39,8 +45,8 @@ describe("vistas de la partida", () => {
     const h = new Harness({ config: RANDOM_3, rng: [0] });
     h.startGame();
     h.submit(1, "Alfa");
-    const mine = buildRoomState(h.state, 1, "X", h.catalog);
-    const theirs = buildRoomState(h.state, 2, "X", h.catalog);
+    const mine = buildRoomState(h.state, 1, "X", h.catalog, h.now);
+    const theirs = buildRoomState(h.state, 2, "X", h.catalog, h.now);
     expect(mine.round).toMatchObject({ number: 1, pair: ["flying", "fire"], answered: true, typeChosen: false });
     expect(theirs.round?.answered).toBe(false);
     expect(mine.phase).toBe("round_active");
@@ -50,8 +56,8 @@ describe("vistas de la partida", () => {
     const h = new Harness({ config: CHOSEN_3 });
     h.startGame();
     h.choose(1, "fire");
-    const mine = buildRoomState(h.state, 1, "X", h.catalog);
-    const theirs = buildRoomState(h.state, 2, "X", h.catalog);
+    const mine = buildRoomState(h.state, 1, "X", h.catalog, h.now);
+    const theirs = buildRoomState(h.state, 2, "X", h.catalog, h.now);
     expect(mine.round).toMatchObject({ pair: null, typeChosen: true });
     expect(theirs.round).toMatchObject({ pair: null, typeChosen: false });
     expect(JSON.stringify(theirs)).not.toContain("fire");
@@ -60,14 +66,14 @@ describe("vistas de la partida", () => {
   it("informa la cuenta atrás y la gracia de reconexión del rival", () => {
     const h = new Harness({ config: RANDOM_3, rng: [0] });
     h.seatBoth();
-    expect(buildRoomState(h.state, 1, "X", h.catalog).startsAt).toBe(h.state.startsAt);
+    expect(buildRoomState(h.state, 1, "X", h.catalog, h.now).startsAt).toBe(h.state.startsAt);
 
     h.advance(5000);
     h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
-    const view = buildRoomState(h.state, 1, "X", h.catalog);
+    const view = buildRoomState(h.state, 1, "X", h.catalog, h.now);
     expect(view.startsAt).toBeNull();
     expect(view.opponentGraceEndsAt).toBe(h.now + 30_000);
-    expect(buildRoomState(h.state, 2, "X", h.catalog).opponentGraceEndsAt).toBeNull();
+    expect(buildRoomState(h.state, 2, "X", h.catalog, h.now).opponentGraceEndsAt).toBeNull();
   });
 
   it("el resumen final incluye los dos equipos completos", () => {
```

`server/test/realtime/realtime.test.ts`:

```diff
diff --git a/server/test/realtime/realtime.test.ts b/server/test/realtime/realtime.test.ts
index aee9395..6ec65ec 100644
--- a/server/test/realtime/realtime.test.ts
+++ b/server/test/realtime/realtime.test.ts
@@ -123,7 +123,7 @@ describe("una ronda por sockets", () => {
     server.time.advance(5000);
 
     const started = await one.next<RoundStartedPayload>("round-started");
-    expect(started).toMatchObject({ round: 1, type1: "flying", type2: "fire" });
+    expect(started).toMatchObject({ round: 1, type1: "flying", type2: "fire", serverNow: expect.any(Number) });
     await two.next("round-started");
 
     one.emit("submit-pokemon", { text: "Alfa" });
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w server -- test/game test/realtime
```

Expected: FAIL — las cargas no traen `serverNow`/`nextRoundAt` y `buildRoomState` no recibe la hora (errores de tipo y de igualdad en `engine.*`, `view` y `realtime`).

- [ ] **Step 3: Implementar**

Tipos compartidos, `shared/src/events.ts`:

```diff
diff --git a/shared/src/events.ts b/shared/src/events.ts
index d308296..aa5993e 100644
--- a/shared/src/events.ts
+++ b/shared/src/events.ts
@@ -19,6 +19,8 @@ export interface RoomPlayerView {
 
 /** Estado completo de la partida desde el punto de vista de un jugador. */
 export interface RoomStateView {
+  /** Hora del servidor (ms) al generar este estado; sirve para calcular el desfase del reloj. */
+  serverNow: number;
   code: string;
   phase: GamePhase;
   config: RoomConfig;
@@ -54,6 +56,8 @@ export interface RoundPlayerResult {
 
 export interface RoundResultPayload {
   round: number;
+  /** Cuándo empieza la siguiente ronda (hora del servidor, ms); nulo si la partida terminó. */
+  nextRoundAt: number | null;
   type1: TypeName;
   type2: TypeName;
   results: Record<Seat, RoundPlayerResult>;
@@ -67,6 +71,7 @@ export interface GameEndedPayload {
 }
 
 export interface RoundStartedPayload {
+  serverNow: number;
   round: number;
   type1: TypeName;
   type2: TypeName;
@@ -85,14 +90,14 @@ export interface ClientToServerEvents {
 export interface ServerToClientEvents {
   "room-state": (payload: RoomStateView) => void;
   "player-joined": (payload: { username: string }) => void;
-  "game-starting": (payload: { startsAt: number }) => void;
-  "choose-types": (payload: { round: number; deadline: number }) => void;
+  "game-starting": (payload: { startsAt: number; serverNow: number }) => void;
+  "choose-types": (payload: { round: number; deadline: number; serverNow: number }) => void;
   "type-received": (payload: { round: number }) => void;
   "round-started": (payload: RoundStartedPayload) => void;
   "answer-received": (payload: { round: number }) => void;
   "round-result": (payload: RoundResultPayload) => void;
   "game-ended": (payload: GameEndedPayload) => void;
-  "opponent-disconnected": (payload: { graceEndsAt: number }) => void;
+  "opponent-disconnected": (payload: { graceEndsAt: number; serverNow: number }) => void;
   "opponent-reconnected": () => void;
   error: (payload: { code: ErrorCode; message: string }) => void;
 }
```

El motor agrega `serverNow` (la hora del evento que ya conoce) y calcula `nextRoundAt`, `server/src/game/engine/engine.ts`:

```diff
diff --git a/server/src/game/engine/engine.ts b/server/src/game/engine/engine.ts
index 4e5f09d..c99ad5b 100644
--- a/server/src/game/engine/engine.ts
+++ b/server/src/game/engine/engine.ts
@@ -158,7 +158,7 @@ function tryStart(c: Ctx): void {
 
   s.phase = "starting";
   s.startsAt = c.now + seconds(START_COUNTDOWN_SECONDS);
-  emit(c, "all", { name: "game-starting", payload: { startsAt: s.startsAt } });
+  emit(c, "all", { name: "game-starting", payload: { startsAt: s.startsAt, serverNow: c.now } });
   schedule(c, s.startsAt, { kind: "start", startsAt: s.startsAt });
 }
 
@@ -187,7 +187,7 @@ function onDisconnected(c: Ctx, seat: Seat): void {
   if (inGame(s)) {
     const graceEndsAt = c.now + seconds(RECONNECT_GRACE_SECONDS);
     s.graceEndsAt[seat] = graceEndsAt;
-    emit(c, otherSeat(seat), { name: "opponent-disconnected", payload: { graceEndsAt } });
+    emit(c, otherSeat(seat), { name: "opponent-disconnected", payload: { graceEndsAt, serverNow: c.now } });
     schedule(c, graceEndsAt, { kind: "grace", seat, graceEndsAt });
   }
 }
@@ -258,7 +258,10 @@ function beginRound(c: Ctx, number: number): void {
   if (s.config.typeMode === "chosen") {
     s.phase = "choosing_types";
     s.round.deadline = c.now + seconds(TYPE_CHOICE_SECONDS);
-    emit(c, "all", { name: "choose-types", payload: { round: number, deadline: s.round.deadline } });
+    emit(c, "all", {
+      name: "choose-types",
+      payload: { round: number, deadline: s.round.deadline, serverNow: c.now },
+    });
     schedule(c, s.round.deadline, { kind: "choose", round: number });
   } else {
     startActive(c, pickOne(c.deps.rng, pairs), false);
@@ -319,6 +322,7 @@ function startActive(c: Ctx, pair: TypePair, replaced: boolean): void {
   emit(c, "all", {
     name: "round-started",
     payload: {
+      serverNow: c.now,
       round: round.number,
       type1: pair[0],
       type2: pair[1],
@@ -390,10 +394,20 @@ function closeRound(c: Ctx): void {
   }
 
   s.roundsPlayed = round.number;
-  emit(c, "all", { name: "round-result", payload: { round: round.number, type1: pair[0], type2: pair[1], results } });
+  const over = gameIsOver(s);
+  emit(c, "all", {
+    name: "round-result",
+    payload: {
+      round: round.number,
+      nextRoundAt: over ? null : c.now + seconds(RESULT_PAUSE_SECONDS),
+      type1: pair[0],
+      type2: pair[1],
+      results,
+    },
+  });
   c.fx.push({ kind: "persist_round", record: { number: round.number, pair, picks: records } });
 
-  if (gameIsOver(s)) {
+  if (over) {
     finish(c, "completed");
   } else {
     s.phase = "round_result";
```

La vista del estado recibe la hora, `server/src/game/engine/view.ts`:

```diff
diff --git a/server/src/game/engine/view.ts b/server/src/game/engine/view.ts
index e6de855..f8ddeb7 100644
--- a/server/src/game/engine/view.ts
+++ b/server/src/game/engine/view.ts
@@ -31,7 +31,13 @@ export function teamViews(state: GameState, seat: Seat, catalog: PokemonCatalog)
  * Estado de la partida para un jugador. Del rival solo revela los totales: los nombres
  * de sus Pokémon se conocen únicamente en `round-result` y `game-ended`.
  */
-export function buildRoomState(state: GameState, seat: Seat, code: string, catalog: PokemonCatalog): RoomStateView {
+export function buildRoomState(
+  state: GameState,
+  seat: Seat,
+  code: string,
+  catalog: PokemonCatalog,
+  now: number,
+): RoomStateView {
   const players: RoomPlayerView[] = SEATS.flatMap((s) => {
     const player = state.players[s];
     return player
@@ -60,6 +66,7 @@ export function buildRoomState(state: GameState, seat: Seat, code: string, catal
       : null;
 
   return {
+    serverNow: now,
     code,
     phase: state.phase,
     config: { ...state.config },
```

La sala se la pasa desde su reloj, `server/src/game/room.ts`:

```diff
diff --git a/server/src/game/room.ts b/server/src/game/room.ts
index d661418..fb9a08b 100644
--- a/server/src/game/room.ts
+++ b/server/src/game/room.ts
@@ -85,7 +85,7 @@ export class GameRoom {
   }
 
   view(seat: Seat): RoomStateView {
-    return buildRoomState(this.state, seat, this.code, this.ports.catalog);
+    return buildRoomState(this.state, seat, this.code, this.ports.catalog, this.ports.clock.now());
   }
 
   /** Se llama una sola vez, cuando la partida termina por cualquier motivo. */
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w server -- test/game test/realtime
npm run typecheck
```

Expected: PASS (150 pruebas) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): serverNow en los eventos con plazo y nextRoundAt en el resultado de ronda" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `GET /rooms/current` y `GET /pokemon/names`

**Files:**
- Create: `server/src/catalog/catalog.routes.ts`, `server/test/catalog/catalog.routes.test.ts`
- Modify: `server/src/catalog/pokemon-catalog.ts`, `server/src/game/room-manager.ts`, `server/src/rooms/rooms.routes.ts`, `server/src/app.ts`, `server/src/index.ts`, `server/test/helpers/app.ts`
- Test (modificar): `server/test/catalog/pokemon-catalog.test.ts`, `server/test/game/room-manager.test.ts`, `server/test/rooms/rooms.routes.test.ts`

**Interfaces:**
- `PokemonCatalog.names(): { id: number; es: string; en: string }[]` (ordenado por id, solo nombres).
- `RoomManager.currentFor(userId): { code: string; phase: GamePhase } | null`.
- `GET /rooms/current` (con sesión) → `200 { room: { code, phase } | null }`; se registra **antes** de `/:code`.
- `GET /pokemon/names` (público) → `200 [{ id, es, en }]` con `Cache-Control: public, max-age=86400`.
- `AppDeps` agrega `catalog: PokemonCatalog`; el contexto de pruebas (`buildTestContext`) devuelve también `catalog`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`server/test/catalog/catalog.routes.test.ts`:

```ts
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../helpers/db.js";
import { buildTestApp } from "../helpers/app.js";

afterAll(() => prisma.$disconnect());

describe("GET /pokemon/names", () => {
  const app = buildTestApp();

  it("es público: responde sin sesión", async () => {
    const response = await request(app).get("/pokemon/names");
    expect(response.status).toBe(200);
  });

  it("devuelve id y nombres en español e inglés de todos los Pokémon, ordenados por id", async () => {
    const response = await request(app).get("/pokemon/names");
    expect(response.body).toHaveLength(10);
    expect(response.body[0]).toEqual({ id: 1, es: "Alfa", en: "Alpha" });
    expect(response.body[4]).toEqual({ id: 5, es: "Épsilon", en: "Epsilon" });
    const ids = response.body.map((p: { id: number }) => p.id);
    expect(ids).toEqual([...ids].sort((a: number, b: number) => a - b));
  });

  it("no revela nada que sirva para responder: solo id y nombres, sin tipos ni stats", async () => {
    const response = await request(app).get("/pokemon/names");
    for (const entry of response.body) {
      expect(Object.keys(entry).sort()).toEqual(["en", "es", "id"]);
    }
  });

  it("se puede guardar en caché un día", async () => {
    const response = await request(app).get("/pokemon/names");
    expect(response.headers["cache-control"]).toBe("public, max-age=86400");
  });
});
```

`server/test/catalog/pokemon-catalog.test.ts`:

```diff
diff --git a/server/test/catalog/pokemon-catalog.test.ts b/server/test/catalog/pokemon-catalog.test.ts
index c78424f..0986dbb 100644
--- a/server/test/catalog/pokemon-catalog.test.ts
+++ b/server/test/catalog/pokemon-catalog.test.ts
@@ -26,6 +26,14 @@ describe("PokemonCatalog", () => {
     });
   });
 
+  it("names devuelve id y nombres de todos los Pokémon, ordenados por id y sin otros datos", () => {
+    const names = catalog.names();
+    expect(names).toHaveLength(10);
+    expect(names[0]).toEqual({ id: 1, es: "Alfa", en: "Alpha" });
+    expect(names.map((n) => n.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
+    expect(Object.keys(names[0]!).sort()).toEqual(["en", "es", "id"]);
+  });
+
   it("get devuelve el Pokémon por id", () => {
     expect(catalog.get(6)?.names.en).toBe("Zeta");
     expect(catalog.get(999)).toBeUndefined();
```

`server/test/game/room-manager.test.ts`:

```diff
diff --git a/server/test/game/room-manager.test.ts b/server/test/game/room-manager.test.ts
index 2e5761c..4019b59 100644
--- a/server/test/game/room-manager.test.ts
+++ b/server/test/game/room-manager.test.ts
@@ -190,6 +190,24 @@ describe("RoomManager.joinRoom", () => {
   });
 });
 
+describe("RoomManager.currentFor", () => {
+  it("devuelve la sala activa del usuario o null si no tiene ninguna", async () => {
+    const { manager, time } = setup(() => "ABC234");
+    expect(manager.currentFor(ash.userId)).toBeNull();
+
+    await manager.createRoom(ash, config);
+    expect(manager.currentFor(ash.userId)).toEqual({ code: "ABC234", phase: "waiting" });
+    expect(manager.currentFor(misty.userId)).toBeNull();
+
+    manager.joinRoom(misty, "ABC234");
+    expect(manager.currentFor(misty.userId)).toEqual({ code: "ABC234", phase: "waiting" });
+
+    time.advance(10 * 60 * 1000); // la sala caduca y termina
+    expect(manager.currentFor(ash.userId)).toBeNull();
+    expect(manager.currentFor(misty.userId)).toBeNull();
+  });
+});
+
 describe("RoomManager.getPublicInfo y connect", () => {
   it("getPublicInfo describe la sala sin datos privados", async () => {
     const { manager } = setup(() => "ABC234");
```

`server/test/rooms/rooms.routes.test.ts`:

```diff
diff --git a/server/test/rooms/rooms.routes.test.ts b/server/test/rooms/rooms.routes.test.ts
index b36fea6..59e2b5b 100644
--- a/server/test/rooms/rooms.routes.test.ts
+++ b/server/test/rooms/rooms.routes.test.ts
@@ -27,6 +27,7 @@ const createRoom = (user: TestUser, body: unknown = validBody) =>
 describe("autenticación de las rutas de salas", () => {
   it.each([
     ["POST /rooms", () => request(ctx.app).post("/rooms").send(validBody)],
+    ["GET /rooms/current", () => request(ctx.app).get("/rooms/current")],
     ["GET /rooms/:code", () => request(ctx.app).get("/rooms/ABC234")],
     ["POST /rooms/:code/join", () => request(ctx.app).post("/rooms/ABC234/join")],
   ])("%s responde 401 sin token", async (_name, call) => {
@@ -99,6 +100,36 @@ describe("POST /rooms", () => {
   });
 });
 
+describe("GET /rooms/current", () => {
+  const current = (user: TestUser) => request(ctx.app).get("/rooms/current").set(auth(user));
+
+  it("devuelve room: null (con 200) si el usuario no tiene ninguna partida activa", async () => {
+    const response = await current(ash);
+    expect(response.status).toBe(200);
+    expect(response.body).toEqual({ room: null });
+  });
+
+  it("devuelve el código y la fase de la sala activa, para el creador y para quien se unió", async () => {
+    const { body } = await createRoom(ash);
+    expect((await current(ash)).body).toEqual({ room: { code: body.code, phase: "waiting" } });
+    expect((await current(misty)).body).toEqual({ room: null });
+
+    await request(ctx.app).post(`/rooms/${body.code}/join`).set(auth(misty));
+    expect((await current(misty)).body).toEqual({ room: { code: body.code, phase: "waiting" } });
+  });
+
+  it("deja de devolver la sala cuando la partida termina", async () => {
+    await createRoom(ash);
+    ctx.time.advance(10 * 60 * 1000); // caduca sin que nadie se una
+    expect((await current(ash)).body).toEqual({ room: null });
+  });
+
+  it("no se confunde con un código de sala llamado current", async () => {
+    const response = await current(ash);
+    expect(response.body).not.toHaveProperty("error");
+  });
+});
+
 describe("GET /rooms/:code", () => {
   it("devuelve la información pública de la sala", async () => {
     const { body } = await createRoom(ash, { typeMode: "chosen", lengthMode: "custom", statsGoal: 2500 });
```

El contexto de pruebas pasa el catálogo a la aplicación y lo devuelve, `server/test/helpers/app.ts`:

```diff
diff --git a/server/test/helpers/app.ts b/server/test/helpers/app.ts
index ec3876f..a26b88d 100644
--- a/server/test/helpers/app.ts
+++ b/server/test/helpers/app.ts
@@ -31,19 +31,20 @@ export function buildTestContext(overrides: Record<string, string> = {}, options
   const time = new FakeTime();
   const broadcaster = new SocketBroadcaster();
   const store = new InMemoryRoomStore();
+  const catalog = options.catalog ?? fixtureCatalog();
   const roomManager = new RoomManager({
     clock: time,
     scheduler: time,
     broadcaster,
     repository: createPrismaGameRepository(prisma),
-    catalog: options.catalog ?? fixtureCatalog(),
+    catalog,
     rng: options.rng ?? cryptoRng,
     generateCode: options.generateCode,
     store,
     persistRetryDelayMs: 0,
   });
-  const app = createApp({ env, prisma, tokens, roomManager });
-  return { app, env, tokens, time, broadcaster, store, roomManager };
+  const app = createApp({ env, prisma, tokens, roomManager, catalog });
+  return { app, env, tokens, time, broadcaster, store, roomManager, catalog };
 }
 
 export function buildTestApp(overrides: Record<string, string> = {}): Express {
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w server -- test/catalog test/rooms test/game/room-manager.test.ts
```

Expected: FAIL — `catalog.names is not a function`, `manager.currentFor is not a function` y `GET /rooms/current` responde 404 (ninguna de las tres cosas existe todavía).

- [ ] **Step 3: Implementar**

`server/src/catalog/pokemon-catalog.ts` (agrega `names()`):

```diff
diff --git a/server/src/catalog/pokemon-catalog.ts b/server/src/catalog/pokemon-catalog.ts
index 0b1a319..2e08565 100644
--- a/server/src/catalog/pokemon-catalog.ts
+++ b/server/src/catalog/pokemon-catalog.ts
@@ -59,6 +59,13 @@ export class PokemonCatalog {
     return this.byId.get(id);
   }
 
+  /** Nombres en español e inglés de todos los Pokémon, por id. No incluye tipos ni stats. */
+  names(): { id: number; es: string; en: string }[] {
+    return [...this.byId.values()]
+      .sort((a, b) => a.id - b.id)
+      .map((p) => ({ id: p.id, es: p.names.es, en: p.names.en }));
+  }
+
   /** Busca por nombre en español o en inglés, sin distinguir tildes, mayúsculas ni signos. */
   resolveName(text: string): CatalogPokemon | undefined {
     const key = normalizeName(text);
```

`server/src/catalog/catalog.routes.ts`:

```ts
import { Router } from "express";
import type { PokemonCatalog } from "./pokemon-catalog.js";

export interface CatalogRouterDeps {
  catalog: PokemonCatalog;
}

/** Datos públicos del catálogo. No requiere sesión: es solo la lista de nombres. */
export function createCatalogRouter({ catalog }: CatalogRouterDeps): Router {
  const router = Router();
  // El catálogo no cambia mientras el servidor está en marcha: se arma una sola vez.
  const names = catalog.names();

  router.get("/names", (_req, res) => {
    res.set("Cache-Control", "public, max-age=86400").json(names);
  });

  return router;
}
```

`server/src/game/room-manager.ts` (agrega `currentFor`):

```diff
diff --git a/server/src/game/room-manager.ts b/server/src/game/room-manager.ts
index 4fdfe59..593a535 100644
--- a/server/src/game/room-manager.ts
+++ b/server/src/game/room-manager.ts
@@ -1,4 +1,4 @@
-import type { PublicRoomInfo, RoomConfig, Seat } from "@pokemon-minigames/shared";
+import type { GamePhase, PublicRoomInfo, RoomConfig, Seat } from "@pokemon-minigames/shared";
 import { Prisma } from "../generated/prisma/client.js";
 import { AppError } from "../http/errors.js";
 import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "./constants.js";
@@ -82,6 +82,12 @@ export class RoomManager {
     return { code: room.code };
   }
 
+  /** La sala activa del usuario, si participa en alguna. */
+  currentFor(userId: string): { code: string; phase: GamePhase } | null {
+    const room = this.deps.store.findByUser(userId);
+    return room ? { code: room.code, phase: room.phase } : null;
+  }
+
   getPublicInfo(code: string): PublicRoomInfo {
     const room = this.findRoom(code);
     return {
```

`server/src/rooms/rooms.routes.ts` (la ruta `/current` va antes de `/:code`, si no "current" se tomaría por un código de sala):

```diff
diff --git a/server/src/rooms/rooms.routes.ts b/server/src/rooms/rooms.routes.ts
index 6696bf0..d14ca2b 100644
--- a/server/src/rooms/rooms.routes.ts
+++ b/server/src/rooms/rooms.routes.ts
@@ -21,6 +21,11 @@ export function createRoomsRouter({ manager, tokens }: RoomsRouterDeps): Router
     res.status(201).json({ code });
   });
 
+  // Antes de "/:code": si no, "current" se tomaría por un código de sala.
+  router.get("/current", (_req, res) => {
+    res.json({ room: manager.currentFor(getAuth(res).userId) });
+  });
+
   router.get("/:code", (req, res) => {
     res.json(manager.getPublicInfo(req.params.code));
   });
```

`server/src/app.ts` (monta `/pokemon` y recibe el catálogo):

```diff
diff --git a/server/src/app.ts b/server/src/app.ts
index 699ab5d..ae9272f 100644
--- a/server/src/app.ts
+++ b/server/src/app.ts
@@ -5,6 +5,8 @@ import { createAuthRouter } from "./auth/auth.routes.js";
 import { AuthService } from "./auth/auth.service.js";
 import { createPasswordHasher } from "./auth/password.js";
 import type { TokenService } from "./auth/tokens.js";
+import { createCatalogRouter } from "./catalog/catalog.routes.js";
+import type { PokemonCatalog } from "./catalog/pokemon-catalog.js";
 import type { Env } from "./config/env.js";
 import type { PrismaClient } from "./db/prisma.js";
 import type { RoomManager } from "./game/room-manager.js";
@@ -17,9 +19,10 @@ export interface AppDeps {
   /** El mismo servicio de tokens que usa Socket.io para autenticar el handshake. */
   tokens: TokenService;
   roomManager: RoomManager;
+  catalog: PokemonCatalog;
 }
 
-export function createApp({ env, prisma, tokens, roomManager }: AppDeps): Express {
+export function createApp({ env, prisma, tokens, roomManager, catalog }: AppDeps): Express {
   const authService = new AuthService({
     prisma,
     hasher: createPasswordHasher(env.BCRYPT_COST),
@@ -38,6 +41,7 @@ export function createApp({ env, prisma, tokens, roomManager }: AppDeps): Expres
   });
   app.use("/auth", createAuthRouter({ env, authService, tokens }));
   app.use("/rooms", createRoomsRouter({ manager: roomManager, tokens }));
+  app.use("/pokemon", createCatalogRouter({ catalog }));
 
   app.use(notFoundHandler);
   app.use(errorHandler);
```

`server/src/index.ts` (pasa el catálogo ya cargado):

```diff
diff --git a/server/src/index.ts b/server/src/index.ts
index a3b7637..3a2a35e 100644
--- a/server/src/index.ts
+++ b/server/src/index.ts
@@ -43,7 +43,7 @@ const roomManager = new RoomManager({
   logger: console,
 });
 
-const app = createApp({ env, prisma, tokens, roomManager });
+const app = createApp({ env, prisma, tokens, roomManager, catalog });
 const server = createServer(app);
 const io = attachRealtime(server, { env, tokens, manager: roomManager, broadcaster, logger: console });
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w server
npm run typecheck
```

Expected: PASS (**366 pruebas** en 32 archivos, todo el servidor) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): GET /rooms/current y GET /pokemon/names para el cliente" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Andamiaje del cliente, i18n, colores de tipo y tokens de tema

**Files:**
- Modify: `package.json` (raíz)
- Create: `client/package.json`, `client/tsconfig.json`, `client/vite.config.ts`, `client/test/setup.ts`, `client/src/index.css`, `client/src/theme/tokens.css`, `client/src/theme/contrast.ts`, `client/src/theme/type-styles.ts`, `client/src/i18n/es.ts`
- Test: `client/test/theme/tokens.test.ts`

**Interfaces:**
- Produces: `relativeLuminance(hex)`, `contrastRatio(a, b)`, `readableOn(background)` (blanco o casi negro, el que más contraste da); `TYPE_STYLES: Record<TypeName, { background, color }>` (18 tipos, con texto `readableOn`); `TYPE_LABELS` (nombres de tipo en español), `errorMessage(code)` (mensaje en español de un `ErrorCode`, con uno genérico para códigos desconocidos), `NETWORK_ERROR`, `ROOM_GONE_CODES`, `PICK_RESULT_LABELS`, `END_REASON_LABELS`, `STAT_LABELS`.
- Los tokens (`--bg`, `--fg`, `--muted`, `--surface`, `--surface-2`, `--line`, `--accent`, `--accent-fg`, `--danger`, `--success`, `--header-bg`, `--header-fg`, `--frame`, fuentes) se definen en `tokens.css` por `:root[data-theme="clasico|pokedex"][data-mode="claro|oscuro"]`; `index.css` los expone a Tailwind con `@theme inline`.

- [ ] **Step 1: Crear el paquete `client/` y registrarlo**

Reemplazar `package.json` de la raíz (agrega el workspace `client` y los scripts del cliente; `test` y `typecheck` recorren todos los paquetes):

```json
{
  "name": "pokemon-minigames",
  "private": true,
  "workspaces": [
    "shared",
    "server",
    "client"
  ],
  "scripts": {
    "dev": "npm run dev -w server",
    "dev:client": "npm run dev -w client",
    "build": "npm run build -w client",
    "test": "npm test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present"
  }
}
```

`client/package.json`:

```json
{
  "name": "@pokemon-minigames/client",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@pokemon-minigames/shared": "*",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "react-router": "^8.4.0",
    "socket.io-client": "^4.8.4",
    "zustand": "^5.0.15"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.3.3",
    "@testing-library/dom": "^10.4.2",
    "@testing-library/jest-dom": "^7.0.1",
    "@testing-library/react": "^16.3.3",
    "@testing-library/user-event": "^14.6.7",
    "@types/node": "^24.0.0",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^6.1.1",
    "jsdom": "^30.1.1",
    "tailwindcss": "^4.3.3",
    "typescript": "^7.0.2",
    "vite": "^8.3.1",
    "vitest": "^5.0.3"
  }
}
```

`client/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "test", "vite.config.ts"]
}
```

`client/vite.config.ts` (React, Tailwind, proxy de desarrollo y entorno de pruebas jsdom):

```ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// En desarrollo el servidor de Vite hace de proxy al servidor del juego, sin prefijo, para que el
// cliente y la API compartan origen (la cookie de refresco solo viaja a /auth).
const api = process.env.VITE_DEV_API ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/auth": api,
      "/rooms": api,
      "/pokemon": api,
      "/socket.io": { target: api, ws: true },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    css: false,
  },
});
```

`client/test/setup.ts` (jest-dom, limpieza tras cada prueba y un timeout asíncrono de 4 s: con varias pruebas en paralelo el segundo que Testing Library espera por defecto no alcanza para escribir con `userEvent` y causaba fallos intermitentes):

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Con varias pruebas en paralelo el equipo va justo de CPU y 1 s (el valor por defecto) no alcanza para escribir con
// `userEvent` y esperar el resultado; 4 s no alarga las pruebas que pasan, solo evita falsos fallos.
configure({ asyncUtilTimeout: 4000 });

afterEach(() => cleanup());
```

Luego:

```bash
npm install
```

Expected: npm crea `client/` como workspace, enlaza `@pokemon-minigames/shared` y actualiza `package-lock.json` (avisos de scripts bloqueados: normales).

- [ ] **Step 2: Escribir la prueba que falla**

`client/test/theme/tokens.test.ts` (calcula el contraste de cada par de colores de `tokens.css` en los cuatro temas/modos y de los 18 colores de tipo):

```ts
import { TYPE_NAMES } from "@pokemon-minigames/shared";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, readableOn, relativeLuminance } from "../../src/theme/contrast";
import { TYPE_STYLES } from "../../src/theme/type-styles";

const css = readFileSync(join(import.meta.dirname, "../../src/theme/tokens.css"), "utf8");

/** Lee los bloques `:root[data-theme="x"][data-mode="y"] { --token: valor; }` del CSS. */
function parseTokens(): Map<string, Record<string, string>> {
  const blocks = new Map<string, Record<string, string>>();
  for (const match of css.matchAll(/:root\[data-theme="(\w+)"\]\[data-mode="(\w+)"\]\s*\{([^}]*)\}/g)) {
    const tokens: Record<string, string> = {};
    for (const declaration of match[3]!.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
      tokens[declaration[1]!] = declaration[2]!.trim();
    }
    blocks.set(`${match[1]}/${match[2]}`, tokens);
  }
  return blocks;
}

const themes = parseTokens();
const REQUIRED = [
  "bg", "surface", "surface-2", "fg", "fg-muted", "line", "accent", "accent-fg", "danger", "danger-bg",
  "success", "success-bg", "header-bg", "header-fg", "radius", "radius-lg", "frame", "font-ui", "font-num",
];

describe("tokens de los temas", () => {
  it("hay cuatro combinaciones: Clásico y Pokédex, claro y oscuro", () => {
    expect([...themes.keys()].sort()).toEqual(["clasico/claro", "clasico/oscuro", "pokedex/claro", "pokedex/oscuro"]);
  });

  it.each([...themes.keys()])("%s define todos los tokens", (name) => {
    expect(Object.keys(themes.get(name)!).sort()).toEqual([...REQUIRED].sort());
  });

  // Pares texto/fondo que se usan juntos en la interfaz: todos deben superar el 4,5:1 de WCAG AA.
  const PAIRS: [string, string][] = [
    ["fg", "bg"],
    ["fg", "surface"],
    ["fg", "surface-2"],
    ["fg-muted", "bg"],
    ["fg-muted", "surface"],
    ["fg-muted", "surface-2"],
    ["danger", "surface"],
    ["success", "surface"],
    ["accent", "bg"],
    ["accent-fg", "accent"],
    ["accent", "surface"],
    ["danger", "danger-bg"],
    ["success", "success-bg"],
    ["header-fg", "header-bg"],
  ];

  it.each([...themes.keys()])("%s: todos los pares de texto cumplen contraste AA", (name) => {
    const tokens = themes.get(name)!;
    for (const [foreground, background] of PAIRS) {
      const ratio = contrastRatio(tokens[foreground]!, tokens[background]!);
      expect(ratio, `${name}: ${foreground} sobre ${background} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("el tema Pokédex tiene bordes más rectos y marcados y números en monoespaciada", () => {
    const classic = themes.get("clasico/claro")!;
    const pokedex = themes.get("pokedex/claro")!;
    expect(Number.parseInt(pokedex.radius!)).toBeLessThan(Number.parseInt(classic.radius!));
    expect(Number.parseInt(pokedex.frame!)).toBeGreaterThan(Number.parseInt(classic.frame!));
    expect(pokedex["font-num"]).toContain("monospace");
    expect(classic["font-num"]).not.toContain("monospace");
  });

  it("los dos modos de cada tema comparten la forma (radios, bordes y tipografías)", () => {
    for (const theme of ["clasico", "pokedex"]) {
      const light = themes.get(`${theme}/claro`)!;
      const dark = themes.get(`${theme}/oscuro`)!;
      for (const token of ["radius", "radius-lg", "frame", "font-ui", "font-num"]) {
        expect(dark[token]).toBe(light[token]);
      }
    }
  });
});

describe("colores de tipo", () => {
  it("los 18 tipos tienen color y su texto supera 4,5:1 sobre él", () => {
    expect(Object.keys(TYPE_STYLES).sort()).toEqual([...TYPE_NAMES].sort());
    for (const type of TYPE_NAMES) {
      const { background, color } = TYPE_STYLES[type];
      expect(contrastRatio(color, background), type).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("los 18 colores de fondo son distintos entre sí", () => {
    expect(new Set(TYPE_NAMES.map((t) => TYPE_STYLES[t].background)).size).toBe(18);
  });
});

describe("contraste", () => {
  it("blanco sobre negro es 21:1 y un color sobre sí mismo 1:1", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#a8a77a", "#a8a77a")).toBeCloseTo(1, 5);
  });

  it("readableOn elige blanco sobre fondos oscuros y casi negro sobre claros", () => {
    expect(readableOn("#26215c")).toBe("#ffffff");
    expect(readableOn("#f7d02c")).toBe("#111111");
  });

  it("rechaza colores que no son #rrggbb", () => {
    expect(() => relativeLuminance("rojo")).toThrow(/inválido/);
    expect(() => relativeLuminance("#fff")).toThrow(/inválido/);
  });
});
```

- [ ] **Step 3: Ejecutar y verificar que falla**

```bash
npm test -w client -- test/theme/tokens.test.ts
```

Expected: FAIL — no existen `src/theme/contrast.ts` ni `src/theme/type-styles.ts` (ni `tokens.css`).

- [ ] **Step 4: Implementar**

`client/src/theme/contrast.ts`:

```ts
/** Luminancia relativa de un color `#rrggbb` (WCAG 2.x). */
export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`Color inválido: ${hex}`);
  const value = Number.parseInt(match[1]!, 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

/** Relación de contraste entre dos colores, de 1 (iguales) a 21 (blanco sobre negro). */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter! + 0.05) / (darker! + 0.05);
}

const LIGHT_TEXT = "#ffffff";
const DARK_TEXT = "#111111";

/** El texto (blanco o casi negro) que mejor se lee sobre un fondo: siempre supera 4,5:1. */
export function readableOn(background: string): string {
  return contrastRatio(LIGHT_TEXT, background) >= contrastRatio(DARK_TEXT, background) ? LIGHT_TEXT : DARK_TEXT;
}
```

`client/src/theme/type-styles.ts`:

```ts
import type { TypeName } from "@pokemon-minigames/shared";
import { readableOn } from "./contrast";

const TYPE_BACKGROUNDS: Record<TypeName, string> = {
  normal: "#a8a77a",
  fighting: "#c22e28",
  flying: "#a98ff3",
  poison: "#a33ea1",
  ground: "#e2bf65",
  rock: "#b6a136",
  bug: "#a6b91a",
  ghost: "#735797",
  steel: "#b7b7ce",
  fire: "#ee8130",
  water: "#6390f0",
  grass: "#7ac74c",
  electric: "#f7d02c",
  psychic: "#f95587",
  ice: "#96d9d6",
  dragon: "#6f35fc",
  dark: "#705746",
  fairy: "#d685ad",
};

export interface TypeStyle {
  background: string;
  color: string;
}

/** Color de cada tipo y el texto que se lee bien sobre él, igual en todos los temas y modos. */
export const TYPE_STYLES: Record<TypeName, TypeStyle> = Object.fromEntries(
  Object.entries(TYPE_BACKGROUNDS).map(([type, background]) => [type, { background, color: readableOn(background) }]),
) as Record<TypeName, TypeStyle>;
```

`client/src/theme/tokens.css` (los dos temas × claro/oscuro; el borde del tema Pokédex es de 2px y el del Clásico de 1px):

```css
/*
 * Tokens de los dos temas (Clásico y Pokédex), cada uno en modo claro y oscuro.
 * Los componentes solo usan estas variables (a través de las utilidades de Tailwind definidas
 * en index.css), nunca colores literales; los 18 colores de tipo son la única excepción.
 */

:root[data-theme="clasico"][data-mode="claro"] {
  --bg: #f6f5f1;
  --surface: #ffffff;
  --surface-2: #f1efe8;
  --fg: #2c2c2a;
  --fg-muted: #5f5e5a;
  --line: #d3d1c7;
  --accent: #185fa5;
  --accent-fg: #ffffff;
  --danger: #a32d2d;
  --danger-bg: #fcebeb;
  --success: #3b6d11;
  --success-bg: #eaf3de;
  --header-bg: #ffffff;
  --header-fg: #2c2c2a;
  --radius: 8px;
  --radius-lg: 12px;
  --frame: 1px;
  --font-ui: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-num: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

:root[data-theme="clasico"][data-mode="oscuro"] {
  --bg: #1d1d1b;
  --surface: #2a2a28;
  --surface-2: #353533;
  --fg: #f1efe8;
  --fg-muted: #b4b2a9;
  --line: #4d4d4a;
  --accent: #85b7eb;
  --accent-fg: #042c53;
  --danger: #f09595;
  --danger-bg: #501313;
  --success: #97c459;
  --success-bg: #173404;
  --header-bg: #2a2a28;
  --header-fg: #f1efe8;
  --radius: 8px;
  --radius-lg: 12px;
  --frame: 1px;
  --font-ui: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-num: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

:root[data-theme="pokedex"][data-mode="claro"] {
  --bg: #e9e4d4;
  --surface: #f7f3e6;
  --surface-2: #ddd6c0;
  --fg: #2c2c2a;
  --fg-muted: #4a4943;
  --line: #2c2c2a;
  --accent: #a32d2d;
  --accent-fg: #fcebeb;
  --danger: #791f1f;
  --danger-bg: #f7c1c1;
  --success: #27500a;
  --success-bg: #c0dd97;
  --header-bg: #a32d2d;
  --header-fg: #fcebeb;
  --radius: 2px;
  --radius-lg: 4px;
  --frame: 2px;
  --font-ui: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-num: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

:root[data-theme="pokedex"][data-mode="oscuro"] {
  --bg: #1c1a17;
  --surface: #2a2723;
  --surface-2: #38342e;
  --fg: #f1efe8;
  --fg-muted: #c4c1b7;
  --line: #9a968a;
  --accent: #f09595;
  --accent-fg: #501313;
  --danger: #f09595;
  --danger-bg: #501313;
  --success: #97c459;
  --success-bg: #173404;
  --header-bg: #791f1f;
  --header-fg: #fcebeb;
  --radius: 2px;
  --radius-lg: 4px;
  --frame: 2px;
  --font-ui: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-num: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
```

`client/src/index.css`:

```css
@import "tailwindcss";
@import "./theme/tokens.css";

@theme inline {
  --color-page: var(--bg);
  --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);
  --color-fg: var(--fg);
  --color-muted: var(--fg-muted);
  --color-line: var(--line);
  --color-accent: var(--accent);
  --color-accent-fg: var(--accent-fg);
  --color-danger: var(--danger);
  --color-danger-bg: var(--danger-bg);
  --color-success: var(--success);
  --color-success-bg: var(--success-bg);
  --color-header: var(--header-bg);
  --color-header-fg: var(--header-fg);
  --radius-ui: var(--radius);
  --radius-card: var(--radius-lg);
  --font-sans: var(--font-ui);
  --font-num: var(--font-num);
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-ui);
}

/*
 * El grosor del borde de los recuadros lo decide el tema (1px en Clásico, 2px en Pokédex).
 * Va en la capa `components` para que las utilidades de Tailwind (p. ej. `border-danger`) puedan ajustarlo.
 */
@layer components {
  .framed {
    border: var(--frame) solid var(--line);
  }
}

:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

`client/src/i18n/es.ts`:

```ts
import type { BaseStats, ErrorCode, GameEndReason, PickResult, TypeName } from "@pokemon-minigames/shared";

export const TYPE_LABELS: Record<TypeName, string> = {
  normal: "normal",
  fighting: "lucha",
  flying: "volador",
  poison: "veneno",
  ground: "tierra",
  rock: "roca",
  bug: "bicho",
  ghost: "fantasma",
  steel: "acero",
  fire: "fuego",
  water: "agua",
  grass: "planta",
  electric: "eléctrico",
  psychic: "psíquico",
  ice: "hielo",
  dragon: "dragón",
  dark: "siniestro",
  fairy: "hada",
};

export const NETWORK_ERROR = "NETWORK";

const ERROR_MESSAGES: Record<ErrorCode | typeof NETWORK_ERROR, string> = {
  VALIDATION_ERROR: "Revisa los datos: hay algo que no es válido.",
  EMAIL_TAKEN: "Ese email ya está registrado.",
  USERNAME_TAKEN: "Ese nombre de usuario ya está en uso.",
  INVALID_CREDENTIALS: "Email o contraseña incorrectos.",
  UNAUTHORIZED: "Tu sesión expiró. Inicia sesión de nuevo.",
  INVALID_REFRESH_TOKEN: "Tu sesión expiró. Inicia sesión de nuevo.",
  NOT_FOUND: "No encontramos lo que buscas.",
  INTERNAL_ERROR: "Algo falló en el servidor. Inténtalo de nuevo.",
  ALREADY_IN_GAME: "Ya estás en una partida. Vuelve a ella desde el lobby.",
  ROOM_NOT_FOUND: "Esa sala no existe o ya terminó.",
  ROOM_FULL: "Esa sala ya está llena.",
  ROOM_CLOSED: "Esa sala ya empezó o se cerró.",
  NOT_IN_ROOM: "No participas en esa sala.",
  WRONG_PHASE: "Ahora no puedes hacer eso.",
  ALREADY_ANSWERED: "Ya enviaste tu respuesta en esta ronda.",
  ALREADY_CHOSEN: "Ya elegiste tu tipo en esta ronda.",
  INVALID_TYPE: "Ese tipo no existe.",
  RATE_LIMITED: "Vas muy rápido. Espera un momento.",
  NETWORK: "No se pudo conectar con el servidor. Revisa tu conexión.",
};

/** Mensaje en español para un código de error; cualquier código desconocido da uno genérico. */
export function errorMessage(code: string | undefined): string {
  if (code && code in ERROR_MESSAGES) return ERROR_MESSAGES[code as keyof typeof ERROR_MESSAGES];
  return ERROR_MESSAGES.INTERNAL_ERROR;
}

/** Errores tras los que tiene sentido salir de la sala y volver al lobby. */
export const ROOM_GONE_CODES: readonly string[] = ["ROOM_NOT_FOUND", "NOT_IN_ROOM", "ROOM_CLOSED"];

export const PICK_RESULT_LABELS: Record<PickResult, string> = {
  VALID: "Acertó",
  NOT_FOUND: "Ese Pokémon no existe",
  WRONG_TYPES: "No tiene esos dos tipos",
  ALREADY_OWNED: "Ya estaba en su equipo",
  TAKEN: "Otro jugador lo tenía",
  NO_ANSWER: "No respondió",
};

export const END_REASON_LABELS: Record<GameEndReason, string> = {
  completed: "La partida terminó",
  forfeit: "Un jugador abandonó la partida",
  disconnect: "Un jugador se desconectó",
  exhausted: "No quedaron más pares de tipos jugables",
  cancelled: "La sala se canceló",
  expired: "La sala caducó",
  abandoned: "La partida se abandonó",
};

export const STAT_LABELS: Record<keyof BaseStats, string> = {
  hp: "PS",
  attack: "Ataque",
  defense: "Defensa",
  spAttack: "At. esp.",
  spDefense: "Def. esp.",
  speed: "Velocidad",
};
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

```bash
npm test -w client
npm run typecheck -w client
```

Expected: PASS (16 pruebas) y `tsc` sin errores.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(client): andamiaje del cliente, textos en español, colores de tipo y tokens de tema con contraste AA" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Almacén de tema y script anti-destello

**Files:**
- Create: `client/src/theme/theme-store.ts`, `client/index.html`
- Test: `client/test/theme/theme-store.test.ts`

**Interfaces:**
- Produces: `ThemeName` (`"clasico" | "pokedex"`), `ThemeMode` (`"auto" | "claro" | "oscuro"`), `ResolvedMode`, `THEME_LABELS`, `MODE_LABELS`, `THEME_NAMES`, `THEME_MODES`, `THEME_STORAGE_KEY`, `DEFAULT_PREFERENCE`, `parsePreference(raw)` (tolera valores corruptos), `resolveMode(mode, prefersDark)`, `createThemeStore({ storage, root, media })` → store con `preference`, `resolvedMode`, `setTheme`, `setMode`. Aplica `data-theme` y `data-mode` a `root`, guarda la preferencia (sin fallar si el almacenamiento falta o lanza) y sigue los cambios del sistema en modo `auto`.
- `index.html` aplica el tema guardado **antes** de pintar, con un script inline.

- [ ] **Step 1: Escribir la prueba que falla**

`client/test/theme/theme-store.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCE,
  THEME_STORAGE_KEY,
  type ThemeEnv,
  createThemeStore,
  parsePreference,
  resolveMode,
} from "../../src/theme/theme-store";

function fakeEnv(options: { saved?: string | null; prefersDark?: boolean; brokenStorage?: boolean } = {}) {
  const data = new Map<string, string>();
  if (options.saved) data.set(THEME_STORAGE_KEY, options.saved);
  const listeners: Array<() => void> = [];
  const media = {
    matches: options.prefersDark ?? false,
    addEventListener: (_type: "change", listener: () => void) => void listeners.push(listener),
  };
  const storage = options.brokenStorage
    ? {
        getItem: () => {
          throw new Error("bloqueado");
        },
        setItem: () => {
          throw new Error("bloqueado");
        },
      }
    : { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
  const root = document.createElement("html");
  const env: ThemeEnv = { storage, root, media };
  return { env, data, root, media, changeSystemTheme: (dark: boolean) => { media.matches = dark; listeners.forEach((l) => l()); } };
}

describe("parsePreference", () => {
  it("lee una preferencia válida", () => {
    expect(parsePreference('{"theme":"pokedex","mode":"oscuro"}')).toEqual({ theme: "pokedex", mode: "oscuro" });
  });

  it.each([
    ["nada guardado", null],
    ["JSON roto", "{no es json"],
    ["un número", "42"],
    ["null", "null"],
    ["valores desconocidos", '{"theme":"neon","mode":"sepia"}'],
  ])("usa los valores por defecto con %s", (_name, raw) => {
    expect(parsePreference(raw)).toEqual(DEFAULT_PREFERENCE);
  });

  it("conserva lo válido y reemplaza solo lo inválido", () => {
    expect(parsePreference('{"theme":"pokedex","mode":"sepia"}')).toEqual({ theme: "pokedex", mode: "auto" });
    expect(parsePreference('{"mode":"claro"}')).toEqual({ theme: "clasico", mode: "claro" });
  });
});

describe("resolveMode", () => {
  it("el modo automático sigue al sistema y los demás son fijos", () => {
    expect(resolveMode("auto", true)).toBe("oscuro");
    expect(resolveMode("auto", false)).toBe("claro");
    expect(resolveMode("claro", true)).toBe("claro");
    expect(resolveMode("oscuro", false)).toBe("oscuro");
  });
});

describe("createThemeStore", () => {
  it("al crearse aplica la preferencia guardada al documento", () => {
    const { env, root } = fakeEnv({ saved: '{"theme":"pokedex","mode":"oscuro"}' });
    const store = createThemeStore(env);
    expect(store.getState().preference).toEqual({ theme: "pokedex", mode: "oscuro" });
    expect(root.dataset.theme).toBe("pokedex");
    expect(root.dataset.mode).toBe("oscuro");
  });

  it("sin nada guardado usa Clásico y el modo del sistema", () => {
    const { env, root } = fakeEnv({ prefersDark: true });
    createThemeStore(env);
    expect(root.dataset.theme).toBe("clasico");
    expect(root.dataset.mode).toBe("oscuro");
  });

  it("cambiar de tema lo aplica y lo guarda, sin tocar el modo", () => {
    const { env, root, data } = fakeEnv();
    const store = createThemeStore(env);
    store.getState().setTheme("pokedex");
    expect(root.dataset.theme).toBe("pokedex");
    expect(JSON.parse(data.get(THEME_STORAGE_KEY)!)).toEqual({ theme: "pokedex", mode: "auto" });
  });

  it("cambiar de modo lo aplica y lo guarda, sin tocar el tema", () => {
    const { env, root, data } = fakeEnv({ saved: '{"theme":"pokedex","mode":"auto"}' });
    const store = createThemeStore(env);
    store.getState().setMode("oscuro");
    expect(root.dataset.mode).toBe("oscuro");
    expect(store.getState().resolvedMode).toBe("oscuro");
    expect(JSON.parse(data.get(THEME_STORAGE_KEY)!)).toEqual({ theme: "pokedex", mode: "oscuro" });
  });

  it("en modo automático sigue los cambios del sistema; en modo fijo los ignora", () => {
    const { env, root, changeSystemTheme } = fakeEnv();
    const store = createThemeStore(env);
    changeSystemTheme(true);
    expect(root.dataset.mode).toBe("oscuro");
    changeSystemTheme(false);
    expect(root.dataset.mode).toBe("claro");

    store.getState().setMode("claro");
    changeSystemTheme(true);
    expect(root.dataset.mode).toBe("claro");
  });

  it("si el almacenamiento falla (modo privado) sigue funcionando con los valores por defecto", () => {
    const { env, root } = fakeEnv({ brokenStorage: true });
    const store = createThemeStore(env);
    expect(store.getState().preference).toEqual(DEFAULT_PREFERENCE);
    expect(() => store.getState().setTheme("pokedex")).not.toThrow();
    expect(root.dataset.theme).toBe("pokedex");
  });

  it("sin almacenamiento (null) tampoco falla", () => {
    const { env } = fakeEnv();
    const store = createThemeStore({ ...env, storage: null });
    expect(() => store.getState().setMode("oscuro")).not.toThrow();
  });
});

describe("script que aplica el tema antes de pintar (index.html)", () => {
  const html = readFileSync(join(import.meta.dirname, "../../index.html"), "utf8");
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1]!;

  function run(saved: string | null, prefersDark: boolean, storageThrows = false) {
    const root = document.createElement("html");
    const fakeDocument = { documentElement: root };
    const localStorage = {
      getItem: () => {
        if (storageThrows) throw new Error("bloqueado");
        return saved;
      },
    };
    const matchMedia = () => ({ matches: prefersDark });
    new Function("document", "localStorage", "matchMedia", script)(fakeDocument, localStorage, matchMedia);
    return { theme: root.dataset.theme, mode: root.dataset.mode };
  }

  it("aplica el tema y el modo guardados", () => {
    expect(run('{"theme":"pokedex","mode":"oscuro"}', false)).toEqual({ theme: "pokedex", mode: "oscuro" });
  });

  it("en modo automático o sin nada guardado usa el modo del sistema", () => {
    expect(run('{"theme":"pokedex","mode":"auto"}', true)).toEqual({ theme: "pokedex", mode: "oscuro" });
    expect(run(null, true)).toEqual({ theme: "clasico", mode: "oscuro" });
    expect(run(null, false)).toEqual({ theme: "clasico", mode: "claro" });
  });

  it("con datos corruptos o sin acceso al almacenamiento cae en Clásico claro", () => {
    expect(run("{roto", true)).toEqual({ theme: "clasico", mode: "claro" });
    expect(run(null, true, true)).toEqual({ theme: "clasico", mode: "claro" });
  });

  it("ignora valores desconocidos", () => {
    expect(run('{"theme":"neon","mode":"sepia"}', false)).toEqual({ theme: "clasico", mode: "claro" });
  });

  it("decide igual que el almacén de React para las mismas entradas", () => {
    for (const saved of [null, '{"theme":"pokedex","mode":"claro"}', '{"mode":"oscuro"}', '{"theme":"x"}']) {
      for (const dark of [true, false]) {
        const fromScript = run(saved, dark);
        const { env, root } = fakeEnv({ saved, prefersDark: dark });
        createThemeStore(env);
        expect({ theme: root.dataset.theme, mode: root.dataset.mode }, `${saved} / oscuro=${dark}`).toEqual(fromScript);
      }
    }
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w client -- test/theme/theme-store.test.ts
```

Expected: FAIL — no existe `src/theme/theme-store.ts`.

- [ ] **Step 3: Implementar**

`client/src/theme/theme-store.ts`:

```ts
import { type StoreApi, createStore } from "zustand";

export type ThemeName = "clasico" | "pokedex";
export type ThemeMode = "auto" | "claro" | "oscuro";
export type ResolvedMode = "claro" | "oscuro";

export interface ThemePreference {
  theme: ThemeName;
  mode: ThemeMode;
}

export const THEME_LABELS: Record<ThemeName, string> = { clasico: "Clásico", pokedex: "Pokédex" };
export const MODE_LABELS: Record<ThemeMode, string> = { auto: "Automático", claro: "Claro", oscuro: "Oscuro" };
export const THEME_NAMES = Object.keys(THEME_LABELS) as ThemeName[];
export const THEME_MODES = Object.keys(MODE_LABELS) as ThemeMode[];

export const THEME_STORAGE_KEY = "pokemon-minigames:theme";
export const DEFAULT_PREFERENCE: ThemePreference = { theme: "clasico", mode: "auto" };

/** Lee una preferencia guardada; cualquier dato ausente o inválido se reemplaza por el valor por defecto. */
export function parsePreference(raw: string | null): ThemePreference {
  try {
    const data: unknown = raw === null ? null : JSON.parse(raw);
    const { theme, mode } = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
    return {
      theme: THEME_NAMES.includes(theme as ThemeName) ? (theme as ThemeName) : DEFAULT_PREFERENCE.theme,
      mode: THEME_MODES.includes(mode as ThemeMode) ? (mode as ThemeMode) : DEFAULT_PREFERENCE.mode,
    };
  } catch {
    return { ...DEFAULT_PREFERENCE };
  }
}

export function resolveMode(mode: ThemeMode, prefersDark: boolean): ResolvedMode {
  if (mode === "auto") return prefersDark ? "oscuro" : "claro";
  return mode;
}

export interface ThemeState {
  preference: ThemePreference;
  resolvedMode: ResolvedMode;
  setTheme(theme: ThemeName): void;
  setMode(mode: ThemeMode): void;
}

/** Lo que el almacén necesita de `matchMedia("(prefers-color-scheme: dark)")`. */
export interface MediaLike {
  matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
}

export interface ThemeEnv {
  /** Almacenamiento del navegador; puede faltar o fallar (modo privado, datos bloqueados). */
  storage: Pick<Storage, "getItem" | "setItem"> | null;
  root: HTMLElement;
  /** Consulta `(prefers-color-scheme: dark)`. */
  media: MediaLike;
}

export function createThemeStore(env: ThemeEnv): StoreApi<ThemeState> {
  const read = (): string | null => {
    try {
      return env.storage?.getItem(THEME_STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  };
  const write = (preference: ThemePreference): void => {
    try {
      env.storage?.setItem(THEME_STORAGE_KEY, JSON.stringify(preference));
    } catch {
      // Sin almacenamiento la preferencia vale solo para esta visita.
    }
  };
  const apply = (preference: ThemePreference): ResolvedMode => {
    const resolvedMode = resolveMode(preference.mode, env.media.matches);
    env.root.dataset.theme = preference.theme;
    env.root.dataset.mode = resolvedMode;
    return resolvedMode;
  };

  const initial = parsePreference(read());
  const store = createStore<ThemeState>((set, get) => ({
    preference: initial,
    resolvedMode: apply(initial),
    setTheme(theme) {
      const preference = { ...get().preference, theme };
      write(preference);
      set({ preference, resolvedMode: apply(preference) });
    },
    setMode(mode) {
      const preference = { ...get().preference, mode };
      write(preference);
      set({ preference, resolvedMode: apply(preference) });
    },
  }));

  // En modo automático, seguir los cambios del sistema mientras la página está abierta.
  env.media.addEventListener("change", () => {
    const { preference } = store.getState();
    if (preference.mode === "auto") store.setState({ resolvedMode: apply(preference) });
  });

  return store;
}
```

`client/index.html` (el script inline lee `localStorage` y fija `data-theme`/`data-mode` antes de que se pinte nada; si el almacenamiento falla, usa Clásico y el modo del sistema):

```html
<!doctype html>
<html lang="es" data-theme="clasico" data-mode="claro">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Pokémon Minigames</title>
    <script>
      // Aplica el tema guardado antes de pintar, para que no se vea un destello del tema equivocado.
      (function () {
        try {
          var saved = JSON.parse(localStorage.getItem("pokemon-minigames:theme") || "{}") || {};
          var theme = saved.theme === "pokedex" ? "pokedex" : "clasico";
          var mode = saved.mode;
          if (mode !== "claro" && mode !== "oscuro") {
            mode = matchMedia("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro";
          }
          document.documentElement.dataset.theme = theme;
          document.documentElement.dataset.mode = mode;
        } catch (error) {
          document.documentElement.dataset.theme = "clasico";
          document.documentElement.dataset.mode = "claro";
        }
      })();
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w client -- test/theme
npm run typecheck -w client
```

Expected: PASS (20 pruebas de `theme-store` y las 16 de `tokens`) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): almacén de tema y modo, con preferencia guardada y sin destello al cargar" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Capa API (cliente HTTP con renovación única de sesión)

**Files:**
- Create: `client/src/api/types.ts`, `client/src/api/client.ts`, `client/src/api/endpoints.ts`
- Test: `client/test/api/client.test.ts`, `client/test/api/endpoints.test.ts`

**Interfaces:**
- Produces: `AuthUser { id, email, username, createdAt }`, `AuthSession { user, accessToken }`, `PokemonName { id, es, en }`; `ApiError(status, code, details?)` (su `message` ya está en español); `ApiClient({ baseUrl?, fetch?, onSessionLost? })` con `request<T>(method, path, { body?, auth? })`, `refreshSession()` (las llamadas simultáneas comparten una sola petición), `getToken()`, `setToken()`; `Endpoints` y `createEndpoints(api)`: `auth.{register, login, refresh, logout}`, `rooms.{create, join, get, current}`, `catalog.names`.
- Comportamiento: con 401 (y `auth` verdadero) renueva la sesión **una vez** y reintenta; si la renovación falla llama a `onSessionLost`, borra el token y lanza el error original; nunca entra en bucle; `login`/`register` no renuevan nada; un error de red es un `ApiError` con código `NETWORK`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`client/test/api/client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError } from "../../src/api/client";
import type { AuthSession } from "../../src/api/types";

const session = (token: string): AuthSession => ({
  user: { id: "u1", email: "ash@example.com", username: "ash", createdAt: "2026-01-01T00:00:00.000Z" },
  accessToken: token,
});

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const errorBody = (code: string) => ({ error: { code, message: "mensaje del servidor" } });

type Handler = (url: string, init: RequestInit) => Promise<Response> | Response;

function setup(handler: Handler, options: { onSessionLost?: () => void; baseUrl?: string } = {}) {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => handler(String(input), init ?? {}));
  const api = new ApiClient({ fetch: fetchMock, ...options });
  const calls = (path: string) => fetchMock.mock.calls.filter(([url]) => String(url).endsWith(path));
  return { api, fetchMock, calls };
}

const header = (init: RequestInit | undefined, name: string) => (init?.headers as Record<string, string> | undefined)?.[name];

describe("ApiClient.request", () => {
  it("envía JSON, el access token y las cookies, y devuelve la respuesta", async () => {
    const { api, fetchMock } = setup(() => json(200, { ok: true }));
    api.setToken("abc");
    const result = await api.request<{ ok: boolean }>("POST", "/rooms", { body: { typeMode: "random" } });

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/rooms");
    expect(init).toMatchObject({ method: "POST", credentials: "include", body: '{"typeMode":"random"}' });
    expect(header(init, "Authorization")).toBe("Bearer abc");
    expect(header(init, "Content-Type")).toBe("application/json");
  });

  it("sin cuerpo no manda Content-Type y sin token no manda Authorization", async () => {
    const { api, fetchMock } = setup(() => json(200, {}));
    await api.request("GET", "/rooms/current");
    const init = fetchMock.mock.calls[0]![1];
    expect(header(init, "Content-Type")).toBeUndefined();
    expect(header(init, "Authorization")).toBeUndefined();
  });

  it("antepone la URL base", async () => {
    const { api, fetchMock } = setup(() => json(200, {}), { baseUrl: "https://api.example.com" });
    await api.request("GET", "/health");
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.example.com/health");
  });

  it("una respuesta 204 devuelve undefined", async () => {
    const { api } = setup(() => json(204));
    await expect(api.request("POST", "/auth/logout")).resolves.toBeUndefined();
  });

  it("convierte un error del servidor en ApiError con su código y un mensaje en español", async () => {
    const { api } = setup(() => json(409, errorBody("ROOM_FULL")));
    const error = await api.request("POST", "/rooms/ABC234/join").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "ROOM_FULL", message: "Esa sala ya está llena." });
  });

  it("conserva los detalles de validación", async () => {
    const details = [{ path: "email", message: "Email inválido" }];
    const { api } = setup(() => json(400, { error: { code: "VALIDATION_ERROR", message: "x", details } }));
    const error = (await api.request("POST", "/auth/register", { auth: false }).catch((e: unknown) => e)) as ApiError;
    expect(error.details).toEqual(details);
  });

  it("una respuesta de error que no es JSON da un error genérico", async () => {
    const { api } = setup(() => new Response("<html>502</html>", { status: 502 }));
    const error = (await api.request("GET", "/x").catch((e: unknown) => e)) as ApiError;
    expect(error).toMatchObject({ status: 502, code: "INTERNAL_ERROR" });
  });

  it("si no hay conexión lanza un ApiError de red con mensaje en español", async () => {
    const { api } = setup(() => {
      throw new TypeError("Failed to fetch");
    });
    const error = (await api.request("GET", "/x").catch((e: unknown) => e)) as ApiError;
    expect(error).toMatchObject({ status: 0, code: "NETWORK" });
    expect(error.message).toContain("No se pudo conectar");
  });
});

describe("renovación de la sesión ante un 401", () => {
  /** El servidor acepta solo el token "nuevo"; /auth/refresh lo entrega. */
  function tokenServer(refreshBehaviour: () => Promise<Response> | Response = () => json(200, session("nuevo"))) {
    return (url: string, init: RequestInit) => {
      if (url.endsWith("/auth/refresh")) return refreshBehaviour();
      return header(init, "Authorization") === "Bearer nuevo" ? json(200, { ok: true }) : json(401, errorBody("UNAUTHORIZED"));
    };
  }

  it("renueva la sesión una vez y reintenta con el token nuevo", async () => {
    const { api, calls } = setup(tokenServer());
    api.setToken("viejo");
    await expect(api.request("GET", "/rooms/current")).resolves.toEqual({ ok: true });
    expect(calls("/auth/refresh")).toHaveLength(1);
    expect(calls("/rooms/current")).toHaveLength(2);
    expect(api.getToken()).toBe("nuevo");
  });

  it("varias peticiones que fallan a la vez comparten una sola renovación", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { api, calls } = setup(
      tokenServer(async () => {
        await gate;
        return json(200, session("nuevo"));
      }),
    );
    api.setToken("viejo");
    const pending = Promise.all([api.request("GET", "/a"), api.request("GET", "/b"), api.request("GET", "/c")]);
    await vi.waitFor(() => expect(calls("/auth/refresh").length).toBeGreaterThan(0));
    release();
    await pending;

    expect(calls("/auth/refresh")).toHaveLength(1);
    for (const path of ["/a", "/b", "/c"]) expect(calls(path)).toHaveLength(2);
  });

  it("una renovación posterior, cuando la anterior ya terminó, hace otra petición", async () => {
    const { api, calls } = setup(tokenServer());
    await api.refreshSession();
    await api.refreshSession();
    expect(calls("/auth/refresh")).toHaveLength(2);
  });

  it("si la renovación falla, avisa de que la sesión se perdió, borra el token y lanza el error original", async () => {
    const onSessionLost = vi.fn();
    const { api } = setup(tokenServer(() => json(401, errorBody("INVALID_REFRESH_TOKEN"))), { onSessionLost });
    api.setToken("viejo");
    const error = (await api.request("GET", "/rooms/current").catch((e: unknown) => e)) as ApiError;

    expect(error).toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    expect(onSessionLost).toHaveBeenCalledTimes(1);
    expect(api.getToken()).toBeNull();
  });

  it("si tras renovar el servidor sigue respondiendo 401, no entra en bucle", async () => {
    const { api, calls } = setup((url) =>
      url.endsWith("/auth/refresh") ? json(200, session("nuevo")) : json(401, errorBody("UNAUTHORIZED")),
    );
    api.setToken("viejo");
    const error = (await api.request("GET", "/x").catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe("UNAUTHORIZED");
    expect(calls("/auth/refresh")).toHaveLength(1);
    expect(calls("/x")).toHaveLength(2);
  });

  it("las peticiones sin autenticación (login) no renuevan nada: un 401 es un error normal", async () => {
    const { api, calls } = setup(() => json(401, errorBody("INVALID_CREDENTIALS")));
    const error = (await api.request("POST", "/auth/login", { auth: false, body: {} }).catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe("INVALID_CREDENTIALS");
    expect(calls("/auth/refresh")).toHaveLength(0);
  });

  it("un error de red durante la renovación cuenta como sesión perdida", async () => {
    const onSessionLost = vi.fn();
    const { api } = setup(
      tokenServer(() => {
        throw new TypeError("sin red");
      }),
      { onSessionLost },
    );
    api.setToken("viejo");
    await api.request("GET", "/x").catch(() => {});
    expect(onSessionLost).toHaveBeenCalledTimes(1);
  });
});

describe("ApiClient.refreshSession", () => {
  it("guarda el token nuevo y devuelve la sesión", async () => {
    const { api, fetchMock } = setup(() => json(200, session("recién-emitido")));
    const result = await api.refreshSession();
    expect(result?.user.username).toBe("ash");
    expect(api.getToken()).toBe("recién-emitido");
    const init = fetchMock.mock.calls[0]![1];
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    expect(header(init, "Authorization")).toBeUndefined();
  });

  it("sin sesión (401) devuelve null y deja el token vacío", async () => {
    const { api } = setup(() => json(401, errorBody("INVALID_REFRESH_TOKEN")));
    api.setToken("viejo");
    await expect(api.refreshSession()).resolves.toBeNull();
    expect(api.getToken()).toBeNull();
  });
});
```

`client/test/api/endpoints.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "../../src/api/client";
import { createEndpoints } from "../../src/api/endpoints";

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const session = { user: { id: "u1", email: "ash@example.com", username: "ash", createdAt: "2026-01-01T00:00:00.000Z" }, accessToken: "tok" };

function setup(response: () => Response = () => json(200, {})) {
  const fetchMock = vi.fn<typeof fetch>(async () => response());
  const api = new ApiClient({ fetch: fetchMock });
  return { api, endpoints: createEndpoints(api), fetchMock };
}

const lastCall = (fetchMock: ReturnType<typeof setup>["fetchMock"]) => {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: String(url), method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined };
};

describe("endpoints de autenticación", () => {
  it("register y login envían los datos, guardan el token y devuelven la sesión", async () => {
    const { api, endpoints, fetchMock } = setup(() => json(200, session));
    const registered = await endpoints.auth.register({ email: "ash@example.com", username: "ash", password: "pikachu-123" });
    expect(registered.user.username).toBe("ash");
    expect(lastCall(fetchMock)).toEqual({
      url: "/auth/register",
      method: "POST",
      body: { email: "ash@example.com", username: "ash", password: "pikachu-123" },
    });
    expect(api.getToken()).toBe("tok");

    api.setToken(null);
    await endpoints.auth.login({ email: "ash@example.com", password: "pikachu-123" });
    expect(lastCall(fetchMock).url).toBe("/auth/login");
    expect(api.getToken()).toBe("tok");
  });

  it("un login fallido no deja token", async () => {
    const { api, endpoints } = setup(() => json(401, { error: { code: "INVALID_CREDENTIALS", message: "x" } }));
    await expect(endpoints.auth.login({ email: "a@b.co", password: "x" })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(api.getToken()).toBeNull();
  });

  it("logout borra el token aunque el servidor falle", async () => {
    const { api, endpoints } = setup(() => json(500, { error: { code: "INTERNAL_ERROR", message: "x" } }));
    api.setToken("tok");
    await expect(endpoints.auth.logout()).rejects.toBeTruthy();
    expect(api.getToken()).toBeNull();
  });

  it("refresh usa la renovación del cliente", async () => {
    const { api, endpoints } = setup(() => json(200, session));
    await expect(endpoints.auth.refresh()).resolves.toMatchObject({ accessToken: "tok" });
    expect(api.getToken()).toBe("tok");
  });
});

describe("endpoints de salas", () => {
  it("create envía la configuración y devuelve el código", async () => {
    const { endpoints, fetchMock } = setup(() => json(201, { code: "ABC234" }));
    const config = { typeMode: "random", lengthMode: "custom", statsGoal: 2500 } as const;
    await expect(endpoints.rooms.create(config)).resolves.toEqual({ code: "ABC234" });
    expect(lastCall(fetchMock)).toEqual({ url: "/rooms", method: "POST", body: config });
  });

  it("join y get codifican el código en la ruta", async () => {
    const { endpoints, fetchMock } = setup(() => json(200, { code: "X" }));
    await endpoints.rooms.join("a b/c");
    expect(lastCall(fetchMock)).toMatchObject({ url: "/rooms/a%20b%2Fc/join", method: "POST" });
    await endpoints.rooms.get("ABC234");
    expect(lastCall(fetchMock)).toMatchObject({ url: "/rooms/ABC234", method: "GET" });
  });

  it("current devuelve la sala activa o null", async () => {
    const active = setup(() => json(200, { room: { code: "ABC234", phase: "waiting" } }));
    await expect(active.endpoints.rooms.current()).resolves.toEqual({ code: "ABC234", phase: "waiting" });
    expect(lastCall(active.fetchMock).url).toBe("/rooms/current");

    const none = setup(() => json(200, { room: null }));
    await expect(none.endpoints.rooms.current()).resolves.toBeNull();
  });
});

describe("endpoint del catálogo", () => {
  it("names pide la lista sin enviar credenciales de sesión", async () => {
    const { api, endpoints, fetchMock } = setup(() => json(200, [{ id: 1, es: "Alfa", en: "Alpha" }]));
    api.setToken("tok");
    await expect(endpoints.catalog.names()).resolves.toEqual([{ id: 1, es: "Alfa", en: "Alpha" }]);
    const init = fetchMock.mock.calls[0]![1];
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w client -- test/api
```

Expected: FAIL — no existen los módulos de `src/api`.

- [ ] **Step 3: Implementar**

`client/src/api/types.ts`:

```ts
export interface AuthUser {
  id: string;
  email: string;
  username: string;
  createdAt: string;
}

/** Respuesta de /auth/register, /auth/login y /auth/refresh. */
export interface AuthSession {
  user: AuthUser;
  accessToken: string;
}

export interface PokemonName {
  id: number;
  es: string;
  en: string;
}
```

`client/src/api/client.ts`:

```ts
import type { ErrorCode } from "@pokemon-minigames/shared";
import { NETWORK_ERROR, errorMessage } from "../i18n/es";
import type { AuthSession } from "./types";

/** Error de una llamada al servidor. `message` ya está en español y listo para mostrar. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | typeof NETWORK_ERROR,
    readonly details?: unknown,
  ) {
    super(errorMessage(code));
    this.name = "ApiError";
  }
}

export interface ApiClientOptions {
  /** Prefijo de todas las rutas. Vacío = el mismo origen que la página (lo habitual). */
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Se llama cuando la sesión no se pudo renovar: hay que volver a iniciar sesión. */
  onSessionLost?: () => void;
}

export interface RequestOptions {
  body?: unknown;
  /** Por defecto la petición lleva el access token y, si da 401, renueva la sesión y reintenta. */
  auth?: boolean;
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const data = (await response.json()) as { error?: { code?: ErrorCode; details?: unknown } };
    return new ApiError(response.status, data.error?.code ?? "INTERNAL_ERROR", data.error?.details);
  } catch {
    return new ApiError(response.status, "INTERNAL_ERROR");
  }
}

/**
 * Cliente HTTP del servidor. Guarda el access token en memoria (nunca en el almacenamiento del
 * navegador) y, cuando caduca, lo renueva con la cookie de refresco: una sola vez, aunque varias
 * peticiones fallen a la vez.
 */
export class ApiClient {
  private token: string | null = null;
  private refreshing: Promise<AuthSession | null> | null = null;

  constructor(private readonly options: ApiClientOptions = {}) {}

  getToken(): string | null {
    return this.token;
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  async request<T>(method: string, path: string, { body, auth = true }: RequestOptions = {}): Promise<T> {
    let response = await this.send(method, path, body, auth ? this.token : null);

    if (response.status === 401 && auth) {
      const session = await this.refreshSession();
      if (!session) {
        this.options.onSessionLost?.();
        throw await toApiError(response);
      }
      response = await this.send(method, path, body, session.accessToken);
    }

    if (!response.ok) throw await toApiError(response);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  /** Renueva la sesión con la cookie. Las llamadas simultáneas comparten una sola petición. */
  refreshSession(): Promise<AuthSession | null> {
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(): Promise<AuthSession | null> {
    try {
      const response = await this.send("POST", "/auth/refresh", undefined, null);
      if (!response.ok) {
        this.token = null;
        return null;
      }
      const session = (await response.json()) as AuthSession;
      this.token = session.accessToken;
      return session;
    } catch {
      return null;
    }
  }

  private async send(method: string, path: string, body: unknown, token: string | null): Promise<Response> {
    const doFetch = this.options.fetch ?? globalThis.fetch.bind(globalThis);
    try {
      return await doFetch(`${this.options.baseUrl ?? ""}${path}`, {
        method,
        credentials: "include",
        headers: {
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(0, NETWORK_ERROR);
    }
  }
}
```

`client/src/api/endpoints.ts`:

```ts
import type { CreateRoomRequest, CreateRoomResponse, GamePhase, PublicRoomInfo } from "@pokemon-minigames/shared";
import type { ApiClient } from "./client";
import type { AuthSession, PokemonName } from "./types";

export interface Credentials {
  email: string;
  password: string;
}

export interface Registration extends Credentials {
  username: string;
}

export interface CurrentRoom {
  code: string;
  phase: GamePhase;
}

/** Todas las llamadas al servidor que usa la interfaz, agrupadas por tema. */
export interface Endpoints {
  auth: {
    register(input: Registration): Promise<AuthSession>;
    login(input: Credentials): Promise<AuthSession>;
    /** Renueva la sesión con la cookie de refresco; `null` si no hay sesión. */
    refresh(): Promise<AuthSession | null>;
    logout(): Promise<void>;
  };
  rooms: {
    create(config: CreateRoomRequest): Promise<CreateRoomResponse>;
    join(code: string): Promise<CreateRoomResponse>;
    get(code: string): Promise<PublicRoomInfo>;
    /** La sala activa del usuario, o `null` si no tiene ninguna. */
    current(): Promise<CurrentRoom | null>;
  };
  catalog: {
    names(): Promise<PokemonName[]>;
  };
}

export function createEndpoints(api: ApiClient): Endpoints {
  const startSession = async (path: string, body: unknown): Promise<AuthSession> => {
    const session = await api.request<AuthSession>("POST", path, { body, auth: false });
    api.setToken(session.accessToken);
    return session;
  };

  return {
    auth: {
      register: (input) => startSession("/auth/register", input),
      login: (input) => startSession("/auth/login", input),
      refresh: () => api.refreshSession(),
      async logout() {
        try {
          await api.request<void>("POST", "/auth/logout", { auth: false });
        } finally {
          // Aunque el servidor no responda, en este navegador la sesión ya terminó.
          api.setToken(null);
        }
      },
    },
    rooms: {
      create: (config) => api.request<CreateRoomResponse>("POST", "/rooms", { body: config }),
      join: (code) => api.request<CreateRoomResponse>("POST", `/rooms/${encodeURIComponent(code)}/join`),
      get: (code) => api.request<PublicRoomInfo>("GET", `/rooms/${encodeURIComponent(code)}`),
      async current() {
        const { room } = await api.request<{ room: CurrentRoom | null }>("GET", "/rooms/current");
        return room;
      },
    },
    catalog: {
      names: () => api.request<PokemonName[]>("GET", "/pokemon/names", { auth: false }),
    },
  };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w client -- test/api
npm run typecheck -w client
```

Expected: PASS (25 pruebas: 17 de `client.test.ts` y 8 de `endpoints.test.ts`) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): cliente HTTP con token en memoria y renovación única de la sesión" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Núcleo de la partida (reloj, reductor, store y `GameClient`)

**Files:**
- Create: `client/src/game/clock.ts`, `client/src/game/apply-event.ts`, `client/src/game/store.ts`, `client/src/game/game-client.ts`, `client/test/helpers/events.ts`, `client/test/helpers/fake-socket.ts`
- Test: `client/test/game/clock.test.ts`, `client/test/game/apply-event.test.ts`, `client/test/game/store.test.ts`, `client/test/game/game-client.test.ts`

**Interfaces:**
- `clockOffset(serverNow, receivedAt)`, `remainingMs(deadline | null, offset, now)` (nunca baja de 0), `secondsLeft(ms)` (redondea hacia arriba), `useCountdown(deadline, offset, { now?, intervalMs? })` (actualiza unas 4 veces por segundo; se detiene en 0; recalcula al cambiar el plazo; limpia su temporizador al desmontarse).
- `GameView` (fase, config, asiento, jugadores, equipo, ronda `RoundView`, `lastResult`, `opponentGraceEndsAt`, `ended`, `clockOffset`, `lastError`), `initialGameView`, `applyServerEvent(view, event, receivedAt)` (pura; `room-state` reemplaza el estado; `round-result` no duplica Pokémon).
- `createGameStore()` → `GameStoreState { view, connection, receive, setConnection, clearError, reset }`.
- `SocketLike`, `GameClientApi { join, chooseType, submit, leave, dispose }`, `GameClient({ createSocket, store, refreshSession, onSessionLost?, now? })`: envía `join-room` al conectar y reconectar (salvo con la partida ya terminada: la sala ya no existe y se perdería el resumen), entrega cada evento al store, reintenta una sola vez si el handshake responde `UNAUTHORIZED` (y si la sesión no se puede renovar llama a `onSessionLost`), marca la conexión como `replaced` si el servidor la cierra (`io server disconnect`: la partida se abrió en otra pestaña y socket.io no reconecta solo), e ignora los eventos de un socket ya descartado. `ConnectionStatus` es `idle | connecting | connected | disconnected | replaced`; cualquier evento que avance la partida (`choose-types`, `round-started`, `round-result`, `game-ended`) borra el último error.
- Ayudantes de prueba: `pokemon(id, total, overrides)`, `roomState(overrides)`, `roundResult(overrides)`, `gameEnded(overrides)`, `event` (fabrica `ServerEvent`), `SERVER_NOW`; `FakeSocket` (implementa `SocketLike`, con `trigger(event, ...args)` para simular lo que llega del servidor, `serverConnects()`, `serverDrops(reason?)` y el registro de lo emitido).

- [ ] **Step 1: Escribir las pruebas que fallan**

Ayudantes de prueba, `client/test/helpers/events.ts`:

```ts
import type {
  GameEndedPayload,
  PokemonView,
  RoomStateView,
  RoundResultPayload,
  ServerEvent,
  TypeName,
} from "@pokemon-minigames/shared";

/** Hora del servidor que usan por defecto los datos de prueba. */
export const SERVER_NOW = 1_000_000;

export function pokemon(id: number, total = 500, overrides: Partial<PokemonView> = {}): PokemonView {
  const base = Math.floor(total / 6);
  return {
    id,
    names: { es: `Poke${id}`, en: `Mon${id}` },
    spriteUrl: `https://example.com/${id}.png`,
    types: ["fire", "flying"] as TypeName[],
    stats: { hp: total - base * 5, attack: base, defense: base, spAttack: base, spDefense: base, speed: base },
    totalStats: total,
    ...overrides,
  };
}

const player = (seat: 1 | 2, username: string, extra: object = {}) => ({
  seat,
  username,
  connected: true,
  totalStats: 0,
  teamSize: 0,
  ...extra,
});

export function roomState(overrides: Partial<RoomStateView> = {}): RoomStateView {
  return {
    serverNow: SERVER_NOW,
    code: "ABC234",
    phase: "waiting",
    config: { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null },
    mySeat: 1,
    players: [player(1, "ash"), player(2, "misty")],
    myTeam: [],
    roundsPlayed: 0,
    startsAt: null,
    opponentGraceEndsAt: null,
    round: null,
    ...overrides,
  };
}

export function roundResult(overrides: Partial<RoundResultPayload> = {}): RoundResultPayload {
  return {
    round: 1,
    nextRoundAt: SERVER_NOW + 6000,
    type1: "flying",
    type2: "fire",
    results: {
      1: { seat: 1, result: "VALID", text: "Poke1", pokemon: pokemon(1, 500), totalStats: 500, teamSize: 1 },
      2: { seat: 2, result: "NOT_FOUND", text: "zzz", pokemon: null, totalStats: 0, teamSize: 0 },
    },
    ...overrides,
  };
}

export function gameEnded(overrides: Partial<GameEndedPayload> = {}): GameEndedPayload {
  return {
    winnerSeat: 1,
    reason: "completed",
    teams: { 1: [pokemon(1, 500), pokemon(2, 300)], 2: [pokemon(3, 400)] },
    totals: { 1: 800, 2: 400 },
    ...overrides,
  };
}

/** Atajos para armar eventos del servidor completos. */
export const event = {
  roomState: (overrides?: Partial<RoomStateView>): ServerEvent => ({ name: "room-state", payload: roomState(overrides) }),
  playerJoined: (username: string): ServerEvent => ({ name: "player-joined", payload: { username } }),
  gameStarting: (startsAt: number, serverNow = SERVER_NOW): ServerEvent => ({
    name: "game-starting",
    payload: { startsAt, serverNow },
  }),
  chooseTypes: (round: number, deadline: number, serverNow = SERVER_NOW): ServerEvent => ({
    name: "choose-types",
    payload: { round, deadline, serverNow },
  }),
  typeReceived: (round: number): ServerEvent => ({ name: "type-received", payload: { round } }),
  roundStarted: (
    round: number,
    deadline: number,
    options: { serverNow?: number; typesNotice?: "pair_replaced"; type1?: TypeName; type2?: TypeName } = {},
  ): ServerEvent => ({
    name: "round-started",
    payload: {
      serverNow: options.serverNow ?? SERVER_NOW,
      round,
      type1: options.type1 ?? "flying",
      type2: options.type2 ?? "fire",
      deadline,
      ...(options.typesNotice ? { typesNotice: options.typesNotice } : {}),
    },
  }),
  answerReceived: (round: number): ServerEvent => ({ name: "answer-received", payload: { round } }),
  roundResult: (overrides?: Partial<RoundResultPayload>): ServerEvent => ({ name: "round-result", payload: roundResult(overrides) }),
  gameEnded: (overrides?: Partial<GameEndedPayload>): ServerEvent => ({ name: "game-ended", payload: gameEnded(overrides) }),
  opponentDisconnected: (graceEndsAt: number, serverNow = SERVER_NOW): ServerEvent => ({
    name: "opponent-disconnected",
    payload: { graceEndsAt, serverNow },
  }),
  opponentReconnected: (): ServerEvent => ({ name: "opponent-reconnected", payload: undefined }),
  error: (code: import("@pokemon-minigames/shared").ErrorCode, message = "mensaje"): ServerEvent => ({
    name: "error",
    payload: { code, message },
  }),
};
```

`client/test/helpers/fake-socket.ts`:

```ts
import type { SocketLike } from "../../src/game/game-client";

/** Socket de mentira: graba lo que se emite y deja simular lo que envía el servidor. */
export class FakeSocket implements SocketLike {
  connected = false;
  emitted: { event: string; args: unknown[] }[] = [];
  connectCalls = 0;
  disconnectCalls = 0;
  private handlers = new Map<string, Array<(...args: any[]) => void>>();

  on(event: string, handler: (...args: any[]) => void): this {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }

  emit(event: string, ...args: unknown[]): this {
    this.emitted.push({ event, args });
    return this;
  }

  connect(): this {
    this.connectCalls++;
    return this;
  }

  disconnect(): this {
    this.disconnectCalls++;
    this.connected = false;
    return this;
  }

  /** Lo que se ha emitido con ese nombre, solo las cargas. */
  sent(event: string): unknown[] {
    return this.emitted.filter((e) => e.event === event).map((e) => e.args[0]);
  }

  /** Simula un evento que llega del servidor (o del propio socket: connect, disconnect…). */
  trigger(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }

  /** Simula que la conexión se establece. */
  serverConnects(): void {
    this.connected = true;
    this.trigger("connect");
  }

  /** Simula que se cae la conexión; `reason` es el de socket.io ("io server disconnect" si lo cierra el servidor). */
  serverDrops(reason = "transport close"): void {
    this.connected = false;
    this.trigger("disconnect", reason);
  }
}
```

`client/test/game/clock.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clockOffset, remainingMs, secondsLeft, useCountdown } from "../../src/game/clock";

describe("desfase del reloj", () => {
  it("es la hora del servidor menos la del navegador", () => {
    expect(clockOffset(10_000, 4_000)).toBe(6_000);
    expect(clockOffset(4_000, 10_000)).toBe(-6_000);
    expect(clockOffset(5_000, 5_000)).toBe(0);
  });

  it("corrige un navegador adelantado o atrasado al calcular lo que falta", () => {
    // El servidor marca el plazo a las 20 000 (hora del servidor).
    const deadline = 20_000;
    // Navegador atrasado 6 s: cuando el servidor está en 10 000, el navegador marca 4 000.
    const slow = clockOffset(10_000, 4_000);
    expect(remainingMs(deadline, slow, 4_000)).toBe(10_000);
    // Navegador adelantado 3 s: cuando el servidor está en 10 000, el navegador marca 13 000.
    const fast = clockOffset(10_000, 13_000);
    expect(remainingMs(deadline, fast, 13_000)).toBe(10_000);
  });
});

describe("remainingMs", () => {
  it("nunca baja de cero y sin plazo es cero", () => {
    expect(remainingMs(1_000, 0, 5_000)).toBe(0);
    expect(remainingMs(null, 0, 5_000)).toBe(0);
    expect(remainingMs(6_000, 0, 5_000)).toBe(1_000);
  });
});

describe("secondsLeft", () => {
  it("redondea hacia arriba para no mostrar 0 mientras queda tiempo", () => {
    expect(secondsLeft(14_001)).toBe(15);
    expect(secondsLeft(15_000)).toBe(15);
    expect(secondsLeft(200)).toBe(1);
    expect(secondsLeft(0)).toBe(0);
  });
});

describe("useCountdown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("empieza con lo que falta y baja con el reloj", () => {
    let now = 0;
    const { result } = renderHook(() => useCountdown(15_000, 0, { now: () => now }));
    expect(result.current).toBe(15_000);

    now = 4_000;
    act(() => void vi.advanceTimersByTime(250));
    expect(result.current).toBe(11_000);
  });

  it("aplica el desfase del reloj", () => {
    const now = 4_000; // el navegador marca 4 000, el servidor 10 000
    const { result } = renderHook(() => useCountdown(20_000, 6_000, { now: () => now }));
    expect(result.current).toBe(10_000);
  });

  it("se detiene en cero", () => {
    let now = 0;
    const { result } = renderHook(() => useCountdown(1_000, 0, { now: () => now }));
    now = 5_000;
    act(() => void vi.advanceTimersByTime(250));
    expect(result.current).toBe(0);
  });

  it("sin plazo vale cero y no programa temporizadores", () => {
    const { result } = renderHook(() => useCountdown(null, 0));
    expect(result.current).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("al cambiar el plazo recalcula de inmediato", () => {
    const now = 0;
    const { result, rerender } = renderHook(({ deadline }) => useCountdown(deadline, 0, { now: () => now }), {
      initialProps: { deadline: 5_000 as number | null },
    });
    expect(result.current).toBe(5_000);
    rerender({ deadline: 15_000 });
    expect(result.current).toBe(15_000);
  });

  it("al desmontarse limpia su temporizador", () => {
    const { unmount } = renderHook(() => useCountdown(15_000, 0, { now: () => 0 }));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
```

`client/test/game/apply-event.test.ts`:

```ts
import type { ServerEvent } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import { type GameView, applyServerEvent, initialGameView } from "../../src/game/apply-event";
import { SERVER_NOW, event, pokemon } from "../helpers/events";

/** Aplica los eventos en orden, cada uno "recibido" en el navegador a la hora indicada. */
function play(events: [ServerEvent, number?][], start: GameView = initialGameView): GameView {
  return events.reduce((view, [e, at]) => applyServerEvent(view, e, at ?? SERVER_NOW), start);
}

describe("room-state", () => {
  it("reemplaza el estado completo y calcula el desfase del reloj", () => {
    const view = play([
      [
        event.roomState({
          phase: "round_active",
          mySeat: 2,
          roundsPlayed: 1,
          myTeam: [pokemon(7, 400)],
          round: { number: 2, pair: ["flying", "fire"], deadline: SERVER_NOW + 9000, answered: true, typeChosen: false },
        }),
        SERVER_NOW - 5000,
      ],
    ]);
    expect(view).toMatchObject({
      code: "ABC234",
      phase: "round_active",
      mySeat: 2,
      roundsPlayed: 1,
      clockOffset: 5000,
      round: { number: 2, pair: ["flying", "fire"], answered: true, typeChosen: false },
    });
    expect(view.myTeam.map((p) => p.id)).toEqual([7]);
    expect(view.players).toHaveLength(2);
  });

  it("vuelve a sincronizar tras una reconexión: lo que el servidor dice pisa lo que había", () => {
    const before = play([[event.roomState({ phase: "round_active", round: { number: 1, pair: ["flying", "fire"], deadline: 1, answered: false, typeChosen: false } })], [event.answerReceived(1)]]);
    expect(before.round?.answered).toBe(true);
    const after = applyServerEvent(before, event.roomState({ phase: "round_active", round: { number: 1, pair: ["flying", "fire"], deadline: 1, answered: false, typeChosen: false } }), SERVER_NOW);
    expect(after.round?.answered).toBe(false);
  });

  it("borra el error anterior y el resumen final", () => {
    const view = play([[event.error("ROOM_FULL")], [event.roomState()]], { ...initialGameView, ended: null });
    expect(view.lastError).toBeNull();
    expect(view.ended).toBeNull();
  });

  it("conserva el último resultado solo si corresponde a la ronda ya jugada (reconexión en la pausa)", () => {
    const withResult = play([[event.roomState({ mySeat: 1 })], [event.roundResult({ round: 2 })]]);
    const same = applyServerEvent(withResult, event.roomState({ phase: "round_result", roundsPlayed: 2 }), SERVER_NOW);
    expect(same.lastResult?.round).toBe(2);
    const other = applyServerEvent(withResult, event.roomState({ phase: "round_active", roundsPlayed: 3 }), SERVER_NOW);
    expect(other.lastResult).toBeNull();
  });
});

describe("eventos de la sala de espera y del inicio", () => {
  it("player-joined agrega al rival si aún no estaba, y le cambia el nombre si ya estaba", () => {
    const alone = play([[event.roomState({ players: [{ seat: 1, username: "ash", connected: true, totalStats: 0, teamSize: 0 }] })]]);
    const joined = applyServerEvent(alone, event.playerJoined("misty"), SERVER_NOW);
    expect(joined.players.map((p) => [p.seat, p.username])).toEqual([[1, "ash"], [2, "misty"]]);

    const renamed = applyServerEvent(joined, event.playerJoined("gary"), SERVER_NOW);
    expect(renamed.players.map((p) => p.username)).toEqual(["ash", "gary"]);
  });

  it("game-starting pasa a la cuenta atrás y mide el desfase", () => {
    const view = play([[event.roomState()], [event.gameStarting(SERVER_NOW + 5000, SERVER_NOW), SERVER_NOW + 2000]]);
    expect(view).toMatchObject({ phase: "starting", startsAt: SERVER_NOW + 5000, clockOffset: -2000 });
  });
});

describe("elección de tipos y rondas", () => {
  it("choose-types abre una ronda sin par y type-received marca que ya elegí", () => {
    const view = play([[event.roomState({ phase: "starting" })], [event.chooseTypes(1, SERVER_NOW + 15_000)]]);
    expect(view).toMatchObject({
      phase: "choosing_types",
      startsAt: null,
      round: { number: 1, pair: null, deadline: SERVER_NOW + 15_000, answered: false, typeChosen: false },
    });
    expect(applyServerEvent(view, event.typeReceived(1), SERVER_NOW).round?.typeChosen).toBe(true);
  });

  it("type-received y answer-received sin ronda no hacen nada", () => {
    expect(applyServerEvent(initialGameView, event.typeReceived(1), SERVER_NOW)).toBe(initialGameView);
    expect(applyServerEvent(initialGameView, event.answerReceived(1), SERVER_NOW)).toBe(initialGameView);
  });

  it("round-started fija el par y el plazo, limpia el resultado anterior y mide el desfase", () => {
    const afterResult = play([[event.roomState({ mySeat: 1 })], [event.roundResult()]]);
    const view = applyServerEvent(afterResult, event.roundStarted(2, SERVER_NOW + 21_000, { serverNow: SERVER_NOW + 6000 }), SERVER_NOW + 6500);
    expect(view).toMatchObject({
      phase: "round_active",
      lastResult: null,
      clockOffset: -500,
      round: { number: 2, pair: ["flying", "fire"], deadline: SERVER_NOW + 21_000, answered: false, typeChosen: false },
    });
  });

  it("round-started conserva que ya elegí el tipo de esa misma ronda y trae el aviso de par reemplazado", () => {
    const view = play([
      [event.roomState()],
      [event.chooseTypes(1, SERVER_NOW + 15_000)],
      [event.typeReceived(1)],
      [event.roundStarted(1, SERVER_NOW + 30_000, { typesNotice: "pair_replaced" })],
    ]);
    expect(view.round).toMatchObject({ number: 1, typeChosen: true, typesNotice: "pair_replaced" });
  });

  it("round-started sin aviso no deja un aviso de una ronda anterior", () => {
    const view = play([
      [event.roomState()],
      [event.roundStarted(1, SERVER_NOW + 15_000, { typesNotice: "pair_replaced" })],
      [event.roundStarted(2, SERVER_NOW + 30_000)],
    ]);
    expect(view.round).not.toHaveProperty("typesNotice");
  });

  it("answer-received marca que ya respondí", () => {
    const view = play([[event.roomState()], [event.roundStarted(1, SERVER_NOW + 15_000)], [event.answerReceived(1)]]);
    expect(view.round?.answered).toBe(true);
  });
});

describe("round-result", () => {
  it("guarda el resultado, actualiza los totales de los dos y suma mi Pokémon al equipo", () => {
    const view = play([[event.roomState({ mySeat: 1 })], [event.roundResult()]]);
    expect(view.phase).toBe("round_result");
    expect(view.roundsPlayed).toBe(1);
    expect(view.lastResult?.round).toBe(1);
    expect(view.players.map((p) => [p.seat, p.totalStats, p.teamSize])).toEqual([[1, 500, 1], [2, 0, 0]]);
    expect(view.myTeam.map((p) => p.id)).toEqual([1]);
  });

  it("desde el asiento 2, el Pokémon que entra al equipo es el del asiento 2", () => {
    const result = event.roundResult({
      results: {
        1: { seat: 1, result: "VALID", text: "a", pokemon: pokemon(1, 500), totalStats: 500, teamSize: 1 },
        2: { seat: 2, result: "VALID", text: "b", pokemon: pokemon(2, 300), totalStats: 300, teamSize: 1 },
      },
    });
    const view = play([[event.roomState({ mySeat: 2 })], [result]]);
    expect(view.myTeam.map((p) => p.id)).toEqual([2]);
  });

  it("un resultado repetido (p. ej. tras reconectar) no duplica el Pokémon en el equipo", () => {
    const view = play([[event.roomState({ mySeat: 1 })], [event.roundResult()], [event.roundResult()]]);
    expect(view.myTeam).toHaveLength(1);
  });

  it("no añade nada al equipo cuando no ganaste ningún Pokémon", () => {
    const result = event.roundResult({
      results: {
        1: { seat: 1, result: "NO_ANSWER", text: null, pokemon: null, totalStats: 0, teamSize: 0 },
        2: { seat: 2, result: "VALID", text: "b", pokemon: pokemon(2, 300), totalStats: 300, teamSize: 1 },
      },
    });
    const view = play([[event.roomState({ mySeat: 1 })], [result]]);
    expect(view.myTeam).toEqual([]);
  });
});

describe("fin de la partida y desconexiones", () => {
  it("game-ended pasa a finished, guarda el resumen y apaga el aviso de desconexión", () => {
    const view = play([[event.roomState({ opponentGraceEndsAt: SERVER_NOW + 30_000 })], [event.gameEnded()]]);
    expect(view.phase).toBe("finished");
    expect(view.ended).toMatchObject({ winnerSeat: 1, reason: "completed" });
    expect(view.opponentGraceEndsAt).toBeNull();
  });

  it("opponent-disconnected marca al rival como desconectado y fija el plazo; reconnected lo deshace", () => {
    const away = play([[event.roomState({ mySeat: 1 })], [event.opponentDisconnected(SERVER_NOW + 30_000, SERVER_NOW), SERVER_NOW + 1000]]);
    expect(away.opponentGraceEndsAt).toBe(SERVER_NOW + 30_000);
    expect(away.clockOffset).toBe(-1000);
    expect(away.players.find((p) => p.seat === 2)?.connected).toBe(false);
    expect(away.players.find((p) => p.seat === 1)?.connected).toBe(true);

    const back = applyServerEvent(away, event.opponentReconnected(), SERVER_NOW);
    expect(back.opponentGraceEndsAt).toBeNull();
    expect(back.players.find((p) => p.seat === 2)?.connected).toBe(true);
  });

  it("error guarda el último error del servidor", () => {
    const view = applyServerEvent(initialGameView, event.error("WRONG_PHASE", "x"), SERVER_NOW);
    expect(view.lastError).toEqual({ code: "WRONG_PHASE", message: "x" });
  });
});

describe("errores recuperables", () => {
  it("un error del servidor se borra en cuanto la partida avanza, para no dejar un aviso viejo a la vista", () => {
    const withError = applyServerEvent(initialGameView, event.error("WRONG_PHASE", "x"), SERVER_NOW);
    expect(withError.lastError).not.toBeNull();
    const next = {
      "choose-types": event.chooseTypes(1, SERVER_NOW + 15_000),
      "round-started": event.roundStarted(1, SERVER_NOW + 15_000),
      "round-result": event.roundResult(),
      "game-ended": event.gameEnded(),
    };
    for (const [name, e] of Object.entries(next)) {
      expect(applyServerEvent(withError, e, SERVER_NOW).lastError, name).toBeNull();
    }
  });

  it("los eventos que no marcan un avance (confirmaciones, avisos del rival) no lo borran", () => {
    const withError = applyServerEvent(initialGameView, event.error("RATE_LIMITED", "x"), SERVER_NOW);
    expect(applyServerEvent(withError, event.answerReceived(1), SERVER_NOW).lastError).not.toBeNull();
    expect(applyServerEvent(withError, event.opponentReconnected(), SERVER_NOW).lastError).not.toBeNull();
  });
});

describe("pureza", () => {
  it("no modifica el estado que recibe", () => {
    const before = play([[event.roomState({ mySeat: 1, myTeam: [pokemon(9)] })], [event.roundStarted(1, SERVER_NOW + 15_000)]]);
    const frozen = structuredClone(before);
    for (const e of [event.answerReceived(1), event.roundResult(), event.gameEnded(), event.opponentDisconnected(1), event.error("RATE_LIMITED")]) {
      applyServerEvent(before, e, SERVER_NOW);
    }
    expect(before).toEqual(frozen);
  });

  it("room-state reconstruye desde cero aunque el estado anterior esté a medias", () => {
    const view = applyServerEvent(initialGameView, event.roomState({ phase: "finished" }), SERVER_NOW);
    expect(view.phase).toBe("finished");
    expect(view.code).toBe("ABC234");
  });
});
```

`client/test/game/store.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { initialGameView } from "../../src/game/apply-event";
import { createGameStore } from "../../src/game/store";
import { SERVER_NOW, event } from "../helpers/events";

describe("createGameStore", () => {
  it("empieza vacío y sin conexión", () => {
    const state = createGameStore().getState();
    expect(state.view).toEqual(initialGameView);
    expect(state.connection).toBe("idle");
  });

  it("receive aplica el evento al estado", () => {
    const store = createGameStore();
    store.getState().receive(event.roomState({ phase: "waiting" }), SERVER_NOW);
    expect(store.getState().view.phase).toBe("waiting");
  });

  it("notifica a quien se suscribe cuando cambia el estado", () => {
    const store = createGameStore();
    const seen: Array<string | null> = [];
    store.subscribe((state) => seen.push(state.view.phase));
    store.getState().receive(event.roomState({ phase: "waiting" }), SERVER_NOW);
    store.getState().receive(event.gameStarting(SERVER_NOW + 5000), SERVER_NOW);
    expect(seen).toEqual(["waiting", "starting"]);
  });

  it("setConnection cambia solo la conexión", () => {
    const store = createGameStore();
    store.getState().receive(event.roomState(), SERVER_NOW);
    store.getState().setConnection("connected");
    expect(store.getState().connection).toBe("connected");
    expect(store.getState().view.code).toBe("ABC234");
  });

  it("clearError borra solo el último error", () => {
    const store = createGameStore();
    store.getState().receive(event.roomState(), SERVER_NOW);
    store.getState().receive(event.error("RATE_LIMITED"), SERVER_NOW);
    expect(store.getState().view.lastError?.code).toBe("RATE_LIMITED");
    store.getState().clearError();
    expect(store.getState().view.lastError).toBeNull();
    expect(store.getState().view.code).toBe("ABC234");
  });

  it("reset vuelve al estado inicial", () => {
    const store = createGameStore();
    store.getState().receive(event.roomState(), SERVER_NOW);
    store.getState().setConnection("connected");
    store.getState().reset();
    expect(store.getState().view).toEqual(initialGameView);
    expect(store.getState().connection).toBe("idle");
  });
});
```

`client/test/game/game-client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { GameClient } from "../../src/game/game-client";
import { createGameStore } from "../../src/game/store";
import { SERVER_NOW, event } from "../helpers/events";
import { FakeSocket } from "../helpers/fake-socket";

function setup(options: { refreshSession?: () => Promise<unknown> } = {}) {
  const onSessionLost = vi.fn();
  const sockets: FakeSocket[] = [];
  const store = createGameStore();
  const refreshSession = vi.fn(options.refreshSession ?? (async () => ({ accessToken: "nuevo" })));
  const client = new GameClient({
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    store,
    refreshSession,
    onSessionLost,
    now: () => SERVER_NOW + 1000,
  });
  return { client, store, sockets, refreshSession, onSessionLost, socket: () => sockets[0]! };
}

describe("GameClient.join", () => {
  it("crea el socket, lo conecta y, al conectar, entra a la sala", () => {
    const { client, store, socket } = setup();
    client.join("ABC234");
    expect(store.getState().connection).toBe("connecting");
    expect(socket().connectCalls).toBe(1);
    expect(socket().sent("join-room")).toEqual([]); // todavía no hay conexión

    socket().serverConnects();
    expect(store.getState().connection).toBe("connected");
    expect(socket().sent("join-room")).toEqual([{ code: "ABC234" }]);
  });

  it("al reconectar vuelve a entrar a la sala sin que nadie lo pida", () => {
    const { client, store, socket } = setup();
    client.join("ABC234");
    socket().serverConnects();
    socket().serverDrops();
    expect(store.getState().connection).toBe("disconnected");

    socket().serverConnects();
    expect(socket().sent("join-room")).toEqual([{ code: "ABC234" }, { code: "ABC234" }]);
    expect(store.getState().connection).toBe("connected");
  });

  it("si el socket ya está conectado entra a la otra sala de inmediato y reinicia el estado", () => {
    const { client, store, sockets, socket } = setup();
    client.join("ABC234");
    socket().serverConnects();
    socket().trigger("room-state", event.roomState().payload);
    expect(store.getState().view.code).toBe("ABC234");

    client.join("XYZ789");
    expect(sockets).toHaveLength(1); // reutiliza el mismo socket
    expect(socket().sent("join-room").at(-1)).toEqual({ code: "XYZ789" });
    expect(store.getState().view.code).toBeNull();
  });
});

describe("eventos del servidor", () => {
  it("cada evento llega al almacén con la hora de recepción del navegador", () => {
    const { client, store, socket } = setup();
    client.join("ABC234");
    socket().serverConnects();
    // El navegador "recibe" a SERVER_NOW + 1000; el servidor dice que son SERVER_NOW: desfase -1000.
    socket().trigger("room-state", event.roomState({ phase: "waiting" }).payload);
    expect(store.getState().view).toMatchObject({ phase: "waiting", code: "ABC234", clockOffset: -1000 });
  });

  it("entrega los doce eventos del servidor", () => {
    const { client, store, socket } = setup();
    client.join("ABC234");
    const received: string[] = [];
    const original = store.getState().receive;
    store.setState({ receive: (e, at) => { received.push(e.name); original(e, at); } });
    const all = [
      event.roomState(), event.playerJoined("misty"), event.gameStarting(SERVER_NOW + 5000), event.chooseTypes(1, SERVER_NOW + 15_000),
      event.typeReceived(1), event.roundStarted(1, SERVER_NOW + 15_000), event.answerReceived(1), event.roundResult(),
      event.gameEnded(), event.opponentDisconnected(SERVER_NOW + 30_000), event.opponentReconnected(), event.error("RATE_LIMITED"),
    ];
    for (const e of all) socket().trigger(e.name, e.payload);
    expect(received).toEqual(all.map((e) => e.name));
  });

  it("un socket descartado con dispose ya no actualiza el estado", () => {
    const { client, store, socket } = setup();
    client.join("ABC234");
    const old = socket();
    client.dispose();
    old.trigger("room-state", event.roomState().payload);
    old.serverDrops();
    expect(store.getState().view.code).toBeNull();
    expect(store.getState().connection).toBe("idle");
  });
});

describe("acciones del jugador", () => {
  it("chooseType, submit y leave envían sus eventos", () => {
    const { client, socket } = setup();
    client.join("ABC234");
    socket().serverConnects();
    client.chooseType("fire");
    client.submit("Alfa");
    client.leave();
    expect(socket().sent("choose-type")).toEqual([{ type: "fire" }]);
    expect(socket().sent("submit-pokemon")).toEqual([{ text: "Alfa" }]);
    expect(socket().emitted.some((e) => e.event === "leave-room")).toBe(true);
  });

  it("antes de entrar a una sala las acciones no hacen nada ni fallan", () => {
    const { client, sockets } = setup();
    expect(() => {
      client.chooseType("fire");
      client.submit("Alfa");
      client.leave();
    }).not.toThrow();
    expect(sockets).toHaveLength(0);
  });

  it("dispose desconecta el socket y deja el estado limpio", () => {
    const { client, store, socket } = setup();
    client.join("ABC234");
    socket().serverConnects();
    socket().trigger("room-state", event.roomState().payload);
    client.dispose();
    expect(socket().disconnectCalls).toBe(1);
    expect(store.getState().view.phase).toBeNull();
    // Y una acción posterior ya no sale a ningún socket.
    client.submit("Alfa");
    expect(socket().sent("submit-pokemon")).toEqual([]);
  });
});

describe("conexión cerrada por el servidor y partida terminada", () => {
  it("si el servidor cierra la conexión (la partida se abrió en otra pestaña) lo marca como reemplazada", () => {
    const { client, store, socket } = setup();
    client.join("ABC234");
    socket().serverConnects();
    socket().serverDrops("io server disconnect");
    expect(store.getState().connection).toBe("replaced");
  });

  it("una caída normal sigue siendo una desconexión que se reintenta sola", () => {
    const { client, store, socket } = setup();
    client.join("ABC234");
    socket().serverConnects();
    socket().serverDrops("transport close");
    expect(store.getState().connection).toBe("disconnected");
  });

  it("jugar aquí otra vez vuelve a conectar y a entrar a la sala", () => {
    const { client, store, socket } = setup();
    client.join("ABC234");
    socket().serverConnects();
    socket().serverDrops("io server disconnect");
    client.join("ABC234");
    expect(store.getState().connection).toBe("connecting");
    expect(socket().connectCalls).toBe(2);
    socket().serverConnects();
    expect(socket().sent("join-room")).toEqual([{ code: "ABC234" }, { code: "ABC234" }]);
  });

  it("una vez terminada la partida, una reconexión no vuelve a entrar a la sala (así no se pierde el resumen)", () => {
    const { client, store, socket } = setup();
    client.join("ABC234");
    socket().serverConnects();
    socket().trigger("room-state", event.roomState({ phase: "round_result" }).payload);
    socket().trigger("game-ended", event.gameEnded().payload);
    expect(store.getState().view.phase).toBe("finished");

    socket().serverDrops();
    socket().serverConnects();
    expect(socket().sent("join-room")).toEqual([{ code: "ABC234" }]);
    expect(store.getState().view.phase).toBe("finished");
  });
});

describe("token del socket caducado", () => {
  const unauthorized = () => Object.assign(new Error("UNAUTHORIZED"));

  it("renueva la sesión y reintenta conectar una sola vez", async () => {
    const { client, socket, refreshSession } = setup();
    client.join("ABC234");
    expect(socket().connectCalls).toBe(1);
    socket().trigger("connect_error", unauthorized());
    await vi.waitFor(() => expect(socket().connectCalls).toBe(2));
    expect(refreshSession).toHaveBeenCalledTimes(1);

    // Si vuelve a fallar sin haber conectado, no se insiste en bucle.
    socket().trigger("connect_error", unauthorized());
    await Promise.resolve();
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(socket().connectCalls).toBe(2);
  });

  it("tras conectar con éxito, un nuevo rechazo puede volver a intentar la renovación", async () => {
    const { client, socket, refreshSession } = setup();
    client.join("ABC234");
    socket().trigger("connect_error", unauthorized());
    await vi.waitFor(() => expect(socket().connectCalls).toBe(2));
    socket().serverConnects();
    socket().serverDrops();
    socket().trigger("connect_error", unauthorized());
    await vi.waitFor(() => expect(refreshSession).toHaveBeenCalledTimes(2));
  });

  it("si no se puede renovar la sesión no se reconecta", async () => {
    const { client, socket, refreshSession } = setup({ refreshSession: async () => null });
    client.join("ABC234");
    socket().trigger("connect_error", unauthorized());
    await vi.waitFor(() => expect(refreshSession).toHaveBeenCalled());
    await Promise.resolve();
    expect(socket().connectCalls).toBe(1);
  });

  it("si no se puede renovar la sesión, avisa de que se perdió para volver a /login", async () => {
    const { client, socket, onSessionLost } = setup({ refreshSession: async () => null });
    client.join("ABC234");
    socket().trigger("connect_error", unauthorized());
    await vi.waitFor(() => expect(onSessionLost).toHaveBeenCalledTimes(1));
  });

  it("si la renovación sí funciona, no avisa de ninguna pérdida", async () => {
    const { client, socket, onSessionLost } = setup();
    client.join("ABC234");
    socket().trigger("connect_error", unauthorized());
    await vi.waitFor(() => expect(socket().connectCalls).toBe(2));
    expect(onSessionLost).not.toHaveBeenCalled();
  });

  it("otros errores de conexión solo marcan la conexión como caída", () => {
    const { client, store, socket, refreshSession } = setup();
    client.join("ABC234");
    socket().trigger("connect_error", new Error("xhr poll error"));
    expect(store.getState().connection).toBe("disconnected");
    expect(refreshSession).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w client -- test/game
```

Expected: FAIL — no existen los módulos de `src/game`.

- [ ] **Step 3: Implementar**

`client/src/game/clock.ts`:

```ts
import { useEffect, useRef, useState } from "react";

/**
 * Diferencia entre el reloj del servidor y el del navegador, medida al recibir un evento que trae
 * `serverNow`. Se ignora la latencia de la red (unas decenas de milisegundos): lo que importa es
 * corregir desfases de segundos entre los dos relojes.
 */
export function clockOffset(serverNow: number, receivedAt: number): number {
  return serverNow - receivedAt;
}

/** Milisegundos que faltan para un plazo dado en hora del servidor; nunca baja de cero. */
export function remainingMs(deadline: number | null, offset: number, now: number): number {
  if (deadline === null) return 0;
  return Math.max(0, deadline - (now + offset));
}

/** Segundos enteros que se muestran en un cronómetro (se redondea hacia arriba: 0,2 s se ve como 1). */
export function secondsLeft(ms: number): number {
  return Math.ceil(ms / 1000);
}

export interface CountdownOptions {
  /** Hora actual del navegador; se reemplaza en las pruebas. */
  now?: () => number;
  intervalMs?: number;
}

/**
 * Milisegundos que faltan para `deadline` (hora del servidor), actualizados unas 4 veces por
 * segundo. Solo sirve para mostrar el cronómetro: el servidor es quien decide cuándo termina todo.
 */
export function useCountdown(deadline: number | null, offset: number, options: CountdownOptions = {}): number {
  const intervalMs = options.intervalMs ?? 250;
  const nowRef = useRef(options.now ?? Date.now);
  nowRef.current = options.now ?? Date.now;
  const [remaining, setRemaining] = useState(() => remainingMs(deadline, offset, nowRef.current()));

  useEffect(() => {
    const tick = () => setRemaining(remainingMs(deadline, offset, nowRef.current()));
    tick();
    if (deadline === null) return;
    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [deadline, offset, intervalMs]);

  return remaining;
}
```

`client/src/game/apply-event.ts`:

```ts
import type {
  ErrorCode,
  GameEndedPayload,
  GamePhase,
  PokemonView,
  RoomConfig,
  RoomPlayerView,
  RoundResultPayload,
  Seat,
  ServerEvent,
  TypeName,
} from "@pokemon-minigames/shared";
import { clockOffset } from "./clock";

export interface RoundView {
  number: number;
  pair: [TypeName, TypeName] | null;
  deadline: number | null;
  /** Ya envié mi respuesta en esta ronda. */
  answered: boolean;
  /** Ya elegí mi tipo en esta ronda. */
  typeChosen: boolean;
  /** El par elegido no era válido y el servidor sorteó otro. */
  typesNotice?: "pair_replaced";
}

/** Todo lo que la interfaz sabe de la partida; se reconstruye a partir de los eventos del servidor. */
export interface GameView {
  code: string | null;
  /** `null` mientras no ha llegado el primer `room-state`. */
  phase: GamePhase | null;
  config: RoomConfig | null;
  mySeat: Seat | null;
  players: RoomPlayerView[];
  myTeam: PokemonView[];
  roundsPlayed: number;
  startsAt: number | null;
  round: RoundView | null;
  lastResult: RoundResultPayload | null;
  opponentGraceEndsAt: number | null;
  ended: GameEndedPayload | null;
  /** Hora del servidor menos hora del navegador. */
  clockOffset: number;
  lastError: { code: ErrorCode; message: string } | null;
}

export const initialGameView: GameView = {
  code: null,
  phase: null,
  config: null,
  mySeat: null,
  players: [],
  myTeam: [],
  roundsPlayed: 0,
  startsAt: null,
  round: null,
  lastResult: null,
  opponentGraceEndsAt: null,
  ended: null,
  clockOffset: 0,
  lastError: null,
};

function setConnected(players: RoomPlayerView[], seat: Seat | null, connected: boolean): RoomPlayerView[] {
  return players.map((p) => (p.seat !== seat ? { ...p, connected } : p));
}

/**
 * Aplica un evento del servidor al estado. Es una función pura: no toca la red ni el reloj.
 * `receivedAt` (hora del navegador al recibirlo) sirve para calcular el desfase del reloj.
 * `room-state` reemplaza el estado completo: es la vía de recuperación tras recargar o reconectar.
 */
export function applyServerEvent(view: GameView, event: ServerEvent, receivedAt: number): GameView {
  switch (event.name) {
    case "room-state": {
      const state = event.payload;
      return {
        ...view,
        code: state.code,
        phase: state.phase,
        config: state.config,
        mySeat: state.mySeat,
        players: state.players,
        myTeam: state.myTeam,
        roundsPlayed: state.roundsPlayed,
        startsAt: state.startsAt,
        round: state.round && {
          number: state.round.number,
          pair: state.round.pair,
          deadline: state.round.deadline,
          answered: state.round.answered,
          typeChosen: state.round.typeChosen,
        },
        // Si se reconecta durante la pausa del resultado, el último resultado todavía sirve.
        lastResult: view.lastResult?.round === state.roundsPlayed ? view.lastResult : null,
        opponentGraceEndsAt: state.opponentGraceEndsAt,
        ended: null,
        clockOffset: clockOffset(state.serverNow, receivedAt),
        lastError: null,
      };
    }

    case "player-joined": {
      const exists = view.players.some((p) => p.seat !== view.mySeat);
      return {
        ...view,
        players: exists
          ? view.players.map((p) => (p.seat !== view.mySeat ? { ...p, username: event.payload.username } : p))
          : [
              ...view.players,
              { seat: view.mySeat === 1 ? 2 : 1, username: event.payload.username, connected: false, totalStats: 0, teamSize: 0 },
            ],
      };
    }

    case "game-starting":
      return {
        ...view,
        phase: "starting",
        startsAt: event.payload.startsAt,
        clockOffset: clockOffset(event.payload.serverNow, receivedAt),
      };

    case "choose-types":
      return {
        ...view,
        phase: "choosing_types",
        startsAt: null,
        round: { number: event.payload.round, pair: null, deadline: event.payload.deadline, answered: false, typeChosen: false },
        clockOffset: clockOffset(event.payload.serverNow, receivedAt),
        lastError: null,
      };

    case "type-received":
      return view.round ? { ...view, round: { ...view.round, typeChosen: true } } : view;

    case "round-started": {
      const { round, type1, type2, deadline, typesNotice, serverNow } = event.payload;
      return {
        ...view,
        phase: "round_active",
        startsAt: null,
        round: {
          number: round,
          pair: [type1, type2],
          deadline,
          answered: false,
          typeChosen: view.round?.number === round ? view.round.typeChosen : false,
          ...(typesNotice ? { typesNotice } : {}),
        },
        lastResult: null,
        clockOffset: clockOffset(serverNow, receivedAt),
        lastError: null,
      };
    }

    case "answer-received":
      return view.round ? { ...view, round: { ...view.round, answered: true } } : view;

    case "round-result": {
      const result = event.payload;
      const mine = view.mySeat ? result.results[view.mySeat].pokemon : null;
      return {
        ...view,
        phase: "round_result",
        roundsPlayed: result.round,
        lastResult: result,
        lastError: null,
        players: view.players.map((p) => ({
          ...p,
          totalStats: result.results[p.seat].totalStats,
          teamSize: result.results[p.seat].teamSize,
        })),
        myTeam: mine && !view.myTeam.some((p) => p.id === mine.id) ? [...view.myTeam, mine] : view.myTeam,
      };
    }

    case "game-ended":
      return { ...view, phase: "finished", ended: event.payload, opponentGraceEndsAt: null, lastError: null };

    case "opponent-disconnected":
      return {
        ...view,
        opponentGraceEndsAt: event.payload.graceEndsAt,
        players: setConnected(view.players, view.mySeat, false),
        clockOffset: clockOffset(event.payload.serverNow, receivedAt),
      };

    case "opponent-reconnected":
      return { ...view, opponentGraceEndsAt: null, players: setConnected(view.players, view.mySeat, true) };

    case "error":
      return { ...view, lastError: event.payload };
  }
}
```

`client/src/game/store.ts`:

```ts
import type { ServerEvent } from "@pokemon-minigames/shared";
import { type StoreApi, createStore } from "zustand";
import { type GameView, applyServerEvent, initialGameView } from "./apply-event";

/** `replaced`: el servidor cerró esta conexión porque la partida se abrió en otra pestaña (no se reconecta sola). */
export type ConnectionStatus = "idle" | "connecting" | "connected" | "disconnected" | "replaced";

export interface GameStoreState {
  view: GameView;
  connection: ConnectionStatus;
  /** Aplica un evento del servidor; `receivedAt` es la hora del navegador al recibirlo. */
  receive(event: ServerEvent, receivedAt: number): void;
  setConnection(connection: ConnectionStatus): void;
  clearError(): void;
  /** Vuelve al estado inicial (al entrar a otra sala o al salir). */
  reset(): void;
}

export function createGameStore(): StoreApi<GameStoreState> {
  return createStore<GameStoreState>((set) => ({
    view: initialGameView,
    connection: "idle",
    receive: (event, receivedAt) => set((state) => ({ view: applyServerEvent(state.view, event, receivedAt) })),
    setConnection: (connection) => set({ connection }),
    clearError: () => set((state) => ({ view: { ...state.view, lastError: null } })),
    reset: () => set({ view: initialGameView, connection: "idle" }),
  }));
}
```

`client/src/game/game-client.ts`:

```ts
import type { ServerEvent, ServerEventName, TypeName } from "@pokemon-minigames/shared";
import type { StoreApi } from "zustand";
import type { GameStoreState } from "./store";

/** Lo que el cliente de juego necesita de un socket (el `Socket` de socket.io lo cumple). */
export interface SocketLike {
  connected: boolean;
  on(event: string, handler: (...args: any[]) => void): unknown;
  emit(event: string, ...args: unknown[]): unknown;
  connect(): unknown;
  disconnect(): unknown;
}

/** Acciones del jugador durante una partida. La interfaz solo depende de esto. */
export interface GameClientApi {
  /** Entra (o reconecta) a una sala y empieza a recibir su estado. */
  join(code: string): void;
  chooseType(type: TypeName): void;
  submit(text: string): void;
  /** Sale de la sala: cancela la espera o abandona la partida. */
  leave(): void;
  /** Cierra la conexión y limpia el estado (al salir de la pantalla de la sala). */
  dispose(): void;
}

export interface GameClientDeps {
  createSocket(): SocketLike;
  store: StoreApi<GameStoreState>;
  /** Renueva la sesión; se usa si el servidor rechaza el token del socket por caducado. */
  refreshSession(): Promise<unknown>;
  /** Se llama si la sesión no se pudo renovar: hay que volver a iniciar sesión. */
  onSessionLost?(): void;
  /** Hora actual del navegador; se reemplaza en las pruebas. */
  now?: () => number;
}

// Un `Record` exige listar todos los eventos: si `shared` añade uno, esto deja de compilar.
const SERVER_EVENTS: Record<ServerEventName, true> = {
  "room-state": true,
  "player-joined": true,
  "game-starting": true,
  "choose-types": true,
  "type-received": true,
  "round-started": true,
  "answer-received": true,
  "round-result": true,
  "game-ended": true,
  "opponent-disconnected": true,
  "opponent-reconnected": true,
  error: true,
};
const SERVER_EVENT_NAMES = Object.keys(SERVER_EVENTS) as ServerEventName[];

/**
 * Envuelve el socket: entrega al almacén cada evento del servidor y envía las acciones del
 * jugador. No contiene reglas del juego: el servidor es la autoridad.
 */
export class GameClient implements GameClientApi {
  private socket: SocketLike | null = null;
  private code: string | null = null;
  private retriedAuth = false;

  constructor(private readonly deps: GameClientDeps) {}

  join(code: string): void {
    const { store } = this.deps;
    this.code = code;
    store.getState().reset();
    store.getState().setConnection("connecting");
    const socket = this.ensureSocket();
    if (socket.connected) socket.emit("join-room", { code });
    else socket.connect();
  }

  chooseType(type: TypeName): void {
    this.socket?.emit("choose-type", { type });
  }

  submit(text: string): void {
    this.socket?.emit("submit-pokemon", { text });
  }

  leave(): void {
    this.socket?.emit("leave-room");
  }

  dispose(): void {
    const socket = this.socket;
    this.socket = null;
    this.code = null;
    socket?.disconnect();
    this.deps.store.getState().reset();
  }

  private ensureSocket(): SocketLike {
    if (this.socket) return this.socket;
    const { store } = this.deps;
    const now = this.deps.now ?? Date.now;
    const socket = this.deps.createSocket();
    this.socket = socket;
    // Un socket ya descartado (dispose) no debe seguir tocando el estado.
    const current = (): boolean => this.socket === socket;

    socket.on("connect", () => {
      if (!current()) return;
      this.retriedAuth = false;
      store.getState().setConnection("connected");
      // También al reconectar: el servidor responde con `room-state` y el estado se reemplaza.
      // Con la partida ya terminada no se vuelve a entrar: la sala ya no existe y se perdería el resumen.
      if (this.code && store.getState().view.phase !== "finished") socket.emit("join-room", { code: this.code });
    });
    socket.on("disconnect", (reason: string) => {
      if (!current()) return;
      // Si lo cierra el servidor (otra pestaña tomó la partida) socket.io no reconecta por su cuenta.
      store.getState().setConnection(reason === "io server disconnect" ? "replaced" : "disconnected");
    });
    socket.on("connect_error", (error: Error) => {
      if (!current()) return;
      store.getState().setConnection("disconnected");
      // El access token del handshake pudo caducar: se renueva y se reintenta, una sola vez.
      if (error.message === "UNAUTHORIZED" && !this.retriedAuth) {
        this.retriedAuth = true;
        void this.deps.refreshSession().then((session) => {
          if (!current()) return;
          if (session) socket.connect();
          else this.deps.onSessionLost?.();
        });
      }
    });
    for (const name of SERVER_EVENT_NAMES) {
      socket.on(name, (payload: unknown) => {
        if (current()) store.getState().receive({ name, payload } as ServerEvent, now());
      });
    }
    return socket;
  }
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w client -- test/game
npm run typecheck -w client
```

Expected: PASS (58 pruebas: 10 de `clock`, 23 de `apply-event`, 6 de `store` y 19 de `game-client`) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): reloj con desfase, reductor de eventos, store y GameClient" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Sesión, nombres del catálogo y servicios por contexto

**Files:**
- Create: `client/src/session/session-store.ts`, `client/src/catalog/names-store.ts`, `client/src/services.tsx`, `client/test/helpers/services.tsx`
- Test: `client/test/session/session-store.test.ts`, `client/test/catalog/names-store.test.ts`

**Interfaces:**
- `createSessionStore(endpoints)` → `SessionState { status: "loading" | "authenticated" | "anonymous", user, bootstrap, login, register, logout, expire }`. `bootstrap()` consulta al servidor **una sola vez** aunque se llame varias veces; un fallo de red lo deja anónimo sin lanzar; `logout()` cierra la sesión local aunque el servidor falle.
- `createNamesStore(endpoints)` → `NamesState { status: "idle" | "loading" | "ready" | "error", names, load }` (descarga una sola vez; si falla se puede reintentar).
- `Services { endpoints, session, theme, names, game: { store, client } }`, `ServicesProvider`, `useServices()`, `useSession(selector)`, `useTheme(selector)`, `useNames(selector)`, `useGame(selector)`, `createServices({ baseUrl? })` (arma los servicios reales: el socket usa `auth: (cb) => cb({ token })` para que cada reconexión lleve el token vigente).
- Ayudantes de prueba: `ASH`, `NAMES`, `fakeServices()` (servicios con dobles y `FakeSocket`), `signIn(services)`, `LocationProbe`, `renderWithServices(ui, { services?, route? })`, `renderRoute`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`client/test/session/session-store.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/client";
import { ASH, fakeServices } from "../helpers/services";

function setup() {
  const services = fakeServices();
  return { services, endpoints: services.endpoints, store: services.session };
}

describe("sesión", () => {
  it("empieza cargando, sin usuario", () => {
    const { store } = setup();
    expect(store.getState()).toMatchObject({ status: "loading", user: null });
  });

  describe("bootstrap", () => {
    it("con sesión en el servidor queda autenticado", async () => {
      const { store, endpoints } = setup();
      vi.mocked(endpoints.auth.refresh).mockResolvedValueOnce({ user: ASH, accessToken: "tok" });
      await store.getState().bootstrap();
      expect(store.getState()).toMatchObject({ status: "authenticated", user: ASH });
    });

    it("sin sesión queda como anónimo", async () => {
      const { store } = setup();
      await store.getState().bootstrap();
      expect(store.getState()).toMatchObject({ status: "anonymous", user: null });
    });

    it("si el servidor no responde queda como anónimo, sin lanzar error", async () => {
      const { store, endpoints } = setup();
      vi.mocked(endpoints.auth.refresh).mockRejectedValueOnce(new ApiError(0, "NETWORK"));
      await expect(store.getState().bootstrap()).resolves.toBeUndefined();
      expect(store.getState().status).toBe("anonymous");
    });

    it("solo consulta al servidor una vez aunque se llame varias (React en modo estricto)", async () => {
      const { store, endpoints } = setup();
      await Promise.all([store.getState().bootstrap(), store.getState().bootstrap()]);
      await store.getState().bootstrap();
      expect(endpoints.auth.refresh).toHaveBeenCalledTimes(1);
    });
  });

  describe("login y registro", () => {
    it("login deja al usuario autenticado", async () => {
      const { store, endpoints } = setup();
      await store.getState().login({ email: "ash@example.com", password: "pikachu-123" });
      expect(endpoints.auth.login).toHaveBeenCalledWith({ email: "ash@example.com", password: "pikachu-123" });
      expect(store.getState()).toMatchObject({ status: "authenticated", user: ASH });
    });

    it("un login fallido lanza el error y no cambia el estado", async () => {
      const { store, endpoints } = setup();
      vi.mocked(endpoints.auth.login).mockRejectedValueOnce(new ApiError(401, "INVALID_CREDENTIALS"));
      await expect(store.getState().login({ email: "a@b.co", password: "x" })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
      expect(store.getState().status).toBe("loading");
      expect(store.getState().user).toBeNull();
    });

    it("register deja al usuario autenticado", async () => {
      const { store, endpoints } = setup();
      await store.getState().register({ email: "ash@example.com", username: "ash", password: "pikachu-123" });
      expect(endpoints.auth.register).toHaveBeenCalledTimes(1);
      expect(store.getState().user).toEqual(ASH);
    });
  });

  describe("logout y expiración", () => {
    it("logout termina la sesión", async () => {
      const { store } = setup();
      await store.getState().login({ email: "ash@example.com", password: "x" });
      await store.getState().logout();
      expect(store.getState()).toMatchObject({ status: "anonymous", user: null });
    });

    it("logout termina la sesión aunque el servidor falle", async () => {
      const { store, endpoints } = setup();
      await store.getState().login({ email: "ash@example.com", password: "x" });
      vi.mocked(endpoints.auth.logout).mockRejectedValueOnce(new ApiError(0, "NETWORK"));
      await store.getState().logout().catch(() => {});
      expect(store.getState().status).toBe("anonymous");
    });

    it("expire (sesión perdida) deja al usuario como anónimo", async () => {
      const { store } = setup();
      await store.getState().login({ email: "ash@example.com", password: "x" });
      store.getState().expire();
      expect(store.getState()).toMatchObject({ status: "anonymous", user: null });
    });
  });
});
```

`client/test/catalog/names-store.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/client";
import { NAMES, fakeServices } from "../helpers/services";

describe("lista de nombres para el autocompletado", () => {
  it("empieza vacía", () => {
    const { names } = fakeServices();
    expect(names.getState()).toMatchObject({ status: "idle", names: [] });
  });

  it("load descarga la lista y queda lista", async () => {
    const { names, endpoints } = fakeServices();
    await names.getState().load();
    expect(names.getState()).toMatchObject({ status: "ready", names: NAMES });
    expect(endpoints.catalog.names).toHaveBeenCalledTimes(1);
  });

  it("solo se descarga una vez, aunque se pida varias veces a la vez o después", async () => {
    const { names, endpoints } = fakeServices();
    await Promise.all([names.getState().load(), names.getState().load()]);
    await names.getState().load();
    expect(endpoints.catalog.names).toHaveBeenCalledTimes(1);
  });

  it("si falla queda en error sin lanzar, y se puede reintentar", async () => {
    const { names, endpoints } = fakeServices();
    vi.mocked(endpoints.catalog.names).mockRejectedValueOnce(new ApiError(0, "NETWORK"));
    await expect(names.getState().load()).resolves.toBeUndefined();
    expect(names.getState().status).toBe("error");
    expect(names.getState().names).toEqual([]);

    await names.getState().load();
    expect(names.getState().status).toBe("ready");
    expect(endpoints.catalog.names).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w client -- test/session test/catalog
```

Expected: FAIL — no existen `src/session/session-store.ts` ni `src/catalog/names-store.ts`.

- [ ] **Step 3: Implementar**

`client/src/session/session-store.ts`:

```ts
import { type StoreApi, createStore } from "zustand";
import type { Credentials, Endpoints, Registration } from "../api/endpoints";
import type { AuthUser } from "../api/types";

export type SessionStatus = "loading" | "authenticated" | "anonymous";

export interface SessionState {
  status: SessionStatus;
  user: AuthUser | null;
  /** Al cargar la aplicación: intenta recuperar la sesión con la cookie de refresco. Solo corre una vez. */
  bootstrap(): Promise<void>;
  login(credentials: Credentials): Promise<void>;
  register(registration: Registration): Promise<void>;
  logout(): Promise<void>;
  /** La sesión se perdió (no se pudo renovar): hay que volver a iniciar sesión. */
  expire(): void;
}

export function createSessionStore(endpoints: Endpoints): StoreApi<SessionState> {
  let booting: Promise<void> | null = null;

  return createStore<SessionState>((set) => ({
    status: "loading",
    user: null,

    bootstrap() {
      booting ??= endpoints.auth.refresh().then(
        (session) => set(session ? { status: "authenticated", user: session.user } : { status: "anonymous", user: null }),
        () => set({ status: "anonymous", user: null }),
      );
      return booting;
    },

    async login(credentials) {
      const session = await endpoints.auth.login(credentials);
      set({ status: "authenticated", user: session.user });
    },

    async register(registration) {
      const session = await endpoints.auth.register(registration);
      set({ status: "authenticated", user: session.user });
    },

    async logout() {
      try {
        await endpoints.auth.logout();
      } finally {
        set({ status: "anonymous", user: null });
      }
    },

    expire() {
      set({ status: "anonymous", user: null });
    },
  }));
}
```

`client/src/catalog/names-store.ts`:

```ts
import { type StoreApi, createStore } from "zustand";
import type { Endpoints } from "../api/endpoints";
import type { PokemonName } from "../api/types";

export interface NamesState {
  status: "idle" | "loading" | "ready" | "error";
  names: PokemonName[];
  /** Descarga la lista de nombres para el autocompletado. Solo lo hace una vez (salvo que falle). */
  load(): Promise<void>;
}

export function createNamesStore(endpoints: Endpoints): StoreApi<NamesState> {
  let loading: Promise<void> | null = null;

  return createStore<NamesState>((set, get) => ({
    status: "idle",
    names: [],
    load() {
      if (get().status === "ready") return Promise.resolve();
      loading ??= (async () => {
        set({ status: "loading" });
        try {
          set({ status: "ready", names: await endpoints.catalog.names() });
        } catch {
          // Sin la lista el campo sigue funcionando, solo que sin sugerencias; se puede reintentar.
          set({ status: "error" });
        } finally {
          loading = null;
        }
      })();
      return loading;
    },
  }));
}
```

`client/src/services.tsx`:

```tsx
import { type ReactNode, createContext, useContext } from "react";
import { io } from "socket.io-client";
import { type StoreApi, useStore } from "zustand";
import { ApiClient } from "./api/client";
import { type Endpoints, createEndpoints } from "./api/endpoints";
import { type NamesState, createNamesStore } from "./catalog/names-store";
import { GameClient, type GameClientApi, type SocketLike } from "./game/game-client";
import { type GameStoreState, createGameStore } from "./game/store";
import { type SessionState, createSessionStore } from "./session/session-store";
import { type ThemeState, createThemeStore } from "./theme/theme-store";

/** Todo lo que la interfaz necesita del exterior. En las pruebas se reemplaza por dobles. */
export interface Services {
  endpoints: Endpoints;
  session: StoreApi<SessionState>;
  theme: StoreApi<ThemeState>;
  names: StoreApi<NamesState>;
  game: { store: StoreApi<GameStoreState>; client: GameClientApi };
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error("Falta el ServicesProvider");
  return services;
}

export const useSession = <T,>(selector: (state: SessionState) => T): T => useStore(useServices().session, selector);
export const useTheme = <T,>(selector: (state: ThemeState) => T): T => useStore(useServices().theme, selector);
export const useNames = <T,>(selector: (state: NamesState) => T): T => useStore(useServices().names, selector);
export const useGame = <T,>(selector: (state: GameStoreState) => T): T => useStore(useServices().game.store, selector);

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    // Algunos navegadores lanzan al acceder al almacenamiento (datos bloqueados).
    return null;
  }
}

/** Crea los servicios reales: API, sesión, socket, tema y catálogo. */
export function createServices(options: { baseUrl?: string } = {}): Services {
  const baseUrl = options.baseUrl ?? "";

  const sessionHolder: { store?: StoreApi<SessionState> } = {};
  const api = new ApiClient({ baseUrl, onSessionLost: () => sessionHolder.store?.getState().expire() });
  const endpoints = createEndpoints(api);
  const session = createSessionStore(endpoints);
  sessionHolder.store = session;

  const gameStore = createGameStore();
  const client = new GameClient({
    store: gameStore,
    refreshSession: () => endpoints.auth.refresh(),
    onSessionLost: () => sessionHolder.store?.getState().expire(),
    // `auth` como función: cada (re)conexión usa el access token vigente.
    createSocket: () =>
      io(baseUrl || undefined, { autoConnect: false, auth: (cb) => cb({ token: api.getToken() }) }) as unknown as SocketLike,
  });

  return {
    endpoints,
    session,
    names: createNamesStore(endpoints),
    game: { store: gameStore, client },
    theme: createThemeStore({
      storage: safeStorage(),
      root: document.documentElement,
      media: window.matchMedia("(prefers-color-scheme: dark)"),
    }),
  };
}
```

Ayudante de las pruebas de componentes (servicios falsos y `renderWithServices`), `client/test/helpers/services.tsx`:

```tsx
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { vi } from "vitest";
import type { Endpoints } from "../../src/api/endpoints";
import type { AuthUser, PokemonName } from "../../src/api/types";
import { createNamesStore } from "../../src/catalog/names-store";
import { createGameStore } from "../../src/game/store";
import { ServicesProvider, type Services } from "../../src/services";
import { createSessionStore } from "../../src/session/session-store";
import { createThemeStore } from "../../src/theme/theme-store";

export const ASH: AuthUser = { id: "u1", email: "ash@example.com", username: "ash", createdAt: "2026-01-01T00:00:00.000Z" };

export const NAMES: PokemonName[] = [
  { id: 1, es: "Alfa", en: "Alpha" },
  { id: 2, es: "Alfil", en: "Bishop" },
  { id: 3, es: "Beto", en: "Beta" },
  { id: 4, es: "Épsilon", en: "Epsilon" },
  { id: 5, es: "Zeta", en: "Zeta" },
];

export interface FakeServices extends Services {
  endpoints: Endpoints;
  /** Acciones del juego como espías. */
  client: { join: ReturnType<typeof vi.fn>; chooseType: ReturnType<typeof vi.fn>; submit: ReturnType<typeof vi.fn>; leave: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> };
  themeRoot: HTMLElement;
}

/** Servicios de mentira: los endpoints son espías y el socket no existe. */
export function fakeServices(): FakeServices {
  const endpoints: Endpoints = {
    auth: {
      register: vi.fn(async () => ({ user: ASH, accessToken: "tok" })),
      login: vi.fn(async () => ({ user: ASH, accessToken: "tok" })),
      refresh: vi.fn(async () => null),
      logout: vi.fn(async () => {}),
    },
    rooms: {
      create: vi.fn(async () => ({ code: "ABC234" })),
      join: vi.fn(async () => ({ code: "ABC234" })),
      get: vi.fn(),
      current: vi.fn(async () => null),
    },
    catalog: { names: vi.fn(async () => NAMES) },
  };
  const client = { join: vi.fn(), chooseType: vi.fn(), submit: vi.fn(), leave: vi.fn(), dispose: vi.fn() };
  const themeRoot = document.createElement("html");
  return {
    endpoints,
    client,
    themeRoot,
    session: createSessionStore(endpoints),
    names: createNamesStore(endpoints),
    game: { store: createGameStore(), client },
    theme: createThemeStore({
      storage: null,
      root: themeRoot,
      media: { matches: false, addEventListener: () => {} },
    }),
  };
}

/** Deja la sesión como iniciada, sin pasar por el arranque. */
export function signIn(services: Services, user: AuthUser = ASH): void {
  services.session.setState({ status: "authenticated", user });
}

/** Muestra en pantalla la ruta actual; sirve para comprobar redirecciones. */
export function LocationProbe() {
  const location = useLocation();
  return (
    <p data-testid="location" data-state={JSON.stringify(location.state ?? null)}>
      {location.pathname}
    </p>
  );
}

export function renderWithServices(
  ui: ReactElement,
  options: { services?: FakeServices; route?: string | { pathname: string; state?: unknown } } = {},
) {
  const services = options.services ?? fakeServices();
  const result = render(
    <ServicesProvider services={services}>
      <MemoryRouter initialEntries={[options.route ?? "/"]}>{ui}</MemoryRouter>
    </ServicesProvider>,
  );
  return { services, ...result };
}

/** Como renderWithServices, pero con rutas: `ui` se monta en `path` y hay una sonda de ubicación. */
export function renderRoute(
  path: string,
  ui: ReactElement,
  options: { services?: FakeServices; route: string | { pathname: string; state?: unknown } },
) {
  return renderWithServices(
    <>
      <Routes>
        <Route path={path} element={ui} />
        <Route path="*" element={<p>Otra pantalla</p>} />
      </Routes>
      <LocationProbe />
    </>,
    options,
  );
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w client -- test/session test/catalog
npm run typecheck -w client
```

Expected: PASS (15 pruebas: 11 de `session-store` y 4 de `names-store`) y `tsc` sin errores (incluye `services.tsx` y el ayudante de pruebas).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): almacén de sesión, lista de nombres y servicios por contexto" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Componentes de interfaz

**Files:**
- Create: `client/src/components/Button.tsx`, `TextField.tsx`, `TypeChip.tsx`, `Timer.tsx`, `PokemonCard.tsx`, `Panels.tsx`, `Notice.tsx`, `ThemeSwitcher.tsx`, `Header.tsx`, `Autocomplete.tsx`
- Test: `client/test/components/basics.test.tsx`, `client/test/components/autocomplete.test.tsx`, `client/test/components/header-theme.test.tsx`

**Interfaces:**
- `Button({ variant: "primary" | "secondary" | "ghost" | "header", loading? })` (por defecto `type="button"`; cargando = deshabilitado + `aria-busy`; ninguna variante baja la opacidad al pasar el ratón; el primario subraya; la variante `header` usa `text-header-fg`).
- `TextField({ label, error?, hint? })` (etiqueta asociada; el error es `role="alert"`, marca `aria-invalid` y queda vinculado con `aria-describedby`).
- `TypeChip({ type })`, `PokemonCard({ pokemon, showStats? })`, `TeamPanel({ team, total })`, `OpponentPanel({ name, total, teamSize, connected })` (**nunca** muestra nombres de Pokémon del rival), `Notice({ tone, urgent? })`, `Timer({ deadline, offset, totalMs, label, now? })` (`role="timer"`), `ThemeSwitcher`, `Header` (título al lobby, usuario y botón de cerrar sesión solo con sesión).
- `buildIndex(names)`, `suggest(index, query, limit?)` (por el comienzo del nombre en español o inglés, sin tildes ni mayúsculas) y `Autocomplete({ names, onSubmit, submitted?, disabled? })`: combobox accesible; Enter envía lo escrito o la sugerencia resaltada (siempre con el nombre en español); hacer clic en una sugerencia rellena el campo pero **no** envía; máximo 100 caracteres; vacío no envía; tras enviar queda bloqueado **en el acto** (sin esperar la confirmación del servidor: un doble Enter no envía dos veces); con `autoFocus` toma el foco al montarse (en la ronda hay solo 15 s); las sugerencias no usan opacidad (el texto secundario es `text-muted`).

- [ ] **Step 1: Escribir las pruebas que fallan**

`client/test/components/basics.test.tsx`:

```tsx
import { TYPE_NAMES } from "@pokemon-minigames/shared";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Button } from "../../src/components/Button";
import { Notice } from "../../src/components/Notice";
import { OpponentPanel, TeamPanel } from "../../src/components/Panels";
import { PokemonCard } from "../../src/components/PokemonCard";
import { TextField } from "../../src/components/TextField";
import { Timer } from "../../src/components/Timer";
import { TypeChip } from "../../src/components/TypeChip";
import { TYPE_LABELS } from "../../src/i18n/es";
import { pokemon } from "../helpers/events";

describe("Button", () => {
  it("por defecto es de tipo button (no envía formularios por accidente)", () => {
    render(<Button>Aceptar</Button>);
    expect(screen.getByRole("button", { name: "Aceptar" })).toHaveAttribute("type", "button");
  });

  it("al cargar queda deshabilitado y lo indica con aria-busy", async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Entrar</Button>);
    const button = screen.getByRole("button", { name: "Entrar" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("ninguna variante baja la opacidad al pasar el ratón (el texto perdería contraste)", () => {
    for (const variant of ["primary", "secondary", "ghost", "header"] as const) {
      const { unmount } = render(<Button variant={variant}>x</Button>);
      expect(screen.getByRole("button").className).not.toMatch(/hover:opacity/);
      unmount();
    }
  });

  it("la variante del encabezado usa el color de texto del encabezado, no el del resto de la página", () => {
    render(<Button variant="header">Cerrar sesión</Button>);
    const button = screen.getByRole("button", { name: "Cerrar sesión" });
    expect(button.className).toContain("text-header-fg");
    expect(button.className).not.toContain("text-fg");
  });

  it("ejecuta su acción al pulsarlo", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Crear</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("TextField", () => {
  it("asocia la etiqueta con el campo", () => {
    render(<TextField label="Email" />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("con error lo marca como inválido, lo anuncia y lo vincula al campo", () => {
    render(<TextField label="Email" error="Email inválido" />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Email inválido");
    expect(input.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);
  });

  it("sin error no se marca como inválido y la ayuda también queda vinculada", () => {
    render(<TextField label="Usuario" hint="De 3 a 30 caracteres" />);
    const input = screen.getByLabelText("Usuario");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).toHaveAccessibleDescription("De 3 a 30 caracteres");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("deja pasar el resto de atributos del input", () => {
    render(<TextField label="Clave" type="password" autoComplete="current-password" />);
    expect(screen.getByLabelText("Clave")).toHaveAttribute("type", "password");
  });
});

describe("TypeChip", () => {
  it("muestra el nombre del tipo en español, con su color", () => {
    render(<TypeChip type="fire" />);
    const chip = screen.getByText("fuego");
    expect(chip).toHaveAttribute("data-type", "fire");
    expect(chip.style.background).not.toBe("");
  });

  it("los 18 tipos tienen su nombre en español", () => {
    for (const type of TYPE_NAMES) expect(TYPE_LABELS[type]).toBeTruthy();
    expect(new Set(TYPE_NAMES.map((t) => TYPE_LABELS[t])).size).toBe(18);
  });
});

describe("Notice", () => {
  it("los errores se anuncian como alerta y lo demás como estado", () => {
    render(
      <>
        <Notice tone="danger">Falló</Notice>
        <Notice>Información</Notice>
      </>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Falló");
    expect(screen.getByRole("status")).toHaveTextContent("Información");
  });
});

describe("PokemonCard", () => {
  it("muestra el nombre en español, el inglés, los tipos y el total", () => {
    render(<PokemonCard pokemon={pokemon(6, 534, { names: { es: "Charizard", en: "Charizard" } })} />);
    expect(screen.getByRole("heading", { name: "Charizard" })).toBeInTheDocument();
    expect(screen.getByText("fuego")).toBeInTheDocument();
    expect(screen.getByText("volador")).toBeInTheDocument();
    expect(screen.getByLabelText("534 puntos en total")).toHaveTextContent("534");
  });

  it("solo muestra las seis stats cuando se piden", () => {
    const { rerender } = render(<PokemonCard pokemon={pokemon(1, 300)} />);
    expect(screen.queryByText("Velocidad")).not.toBeInTheDocument();
    rerender(<PokemonCard pokemon={pokemon(1, 300)} showStats />);
    for (const label of ["PS", "Ataque", "Defensa", "At. esp.", "Def. esp.", "Velocidad"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

describe("paneles de equipo", () => {
  it("TeamPanel lista los Pokémon y el total; vacío dice que no hay ninguno", () => {
    const { rerender } = render(<TeamPanel team={[pokemon(1, 500), pokemon(2, 300)]} total={800} />);
    expect(screen.getByRole("region", { name: "Tu equipo" })).toHaveTextContent("800");
    expect(screen.getByText("Poke1")).toBeInTheDocument();
    expect(screen.getByText("Poke2")).toBeInTheDocument();
    rerender(<TeamPanel team={[]} total={0} />);
    expect(screen.getByText("Todavía no tienes Pokémon.")).toBeInTheDocument();
  });

  it("OpponentPanel muestra solo el total y la cantidad, nunca nombres de Pokémon", () => {
    render(<OpponentPanel name="misty" total={400} teamSize={2} connected />);
    const panel = screen.getByRole("region", { name: "Tu rival" });
    expect(panel).toHaveTextContent("misty");
    expect(panel).toHaveTextContent("400");
    expect(panel).toHaveTextContent("2 Pokémon");
    expect(panel).toHaveTextContent("Sus nombres se revelan al cerrar la ronda.");
    expect(panel).not.toHaveTextContent("Desconectado");
  });

  it("OpponentPanel usa el singular y avisa si el rival está desconectado", () => {
    render(<OpponentPanel name="misty" total={300} teamSize={1} connected={false} />);
    expect(screen.getByText("1 Pokémon")).toBeInTheDocument();
    expect(screen.getByText("Desconectado")).toBeInTheDocument();
  });
});

describe("Timer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("muestra los segundos que faltan, corrige el desfase y baja con el tiempo", () => {
    let now = 4_000; // el navegador marca 4 000 mientras el servidor marca 10 000
    render(<Timer deadline={25_000} offset={6_000} totalMs={15_000} label="Tiempo de la ronda" now={() => now} />);
    expect(screen.getByRole("timer", { name: "Tiempo de la ronda" })).toHaveTextContent("15");

    now = 9_000;
    act(() => void vi.advanceTimersByTime(250));
    expect(screen.getByRole("timer")).toHaveTextContent("10");
  });

  it("llega a cero y no pasa de ahí", () => {
    let now = 0;
    render(<Timer deadline={1_000} offset={0} totalMs={15_000} label="Tiempo" now={() => now} />);
    now = 60_000;
    act(() => void vi.advanceTimersByTime(250));
    expect(screen.getByRole("timer")).toHaveTextContent("0");
  });
});
```

`client/test/components/autocomplete.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Autocomplete, buildIndex, suggest } from "../../src/components/Autocomplete";
import { NAMES } from "../helpers/services";

describe("suggest", () => {
  const index = buildIndex(NAMES);

  it("sugiere por el comienzo del nombre en español o en inglés", () => {
    expect(suggest(index, "alf").map((n) => n.es)).toEqual(["Alfa", "Alfil"]);
    expect(suggest(index, "bish").map((n) => n.es)).toEqual(["Alfil"]); // inglés
  });

  it("ignora mayúsculas, tildes y signos", () => {
    expect(suggest(index, "  EPSI").map((n) => n.es)).toEqual(["Épsilon"]);
    expect(suggest(index, "épsilon").map((n) => n.es)).toEqual(["Épsilon"]);
    expect(suggest(index, "a-l-f").map((n) => n.es)).toEqual(["Alfa", "Alfil"]);
  });

  it("no sugiere nada con un texto vacío o que no coincide", () => {
    expect(suggest(index, "")).toEqual([]);
    expect(suggest(index, "   ")).toEqual([]);
    expect(suggest(index, "xyz")).toEqual([]);
  });

  it("limita la cantidad de sugerencias", () => {
    const many = buildIndex(Array.from({ length: 30 }, (_, i) => ({ id: i, es: `Pok${i}`, en: `Mon${i}` })));
    expect(suggest(many, "pok")).toHaveLength(6);
  });

  it("no revela nada por tipo: la lista de entrada solo trae nombres", () => {
    expect(Object.keys(NAMES[0]!).sort()).toEqual(["en", "es", "id"]);
  });
});

function setup(props: Partial<React.ComponentProps<typeof Autocomplete>> = {}) {
  const onSubmit = vi.fn();
  const user = userEvent.setup();
  render(<Autocomplete names={NAMES} onSubmit={onSubmit} {...props} />);
  const input = screen.getByRole("combobox", { name: "Nombre del Pokémon" });
  return { onSubmit, user, input };
}

describe("Autocomplete", () => {
  it("al escribir muestra las sugerencias y lo anuncia a los lectores de pantalla", async () => {
    const { user, input } = setup();
    await user.type(input, "alf");
    const list = screen.getByRole("listbox", { name: "Sugerencias" });
    expect(within(list).getAllByRole("option").map((o) => o.textContent)).toEqual(["AlfaAlpha", "AlfilBishop"]);
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("status")).toHaveTextContent("2 sugerencias disponibles");
  });

  it("sin coincidencias no muestra la lista", async () => {
    const { user, input } = setup();
    await user.type(input, "xyz");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("Enter envía lo escrito, recortado", async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, "  Charizard  {Enter}");
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Charizard");
  });

  it("el botón Enviar también envía", async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, "Beto");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Beto");
  });

  it("las flechas recorren las sugerencias y Enter envía la resaltada con su nombre en español", async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, "alf");
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[0]!.id);
    await user.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}"); // no pasa del último
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowUp}{Enter}");
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Alfa");
  });

  it("escribir en inglés y elegir la sugerencia envía el nombre en español", async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, "bish");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Alfil");
  });

  it("Escape cierra la lista sin enviar nada", async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, "alf");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("hacer clic en una sugerencia rellena el campo pero no envía: hay un solo intento", async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, "alf");
    await user.click(screen.getByRole("option", { name: /Alfil/ }));
    expect(input).toHaveValue("Alfil");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Alfil");
  });

  it("un campo vacío no envía y muestra un error que se quita al escribir", async () => {
    const { user, input, onSubmit } = setup();
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Escribe el nombre de un Pokémon.");
    expect(input).toHaveAttribute("aria-invalid", "true");
    await user.type(input, "a");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("un texto de solo espacios cuenta como vacío", async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, "   {Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("limita el texto a 100 caracteres, como el servidor", () => {
    const { input } = setup();
    expect(input).toHaveAttribute("maxlength", "100");
  });

  it("una vez enviada la respuesta queda bloqueado y lo dice", () => {
    const { input } = setup({ submitted: true });
    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
    expect(screen.getByText("Respuesta enviada. Esperando el resultado…")).toBeInTheDocument();
  });

  it("deshabilitado desde fuera tampoco envía", async () => {
    const { input, onSubmit } = setup({ disabled: true });
    expect(input).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("tras enviar queda bloqueado en el acto, sin esperar la confirmación: un doble Enter no envía dos veces", async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, "Beto{Enter}");
    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
    await user.keyboard("{Enter}{Enter}");
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Beto");
  });

  it("las sugerencias no usan opacidad (el texto bajaría de 4,5:1 sin que la auditoría lo viera)", async () => {
    const { user, input } = setup();
    await user.type(input, "alf");
    const list = screen.getByRole("listbox");
    expect(list.innerHTML).not.toMatch(/opacity/);
    await user.keyboard("{ArrowDown}");
    expect(list.innerHTML).not.toMatch(/opacity/);
  });

  it("con autoFocus el campo recibe el foco al montarse; por defecto no", () => {
    const first = setup({ autoFocus: true });
    expect(first.input).toHaveFocus();
  });

  it("sin autoFocus el campo no roba el foco", () => {
    const { input } = setup();
    expect(input).not.toHaveFocus();
  });

  it("funciona aunque todavía no haya llegado la lista de nombres: solo no sugiere", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Autocomplete names={[]} onSubmit={onSubmit} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "alf{Enter}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("alf");
  });
});
```

`client/test/components/header-theme.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Header } from "../../src/components/Header";
import { ThemeSwitcher } from "../../src/components/ThemeSwitcher";
import { ASH, fakeServices, renderWithServices, signIn } from "../helpers/services";

describe("ThemeSwitcher", () => {
  it("muestra el tema y el modo actuales", () => {
    renderWithServices(<ThemeSwitcher />);
    expect(screen.getByRole("combobox", { name: "Tema" })).toHaveValue("clasico");
    expect(screen.getByRole("combobox", { name: "Modo" })).toHaveValue("auto");
  });

  it("ofrece los dos temas y los tres modos en español", () => {
    renderWithServices(<ThemeSwitcher />);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Clásico",
      "Pokédex",
      "Automático",
      "Claro",
      "Oscuro",
    ]);
  });

  it("al elegir otro tema lo aplica al documento", async () => {
    const services = fakeServices();
    renderWithServices(<ThemeSwitcher />, { services });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Tema" }), "pokedex");
    expect(services.themeRoot.dataset.theme).toBe("pokedex");
    expect(services.theme.getState().preference.theme).toBe("pokedex");
  });

  it("al elegir otro modo lo aplica al documento", async () => {
    const services = fakeServices();
    renderWithServices(<ThemeSwitcher />, { services });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Modo" }), "oscuro");
    expect(services.themeRoot.dataset.mode).toBe("oscuro");
  });

  it("refleja un cambio de tema hecho desde fuera", () => {
    const services = fakeServices();
    renderWithServices(<ThemeSwitcher />, { services });
    services.theme.getState().setTheme("pokedex");
    // zustand notifica de forma síncrona; React vuelve a pintar en el siguiente ciclo
    return screen.findByDisplayValue("Pokédex");
  });
});

describe("Header", () => {
  it("con sesión muestra el usuario y permite cerrar sesión", async () => {
    const services = fakeServices();
    signIn(services);
    renderWithServices(<Header />, { services });
    expect(screen.getByText(ASH.username)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(services.endpoints.auth.logout).toHaveBeenCalledTimes(1);
    expect(services.session.getState().status).toBe("anonymous");
  });

  it("el botón de cerrar sesión usa el color de texto del encabezado (se lee sobre su fondo en todos los temas)", () => {
    const services = fakeServices();
    signIn(services);
    renderWithServices(<Header />, { services });
    expect(screen.getByRole("button", { name: "Cerrar sesión" }).className).toContain("text-header-fg");
  });

  it("sin sesión no muestra usuario ni botón, pero sí el selector de tema", () => {
    renderWithServices(<Header />);
    expect(screen.queryByRole("button", { name: "Cerrar sesión" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Tema" })).toBeInTheDocument();
  });

  it("el título lleva al lobby", () => {
    renderWithServices(<Header />);
    expect(screen.getByRole("link", { name: "Pokémon Minigames" })).toHaveAttribute("href", "/");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w client -- test/components
```

Expected: FAIL — no existen los módulos de `src/components`.

- [ ] **Step 3: Implementar**

`client/src/components/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "header";

const VARIANTS: Record<Variant, string> = {
  // El hover subraya en vez de bajar la opacidad: con opacidad el texto pierde contraste (en Pokédex quedaba por debajo de 4,5:1).
  primary: "bg-accent text-accent-fg border-transparent hover:underline",
  secondary: "bg-surface text-fg border-line hover:bg-surface-2",
  ghost: "bg-transparent text-fg border-transparent hover:bg-surface-2",
  // Sobre el encabezado, que tiene su propio fondo y su propio color de texto según el tema.
  header: "bg-transparent text-header-fg border-transparent hover:bg-header-fg/15",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Mientras carga queda deshabilitado y lo indica a los lectores de pantalla. */
  loading?: boolean;
}

export function Button({ variant = "secondary", loading = false, disabled, className = "", type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-ui border-(length:--frame) px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
```

`client/src/components/TextField.tsx`:

```tsx
import { type InputHTMLAttributes, type ReactNode, useId } from "react";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  label: string;
  error?: string | null;
  hint?: ReactNode;
}

/** Campo con su etiqueta y su mensaje de error, bien asociados para lectores de pantalla. */
export function TextField({ label, error, hint, id, ...input }: TextFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;

  return (
    <div>
      <label htmlFor={fieldId} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={[error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined}
        className="framed w-full rounded-ui bg-surface px-3 py-2 text-fg placeholder:text-muted"
        {...input}
      />
      {hint ? (
        <p id={hintId} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

`client/src/components/TypeChip.tsx`:

```tsx
import type { TypeName } from "@pokemon-minigames/shared";
import { TYPE_LABELS } from "../i18n/es";
import { TYPE_STYLES } from "../theme/type-styles";

export function TypeChip({ type, className = "" }: { type: TypeName; className?: string }) {
  return (
    <span
      style={TYPE_STYLES[type]}
      className={`inline-block rounded-ui px-3 py-0.5 text-sm font-medium ${className}`}
      data-type={type}
    >
      {TYPE_LABELS[type]}
    </span>
  );
}
```

`client/src/components/Timer.tsx`:

```tsx
import { secondsLeft, useCountdown } from "../game/clock";

export interface TimerProps {
  /** Plazo en hora del servidor (ms). */
  deadline: number | null;
  /** Desfase entre el reloj del servidor y el del navegador. */
  offset: number;
  /** Duración total, para dibujar la barra de progreso. */
  totalMs: number;
  /** Nombre accesible del cronómetro, p. ej. "Tiempo de la ronda". */
  label: string;
  now?: () => number;
}

/** Cuenta atrás en segundos con barra de progreso. No anuncia cada segundo a los lectores de pantalla. */
export function Timer({ deadline, offset, totalMs, label, now }: TimerProps) {
  const remaining = useCountdown(deadline, offset, { now });
  const percent = totalMs > 0 ? Math.min(100, (remaining / totalMs) * 100) : 0;

  return (
    <div role="timer" aria-label={label} className="text-center">
      <span className="font-num text-4xl font-medium tabular-nums">{secondsLeft(remaining)}</span>
      <div className="mt-2 h-1 overflow-hidden rounded-ui bg-surface-2" aria-hidden="true">
        <div className="h-1 bg-accent" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
```

`client/src/components/PokemonCard.tsx`:

```tsx
import type { BaseStats, PokemonView } from "@pokemon-minigames/shared";
import { STAT_LABELS } from "../i18n/es";
import { TypeChip } from "./TypeChip";

export interface PokemonCardProps {
  pokemon: PokemonView;
  /** Muestra las seis stats base (en el resumen final). */
  showStats?: boolean;
}

export function PokemonCard({ pokemon, showStats = false }: PokemonCardProps) {
  return (
    <article className="framed rounded-card bg-surface p-3">
      <div className="flex items-center gap-3">
        <img src={pokemon.spriteUrl} alt="" width={56} height={56} loading="lazy" className="h-14 w-14 shrink-0" />
        <div className="min-w-0">
          <h3 className="truncate font-medium">{pokemon.names.es}</h3>
          <p className="truncate text-xs text-muted">{pokemon.names.en}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {pokemon.types.map((type) => (
              <TypeChip key={type} type={type} />
            ))}
          </div>
        </div>
        <p className="ml-auto font-num text-lg tabular-nums" aria-label={`${pokemon.totalStats} puntos en total`}>
          {pokemon.totalStats}
        </p>
      </div>
      {showStats ? (
        <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
          {(Object.keys(STAT_LABELS) as (keyof BaseStats)[]).map((stat) => (
            <div key={stat} className="flex justify-between gap-1">
              <dt className="text-muted">{STAT_LABELS[stat]}</dt>
              <dd className="font-num tabular-nums">{pokemon.stats[stat]}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
}
```

`client/src/components/Panels.tsx`:

```tsx
import type { PokemonView } from "@pokemon-minigames/shared";

/** Tu equipo: lo que has ganado hasta ahora y su total. */
export function TeamPanel({ team, total }: { team: PokemonView[]; total: number }) {
  return (
    <section aria-label="Tu equipo" className="framed rounded-card bg-surface p-3">
      <h2 className="text-xs text-muted">Tu equipo</h2>
      <p className="font-num text-2xl font-medium tabular-nums">{total}</p>
      {team.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Todavía no tienes Pokémon.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {team.map((pokemon) => (
            <li key={pokemon.id} className="flex items-center justify-between gap-2">
              <span className="truncate">{pokemon.names.es}</span>
              <span className="font-num tabular-nums text-muted">{pokemon.totalStats}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** El rival: solo su total y cuántos Pokémon lleva; sus nombres se revelan al cerrar cada ronda. */
export function OpponentPanel({
  name,
  total,
  teamSize,
  connected,
}: {
  name: string;
  total: number;
  teamSize: number;
  connected: boolean;
}) {
  return (
    <section aria-label="Tu rival" className="framed rounded-card bg-surface p-3">
      <h2 className="truncate text-xs text-muted">{name}</h2>
      <p className="font-num text-2xl font-medium tabular-nums">{total}</p>
      <p className="mt-2 text-sm">
        {teamSize === 1 ? "1 Pokémon" : `${teamSize} Pokémon`}
      </p>
      <p className="mt-1 text-xs text-muted">Sus nombres se revelan al cerrar la ronda.</p>
      {connected ? null : <p className="mt-1 text-xs text-danger">Desconectado</p>}
    </section>
  );
}
```

`client/src/components/Notice.tsx`:

```tsx
import type { ReactNode } from "react";

type Tone = "info" | "danger" | "success";

const TONES: Record<Tone, string> = {
  info: "bg-surface-2 text-fg border-line",
  danger: "bg-danger-bg text-danger border-danger",
  success: "bg-success-bg text-success border-success",
};

export interface NoticeProps {
  tone?: Tone;
  children: ReactNode;
  /** Los errores se anuncian de inmediato (`alert`); lo demás, con calma (`status`). */
  urgent?: boolean;
  className?: string;
}

export function Notice({ tone = "info", urgent = tone === "danger", children, className = "" }: NoticeProps) {
  return (
    <div
      role={urgent ? "alert" : "status"}
      className={`rounded-ui border-(length:--frame) px-3 py-2 text-sm ${TONES[tone]} ${className}`}
    >
      {children}
    </div>
  );
}
```

`client/src/components/ThemeSwitcher.tsx`:

```tsx
import {
  MODE_LABELS,
  THEME_LABELS,
  THEME_MODES,
  THEME_NAMES,
  type ThemeMode,
  type ThemeName,
} from "../theme/theme-store";
import { useServices, useTheme } from "../services";

const SELECT_CLASS = "framed rounded-ui bg-surface px-2 py-1 text-sm text-fg";

/** Elegir el tema visual (Clásico o Pokédex) y el modo (automático, claro u oscuro). */
export function ThemeSwitcher() {
  const { theme: store } = useServices();
  const theme = useTheme((s) => s.preference.theme);
  const mode = useTheme((s) => s.preference.mode);

  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="flex items-center gap-1">
        <span>Tema</span>
        <select
          className={SELECT_CLASS}
          value={theme}
          onChange={(event) => store.getState().setTheme(event.target.value as ThemeName)}
        >
          {THEME_NAMES.map((name) => (
            <option key={name} value={name}>
              {THEME_LABELS[name]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1">
        <span>Modo</span>
        <select
          className={SELECT_CLASS}
          value={mode}
          onChange={(event) => store.getState().setMode(event.target.value as ThemeMode)}
        >
          {THEME_MODES.map((name) => (
            <option key={name} value={name}>
              {MODE_LABELS[name]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
```

`client/src/components/Header.tsx`:

```tsx
import { Link } from "react-router";
import { useServices, useSession } from "../services";
import { Button } from "./Button";
import { ThemeSwitcher } from "./ThemeSwitcher";

export function Header() {
  const user = useSession((s) => s.user);
  const { session } = useServices();

  return (
    <header className="border-b-(length:--frame) border-line bg-header text-header-fg">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link to="/" className="font-num text-lg font-medium">
          Pokémon Minigames
        </Link>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <ThemeSwitcher />
          {user ? (
            <>
              <span className="text-sm">{user.username}</span>
              <Button variant="header" onClick={() => void session.getState().logout()}>
                Cerrar sesión
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
```

`client/src/components/Autocomplete.tsx`:

```tsx
import { normalizeName } from "@pokemon-minigames/shared";
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import type { PokemonName } from "../api/types";
import { Button } from "./Button";

const MAX_SUGGESTIONS = 6;
const MAX_LENGTH = 100;

export interface IndexedName {
  name: PokemonName;
  es: string;
  en: string;
}

/** Normaliza los nombres una sola vez para no repetirlo en cada tecla. */
export function buildIndex(names: PokemonName[]): IndexedName[] {
  return names.map((name) => ({ name, es: normalizeName(name.es), en: normalizeName(name.en) }));
}

/**
 * Sugerencias para lo que se ha escrito: nombres en español o inglés que empiezan por ello, sin
 * tildes ni mayúsculas. No filtra por tipo: así nunca revela una respuesta.
 */
export function suggest(index: IndexedName[], query: string, limit = MAX_SUGGESTIONS): PokemonName[] {
  const q = normalizeName(query);
  if (!q) return [];
  return index
    .filter((entry) => entry.es.startsWith(q) || entry.en.startsWith(q))
    .slice(0, limit)
    .map((entry) => entry.name);
}

export interface AutocompleteProps {
  names: PokemonName[];
  onSubmit(text: string): void;
  /** Ya se envió la respuesta de esta ronda: el campo queda bloqueado. */
  submitted?: boolean;
  disabled?: boolean;
  /** Lleva el foco al campo al montarse (en la ronda hay solo 15 s para escribir). */
  autoFocus?: boolean;
}

/**
 * Campo de respuesta con lista de sugerencias (patrón combobox accesible). Enter envía lo
 * escrito, o la sugerencia resaltada con las flechas. Solo sugiere: no corrige nada por su cuenta.
 */
export function Autocomplete({ names, onSubmit, submitted = false, disabled = false, autoFocus = false }: AutocompleteProps) {
  const [text, setText] = useState("");
  // Se bloquea en el acto al enviar: la confirmación del servidor tarda y un doble Enter enviaría dos veces.
  const [sent, setSent] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const inputId = useId();

  const index = useMemo(() => buildIndex(names), [names]);
  const suggestions = useMemo(() => suggest(index, text), [index, text]);
  const showList = open && suggestions.length > 0 && !submitted;
  const locked = submitted || disabled || sent;

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function submit(value: string): void {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Escribe el nombre de un Pokémon.");
      return;
    }
    setError(null);
    setOpen(false);
    setActive(-1);
    setSent(true);
    onSubmit(trimmed);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (event.key === "Escape") {
      setOpen(false);
      setActive(-1);
    } else if (event.key === "Enter" && showList && active >= 0) {
      event.preventDefault();
      submit(suggestions[active]!.es);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit(text);
      }}
      className="relative"
    >
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium">
        Nombre del Pokémon
      </label>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={MAX_LENGTH}
          disabled={locked}
          value={text}
          placeholder="Escribe un nombre"
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
            setActive(-1);
            setError(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setOpen(false)}
          className="framed min-w-0 flex-1 rounded-ui bg-surface px-3 py-2 text-fg placeholder:text-muted"
        />
        <Button type="submit" variant="primary" disabled={locked}>
          Enviar
        </Button>
      </div>

      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Sugerencias"
          className="framed absolute left-0 right-0 z-10 mt-1 overflow-hidden rounded-ui bg-surface shadow-md"
        >
          {suggestions.map((name, i) => (
            <li
              key={name.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // `mousedown` evita que el campo pierda el foco (y cierre la lista) antes del clic.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setText(name.es);
                setOpen(false);
                setActive(-1);
                inputRef.current?.focus();
              }}
              className={`cursor-pointer px-3 py-2 text-sm ${i === active ? "bg-accent text-accent-fg" : "hover:bg-surface-2"}`}
            >
              {name.es}
              {name.en !== name.es ? <span className={i === active ? "ml-2" : "ml-2 text-muted"}>{name.en}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      <p role="status" className="sr-only">
        {showList ? `${suggestions.length} sugerencias disponibles` : ""}
      </p>
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {submitted || sent ? <p className="mt-2 text-sm text-muted">Respuesta enviada. Esperando el resultado…</p> : null}
    </form>
  );
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w client -- test/components
npm run typecheck -w client
```

Expected: PASS (51 pruebas: 19 de `basics`, 23 de `autocomplete` y 9 de `header-theme`) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): componentes de interfaz (botones, campos, cronómetro, paneles, autocompletado accesible)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Lobby (crear sala, unirse y volver a la partida)

**Files:**
- Create: `client/src/game/durations.ts`, `client/src/pages/room-form.ts`, `client/src/pages/Lobby.tsx`
- Test: `client/test/pages/lobby.test.tsx`

**Interfaces:**
- `durations.ts`: `ROUND_MS`, `TYPE_CHOICE_MS`, `START_COUNTDOWN_MS`, `RESULT_PAUSE_MS` (15 s, 15 s, 5 s, 6 s: solo sirven para dibujar la barra de progreso de los cronómetros) y los rangos del modo personalizado (`CUSTOM_ROUNDS_MIN/MAX` 1–20, `CUSTOM_STATS_GOAL_MIN/MAX` 500–5000), los mismos del servidor.
- `room-form.ts`: `LengthKind` (`"fixed-3" | "fixed-5" | "custom-rounds" | "custom-stats"`), `CreateRoomForm`, `DEFAULT_FORM`, `LENGTH_LABELS`, `formFromConfig(config)`, `buildRequest(form)` → `{ ok: true, request } | { ok: false, error }` (valida los rangos igual que el servidor).
- `LobbyPage`: crear sala (modo de tipos y largo) → navega a `/sala/:code`; unirse con un código (se normaliza a mayúsculas y sin espacios; los errores del servidor se muestran en español); si `GET /rooms/current` devuelve una sala, un aviso "Volver a tu partida" (desde la sala se cancela o se abandona); el formulario de crear sala puede partir de la configuración de la partida anterior ("Jugar de nuevo"). Una prueba comprueba que las duraciones y los rangos coinciden con las constantes del servidor.

- [ ] **Step 1: Escribir la prueba que falla**

`client/test/pages/lobby.test.tsx`:

```tsx
import type { RoomConfig } from "@pokemon-minigames/shared";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/client";
import * as durations from "../../src/game/durations";
import { LobbyPage } from "../../src/pages/Lobby";
import { DEFAULT_FORM, buildRequest, formFromConfig } from "../../src/pages/room-form";
import * as serverConstants from "../../../server/src/game/constants";
import { fakeServices, renderRoute } from "../helpers/services";

describe("límites y duraciones del cliente", () => {
  it("coinciden con los del servidor", () => {
    expect(durations.ROUND_MS).toBe(serverConstants.ROUND_SECONDS * 1000);
    expect(durations.TYPE_CHOICE_MS).toBe(serverConstants.TYPE_CHOICE_SECONDS * 1000);
    expect(durations.START_COUNTDOWN_MS).toBe(serverConstants.START_COUNTDOWN_SECONDS * 1000);
    expect(durations.RESULT_PAUSE_MS).toBe(serverConstants.RESULT_PAUSE_SECONDS * 1000);
    expect(durations.CUSTOM_ROUNDS_MIN).toBe(serverConstants.CUSTOM_ROUNDS_MIN);
    expect(durations.CUSTOM_ROUNDS_MAX).toBe(serverConstants.CUSTOM_ROUNDS_MAX);
    expect(durations.CUSTOM_STATS_GOAL_MIN).toBe(serverConstants.CUSTOM_STATS_GOAL_MIN);
    expect(durations.CUSTOM_STATS_GOAL_MAX).toBe(serverConstants.CUSTOM_STATS_GOAL_MAX);
  });
});

describe("buildRequest", () => {
  it("rondas fijas de 3 y de 5", () => {
    expect(buildRequest({ ...DEFAULT_FORM, lengthKind: "fixed-3" })).toEqual({
      ok: true,
      request: { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3 },
    });
    expect(buildRequest({ ...DEFAULT_FORM, typeMode: "chosen", lengthKind: "fixed-5" })).toEqual({
      ok: true,
      request: { typeMode: "chosen", lengthMode: "fixed_rounds", roundsLimit: 5 },
    });
  });

  it("personalizada por rondas y por meta de stats", () => {
    expect(buildRequest({ ...DEFAULT_FORM, lengthKind: "custom-rounds", customRounds: "12" })).toEqual({
      ok: true,
      request: { typeMode: "random", lengthMode: "custom", roundsLimit: 12 },
    });
    expect(buildRequest({ ...DEFAULT_FORM, lengthKind: "custom-stats", statsGoal: "3000" })).toEqual({
      ok: true,
      request: { typeMode: "random", lengthMode: "custom", statsGoal: 3000 },
    });
  });

  it.each([
    ["rondas 0", { lengthKind: "custom-rounds", customRounds: "0" }, "customRounds"],
    ["rondas 21", { lengthKind: "custom-rounds", customRounds: "21" }, "customRounds"],
    ["rondas decimales", { lengthKind: "custom-rounds", customRounds: "2.5" }, "customRounds"],
    ["rondas con texto", { lengthKind: "custom-rounds", customRounds: "diez" }, "customRounds"],
    ["rondas vacías", { lengthKind: "custom-rounds", customRounds: "" }, "customRounds"],
    ["meta 499", { lengthKind: "custom-stats", statsGoal: "499" }, "statsGoal"],
    ["meta 5001", { lengthKind: "custom-stats", statsGoal: "5001" }, "statsGoal"],
    ["meta negativa", { lengthKind: "custom-stats", statsGoal: "-600" }, "statsGoal"],
  ] as const)("rechaza %s", (_name, override, field) => {
    const built = buildRequest({ ...DEFAULT_FORM, ...override });
    expect(built).toMatchObject({ ok: false, field });
  });

  it("acepta los extremos de los rangos", () => {
    for (const customRounds of ["1", "20"]) expect(buildRequest({ ...DEFAULT_FORM, lengthKind: "custom-rounds", customRounds }).ok).toBe(true);
    for (const statsGoal of ["500", "5000"]) expect(buildRequest({ ...DEFAULT_FORM, lengthKind: "custom-stats", statsGoal }).ok).toBe(true);
  });
});

describe("formFromConfig", () => {
  const config = (overrides: Partial<RoomConfig>): RoomConfig => ({
    typeMode: "random",
    lengthMode: "fixed_rounds",
    roundsLimit: 3,
    statsGoal: null,
    ...overrides,
  });

  it("recupera cada tipo de configuración para volver a jugar con la misma", () => {
    expect(formFromConfig(config({}))).toMatchObject({ typeMode: "random", lengthKind: "fixed-3" });
    expect(formFromConfig(config({ roundsLimit: 5, typeMode: "chosen" }))).toMatchObject({ typeMode: "chosen", lengthKind: "fixed-5" });
    expect(formFromConfig(config({ lengthMode: "custom", roundsLimit: 8 }))).toMatchObject({ lengthKind: "custom-rounds", customRounds: "8" });
    expect(formFromConfig(config({ lengthMode: "custom", roundsLimit: null, statsGoal: 1800 }))).toMatchObject({ lengthKind: "custom-stats", statsGoal: "1800" });
  });

  it("convertir y volver a convertir da la misma petición", () => {
    const original: RoomConfig = { typeMode: "chosen", lengthMode: "custom", roundsLimit: null, statsGoal: 2200 };
    const built = buildRequest(formFromConfig(original));
    expect(built).toEqual({ ok: true, request: { typeMode: "chosen", lengthMode: "custom", statsGoal: 2200 } });
  });
});

function renderLobby(options: { state?: unknown; services?: ReturnType<typeof fakeServices> } = {}) {
  const services = options.services ?? fakeServices();
  const utils = renderRoute("/", <LobbyPage />, {
    services,
    route: options.state ? { pathname: "/", state: options.state } : "/",
  });
  return { user: userEvent.setup(), ...utils };
}

describe("lobby: crear sala", () => {
  it("por defecto crea una sala aleatoria de 3 rondas y entra a ella", async () => {
    const { services, user } = renderLobby();
    await user.click(screen.getByRole("button", { name: "Crear sala" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/sala/ABC234"));
    expect(services.endpoints.rooms.create).toHaveBeenCalledWith({ typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3 });
  });

  it("permite elegir el modo de tipos y el largo de la partida", async () => {
    const { services, user } = renderLobby();
    await user.click(screen.getByRole("radio", { name: /Elegido/ }));
    await user.selectOptions(screen.getByLabelText("Largo de la partida"), "5 rondas");
    await user.click(screen.getByRole("button", { name: "Crear sala" }));
    await waitFor(() => expect(services.endpoints.rooms.create).toHaveBeenCalled());
    expect(services.endpoints.rooms.create).toHaveBeenCalledWith({ typeMode: "chosen", lengthMode: "fixed_rounds", roundsLimit: 5 });
  });

  it("explica cada modo de tipos", () => {
    renderLobby();
    expect(screen.getByText("El servidor sortea el par de tipos de cada ronda.")).toBeInTheDocument();
    expect(screen.getByText("Cada jugador elige un tipo y juntos forman el par.")).toBeInTheDocument();
  });

  it("la personalizada por rondas pide el máximo y lo valida antes de enviar", async () => {
    const { services, user } = renderLobby();
    await user.selectOptions(screen.getByLabelText("Largo de la partida"), "Personalizada: máximo de rondas");
    const field = screen.getByLabelText("Máximo de rondas");
    await user.clear(field);
    await user.type(field, "25");
    await user.click(screen.getByRole("button", { name: "Crear sala" }));
    expect(screen.getByRole("alert")).toHaveTextContent("El máximo de rondas va de 1 a 20.");
    expect(services.endpoints.rooms.create).not.toHaveBeenCalled();

    await user.clear(field);
    await user.type(field, "12");
    await user.click(screen.getByRole("button", { name: "Crear sala" }));
    await waitFor(() => expect(services.endpoints.rooms.create).toHaveBeenCalledWith({ typeMode: "random", lengthMode: "custom", roundsLimit: 12 }));
  });

  it("la personalizada por meta de stats pide la meta y la valida", async () => {
    const { services, user } = renderLobby();
    await user.selectOptions(screen.getByLabelText("Largo de la partida"), "Personalizada: meta de stats");
    const field = screen.getByLabelText("Meta de stats");
    await user.clear(field);
    await user.type(field, "100");
    await user.click(screen.getByRole("button", { name: "Crear sala" }));
    expect(screen.getByRole("alert")).toHaveTextContent("La meta de stats va de 500 a 5000.");
    expect(services.endpoints.rooms.create).not.toHaveBeenCalled();
  });

  it("cambiar de largo quita el error anterior", async () => {
    const { user } = renderLobby();
    await user.selectOptions(screen.getByLabelText("Largo de la partida"), "Personalizada: máximo de rondas");
    await user.clear(screen.getByLabelText("Máximo de rondas"));
    await user.click(screen.getByRole("button", { name: "Crear sala" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Largo de la partida"), "3 rondas");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("si el servidor rechaza la creación muestra el motivo y se puede reintentar", async () => {
    const { services, user } = renderLobby();
    vi.mocked(services.endpoints.rooms.create).mockRejectedValueOnce(new ApiError(409, "ALREADY_IN_GAME"));
    await user.click(screen.getByRole("button", { name: "Crear sala" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ya estás en una partida");
    expect(screen.getByRole("button", { name: "Crear sala" })).toBeEnabled();
    expect(screen.getByTestId("location")).toHaveTextContent("/");
  });

  it("no crea dos salas si se pulsa dos veces seguidas", async () => {
    const { services, user } = renderLobby();
    let release!: () => void;
    vi.mocked(services.endpoints.rooms.create).mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve({ code: "ABC234" }))));
    await user.click(screen.getByRole("button", { name: "Crear sala" }));
    await user.click(screen.getByRole("button", { name: "Crear sala" }));
    expect(services.endpoints.rooms.create).toHaveBeenCalledTimes(1);
    release();
  });

  it("al volver a jugar, el formulario parte de la configuración de la partida anterior", () => {
    renderLobby({ state: { config: { typeMode: "chosen", lengthMode: "custom", roundsLimit: null, statsGoal: 1800 } } });
    expect(screen.getByRole("radio", { name: /Elegido/ })).toBeChecked();
    expect(screen.getByLabelText("Largo de la partida")).toHaveValue("custom-stats");
    expect(screen.getByLabelText("Meta de stats")).toHaveValue("1800");
  });
});

describe("lobby: unirse a una sala", () => {
  it("normaliza el código (recorta y pasa a mayúsculas) y entra a la sala", async () => {
    const { services, user } = renderLobby();
    await user.type(screen.getByLabelText("Código de sala"), "  abc234 ");
    await user.click(screen.getByRole("button", { name: "Unirse" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/sala/ABC234"));
    expect(services.endpoints.rooms.join).toHaveBeenCalledWith("ABC234");
  });

  it("un código vacío no llama al servidor y se corrige al escribir", async () => {
    const { services, user } = renderLobby();
    await user.click(screen.getByRole("button", { name: "Unirse" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Escribe el código de la sala.");
    expect(services.endpoints.rooms.join).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Código de sala"), "A");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    ["ROOM_NOT_FOUND", "Esa sala no existe o ya terminó."],
    ["ROOM_FULL", "Esa sala ya está llena."],
    ["ROOM_CLOSED", "Esa sala ya empezó o se cerró."],
    ["ALREADY_IN_GAME", "Ya estás en una partida"],
  ] as const)("si el servidor responde %s lo explica en español", async (code, message) => {
    const { services, user } = renderLobby();
    vi.mocked(services.endpoints.rooms.join).mockRejectedValueOnce(new ApiError(409, code));
    await user.type(screen.getByLabelText("Código de sala"), "ZZZZZZ");
    await user.click(screen.getByRole("button", { name: "Unirse" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByTestId("location")).toHaveTextContent("/");
  });
});

describe("lobby: volver a tu partida", () => {
  it("si el servidor dice que tienes una sala activa, ofrece volver a ella", async () => {
    const services = fakeServices();
    vi.mocked(services.endpoints.rooms.current).mockResolvedValueOnce({ code: "XYZ789", phase: "waiting" });
    const { user } = renderLobby({ services });
    expect(await screen.findByText("Tienes una partida en curso (sala XYZ789).")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Volver a tu partida" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/sala/XYZ789");
  });

  it("sin partida activa no muestra nada", async () => {
    const { services } = renderLobby();
    await waitFor(() => expect(services.endpoints.rooms.current).toHaveBeenCalled());
    expect(screen.queryByText(/Tienes una partida en curso/)).not.toBeInTheDocument();
  });

  it("si no se puede consultar, el lobby sigue funcionando", async () => {
    const services = fakeServices();
    vi.mocked(services.endpoints.rooms.current).mockRejectedValueOnce(new ApiError(0, "NETWORK"));
    renderLobby({ services });
    await waitFor(() => expect(services.endpoints.rooms.current).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Crear sala" })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w client -- test/pages/lobby.test.tsx
```

Expected: FAIL — no existe `src/pages/Lobby.tsx`.

- [ ] **Step 3: Implementar**

`client/src/game/durations.ts`:

```ts
/**
 * Duraciones que solo sirven para dibujar las barras de progreso de los cronómetros. Son las del
 * servidor (`server/src/game/constants.ts`); una prueba comprueba que coinciden. Quien decide
 * cuándo termina cada fase es siempre el servidor.
 */
export const ROUND_MS = 15_000;
export const TYPE_CHOICE_MS = 15_000;
export const START_COUNTDOWN_MS = 5_000;
export const RESULT_PAUSE_MS = 6_000;

/** Límites del modo personalizado; el servidor los vuelve a validar. */
export const CUSTOM_ROUNDS_MIN = 1;
export const CUSTOM_ROUNDS_MAX = 20;
export const CUSTOM_STATS_GOAL_MIN = 500;
export const CUSTOM_STATS_GOAL_MAX = 5000;
```

`client/src/pages/room-form.ts`:

```ts
import type { CreateRoomRequest, RoomConfig, TypeMode } from "@pokemon-minigames/shared";
import {
  CUSTOM_ROUNDS_MAX,
  CUSTOM_ROUNDS_MIN,
  CUSTOM_STATS_GOAL_MAX,
  CUSTOM_STATS_GOAL_MIN,
} from "../game/durations";

export type LengthKind = "fixed-3" | "fixed-5" | "custom-rounds" | "custom-stats";

export interface CreateRoomForm {
  typeMode: TypeMode;
  lengthKind: LengthKind;
  customRounds: string;
  statsGoal: string;
}

export const DEFAULT_FORM: CreateRoomForm = {
  typeMode: "random",
  lengthKind: "fixed-3",
  customRounds: "10",
  statsGoal: "2500",
};

export const LENGTH_LABELS: Record<LengthKind, string> = {
  "fixed-3": "3 rondas",
  "fixed-5": "5 rondas",
  "custom-rounds": "Personalizada: máximo de rondas",
  "custom-stats": "Personalizada: meta de stats",
};

/** El formulario de una sala que ya se jugó, para "Jugar de nuevo" con la misma configuración. */
export function formFromConfig(config: RoomConfig): CreateRoomForm {
  const base = { typeMode: config.typeMode, customRounds: DEFAULT_FORM.customRounds, statsGoal: DEFAULT_FORM.statsGoal };
  if (config.lengthMode === "fixed_rounds") {
    return { ...base, lengthKind: config.roundsLimit === 5 ? "fixed-5" : "fixed-3" };
  }
  if (config.roundsLimit !== null) {
    return { ...base, lengthKind: "custom-rounds", customRounds: String(config.roundsLimit) };
  }
  return { ...base, lengthKind: "custom-stats", statsGoal: String(config.statsGoal ?? DEFAULT_FORM.statsGoal) };
}

function wholeNumber(text: string): number | null {
  return /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
}

export type BuiltRequest =
  | { ok: true; request: CreateRoomRequest }
  | { ok: false; field: "customRounds" | "statsGoal"; error: string };

/** Convierte el formulario en la petición al servidor, con los mismos límites que él valida. */
export function buildRequest(form: CreateRoomForm): BuiltRequest {
  const { typeMode } = form;
  switch (form.lengthKind) {
    case "fixed-3":
      return { ok: true, request: { typeMode, lengthMode: "fixed_rounds", roundsLimit: 3 } };
    case "fixed-5":
      return { ok: true, request: { typeMode, lengthMode: "fixed_rounds", roundsLimit: 5 } };
    case "custom-rounds": {
      const rounds = wholeNumber(form.customRounds);
      if (rounds === null || rounds < CUSTOM_ROUNDS_MIN || rounds > CUSTOM_ROUNDS_MAX) {
        return { ok: false, field: "customRounds", error: `El máximo de rondas va de ${CUSTOM_ROUNDS_MIN} a ${CUSTOM_ROUNDS_MAX}.` };
      }
      return { ok: true, request: { typeMode, lengthMode: "custom", roundsLimit: rounds } };
    }
    case "custom-stats": {
      const goal = wholeNumber(form.statsGoal);
      if (goal === null || goal < CUSTOM_STATS_GOAL_MIN || goal > CUSTOM_STATS_GOAL_MAX) {
        return { ok: false, field: "statsGoal", error: `La meta de stats va de ${CUSTOM_STATS_GOAL_MIN} a ${CUSTOM_STATS_GOAL_MAX}.` };
      }
      return { ok: true, request: { typeMode, lengthMode: "custom", statsGoal: goal } };
    }
  }
}
```

`client/src/pages/Lobby.tsx`:

```tsx
import type { RoomConfig, TypeMode } from "@pokemon-minigames/shared";
import { type FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ApiError } from "../api/client";
import type { CurrentRoom } from "../api/endpoints";
import { Button } from "../components/Button";
import { Notice } from "../components/Notice";
import { TextField } from "../components/TextField";
import { errorMessage } from "../i18n/es";
import { useServices } from "../services";
import {
  type CreateRoomForm,
  DEFAULT_FORM,
  LENGTH_LABELS,
  type LengthKind,
  buildRequest,
  formFromConfig,
} from "./room-form";

const shownError = (error: unknown): string => (error instanceof ApiError ? error.message : errorMessage(undefined));

/** Si el usuario ya está en una partida (o dejó una sala abierta), ofrece volver a ella. */
function ResumeBanner() {
  const { endpoints } = useServices();
  const navigate = useNavigate();
  const [room, setRoom] = useState<CurrentRoom | null>(null);

  useEffect(() => {
    let active = true;
    endpoints.rooms.current().then(
      (current) => active && setRoom(current),
      () => {}, // No poder consultarlo no impide usar el lobby.
    );
    return () => {
      active = false;
    };
  }, [endpoints]);

  if (!room) return null;
  return (
    <Notice tone="success" className="flex flex-wrap items-center justify-between gap-2">
      <span>Tienes una partida en curso (sala {room.code}).</span>
      <Button variant="primary" onClick={() => navigate(`/sala/${room.code}`)}>
        Volver a tu partida
      </Button>
    </Notice>
  );
}

const TYPE_MODE_OPTIONS: { value: TypeMode; label: string; hint: string }[] = [
  { value: "random", label: "Aleatorio", hint: "El servidor sortea el par de tipos de cada ronda." },
  { value: "chosen", label: "Elegido", hint: "Cada jugador elige un tipo y juntos forman el par." },
];

function CreateRoomCard({ initial }: { initial?: RoomConfig }) {
  const { endpoints } = useServices();
  const navigate = useNavigate();
  const [form, setForm] = useState<CreateRoomForm>(initial ? formFromConfig(initial) : DEFAULT_FORM);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    const built = buildRequest(form);
    if (!built.ok) {
      setFieldError({ field: built.field, message: built.error });
      return;
    }
    setFieldError(null);
    setFormError(null);
    setSubmitting(true);
    try {
      const { code } = await endpoints.rooms.create(built.request);
      navigate(`/sala/${code}`);
    } catch (error) {
      setFormError(shownError(error));
      setSubmitting(false);
    }
  }

  return (
    <section className="framed rounded-card bg-surface p-4">
      <h2 className="mb-3 text-lg font-medium">Crear sala</h2>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {formError ? <Notice tone="danger">{formError}</Notice> : null}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Modo de tipos</legend>
          {TYPE_MODE_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="typeMode"
                value={option.value}
                checked={form.typeMode === option.value}
                onChange={() => setForm({ ...form, typeMode: option.value })}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{option.label}</span>
                <span className="block text-muted">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div>
          <label htmlFor="length" className="mb-1 block text-sm font-medium">
            Largo de la partida
          </label>
          <select
            id="length"
            value={form.lengthKind}
            onChange={(event) => {
              setForm({ ...form, lengthKind: event.target.value as LengthKind });
              setFieldError(null);
            }}
            className="framed w-full rounded-ui bg-surface px-3 py-2 text-fg"
          >
            {(Object.keys(LENGTH_LABELS) as LengthKind[]).map((kind) => (
              <option key={kind} value={kind}>
                {LENGTH_LABELS[kind]}
              </option>
            ))}
          </select>
        </div>

        {form.lengthKind === "custom-rounds" ? (
          <TextField
            label="Máximo de rondas"
            inputMode="numeric"
            value={form.customRounds}
            onChange={(event) => setForm({ ...form, customRounds: event.target.value })}
            error={fieldError?.field === "customRounds" ? fieldError.message : null}
            hint="Gana quien tenga más stats al terminar."
          />
        ) : null}
        {form.lengthKind === "custom-stats" ? (
          <TextField
            label="Meta de stats"
            inputMode="numeric"
            value={form.statsGoal}
            onChange={(event) => setForm({ ...form, statsGoal: event.target.value })}
            error={fieldError?.field === "statsGoal" ? fieldError.message : null}
            hint="La partida termina al final de la ronda en que alguien llegue a la meta."
          />
        ) : null}

        <Button type="submit" variant="primary" loading={submitting}>
          Crear sala
        </Button>
      </form>
    </section>
  );
}

function JoinRoomCard() {
  const { endpoints } = useServices();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    const clean = code.trim().toUpperCase();
    if (!clean) {
      setError("Escribe el código de la sala.");
      return;
    }
    setError(null);
    setFormError(null);
    setSubmitting(true);
    try {
      await endpoints.rooms.join(clean);
      navigate(`/sala/${clean}`);
    } catch (joinError) {
      setFormError(shownError(joinError));
      setSubmitting(false);
    }
  }

  return (
    <section className="framed rounded-card bg-surface p-4">
      <h2 className="mb-3 text-lg font-medium">Unirse a una sala</h2>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {formError ? <Notice tone="danger">{formError}</Notice> : null}
        <TextField
          label="Código de sala"
          value={code}
          maxLength={10}
          autoComplete="off"
          autoCapitalize="characters"
          onChange={(event) => {
            setCode(event.target.value);
            setError(null);
          }}
          error={error}
          hint="Te lo da quien creó la sala."
        />
        <Button type="submit" loading={submitting}>
          Unirse
        </Button>
      </form>
    </section>
  );
}

export function LobbyPage() {
  const state = useLocation().state as { config?: RoomConfig } | null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-medium">Lobby</h1>
      <ResumeBanner />
      <div className="grid gap-6 md:grid-cols-2">
        <CreateRoomCard initial={state?.config} />
        <JoinRoomCard />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w client -- test/pages/lobby.test.tsx
npm run typecheck -w client
```

Expected: PASS (32 pruebas) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): lobby para crear sala, unirse con código y volver a la partida" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: La sala (una vista por fase)

**Files:**
- Create: `client/src/pages/room/use-room.ts`, `LeaveButton.tsx`, `WaitingView.tsx`, `CountdownView.tsx`, `TypePickerView.tsx`, `RoundView.tsx`, `RoundResultView.tsx`, `SummaryView.tsx`, `RoomPage.tsx` (todos bajo `client/src/pages/room/`)
- Test: `client/test/pages/room.test.tsx`

**Interfaces:**
- `useRoom()` → `{ view, client, me, opponent }`.
- `RoomPage` (ruta `/sala/:code`): une al jugador a la sala (`client.join(code)`), libera el socket al salir (`dispose`), muestra la vista de la fase (`waiting` → sala de espera con el código y botón de copiar; `starting` → cuenta atrás hasta `startsAt`; `choosing_types` → 18 tipos; `round_active` → equipo propio, par de tipos, cronómetro, campo con autocompletado y panel del rival; `round_result` → resultado de cada jugador y cuenta atrás hasta `nextRoundAt` (o "Calculando el resultado final…" si es `null`); `finished` → resumen con ganador o empate, motivo, equipos completos y botones "Jugar de nuevo" y "Volver al lobby"), el aviso de rival desconectado con su cuenta atrás, los avisos de error (no bloqueantes), el estado de la conexión y, si la sala ya no existe (`ROOM_GONE_CODES`), un mensaje con la vuelta al lobby. Además: un `role="log"` persistente ("Anuncios de la partida") anuncia a los lectores de pantalla el inicio de la cuenta atrás, cada par de tipos y el resultado final; si el servidor cierra la conexión porque la partida se abrió en otra pestaña (`connection === "replaced"`) avisa y ofrece "Jugar aquí"; con la partida ya terminada, un error de sala inexistente no sustituye al resumen; la cuenta atrás del aviso de rival caído va con `aria-hidden` para que no se repita cada segundo. En el selector de tipo, tras tocar uno los demás se bloquean hasta la confirmación (si el servidor rechaza la elección, se puede elegir otro).
- Las vistas no tienen lógica de juego: leen `view` y llaman a `client.chooseType`, `client.submit` y `client.leave`.

- [ ] **Step 1: Escribir la prueba que falla**

`client/test/pages/room.test.tsx` (usa `FakeSocket`: se alimenta con eventos reales del servidor y se comprueba lo que se ve y lo que se envía):

```tsx
import type { ServerEvent } from "@pokemon-minigames/shared";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoomPage } from "../../src/pages/room/RoomPage";
import { SERVER_NOW, event, pokemon } from "../helpers/events";
import { type FakeServices, fakeServices, renderRoute } from "../helpers/services";

const ash = (extra: object = {}) => ({ seat: 1 as const, username: "ash", connected: true, totalStats: 0, teamSize: 0, ...extra });
const misty = (extra: object = {}) => ({ seat: 2 as const, username: "misty", connected: true, totalStats: 0, teamSize: 0, ...extra });
const roundState = (overrides: object = {}) => ({
  number: 1,
  pair: ["flying", "fire"] as ["flying", "fire"],
  deadline: SERVER_NOW + 15_000,
  answered: false,
  typeChosen: false,
  ...overrides,
});

function renderRoom(events: ServerEvent[] = [], services: FakeServices = fakeServices()) {
  for (const e of events) services.game.store.getState().receive(e, SERVER_NOW);
  const utils = renderRoute("/sala/:code", <RoomPage />, { services, route: "/sala/ABC234" });
  return { user: userEvent.setup(), ...utils };
}

/** Recibir un evento del servidor con la pantalla ya abierta. */
const serverSends = (services: FakeServices, e: ServerEvent) => act(() => services.game.store.getState().receive(e, SERVER_NOW));

afterEach(() => vi.useRealTimers());

describe("ciclo de vida de la sala", () => {
  it("al entrar se une a la sala de la URL y carga la lista de nombres", async () => {
    const { services } = renderRoom();
    expect(services.client.join).toHaveBeenCalledExactlyOnceWith("ABC234");
    await waitFor(() => expect(services.endpoints.catalog.names).toHaveBeenCalledTimes(1));
  });

  it("al salir de la pantalla cierra la conexión", () => {
    const { services, unmount } = renderRoom();
    expect(services.client.dispose).not.toHaveBeenCalled();
    unmount();
    expect(services.client.dispose).toHaveBeenCalledTimes(1);
  });

  it("mientras no llega el estado del servidor dice que está conectando", () => {
    renderRoom();
    expect(screen.getByRole("status")).toHaveTextContent("Conectando con la sala…");
  });
});

describe("sala de espera", () => {
  const alone = () => event.roomState({ phase: "waiting", players: [ash()] });

  it("muestra el código, quién está dentro y que espera al oponente", () => {
    renderRoom([alone()]);
    expect(screen.getByRole("heading", { name: "Sala de espera" })).toBeInTheDocument();
    expect(screen.getByLabelText("Código de la sala")).toHaveTextContent("ABC234");
    expect(screen.getByRole("list", { name: "Jugadores" })).toHaveTextContent("ash");
    expect(screen.getByText("Esperando a tu oponente…")).toBeInTheDocument();
  });

  it("cuando el oponente ya se unió lo dice", () => {
    renderRoom([event.roomState({ phase: "waiting", players: [ash(), misty({ connected: false })] })]);
    expect(screen.getByText("Tu oponente ya se unió. Esperando a que se conecte…")).toBeInTheDocument();
    expect(screen.getByText("(sin conectar)")).toBeInTheDocument();
  });

  it("copiar el código lo pone en el portapapeles y lo confirma", async () => {
    const { user } = renderRoom([alone()]);
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    await user.click(screen.getByRole("button", { name: "Copiar código" }));
    expect(writeText).toHaveBeenCalledWith("ABC234");
    expect(await screen.findByRole("button", { name: "Código copiado" })).toBeInTheDocument();
  });

  it("si el navegador no deja copiar, lo avisa sin romper nada", async () => {
    const { user } = renderRoom([alone()]);
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(new Error("denegado"));
    await user.click(screen.getByRole("button", { name: "Copiar código" }));
    expect(await screen.findByRole("button", { name: "No se pudo copiar" })).toBeInTheDocument();
  });

  it("cancelar la sala avisa al servidor y vuelve al lobby", async () => {
    const { services, user } = renderRoom([alone()]);
    await user.click(screen.getByRole("button", { name: "Cancelar sala" }));
    expect(services.client.leave).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("location")).toHaveTextContent("/");
  });

  it("si ya hay oponente el botón dice 'Salir de la sala'", () => {
    renderRoom([event.roomState({ phase: "waiting", players: [ash(), misty()] })]);
    expect(screen.getByRole("button", { name: "Salir de la sala" })).toBeInTheDocument();
  });
});

describe("cuenta atrás de inicio", () => {
  it("muestra contra quién se juega y un cronómetro hasta el inicio", () => {
    renderRoom([event.roomState({ phase: "starting", startsAt: SERVER_NOW + 5000 })]);
    expect(screen.getByRole("heading", { name: "Partida contra misty" })).toBeInTheDocument();
    expect(screen.getByRole("timer", { name: "Inicio de la partida" })).toBeInTheDocument();
  });

  it("el cronómetro cuenta los segundos que faltan según el reloj del servidor", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(SERVER_NOW + 2000); // el navegador va 2 s por delante de lo que dijo el servidor...
    const services = fakeServices();
    services.game.store.getState().receive(event.roomState({ phase: "starting", startsAt: SERVER_NOW + 5000 }), SERVER_NOW + 2000);
    renderRoute("/sala/:code", <RoomPage />, { services, route: "/sala/ABC234" });
    // ...así que el desfase se corrige y faltan 5 s, no 3.
    expect(screen.getByRole("timer")).toHaveTextContent("5");
  });
});

describe("elección de tipo (modo elegido)", () => {
  const choosing = (extra: object = {}) =>
    event.roomState({ phase: "choosing_types", config: { typeMode: "chosen", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null }, round: roundState({ pair: null, ...extra }) });

  it("muestra los 18 tipos en español", () => {
    renderRoom([choosing()]);
    const group = screen.getByRole("group", { name: "Tipos" });
    expect(within(group).getAllByRole("button")).toHaveLength(18);
    for (const label of ["fuego", "agua", "planta", "hada", "siniestro", "psíquico"]) {
      expect(within(group).getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("al tocar un tipo lo envía y lo deja marcado; al confirmarlo el servidor, bloquea los demás", async () => {
    const { services, user } = renderRoom([choosing()]);
    await user.click(screen.getByRole("button", { name: "fuego" }));
    expect(services.client.chooseType).toHaveBeenCalledExactlyOnceWith("fire");
    expect(screen.getByRole("button", { name: "fuego" })).toHaveAttribute("aria-pressed", "true");

    serverSends(services, event.typeReceived(1));
    expect(screen.getByRole("status")).toHaveTextContent("Elegiste fuego. Esperando a tu oponente…");
    for (const button of within(screen.getByRole("group", { name: "Tipos" })).getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });

  it("tocar otro tipo antes de la confirmación no envía una segunda elección (el servidor se quedaría con la primera)", async () => {
    const { services, user } = renderRoom([choosing()]);
    await user.click(screen.getByRole("button", { name: "fuego" }));
    await user.click(screen.getByRole("button", { name: "agua" }));
    expect(services.client.chooseType).toHaveBeenCalledExactlyOnceWith("fire");
    expect(screen.getByRole("button", { name: "agua" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "fuego" })).toHaveAttribute("aria-pressed", "true");
  });

  it("si el servidor rechaza la elección, se puede elegir otro tipo", async () => {
    const { services, user } = renderRoom([choosing()]);
    await user.click(screen.getByRole("button", { name: "fuego" }));
    serverSends(services, event.error("RATE_LIMITED"));
    expect(screen.getByRole("button", { name: "agua" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "agua" }));
    expect(services.client.chooseType).toHaveBeenLastCalledWith("water");
    expect(services.client.chooseType).toHaveBeenCalledTimes(2);
  });

  it("tras recargar (ya había elegido) no sabe cuál fue, pero bloquea y lo dice", () => {
    renderRoom([choosing({ typeChosen: true })]);
    expect(screen.getByRole("status")).toHaveTextContent("Ya elegiste tu tipo. Esperando a tu oponente…");
    expect(screen.getByRole("button", { name: "fuego" })).toBeDisabled();
  });
});

describe("ronda", () => {
  const playing = (extra: object = {}, stateExtra: object = {}) =>
    event.roomState({
      phase: "round_active",
      myTeam: [pokemon(1, 500)],
      players: [ash({ totalStats: 500, teamSize: 1 }), misty({ totalStats: 400, teamSize: 1 })],
      round: roundState({ number: 2, ...extra }),
      ...stateExtra,
    });

  it("muestra la ronda, el par de tipos, tu equipo y del rival solo el total", () => {
    renderRoom([playing()]);
    expect(screen.getByRole("heading", { name: "Ronda 2 de 3" })).toBeInTheDocument();
    const pair = screen.getByLabelText("Par de tipos");
    expect(pair).toHaveTextContent("volador");
    expect(pair).toHaveTextContent("fuego");
    expect(screen.getByRole("region", { name: "Tu equipo" })).toHaveTextContent("Poke1");
    const rival = screen.getByRole("region", { name: "Tu rival" });
    expect(rival).toHaveTextContent("misty");
    expect(rival).toHaveTextContent("400");
    expect(rival).toHaveTextContent("1 Pokémon");
    expect(rival).not.toHaveTextContent("Mon"); // ni nombres ni nada que identifique sus Pokémon
  });

  it("en una partida por meta de stats muestra la meta en vez del total de rondas", () => {
    renderRoom([playing({}, { config: { typeMode: "random", lengthMode: "custom", roundsLimit: null, statsGoal: 2500 } })]);
    expect(screen.getByRole("heading", { name: "Ronda 2 · meta de 2500 puntos" })).toBeInTheDocument();
  });

  it("la barra de marcador para pantallas estrechas muestra los dos totales", () => {
    renderRoom([playing()]);
    expect(screen.getByLabelText("Marcador")).toHaveTextContent("Tú 500 · misty 400");
  });

  it("escribir sugiere nombres y Enter envía la respuesta al servidor", async () => {
    const { services, user } = renderRoom([playing()]);
    await waitFor(() => expect(services.names.getState().status).toBe("ready"));
    await user.type(screen.getByRole("combobox"), "alf");
    expect(await screen.findAllByRole("option")).toHaveLength(2);
    await user.keyboard("{Escape}{Enter}");
    expect(services.client.submit).toHaveBeenCalledExactlyOnceWith("alf");
  });

  it("al empezar la ronda el campo de respuesta recibe el foco (quien usa teclado tiene solo 15 s)", () => {
    renderRoom([playing()]);
    expect(screen.getByRole("combobox")).toHaveFocus();
  });

  it("una respuesta ya enviada bloquea el campo hasta el resultado", async () => {
    const { services } = renderRoom([playing()]);
    expect(screen.getByRole("combobox")).toBeEnabled();
    serverSends(services, event.answerReceived(2));
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByText("Respuesta enviada. Esperando el resultado…")).toBeInTheDocument();
  });

  it("si el par fue reemplazado por el servidor, lo explica", () => {
    const services = fakeServices();
    renderRoom([event.roomState({ phase: "choosing_types", round: roundState({ pair: null }) }), event.roundStarted(1, SERVER_NOW + 15_000, { typesNotice: "pair_replaced" })], services);
    expect(screen.getByText("El par elegido no tenía suficientes Pokémon; el servidor sorteó otro.")).toBeInTheDocument();
  });

  it("sin aviso de par reemplazado no muestra nada de eso", () => {
    renderRoom([playing()]);
    expect(screen.queryByText(/sorteó otro/)).not.toBeInTheDocument();
  });

  it("el cronómetro muestra el tiempo de la ronda", () => {
    renderRoom([playing()]);
    expect(screen.getByRole("timer", { name: "Tiempo de la ronda" })).toBeInTheDocument();
  });

  describe("abandonar la partida", () => {
    it("pide confirmación antes de abandonar", async () => {
      const { services, user } = renderRoom([playing()]);
      await user.click(screen.getByRole("button", { name: "Abandonar partida" }));
      expect(services.client.leave).not.toHaveBeenCalled();
      expect(screen.getByText("Si abandonas, pierdes la partida.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Sí, abandonar" }));
      expect(services.client.leave).toHaveBeenCalledTimes(1);
    });

    it("se puede cambiar de idea", async () => {
      const { services, user } = renderRoom([playing()]);
      await user.click(screen.getByRole("button", { name: "Abandonar partida" }));
      await user.click(screen.getByRole("button", { name: "Seguir jugando" }));
      expect(screen.getByRole("button", { name: "Abandonar partida" })).toBeInTheDocument();
      expect(services.client.leave).not.toHaveBeenCalled();
    });
  });
});

describe("resultado de la ronda", () => {
  const afterRound = (mySeat: 1 | 2 = 1, result = event.roundResult()) => [
    event.roomState({ phase: "round_result", mySeat, roundsPlayed: 1, players: [ash(), misty()] }),
    result,
  ];

  it("muestra qué pasó con cada jugador y qué Pokémon ganó", () => {
    renderRoom(afterRound());
    expect(screen.getByRole("heading", { name: "Resultado de la ronda 1" })).toBeInTheDocument();
    const mine = screen.getByRole("region", { name: "Resultado de Tú" });
    expect(mine).toHaveTextContent("Acertó");
    expect(mine).toHaveTextContent("Poke1");
    const theirs = screen.getByRole("region", { name: "Resultado de misty" });
    expect(theirs).toHaveTextContent("Ese Pokémon no existe");
    expect(theirs).toHaveTextContent("Escribió: «zzz»");
  });

  it("desde el asiento 2, 'Tú' es el asiento 2", () => {
    renderRoom(afterRound(2));
    expect(screen.getByRole("region", { name: "Resultado de Tú" })).toHaveTextContent("Ese Pokémon no existe");
    expect(screen.getByRole("region", { name: "Resultado de ash" })).toHaveTextContent("Acertó");
  });

  it("cuenta atrás hasta la siguiente ronda con el reloj del servidor", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(SERVER_NOW);
    renderRoom(afterRound());
    expect(screen.getByText("Siguiente ronda en 6 s")).toBeInTheDocument();
  });

  it("si era la última ronda dice que calcula el resultado final", () => {
    renderRoom(afterRound(1, event.roundResult({ nextRoundAt: null })));
    expect(screen.getByText("Calculando el resultado final…")).toBeInTheDocument();
  });

  it("un resumen para lectores de pantalla anuncia el resultado sin depender de lo visual", () => {
    renderRoom(afterRound());
    const status = screen.getAllByRole("status").find((s) => s.className.includes("sr-only"))!;
    expect(status).toHaveTextContent("Ronda 1. Tú: Acertó, Poke1. misty: Ese Pokémon no existe.");
  });

  it("si se reconectó en la pausa y no hay resultado guardado, no se rompe", () => {
    renderRoom([event.roomState({ phase: "round_result", roundsPlayed: 1 })]);
    expect(screen.getByRole("status")).toHaveTextContent("Resultado de la ronda…");
  });
});

describe("resumen final", () => {
  const finished = (mySeat: 1 | 2, winnerSeat: 1 | 2 | null, reason: "completed" | "forfeit" | "disconnect" = "completed") => [
    event.roomState({ phase: "finished", mySeat, players: [ash(), misty()], config: { typeMode: "chosen", lengthMode: "custom", roundsLimit: null, statsGoal: 1800 } }),
    event.gameEnded({ winnerSeat, reason }),
  ];

  it("si ganaste lo dice, con el motivo, el marcador y los dos equipos completos", () => {
    renderRoom(finished(1, 1));
    expect(screen.getByRole("heading", { name: "Ganaste" })).toBeInTheDocument();
    expect(screen.getByText("La partida terminó")).toBeInTheDocument();
    expect(screen.getByText("800 – 400")).toBeInTheDocument();
    const mine = screen.getByRole("region", { name: "Equipo de Tú" });
    expect(within(mine).getByText("Poke1")).toBeInTheDocument();
    expect(within(mine).getByText("Poke2")).toBeInTheDocument();
    expect(within(mine).getAllByText("Velocidad").length).toBeGreaterThan(0); // con las stats
    expect(within(screen.getByRole("region", { name: "Equipo de misty" })).getByText("Poke3")).toBeInTheDocument();
  });

  it("si perdiste lo dice, y desde el asiento 2 el marcador se lee desde tu lado", () => {
    renderRoom(finished(2, 1));
    expect(screen.getByRole("heading", { name: "Perdiste" })).toBeInTheDocument();
    expect(screen.getByText("400 – 800")).toBeInTheDocument();
  });

  it("un empate no tiene ganador", () => {
    renderRoom(finished(1, null));
    expect(screen.getByRole("heading", { name: "Empate" })).toBeInTheDocument();
  });

  it("explica cuando el rival abandonó o se desconectó", () => {
    const { unmount } = renderRoom(finished(1, 1, "forfeit"));
    expect(screen.getByText("Un jugador abandonó la partida")).toBeInTheDocument();
    unmount();
    renderRoom(finished(1, 1, "disconnect"));
    expect(screen.getByText("Un jugador se desconectó")).toBeInTheDocument();
  });

  it("'Jugar de nuevo' vuelve al lobby con la misma configuración", async () => {
    const { user } = renderRoom(finished(1, 1));
    await user.click(screen.getByRole("button", { name: "Jugar de nuevo" }));
    const probe = screen.getByTestId("location");
    expect(probe).toHaveTextContent("/");
    expect(JSON.parse(probe.dataset.state!)).toEqual({ config: { typeMode: "chosen", lengthMode: "custom", roundsLimit: null, statsGoal: 1800 } });
  });

  it("'Volver al lobby' vuelve sin configuración previa", async () => {
    const { user } = renderRoom(finished(1, 1));
    await user.click(screen.getByRole("button", { name: "Volver al lobby" }));
    expect(screen.getByTestId("location").dataset.state).toBe("null");
  });

  it("anuncia el resultado final a los lectores de pantalla", () => {
    renderRoom(finished(1, 1));
    expect(screen.getByRole("log", { name: "Anuncios de la partida" })).toHaveTextContent("Ganaste. 800 – 400");
  });

  it("si la conexión vuelve a caerse y el servidor ya cerró la sala, el resumen se queda en pantalla", () => {
    const services = fakeServices();
    renderRoom(finished(1, 1), services);
    serverSends(services, event.error("ROOM_NOT_FOUND", "Esa sala no existe"));
    expect(screen.getByRole("heading", { name: "Ganaste" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/ya terminó/)).not.toBeInTheDocument();
  });

  it("no muestra el aviso de conexión perdida una vez terminada la partida", () => {
    const services = fakeServices();
    renderRoom(finished(1, 1), services);
    serverSends(services, event.roomState({ phase: "finished" })); // room-state no pisa el fin si se reconecta... el aviso depende de la conexión
    act(() => services.game.store.getState().setConnection("disconnected"));
    expect(screen.queryByText(/Reconectando/)).not.toBeInTheDocument();
  });
});

describe("anuncios para lectores de pantalla", () => {
  const announcer = () => screen.getByRole("log", { name: "Anuncios de la partida" });

  it("anuncia el par de tipos al empezar cada ronda", () => {
    renderRoom([event.roomState({ phase: "round_active", round: roundState({ number: 2 }), players: [ash(), misty()] })]);
    expect(announcer()).toHaveTextContent("Ronda 2: volador y fuego.");
  });

  it("anuncia que hay que elegir un tipo", () => {
    renderRoom([
      event.roomState({ phase: "choosing_types", config: { typeMode: "chosen", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null }, round: roundState({ pair: null }) }),
    ]);
    expect(announcer()).toHaveTextContent("Ronda 1: elige un tipo.");
  });

  it("anuncia el cambio de una fase a otra sin que el contenedor se vuelva a crear", () => {
    const services = fakeServices();
    renderRoom([event.roomState({ phase: "starting", startsAt: SERVER_NOW + 5000, players: [ash(), misty()] })], services);
    const region = announcer();
    expect(region).toHaveTextContent("La partida empieza.");
    serverSends(services, event.roundStarted(1, SERVER_NOW + 15_000));
    expect(announcer()).toBe(region);
    expect(region).toHaveTextContent("Ronda 1: volador y fuego.");
  });
});

describe("avisos de conexión y errores", () => {
  const inRound = () => event.roomState({ phase: "round_active", round: roundState(), players: [ash(), misty()] });

  it("si se pierde la conexión avisa de que está reconectando, y el aviso se va al volver", () => {
    const services = fakeServices();
    renderRoom([inRound()], services);
    expect(screen.queryByText(/Reconectando/)).not.toBeInTheDocument();
    act(() => services.game.store.getState().setConnection("disconnected"));
    expect(screen.getByText("Conexión perdida. Reconectando…")).toBeInTheDocument();
    act(() => services.game.store.getState().setConnection("connected"));
    expect(screen.queryByText(/Reconectando/)).not.toBeInTheDocument();
  });

  it("si la partida se abrió en otra pestaña, lo dice y permite volver a jugar aquí", async () => {
    const services = fakeServices();
    const { user } = renderRoom([inRound()], services);
    act(() => services.game.store.getState().setConnection("replaced"));
    expect(screen.getByText("Abriste esta partida en otra pestaña.")).toBeInTheDocument();
    expect(screen.queryByText(/Reconectando/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Jugar aquí" }));
    expect(services.client.join).toHaveBeenCalledTimes(2);
    expect(services.client.join).toHaveBeenLastCalledWith("ABC234");
  });

  it("la cuenta atrás del aviso del rival no se anuncia cada segundo a los lectores de pantalla", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(SERVER_NOW);
    renderRoom([inRound(), event.opponentDisconnected(SERVER_NOW + 30_000)]);
    expect(screen.getByText("misty se desconectó.")).toBeInTheDocument();
    expect(screen.getByText(/Tiene 30 s para volver/)).toHaveAttribute("aria-hidden", "true");
  });

  it("si el rival se cae muestra cuánto tiempo tiene para volver, y el aviso se va cuando vuelve", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(SERVER_NOW);
    const services = fakeServices();
    renderRoom([inRound(), event.opponentDisconnected(SERVER_NOW + 30_000)], services);
    expect(screen.getByRole("alert")).toHaveTextContent("misty se desconectó. Tiene 30 s para volver.");

    serverSends(services, event.opponentReconnected());
    expect(screen.queryByText(/se desconectó/)).not.toBeInTheDocument();
  });

  it("un error recuperable (p. ej. ir demasiado rápido) se muestra sin sacar al jugador de la partida", () => {
    const services = fakeServices();
    renderRoom([inRound(), event.error("RATE_LIMITED")], services);
    expect(screen.getByRole("alert")).toHaveTextContent("Vas muy rápido. Espera un momento.");
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it.each([
    ["ROOM_NOT_FOUND", "Esa sala no existe o ya terminó."],
    ["NOT_IN_ROOM", "No participas en esa sala."],
    ["ROOM_CLOSED", "Esa sala ya empezó o se cerró."],
  ] as const)("con %s la sala ya no sirve: lo explica y ofrece volver al lobby", async (code, message) => {
    const { services, user } = renderRoom();
    serverSends(services, event.error(code));
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByText("Conectando con la sala…")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Volver al lobby" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w client -- test/pages/room.test.tsx
```

Expected: FAIL — no existe `src/pages/room/RoomPage.tsx`.

- [ ] **Step 3: Implementar**

`client/src/pages/room/use-room.ts`:

```ts
import { useGame, useServices } from "../../services";

/** Lo que necesitan las vistas de la sala: el estado de la partida, quién soy y quién es el rival. */
export function useRoom() {
  const view = useGame((s) => s.view);
  const { game } = useServices();
  const me = view.players.find((p) => p.seat === view.mySeat) ?? null;
  const opponent = view.players.find((p) => p.seat !== view.mySeat) ?? null;
  return { view, client: game.client, me, opponent };
}
```

`client/src/pages/room/LeaveButton.tsx`:

```tsx
import { useState } from "react";
import { Button } from "../../components/Button";

/** Abandonar una partida en curso pide una segunda confirmación: hacerlo por error cuesta la partida. */
export function LeaveButton({ onLeave }: { onLeave(): void }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button variant="ghost" onClick={() => setConfirming(true)}>
        Abandonar partida
      </Button>
    );
  }
  return (
    <div role="group" aria-label="Confirmar abandono" className="flex flex-wrap items-center gap-2 text-sm">
      <span>Si abandonas, pierdes la partida.</span>
      <Button variant="primary" onClick={onLeave}>
        Sí, abandonar
      </Button>
      <Button variant="ghost" onClick={() => setConfirming(false)}>
        Seguir jugando
      </Button>
    </div>
  );
}
```

`client/src/pages/room/WaitingView.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { useRoom } from "./use-room";

/** Copia el código de la sala al portapapeles; si el navegador no lo permite, lo dice. */
function CopyCodeButton({ code }: { code: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <Button onClick={() => void copy()}>
      {state === "copied" ? "Código copiado" : state === "failed" ? "No se pudo copiar" : "Copiar código"}
    </Button>
  );
}

export function WaitingView() {
  const { view, client, opponent } = useRoom();
  const navigate = useNavigate();
  const code = view.code ?? "";

  return (
    <section className="framed mx-auto max-w-md rounded-card bg-surface p-6 text-center">
      <h1 className="text-xl font-medium">Sala de espera</h1>
      <p className="mt-3 text-sm text-muted">Comparte este código con tu oponente:</p>
      <p aria-label="Código de la sala" className="my-2 font-num text-4xl font-medium tracking-widest">
        {code}
      </p>
      <CopyCodeButton code={code} />

      <ul className="mt-5 flex flex-col gap-1 text-sm" aria-label="Jugadores">
        {view.players.map((player) => (
          <li key={player.seat}>
            {player.username} {player.connected ? "" : <span className="text-muted">(sin conectar)</span>}
          </li>
        ))}
      </ul>
      <p role="status" className="mt-4 text-sm text-muted">
        {opponent ? "Tu oponente ya se unió. Esperando a que se conecte…" : "Esperando a tu oponente…"}
      </p>

      <div className="mt-5">
        <Button
          variant="ghost"
          onClick={() => {
            client.leave();
            navigate("/");
          }}
        >
          {opponent ? "Salir de la sala" : "Cancelar sala"}
        </Button>
      </div>
    </section>
  );
}
```

`client/src/pages/room/CountdownView.tsx`:

```tsx
import { Timer } from "../../components/Timer";
import { START_COUNTDOWN_MS } from "../../game/durations";
import { useRoom } from "./use-room";

export function CountdownView() {
  const { view, opponent } = useRoom();

  return (
    <section className="framed mx-auto max-w-md rounded-card bg-surface p-6 text-center">
      <h1 className="text-xl font-medium">{opponent ? `Partida contra ${opponent.username}` : "Preparando la partida"}</h1>
      <p className="mt-2 text-sm text-muted">La partida empieza en…</p>
      <div className="mt-3">
        <Timer deadline={view.startsAt} offset={view.clockOffset} totalMs={START_COUNTDOWN_MS} label="Inicio de la partida" />
      </div>
    </section>
  );
}
```

`client/src/pages/room/TypePickerView.tsx`:

```tsx
import { TYPE_NAMES, type TypeName } from "@pokemon-minigames/shared";
import { useState } from "react";
import { Timer } from "../../components/Timer";
import { TYPE_CHOICE_MS } from "../../game/durations";
import { TYPE_LABELS } from "../../i18n/es";
import { TYPE_STYLES } from "../../theme/type-styles";
import { LeaveButton } from "./LeaveButton";
import { useRoom } from "./use-room";

/** Modo elegido: cada jugador toca un tipo; con los dos se forma el par de la ronda. */
export function TypePickerView() {
  const { view, client } = useRoom();
  const [chosen, setChosen] = useState<TypeName | null>(null);
  const round = view.round;
  const locked = round?.typeChosen ?? false;
  // Tras tocar un tipo no se puede cambiar mientras llega la confirmación: el servidor se queda con la primera
  // elección. Si lo rechaza (hay un error a la vista), se puede volver a elegir.
  const waiting = chosen !== null && !view.lastError;

  return (
    <section className="flex flex-col gap-4">
      <div className="text-center">
        <h1 className="text-xl font-medium">Elige un tipo</h1>
        <p className="mt-1 text-sm text-muted">Tú y tu rival eligen uno; con los dos se forma el par de la ronda {round?.number}.</p>
      </div>
      <Timer deadline={round?.deadline ?? null} offset={view.clockOffset} totalMs={TYPE_CHOICE_MS} label="Tiempo para elegir" />

      <div role="group" aria-label="Tipos" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {TYPE_NAMES.map((type) => (
          <button
            key={type}
            type="button"
            disabled={locked || waiting}
            aria-pressed={chosen === type}
            onClick={() => {
              setChosen(type);
              client.chooseType(type);
            }}
            style={TYPE_STYLES[type]}
            className={`rounded-ui px-2 py-3 text-sm font-medium transition-opacity disabled:cursor-not-allowed ${
              locked && chosen !== type ? "opacity-40" : ""
            } ${chosen === type ? "outline-4 outline-offset-2 outline-fg" : ""}`}
          >
            {TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      <p role="status" className="text-center text-sm text-muted">
        {locked
          ? chosen
            ? `Elegiste ${TYPE_LABELS[chosen]}. Esperando a tu oponente…`
            : "Ya elegiste tu tipo. Esperando a tu oponente…"
          : "Toca el tipo que quieras."}
      </p>
      <div className="text-center">
        <LeaveButton onLeave={() => client.leave()} />
      </div>
    </section>
  );
}
```

`client/src/pages/room/RoundView.tsx`:

```tsx
import { Autocomplete } from "../../components/Autocomplete";
import { Notice } from "../../components/Notice";
import { OpponentPanel, TeamPanel } from "../../components/Panels";
import { Timer } from "../../components/Timer";
import { TypeChip } from "../../components/TypeChip";
import { ROUND_MS } from "../../game/durations";
import { useNames } from "../../services";
import { LeaveButton } from "./LeaveButton";
import { useRoom } from "./use-room";

/** La pantalla central: tu equipo, el par de tipos con su cronómetro y el rival. */
export function RoundView() {
  const { view, client, me, opponent } = useRoom();
  const names = useNames((s) => s.names);
  const round = view.round;
  if (!round || !round.pair) return null;

  const config = view.config;
  const goal =
    config?.roundsLimit != null
      ? `Ronda ${round.number} de ${config.roundsLimit}`
      : `Ronda ${round.number} · meta de ${config?.statsGoal} puntos`;

  return (
    <section className="flex flex-col gap-4">
      {/* En pantallas estrechas los paneles de equipo se resumen en una sola barra. */}
      <p className="framed rounded-card bg-surface px-3 py-2 text-center text-sm md:hidden" aria-label="Marcador">
        Tú <span className="font-num font-medium tabular-nums">{me?.totalStats ?? 0}</span> ·{" "}
        {opponent?.username ?? "Rival"} <span className="font-num font-medium tabular-nums">{opponent?.totalStats ?? 0}</span>
      </p>

      <div className="grid gap-4 md:grid-cols-[1fr_1.6fr_1fr]">
        <div className="hidden md:block">
          <TeamPanel team={view.myTeam} total={me?.totalStats ?? 0} />
        </div>

        <div className="framed flex flex-col gap-4 rounded-card bg-surface p-4">
          <div className="text-center">
            <h1 className="text-sm text-muted">{goal}</h1>
            <div className="mt-2 flex flex-wrap justify-center gap-2" aria-label="Par de tipos">
              <TypeChip type={round.pair[0]} className="text-base" />
              <TypeChip type={round.pair[1]} className="text-base" />
            </div>
            <p className="mt-2 text-sm">Nombra un Pokémon que tenga los dos tipos.</p>
          </div>

          <Timer deadline={round.deadline} offset={view.clockOffset} totalMs={ROUND_MS} label="Tiempo de la ronda" />

          {round.typesNotice === "pair_replaced" ? (
            <Notice>El par elegido no tenía suficientes Pokémon; el servidor sorteó otro.</Notice>
          ) : null}

          <Autocomplete names={names} submitted={round.answered} autoFocus onSubmit={(text) => client.submit(text)} />
        </div>

        <div className="hidden md:block">
          <OpponentPanel
            name={opponent?.username ?? "Tu rival"}
            total={opponent?.totalStats ?? 0}
            teamSize={opponent?.teamSize ?? 0}
            connected={opponent?.connected ?? true}
          />
        </div>
      </div>

      <div className="text-center">
        <LeaveButton onLeave={() => client.leave()} />
      </div>
    </section>
  );
}
```

`client/src/pages/room/RoundResultView.tsx`:

```tsx
import type { RoundPlayerResult, Seat } from "@pokemon-minigames/shared";
import { PokemonCard } from "../../components/PokemonCard";
import { TypeChip } from "../../components/TypeChip";
import { secondsLeft, useCountdown } from "../../game/clock";
import { PICK_RESULT_LABELS } from "../../i18n/es";
import { useRoom } from "./use-room";

function ResultCard({ title, result }: { title: string; result: RoundPlayerResult }) {
  const won = result.result === "VALID";
  return (
    <section aria-label={`Resultado de ${title}`} className="framed rounded-card bg-surface p-4">
      <h2 className="text-sm text-muted">{title}</h2>
      <p className={`mt-1 font-medium ${won ? "text-success" : "text-danger"}`}>{PICK_RESULT_LABELS[result.result]}</p>
      {result.text ? <p className="mt-1 text-sm text-muted">Escribió: «{result.text}»</p> : null}
      <div className="mt-3">{result.pokemon ? <PokemonCard pokemon={result.pokemon} /> : null}</div>
      <p className="mt-3 text-sm">
        Total: <span className="font-num font-medium tabular-nums">{result.totalStats}</span> · {result.teamSize} Pokémon
      </p>
    </section>
  );
}

export function RoundResultView() {
  const { view, opponent } = useRoom();
  const result = view.lastResult;
  const untilNext = useCountdown(result?.nextRoundAt ?? null, view.clockOffset);

  if (!result || view.mySeat === null) {
    return (
      <p role="status" className="text-center text-muted">
        Resultado de la ronda…
      </p>
    );
  }

  const mine = result.results[view.mySeat];
  const rivalSeat: Seat = view.mySeat === 1 ? 2 : 1;
  const theirs = result.results[rivalSeat];

  return (
    <section className="flex flex-col gap-4">
      <div className="text-center">
        <h1 className="text-xl font-medium">Resultado de la ronda {result.round}</h1>
        <div className="mt-2 flex justify-center gap-2" aria-label="Par de tipos">
          <TypeChip type={result.type1} />
          <TypeChip type={result.type2} />
        </div>
      </div>

      {/* Un resumen breve para lectores de pantalla; lo visual es el detalle de cada tarjeta. */}
      <p role="status" className="sr-only">
        Ronda {result.round}. Tú: {PICK_RESULT_LABELS[mine.result]}
        {mine.pokemon ? `, ${mine.pokemon.names.es}` : ""}. {opponent?.username ?? "Rival"}: {PICK_RESULT_LABELS[theirs.result]}
        {theirs.pokemon ? `, ${theirs.pokemon.names.es}` : ""}.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <ResultCard title="Tú" result={mine} />
        <ResultCard title={opponent?.username ?? "Tu rival"} result={theirs} />
      </div>

      <p className="text-center text-sm text-muted">
        {result.nextRoundAt === null
          ? "Calculando el resultado final…"
          : `Siguiente ronda en ${secondsLeft(untilNext)} s`}
      </p>
    </section>
  );
}
```

`client/src/pages/room/SummaryView.tsx`:

```tsx
import type { GameEndedPayload, PokemonView, Seat } from "@pokemon-minigames/shared";
import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { PokemonCard } from "../../components/PokemonCard";
import { END_REASON_LABELS } from "../../i18n/es";
import { useRoom } from "./use-room";

function TeamColumn({ title, team, total }: { title: string; team: PokemonView[]; total: number }) {
  return (
    <section aria-label={`Equipo de ${title}`} className="flex flex-col gap-2">
      <h2 className="text-sm text-muted">{title}</h2>
      <p className="font-num text-2xl font-medium tabular-nums">{total}</p>
      {team.length === 0 ? <p className="text-sm text-muted">No ganó ningún Pokémon.</p> : null}
      {team.map((pokemon) => (
        <PokemonCard key={pokemon.id} pokemon={pokemon} showStats />
      ))}
    </section>
  );
}

/** "Ganaste", "Perdiste" o "Empate", según el asiento propio. */
export function verdictLabel(ended: GameEndedPayload, mySeat: Seat): string {
  return ended.winnerSeat === null ? "Empate" : ended.winnerSeat === mySeat ? "Ganaste" : "Perdiste";
}

/** El marcador final leído desde el lado propio: "800 – 400". */
export function scoreLabel(ended: GameEndedPayload, mySeat: Seat): string {
  return `${ended.totals[mySeat]} – ${ended.totals[mySeat === 1 ? 2 : 1]}`;
}

export function SummaryView() {
  const { view, opponent } = useRoom();
  const navigate = useNavigate();
  const ended = view.ended;
  if (!ended || view.mySeat === null) return null;

  const mySeat = view.mySeat;
  const rivalSeat: Seat = mySeat === 1 ? 2 : 1;
  const verdict = verdictLabel(ended, mySeat);

  return (
    <section className="flex flex-col gap-5">
      <div className="framed rounded-card bg-surface p-5 text-center">
        <h1 className="text-2xl font-medium">{verdict}</h1>
        <p className="mt-1 text-sm text-muted">{END_REASON_LABELS[ended.reason]}</p>
        <p className="mt-2 font-num text-lg tabular-nums">
          {scoreLabel(ended, mySeat)}
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <TeamColumn title="Tú" team={ended.teams[mySeat]} total={ended.totals[mySeat]} />
        <TeamColumn title={opponent?.username ?? "Tu rival"} team={ended.teams[rivalSeat]} total={ended.totals[rivalSeat]} />
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="primary" onClick={() => navigate("/", { state: { config: view.config } })}>
          Jugar de nuevo
        </Button>
        <Button onClick={() => navigate("/")}>Volver al lobby</Button>
      </div>
    </section>
  );
}
```

`client/src/pages/room/RoomPage.tsx`:

```tsx
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "../../components/Button";
import { Notice } from "../../components/Notice";
import { secondsLeft, useCountdown } from "../../game/clock";
import type { GameView } from "../../game/apply-event";
import { ROOM_GONE_CODES, TYPE_LABELS, errorMessage } from "../../i18n/es";
import { useGame, useServices } from "../../services";
import { CountdownView } from "./CountdownView";
import { RoundResultView } from "./RoundResultView";
import { RoundView } from "./RoundView";
import { SummaryView, scoreLabel, verdictLabel } from "./SummaryView";
import { TypePickerView } from "./TypePickerView";
import { WaitingView } from "./WaitingView";
import { useRoom } from "./use-room";

/** Avisa de que el rival se cayó y cuánto tiempo tiene para volver antes de perder la partida. */
function OpponentAwayNotice() {
  const { view, opponent } = useRoom();
  const remaining = useCountdown(view.opponentGraceEndsAt, view.clockOffset);
  if (view.opponentGraceEndsAt === null || view.phase === "finished") return null;
  return (
    // Lo que cambia cada segundo (la cuenta atrás) va oculto para los lectores de pantalla: si no, repetirían el aviso.
    <Notice tone="danger" urgent>
      <span>{opponent?.username ?? "Tu oponente"} se desconectó.</span>{" "}
      <span aria-hidden="true">Tiene {secondsLeft(remaining)} s para volver.</span>
    </Notice>
  );
}

/** Lo que se anuncia a los lectores de pantalla al cambiar de fase (lo visual cambia, pero no se oye). */
function announcement(view: GameView): string {
  switch (view.phase) {
    case "starting":
      return "La partida empieza.";
    case "choosing_types":
      return `Ronda ${view.round?.number ?? ""}: elige un tipo.`;
    case "round_active":
      return view.round?.pair
        ? `Ronda ${view.round.number}: ${TYPE_LABELS[view.round.pair[0]]} y ${TYPE_LABELS[view.round.pair[1]]}.`
        : "";
    case "finished":
      return view.ended && view.mySeat !== null ? `${verdictLabel(view.ended, view.mySeat)}. ${scoreLabel(view.ended, view.mySeat)}` : "";
    default:
      return "";
  }
}

function RoomView() {
  const { view } = useRoom();
  switch (view.phase) {
    case "waiting":
      return <WaitingView />;
    case "starting":
      return <CountdownView />;
    case "choosing_types":
      return <TypePickerView />;
    case "round_active":
      return <RoundView />;
    case "round_result":
      return <RoundResultView />;
    case "finished":
      return <SummaryView />;
    default:
      return (
        <p role="status" className="text-center text-muted">
          Conectando con la sala…
        </p>
      );
  }
}

export function RoomPage() {
  const { code = "" } = useParams();
  const { game, names } = useServices();
  const navigate = useNavigate();
  const error = useGame((s) => s.view.lastError);
  const connection = useGame((s) => s.connection);
  const phase = useGame((s) => s.view.phase);
  const ended = useGame((s) => s.view.ended);
  const view = useGame((s) => s.view);

  useEffect(() => {
    game.client.join(code);
    void names.getState().load();
    // Al salir de la pantalla se cierra la conexión (y se limpia el estado).
    return () => game.client.dispose();
  }, [game.client, names, code]);

  // La sala ya no existe, terminó o no eres parte de ella: no hay nada más que hacer aquí.
  // Con la partida terminada el resumen se queda: el servidor ya cerró la sala y es lo esperable.
  const gone = error !== null && ROOM_GONE_CODES.includes(error.code);
  if (error && gone && !ended) {
    return (
      <section className="mx-auto max-w-md text-center">
        <Notice tone="danger">{errorMessage(error.code)}</Notice>
        <div className="mt-4">
          <Button variant="primary" onClick={() => navigate("/")}>
            Volver al lobby
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p role="log" aria-label="Anuncios de la partida" className="sr-only">
        {announcement(view)}
      </p>
      {connection === "disconnected" && phase !== "finished" ? <Notice>Conexión perdida. Reconectando…</Notice> : null}
      {connection === "replaced" && phase !== "finished" ? (
        <Notice className="flex flex-wrap items-center justify-between gap-2">
          <span>Abriste esta partida en otra pestaña.</span>
          <Button variant="primary" onClick={() => game.client.join(code)}>
            Jugar aquí
          </Button>
        </Notice>
      ) : null}
      <OpponentAwayNotice />
      {error && !gone ? <Notice tone="danger">{errorMessage(error.code)}</Notice> : null}
      <RoomView />
    </div>
  );
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w client -- test/pages/room.test.tsx
npm run typecheck -w client
```

Expected: PASS (53 pruebas) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): sala de juego con una vista por fase y recuperación tras reconectar" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Autenticación, rutas con guardas y arranque de la aplicación

**Files:**
- Create: `client/src/pages/auth-validation.ts`, `client/src/pages/AuthForm.tsx`, `client/src/pages/AuthPages.tsx`, `client/src/routes.tsx`, `client/src/App.tsx`, `client/src/main.tsx`
- Test: `client/test/pages/auth.test.tsx`, `client/test/pages/routes.test.tsx`

**Interfaces:**
- `validateLogin`, `validateRegistration` (las mismas reglas del servidor: email válido, usuario de 3 a 30 caracteres `A-Za-z0-9_`, contraseña de 8 a 72 **bytes**), `serverFieldErrors(error)` (traduce los `details` de validación del servidor a errores por campo), `AuthForm`, `LoginPage`, `RegisterPage` (muestran los errores del servidor en español; tras entrar vuelven a donde se iba).
- `AppRoutes`: `/login` y `/registro` (solo sin sesión), `/` y `/sala/:code` (exigen sesión, con pantalla "Cargando…" mientras se recupera), cualquier otra ruta → `/`. `App` arma `ServicesProvider`, el encabezado y las rutas, y llama a `session.bootstrap()` al montar; `main.tsx` crea los servicios reales y monta React en modo estricto.

- [ ] **Step 1: Escribir las pruebas que fallan**

`client/test/pages/auth.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/client";
import { LoginPage, RegisterPage } from "../../src/pages/AuthPages";
import { serverFieldErrors, validateLogin, validateRegistration } from "../../src/pages/auth-validation";
import { ASH, fakeServices, renderRoute } from "../helpers/services";

describe("validación de los formularios", () => {
  it("login exige un email válido y una contraseña", () => {
    expect(validateLogin({ email: "ash@example.com", password: "x" })).toEqual({});
    expect(validateLogin({ email: "ash", password: "" })).toEqual({
      email: "Escribe un email válido.",
      password: "Escribe tu contraseña.",
    });
    expect(validateLogin({ email: "a b@example.com", password: "x" }).email).toBeDefined();
  });

  it("el registro acepta datos válidos", () => {
    expect(validateRegistration({ email: "ash@example.com", username: "ash_01", password: "pikachu-123" })).toEqual({});
  });

  it.each([
    ["usuario muy corto", { username: "ab" }, "username"],
    ["usuario muy largo", { username: "a".repeat(31) }, "username"],
    ["usuario con espacios", { username: "ash ketchum" }, "username"],
    ["usuario con signos", { username: "ash<3" }, "username"],
    ["contraseña corta", { password: "1234567" }, "password"],
    ["email sin dominio", { email: "ash@example" }, "email"],
  ])("rechaza %s", (_name, override, field) => {
    const errors = validateRegistration({ email: "ash@example.com", username: "ash", password: "pikachu-123", ...override });
    expect(errors[field as "email" | "username" | "password"]).toBeDefined();
  });

  it("rechaza una contraseña de más de 72 bytes aunque tenga menos de 72 caracteres", () => {
    const password = "ñ".repeat(37); // 37 caracteres, 74 bytes
    const errors = validateRegistration({ email: "ash@example.com", username: "ash", password });
    expect(errors.password).toContain("72 bytes");
    expect(validateRegistration({ email: "ash@example.com", username: "ash", password: "ñ".repeat(36) }).password).toBeUndefined();
  });

  it("serverFieldErrors toma los errores por campo de un 400 del servidor", () => {
    const error = new ApiError(400, "VALIDATION_ERROR", [
      { path: "email", message: "Email inválido" },
      { path: "password", message: "Muy corta" },
      { path: "algo", message: "ignorado" },
    ]);
    expect(serverFieldErrors(error)).toEqual({ email: "Email inválido", password: "Muy corta" });
  });

  it("serverFieldErrors no hace nada con otros errores", () => {
    expect(serverFieldErrors(new ApiError(409, "EMAIL_TAKEN"))).toEqual({});
    expect(serverFieldErrors(new ApiError(400, "VALIDATION_ERROR"))).toEqual({});
  });
});

function renderLogin(options: { route?: string | { pathname: string; state?: unknown } } = {}) {
  const services = fakeServices();
  const utils = renderRoute("/login", <LoginPage />, { services, route: options.route ?? "/login" });
  return { user: userEvent.setup(), ...utils };
}

describe("página de inicio de sesión", () => {
  it("muestra el formulario con sus campos etiquetados y un enlace al registro", () => {
    renderLogin();
    expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("type", "password");
    expect(screen.getByRole("link", { name: "Crea una" })).toHaveAttribute("href", "/registro");
  });

  it("con datos inválidos muestra los errores y no llama al servidor", async () => {
    const { services, user } = renderLogin();
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(screen.getAllByRole("alert").map((a) => a.textContent)).toEqual(["Escribe un email válido.", "Escribe tu contraseña."]);
    expect(services.endpoints.auth.login).not.toHaveBeenCalled();
  });

  it("los errores de un campo desaparecen al corregirlo", async () => {
    const { user } = renderLogin();
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    await user.type(screen.getByLabelText("Email"), "a");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("inicia sesión con el email recortado y va al lobby", async () => {
    const { services, user } = renderLogin();
    await user.type(screen.getByLabelText("Email"), "  ash@example.com ");
    await user.type(screen.getByLabelText("Contraseña"), "pikachu-123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/"));
    expect(services.endpoints.auth.login).toHaveBeenCalledWith({ email: "ash@example.com", password: "pikachu-123" });
    expect(services.session.getState()).toMatchObject({ status: "authenticated", user: ASH });
    expect(screen.getByText("Otra pantalla")).toBeInTheDocument();
  });

  it("vuelve a la pantalla que se intentaba abrir antes de pedir el inicio de sesión", async () => {
    const { user } = renderLogin({ route: { pathname: "/login", state: { from: { pathname: "/sala/ABC234" } } } });
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "pikachu-123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/sala/ABC234"));
  });

  it("si el servidor rechaza las credenciales lo muestra en español y se puede reintentar", async () => {
    const { services, user } = renderLogin();
    vi.mocked(services.endpoints.auth.login).mockRejectedValueOnce(new ApiError(401, "INVALID_CREDENTIALS"));
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "mala");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Email o contraseña incorrectos.");
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
    expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
  });

  it("mientras envía no permite enviar dos veces", async () => {
    const { services, user } = renderLogin();
    let release!: () => void;
    vi.mocked(services.endpoints.auth.login).mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve({ user: ASH, accessToken: "t" }))),
    );
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "pikachu-123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(screen.getByRole("button", { name: "Entrar" })).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(services.endpoints.auth.login).toHaveBeenCalledTimes(1);
    release();
  });

  it("un fallo de red se explica sin mostrar nada técnico", async () => {
    const { services, user } = renderLogin();
    vi.mocked(services.endpoints.auth.login).mockRejectedValueOnce(new ApiError(0, "NETWORK"));
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "pikachu-123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo conectar con el servidor");
  });

  it("un error inesperado (no de la API) muestra un mensaje genérico", async () => {
    const { services, user } = renderLogin();
    vi.mocked(services.endpoints.auth.login).mockRejectedValueOnce(new Error("boom interno"));
    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "pikachu-123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Algo falló en el servidor");
    expect(alert).not.toHaveTextContent("boom");
  });
});

function renderRegister() {
  const services = fakeServices();
  const utils = renderRoute("/registro", <RegisterPage />, { services, route: "/registro" });
  return { user: userEvent.setup(), ...utils };
}

async function fillRegistration(user: ReturnType<typeof userEvent.setup>, values = { email: "ash@example.com", username: "ash", password: "pikachu-123" }) {
  await user.type(screen.getByLabelText("Email"), values.email);
  await user.type(screen.getByLabelText("Nombre de usuario"), values.username);
  await user.type(screen.getByLabelText("Contraseña"), values.password);
  await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
}

describe("página de registro", () => {
  it("pide email, usuario y contraseña, con ayudas y un enlace al inicio de sesión", () => {
    renderRegister();
    expect(screen.getByLabelText("Nombre de usuario")).toHaveAccessibleDescription("De 3 a 30 letras, números o guion bajo.");
    expect(screen.getByLabelText("Contraseña")).toHaveAccessibleDescription("Mínimo 8 caracteres.");
    expect(screen.getByRole("link", { name: "Inicia sesión" })).toHaveAttribute("href", "/login");
  });

  it("con datos inválidos marca cada campo y no llama al servidor", async () => {
    const { services, user } = renderRegister();
    await fillRegistration(user, { email: "ash", username: "a", password: "123" });
    expect(screen.getAllByRole("alert")).toHaveLength(3);
    expect(services.endpoints.auth.register).not.toHaveBeenCalled();
  });

  it("crea la cuenta y va al lobby", async () => {
    const { services, user } = renderRegister();
    await fillRegistration(user);
    await waitFor(() => expect(services.endpoints.auth.register).toHaveBeenCalledWith({ email: "ash@example.com", username: "ash", password: "pikachu-123" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/"));
    expect(services.session.getState().status).toBe("authenticated");
  });

  it("un email ya registrado se explica en español", async () => {
    const { services, user } = renderRegister();
    vi.mocked(services.endpoints.auth.register).mockRejectedValueOnce(new ApiError(409, "EMAIL_TAKEN"));
    await fillRegistration(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Ese email ya está registrado.");
  });

  it("un usuario ya en uso se explica en español", async () => {
    const { services, user } = renderRegister();
    vi.mocked(services.endpoints.auth.register).mockRejectedValueOnce(new ApiError(409, "USERNAME_TAKEN"));
    await fillRegistration(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Ese nombre de usuario ya está en uso.");
  });

  it("los errores por campo que devuelve el servidor se ponen junto a cada campo", async () => {
    const { services, user } = renderRegister();
    vi.mocked(services.endpoints.auth.register).mockRejectedValueOnce(
      new ApiError(400, "VALIDATION_ERROR", [{ path: "username", message: "Usa de 3 a 30 letras, números o guion bajo." }]),
    );
    await fillRegistration(user);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Usa de 3 a 30 letras");
    expect(screen.getByLabelText("Nombre de usuario")).toHaveAttribute("aria-invalid", "true");
  });
});
```

`client/test/pages/routes.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppRoutes } from "../../src/routes";
import { LocationProbe, fakeServices, renderWithServices, signIn } from "../helpers/services";

function renderApp(route: string, prepare?: (services: ReturnType<typeof fakeServices>) => void) {
  const services = fakeServices();
  prepare?.(services);
  const utils = renderWithServices(
    <>
      <AppRoutes />
      <LocationProbe />
    </>,
    { services, route },
  );
  return utils;
}

describe("guardas de ruta", () => {
  it("mientras se recupera la sesión muestra una pantalla de carga, no el formulario", () => {
    renderApp("/");
    expect(screen.getByRole("status")).toHaveTextContent("Cargando…");
    expect(screen.queryByRole("heading", { name: "Iniciar sesión" })).not.toBeInTheDocument();
  });

  it("sin sesión, el lobby lleva a /login", async () => {
    const { services } = renderApp("/");
    services.session.setState({ status: "anonymous" });
    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
  });

  it("sin sesión, una sala también lleva a /login y tras entrar se vuelve a ella", async () => {
    const { services } = renderApp("/sala/ABC234");
    services.session.setState({ status: "anonymous" });
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Iniciar sesión" });

    await user.type(screen.getByLabelText("Email"), "ash@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "pikachu-123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/sala/ABC234"));
  });

  it("con sesión, /login y /registro llevan al lobby", async () => {
    renderApp("/login", (services) => signIn(services));
    expect(await screen.findByRole("heading", { name: "Lobby" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/");
  });

  it("con sesión se ve el lobby", () => {
    renderApp("/", (services) => signIn(services));
    expect(screen.getByRole("heading", { name: "Lobby" })).toBeInTheDocument();
  });

  it("una ruta desconocida lleva al lobby (y de ahí a /login si no hay sesión)", async () => {
    const { services } = renderApp("/no-existe", (s) => signIn(s));
    expect(await screen.findByRole("heading", { name: "Lobby" })).toBeInTheDocument();
    services.session.getState().expire();
    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
  });

  it("si la sesión caduca mientras se está en el lobby, lleva a /login", async () => {
    const { services } = renderApp("/", (s) => signIn(s));
    expect(screen.getByRole("heading", { name: "Lobby" })).toBeInTheDocument();
    services.session.getState().expire();
    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w client -- test/pages/auth.test.tsx test/pages/routes.test.tsx
```

Expected: FAIL — no existen `src/pages/AuthPages.tsx` ni `src/routes.tsx`.

- [ ] **Step 3: Implementar**

`client/src/pages/auth-validation.ts`:

```ts
import type { ApiError } from "../api/client";

export interface FieldErrors {
  email?: string;
  username?: string;
  password?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME = /^[A-Za-z0-9_]{3,30}$/;
const MAX_PASSWORD_BYTES = 72;

function emailError(email: string): string | undefined {
  return EMAIL.test(email.trim()) ? undefined : "Escribe un email válido.";
}

/** Las mismas reglas que aplica el servidor, para avisar antes de enviar. */
export function validateLogin(input: { email: string; password: string }): FieldErrors {
  const errors: FieldErrors = {};
  const email = emailError(input.email);
  if (email) errors.email = email;
  if (!input.password) errors.password = "Escribe tu contraseña.";
  return errors;
}

export function validateRegistration(input: { email: string; username: string; password: string }): FieldErrors {
  const errors: FieldErrors = {};
  const email = emailError(input.email);
  if (email) errors.email = email;
  if (!USERNAME.test(input.username.trim())) errors.username = "Usa de 3 a 30 letras, números o guion bajo.";
  if (input.password.length < 8) {
    errors.password = "La contraseña debe tener al menos 8 caracteres.";
  } else if (new TextEncoder().encode(input.password).length > MAX_PASSWORD_BYTES) {
    errors.password = `La contraseña no puede superar ${MAX_PASSWORD_BYTES} bytes (las tildes y los emoji ocupan más de uno).`;
  }
  return errors;
}

/** Errores de campo que devuelve el servidor en un 400 (`details: [{ path, message }]`). */
export function serverFieldErrors(error: ApiError): FieldErrors {
  if (error.code !== "VALIDATION_ERROR" || !Array.isArray(error.details)) return {};
  const errors: FieldErrors = {};
  for (const detail of error.details as { path?: string; message?: string }[]) {
    if ((detail.path === "email" || detail.path === "username" || detail.path === "password") && detail.message) {
      errors[detail.path] ??= detail.message;
    }
  }
  return errors;
}
```

`client/src/pages/AuthForm.tsx`:

```tsx
import { type FormEvent, type ReactNode, useState } from "react";
import { ApiError } from "../api/client";
import { Button } from "../components/Button";
import { Notice } from "../components/Notice";
import { TextField } from "../components/TextField";
import { errorMessage } from "../i18n/es";
import { type FieldErrors, serverFieldErrors } from "./auth-validation";

export interface AuthFormProps {
  title: string;
  submitLabel: string;
  /** Pide también el nombre de usuario (registro). */
  withUsername?: boolean;
  validate(values: { email: string; username: string; password: string }): FieldErrors;
  onSubmit(values: { email: string; username: string; password: string }): Promise<void>;
  footer: ReactNode;
}

/** Formulario común de inicio de sesión y registro: valida, envía y muestra los errores del servidor. */
export function AuthForm({ title, submitLabel, withUsername = false, validate, onSubmit, footer }: AuthFormProps) {
  const [values, setValues] = useState({ email: "", username: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (field: keyof typeof values) => (event: { target: { value: string } }) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    const clean = { email: values.email.trim(), username: values.username.trim(), password: values.password };
    const found = validate(clean);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await onSubmit(clean);
    } catch (error) {
      const fields = error instanceof ApiError ? serverFieldErrors(error) : {};
      setErrors(fields);
      // Si el servidor señaló campos concretos, el aviso general sobra.
      setFormError(Object.keys(fields).length > 0 ? null : error instanceof ApiError ? error.message : errorMessage(undefined));
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-sm">
      <h1 className="mb-4 text-xl font-medium">{title}</h1>
      <form onSubmit={handleSubmit} noValidate className="framed flex flex-col gap-4 rounded-card bg-surface p-4">
        {formError ? <Notice tone="danger">{formError}</Notice> : null}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={set("email")}
          error={errors.email}
        />
        {withUsername ? (
          <TextField
            label="Nombre de usuario"
            autoComplete="username"
            value={values.username}
            onChange={set("username")}
            error={errors.username}
            hint="De 3 a 30 letras, números o guion bajo."
          />
        ) : null}
        <TextField
          label="Contraseña"
          type="password"
          autoComplete={withUsername ? "new-password" : "current-password"}
          value={values.password}
          onChange={set("password")}
          error={errors.password}
          hint={withUsername ? "Mínimo 8 caracteres." : undefined}
        />
        <Button type="submit" variant="primary" loading={submitting}>
          {submitLabel}
        </Button>
      </form>
      <p className="mt-4 text-sm text-muted">{footer}</p>
    </section>
  );
}
```

`client/src/pages/AuthPages.tsx`:

```tsx
import { Link, useLocation, useNavigate } from "react-router";
import { useServices } from "../services";
import { AuthForm } from "./AuthForm";
import { validateLogin, validateRegistration } from "./auth-validation";

/** A dónde volver tras iniciar sesión: la pantalla que se intentó abrir, o el lobby. */
function useReturnPath(): string {
  const state = useLocation().state as { from?: { pathname?: string } } | null;
  return state?.from?.pathname ?? "/";
}

export function LoginPage() {
  const { session } = useServices();
  const navigate = useNavigate();
  const returnTo = useReturnPath();

  return (
    <AuthForm
      title="Iniciar sesión"
      submitLabel="Entrar"
      validate={validateLogin}
      onSubmit={async ({ email, password }) => {
        await session.getState().login({ email, password });
        navigate(returnTo, { replace: true });
      }}
      footer={
        <>
          ¿No tienes cuenta?{" "}
          <Link to="/registro" className="text-accent underline">
            Crea una
          </Link>
        </>
      }
    />
  );
}

export function RegisterPage() {
  const { session } = useServices();
  const navigate = useNavigate();

  return (
    <AuthForm
      title="Crear cuenta"
      submitLabel="Crear cuenta"
      withUsername
      validate={validateRegistration}
      onSubmit={async ({ email, username, password }) => {
        await session.getState().register({ email, username, password });
        navigate("/", { replace: true });
      }}
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className="text-accent underline">
            Inicia sesión
          </Link>
        </>
      }
    />
  );
}
```

`client/src/routes.tsx` (importa el lobby y la sala, por eso va al final):

```tsx
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router";
import { useSession } from "./services";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import { LobbyPage } from "./pages/Lobby";
import { RoomPage } from "./pages/room/RoomPage";

function LoadingScreen() {
  return (
    <p role="status" className="text-center text-muted">
      Cargando…
    </p>
  );
}

/** Rutas que exigen sesión: sin ella llevan a /login y, tras entrar, vuelven a donde se iba. */
function RequireAuth() {
  const status = useSession((s) => s.status);
  const location = useLocation();
  if (status === "loading") return <LoadingScreen />;
  if (status === "anonymous") return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

/** Rutas para quien aún no ha entrado: con sesión llevan al lobby. */
function PublicOnly() {
  const status = useSession((s) => s.status);
  if (status === "loading") return <LoadingScreen />;
  if (status === "authenticated") return <Navigate to="/" replace />;
  return <Outlet />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/registro" element={<RegisterPage />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route path="/" element={<LobbyPage />} />
        <Route path="/sala/:code" element={<RoomPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
```

`client/src/App.tsx`:

```tsx
import { useEffect } from "react";
import { Header } from "./components/Header";
import { AppRoutes } from "./routes";
import { useServices } from "./services";

export function App() {
  const { session } = useServices();

  // Al cargar, intenta recuperar la sesión con la cookie de refresco (solo consulta una vez).
  useEffect(() => {
    void session.getState().bootstrap();
  }, [session]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <AppRoutes />
      </main>
    </>
  );
}
```

`client/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import "./index.css";
import { ServicesProvider, createServices } from "./services";

// Vacío = el mismo origen que la página (en desarrollo, Vite hace de proxy al servidor del juego).
const services = createServices({ baseUrl: import.meta.env.VITE_API_URL ?? "" });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ServicesProvider services={services}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ServicesProvider>
  </StrictMode>,
);
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w client
npm run typecheck -w client
npm run build -w client
```

Expected: PASS (**303 pruebas** en 17 archivos, todo el cliente), `tsc` sin errores y `vite build` genera `client/dist` (no se versiona: está en `.gitignore`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): inicio de sesión, registro, rutas con guardas y arranque de la aplicación" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Verificación en el navegador, documentación y cierre

**Files:**
- Create: `client/scripts/contrast-audit.js`, `client/scripts/dev-bot.mjs`
- Modify: `README.md`, `docs/superpowers/specs/2026-09-30-etapa-3-cliente-design.md`

- [ ] **Step 1: Agregar las dos herramientas de verificación**

`client/scripts/contrast-audit.js` (se pega en la consola del navegador; mide el contraste del texto que realmente se ve, en los cuatro temas/modos, con las transiciones desactivadas mientras mide y teniendo en cuenta la opacidad del elemento y de sus ancestros):

```js
/*
 * Auditoría de contraste del texto visible de la página actual (WCAG AA: 4,5:1 para texto normal,
 * 3:1 para texto grande). Se pega en la consola del navegador con la aplicación abierta.
 *
 *   __contrastAudit()          → lista los textos que no cumplen en el tema y modo actuales
 *   __contrastAuditAll()       → lo repite en los cuatro temas/modos (Clásico y Pokédex, claro y oscuro)
 *
 * Las pruebas automáticas comprueban los pares de colores de los tokens; esto comprueba lo que
 * realmente se ve (un componente con el color de texto equivocado sobre un fondo de otro tema).
 * Se desactivan las transiciones mientras se mide: a mitad de una transición los colores
 * intermedios dan falsos avisos. Se tiene en cuenta la `opacity` del elemento y de sus
 * ancestros (`getComputedStyle().color` no la incluye y un texto atenuado parecería cumplir).
 * Para medir la lista de sugerencias del autocompletado, ábrela (escribe una letra y pulsa
 * la flecha abajo) antes de ejecutar la auditoría.
 */
(() => {
  const parse = (color) => {
    const m = color.match(/[\d.]+/g).map(Number);
    return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 };
  };
  const luminance = ({ r, g, b }) => {
    const [R, G, B] = [r, g, b].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
  };
  const over = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  });
  const opacityOf = (element) => {
    let opacity = 1;
    for (let node = element; node && node !== document.documentElement; node = node.parentElement) {
      opacity *= Number.parseFloat(getComputedStyle(node).opacity);
    }
    return opacity;
  };
  const backgroundOf = (element) => {
    const layers = [];
    for (let node = element; node; node = node.parentElement) {
      const color = parse(getComputedStyle(node).backgroundColor);
      if (color.a > 0) layers.push(color);
      if (color.a === 1) break;
    }
    return layers.reverse().reduce((base, layer) => over(layer, base), { r: 255, g: 255, b: 255, a: 1 });
  };

  window.__contrastAudit = () => {
    const problems = [];
    for (const element of document.querySelectorAll("body *")) {
      const hasText = [...element.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!hasText || element.closest(".sr-only")) continue;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || (element.tagName === "BUTTON" && element.disabled)) continue;
      const background = backgroundOf(element);
      const color = parse(style.color);
      const text = over({ ...color, a: color.a * opacityOf(element) }, background);
      const [lighter, darker] = [luminance(text), luminance(background)].sort((a, b) => b - a);
      const ratio = (lighter + 0.05) / (darker + 0.05);
      const size = Number.parseFloat(style.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number.parseInt(style.fontWeight) >= 700);
      const required = large ? 3 : 4.5;
      if (ratio < required) {
        problems.push(`${element.tagName.toLowerCase()} «${element.textContent.trim().slice(0, 30)}»: ${ratio.toFixed(2)} (mínimo ${required})`);
      }
    }
    return problems;
  };

  window.__contrastAuditAll = async () => {
    const root = document.documentElement;
    const original = { theme: root.dataset.theme, mode: root.dataset.mode };
    const style = document.createElement("style");
    style.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }";
    document.head.append(style);
    const report = {};
    for (const theme of ["clasico", "pokedex"]) {
      for (const mode of ["claro", "oscuro"]) {
        root.dataset.theme = theme;
        root.dataset.mode = mode;
        await new Promise((resolve) => setTimeout(resolve, 100));
        report[`${theme}/${mode}`] = window.__contrastAudit();
      }
    }
    style.remove();
    root.dataset.theme = original.theme;
    root.dataset.mode = original.mode;
    return report;
  };
})();
```

`client/scripts/dev-bot.mjs` (segundo jugador simulado para probar a mano con una sola persona; se conecta al servidor del juego, se une a la sala con el código que le des y juega):

```js
/**
 * Segundo jugador simulado para probar el cliente a mano con una sola persona.
 *
 *   node client/scripts/dev-bot.mjs CODIGO [random|chosen]
 *
 * Se registra con un usuario `bot_xxxx`, se une a la sala con ese código y juega: elige siempre
 * el tipo agua (modo elegido) y, 4 segundos después de empezar cada ronda, responde con un
 * Pokémon válido que nadie haya reclamado. Se conecta directamente al servidor del juego
 * (puerto 3000, o el de la variable PORT); usa el catálogo de `server/data/catalog.snapshot.json`.
 *
 * Deja en la base de datos de desarrollo un usuario `bot_*` y la partida: al terminar imprime
 * el SQL para borrarlos.
 */
import { readFileSync } from "node:fs";
import { io } from "socket.io-client";

const code = process.argv[2];
if (!code) {
  console.error("Uso: node client/scripts/dev-bot.mjs CODIGO_DE_SALA");
  process.exit(1);
}
const BASE = `http://localhost:${process.env.PORT ?? 3000}`;
const snapshot = JSON.parse(readFileSync(new URL("../../server/data/catalog.snapshot.json", import.meta.url), "utf8"));

async function api(path, body, token) {
  const response = await fetch(BASE + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

const tag = Math.random().toString(36).slice(2, 6);
const registration = await api("/auth/register", {
  email: `bot_${tag}@example.com`,
  username: `bot_${tag}`,
  password: "pikachu-123",
});
const token = registration.body.accessToken;
console.log(`unirse a ${code}:`, (await api(`/rooms/${code}/join`, {}, token)).status);

const socket = io(BASE, { auth: { token }, transports: ["websocket"] });
const claimed = new Set();

socket.on("connect", () => socket.emit("join-room", { code }));
socket.on("game-starting", () => console.log("[bot] cuenta atrás"));
socket.on("choose-types", () => setTimeout(() => socket.emit("choose-type", { type: "water" }), 1500));
socket.on("round-started", (round) => {
  const valid = snapshot.pokemon.filter(
    (p) => p.types.length === 2 && p.types.includes(round.type1) && p.types.includes(round.type2) && !claimed.has(p.id),
  );
  console.log(`[bot] ronda ${round.round}: ${round.type1}/${round.type2}, ${valid.length} válidos`);
  const pick = valid.at(-1);
  if (pick) setTimeout(() => socket.emit("submit-pokemon", { text: pick.names.en }), 4000);
});
socket.on("round-result", (result) => {
  for (const seat of [1, 2]) if (result.results[seat].pokemon) claimed.add(result.results[seat].pokemon.id);
  console.log("[bot] resultado:", result.results[1].result, "|", result.results[2].result);
});
socket.on("error", (error) => console.log("[bot] error", error));
socket.on("game-ended", (ended) => {
  console.log("[bot] fin:", ended.reason, "— ganador: asiento", ended.winnerSeat, "— totales", ended.totals);
  console.log(`\nPara limpiar la base de datos de desarrollo:\nDELETE FROM games WHERE room_code = '${code}'; DELETE FROM users WHERE email = 'bot_${tag}@example.com';`);
  setTimeout(() => process.exit(0), 300);
});
```

- [ ] **Step 2: Recorrer una partida completa en el navegador, contra el servidor real**

En tres terminales (la base de desarrollo debe tener el catálogo: `npm run db:seed -w server`):

```bash
npm run dev
```

```bash
npm run dev:client
```

Abre `http://localhost:5173` y comprueba, en este orden:

1. **Registro:** crea una cuenta (`/registro`). Un correo mal escrito o una contraseña corta muestran el error junto al campo. Recarga la página: la sesión se recupera sola (no vuelve a `/login`).
2. **Lobby → sala:** crea una sala de modo **elegido**, rondas **personalizado → 1 ronda**. Debes ver el código grande con el botón de copiar.
3. **Bot:** en otra terminal, `node client/scripts/dev-bot.mjs CODIGO` (con el código de la sala). Aparece el rival, cuenta atrás de 5 s, selector de tipos con cronómetro; elige un tipo.
4. **Ronda:** escribe un Pokémon (con tilde y sin ella; el autocompletado sugiere por nombre sin filtrar por tipo) y envía con Enter. Queda "Respuesta enviada". El panel del rival muestra solo su total y su cantidad de Pokémon.
5. **Resultado y resumen:** se ven los dos Pokémon, los totales y "Calculando el resultado final…" (era la última ronda); luego el resumen con ganador, motivo y los dos equipos.
6. **Reconexión:** durante la cuenta atrás o la ronda de otra partida, recarga la página de la sala: vuelve al mismo punto sin perder el equipo.
7. **Temas:** en el encabezado cambia entre Clásico y Pokédex y entre claro/oscuro/automático; recarga: la elección se conserva y no hay destello del tema equivocado.
8. **Móvil:** con la ventana a 375 px de ancho, los paneles de equipo pasan a una barra resumen y nada se corta ni obliga a desplazar en horizontal.
9. **Contraste real:** en cada pantalla principal (login, registro, lobby, sala de espera, cuenta atrás, selector de tipos con uno elegido, ronda, resultado, resumen) pega `contrast-audit.js` en la consola y ejecuta `await __contrastAuditAll()`. En la ronda, hazlo también con la lista de sugerencias abierta y una opción resaltada (escribe una letra y pulsa la flecha abajo).
10. **Teclado y foco:** al empezar cada ronda el campo de respuesta ya tiene el foco (escribe sin hacer clic); un doble Enter envía una sola respuesta.

Expected: sin errores en la consola del navegador y `__contrastAuditAll()` devuelve una lista **vacía** para los cuatro temas/modos en cada pantalla. Al terminar, el bot imprime el SQL para borrar lo que dejó (la partida y su usuario `bot_*`); ejecútalo con `psql` (el mismo usuario de tu `server/.env`), borra también tu usuario de prueba y la sala si quedó abierta, y detén los dos servidores con Ctrl+C.

- [ ] **Step 3: Comprobar que las pruebas detectan fallos**

Rompe a propósito cada protección crítica, ejecuta la prueba indicada y restaura. Cada fila debe fallar; después de cada una, `git checkout -- <archivo>`.

| # | Archivo y cambio | Prueba que debe fallar |
|---|---|---|
| 1 | `client/src/api/client.ts`: la renovación de sesión deja de compartirse: `this.refreshing ??= …` se cambia por `return this.doRefresh();` | `client.test.ts` → «varias peticiones que fallan a la vez comparten una sola renovación» |
| 2 | `client/src/game/clock.ts`: `remainingMs` ignora el desfase: `deadline - (now + offset)` → `deadline - now` | `clock.test.ts` → «corrige un navegador adelantado o atrasado al calcular lo que falta» y «aplica el desfase del reloj» |
| 3 | `client/src/game/apply-event.ts`: `room-state` no recalcula el desfase: `clockOffset(state.serverNow, receivedAt)` → `view.clockOffset` | `apply-event.test.ts` → «reemplaza el estado completo y calcula el desfase del reloj» |
| 4 | `client/src/game/apply-event.ts`: un `round-result` repetido duplica el Pokémon: se quita `!view.myTeam.some(…)` | `apply-event.test.ts` → «un resultado repetido (p. ej. tras reconectar) no duplica el Pokémon en el equipo» |
| 5 | `client/src/game/game-client.ts`: el socket reintenta sin límite tras `UNAUTHORIZED`: se quita `&& !this.retriedAuth` | `game-client.test.ts` → «renueva la sesión y reintenta conectar una sola vez» |
| 6 | `client/src/session/session-store.ts`: `bootstrap` consulta al servidor cada vez: `booting ??=` → `booting =` | `session-store.test.ts` → «solo consulta al servidor una vez aunque se llame varias (React en modo estricto)» |
| 7 | `client/src/routes.tsx`: `RequireAuth` deja de mostrar la pantalla de carga: se borra su línea `if (status === "loading") return <LoadingScreen />;` | `routes.test.tsx` → «mientras se recupera la sesión muestra una pantalla de carga, no el formulario» |
| 8 | `client/src/components/Button.tsx`: el botón primario baja la opacidad al pasar el ratón: `hover:underline` → `hover:opacity-90` | `basics.test.tsx` → «ninguna variante baja la opacidad al pasar el ratón (el texto perdería contraste)» |
| 9 | `server/src/game/engine/engine.ts`: la última ronda anuncia una siguiente: `nextRoundAt` ya no es `null` al terminar | `engine.end.test.ts` → «el resultado de la última ronda no anuncia una siguiente (nextRoundAt nulo)» |

Al terminar, `git status` no debe mostrar cambios.

- [ ] **Step 4: Actualizar el README**

Reemplazar `README.md` completo:

````markdown
# Pokémon Minigames

Juego web de 2 jugadores en tiempo real: en cada ronda se enfrenta un par de tipos Pokémon y cada jugador tiene 15 s para nombrar un Pokémon que tenga ambos. Gana quien acumule más stats base. El diseño completo está en [`docs/superpowers/specs/`](docs/superpowers/specs/).

**Estado:** etapa 3 de 5 (servidor y cliente web completos y jugables). Faltan las estadísticas y el perfil (etapa 4) y el despliegue (etapa 5).

## Estructura

| Carpeta | Contenido |
|---|---|
| `server/` | API REST (Express) y tiempo real (Socket.io), motor de juego, Prisma y PostgreSQL |
| `client/` | Cliente web: React 19, Vite, Tailwind, Zustand y React Router |
| `shared/` | Tipos de eventos, payloads, códigos de error y `normalizeName`, compartidos por servidor y cliente |

## Requisitos

- Node 24 o superior
- PostgreSQL 18 (local, sin Docker)

## Puesta en marcha

```bash
npm install
```

1. Crea dos bases de datos: `pokemon_minigames` y `pokemon_minigames_test`.
2. Copia `server/.env.example` a `server/.env` y `server/.env.test.example` a `server/.env.test`; completa las credenciales de PostgreSQL y `JWT_ACCESS_SECRET` (mínimo 32 caracteres).
3. Aplica las migraciones y carga el catálogo:

```bash
npm run db:migrate -w server
npm run db:seed -w server
```

4. Arranca el servidor del juego (`http://localhost:3000`) y, en otra terminal, el cliente (`http://localhost:5173`):

```bash
npm run dev
npm run dev:client
```

En desarrollo el servidor de Vite hace de proxy de `/auth`, `/rooms`, `/pokemon` y `/socket.io` al servidor del juego, de modo que cliente y API comparten origen y la cookie de sesión funciona. Abre `http://localhost:5173`, crea una cuenta y una sala; para jugar necesitas un segundo jugador (otro navegador o una ventana privada, con otra cuenta).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor del juego en modo desarrollo con recarga |
| `npm run dev:client` | Cliente web con recarga en caliente |
| `npm run build` | Construye el cliente para producción (`client/dist`) |
| `npm test` | Todas las pruebas: servidor (usan la base `pokemon_minigames_test`) y cliente |
| `npm run typecheck` | Verifica los tipos con `tsc` en todos los paquetes |
| `npm run db:migrate -w server` | Crea/aplica migraciones en desarrollo |
| `npm run db:seed -w server` | Carga el catálogo desde `server/data/catalog.snapshot.json` |
| `npm run catalog:fetch -w server` | Vuelve a descargar el catálogo de PokéAPI al snapshot |
| `npm run smoke -w server` | Juega una partida real de una ronda contra el servidor en marcha |

Variable opcional del cliente: `VITE_API_URL` (URL base del servidor; vacía = el mismo origen).

## Temas y accesibilidad

Cada jugador elige entre dos temas, **Clásico** y **Pokédex** (retro, con números en monoespaciada y bordes rectos), y entre modo automático, claro u oscuro; la preferencia se guarda en el navegador. Los colores de todos los temas y de los 18 tipos cumplen el contraste AA de WCAG (lo comprueban las pruebas). Para revisar lo que realmente se ve, pega [`client/scripts/contrast-audit.js`](client/scripts/contrast-audit.js) en la consola del navegador y ejecuta `__contrastAuditAll()`.

## API REST

| Método y ruta | Descripción |
|---|---|
| `GET /health` | Estado del servidor |
| `POST /auth/register` | Crea la cuenta; devuelve `user` y `accessToken` y fija la cookie de refresco |
| `POST /auth/login` | Inicia sesión |
| `POST /auth/refresh` | Renueva la sesión con la cookie (rota el refresh token) |
| `POST /auth/logout` | Cierra la sesión y borra la cookie |
| `GET /auth/me` | Usuario actual |
| `POST /rooms` | Crea una sala: `{ typeMode: "random" \| "chosen", lengthMode: "fixed_rounds" \| "custom", roundsLimit?, statsGoal? }`; devuelve `{ code }` |
| `GET /rooms/current` | La sala activa del usuario: `{ room: { code, phase } }` o `{ room: null }` |
| `GET /rooms/:code` | Información pública de la sala |
| `POST /rooms/:code/join` | Reserva el asiento 2 |
| `GET /pokemon/names` | Público. Lista de `{ id, es, en }` de todos los Pokémon, para el autocompletado |

Las rutas de `/auth/me` y `/rooms` exigen `Authorization: Bearer <accessToken>`. Los errores tienen la forma `{ "error": { "code", "message", "details"? } }`.

## Tiempo real (Socket.io)

Se conecta a `http://localhost:3000` con `auth: { token: <accessToken> }`. Un token inválido rechaza el handshake con `UNAUTHORIZED`. Los nombres y cargas exactos están tipados en [`shared/src/events.ts`](shared/src/events.ts). Los eventos que marcan un plazo (`game-starting`, `choose-types`, `round-started`, `opponent-disconnected` y `room-state`) traen `serverNow`, la hora del servidor, para que el cliente corrija el desfase de su reloj.

| Cliente → servidor | Carga |
|---|---|
| `join-room` | `{ code }` (también sirve para reconectar; una segunda pestaña reemplaza a la primera) |
| `choose-type` | `{ type }` (modo elegido) |
| `submit-pokemon` | `{ text }` (un intento por ronda, máximo 100 caracteres) |
| `leave-room` | — |

| Servidor → cliente | Cuándo |
|---|---|
| `room-state` | Al entrar o reconectar: estado completo de la partida |
| `player-joined`, `game-starting`, `choose-types`, `round-started` | Avance de la partida |
| `type-received`, `answer-received` | Confirman la recepción, sin decir si acertaste |
| `round-result` | Resultado de ambos jugadores al cerrar la ronda, con `nextRoundAt` |
| `game-ended` | Ganador, motivo, equipos y totales |
| `opponent-disconnected`, `opponent-reconnected` | Caída y vuelta del rival |
| `error` | `{ code, message }` |
````

- [ ] **Step 5: Actualizar la spec de la etapa 3 con lo que se decidió al implementar**

En `docs/superpowers/specs/2026-09-30-etapa-3-cliente-design.md`, tres cambios.

(a) En la sección 7, en el punto 1, reemplazar la frase:

```
Los tipos de `shared/` se actualizan y las pruebas existentes que comparan estas cargas se ajustan.
```

por:

```
Los tipos de `shared/` se actualizan y las pruebas existentes que comparan estas cargas se ajustan. Además, `round-result` trae `nextRoundAt` (hora del servidor a la que empieza la siguiente ronda; `null` si la partida terminó) para la cuenta atrás de la pausa entre rondas.
```

(b) En la sección 8, reemplazar el bloque de código de la estructura por el real:

````
```
client/
├── index.html  vite.config.ts  package.json  tsconfig.json
├── scripts/    contrast-audit.js  dev-bot.mjs
└── src/
    ├── main.tsx  App.tsx  routes.tsx  services.tsx  index.css
    ├── api/        client.ts (fetch con token y renovación única)  endpoints.ts  types.ts
    ├── session/    session-store.ts
    ├── catalog/    names-store.ts (lista de nombres para el autocompletado)
    ├── game/       game-client.ts  apply-event.ts  store.ts  clock.ts  durations.ts
    ├── theme/      tokens.css (tokens por tema y modo)  theme-store.ts  contrast.ts  type-styles.ts
    ├── i18n/       mensajes de error y nombres de tipo en español
    ├── components/ piezas de interfaz reutilizables (Button, TypeChip, Timer, PokemonCard, Autocomplete…)
    └── pages/      Login, Register, Lobby, Room/ (Waiting, Countdown, TypePicker, Round, RoundResult, Summary)
```
````

(c) En la sección 9, reemplazar la viñeta:

```
- **Verificación visual:** se recorre a mano una partida completa entre dos navegadores con el servidor real, en los dos temas y en móvil.
```

por:

```
- **Verificación visual:** se recorre una partida completa contra el servidor real (dos navegadores, o uno solo contra el bot `client/scripts/dev-bot.mjs`), en los dos temas y en móvil; y se ejecuta `client/scripts/contrast-audit.js` (`__contrastAuditAll()`) en las pantallas principales para medir el contraste del texto que realmente se ve, no solo el de los tokens.
```

- [ ] **Step 6: Verificación final completa**

```bash
npm test
npm run typecheck
npm run build
git status
```

Expected: **669 pruebas pasan** (366 de servidor y 303 de cliente); `tsc` sin errores en los tres paquetes; el build genera `client/dist`; `git status` solo muestra `README.md`, la spec y los dos scripts (nada de `.env`, `.env.test` ni `client/dist`).

- [ ] **Step 7: Commit y publicar la rama**

```bash
git add -A
git commit -m "docs: README y spec tras la etapa 3; herramientas de verificación del cliente" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push -u origin etapa-3-cliente
```

Expected: rama `etapa-3-cliente` en `https://github.com/marcovinir/pokemon-minigames`. La integración a `main` la decide Marco.

---

## Self-Review

**Cobertura de la spec de la etapa 3:**

| Requisito | Tarea |
|---|---|
| `normalizeName` en `shared/` | 1 |
| `serverNow` en los eventos con plazo y en `room-state` (+ `nextRoundAt`) | 2 |
| `GET /rooms/current` y `GET /pokemon/names` | 3 |
| Vite + React + Tailwind + Zustand + Router; texto en español; tokens y contraste AA; 18 colores de tipo | 4 |
| Temas Clásico y Pokédex × claro/oscuro, preferencia guardada, sin destello | 4 y 5 |
| Cliente HTTP con token en memoria y renovación única | 6 |
| Reloj con desfase, `applyServerEvent`, store, `GameClient` (reconexión, token vigente) | 7 |
| Sesión (arranque con refresh, logout), lista de nombres, servicios por contexto | 8 |
| Componentes: autocompletado accesible sin filtrar por tipo, paneles sin fuga, cronómetro, encabezado y selector de tema | 9 |
| Lobby: crear sala, unirse, volver a tu partida | 10 |
| Sala: una vista por fase, desconexión del rival, errores, sala inexistente | 11 |
| Login, registro, guardas de ruta con regreso a donde se iba | 12 |
| Verificación visual (dos temas, móvil), auditoría de contraste real, mutaciones, README y spec | 13 |

**Decisiones tomadas al escribir el plan (la spec las recoge en la Task 13):** `round-result` trae `nextRoundAt` (la cuenta atrás de la pausa no se puede deducir del cliente y tras la última ronda no hay siguiente); la estructura real de `client/src/api/` (`client.ts`, `endpoints.ts`, `types.ts`) y de `theme/`; y la verificación visual incluye una auditoría de contraste del texto real y un bot para probar con una sola persona.

**Lo que encontró la revisión final independiente de toda la rama (ya corregido en el código de este plan, cada punto con su prueba):** (1) los errores del socket no se borraban nunca y quedaban a la vista (y anunciados) el resto de la partida; ahora los borra cualquier evento que avance la partida (`apply-event.test.ts`); (2) un doble toque en el selector de tipo o un doble Enter en el campo enviaban dos veces y el servidor se quedaba con la primera, mientras la interfaz mostraba la segunda; ahora se bloquean en el acto (`room.test.tsx`, `autocomplete.test.tsx`); (3) las sugerencias del autocompletado usaban `opacity-70` y quedaban por debajo de 4,5:1, y la auditoría no lo veía porque `getComputedStyle().color` no incluye la opacidad; ahora no hay opacidad y la auditoría la multiplica por la de los ancestros; (4) accesibilidad: el campo no recibía el foco al empezar la ronda, el par de tipos y el resultado final no se anunciaban, y el aviso del rival caído repetía su cuenta atrás cada segundo; ahora hay foco automático, un `role="log"` con los anuncios y la cuenta atrás oculta a los lectores de pantalla; (5) el socket podía quedarse en "Reconectando…" para siempre (sesión no renovable o partida abierta en otra pestaña); ahora lleva a /login u ofrece "Jugar aquí" (`game-client.test.ts`, `room.test.tsx`); (6) una caída de red en la pantalla de resumen la reemplazaba por "Esa sala no existe"; ahora no se vuelve a entrar a una sala terminada. Además, una prueba de autenticación fallaba de forma intermitente con la CPU cargada (`waitFor` de 1 s por defecto); `setup.ts` sube el timeout a 4 s.

**Pendientes menores de esa revisión (no se corrigen en esta etapa):** `room-state` no trae `nextRoundAt` ni el último resultado (recargar en la pausa muestra "Resultado de la ronda…" sin cuenta atrás hasta 6 s); un fallo de red al renovar tras un 401 cierra la sesión; una segunda renovación innecesaria si una petición con el token viejo recibe 401 justo después de renovar; `Header` deja una promesa rechazada sin capturar si el logout falla (la sesión local sí se cierra); la vuelta a la sala tras el login depende del orden entre `PublicOnly` y el `navigate` de `LoginPage`; el lobby navega con el código escrito sin codificar (el servidor ya lo validó); cancelar una sala en espera sin conexión deja la sala abierta hasta que caduca; al agotarse los pares se anuncia "Siguiente ronda" antes del resumen.

**Hallazgos de la verificación en el navegador (ya corregidos en el código de este plan):** (1) el botón "Cerrar sesión" medía 1,98:1 sobre el encabezado del tema Pokédex porque usaba el color de texto de la página; ahora la variante `header` usa `text-header-fg`; (2) el hover de los botones primarios bajaba la opacidad y dejaba el texto por debajo de 4,5:1 en Pokédex; ahora subraya. Ambos tienen prueba en `basics.test.tsx` y `header-theme.test.tsx`, y la auditoría mide con las transiciones desactivadas (los valores intermedios de una transición dan falsos avisos).

**Fuera de esta etapa:** historial, estadísticas, perfil y guardar el tema en el perfil (etapa 4); prueba E2E en navegador automatizada, despliegue, origen y cookie en producción, `COOKIE_SECURE` obligatorio, protección CSRF de refresh/logout y límite de intentos de login (etapa 5); sonido, animaciones, varios idiomas, chat, espectadores y revancha desde la misma sala.

**Consistencia de tipos:** los nombres se reutilizan tal como están en los bloques `Interfaces` de cada tarea. Todo el código se escribió y ejecutó antes de incluirlo: 366 pruebas de servidor y 303 de cliente en verde, `tsc` sin errores en los tres paquetes, `vite build` correcto, 9 mutaciones a propósito detectadas por las pruebas, y una partida real en el navegador contra el catálogo de 1025 Pokémon.
