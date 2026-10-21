# PokeMiniGames — Modo invitado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cualquier persona entre desde «Iniciar sesión» con solo un nombre, juegue partidas completas (contra cuentas o contra otros invitados) y no deje ni reciba estadísticas: una partida con un invitado no escribe nada en la base de datos.

**Architecture:** El invitado no existe en la base de datos: su identidad es un token de acceso firmado con `guest: true` y una cookie firmada `guest_session` (24 h) que le permite recuperar la sesión al recargar. El middleware de autenticación se parte en dos niveles (cuenta e identidad: cuenta o invitado). Una sala se guarda solo si todos los que se sentaron son cuentas: `GameRoom` gana el estado `persisted` y el puerto `GameRepository` el método `discardGame`. El motor y las vistas llevan `guest` hasta el cliente, que muestra la etiqueta «Invitado» y oculta lo que es de cuentas (perfil, historial, preferencias en el servidor).

**Tech Stack:** Sin cambios: Express 5, Socket.io, Prisma 7.10.0 (sin migración), zod 4, `jsonwebtoken`, Vitest + supertest, React 19, Zustand 5, React Router 8, Playwright. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-10-18-modo-invitado-design.md` (aprobada por Marco el 2026-10-20). Issue: #3.

## Global Constraints

- **Nombre del invitado:** `/^[A-Za-z0-9_]{3,30}$/` con los espacios de los extremos recortados (la misma regla que un nombre de usuario). Una sola definición en el servidor (`usernameSchema`, extraída de `registerSchema`) y la del cliente (`USERNAME` de `auth-validation.ts`).
- **Identidad:** id `guest_` + 16 bytes aleatorios en base64url (nunca un UUID). Sin filas en la base de datos; **sin migración**.
- **Token de acceso:** el mismo JWT HS256 y la misma clave y duración que el de las cuentas, con `guest: true` en la carga **solo** en los de invitado (los de cuenta nunca llevan el campo; solo `=== true` cuenta como invitado).
- **Cookie `guest_session`:** JWT firmado con la misma clave, con `aud: "guest-session"` (los tokens de acceso no llevan `aud`: ninguno sirve como el otro); `HttpOnly`; `Secure` según `COOKIE_SECURE`; `SameSite` según `COOKIE_SAME_SITE`; `path: /auth`; caducidad **24 h**.
- **Rutas:** `requireIdentity` (cuenta o invitado) en `/rooms/*` y en el handshake de Socket.io; `requireAccount` (solo cuenta, un invitado recibe **403 `ACCOUNT_REQUIRED`**) en `GET /auth/me`, `PUT /auth/me/preferences`, `GET /stats`, `GET /stats/history` y `GET /users/:username/stats`.
- **Límite:** `POST /auth/guest` limitado a **20 sesiones por hora y por IP** (como los demás límites, solo se aplica en producción) con 429 `RATE_LIMITED` y `Retry-After`.
- **Textos:** `ACCOUNT_REQUIRED` → «Necesitas una cuenta para esto.»; `NAME_IN_USE` (409) → «Ya hay alguien con ese nombre en la sala. Entra con otro nombre.»; bloque de acceso «¿Sin cuenta? Juega como invitado» con el campo «Nombre» y el botón «Entrar como invitado»; etiqueta «Invitado»; botón del encabezado «Crear cuenta».
- **Una partida con un invitado no se guarda para nadie** (ni cuenta para las estadísticas de la cuenta rival). Decisión de Marco.
- Mensajes al usuario en español con tildes; identificadores en inglés. TDD (la prueba se ve fallar antes del código). Prisma sigue fijado en **7.10.0**. La base de datos de producción no se toca: no hay migración.

## Review Focus

Condiciones que la spec no detalla pero que muerden a una persona real; cada una tiene su prueba en la tarea indicada.

1. **Un invitado haciéndose pasar por cuenta.** Un token de invitado recibe 403 en *todas* las rutas de cuentas; un token de acceso no sirve como cookie de invitado ni al revés; un token con `guest: false`, `guest: "true"` o de otra clave no es invitado ni cuenta válida. → Task 2 y Task 3.
2. **Filas escritas por una partida con invitado, por cualquier camino.** Crea el invitado; crea una cuenta y se une el invitado; el invitado se une y se va y entra una cuenta (la sala sigue sin guardarse); `discardGame` falla (la partida se juega igual). Y el control: dos cuentas siguen guardándose. → Task 5.
3. **La sesión tras salir, iniciar sesión o expirar.** Salir borra las dos cookies; iniciar sesión o registrarse borra la de invitado; con las dos cookies manda la de cuenta; cookie manipulada, de otra clave o caducada da 401; recargar en plena ronda como invitado reconecta. → Task 3, Task 6 y Task 8.
4. **Nombres.** Dos letras, 31 letras, espacios dentro, emoji: se rechazan en el cliente y en el servidor; los espacios de los extremos se recortan; `NAME_IN_USE` sin distinguir mayúsculas, también invitado contra cuenta. → Task 3, Task 5 y Task 7.
5. **Un invitado no ve nada de cuentas.** `/perfil` y `/jugador/:username` lo llevan al lobby; sin «Mi perfil» ni «Ver perfil de …» (ni si el rival es invitado); los cambios de tema nunca llaman a `PUT /auth/me/preferences`; a 375 px con un nombre de 30 letras nada se sale. → Task 6, Task 7 y Task 8.

---

## File Structure

```
shared/src/ errors.ts  events.ts                              # ACCOUNT_REQUIRED, NAME_IN_USE; guest en RoomPlayerView y player-joined (Task 1)
server/src/
├── auth/ tokens.ts  auth.middleware.ts  auth.schemas.ts      # guest en el token; requireIdentity/requireAccount; usernameSchema (Task 2, 3)
│        guest-sessions.ts (NUEVO)  auth.routes.ts            # cookie guest_session; POST /auth/guest; refresh y logout (Task 3)
├── http/limits.ts  app.ts                                    # límite de sesiones de invitado y cableado (Task 3)
├── game/ engine/ engine.ts types.ts view.ts                  # guest en PlayerState, evento y vista (Task 4)
│        ports.ts prisma-game-repository.ts room.ts room-manager.ts   # discardGame, persisted, NAME_IN_USE (Task 5)
├── rooms/rooms.routes.ts  stats/stats.routes.ts  realtime/   # niveles de autenticación (Task 2)
client/src/
├── api/ types.ts endpoints.ts   session/session-store.ts   routes.tsx   theme/theme-sync.ts   game/apply-event.ts   # (Task 6)
├── components/ GuestTag.tsx (NUEVO)  Header.tsx  Panels.tsx  i18n/es.ts                                              # (Task 1, 7)
└── pages/ GuestEntry.tsx (NUEVO)  AuthPages.tsx  auth-validation.ts  room/ WaitingView RoundView RoundResultView SummaryView   # (Task 7)
e2e/ support/app.ts  tests/guests.spec.ts (NUEVA)    README.md  docs/despliegue.md                                   # (Task 8)
```

Se construye de abajo arriba: contrato, autenticación, sesión de invitado, motor, partidas sin rastro, y luego el cliente y la E2E. Cada tarea deja la suite en verde: nada del juego existente cambia de comportamiento mientras no haya invitados (los campos nuevos son opcionales).

## Notas de entorno

- Parte de `main` (etapas 1 a 8, correo retirado y nombre PokeMiniGames): **servidor 650 pruebas (+1 omitida), cliente 746, E2E 22 (+2 omitidas)**. Rama `modo-invitado`. PostgreSQL 18 local arriba y los `.env` de siempre.
- **Corre la E2E con el equipo enchufado** (las ventanas de 6 s y 15 s del juego fallan por tiempo con el procesador a ritmo de batería) y lanza lo largo en segundo plano. Comandos con `--testTimeout=30000 --maxWorkers=2` si el equipo va justo.

---

### Task 1: Contrato compartido y textos

**Files:**
- Modify: `shared/src/errors.ts`, `shared/src/events.ts`, `client/src/i18n/es.ts`
- Test (modificar): `server/test/shared/contract.test.ts`, `client/test/i18n/es.test.ts`

**Interfaces:**
- Produces: `ERROR_CODES` incluye `"ACCOUNT_REQUIRED"` y `"NAME_IN_USE"`; `RoomPlayerView.guest?: boolean` (ausente = cuenta); el payload de `player-joined` pasa a `{ username: string; guest?: boolean }`; mensajes de error en español en `ERROR_MESSAGES`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
// server/test/shared/contract.test.ts
it("incluye los códigos del modo invitado", () => {
  expect(ERROR_CODES).toContain("ACCOUNT_REQUIRED");
  expect(ERROR_CODES).toContain("NAME_IN_USE");
});
// client/test/i18n/es.test.ts
it("los errores del modo invitado tienen su mensaje en español", () => {
  expect(errorMessage("ACCOUNT_REQUIRED")).toBe("Necesitas una cuenta para esto.");
  expect(errorMessage("NAME_IN_USE")).toBe("Ya hay alguien con ese nombre en la sala. Entra con otro nombre.");
});
```

- [ ] **Step 2: Ejecutar y ver que fallan:** `cd server && npx vitest run test/shared` y `cd ../client && npx vitest run test/i18n`. Expected: FAIL (los códigos no existen).
- [ ] **Step 3: Implementar.** Añadir los dos códigos a `ERROR_CODES` (grupos «autenticación» y «salas»), los mensajes de arriba en `ERROR_MESSAGES` (el tipo `Record<ErrorCode, string>` obliga a ello), y los campos opcionales de `events.ts`.
- [ ] **Step 4: Ejecutar y ver que pasan** (mismos comandos) y `npm run typecheck`. Expected: PASS y `tsc` sin errores.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: códigos ACCOUNT_REQUIRED y NAME_IN_USE y campo guest en el contrato"` (con el pie de coautoría de la harness).

---

### Task 2: Dos niveles de autenticación

**Files:**
- Modify: `server/src/auth/tokens.ts`, `server/src/auth/auth.middleware.ts`, `server/src/auth/auth.routes.ts` (solo `/me` y `/me/preferences`), `server/src/rooms/rooms.routes.ts`, `server/src/stats/stats.routes.ts`, `server/src/realtime/server.ts`, `server/src/realtime/broadcaster.ts` (`SocketData`)
- Test (modificar): `server/test/auth/tokens.test.ts`; (crear): `server/test/auth/account-vs-guest.test.ts`

**Interfaces:**
- Produces: `AccessTokenPayload { sub; username; guest?: true }`; `TokenService.signAccessToken({ sub, username, guest? })` y `verifyAccessToken(token)` que devuelve `guest: true` solo si la carga trae `guest === true` y **rechaza** (401) un token con `aud` (las cookies de invitado). `AuthContext { userId; username; isGuest: boolean }`. `createRequireIdentity(tokens)` (acepta ambos) y `createRequireAccount(tokens)` (rechaza al invitado con `AppError(403, "ACCOUNT_REQUIRED", "Necesitas una cuenta para esto.")`); **`createRequireAuth` desaparece** y cada ruta usa una de las dos según los Global Constraints. `socket.data.user` y `RoomUser` ganan `isGuest` (en `RoomUser` opcional).

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
// tokens.test.ts
it("el token de invitado lleva guest:true y vuelve a leerse igual; el de cuenta nunca lo lleva", () => {
  const guest = tokens.verifyAccessToken(tokens.signAccessToken({ sub: "guest_abc", username: "inv_1", guest: true }));
  expect(guest).toEqual({ sub: "guest_abc", username: "inv_1", guest: true });
  const account = tokens.verifyAccessToken(tokens.signAccessToken({ sub: "u1", username: "ash" }));
  expect("guest" in account).toBe(false);
});
it("solo guest === true es invitado: false, \"true\" o 1 se leen como cuenta; otra clave o un aud se rechazan", () => { /* firmar a mano con jsonwebtoken y comprobar */ });
// account-vs-guest.test.ts — con la app de pruebas y un token firmado con tokens.signAccessToken({ guest: true })
it.each([["GET", "/auth/me"], ["PUT", "/auth/me/preferences"], ["GET", "/stats"], ["GET", "/stats/history"], ["GET", "/users/ash/stats"]])(
  "%s %s con un token de invitado: 403 ACCOUNT_REQUIRED", /* expect(status).toBe(403); expect(body.error.code).toBe("ACCOUNT_REQUIRED") */);
it("las mismas rutas con el token de una cuenta siguen funcionando", /* registerUser + 200 */);
it("las rutas de salas aceptan al invitado: GET /rooms/current da { room: null } y GET /rooms/XXXXXX da 404 ROOM_NOT_FOUND (no 401 ni 403)", /* ... */);
it("sin token o con uno inválido: 401 UNAUTHORIZED como hoy", /* ... */);
```

- [ ] **Step 2: Ejecutar y ver que fallan:** `cd server && npx vitest run test/auth/tokens.test.ts test/auth/account-vs-guest.test.ts`. Expected: FAIL (no existe `guest` ni `createRequireAccount`).
- [ ] **Step 3: Implementar** `tokens.ts` (el campo `guest` solo se escribe si es `true`) y las dos fábricas de middleware; cambiar cada `createRequireAuth` por la que corresponda; en el handshake copiar `guest` a `socket.data.user.isGuest` y pasarlo como `RoomUser.isGuest` en `registerHandlers` y en `rooms.routes.ts` (`const { userId, username, isGuest } = getAuth(res)`). Crear una sala siendo invitado se completa en la Task 5 (hasta entonces `createGame` fallaría con su id): las pruebas de esta tarea solo usan rutas de lectura de salas.
- [ ] **Step 4: Ejecutar** toda la suite del servidor (`npx vitest run --testTimeout=30000`) y `npm run typecheck`. Expected: PASS (las pruebas existentes de rutas con token de cuenta no cambian).
- [ ] **Step 5: Commit** — `feat(server): token de invitado y dos niveles de autenticación (cuenta e identidad)`.

---

### Task 3: Sesión de invitado (`POST /auth/guest`, cookie, refresco y salida)

**Files:**
- Create: `server/src/auth/guest-sessions.ts`
- Modify: `server/src/auth/auth.schemas.ts` (extraer `usernameSchema`; añadir `guestSchema = z.object({ username: usernameSchema })`), `server/src/auth/auth.routes.ts`, `server/src/http/limits.ts`, `server/src/app.ts`
- Test (crear): `server/test/auth/guest-sessions.test.ts`, `server/test/auth/guest.routes.test.ts`; (modificar) `server/test/auth/auth.schemas.test.ts`

**Interfaces:**
- Consumes: `createTokenService`/`TokenService.signAccessToken` (Task 2).
- Produces: `GUEST_COOKIE = "guest_session"`, `GUEST_SESSION_TTL_MS = 24 h`; `createGuestSessions({ secret, ttlMs, now? }): GuestSessions` con `issue(username: string): { id: string; username: string; cookie: string; expiresAt: Date }` y `read(cookie: unknown): { id: string; username: string } | null` (nunca lanza). `AuthRouterDeps.guests: GuestSessions` y `limiters.guestSessions?`. `RateLimitConfig.guestSessions: WindowLimit` (por defecto `{ limit: 20, windowMs: HOUR }`). Rutas: `POST /auth/guest` `{ username }` → `201 { user: { id, username, guest: true }, accessToken }` + cookie; `POST /auth/refresh` acepta además la cookie de invitado (si hay cookie de cuenta, manda esa) y devuelve el mismo formato con token nuevo y cookie renovada; `login` y `register` borran `guest_session`; `logout` borra las dos cookies.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
// guest-sessions.test.ts (módulo, con reloj inyectado)
it("issue crea un id guest_… y una cookie que read devuelve; dos sesiones nunca repiten id", ...);
it("read devuelve null con una cookie manipulada, firmada con otra clave, caducada (now + 24 h + 1 ms) o que sea un token de acceso", ...);
it("un token de acceso no sirve como cookie y la cookie no sirve como token de acceso (verifyAccessToken lanza 401)", ...);
// guest.routes.test.ts (supertest)
it("POST /auth/guest: 201, user { id empieza por guest_, username, guest: true } sin email, token de acceso y cookie guest_session HttpOnly, Path=/auth, SameSite=Lax y Expires", ...);
it("recorta los espacios de los extremos y rechaza con VALIDATION_ERROR (400): 'ab', 31 letras, 'a b c', 'ash🙂' y un cuerpo vacío", ...);
it("no crea filas: prisma.user.count() y prisma.refreshToken.count() siguen en 0", ...);
it("POST /auth/refresh con la cookie de invitado: 200, token de invitado nuevo y cookie renovada; con cookie manipulada o caducada: 401 INVALID_REFRESH_TOKEN", ...);
it("con las dos cookies manda la de cuenta (responde el usuario de cuenta)", ...);
it("login y register con éxito borran guest_session (Set-Cookie con fecha pasada); logout borra las dos", ...);
it("el token del invitado funciona en /rooms/current y recibe 403 ACCOUNT_REQUIRED en /auth/me", ...);
it("límite por IP: con guestSessions { limit: 2 } la tercera sesión da 429 RATE_LIMITED con Retry-After; con los límites apagados no limita", /* buildTestContext({}, { rateLimits }) */);
```

- [ ] **Step 2: Ejecutar y ver que fallan:** `npx vitest run test/auth/guest-sessions.test.ts test/auth/guest.routes.test.ts`. Expected: FAIL (el módulo y la ruta no existen).
- [ ] **Step 3: Implementar.** `guest-sessions.ts` firma con `jsonwebtoken` (HS256, `subject` = id, `aud: "guest-session"`, `username` en la carga, caducidad por `ttlMs`; `read` verifica con `audience` y devuelve `null` ante cualquier error). `POST /auth/guest`: reserva el hueco del límite antes de emitir (`check` y `record`, como `register`), valida con `guestSchema`, firma el token de acceso con `guest: true` y fija la cookie con las mismas opciones (`httpOnly`, `secure`, `sameSite`, `path: "/auth"`, `expires`). En `/auth/refresh`: si no hay cookie de cuenta pero `guests.read(cookie)` da algo, emitir el token de invitado y renovar la cookie; si no hay ninguna, el 401 de hoy. En `app.ts`: crear `guests` con `env.JWT_ACCESS_SECRET` y el TTL, y el limitador.
- [ ] **Step 4: Ejecutar** la suite del servidor completa y `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(server): sesión de invitado (POST /auth/guest, cookie firmada, refresco, salida y límite por IP)`.

---

### Task 4: El motor y las vistas llevan `guest`

**Files:**
- Modify: `server/src/game/engine/types.ts`, `server/src/game/engine/engine.ts`, `server/src/game/engine/view.ts`
- Test (modificar): `server/test/game/harness.ts` (el `Harness` acepta `creator`), `server/test/game/engine.lobby.test.ts`, `server/test/game/view.test.ts`

**Interfaces:**
- Produces: `PlayerState.guest?: boolean`; `GameEvent` `PLAYER_JOINED { userId; username; guest?: boolean }`; `createGame(config, creator: { userId; username; guest?: boolean }, now)`. `buildRoomState` incluye `guest: true` en `players[]` **solo** para invitados; el evento `player-joined` lleva `{ username, guest: true }` solo si lo es (para que los `toEqual` existentes sigan valiendo).

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
it("quien se une como invitado: player-joined lleva guest: true y room-state lo marca; una cuenta no lleva el campo", () => {
  h.dispatch({ type: "PLAYER_JOINED", userId: "guest_x", username: "inv", guest: true });
  expect(h.payloads("player-joined")).toEqual([{ username: "inv", guest: true }]);
  expect(buildRoomState(h.state, 1, "ABC234", h.catalog, h.now).players[1]).toMatchObject({ username: "inv", guest: true });
});
it("un creador invitado aparece con guest: true en su propio asiento y en el del rival", () => { /* new Harness({ creator: { userId: "guest_c", username: "inv", guest: true } }) */ });
it("las cuentas no llevan la clave guest en ninguna vista (toEqual con los objetos de siempre)", ...);
```

- [ ] **Step 2: Ejecutar y ver que fallan:** `npx vitest run test/game/engine.lobby.test.ts test/game/view.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar** guardando `guest` en `PlayerState` solo cuando es `true` y propagándolo a las vistas y al evento con el mismo criterio.
- [ ] **Step 4: Ejecutar** la suite del servidor y `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(server): el motor y las vistas indican qué jugador es invitado`.

---

### Task 5: Partidas con invitado sin rastro en la base de datos

**Files:**
- Modify: `server/src/game/ports.ts`, `server/src/game/prisma-game-repository.ts`, `server/src/game/room.ts`, `server/src/game/room-manager.ts`
- Test (modificar): `server/test/game/fakes.ts` (el repositorio falso registra sus llamadas y trae `discardGame`), `server/test/game/room-manager.test.ts`, `server/test/game/room.test.ts`, `server/test/game/prisma-game-repository.test.ts`; (crear): `server/test/rooms/guest-games.test.ts`

**Interfaces:**
- Consumes: `RoomUser.isGuest`, el evento `PLAYER_JOINED` con `guest` (Tasks 2 y 4), `NAME_IN_USE` (Task 1).
- Produces: `GameRepository.discardGame(gameId: string): Promise<void>` (en una transacción, borra los `game_players` de esa partida y luego la fila de `games`); `GameRoom.create(ports, { code, gameId: string | null, config, creator })` con `persisted` verdadero solo si `gameId !== null`; `GameRoom.markNotPersisted(): void` (idempotente: si la sala se guardaba, deja de guardarse y encola `discardGame(gameId)` en la misma cadena de escrituras, con el reintento y el registro de errores de siempre; si falla, la sala sigue sin guardarse); con `persisted === false` todos los efectos `persist_*` se ignoran. `RoomManager.createRoom` no llama a `createGame` si el creador es invitado (el código se comprueba solo contra las salas en memoria); `RoomManager.joinRoom` lanza `AppError(409, "NAME_IN_USE", …)` si el nombre coincide (sin distinguir mayúsculas) con el del creador, y llama a `room.markNotPersisted()` **antes** de despachar `PLAYER_JOINED` cuando entra un invitado.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
// room-manager.test.ts (con el repositorio falso)
it("una sala creada por un invitado no llama a createGame ni a ninguna escritura durante toda la partida", ...);
it("una cuenta crea y se une un invitado: discardGame se llama una vez y, después, ni asiento, inicio, rondas ni final", ...);
it("si el invitado se va antes de empezar y entra una cuenta, la sala sigue sin guardarse (markNotPersisted es permanente)", ...);
it("si discardGame falla, se registra el error y la partida se juega igual sin guardarse", ...);
it("dos cuentas siguen guardándose exactamente como hoy", /* las pruebas existentes lo cubren: no se tocan */);
it("NAME_IN_USE (409) al unirse con el mismo nombre que el creador, sin distinguir mayúsculas, sea invitado o cuenta; con otro nombre entra", ...);
// prisma-game-repository.test.ts
it("discardGame borra la partida en espera y sus jugadores y no toca otras partidas", /* contar games y game_players antes y después */);
// guest-games.test.ts — el montaje de test/e2e/full-game.test.ts (app real, Socket.io real, base de pruebas)
it("el invitado crea, una cuenta se une y juegan una ronda: games, game_players, rounds y round_picks quedan sin filas y GET /stats de la cuenta sigue con played: 0", ...);
it("la cuenta crea, se une un invitado y juegan: la fila `waiting` se descarta (ninguna fila) y la partida termina bien", ...);
it("control: dos cuentas juegan y la partida sí se guarda (games > 0)", ...);
it("GET /rooms/current del invitado devuelve su sala y reconectar por socket (join-room) lo devuelve al asiento", ...);
```

- [ ] **Step 2: Ejecutar y ver que fallan:** `npx vitest run test/game test/rooms/guest-games.test.ts`. Expected: FAIL (el invitado rompe en `createGame` por la clave foránea y `discardGame` no existe).
- [ ] **Step 3: Implementar** según las Interfaces; `persist()` de `GameRoom` ignora lo que llegue con `persisted === false` y el descarte entra a la cadena por un camino propio. Además, `GameRoom.create` pasa `guest: creator.isGuest` a `createGame` del motor y `RoomManager.joinRoom` lo pasa en el evento `PLAYER_JOINED` (el vínculo entre `RoomUser.isGuest` y `guest` del motor, Task 4).
- [ ] **Step 4: Ejecutar** la suite del servidor completa y `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(server): una sala con un invitado nunca se guarda (discardGame, persisted y NAME_IN_USE)`.

---

### Task 6: Cliente — sesión, rutas y tema

**Files:**
- Modify: `client/src/api/types.ts`, `client/src/api/endpoints.ts`, `client/src/session/session-store.ts`, `client/src/routes.tsx`, `client/src/theme/theme-sync.ts`, `client/src/game/apply-event.ts`
- Test (modificar): `client/test/helpers/services.tsx` (`GUEST` y `auth.guest`), `client/test/api/endpoints.test.ts`, `client/test/session/session-store.test.ts`, `client/test/pages/routes.test.tsx`, `client/test/theme/` (la prueba de `theme-sync`), `client/test/game/apply-event.test.ts`

**Interfaces:**
- Produces: `GuestUser { id: string; username: string; guest: true }`; `SessionUser = AuthUser | GuestUser`; `isGuest(user: SessionUser | null): user is GuestUser`; `AuthSession.user: SessionUser`; `Endpoints.auth.guest(username: string): Promise<AuthSession>` (`POST /auth/guest` sin token, guarda el token como `login`); `SessionState.loginAsGuest(username: string): Promise<void>`; `RequireAccount` en `routes.tsx` (un invitado va a `/`); `PublicOnly` deja pasar a un invitado a `/login` y `/registro`; `RoomPlayerView.guest` se conserva en `apply-event` (`room-state` y `player-joined`).

- [ ] **Step 1: Escribir las pruebas que fallan**

```tsx
// endpoints.test.ts
it("auth.guest envía { username } sin token a /auth/guest y guarda el token de acceso", ...);
// session-store.test.ts
it("loginAsGuest abre la sesión como invitado: status authenticated y user { guest: true }", ...);
it("bootstrap con la cookie de invitado (refresh devuelve un invitado) deja al invitado autenticado", ...);
it("iniciar sesión o registrarse siendo invitado sustituye al invitado por la cuenta", ...);
// routes.test.tsx
it("un invitado en /perfil o /jugador/misty termina en /; en /login y /registro se queda (no se le redirige)", ...);
// theme-sync
it("con un invitado, cambiar el tema nunca llama a savePreferences ni intenta subir el del navegador; con una cuenta sigue igual", ...);
// apply-event.test.ts
it("room-state y player-joined conservan guest en players y lo quitan si el nuevo jugador no lo es", ...);
```

- [ ] **Step 2: Ejecutar y ver que fallan:** `cd client && npx vitest run test/api test/session test/pages/routes.test.tsx test/theme test/game/apply-event.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar** los tipos (`user` de `SessionState` pasa a `SessionUser | null`; `theme-sync` salta cuando `isGuest`), `loginAsGuest`, `RequireAccount` (`/perfil` y `/jugador/:username`) y el `guest` en `apply-event`.
- [ ] **Step 4: Ejecutar** la suite del cliente (`npx vitest run --testTimeout=30000`) y `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(client): sesión de invitado, rutas solo de cuentas y tema sin sincronizar para invitados`.

---

### Task 7: Cliente — acceso, encabezado y etiquetas «Invitado»

**Files:**
- Create: `client/src/pages/GuestEntry.tsx`, `client/src/components/GuestTag.tsx`
- Modify: `client/src/pages/AuthPages.tsx` (el bloque en `LoginPage`), `client/src/pages/auth-validation.ts` (`validateGuestName(name: string): string | undefined`, mensaje «Usa de 3 a 30 letras, números o guion bajo.»), `client/src/components/Header.tsx`, `client/src/components/Panels.tsx` (`OpponentPanel` acepta `guest?: boolean`), `client/src/pages/room/{WaitingView,RoundView,RoundResultView,SummaryView}.tsx`
- Test (crear): `client/test/pages/guest-entry.test.tsx`, `client/test/pages/guest-ui.test.tsx`; (modificar) `client/test/pages/mobile-layout.test.tsx` si fija las clases del encabezado

**Interfaces:**
- Consumes: `loginAsGuest`, `isGuest` (Task 6), `guest` en `RoomPlayerView` (Tasks 1 y 6).
- Produces: `<GuestEntry />` (campo «Nombre» y botón «Entrar como invitado»: valida con `validateGuestName`, recorta, llama a `session.loginAsGuest`, muestra el error del servidor con `errorMessage` y navega a `returnTo` o `/`); `<GuestTag />` (una `Badge` con el texto «Invitado»).

- [ ] **Step 1: Escribir las pruebas que fallan**

```tsx
// guest-entry.test.tsx
it("/login muestra «¿Sin cuenta? Juega como invitado» con el campo «Nombre» y el botón «Entrar como invitado»", ...);
it("un nombre inválido ('ab', 31 letras, 'a b', emoji) muestra «Usa de 3 a 30 letras, números o guion bajo.» y no llama al servidor", ...);
it("un nombre válido (con espacios en los extremos) llama a loginAsGuest con el nombre recortado y lleva al lobby (o a donde se iba)", ...);
it("un 429 del servidor muestra el mensaje de espera y se puede reintentar; pulsar dos veces seguidas envía una sola vez", ...);
// guest-ui.test.tsx
it("el encabezado de un invitado muestra «Invitado» con su nombre y «Crear cuenta» (a /registro), sin «Mi perfil», y conserva «Cerrar sesión» y «Apariencia»", ...);
it("el de una cuenta no cambia: sin etiqueta y con «Mi perfil»", ...);
it("la etiqueta «Invitado» aparece junto al jugador invitado en la sala de espera, el panel del rival, la barra «Marcador», las tarjetas del resultado y el resumen; no aparece con cuentas", ...);
it("el resumen no ofrece «Ver perfil de …» si el rival es invitado ni si quien mira es invitado; con dos cuentas sigue ofreciéndolo", ...);
it("el nombre accesible de las tarjetas de resultado sigue siendo «Resultado de {nombre}» (la etiqueta no lo cambia)", ...);
```

- [ ] **Step 2: Ejecutar y ver que fallan:** `npx vitest run test/pages/guest-entry.test.tsx test/pages/guest-ui.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implementar** los componentes y colocar `GuestTag` junto al nombre (que envuelva, no que fuerce ancho: `flex-wrap` y `min-w-0` donde corresponda); el encabezado de un invitado sustituye el enlace «Mi perfil» por el botón «Crear cuenta»; el resumen decide con `isGuest(session.user)` y `opponent.guest`.
- [ ] **Step 4: Ejecutar** la suite del cliente completa y `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(client): «Entrar como invitado», encabezado de invitado y etiqueta «Invitado»`.

---

### Task 8: E2E, documentación y verificación final

**Files:**
- Modify: `e2e/support/app.ts` (`playAsGuest(browser, label): Promise<Player>` y `guestLogin(page, name)`), `README.md`, `docs/despliegue.md` (el límite de 20 sesiones de invitado por hora y por IP en la lista de límites)
- Create: `e2e/tests/guests.spec.ts`

- [ ] **Step 1: Escribir la E2E** (las pruebas leen cada pantalla de una vez; las ventanas del juego son de 6 s y 15 s):
  1. *Un invitado y una cuenta juegan una partida completa de 1 ronda*; el invitado **recarga en plena ronda** y sigue en la sala; al terminar el perfil de la cuenta dice «Partidas 0» y el resumen no ofrece «Ver perfil de …» a ninguno.
  2. *Las etiquetas:* la cuenta ve «Invitado» junto al rival en la sala de espera y en el panel; el invitado ve en el encabezado «Invitado» y «Crear cuenta», sin «Mi perfil», y `/perfil` lo devuelve al lobby.
  3. *Dos invitados* juegan; el segundo con el mismo nombre (con otras mayúsculas) que el creador recibe «Ya hay alguien con ese nombre en la sala. Entra con otro nombre.» y puede entrar con otro.
  4. *A 375 px con un nombre de 30 letras*: el bloque de acceso, el encabezado y las etiquetas no se salen (`boundingBox` de cada pieza dentro del ancho y `scrollWidth <= clientWidth`).
- [ ] **Step 2: Ejecutar** `npm run build` y `cd e2e && E2E_CHANNEL=msedge npx playwright test tests/guests.spec.ts`. Expected: 4 passed.
- [ ] **Step 3: Documentar.** README: sección «Modo invitado» (qué es, que no guarda nada, la cookie de 24 h, el límite), `POST /auth/guest` y el refresco con la cookie en la tabla de la API, `403 ACCOUNT_REQUIRED` y `409 NAME_IN_USE`.
- [ ] **Step 4: Verificación completa** (en un clon limpio de la rama): `npm test`, `npm run typecheck`, `npm run build`, `E2E_CHANNEL=msedge npm run e2e`. Expected: todo en verde (servidor ≥ 650, cliente ≥ 746, E2E 26 + 2 omitidas) y `git status` limpio.
- [ ] **Step 5: Mutaciones.** Rompe cada protección, ejecuta la prueba de la tarea indicada, comprueba que falla y restaura (`git checkout -- <archivo>`):

| # | Cambio | Debe fallar (tarea) |
|---|---|---|
| 1 | `createRequireAccount` deja de rechazar `isGuest` | `account-vs-guest` (T2) |
| 2 | `verifyAccessToken` acepta tokens con `aud` | `guest-sessions` (T3) |
| 3 | `/auth/refresh` prefiere la cookie de invitado a la de cuenta | `guest.routes` (T3) |
| 4 | `login`/`register` no borran `guest_session` | `guest.routes` (T3) |
| 5 | el límite de `POST /auth/guest` sube a 1000 | `guest.routes` (T3) |
| 6 | `createRoom` llama a `createGame` también para invitados | `room-manager` (T5) |
| 7 | `joinRoom` no llama a `markNotPersisted` con un invitado | `room-manager` y `guest-games` (T5) |
| 8 | `persist()` ignora `persisted` | `room-manager` (T5) |
| 9 | la comparación de `NAME_IN_USE` distingue mayúsculas | `room-manager` (T5) |
| 10 | `theme-sync` sincroniza también a invitados | `theme-sync` (T6) |
| 11 | el resumen ofrece «Ver perfil de …» a un invitado | `guest-ui` (T7) |
| 12 | `RequireAccount` deja pasar a invitados | `routes` (T6) |

- [ ] **Step 6: Recorrido real** en el navegador a 375 px y a escritorio (con imágenes reales): el bloque de acceso, el encabezado de invitado, las etiquetas en cada pantalla de la partida y la auditoría de contraste (`client/scripts/contrast-audit.js` → `__contrastAuditAll()`), que debe dar una lista vacía en los 4 temas/modos.
- [ ] **Step 7: Commit y revisión final independiente** (alguien o algo con contexto limpio, con el foco de «Review Focus»); los hallazgos importantes se arreglan con TDD. **Fusionar y subir `main` solo con permiso de Marco** (Render redespliega; no hay migración).

---

## Self-Review

**Cobertura de la spec:**

| Requisito | Tarea |
|---|---|
| §1 Intención y antiobjetivos (sin filas, sin escalada, sin confusión con cuentas) | 2, 3, 5, 7 |
| §2 Entrada «Entrar como invitado» desde `/login` y regla del nombre | 3 (servidor), 7 (cliente) |
| §2 Encabezado de invitado, «Crear cuenta», acceso a `/login` y `/registro`, la cuenta sustituye al invitado | 6, 7 |
| §2 Etiqueta «Invitado» en todas las pantallas de la partida; sin perfiles; tema solo en el navegador | 6, 7 |
| §2 y §4 `NAME_IN_USE` | 1, 5 |
| §3 Identidad sin filas, token con `guest`, dos niveles, cookie, `POST /auth/guest`, refresco, salida, una sala por id | 2, 3 |
| §3 Handshake de Socket.io | 2 |
| §4 `persisted`, `discardGame`, sala de invitado sin `createGame`, permanencia | 5 |
| §4 `guest` en `RoomPlayerView` y `player-joined` | 1, 4 |
| §5 Cliente (tipos, store, rutas, tema) | 6, 7 |
| §6 Límite por IP | 3 |
| §7 Pruebas, E2E, mutaciones, revisión final | todas, 8 |

**Decisiones tomadas al escribir el plan (la spec no las contradice):** la cookie de invitado distingue su tipo por `aud: "guest-session"` y `verifyAccessToken` rechaza cualquier token con `aud`; `createRequireAuth` se retira (cada ruta elige nivel); el campo `guest` solo existe cuando es `true` (los `toEqual` de las vistas y eventos de siempre no cambian); `RoomUser.isGuest` es opcional para no tocar las pruebas existentes; `markNotPersisted` encola el descarte en la misma cadena de escrituras (conserva el orden y el reintento); `POST /auth/guest` reserva el hueco del límite antes de emitir y no lo devuelve (una sesión de invitado es barata pero no gratis); el cliente separa `GuestUser` de `AuthUser` en un `SessionUser` en vez de poner `email` y `createdAt` opcionales en `AuthUser`.

**Fuera de este plan:** la revancha (#5) debe heredar `persisted` e `isGuest` de la sala; el avatar (#6) no aplica a invitados; convertir un invitado en cuenta conservando algo, moderación de nombres y chat siguen fuera (spec §1).
