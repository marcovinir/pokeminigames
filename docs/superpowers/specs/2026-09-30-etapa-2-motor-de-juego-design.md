# Pokémon Minigames — Etapa 2: Motor de juego

Fecha: 2026-09-30 · Estado: pendiente de revisión

Complementa la spec general (`2026-09-30-pokemon-minigames-design.md`). Donde esta spec es más específica, manda esta; lo que no menciona sigue como en la general. La etapa 1 (auth, esquema y catálogo) ya está en `main`.

## 1. Objetivo

Que dos jugadores autenticados jueguen una partida completa por Socket.io: crear y unirse a una sala, elegir o recibir tipos, nombrar Pokémon en rondas de 15 s, resolver la carrera, acumular stats, terminar por las reglas del modo, manejar desconexiones y guardar todo en PostgreSQL. No incluye interfaz (etapa 3); se verifica con pruebas y un cliente de Socket.io simulado.

## 2. Decisiones acordadas

| Tema | Decisión |
|---|---|
| Arquitectura | `GameEngine` puro (estado + evento + hora → estado nuevo + efectos). Un orquestador por sala ejecuta los efectos con un `Scheduler` inyectado. Los handlers de Socket.io solo validan y delegan. |
| Ritmo entre rondas | Automático: el resultado se muestra 6 s y la siguiente ronda arranca sola. No hay botón "Siguiente ronda". |
| Desconexión en ronda | El reloj sigue corriendo; quien se cae cuenta como sin respuesta (`NO_ANSWER`) en esa ronda. Si no vuelve en 30 s pierde la partida. |
| Inicio | Cuenta atrás de 5 s cuando ambos jugadores están conectados por socket; arranca sola. |
| Pares jugables | Un par necesita al menos 2 Pokémon sin reclamar. |
| Persistencia | La partida se guarda ronda a ronda; al arrancar el servidor, las partidas `waiting` o `in_progress` pasan a `abandoned`. |

## 3. Constantes de tiempo y límites

Son constantes nombradas en un solo archivo (`game/constants.ts`), no variables de entorno.

| Constante | Valor |
|---|---|
| `ROUND_SECONDS` | 15 |
| `TYPE_CHOICE_SECONDS` | 15 |
| `RESULT_PAUSE_SECONDS` | 6 |
| `START_COUNTDOWN_SECONDS` | 5 |
| `RECONNECT_GRACE_SECONDS` | 30 |
| `WAITING_ROOM_TTL_MINUTES` | 10 |
| `SIMULTANEOUS_WINDOW_MS` | 500 |
| `MIN_POOL_PER_PAIR` | 2 |
| Rondas del modo personalizado | de 1 a 20 |
| Meta de stats del modo personalizado | de 500 a 5000 |
| Límite de eventos por socket | 5 por segundo (`RATE_LIMITED`). Reemplaza el "máximo 2 eventos de respuesta por segundo" de la spec general §6: con un solo intento por ronda, el límite útil es sobre cualquier evento del cliente. |

## 4. Reglas de la partida

### 4.1 Ciclo de vida

`waiting` (sala creada) → cuando ambos jugadores tienen socket en la sala: cuenta atrás de 5 s → por cada ronda: `choosing_types` (solo modo elegido) → `round_active` → `round_result` → siguiente ronda o `finished`.

- El creador ocupa el asiento 1 y quien se une el asiento 2. La sala en espera caduca a los 10 minutos desde su creación y pasa a `abandoned`.
- Si el asiento 2 está reservado pero alguno no tiene socket al caducar la sala, también pasa a `abandoned` (nunca llegó a empezar).

### 4.2 Par de tipos por ronda

- **Modo aleatorio:** el servidor sortea un par entre los pares jugables (al menos `MIN_POOL_PER_PAIR` Pokémon de doble tipo aún sin reclamar en esta partida).
- **Modo elegido:** cada jugador elige **un** tipo en secreto durante `TYPE_CHOICE_SECONDS`. Quien no elige a tiempo recibe un tipo sorteado. El par sale de combinar ambos tipos, guardado ordenado (`type1_id < type2_id`). Si el par es inválido (mismo tipo o no jugable), el servidor sortea un par jugable y avisa a ambos en `round-started` (`typesNotice`).
- Si no queda ningún par jugable, la partida termina con los totales actuales.
- En modo elegido la fase `choosing_types` termina cuando ambos eligieron o vence el tiempo.

### 4.3 Ronda

Como en la spec general §3.3: un solo intento por jugador, `answer-received` solo confirma recepción, la ronda termina cuando ambos respondieron o vence el `deadline`, y al cerrar se resuelve:

1. Normalizar el texto (`normalizeName`) y buscarlo en el catálogo (español o inglés).
2. Verificar que exista, tenga ambos tipos del par y no esté ya en un equipo de la partida.
3. Si ambos nombraron el mismo Pokémon válido, gana el de menor timestamp de servidor; si la diferencia es menor que `SIMULTANEOUS_WINDOW_MS`, se sortea (con un `Rng` inyectado). El perdedor recibe `TAKEN`.
4. Cada Pokémon asignado suma su `total_stats` al jugador.

Resultados posibles: `VALID`, `NOT_FOUND`, `WRONG_TYPES`, `ALREADY_OWNED`, `TAKEN`, `NO_ANSWER`. Las respuestas de un jugador desconectado que llegaron antes de caerse sí cuentan.

### 4.4 Fin de partida

- **Rondas fijas (3 o 5):** se juegan todas.
- **Personalizada con `rounds`:** se juegan todas las rondas indicadas.
- **Personalizada con meta de `stats`:** termina al final de la primera ronda en que algún jugador alcance la meta.
- Gana quien tenga más stats; empate → `winner_id` nulo.
- **Abandono voluntario** (`leave-room` durante la partida): gana el rival de inmediato.
- **Desconexión:** a los 30 s sin volver, gana el rival. Si ambos están desconectados al vencer la gracia, la partida pasa a `abandoned` sin ganador.

### 4.5 Visibilidad

Durante una ronda, el jugador ve su equipo completo y del rival solo `totalStats` y `teamSize`. Los nombres del rival y su texto enviado se revelan en `round-result`.

## 5. Componentes del servidor

```
server/src/
├── game/
│   ├── constants.ts        # tiempos y límites
│   ├── rng.ts              # interfaz Rng + implementación real
│   ├── engine/             # GameEngine: reduce(estado, evento, hora, deps) → { estado, efectos }
│   ├── room.ts             # GameRoom: ejecuta efectos (timers, emisión, persistencia)
│   └── room-manager.ts     # crea/busca salas, una partida activa por usuario
├── catalog/pokemon-catalog.ts  # PokemonCatalog en memoria
├── rooms/                  # REST de salas + RoomStore (en memoria) + repositorio Prisma
└── realtime/               # servidor Socket.io: autenticación, rate limit, handlers
shared/                     # tipos de eventos, payloads y códigos de error
```

- **`PokemonCatalog`:** se carga de PostgreSQL al arrancar (solo Pokémon con nombres en ambos idiomas y al menos un tipo). Ofrece `resolveName(texto)`, `get(id)`, y un índice de pares con sus Pokémon de doble tipo para calcular pares jugables dado el conjunto de Pokémon reclamados.
- **`GameEngine`:** sin E/S. Dependencias inyectadas: `catalog` y `Rng`. El tiempo entra como argumento. Los efectos son datos: `schedule(timerId, at)`, `emit(destino, evento)`, `persistRound(...)`, `persistEnd(...)`.
- **`GameRoom`:** recibe eventos (de sockets o timers), llama al motor y ejecuta los efectos. Dependencias inyectadas: `Clock`, `Scheduler`, `Broadcaster`, `GameRepository`. Los timers llevan un token (ronda + fase) para ignorar los obsoletos.
- **Puertos:** `RoomStore` (en memoria; reemplazable por Redis), `GameRepository` (Prisma), `Clock`, `Scheduler`, `Rng`, `Broadcaster`.

## 6. REST y Socket.io

### REST (requiere `Authorization: Bearer`)

- `POST /rooms` — crea la sala: `{ typeMode: "random"|"chosen", lengthMode: "fixed_rounds"|"custom", roundsLimit?, statsGoal? }` (validado según §3 y el CHECK de la BD). Devuelve `{ code }`. Crea la fila `games` en `waiting` y el asiento 1.
- `GET /rooms/:code` — estado público: modo, configuración, usuario creador, cuántos jugadores hay y estado.
- `POST /rooms/:code/join` — reserva el asiento 2.
- Códigos de error: `ALREADY_IN_GAME` (409, el usuario ya está en una partida activa), `ROOM_NOT_FOUND` (404), `ROOM_FULL` (409), `ROOM_CLOSED` (409, la sala ya empezó, terminó o caducó).
- **Código de sala:** 6 caracteres aleatorios de `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (sin 0, O, 1, I, L), con reintento si ya existe.

### Socket.io

El socket se autentica con el access token en el handshake (`auth.token`); un token inválido rechaza la conexión. Un socket queda ligado a una sola sala tras `join-room`.

| Cliente → servidor | Payload |
|---|---|
| `join-room` | `{ code }` (también sirve para reconectar) |
| `choose-type` | `{ type }` |
| `submit-pokemon` | `{ text }` |
| `leave-room` | `{}` |

| Servidor → cliente | Payload |
|---|---|
| `room-state` | Snapshot completo para quien entra o reconecta: fase, configuración, asientos y usuarios, equipos propios, totales y `teamSize` del rival, par y `deadline` si hay ronda activa |
| `player-joined` | `{ username }` |
| `game-starting` | `{ startsAt }` |
| `choose-types` | `{ round, deadline }` |
| `round-started` | `{ round, type1, type2, deadline, typesNotice? }` |
| `answer-received` | `{ round }` |
| `round-result` | Por jugador: `result`, texto enviado, Pokémon obtenido (`id`, nombres, sprite, tipos, stats) si lo hay, y los totales actualizados |
| `game-ended` | `{ winner, reason, teams, totals }`; `reason` ∈ `completed`, `forfeit`, `disconnect`, `exhausted` |
| `opponent-disconnected` | `{ graceEndsAt }` |
| `opponent-reconnected` | `{}` |
| `error` | `{ code, message }` |

Códigos de error de socket: `NOT_IN_ROOM`, `WRONG_PHASE`, `ALREADY_ANSWERED`, `ALREADY_CHOSEN`, `INVALID_TYPE`, `RATE_LIMITED`, más los de la etapa 1 (`UNAUTHORIZED`, `VALIDATION_ERROR`).

El paquete `shared/` define estos nombres, payloads y códigos como tipos TypeScript. Antes de escribir el plan se verifica en una prueba previa que TypeScript 7 y Vitest resuelven el paquete desde el workspace.

## 7. Persistencia

- `POST /rooms` inserta `games` (`waiting`) y `game_players` (asiento 1). Unirse inserta el asiento 2. Al empezar, `games.status` pasa a `in_progress`.
- Al cerrarse cada ronda se insertan `rounds` (con el par ordenado) y `round_picks` (una fila por jugador, incluidos los `NO_ANSWER`) en una transacción.
- Al terminar: `games.status` = `completed` (o `abandoned`), `winner_id`, `ended_at` y `game_players.final_stats`.
- Al arrancar el servidor: `UPDATE games SET status = 'abandoned'` para las partidas `waiting` o `in_progress`.
- Un fallo de base de datos al guardar una ronda no detiene la partida en curso: se registra el error y la partida sigue en memoria; al terminar se reintenta el guardado final.

## 8. Pruebas

- **Motor:** con `Rng` determinista y hora como argumento. Cubre validación, carrera y ventana de 500 ms, los cuatro modos de fin, pares inválidos y sin pares jugables, desconexión y reconexión, y el abandono voluntario.
- **Catálogo:** nombres en ambos idiomas, pares jugables y el filtro de Pokémon incompletos.
- **Orquestador:** con `Clock` y `Scheduler` falsos, para recorrer partidas completas sin esperas reales.
- **Integración:** `socket.io-client` contra el servidor real y PostgreSQL de pruebas (autenticación del handshake, salas, errores tipados, rate limit).
- **E2E:** dos clientes juegan una partida completa de 3 rondas en modo aleatorio y otra en modo elegido, y se comprueba lo guardado en la BD.
- Se sigue TDD y se repite la técnica de la etapa 1: romper a propósito las protecciones críticas (carrera, token de temporizador obsoleto) para comprobar que las pruebas las detectan.

## 9. Fuera de alcance

- Interfaz y cliente React (etapa 3), estadísticas y perfil (etapa 4), despliegue, límite de intentos de login y endurecimiento de producción (etapa 5).
- Redis y varias instancias del servidor (la interfaz `RoomStore` queda preparada).
- Chat, espectadores, revancha desde la misma sala, desempate.
- Pendientes heredados de la etapa 1 que se atienden en las etapas 3–5: `COOKIE_SECURE` obligatorio en producción y protección CSRF de `refresh`/`logout` con `SameSite=none`.
