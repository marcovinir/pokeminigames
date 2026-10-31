# Subasta Pokémon 5/6: pantallas de combate y apertura del juego — plan

> **Para agentes:** usa superpowers:executing-plans o superpowers:subagent-driven-development, tarea por tarea. Los pasos llevan casillas (`- [ ]`).

**Issue:** #39. **Spec:** `docs/superpowers/specs/2026-10-31-subasta-pokemon-design.md` (sobre todo «Cómo se ve el combate»). **Rama:** `feat/subasta-combate-pantallas`, desde `main` con el PR #45 fusionado.

**Objetivo:** el juego completo y abierto a todos: alineación, combate de vista lateral con barras de vida, pausa con objetos, resumen y revancha.

**Arquitectura:** el motor ya está hecho (#37); aquí se abren sus tres eventos por socket. En el cliente, lo que se decide con reglas (color de la barra, sprite, textos del registro, objetivos válidos) va en funciones puras de `client/src/game/battle.ts`, y las pantallas viven en `client/src/pages/room/auction/`.

**Tecnología:** React 19, Zustand, Tailwind 4, zod, vitest + RTL, Playwright.

## Global Constraints

- Sprites de `other/showdown/{id}.gif`; los 14 sin animación (990–995, 1006, 1008, 1010, 1017 y 1022–1025) usan la imagen fija. Sin modelos propios.
- Barra: verde por encima del 50 %, amarilla hasta el 20 %, roja por debajo. Tú a la izquierda, el rival a la derecha y volteado.
- Embestida de 200 ms ida y vuelta, vibración con destello rojo que tiñe solo al Pokémon, «K.O.» en grande. Con «reducir movimiento», solo un destello.
- Solo efecto genérico: los 18 por tipo son la #42, que no toca `server/src/game/` ni `shared/`.
- Sin migraciones: el historial es la #40.
- A 360 y 375 px y en escritorio, con nombre de 30 letras; contraste vacío en los 4 temas/modos. TDD; textos en `client/src/i18n/es.ts`.

## Decisiones de este plan (revisables)

- **El registro para lectores de pantalla:** el registro visible va con `aria-hidden`; la zona `role="log"` lee una sola frase por turno. Así no se satura.
- **El registro vive en el cliente:** guarda los últimos 30 turnos y se vacía al recargar. Las barras, el titular y lo decidido sí se recuperan. Quien recarga durante los 3 s de animación ve los PS ya actualizados, sin repetirla.
- **El orden del rival no se ve:** `rivalTeam` va siempre en orden de compra, para no delatar quién es su reserva. Solo se ve su titular.
- **Pausa:** una lista por objeto con sus objetivos válidos, y el titular se elige con botones. Lo revivido en la misma pausa se puede elegir como titular.
- **Cinta:** se ve como una etiqueta en la barra de quien la lleva, pues el servidor ya la publica al cerrar la pausa.
- **Sonidos:** se reutilizan los efectos que hay: `round` al golpear, `rival` al recibir golpe, `wrong` en el K.O. Sin sintetizar nuevos.
- **Apertura:** esta issue añade `subasta` a `PLAYABLE_GAMES`, con la tarjeta del menú. Con esta fusión queda abierto al público.

## Review Focus

1. Recargar en alineación, al elegir, en animación y en pausa: lo ya decidido sigue marcado y no se repiten sonidos.
2. Un `battle-turn` que llega con el combate ya en otra fase, o varios muy seguidos: las animaciones no se pisan ni dejan un Pokémon teñido.
3. Sprites que no cargan (los 14 sin animación y un fallo de red): queda la imagen fija, y si tampoco, algo que no rompa la pantalla.
4. Pausa sin titular posible y con un Revivir: la pantalla lo explica en vez de dejar un botón muerto.
5. Nombres largos y 3 Pokémon con barras a 360 px: nada se sale, y el rival volteado no voltea el texto.

---

### Task 1: Abrir el combate en el servidor

**Files:**
- Modify: `shared/src/events.ts`, `server/src/realtime/server.ts`, `server/src/game/auction/view.ts`
- Test: `server/test/rooms/auction.test.ts`, `server/test/game/auction.battle.test.ts`

**Interfaces:**
- Produces: eventos de cliente `"auction-lineup": ({ order: number[] })`, `"auction-move": ({ move: BattleMove })`, `"auction-pause": ({ choice: PauseChoice })`.

- [ ] **Step 1: Pruebas que fallan**
  - Por sockets, una partida con `advance`: alineación con `auction-lineup`, un turno con `auction-move`, y `battle-turn` llega a los dos.
  - `auction-move` con `{ move: 7 }` y `auction-pause` con `{ choice: { items: "x", titular: 1 } }` o con campos extra responden error de validación, sin cambiar el estado.
  - Revancha de subasta: al terminar, los dos aceptan y la sala nueva conserva `traps` y arranca desde la subasta con dinero nuevo.
  - `rivalTeam` sale en orden de compra aunque el rival confirme otro orden.
  - El fuzz de `auction.battle.test.ts` también envía `null`, objetos válidos y desconexiones, y siempre termina.
- [ ] **Step 2: Correrlas.** `cd server && npx vitest run test/rooms/auction.test.ts test/game/auction.battle.test.ts --testTimeout=120000`. Esperado: fallan.
- [ ] **Step 3: Implementar.** Esquemas `strictObject`; `move` y `item` se validan con listas. Despacho a `CHOOSE_LINEUP`, `CHOOSE_MOVE` y `PAUSE_CONFIRM`.
- [ ] **Step 4: Correrlas.** Esperado: pasan.
- [ ] **Step 5: Commit.** `feat: abrir en el servidor el combate de la subasta (#39)`

### Task 2: La lógica del cliente

**Files:**
- Create: `client/src/game/battle.ts`
- Modify: `client/src/game/apply-event.ts`, `client/src/game/game-client.ts`, `client/src/sound/cues.ts`, `client/src/catalog/artwork.ts`, `client/src/i18n/es.ts`
- Test: `client/test/game/battle.test.ts`, `client/test/game/apply-event.test.ts`, `client/test/sound/cues.test.ts`

**Interfaces:**
- Produces:
  - `hpTone(hp: number, maxHp: number): "good" | "warn" | "danger"`.
  - `battleSpriteUrl(id: number): string` en `artwork.ts`.
  - `turnLines(actions: BattleAction[], nameOf: (seat: Seat) => string): string[]` y `turnSummary(...)`: `string`, la frase única para el lector.
  - `validTargets(item: AuctionItem, team: BattleFighterView[]): number[]`.
  - `pauseTitulars(team: BattleFighterView[], items: PauseChoice["items"]): number[]`.
  - `GameView.battleLog: { round: number; turn: number; actions: BattleAction[] }[]` y `GameView.lastRoundEnd`.
  - `client.lineup(order)`, `client.move(move)`, `client.pauseConfirm(choice)`.

- [ ] **Step 1: Pruebas que fallan**
  - `hpTone`: 51 de 100 `good`, 50 `warn`, 20 `warn`, 19 `danger`, 0 `danger`.
  - `battleSpriteUrl(6)` termina en `other/showdown/6.gif`. `battleSpriteUrl(990)` y `1025` no contienen `showdown`.
  - `turnLines`: «Charizard usó Ataque Fuego: 42 de daño. ¡Crítico! ¡Es muy eficaz!»; ×0 «No afecta»; Recuperar «recuperó 30 PS».
  - `validTargets`: Poción solo vivos heridos; Revivir solo debilitados; Cinta, lista vacía.
  - `pauseTitulars`: los vivos, más quien se revive en esa elección.
  - `battle-turn` añade al registro y guarda como mucho 30; `room-state` no lo borra salvo que cambie la sala.
  - `effectsForEvent`: `battle-turn` da `round` si ataco yo primero y `rival` si no; `battle-round-ended` da `wrong`; `room-state`, nada.
- [ ] **Step 2: Correrlas.** Esperado: fallan.
- [ ] **Step 3: Implementar** en esos archivos.
- [ ] **Step 4: Correrlas.** Esperado: pasan.
- [ ] **Step 5: Commit.** `feat: la lógica del combate en el cliente (#39)`

### Task 3: Alineación

**Files:**
- Create: `client/src/pages/room/auction/LineupView.tsx`
- Modify: `client/src/pages/room/RoomPage.tsx`
- Test: `client/test/pages/auction-lineup.test.tsx`

- [ ] **Step 1: Pruebas que fallan**
  - Lista con mis 3 en orden de compra, con botones «Subir» y «Bajar»; el primero dice «Titular». «Subir» del primero y «Bajar» del último están desactivados.
  - Se ve el equipo rival, sin titular.
  - «Confirmar» llama a `client.lineup(orden)`. Con `confirmed: true` queda el orden de `myLineup` y «Esperando al rival…».
  - Al subir un Pokémon, el foco se queda en su botón, y se anuncia su nueva posición.
- [ ] **Step 2: Correrlas.** Esperado: fallan.
- [ ] **Step 3: Implementar** con `Timer` de 20 s.
- [ ] **Step 4: Correrlas.** Esperado: pasan.
- [ ] **Step 5: Commit.** `feat: alineación de la subasta con botones (#39)`

### Task 4: El combate

**Files:**
- Create: `client/src/pages/room/auction/BattleScreen.tsx`, `HpBar.tsx`, `BattleSprite.tsx`, `BattleLog.tsx`
- Modify: `client/src/pages/room/RoomPage.tsx`, `client/src/index.css`
- Test: `client/test/pages/auction-battle.test.tsx`

**Interfaces:**
- Consumes: `hpTone`, `battleSpriteUrl`, `turnLines`, `turnSummary`, `client.move`, `BattleView`.

- [ ] **Step 1: Pruebas que fallan**
  - Barras con `role="meter"`, valor y nombre; PS en números; tono según `hpTone`. Reloj en el centro.
  - Sprite rival con la clase de volteado; el texto de su barra, no.
  - Botones con nombre genérico y eficacia: «Ataque Fuego ×2», «Forcejeo», «Recuperar» (desactivado si `used`). Pulsar llama a `client.move("fire")` y marca el elegido con `myMove`; recargar con `myMove` lo mantiene marcado.
  - Con `deadline: null` no hay botones y se lee «Resolviendo…».
  - Un `battle-turn` añade líneas al registro visible (`aria-hidden`), y `role="log"` recibe una sola frase.
  - `battle-round-ended` muestra «K.O.»; se quita al cambiar de fase.
  - Si el GIF falla, pasa a la imagen fija; si también falla, el nombre.
  - Con «reducir movimiento» no hay clases de embestida ni vibración, solo el destello.
- [ ] **Step 2: Correrlas.** Esperado: fallan.
- [ ] **Step 3: Implementar.** Animaciones con clases CSS que se quitan por `animationend` y por tiempo de seguridad. Los efectos usan los colores del tema, y el destello tiñe solo el sprite con un filtro CSS.
- [ ] **Step 4: Correrlas.** Esperado: pasan.
- [ ] **Step 5: Commit.** `feat: pantalla de combate de vista lateral (#39)`

### Task 5: Pausa entre asaltos

**Files:**
- Create: `client/src/pages/room/auction/PauseView.tsx`
- Modify: `client/src/pages/room/RoomPage.tsx`
- Test: `client/test/pages/auction-pause.test.tsx`

**Interfaces:**
- Consumes: `validTargets`, `pauseTitulars`, `client.pauseConfirm`.

- [ ] **Step 1: Pruebas que fallan**
  - Cada objeto propio con sus objetivos válidos; Poción sobre un sano o Revivir sobre un vivo no se ofrecen. Cinta es un interruptor.
  - Dos Revivir se pueden usar en dos Pokémon distintos, y el mismo objetivo no se ofrece dos veces.
  - Titular con botones; al elegir Revivir sobre un debilitado, aparece como titular posible. Al quitarlo, si era el elegido, se deselecciona.
  - Sin titular posible y con Revivir: «Usa Revivir o perderás al acabar el tiempo».
  - Sin titular posible y sin objetos: «No te quedan Pokémon» y ningún botón.
  - «Confirmar» envía `{ items, titular }`; `confirmed` con `myPause` muestra lo elegido y «Esperando al rival…».
  - El titular del rival no aparece.
- [ ] **Step 2: Correrlas.** Esperado: fallan.
- [ ] **Step 3: Implementar** con `Timer` de 15 s.
- [ ] **Step 4: Correrlas.** Esperado: pasan.
- [ ] **Step 5: Commit.** `feat: pausa entre asaltos con objetos y titular (#39)`

### Task 6: Resumen y apertura

**Files:**
- Create: `client/src/pages/room/auction/AuctionSummary.tsx`
- Delete: `client/src/pages/room/auction/BattleSoonView.tsx`
- Modify: `shared/src/games.ts`, `client/src/pages/room/SummaryView.tsx`, `client/src/pages/MainMenu.tsx`, `client/src/pages/menu-art.ts`, `README.md`, `README.es.md`, `docs/guia-tecnica.md`
- Test: `client/test/pages/auction-reveal.test.tsx`, `client/test/pages/main-menu.test.tsx`, `server/test/game/auction.engine.test.ts`

- [ ] **Step 1: Pruebas que fallan**
  - Resumen: ganador, los dos equipos, daño de cada uno, y gasto en Pokémon y en objetos.
  - `PLAYABLE_GAMES` incluye `subasta`; el menú muestra su tarjeta con enlace a `/jugar/subasta`.
  - La pantalla de acceso y la página de información la listan (ya salen de `PLAYABLE_GAMES`).
  - `RematchPanel` aparece al terminar una partida completada.
- [ ] **Step 2: Correrlas.** Esperado: fallan.
- [ ] **Step 3: Implementar,** y actualizar los dos README y la guía con el juego, sus eventos y el aviso de marcas.
- [ ] **Step 4: Correrlas.** Esperado: pasan.
- [ ] **Step 5: Commit.** `feat: resumen de la subasta y juego abierto en el menú (#39)`

### Task 7: Partida completa de verdad

**Files:**
- Modify: `e2e/tests/auction.spec.ts`

- [ ] **Step 1: E2E.** Avisar a Marco antes: corre con Edge sin ventana y hay que tener el equipo enchufado.
  - Desde el menú: subasta, revelación, alineación con un cambio de orden, turnos hasta el final y resumen.
  - Recargar durante un combate y durante una pausa devuelve al mismo estado.
  - Revancha: la sala nueva empieza con 1.000.000.
  - A 360 px, nada se sale de la caja de la pantalla con un nombre de 30 letras.
- [ ] **Step 2: Correrla.** `E2E_CHANNEL=msedge npm run e2e -- tests/auction.spec.ts`. Esperado: pasa.
- [ ] **Step 3: Mirarlo.** Capturas a 360, 375 y escritorio de alineación, combate, pausa y resumen, con imágenes reales. Auditoría de contraste vacía en los 4 temas/modos.
- [ ] **Step 4: Verificación completa.** `npm run typecheck`, las dos suites, `npm run build`, `E2E_CHANNEL=msedge npm run e2e`. Esperado: todo en verde.
- [ ] **Step 5: Commit.** `test: partida completa de subasta con reconexión y revancha (#39)`

Al terminar: mutaciones de `hpTone`, `validTargets` y `pauseTitulars`; revisión independiente **del juego completo**; PR con `Closes #39`; permiso de Marco para fusionar (**este PR abre el juego al público**). Tras desplegar: `npm run smoke:deployed`, actualizar #11 y la memoria.
