# Pokémon Minigames — Etapa 3: Cliente web

Fecha: 2026-09-30 · Estado: pendiente de revisión

Complementa la spec general (`2026-09-30-pokemon-minigames-design.md`) y la de la etapa 2 (`2026-09-30-etapa-2-motor-de-juego-design.md`). Donde esta spec es más específica, manda esta. Las etapas 1 y 2 (servidor completo) ya están en `main`.

## 1. Objetivo

Un cliente web en español con el que dos personas juegan una partida completa desde el navegador: registrarse o iniciar sesión, crear una sala o unirse con un código, elegir tipos (en el modo elegido), nombrar Pokémon contra el reloj, ver el resultado de cada ronda y el resumen final, y recuperar la partida si recargan la página o se cae la conexión. Cada jugador elige entre dos temas visuales. Incluye los tres pequeños añadidos que el cliente necesita en el servidor. No incluye historial, estadísticas ni perfil (etapa 4) ni despliegue (etapa 5).

## 2. Decisiones acordadas

| Tema | Decisión |
|---|---|
| Stack | Vite + React 19 + TypeScript + Tailwind + Zustand + React Router + `socket.io-client`. Todo el texto en español. |
| Arquitectura | `GameClient` (servicio sin React que envuelve el socket con los tipos de `shared/`) + una función pura `applyServerEvent(estado, evento)` + un store de Zustand. Los componentes solo leen el store. |
| Temas | Dos temas elegibles por el jugador: **Clásico** (claro y limpio) y **Pokédex** (retro: tipografía monoespaciada en números y estadísticas, bordes rectos, marco en el encabezado). Ambos con modo claro y oscuro. |
| Sesión | El access token vive solo en memoria; al cargar se renueva con la cookie de refresco. |
| Reloj | Los eventos del servidor llevan `serverNow` para calcular el desfase con el reloj del navegador. |
| Pruebas | Vitest + Testing Library (reducer, store, cliente HTTP, componentes) con un socket falso. La prueba E2E en navegador contra el servidor real queda para la etapa 5. |

## 3. Pantallas y rutas

| Ruta | Contenido |
|---|---|
| `/login`, `/registro` | Formularios con validación en el cliente (las mismas reglas que el servidor: email válido, usuario de 3 a 30 caracteres `A-Za-z0-9_`, contraseña de 8 a 72 bytes). Muestran los errores del servidor en español. |
| `/` (lobby) | Crear sala: modo de tipos (aleatorio o elegido) y largo (3 rondas, 5 rondas o personalizado por rondas o por meta de stats, con los rangos del servidor). Unirse con un código. Si tiene una partida activa, un aviso "Volver a tu partida". |
| `/sala/:code` | Una sola ruta que cambia de vista según la fase de la partida (ver §5). |

Las rutas `/` y `/sala/:code` exigen sesión: sin ella redirigen a `/login` y, tras entrar, vuelven a donde iban. `/login` y `/registro` redirigen a `/` si ya hay sesión. El selector de tema y modo y el botón de cerrar sesión están en el encabezado.

## 4. Sesión y comunicación con el servidor

- **Arranque:** al cargar la aplicación se llama a `POST /auth/refresh`. Si responde 200 hay sesión (se guarda el access token en memoria y el usuario); si responde 401, no. Mientras se resuelve, se muestra una pantalla de carga, no el formulario.
- **Peticiones autenticadas:** un cliente HTTP añade `Authorization: Bearer`. Ante un 401 renueva la sesión **una sola vez** (las peticiones simultáneas comparten la misma renovación) y reintenta; si la renovación falla, cierra la sesión y lleva a `/login`.
- **Cookie de refresco:** tiene `Path=/auth`, así que las llamadas a `/auth/*` deben ir al mismo origen. En desarrollo, el servidor de Vite hace de proxy de `/auth`, `/rooms`, `/pokemon` y `/socket.io` (WebSocket incluido) al servidor del juego, sin prefijo. La URL base es configurable con `VITE_API_URL` (vacía = mismo origen); cómo se resuelve el origen en producción es tema de la etapa 5.
- **Socket:** se conecta con `auth: (cb) => cb({ token })`, de modo que cada reconexión usa el token vigente. Al conectar (y reconectar) el cliente envía `join-room` con el código de la sala en la que está; el servidor responde con `room-state`, que reemplaza el estado local.
- **Errores:** los códigos de error (`ErrorCode`) se traducen a mensajes en español en un solo lugar. Los errores de socket se muestran como avisos no bloqueantes.

## 5. La partida en el cliente

### 5.1 Estado y eventos

`applyServerEvent(estado, evento)` es una función pura sin E/S: por cada evento de `ServerToClientEvents` devuelve el estado nuevo. `room-state` reemplaza el estado completo (es la vía de recuperación tras recargar o reconectar). El estado incluye: fase, configuración, asiento propio, jugadores (nombre, conectado, total y tamaño de equipo), equipo propio, ronda actual (número, par de tipos, plazo, si ya respondí o elegí), último resultado de ronda, aviso de desconexión del rival, resultado final y el desfase de reloj.

El `GameClient` no contiene lógica de juego: envía `join-room`, `choose-type`, `submit-pokemon` y `leave-room`, y entrega al store cada evento recibido.

### 5.2 Vistas según la fase

| Fase | Vista |
|---|---|
| `waiting` | **Sala de espera:** código grande con botón de copiar, quién está dentro, "Esperando a tu oponente…" y botón para cancelar (`leave-room`). |
| `starting` | **Cuenta atrás** de 5 s hasta `startsAt`. |
| `choosing_types` | **Selector de tipo:** cuadrícula de los 18 tipos con su nombre en español y su color; un toque elige, queda marcado y se confirma con `type-received`; cronómetro de 15 s. Tras elegir, espera al rival. |
| `round_active` | **Ronda:** a la izquierda el equipo propio y su total; en el centro el par de tipos, el cronómetro y el campo de respuesta con autocompletado; a la derecha el rival (solo total y cantidad de Pokémon). Tras enviar, el campo queda bloqueado con "Respuesta enviada" hasta el resultado. Se avisa si el par fue reemplazado (`typesNotice`). |
| `round_result` | **Resultado:** el Pokémon que ganó cada jugador (o el motivo de no ganar), los totales actualizados y una cuenta atrás hasta la siguiente ronda. |
| `finished` | **Resumen:** ganador o empate, motivo, los dos equipos completos con sus stats, y los botones "Jugar de nuevo" (vuelve al lobby) y "Volver al lobby". |

Aviso de desconexión: si el rival se cae en plena partida, una franja muestra "Tu oponente se desconectó" con una cuenta atrás hasta `graceEndsAt`; al volver, desaparece.

En pantallas estrechas los paneles de equipo pasan a una barra resumen sobre la ronda.

### 5.3 Cronómetro y reloj

Todo cronómetro se calcula como `plazo - (Date.now() + desfase)`, con `desfase = serverNow - Date.now()` medido al recibir el evento que trae `serverNow`. El cronómetro se actualiza unas 4 veces por segundo, nunca baja de 0 y no decide nada: el servidor es la autoridad.

### 5.4 Autocompletado

Un campo de texto con lista desplegable (patrón *combobox* accesible) que sugiere nombres en español o inglés, sin tildes ni mayúsculas, **sin filtrar por tipo** (no revela respuestas). Se alimenta de `GET /pokemon/names`, que se descarga una vez y se guarda en memoria. Enter envía lo escrito (o la sugerencia seleccionada); el texto se normaliza con la misma función que usa el servidor. Con una sola oportunidad por ronda, el campo sugiere pero no corrige nada por su cuenta.

## 6. Temas

- Todos los componentes usan **tokens semánticos** (variables CSS: superficies, texto, acento, borde, radio, tipografías) y nunca colores literales, salvo los 18 colores de tipo.
- Cada tema define sus tokens para claro y oscuro. El tema Pokédex añade tipografía monoespaciada en números y estadísticas, bordes rectos y un marco rojo en el encabezado de la sala; todo lo demás (estructura, componentes, comportamiento) es común.
- El jugador elige **tema** (Clásico o Pokédex) y **modo** (automático, claro u oscuro). La preferencia se guarda en el navegador (`localStorage`) y se aplica antes de pintar para evitar un destello del tema equivocado. Guardarla en el perfil del usuario queda para la etapa 4.
- Los 18 tipos tienen un color y un color de texto con contraste suficiente sobre él en ambos modos. Nombres en español: normal, lucha, volador, veneno, tierra, roca, bicho, fantasma, acero, fuego, agua, planta, eléctrico, psíquico, hielo, dragón, siniestro, hada.

## 7. Cambios en el servidor

1. **`serverNow`** (milisegundos desde la época, hora del servidor) en `RoomStateView`, `game-starting`, `choose-types`, `round-started` y `opponent-disconnected`. El motor ya conoce la hora de cada evento; `buildRoomState` la recibe como argumento. Los tipos de `shared/` se actualizan y las pruebas existentes que comparan estas cargas se ajustan. Además, `round-result` trae `nextRoundAt` (hora del servidor a la que empieza la siguiente ronda; `null` si la partida terminó) para la cuenta atrás de la pausa entre rondas.
2. **`GET /rooms/current`** (requiere sesión): `200 { "room": { "code", "phase" } }` con la sala activa del usuario, o `200 { "room": null }` si no tiene ninguna. Sirve para recuperar la partida tras recargar y para salir de una sala en espera que se quedó abierta.
3. **`GET /pokemon/names`** (público): `200` con `[{ "id", "es", "en" }]` de los Pokémon del `PokemonCatalog`, con `Cache-Control: public, max-age=86400`. Es solo la lista de nombres, sin tipos.
4. **`normalizeName`** pasa a `shared/` (es una función pura); el servidor la re-exporta desde donde estaba.

## 8. Estructura del paquete

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

## 9. Pruebas

- **Reducer:** un caso por cada evento del servidor, incluido `room-state` como reemplazo completo y la recuperación tras reconexión.
- **Reloj:** cálculo del desfase y del tiempo restante, con el reloj simulado.
- **Cliente HTTP:** renovación única ante 401 con peticiones simultáneas, reintento y cierre de sesión si la renovación falla.
- **Componentes (Testing Library, socket falso):** formularios con validación y errores del servidor, lobby (crear y unirse), cada vista de la partida según el estado, autocompletado (teclado y lectura de pantalla), cronómetro con reloj simulado, guardas de ruta y cambio de tema y modo.
- **Servidor:** pruebas de los tres añadidos (`serverNow`, `/rooms/current`, `/pokemon/names`) y del `normalizeName` compartido.
- **Verificación visual:** se recorre una partida completa contra el servidor real (dos navegadores, o uno solo contra el bot `client/scripts/dev-bot.mjs`), en los dos temas y en móvil; y se ejecuta `client/scripts/contrast-audit.js` (`__contrastAuditAll()`) en las pantallas principales para medir el contraste del texto que realmente se ve, no solo el de los tokens.
- Se sigue TDD y se repite la técnica de romper a propósito las protecciones críticas (renovación única, desfase de reloj, reemplazo de estado) para comprobar que las pruebas las detectan.

## 10. Fuera de alcance

- Historial, estadísticas, perfil y guardar el tema en el perfil (etapa 4).
- Prueba E2E en navegador, despliegue, resolución del origen y de la cookie en producción, límite de intentos de login y endurecimiento (etapa 5).
- Sonido, animaciones elaboradas, varios idiomas, chat, espectadores, revancha desde la misma sala.
- Aplicación instalable (PWA) y notificaciones.
