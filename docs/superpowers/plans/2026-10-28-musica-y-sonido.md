# Música y efectos de sonido (versión 1.0) — plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El juego suena: música por momento (sala, partida, final) con temas libres elegidos por Marco, efectos de 8 bits generados por código, el aviso «el rival respondió» y un control de sonido en el encabezado.

**Architecture:** Dos funciones puras deciden qué suena: `musicCueFor(pathname, view)` (qué música toca según la pantalla y la fase) y `effectsForEvent(before, event, after)` (qué efectos dispara cada evento del servidor). Un servicio de sonido inyectado en `services` (con un doble en las pruebas) los ejecuta: un reproductor de música con `HTMLAudioElement` (fundido, entrada + bucle, una vez, pausa con la pestaña oculta) y un sintetizador Web Audio para los efectos. El servidor añade el evento `opponent-answered` y el campo `opponentAnswered` en el estado de la sala.

**Tech Stack:** React 19, Zustand 5, Web Audio API, `HTMLAudioElement`; Express 5 + Socket.io; Vitest + RTL; Playwright.

**Spec:** `docs/superpowers/specs/2026-10-28-musica-y-sonido-design.md` (y `2026-10-28-musica-y-sonido-efectos.js`, el código de referencia de los efectos).

## Global Constraints

- Español con tildes en todo lo visible, comentarios y commits (prefijo convencional). TDD. Sin migraciones.
- Música: sala = *Town Center*, *Title Screen*, *Bittersweet Story*, *Pavane*, *Dungeon*; partida = *Porkymon Battle Theme* (entrada + bucle), *8-Bit Battle Loop*, *Chipped Urgency*; ganar/empate completado = *Menu*; perder = *Game Over*.
- Efectos: acierto y fallo = `OLD_SFX` de la referencia; ganar, perder, ronda, últimos segundos, botón, revelado y rival = `NEW_SFX`.
- Sonido activado por defecto; música 50 %, efectos 70 %; guardado en `localStorage` con la clave `pokeminigames:sonido`.
- Música solo en `/`, `/jugar/:juego` y `/sala/:code`; silencio en el resto. Efectos en cualquier pantalla.
- Archivos de música en `client/public/audio/`, **MP3**, en torno a 128 kbps, total ≤ 15 MB (si se pasa, 96 kbps).
- El trabajo entra por Pull Request con la CI en verde; fusionar requiere permiso de Marco.

## Review Focus

1. **Reconectar o recargar en plena partida** no dispara efectos (el `room-state` no suena) ni reinicia la música si la zona no cambió.
2. **Partida terminada sin ganador que no se completó** (`cancelled`, `expired`, `abandoned`): ni efecto ni tema de final; vuelve la música de sala.
3. **El navegador bloquea el audio hasta la primera interacción:** nada lanza errores sin capturar, y la música empieza al primer toque.
4. **Sin almacenamiento** (navegación privada, accesor que lanza): el sonido funciona con los valores por defecto.
5. **El aviso «Tu rival ya respondió»** solo aparece en la ronda abierta, se limpia en la siguiente y se recupera al reconectar.

---

### Task 1: El servidor avisa cuando el rival responde

**Files:**
- Modify: `shared/src/events.ts` (evento `"opponent-answered": (payload: { round: number }) => void`; campo `opponentAnswered: boolean` en `RoomStateView["round"]`), `shared/src/silhouette.ts` (`opponentAnswered: boolean` en `SilhouetteRoundView`)
- Modify: `server/src/game/engine/engine.ts` (`onSubmit`), `server/src/game/engine/view.ts`, `server/src/game/silhouette/engine.ts` (`onSubmit`), `server/src/game/silhouette/view.ts`
- Test: `server/test/game/engine.rounds.test.ts`, `server/test/game/silhouette.engine.test.ts`, `server/test/game/view.test.ts`, `server/test/game/silhouette.view.test.ts`, y `server/test/shared/contract.test.ts` (contrato de eventos).

**Interfaces:**
- Produces: evento `opponent-answered` `{ round }` emitido **solo al otro asiento** al aceptar una respuesta (Doble tipo: `submit` del Pokémon, no la elección de tipo; silueta: su `submit`); `room-state` con `round.opponentAnswered` (Doble tipo) y `silhouette.round.opponentAnswered` (silueta).

- [ ] **Step 1: Pruebas que fallan:** en cada motor, al responder el asiento 1 se emite `answer-received`/`silhouette-answer-received` al 1 y `opponent-answered { round }` al 2 (nunca al 1); una respuesta rechazada (fase incorrecta, ya respondida) no emite `opponent-answered`; la vista del asiento 2 tras la respuesta del 1 dice `opponentAnswered: true`, la del 1 `false`; en la ronda siguiente vuelve a `false`.
- [ ] **Step 2:** `npm test -w server -- test/game` → FAIL.
- [ ] **Step 3:** Implementar (en `onSubmit`, tras el `emit` actual, `emit(c, otherSeat, { name: "opponent-answered", payload: { round } })`; en las vistas, `opponentAnswered` = el otro asiento tiene respuesta en la ronda abierta).
- [ ] **Step 4:** `npm test -w server` y `npm run typecheck` en verde (el cliente fallará al compilar hasta la Task 2 si el tipo de `GameView` lo exige: en ese caso, completar el campo con `false` en `client/src/game/apply-event.ts` en esta misma tarea).
- [ ] **Step 5:** `git commit -m "feat: el servidor avisa cuando el rival responde (opponent-answered)"`

### Task 2: «Tu rival ya respondió» en pantalla

**Files:**
- Modify: `client/src/game/apply-event.ts` (`RoundView.opponentAnswered`, `silhouette.round.opponentAnswered`; caso `opponent-answered`; leerlo de `room-state`; `false` al empezar cada ronda), `client/src/pages/room/RoundView.tsx`, `client/src/pages/room/SilhouetteRoundView.tsx`, `client/src/i18n/es.ts` (`OPPONENT_ANSWERED = "Tu rival ya respondió"`)
- Test: `client/test/game/apply-event.test.ts`, `client/test/pages/room-play.test.tsx`, `client/test/pages/silhouette.test.tsx`

- [ ] **Step 1: Pruebas que fallan:** el reductor marca `opponentAnswered` con el evento, lo lee del `room-state` y lo pone a `false` con `round-started`/`silhouette-round-started`; ignora un `opponent-answered` de otra ronda; en las dos pantallas de ronda aparece «Tu rival ya respondió» (con `role="status"`) solo cuando es cierto.
- [ ] **Step 2:** `npm test -w client -- test/game test/pages/room-play.test.tsx test/pages/silhouette.test.tsx` → FAIL.
- [ ] **Step 3:** Implementar con los componentes existentes (`Notice` o `Badge`), sin estilos nuevos.
- [ ] **Step 4:** Mismo comando → PASS; `npm test -w client`.
- [ ] **Step 5:** `git commit -m "feat: aviso «Tu rival ya respondió» en las dos pantallas de ronda"`

### Task 3: Qué suena y cuándo (funciones puras)

**Files:**
- Create: `client/src/sound/cues.ts`
- Test: `client/test/sound/cues.test.ts`

**Interfaces:**
- Produces:
  - `type SoundEffect = "correct" | "wrong" | "win" | "lose" | "round" | "tick" | "click" | "reveal" | "rival"`
  - `type MusicCue = { zone: "none" } | { zone: "lobby" } | { zone: "battle" } | { zone: "final"; outcome: "win" | "lose" }`
  - `endOutcome(ended: GameEndedPayload, mySeat: Seat | null): "win" | "lose" | null` — gana mi asiento → `win` (cualquier motivo); gana el otro → `lose`; sin ganador y `reason === "completed"` → `win` (empate); sin ganador y otro motivo → `null`.
  - `musicCueFor(pathname: string, view: GameView): MusicCue` — `/` y `/jugar/*` → `lobby`; `/sala/*` según `view.phase`: `waiting` → `lobby`; `starting`, `choosing_types`, `round_active`, `round_result` → `battle`; `finished` → `final` con `endOutcome`, o `lobby` si es `null`; cualquier otra ruta → `none`.
  - `effectsForEvent(before: GameView, event: ServerEvent, after: GameView): { effect: SoundEffect; delayMs: number }[]` — `round-started` y `silhouette-round-started` → `round`; `round-result` → `correct` si mi resultado es `VALID`, si no `wrong`; `silhouette-round-result` → `reveal` (0 ms) y luego `correct`/`wrong` según `reveal.answers[mySeat].correct` (600 ms); `game-ended` → `win`/`lose` según `endOutcome` (ninguno si `null`); `opponent-answered` de la ronda abierta → `rival`; **cualquier otro evento, incluido `room-state`, → ninguno**; sin asiento (`mySeat === null`) → ninguno salvo `round`.

- [ ] **Step 1: Pruebas que fallan:** una por regla de arriba, con vistas y eventos construidos con los ayudantes de pruebas del cliente; incluidos empate completado (`win`), `cancelled`/`expired`/`abandoned` sin ganador (`null`, música `lobby`), ganar por `forfeit` y `disconnect` (`win`), perder por abandono propio (`lose`), y que `room-state` en plena ronda no devuelve efectos.
- [ ] **Step 2:** `npm test -w client -- test/sound/cues.test.ts` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Mismo comando → PASS.
- [ ] **Step 5:** `git commit -m "feat: reglas de qué música y qué efectos suenan en cada momento"`

### Task 4: Ajustes de sonido guardados

**Files:**
- Create: `client/src/sound/settings-store.ts`
- Test: `client/test/sound/settings-store.test.ts`

**Interfaces:**
- Produces: `interface SoundSettings { musicOn: boolean; musicVolume: number; effectsOn: boolean; effectsVolume: number }`, `DEFAULT_SOUND_SETTINGS = { musicOn: true, musicVolume: 0.5, effectsOn: true, effectsVolume: 0.7 }`, `createSoundSettingsStore({ storage }: { storage: Pick<Storage, "getItem" | "setItem"> | null })` → store de Zustand con `settings` y `update(partial)`; clave `pokeminigames:sonido`. Sigue el patrón de `client/src/theme/theme-store.ts`.

- [ ] **Step 1: Pruebas que fallan:** sin nada guardado da los valores por defecto; `update` guarda y se relee al crear otro store; un JSON corrupto o con tipos raros cae a los valores por defecto (volúmenes acotados a 0–1); con `storage` nulo o que lanza al leer o escribir funciona en memoria sin errores.
- [ ] **Step 2:** `npm test -w client -- test/sound/settings-store.test.ts` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** `git commit -m "feat: ajustes de sonido guardados en el navegador"`

### Task 5: Los archivos de música

**Files:**
- Create: `client/public/audio/*.mp3` (11 archivos: `town-center.mp3`, `title-screen.mp3`, `bittersweet-story.mp3`, `pavane.mp3`, `dungeon.mp3`, `porkymon-battle-start.mp3`, `porkymon-battle-main.mp3`, `8bit-battle-loop.mp3`, `chipped-urgency.mp3`, `victory-menu.mp3`, `game-over.mp3`), `client/public/audio/CREDITOS.md`, `client/src/sound/tracks.ts`
- Test: `client/test/sound/tracks.test.ts`

**Interfaces:**
- Produces: `interface Track { id: string; title: string; src: string; author: string; license: "CC0" | "CC-BY 4.0" | "CC-BY-SA 3.0"; page: string; intro?: string; loop: boolean }`, `LOBBY_TRACKS`, `BATTLE_TRACKS`, `WIN_TRACK`, `LOSE_TRACK`, `ALL_TRACKS`.

Descargar cada tema de su página de OpenGameArt (tabla de la spec) y convertirlo a MP3 ~128 kbps con una herramienta gratuita, **fuera del repositorio** (no se añade ninguna dependencia al proyecto para esto); anotar en el ledger la herramienta y los comandos. `CREDITOS.md` lista cada archivo con título, autor, licencia y página.

- [ ] **Step 1: Prueba que falla:** cada `src` e `intro` de `ALL_TRACKS` existe en `client/public/audio/`, empieza por la cabecera de un MP3 (`ID3` o sincronía `0xFFE…`), y la suma pesa ≤ 15 MB; las listas coinciden con la selección de Marco (títulos y orden); los de CC-BY y CC-BY-SA tienen `author` y `page`; `LOBBY_TRACKS` y `BATTLE_TRACKS` hacen bucle y `WIN_TRACK`/`LOSE_TRACK` no; *Porkymon* tiene `intro`.
- [ ] **Step 2:** `npm test -w client -- test/sound/tracks.test.ts` → FAIL.
- [ ] **Step 3:** Preparar los archivos y escribir `tracks.ts` y `CREDITOS.md`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** `git commit -m "feat: los temas de música (MP3) con sus créditos"`

### Task 6: El servicio de sonido (efectos y reproductor)

**Files:**
- Create: `client/src/sound/synth.ts` (los nueve efectos a partir de la referencia), `client/src/sound/music-player.ts`, `client/src/sound/sound-service.ts`
- Modify: `client/src/services.tsx` (`Services.sound: SoundService` y `Services.soundSettings`), `client/test/helpers/services.tsx` (doble que registra las llamadas)
- Test: `client/test/sound/music-player.test.ts`, `client/test/sound/sound-service.test.ts`

**Interfaces:**
- Produces: `interface SoundService { play(effect: SoundEffect, delayMs?: number): void; setMusic(cue: MusicCue): void; unlock(): void; dispose(): void }`; `createSoundService({ settings, createAudio, createContext, random, document })` con las dependencias del navegador inyectables.

Reglas: `setMusic` con la misma zona (y el mismo resultado) no reinicia nada; al cambiar de zona funde la anterior (~400 ms) y empieza un tema al azar de la zona sin repetir el último; `final` suena una vez y empieza cuando acaba el efecto de final (~1,2 s después de pedirlo); al acabar, silencio; *Porkymon*: entrada y después el bucle. Con `musicOn: false` no suena música (y se detiene si sonaba); el volumen sigue a los ajustes al momento. Pestaña oculta → pausa; visible → sigue. Antes del primer `unlock()` (primer `pointerdown` o `keydown`, que registra el servicio) los `play()` del audio que el navegador rechace se capturan y se reintentan al desbloquear. `play(effect)` con `effectsOn: false` no hace nada.

- [ ] **Step 1: Pruebas que fallan** con dobles de `Audio` y `AudioContext`: cada regla de arriba (misma zona no reinicia; cambio de zona elige otro tema distinto del último con un `random` fijo; entrada + bucle; final una vez y con retraso; interruptores y volumen; pestaña oculta; `play()` rechazado que se reintenta tras `unlock`; ningún error sin capturar).
- [ ] **Step 2:** `npm test -w client -- test/sound` → FAIL.
- [ ] **Step 3:** Implementar; `synth.ts` copia los sonidos elegidos de la referencia (sin la página de la playlist).
- [ ] **Step 4:** PASS; `npm test -w client`; `npm run typecheck`.
- [ ] **Step 5:** `git commit -m "feat: servicio de sonido: efectos de 8 bits y reproductor de música"`

### Task 7: Conectar el sonido al juego

**Files:**
- Create: `client/src/sound/SoundDirector.tsx` (en `App.tsx`: calcula `musicCueFor` con la ruta y la vista y llama a `setMusic`; escribe la zona en `document.documentElement.dataset.music` para la E2E), `client/src/sound/use-last-seconds.ts`
- Modify: `client/src/game/store.ts` (opción `onEvent(before, event, after)` que `createServices` usa para `effectsForEvent` → `sound.play`), `client/src/App.tsx`, `client/src/components/Button.tsx` (efecto `click` al pulsar), `client/src/pages/MainMenu.tsx` («Jugar»), `client/src/pages/room/RoundView.tsx` y `SilhouetteRoundView.tsx` (`useLastSeconds`)
- Test: `client/test/sound/sound-director.test.tsx`, `client/test/sound/use-last-seconds.test.tsx`, `client/test/game/store.test.ts`

**Interfaces:**
- Consumes: `musicCueFor`, `effectsForEvent` (Task 3), `SoundService` (Task 6).
- Produces: `useLastSeconds({ deadline, offset, answered, round })` que llama una vez por ronda a `sound.play("tick")` al quedar ≤ 5000 ms, si no se respondió.

- [ ] **Step 1: Pruebas que fallan:** el director pide `lobby` en `/`, `battle` en una sala en `round_active`, `final win` al terminar ganando, `none` en `/login` y `/privacidad`, y no repite `setMusic` si la zona no cambia; `dataset.music` refleja la zona; el store llama a `onEvent` con la vista de antes y la de después; `useLastSeconds` suena una sola vez por ronda y nunca si ya respondí o en `choosing_types`; `Button` y «Jugar» piden `click`.
- [ ] **Step 2:** `npm test -w client -- test/sound test/game/store.test.ts` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** PASS; `npm test -w client`.
- [ ] **Step 5:** `git commit -m "feat: la música sigue a la pantalla y los efectos a la partida"`

### Task 8: El control de sonido en el encabezado

**Files:**
- Create: `client/src/components/SoundMenu.tsx`
- Modify: `client/src/components/Header.tsx`, `client/src/i18n/es.ts` (`SOUND_TEXT`)
- Test: `client/test/components/sound-menu.test.tsx`

Mismo patrón que `ThemeMenu`: botón con etiqueta accesible «Sonido» (el icono indica silencio cuando música y efectos están apagados), panel con interruptores «Música» y «Efectos» (con `role="switch"` o casillas) y dos controles de volumen (`input type="range"` etiquetados), cierre con Escape y clic fuera, foco que vuelve al botón.

- [ ] **Step 1: Pruebas que fallan:** el botón está en el encabezado con y sin sesión; abrir, cambiar cada interruptor y volumen actualiza los ajustes (y por tanto el servicio); Escape cierra y devuelve el foco; el icono cambia al silenciar todo.
- [ ] **Step 2:** `npm test -w client -- test/components/sound-menu.test.tsx` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** PASS; `npm test -w client`.
- [ ] **Step 5:** `git commit -m "feat: control de música y efectos en el encabezado"`

### Task 9: Créditos, documentación y comprobación completa

**Files:**
- Modify: `client/src/i18n/info.tsx` (créditos de la música en Acerca de: Trevor Lentz CC-BY-SA 3.0 y SuperGamersGames CC-BY 4.0 con enlace; agradecimiento a los CC0), `LICENSE` (la música conserva su licencia), `docs/guia-tecnica.md`, `README.md` y `README.es.md` (una línea en lo destacado), `AGENTS.md` (el repositorio ya es **público**; mencionar `client/src/sound/`)
- Modify/Test: `client/test/pages/info-pages.test.tsx` (Acerca de cita a los dos autores que lo exigen), `client/test/theme/readme.test.ts` si hace falta, `e2e/tests/sound.spec.ts` (nuevo)

- [ ] **Step 1: Pruebas que fallan:** Acerca de nombra a Trevor Lentz y SuperGamersGames con sus licencias y enlaces; la `LICENSE` menciona la música; E2E `sound.spec.ts`: en una partida completa entre dos navegadores `html[data-music]` pasa de `lobby` a `battle` y a `final` al terminar, el panel de sonido guarda «Música» apagada tras recargar, y no hay errores en la consola.
- [ ] **Step 2:** Correrlas → FAIL.
- [ ] **Step 3:** Escribir los textos.
- [ ] **Step 4:** `npm test`, `npm run typecheck`, `npm run build` y `E2E_CHANNEL=msedge npm run e2e` (con el cargador) en verde.
- [ ] **Step 5:** A mano: una partida de cada juego escuchándola en escritorio y a 375 px; auditoría de contraste del panel de sonido en los 4 temas.
- [ ] **Step 6:** `git commit -m "docs: créditos de la música y guía del sonido"`
