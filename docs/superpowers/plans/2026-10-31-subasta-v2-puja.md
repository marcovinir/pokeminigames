# Subasta Pokémon v2, proyecto 1: nueva puja — plan

> **Para agentes:** usa superpowers:executing-plans o superpowers:subagent-driven-development, tarea por tarea. Los pasos llevan casillas (`- [ ]`).

**Spec:** `docs/superpowers/specs/2026-10-31-subasta-v2-puja-design.md`. **Rama:** `feat/subasta-v2-puja`, desde `main`.

**Objetivo:** subasta sin reloj ni objetos, con 12 lotes y equipos de 6, en las pantallas pixel art del boceto aprobado.

**Arquitectura:** el motor sigue siendo un reductor puro, y las reglas se comparten con el simulador. El reloj de turno se sustituye por un temporizador interno de inactividad que no se muestra hasta el aviso. Las pantallas siguen en `client/src/pages/room/auction/`. Todo entra en un solo PR, porque el juego está en vivo y no puede quedar a medias.

**Tecnología:** React 19, Tailwind 4, zod, pngjs (solo para generar fondos), `@fontsource` para Pixelify Sans, vitest + RTL, Playwright.

## Global Constraints

- Sin migraciones. Doble tipo y silueta no cambian. Prisma fijo en 7.10.0.
- Nada delata al Pokémon antes de la revelación: el fondo se sortea sin consultarlo.
- Valores de la spec: 12 lotes (4/4/4), 6 por jugador, 60 s + aviso de 15 s, máximo 2 «Sigo aquí» por turno, revelación de 36 s, alineación de 30 s, lote automático de 2 s.
- A 360 y 375 px y en escritorio, con nombre de 30 letras; contraste vacío en los 4 temas/modos; «reducir movimiento».
- TDD; cada prueba se ve fallar antes del código.

## Review Focus

1. Toques tardíos justo cuando otro se retira o vence el aviso: `turnId` tiene que cubrir también «Sigo aquí».
2. Recargar con el aviso abierto y durante un lote automático: mismo estado y cuenta atrás correcta, sin sonidos repetidos.
3. Desconexión con el aviso abierto: nadie se retira estando caído, y al volver hay un último aviso. Los dos caídos no bloquean la partida.
4. Quien solo puede retirarse: el botón de pujar no aparece activo y la pantalla lo explica, sin esperar 60 s en silencio.
5. Restos de objetos y reloj: textos de la guía, resumen y sonidos de «últimos segundos» en la puja.

---

### Task 1: Reglas y simulador

**Files:** Modify `server/src/game/auction/rules.ts`, `simulation.ts`, `combat.ts`. Test `server/test/game/auction-rules.test.ts`, `auction-combat.test.ts`.

**Interfaces — Produces:** `TEAM_SIZE = 6`, `LOTS = 12`, `INACTIVITY_MS = 60_000`, `INACTIVITY_WARNING_MS = 15_000`, `MAX_STILL_HERE = 2`, `AUTO_LOT_MS = 2_000`, `REVEAL_MS = 36_000`, `LINEUP_MS = 30_000`. Sin `ITEM_PRICES`, `applyItem` ni Cinta.

- [ ] **Step 1: Pruebas que fallan.** `drawLots` da 12 con 4/4/4, sin repetir. `bidCap` con huecos de 6. `combat.ts` sin objetos. El simulador: retirarse definitivo, todos completan 6, ningún combate sin terminar.
- [ ] **Step 2: Correrlas.** `cd server && npx vitest run test/game/auction-rules.test.ts test/game/auction-combat.test.ts --testTimeout=30000`. Esperado: fallan.
- [ ] **Step 3: Implementar** y correr `npm run auction:simulate -w server -- 1000`.
- [ ] **Step 4: Ajustar** `STARTING_MONEY` y `PRICE_PER_STAT` hasta cumplir la spec: reconocer siluetas gana sin ganar siempre, y guardar dinero no es lo mejor siempre. Anotar el resultado en la spec.
- [ ] **Step 5: Commit.** `feat: reglas de 12 lotes y 6 por jugador, sin objetos`

### Task 2: Motor de la puja

**Files:** Modify `server/src/game/auction/engine.ts`, `types.ts`, `view.ts`, `server/src/game/engine/types.ts`, `shared/src/auction.ts`. Test `server/test/game/auction.engine.test.ts`.

**Interfaces — Produces:**
- `AuctionLotView`: sin `deadline`; con `scene: "bosque"|"volcan"|"playa"|"noche"`, `turnId`, `warningUntil: number|null` (solo a quien tiene el turno; el rival recibe `rivalIdle: boolean`), `bids: {seat, amount}[]`, `retired: Seat|null`, `auto: boolean`.
- `AuctionStateView.purchases: Record<Seat, string[]>`, las URL de silueta de lo comprado.
- `GameEvent` `STILL_HERE {seat, turnId}`; `TimerId` `{kind:"idle"; turn}` y `{kind:"auto_lot"; lot}`.

- [ ] **Step 1: Pruebas que fallan.**
  - Retirarse con puja: el otro se lo lleva por esa puja.
  - Retirarse sin puja: el otro abre y se lo lleva al precio inicial en ese momento, o se retira y se aplica la regla de menos Pokémon.
  - Quien se retiró no recibe más el turno de ese lote.
  - Sin acción: nada ocurre a los 59 s, a los 60 s se abre el aviso, y a los 75 s se retira.
  - `STILL_HERE` reinicia; la tercera vez que se abriría el aviso se retira; con otro `turnId`, `NOT_YOUR_TURN`.
  - Caído con el plazo vencido: no se retira. Al volver, aviso de 15 s que no cuenta.
  - Lote automático: 2 s, con token y `wasTrap` correcto.
  - El fondo sale del azar: con el mismo azar y otro catálogo es el mismo; sus valores se reparten en 1000 sorteos.
  - Fuzz con dos que nunca responden: siempre termina. Un cliente que pulsa «Sigo aquí» sin parar: el lote termina.
- [ ] **Step 2: Correrlas.** Esperado: fallan.
- [ ] **Step 3: Implementar.** Quitar `firstPassed` por `retired`.
- [ ] **Step 4: Correrlas.** Esperado: pasan.
- [ ] **Step 5: Commit.** `feat: puja sin reloj, retirarse definitivo y aviso de inactividad`

### Task 3: Combate sin objetos

**Files:** Modify `server/src/game/auction/engine.ts`, `view.ts`, `shared/src/auction.ts`, `shared/src/events.ts`. Test `server/test/game/auction.battle.test.ts`, `auction.view.test.ts`.

**Interfaces — Produces:** `PauseChoice { titular }`; `BattleView` sin `cinta`; `AuctionSummary.spent: Record<Seat, number>`; `AuctionStateView` sin `items`.

- [ ] **Step 1: Ajustar pruebas:** alineación de 6, revelación de 12, pausa solo con titular, sin nadie vivo pierde, resumen sin objetos, y nada de `item`, `pocion`, `revivir` ni `cinta` en una partida entera (`JSON.stringify` de vistas y eventos).
- [ ] **Step 2: Correrlas.** Esperado: fallan.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correrlas.** Esperado: pasan.
- [ ] **Step 5: Commit.** `feat: combate de la subasta sin objetos`

### Task 4: Sockets y cliente

**Files:** Modify `server/src/realtime/server.ts`, `server/src/rooms/...` si hace falta, `client/src/game/apply-event.ts`, `game-client.ts`, `auction-bids.ts`, `battle.ts`, `client/src/sound/cues.ts`. Test `server/test/rooms/auction.test.ts`, `client/test/game/*`, `client/test/sound/cues.test.ts`.

**Interfaces — Produces:** evento `auction-still-here ({turnId})`, `client.stillHere(turnId)`; `auction-pause ({titular})`; se quitan `validTargets` y `AUCTION_ITEM_LABELS`.

- [ ] **Step 1: Pruebas que fallan** de esquemas, de `bidOptions` y de que el aviso abierto suene una sola vez.
- [ ] **Step 2: Correrlas.** Esperado: fallan.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correrlas.** Esperado: pasan.
- [ ] **Step 5: Commit.** `feat: el cliente entiende la nueva puja`

### Task 5: Pantalla de puja

**Files:** Create `client/public/auction/lote-{bosque,volcan,playa,noche}.png`, `client/scripts/make-auction-scenes.cjs`, `client/src/pages/room/auction/AuctionHelp.tsx`, `TurnBanner.tsx`. Modify `AuctionView.tsx`, `AuctionPlayers.tsx`, `client/src/index.css`, `client/src/i18n/es.ts`, `client/package.json` (`@fontsource/pixelify-sans`). Test `client/test/pages/auction-view.test.tsx`.

- [ ] **Step 1: Pruebas que fallan.**
  - Franja «¡Te toca pujar!» o «Le toca a misty».
  - El fondo es el de `lot.scene`.
  - Paneles con 6 huecos y siluetas de lo comprado; historial de pujas.
  - Botones con salto y «queda en»; «Retirarme» con su consecuencia, con y sin puja.
  - «No te alcanza: solo puedes retirarte».
  - Aviso: «¿Sigues ahí?» con botón y cuenta atrás; el rival ve «Esperando a X…».
  - Sin reloj fuera del aviso.
  - Explicación de 3 pasos la primera vez, con `localStorage`, que funciona si este falla, y botón «?».
  - Sello de venta; con «reducir movimiento», sin desplazamientos. Lote automático sin botones.
- [ ] **Step 2: Correrlas.** Esperado: fallan.
- [ ] **Step 3: Implementar,** partiendo del boceto. Los fondos salen de `design-assets/make.cjs` del boceto, pasado al repositorio.
- [ ] **Step 4: Correrlas.** Esperado: pasan.
- [ ] **Step 5: Commit.** `feat: pantalla de puja en pixel art`

### Task 6: Revelación, alineación, pausa y resumen

**Files:** Modify `RevealView.tsx`, `LineupView.tsx`, `PauseView.tsx`, `AuctionSummary.tsx`, `client/src/pages/room/RoomPage.tsx`, `README.md`, `README.es.md`, `docs/guia-tecnica.md`, `client/src/i18n/es.ts` (descripción del juego). Test `client/test/pages/auction-reveal.test.tsx`, `auction-lineup.test.tsx`, `auction-pause.test.tsx`.

- [ ] **Step 1: Pruebas que fallan.** Revelación de 12 con sprites y trampa; alineación de 6 a 30 s; pausa solo con titular; resumen sin objetos; textos de ayuda sin objetos.
- [ ] **Step 2: Correrlas.** Esperado: fallan.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correrlas.** Esperado: pasan.
- [ ] **Step 5: Commit.** `feat: revelación, alineación y pausa con equipos de 6`

### Task 7: De verdad

**Files:** Modify `e2e/tests/auction.spec.ts`.

- [ ] **Step 1: E2E.** Avisar a Marco antes: corre con Edge sin ventana y hay que tener el equipo enchufado. Partida completa con 12 lotes, recarga en una puja y en el aviso, revancha.
- [ ] **Step 2: Mirarlo.** Capturas a 360, 375 y escritorio con imágenes reales; contraste vacío en los 4 temas/modos.
- [ ] **Step 3: Verificación completa.** `npm run typecheck`, las dos suites, `npm run build`, `E2E_CHANNEL=msedge npm run e2e`. Esperado: todo en verde.
- [ ] **Step 4: Commit.** `test: partida completa de la nueva puja`

Al terminar: mutaciones de retirarse, aviso y `turnId`; revisión independiente; PR; permiso de Marco para fusionar, porque cambia el juego en vivo. Tras desplegar, prueba de humo y actualizar #11 y la memoria.
