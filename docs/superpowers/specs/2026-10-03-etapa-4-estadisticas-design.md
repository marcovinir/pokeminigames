# Pokémon Minigames — Etapa 4: Estadísticas y perfil

Fecha: 2026-10-03 · Estado: pendiente de revisión

Complementa la spec general (`2026-09-30-pokemon-minigames-design.md`) y las de las etapas 2 y 3. Donde esta spec es más específica, manda esta. Las etapas 1 a 3 (servidor completo y cliente web jugable) ya están en `main`.

## 1. Objetivo

Que cada persona vea cómo le va (partidas ganadas, empatadas y perdidas, rachas, sus Pokémon más ganados, su poder promedio) y pueda repasar sus partidas, y que pueda abrir el perfil de su rival para ver sus estadísticas. Además, la preferencia de tema se guarda en el perfil, como dejó anotado la spec de la etapa 3. No incluye ranking, perfiles sin sesión ni nada de despliegue (etapa 5).

## 2. Decisiones acordadas

| Tema | Decisión |
|---|---|
| Alcance | Perfil propio (estadísticas e historial) y perfil del rival (solo estadísticas). Sin ranking global. |
| Privacidad | Los perfiles ajenos exigen sesión y muestran solo estadísticas: nunca correo, historial, identificadores internos ni códigos de sala. |
| Cálculo | Al pedirlas, con consultas sobre `games`, `game_players` y `round_picks`. Sin tablas de estadísticas precalculadas ni vistas materializadas: los datos no se duplican. |
| Motivo del fin | Se guarda en una columna nueva de `games`; el historial lo muestra en palabras. |
| Tema | Se guarda en `users`. La preferencia del servidor gana al iniciar sesión; `localStorage` sigue siendo el respaldo y lo que evita el destello. |
| Pruebas | Funciones puras con pruebas por tabla; servicio y rutas contra la base de pruebas real; componentes con endpoints falsos; mutaciones deliberadas; recorrido real en el navegador. |

## 3. Datos y definiciones

### 3.1 Cambios de esquema (una migración)

- **`games.end_reason`**: enum con los motivos que ya existen en `shared/` (`completed`, `forfeit`, `disconnect`, `exhausted`, `cancelled`, `expired`, `abandoned`). Es nulo en las partidas anteriores a la migración y en las que aún no terminaron. La base hace cumplir la coherencia con `status`: `waiting` e `in_progress` no tienen motivo; `completed` solo admite `completed`, `forfeit`, `disconnect` o `exhausted`; `abandoned` solo admite `cancelled`, `expired` o `abandoned` (el mismo reparto que hace el motor). Nulo vale en los tres casos.
- **`users.theme` y `users.theme_mode`**: enums (`clasico` | `pokedex` y `auto` | `claro` | `oscuro`), ambos nulos mientras la persona no haya guardado preferencia. Una restricción exige que los dos sean nulos o los dos tengan valor.
- **Índices** por `user_id` en `game_players` y en `round_picks` (las únicas claves únicas existentes empiezan por la partida o la ronda, así que no sirven para buscar por jugador).

El motor ya conoce el motivo al terminar la partida; hoy se pierde al guardar. `FinishInput` pasa a llevar `reason` y el repositorio lo escribe; `abandonUnfinished` marca las partidas pendientes como `abandoned` con motivo `abandoned`.

### 3.2 Qué cuenta y cómo

Solo cuentan las partidas `completed`; las `abandoned` no cuentan para nada.

- **Ganada, empatada, perdida:** según `winner_id` (nulo es empate). Una victoria porque el rival abandonó o se desconectó es una victoria; el historial explica por qué.
- **Jugadas:** ganadas + empatadas + perdidas. **% de victorias:** ganadas entre jugadas (los empates cuentan como jugadas); nulo si no se ha jugado ninguna.
- **Racha actual:** victorias consecutivas más recientes, ordenando las partidas por fecha de fin descendente (y por id para desempatar). Un empate o una derrota la corta. **Mejor racha:** la racha más larga de toda la historia.
- **Pokémon más ganados:** los 3 que la persona más veces ganó (jugadas con resultado `VALID` en partidas completadas). Empate de cantidad: gana el de id más bajo, para que el resultado sea determinista.
- **Poder promedio:** promedio de `total_stats` de los Pokémon que ganó, con un decimal; nulo si no ganó ninguno. **Mejor partida:** el mayor `final_stats` de sus partidas completadas; nulo si no ha jugado.

## 4. API (todas las rutas exigen sesión)

- `GET /stats` → `200 { username, stats }` con tus estadísticas.
- `GET /users/:username/stats` → `200` con la misma forma para otra persona. El nombre se busca sin distinguir mayúsculas; si no existe, `404` con el código nuevo `USER_NOT_FOUND`. Va bajo `/users/` y no bajo `/stats/:username` porque `history` es un nombre de usuario válido y chocaría con `/stats/history`.
- `GET /stats/history?limit=&before=` → `200 { games, nextCursor }`. `limit` de 1 a 50 (por defecto 20). `before` es un cursor opaco devuelto por la página anterior; `nextCursor` es nulo en la última página. Un `limit` o un cursor inválidos responden `400` (`VALIDATION_ERROR`). El orden es por fecha de fin descendente y luego por id descendente.
- `PUT /auth/me/preferences` con `{ theme, themeMode }` (ambos obligatorios y válidos) → `200 { preferences }`. Las respuestas de login, registro, refresh y `GET /auth/me` incluyen `user.preferences` (`{ theme, themeMode }` o `null` si nunca se guardó).

Formas (tipos en `shared/`):

```
Stats        { played, wins, draws, losses, winRate: number | null,   // 0 a 1
               currentStreak, bestStreak, averagePower: number | null,
               bestGameScore: number | null,
               topPokemon: { pokemon: PokemonView, wins: number }[] }
HistoryEntry { id, endedAt (ISO), result: "won" | "drawn" | "lost",
               reason: GameEndReason | null, opponent: { username },
               myScore: number | null, opponentScore: number | null,
               config: { typeMode, lengthMode, roundsLimit, statsGoal } }
```

## 5. Estructura del servidor

- **`StatsService`** con dos capas. La capa de datos hace consultas finas: los resultados de las partidas completadas de una persona (una fila por partida) y los Pokémon que ganó (una fila por jugada válida). La capa de cálculo son funciones puras que reciben esas filas y el `PokemonCatalog` en memoria: conteos, racha, top 3, promedio y mejor partida. Sin SQL a mano ni agregados en la base.
- **Cursor:** codifica la fecha de fin y el id de la última partida entregada (paginación por clave, no por desplazamiento); se valida al decodificar.
- **Rutas:** `stats.routes.ts` (`/stats`, `/stats/history`, `/users/:username/stats`) y la ruta de preferencias dentro de las de autenticación. Todas pasan por la autenticación existente.
- **Errores:** `USER_NOT_FOUND` se agrega a `shared/` y se traduce en el cliente. Un jugador sin partidas devuelve ceros, `winRate` y `averagePower` nulos, `topPokemon` vacío y un historial vacío.

## 6. Cliente

- **Rutas** (exigen sesión): `/perfil` es el propio, con estadísticas e historial; `/jugador/:username` es el de otra persona, la misma pantalla sin historial. El encabezado gana el enlace "Mi perfil"; el resumen de la partida gana el botón "Ver perfil de {rival}". Si el jugador no existe, se muestra "No encontramos a ese jugador" con la vuelta al lobby.
- **Estadísticas:** resumen (jugadas, ganadas/empatadas/perdidas, % de victorias, racha actual y mejor racha), poder (promedio y mejor partida) y los 3 Pokémon más ganados con `PokemonCard` y las veces ganadas.
- **Historial** (solo el propio): una lista por partida con resultado ("Ganaste", "Empate", "Perdiste"), el rival enlazado a su perfil, el marcador, el motivo en palabras ("Tu rival abandonó", "Tu rival se desconectó", "Se agotaron los pares"…), la configuración y la fecha en español. "Cargar más" usa el cursor. Sin partidas: un mensaje con un botón para crear una sala.
- **Datos:** `Endpoints` gana `stats.{mine, history, forUser}` y `auth.savePreferences`; `AuthUser` gana `preferences`. Cada pantalla guarda lo suyo en estado local (cargando, error con reintento, listo), sin un almacén global nuevo.
- **Textos y colores:** todo el texto va en `i18n/es.ts` (incluido un `Record` exhaustivo de los motivos de fin: si `shared/` agrega uno, deja de compilar); los colores salen de los tokens de tema.

## 7. Tema en el perfil

`syncThemeWithSession` conecta el almacén de tema con la sesión:

- Al iniciar sesión (o recuperarla al cargar), si el servidor tiene preferencia, se aplica y reemplaza a la local. Si no tiene ninguna pero el navegador sí, se sube la local.
- Mientras hay sesión, cada cambio de tema o de modo se guarda en el servidor sin bloquear nada; si falla, la preferencia local sigue valiendo. Aplicar la preferencia que vino del servidor no vuelve a guardarla (sin eco ni bucle).
- Sin sesión todo funciona como hoy (`localStorage` y el script anti-destello). Cerrar sesión conserva el tema actual del navegador.

## 8. Pruebas y verificación

- **Servidor:** funciones puras con pruebas por tabla (sin partidas, solo empates, rachas cortadas por empate o derrota, desempates del top 3, sin Pokémon ganados); `StatsService` contra la base de pruebas con partidas completadas, abandonadas, empatadas y ganadas por abandono (las `abandoned` no cuentan, cada persona solo ve lo suyo, orden y paginación con empates de fecha, cursor inválido, límites); rutas (sesión obligatoria, 404, privacidad del perfil ajeno, historial sin códigos de sala); preferencias (válidas, inválidas, presentes en login, registro, refresh y `/auth/me`); el motivo del fin por cada camino que termina una partida y en `abandonUnfinished`; el esquema (columnas, enums, restricciones coherentes con `status`, índices).
- **Cliente:** con endpoints falsos: carga, error con reintento, vacío, datos completos, 404, propio frente a ajeno (sin historial), "Cargar más", el botón del resumen, el enlace del encabezado y las guardas de ruta; todos los motivos de fin con texto; y `syncThemeWithSession` (el servidor gana, se sube lo local, se guarda al cambiar, un fallo se ignora, sin eco).
- **Mutaciones deliberadas:** contar partidas abandonadas, que el empate no corte la racha, filtrar el correo en el perfil ajeno, un error de uno en el cursor y que la sincronización pise la preferencia del servidor; las pruebas deben detectarlas todas.
- **Verificación real:** jugar varias partidas en el navegador contra el bot y comprobar que los números del perfil coinciden con la base; auditoría de contraste (`contrast-audit.js`) en las pantallas nuevas en los cuatro temas y modos; ancho móvil.
- Se sigue TDD.

## 9. Fuera de alcance

- Ranking global, perfiles sin sesión, avatares, detalle de una partida concreta, filtros del historial, gráficos, editar usuario, correo o contraseña, borrar la cuenta y estadísticas por par de tipos.
- Prueba E2E automatizada, despliegue, origen y cookie en producción, `COOKIE_SECURE` obligatorio, protección CSRF, límite de intentos de login y límite de peticiones (etapa 5).
