# Pokémon Minigames — Diseño

Fecha: 2026-09-30 · Estado: pendiente de revisión

## 1. Resumen

Juego web de 2 jugadores en tiempo real. En cada ronda se enfrenta un par de tipos Pokémon y cada jugador tiene 15 s para nombrar **un** Pokémon que tenga ambos tipos. Los Pokémon válidos se agregan al equipo del jugador y suman sus stats base. Gana quien tenga la mayor suma de stats al terminar la partida.

**Objetivo del proyecto:** portafolio desplegado y jugable por otras personas, con costo de operación casi nulo.

## 2. Decisiones acordadas

| Tema | Decisión |
|---|---|
| Stack | Node + TypeScript, Express, Socket.io, PostgreSQL + Prisma. React 18 + TypeScript + Tailwind + Zustand. |
| Estado de partidas | En memoria de una sola instancia del servidor, detrás de la interfaz `RoomStore`. Sin Redis en esta versión. |
| Modos de tipos | **Aleatorio** (el servidor sortea el par) y **elegido** (cada jugador escoge un tipo en secreto). |
| Largo de partida | Rondas fijas (3 o 5) o personalizado (meta de stats o máximo de rondas). |
| Mismo Pokémon | Carrera: un Pokémon solo puede pertenecer a un equipo por partida. |
| Intentos | Un solo intento por jugador por ronda. |
| Idioma | Nombres en español e inglés, ambos válidos, sin distinguir tildes ni mayúsculas. |
| Despliegue | PaaS con capas gratuitas; proveedor a elegir en la etapa 5. |
| Modelo de datos | Tercera forma normal (sin JSONB para equipos ni tipos). |

## 3. Reglas del juego

### 3.1 Partida

- Una sala admite exactamente 2 jugadores y se identifica con un código único.
- El creador elige el **modo de tipos** (aleatorio o elegido) y el **largo**:
  - `fixed_rounds`: se juegan N rondas (3 o 5) completas; no hay final anticipado.
  - `custom`: el creador fija `goal_type` = `stats` (la partida termina al final de la primera ronda en que algún jugador alcance la meta) o `rounds` (máximo de rondas). Gana en ambos casos quien tenga más stats.
- Gana quien tenga más stats al terminar. Un **empate** se declara tal cual (`winner_id` nulo); no hay desempate.
- Si un jugador se desconecta, tiene 30 s para reconectarse. Si no vuelve, gana el rival.

### 3.2 Par de tipos

- **Aleatorio:** el servidor sortea un par de tipos entre los pares que tengan al menos un Pokémon aún sin reclamar en la partida.
- **Elegido:** ambos jugadores escogen **un** tipo en secreto y de forma simultánea; el par resulta de combinar ambas elecciones. Si el par es inválido (mismo tipo o sin Pokémon sin reclamar), el servidor sortea un par válido y notifica a ambos.
- Un par cuenta como válido solo si existen Pokémon de doble tipo con esa combinación (los de un solo tipo nunca son válidos).

### 3.3 Ronda

1. El servidor anuncia el par y un `deadline` (15 s desde el inicio de la ronda).
2. Cada jugador envía **a lo sumo una** respuesta. El servidor confirma solo la recepción, sin revelar si es correcta.
3. La ronda termina cuando ambos han respondido o vence el `deadline`.
4. Al terminar, el servidor resuelve ambas respuestas:
   1. Normaliza el texto (minúsculas, sin tildes, sin espacios sobrantes) y busca el nombre en español o en inglés.
   2. Verifica que el Pokémon exista, tenga ambos tipos del par y no esté ya en un equipo de la partida.
   3. Si ambos jugadores nombraron el mismo Pokémon válido, se lo queda quien tenga el timestamp de servidor menor. Si la diferencia entre ambos es menor que `SIMULTANEOUS_WINDOW_MS` (500 ms, constante configurable), se considera simultáneo y se decide por sorteo, para no penalizar diferencias de latencia. El perdedor de la carrera cuenta como respuesta inválida (`TAKEN`).
5. Cada Pokémon asignado suma su `total_stats` (suma de las 6 stats base) al jugador.
6. Se emite el resultado de la ronda. Solo entonces se revelan los nombres de los Pokémon obtenidos por ambos.

Resultados posibles por respuesta: `VALID`, `NOT_FOUND`, `WRONG_TYPES`, `ALREADY_OWNED`, `TAKEN`, `NO_ANSWER`.

### 3.4 Visibilidad

Durante la ronda, el jugador ve su propio equipo completo y, del rival, solo el total de stats y la cantidad de Pokémon. Los nombres del rival se revelan en el resultado de cada ronda.

### 3.5 Autocompletado

Como hay un solo intento, el campo de respuesta ofrece autocompletado de nombres (español e inglés) desde el catálogo. El autocompletado nunca filtra por tipo, para no revelar respuestas.

## 4. Datos (3FN)

**Catálogo** (se carga una vez):

- `types(id, name)`
- `pokemon(id, base_hp, base_attack, base_defense, base_sp_attack, base_sp_defense, base_speed, total_stats, sprite_url)`
- `pokemon_types(pokemon_id, type_id, slot)` — relación N:M, `slot` 1 o 2.
- `pokemon_names(pokemon_id, language, name, normalized_name)` — índice único por `(language, normalized_name)`; `language` ∈ {`es`, `en`}.

**Usuarios:**

- `users(id, email, username, password_hash, created_at)`
- `refresh_tokens(id, user_id, token_hash, expires_at, revoked_at)`

**Partidas:**

- `games(id, room_code, type_mode, length_mode, rounds_limit, stats_goal, status, winner_id, created_at, ended_at)`
- `game_players(game_id, user_id, seat, final_stats)`
- `rounds(id, game_id, number, type1_id, type2_id)`
- `round_picks(id, round_id, user_id, submitted_text, result, pokemon_id, submitted_at)` — `pokemon_id` nulo si no fue válida.

Los equipos y los totales se derivan de `round_picks`; no se almacenan duplicados. `status` ∈ {`waiting`, `in_progress`, `completed`, `abandoned`}.

**Carga del catálogo:** un script descarga de PokéAPI las especies (1025) con sus stats, tipos y nombres en español e inglés (endpoint de especies), usando solo la forma por defecto. Genera un snapshot JSON que se commitea al repositorio. El seed de la base de datos usa ese snapshot, de modo que el despliegue nunca depende de PokéAPI. Durante las partidas no se llama a PokéAPI.

## 5. Arquitectura

### 5.1 Estructura

Monorepo con tres paquetes:

- `shared/`: tipos TypeScript de eventos de Socket.io, códigos de error y modelos comunes.
- `server/`: API REST + Socket.io.
- `client/`: aplicación React.

### 5.2 Servidor

Capas, con responsabilidades separadas (SOLID):

- **Transporte:** rutas REST y handlers de Socket.io. Solo validan entrada, autentican y delegan.
- **Servicios:** `AuthService`, `RoomService`, `StatsService`.
- **`GameEngine`:** máquina de estados de la partida, sin dependencias de red ni de base de datos.
- **`PokemonCatalog`:** mapas en memoria de Pokémon, tipos y nombres normalizados, cargados al arrancar desde la base de datos.
- **Puertos (interfaces):** `RoomStore` (implementación en memoria; reemplazable por Redis), `GameRepository` (Prisma) y `Clock` (reloj real o falso para pruebas).

### 5.3 Fases de la partida

`waiting` → `choosing_types` (solo modo elegido) → `round_active` → `round_result` → (siguiente ronda o) `finished`.

Los timers viven en el servidor. El cliente muestra la cuenta atrás calculada a partir del `deadline` recibido; nunca decide nada por su cuenta.

### 5.4 Protocolo

REST:

- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`
- `POST /rooms`, `GET /rooms/:code`, `POST /rooms/:code/join`
- `GET /stats`, `GET /stats/history`

Socket.io (los nombres definitivos se fijan en `shared/` durante la etapa 2):

- Cliente → servidor: `join-room`, `choose-type`, `submit-pokemon`, `leave-room`.
- Servidor → cliente: `player-joined`, `round-started` (par y `deadline`), `answer-received`, `opponent-status` (totales del rival), `round-result`, `game-ended`, `opponent-disconnected`, `opponent-reconnected`, `error` (con código tipado).

### 5.5 Autenticación

- Access token JWT de 1 h, enviado como `Authorization: Bearer`.
- Refresh token de 7 días en cookie `httpOnly`, guardado como hash en `refresh_tokens`.
- El socket se autentica con el access token en el handshake.

## 6. Errores y robustez

- Los eventos rechazados devuelven un código tipado (`ROOM_FULL`, `NOT_IN_ROOM`, `ROUND_CLOSED`, `ALREADY_ANSWERED`, etc.).
- Rate limit en el servidor como guarda simple (máximo 2 eventos de respuesta por segundo por jugador).
- El timestamp de las respuestas siempre lo pone el servidor.
- Heartbeat de Socket.io para detectar desconexiones; 30 s de gracia para reconectar.
- Al reiniciar el servidor, las partidas en curso se marcan como `abandoned` y no cuentan para estadísticas.
- Se registran las respuestas en `round_picks` como bitácora de auditoría.

## 7. Pruebas

- **Unitarias:** `GameEngine` con reloj falso (validación, carrera, ventana de simultaneidad, empates, meta de stats, desconexión) y normalización de nombres.
- **Integración:** REST y sockets contra PostgreSQL real.
- **E2E:** dos clientes simulados juegan una partida completa.
- Se sigue TDD en la lógica de juego.

## 8. Despliegue

- Frontend en hosting estático gratuito; backend en un PaaS con capa gratuita que soporte WebSockets; PostgreSQL administrado con capa gratuita.
- El proveedor concreto se elige en la etapa 5, verificando entonces las condiciones vigentes de cada capa gratuita.
- Configuración únicamente por variables de entorno, sin depender de un proveedor.
- Limitación asumida: en capas gratuitas el servidor puede suspenderse por inactividad y la primera conexión tardar unos segundos.

## 9. Etapas (cada una con su propio plan)

1. **Base:** monorepo, autenticación JWT, esquema de BD, script y seed del catálogo con nombres ES/EN.
2. **Motor de juego:** salas, Socket.io, rondas, validación, carrera, ganador, desconexiones.
3. **Frontend:** login, lobby, selección de modo, pantallas de partida y resultados.
4. **Estadísticas y perfil:** historial, W/L, racha, Pokémon más usado, poder promedio.
5. **Pruebas E2E y despliegue.**

## 10. Fuera de alcance

- Más de 2 jugadores por sala, espectadores, chat.
- Escalado horizontal y Redis (queda preparado mediante `RoomStore`).
- Formas alternativas de Pokémon (mega, regionales, etc.).
- Desempate de partidas y apelación de derrotas por desconexión.
- Aplicaciones móviles nativas (la web será responsiva).
