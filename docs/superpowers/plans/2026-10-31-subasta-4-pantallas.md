# Subasta Pokémon 4/6: pantallas de subasta y revelación — plan

> **Para agentes:** usa superpowers:executing-plans o superpowers:subagent-driven-development, tarea por tarea. Los pasos llevan casillas (`- [ ]`).

**Issue:** #38. **Spec:** `docs/superpowers/specs/2026-10-31-subasta-pokemon-design.md`. **Rama:** `feat/subasta-pantallas`, desde `main` cuando se fusione el PR #44.

**Objetivo:** dos personas crean una sala de subasta, pujan por los 9 lotes y ven la revelación uno por uno en un navegador real.

**Arquitectura:** el servidor ya tiene todas las reglas; aquí solo se abren los sockets y el esquema de creación. En el cliente, `GameView` recibe `auction` de `room-state`, la lógica de los botones va en una función pura y las pantallas nuevas viven en `client/src/pages/room/auction/`.

**Tecnología:** React 19, Zustand, Tailwind 4, zod, vitest + RTL, Playwright.

## Global Constraints

- **El menú no muestra el juego hasta la #39:** `PLAYABLE_GAMES` no cambia aquí. Abrirlo es una sola línea, y se hace cuando exista el combate.
- Sin migraciones. Los otros dos juegos no cambian de comportamiento.
- Nada del Pokémon real ni del mostrado llega al cliente antes de la revelación: solo la URL opaca de la silueta.
- A 360 y 375 px y en escritorio, con el nombre de usuario de 30 letras y cantidades de 7 cifras; contraste vacío en los 4 temas/modos; respeta «reducir movimiento».
- Textos en `client/src/i18n/es.ts`, con tildes. Cantidades con punto de miles (`1.000.000`), como en la spec.
- TDD: cada prueba se ve fallar antes del código.

## Decisiones de este plan (revisables)

- **Juego oculto pero alcanzable:** `POST /rooms` acepta `subasta` y `/jugar/subasta` funciona si se escribe la dirección, sin enlace desde el menú. Hace falta para la E2E. Tras la revelación, quien llegue ve «El combate llega pronto» y un botón de salir.
- **La revelación se cuenta en el cliente:** muestra un Pokémon cada 3 s, sobre los 18 s del servidor. Al recargar se ven todos los que ya tocaban según el plazo. Con «reducir movimiento» solo aparecen, sin animación.
- **«Listo» salta la revelación** (`READY`): cuando confirman los dos, sigue el servidor.
- **Sin pista de quién va ganando en el dinero:** se ve el dinero y cuántos Pokémon lleva cada uno, tal como dice la spec. Los objetos ganados se muestran con nombre.
- **Música:** la de combate (`battle`) durante toda la subasta. **Efectos:** se reutilizan los que hay, sin sintetizar nuevos: un aviso al venderse un lote y otro con la trampa.
- **Ruido en la imagen de la silueta:** no se añade. Con el mostrado no se identifica al real de una trampa, y ya pasa en el juego de silueta.

## Review Focus

1. Pulsar pujar dos veces seguidas, o justo cuando vence el turno: el `NOT_YOUR_TURN` no debe dejar un aviso de error alarmante.
2. Recargar a mitad de un lote o de la revelación: vuelve al mismo lote, con el reloj bien y sin repetir sonidos.
3. Quien no llega a la puja mínima: debe verlo y poder pasar sin esperar 10 s.
4. Abandono durante la subasta: el resumen no dice «Empate» ni «0 – 0».
5. Silueta que no carga: el lote se puede seguir pujando.

---

### Task 1: Abrir el servidor

**Files:**
- Modify: `server/src/rooms/rooms.schemas.ts`, `server/src/realtime/server.ts`, `shared/src/events.ts`
- Test: `server/test/rooms/rooms.schemas.test.ts` (o el que ya pruebe `createRoomSchema`), `server/test/realtime/` (el archivo con las pruebas de sockets de la silueta)

**Interfaces:**
- Produces: eventos de cliente `"auction-bid": ({ step: BidStep | null }) => void`, `"auction-pass": () => void`, `"auction-ready": () => void`. `POST /rooms` con `{ game: "subasta", traps?: boolean }`.

- [ ] **Step 1: Pruebas que fallan**
  - `createRoomSchema.parse({ game: "subasta" })` da `{ game: "subasta", traps: true }`, y con `traps: false` da `false`.
  - `{ game: "subasta", traps: "no" }` y `{ game: "subasta", rounds: 3 }` se rechazan.
  - Sockets: `auction-bid` con `{ step: 7 }` o sin datos responde un error de validación y el estado no cambia. Una puja válida de quien tiene el turno cambia `currentBid` en el `room-state` de los dos.
- [ ] **Step 2: Correrlas.** `cd server && npx vitest run test/rooms test/realtime --testTimeout=30000`. Esperado: fallan porque el esquema convierte `subasta` en error y no hay evento.
- [ ] **Step 3: Implementar.** `auctionSchema` estricto como `silhouetteSchema`. En `server.ts`, tres `socket.on` con `handle(...)`: `BID`, `PASS` y `READY`. `step` se valida con unión de literales de `BID_STEPS` o `null`.
- [ ] **Step 4: Correrlas.** Esperado: pasan.
- [ ] **Step 5: Commit.** `feat: abrir en el servidor la creación y las pujas de la subasta (#38)`

### Task 2: El cliente entiende la subasta

**Files:**
- Modify: `client/src/game/apply-event.ts`, `client/src/game/game-client.ts`, `client/src/sound/cues.ts`
- Create: `client/src/game/auction-bids.ts`
- Test: `client/test/game/apply-event.test.ts`, `client/test/game/auction-bids.test.ts`, `client/test/sound/cues.test.ts`

**Interfaces:**
- Produces:
  - `GameView.auction: AuctionStateView | null` y `GameView.lastSale: AuctionSalePayload | null`.
  - `client.bid(step: BidStep | null)`, `client.pass()`, `client.ready()`.
  - `bidOptions(lot: AuctionLotView): { step: BidStep | null; amount: number; affordable: boolean }[]`.

- [ ] **Step 1: Pruebas que fallan**
  - `room-state` con `auction` lo copia a la vista; sin él queda `null`.
  - `auction-sale` guarda `lastSale`; `auction-reveal` no cambia la fase, que llega en `room-state`.
  - `bidOptions` sin puja: una sola opción, `{ step: null, amount: price }`.
  - `bidOptions` con `currentBid: 200_000`, `myLimit: 260_000`: `210.000` y `250.000` alcanzables, `300.000` no.
  - Con `myLimit` menor que el precio inicial: la opción sale con `affordable: false`.
  - `musicCueFor` da `battle` en `auction` y `reveal`. `effectsForEvent` da un efecto con `auction-sale` y ninguno con `room-state`.
- [ ] **Step 2: Correrlas.** `cd client && npx vitest run test/game test/sound --testTimeout=30000 --maxWorkers=2`. Esperado: fallan.
- [ ] **Step 3: Implementar** en esos archivos, siguiendo cómo se trata `silhouette`.
- [ ] **Step 4: Correrlas.** Esperado: pasan.
- [ ] **Step 5: Commit.** `feat: el cliente recibe la subasta y calcula las pujas posibles (#38)`

### Task 3: Crear la sala

**Files:**
- Modify: `shared/src/games.ts`, `client/src/pages/Lobby.tsx`, `client/src/components/GameArt.tsx`, `client/src/pages/room/WaitingView.tsx`, `client/src/i18n/es.ts`
- Test: `client/test/pages/lobby.test.tsx` (o el que ya exista), `client/test/pages/room/waiting-view.test.tsx`

**Interfaces:**
- Produces: `gameFromSlug` busca en `GAME_KINDS`, no en `PLAYABLE_GAMES`; `endpoints.rooms.create` acepta `{ game: "subasta"; traps: boolean }`.

- [ ] **Step 1: Pruebas que fallan**
  - En `/jugar/subasta` hay un interruptor «Siluetas trampa», encendido por defecto, y crear envía `{ game: "subasta", traps: true }`; apagado, `traps: false`.
  - `gameFromSlug("subasta")` da `"subasta"`, y `PLAYABLE_GAMES` sigue con dos juegos, sin la subasta.
  - `WaitingView` describe «Con siluetas trampa» o «Sin siluetas trampa».
  - `GameArt` de la subasta no pinta la silueta del juego de silueta.
- [ ] **Step 2: Correrlas.** Esperado: fallan.
- [ ] **Step 3: Implementar** `CreateAuctionRoomCard`, junto a `CreateSilhouetteRoomCard`. `GameArt` para la subasta: una silueta con una etiqueta de precio y los colores del tema.
- [ ] **Step 4: Correrlas.** Esperado: pasan.
- [ ] **Step 5: Commit.** `feat: crear una sala de subasta con la opción de siluetas trampa (#38)`

### Task 4: Pantalla de puja

**Files:**
- Create: `client/src/pages/room/auction/AuctionView.tsx`, `client/src/pages/room/auction/AuctionPlayers.tsx`
- Modify: `client/src/pages/room/RoomPage.tsx`, `client/src/pages/room/SilhouetteRoundView.tsx` (exportar `SilhouetteImage`), `client/src/i18n/es.ts`, `client/src/game/durations.ts`
- Test: `client/test/pages/room/auction-view.test.tsx`

**Interfaces:**
- Consumes: `bidOptions`, `client.bid`, `client.pass`, `GameView.auction`, `GameView.lastSale`.
- Produces: `AuctionPlayers`, que se reutiliza en la revelación; `AUCTION_TURN_MS = 10_000`.

- [ ] **Step 1: Pruebas que fallan**
  - Lote de Pokémon: se ve la silueta con su texto alternativo, «Lote 3 de 9», el precio y el dinero de los dos.
  - Lote de objeto: se ve el nombre del objeto y lo que hace, sin silueta.
  - En mi turno: botones con la cantidad total («Pujar 210.000») y «Pasar»; pulsar llama a `client.bid(10_000)` o a `client.pass()`.
  - En el turno del rival: sin botones, y «Le toca a <nombre>».
  - Con todas las opciones sin alcanzar: aviso «No te alcanza: solo puedes pasar», botones desactivados y «Pasar» activo.
  - Con parte sin alcanzar: esas opciones desactivadas, las demás activas.
  - Silueta que no carga (`fireEvent.error`): aviso y los botones siguen.
  - `lastSale` se anuncia en la zona `role="log"`: «<nombre> se lleva el lote por 210.000»; o «Nadie se lleva el objeto» con ganador nulo.
  - Un `NOT_YOUR_TURN` no muestra el aviso rojo durante la subasta (el turno ya cambió en pantalla).
- [ ] **Step 2: Correrlas.** `cd client && npx vitest run test/pages/room/auction-view.test.tsx --testTimeout=30000`. Esperado: fallan.
- [ ] **Step 3: Implementar.** `RoomView` enruta `auction` a `AuctionView`. Reloj con `Timer` y `useLastSeconds`, con `answered` = «no es mi turno». Tocar los botones: al menos 44 px de alto.
- [ ] **Step 4: Correrlas.** Esperado: pasan.
- [ ] **Step 5: Commit.** `feat: pantalla de puja de la subasta (#38)`

### Task 5: Revelación, espera del combate y resumen

**Files:**
- Create: `client/src/pages/room/auction/RevealView.tsx`, `client/src/pages/room/auction/BattleSoonView.tsx`
- Modify: `client/src/pages/room/RoomPage.tsx`, `client/src/pages/room/SummaryView.tsx`, `client/src/i18n/es.ts`
- Test: `client/test/pages/room/auction-reveal.test.tsx`, `client/test/pages/room/summary-view.test.tsx`

**Interfaces:**
- Consumes: `AuctionStateView.reveal`, `battle.deadline` y `battle.confirmed`, `client.ready`, `AuctionPlayers`.
- Produces: `revealedCount(deadline: number, now: number, total: number): number`, en `RevealView.tsx`, con 3 s por Pokémon sobre `REVEAL_MS = 18_000`.

- [ ] **Step 1: Pruebas que fallan**
  - `revealedCount`: 1 al empezar, 2 a los 3 s, 6 a los 15 s; nunca más que `total` ni menos de 1.
  - Solo se ven los ya revelados; los demás, como silueta sin nombre.
  - Entrada con `wasTrap`: «¡Era una trampa!». Sin él, no.
  - Al recargar a mitad (`deadline` a 6 s), se ven 5 de golpe.
  - «Listo» llama a `client.ready()`. Con `confirmed: true` se desactiva y dice «Esperando al rival…».
  - Con `prefers-reduced-motion`, las entradas no llevan la clase de animación.
  - `lineup`, `battle` y `battle_pause` muestran «El combate llega pronto» y salir.
  - `SummaryView` de una subasta terminada: sin «0 – 0» ni «Empate»; muestra quién ganó y por qué.
- [ ] **Step 2: Correrlas.** Esperado: fallan.
- [ ] **Step 3: Implementar.** Equipos en dos columnas en escritorio y apilados a 360 px. Anuncio de cada Pokémon en `role="log"`.
- [ ] **Step 4: Correrlas.** Esperado: pasan.
- [ ] **Step 5: Commit.** `feat: revelación de la subasta, uno por uno, con su trampa (#38)`

### Task 6: Con dos navegadores de verdad

**Files:**
- Create: `e2e/tests/auction.spec.ts`
- Modify: `docs/guia-tecnica.md`

- [ ] **Step 1: Prueba E2E.** Avisar a Marco antes: corre con Edge sin ventana y hay que tener el equipo enchufado.
  - Los dos entran a `/jugar/subasta` y crean y unen la sala, sin trampas.
  - Se juegan los 9 lotes con puja y pase; el dinero baja en las dos pantallas.
  - Una recarga a mitad de un lote vuelve al mismo lote.
  - Se llega a la revelación, los dos pulsan «Listo» y aparece «El combate llega pronto».
  - El menú principal no muestra la subasta.
  - A 360 px no hay nada fuera de la caja de la pantalla (`boundingBox`), con un nombre de 30 letras.
- [ ] **Step 2: Correrla.** `E2E_CHANNEL=msedge npx playwright test auction` desde `e2e/`. Esperado: pasa.
- [ ] **Step 3: Mirarlo.** Navegador real a 375 px y en escritorio, con imágenes reales. Auditoría de contraste (`__contrastAuditAll()`): lista vacía en los 4 temas/modos.
- [ ] **Step 4: Guía.** Añadir `auction-bid`, `auction-pass`, `auction-ready`, `auction-sale`, `auction-reveal` e `INVALID_BID`.
- [ ] **Step 5: Verificación completa.** `npm run typecheck`, las dos suites, `npm run build` y `E2E_CHANNEL=msedge npm run e2e`. Esperado: todo en verde.
- [ ] **Step 6: Commit.** `test: partida de subasta con dos navegadores (#38)`

Al terminar: revisión independiente de la rama con foco en la sección Review Focus, PR con `Closes #38`, y pedir permiso a Marco para fusionar.
