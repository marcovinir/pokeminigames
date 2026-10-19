# PokeMiniGames — Modo invitado (jugar sin cuenta y sin estadísticas)

Fecha: 2026-10-18 · Estado: pendiente de revisión de Marco · Issue: [#3](https://github.com/marcovinir/pokemon-minigames/issues/3)

Complementa la spec general (`2026-09-30-pokemon-minigames-design.md`) y las de las etapas 2 a 8; donde esta spec es más específica, manda. Se construye **después** de fusionar la Etapa 8 (issue #1) y de quitar la verificación por correo (issue #2): esta spec da por hecho que el registro y el inicio de sesión son los de antes de la etapa 7 (correo + usuario + contraseña, sesión al instante, sin códigos). Toca `shared/`, `server/`, `client/` y `e2e/`; **no cambia la base de datos** (sin migración).

## 1. Intención

Que alguien pueda **entrar y jugar en segundos sin crear una cuenta**: abre la página, pulsa «Entrar como invitado», escribe un nombre, y crea una sala o se une con un código. Nace de ver que otras páginas no obligan a registrarse y de haber descartado la verificación por correo y los códigos OTP (fricción innecesaria).

Un invitado juega **igual que una cuenta** (mismas salas, mismas reglas, mismo puntaje, reconexión al recargar), pero **no existe para el sistema de estadísticas**: no hay perfil, ni historial, ni estadísticas, y **una partida en la que juega un invitado no se guarda para nadie** (tampoco cuenta para la cuenta registrada que juegue contra él). Decisión de Marco (2026-10-18).

### Objetivos
- Entrar como invitado desde la pantalla de iniciar sesión, con solo un nombre.
- Jugar partidas completas contra cuentas o contra otros invitados, incluida la reconexión tras recargar la página.
- Cero rastro en la base de datos de una partida con invitado.
- Que el rival sepa que juega contra un invitado.

### No objetivos
- Convertir al invitado en cuenta conservando algo (si se registra después, empieza de cero).
- Perfil, historial, estadísticas, avatar o preferencias guardadas para invitados.
- Moderación de nombres (filtro de palabras), chat, espectadores o listas públicas de salas.
- Defensas contra abuso más allá de límites por IP.

### Antiobjetivos (fallarían aunque «funcione»)
- Una partida con invitado que escriba filas (o falle con un error de clave foránea) en `games`, `game_players`, `rounds` o `round_picks`.
- Un token de invitado que se acepte donde se exige una cuenta (`/auth/me`, `/stats`, `/users/…`), o que pueda hacerse pasar por una cuenta.
- Un invitado que se vea idéntico a una cuenta con el mismo nombre.

## 2. Experiencia

- **Entrada.** En la pantalla de iniciar sesión (`/login`), bajo el formulario, un bloque «¿Sin cuenta? Juega como invitado» con un campo «Nombre» y el botón «Entrar como invitado». El nombre sigue la regla de los usuarios: 3 a 30 letras, números o guion bajo (`/^[A-Za-z0-9_]{3,30}$/`, con espacios recortados). Al entrar va al lobby.
- **Encabezado de un invitado.** En lugar de «Mi perfil», una etiqueta «Invitado» con su nombre y un botón «Crear cuenta» (lleva a `/registro`). Conserva el botón «Salir» y el menú de apariencia. Mientras es invitado puede abrir `/login` y `/registro` (no se le redirige al lobby); al iniciar sesión o registrarse, la sesión de cuenta **sustituye** a la de invitado.
- **Lobby.** Igual que el de una cuenta: crear sala (con todas las opciones) o unirse con un código, y «volver a tu partida» si tiene una sala activa.
- **Etiqueta «Invitado» para el rival.** Donde aparece el nombre de un jugador que es invitado (sala de espera, panel del rival y barra de marcador, tarjetas del resultado de la ronda, resumen final) lleva una etiqueta «Invitado» (texto, no solo color).
- **Sin perfiles.** En el resumen final no aparece «Ver perfil de …» si el rival es invitado ni si quien mira es invitado. Las rutas `/perfil` y `/jugador/:username` redirigen a un invitado al lobby.
- **Tema.** El tema y el modo de apariencia siguen funcionando, pero **solo se guardan en el navegador** (no se llama a `PUT /auth/me/preferences`).
- **Nombre repetido en la sala.** Al unirse, si el nombre coincide (sin distinguir mayúsculas) con el del otro jugador de la sala, se rechaza con un mensaje claro («Ya hay alguien con ese nombre en la sala. Entra con otro nombre.»).

## 3. Identidad y sesión

- **Sin filas en la base de datos.** Un invitado no se guarda en ninguna tabla. Su identidad es un **id aleatorio con prefijo** (`guest_` + 16 bytes aleatorios en base64url, que nunca puede confundirse con el UUID de una cuenta) y el nombre que eligió.
- **Token de acceso.** El mismo JWT HS256 y la misma clave que el de las cuentas, con duración igual a la actual, pero con un campo `guest: true` en la carga (`AccessTokenPayload.guest?`). `verifyAccessToken` lo devuelve en el resultado.
- **Dos niveles de autenticación.** El middleware actual (`createRequireAuth`) pasa a aceptar cuentas **e** invitados (`requireIdentity`), y se añade `requireAccount`, que rechaza al invitado con **403 `ACCOUNT_REQUIRED`** («Necesitas una cuenta para esto.»; código nuevo en `shared/src/errors.ts` y mensaje en `client/src/i18n/es.ts`). Rutas:
  - `requireIdentity` (cuenta o invitado): todo `/rooms/*`, `GET /rooms/current` y el handshake de Socket.io.
  - `requireAccount` (solo cuentas): `GET /auth/me`, `PUT /auth/me/preferences`, `GET /stats`, `GET /stats/history`, `GET /users/:username/stats`.
- **Sobrevivir a recargar.** El token de acceso vive solo en memoria, así que hace falta algo equivalente a la cookie de refresco: una **cookie firmada `guest_session`** (`HttpOnly`, `Secure` según `COOKIE_SECURE`, misma política `SameSite` y mismo `path: /auth` que la de refresco) cuyo contenido es un JWT firmado con `typ: "guest"`, el id, el nombre y una caducidad de **24 h** (decisión del diseño; el implementador puede ajustarla). No hay nada en la base de datos que revocar: salir (`POST /auth/logout`) borra la cookie.
- **Rutas nuevas.**
  - `POST /auth/guest` `{ username }` → valida el nombre, crea el id, fija la cookie `guest_session` y devuelve `{ user: { id, username, guest: true }, accessToken }`. Sujeto a un límite por IP (sección 6).
  - `POST /auth/refresh` pasa a aceptar **cualquiera de las dos cookies**: si hay cookie de refresco de cuenta, como hasta ahora; si no, y hay `guest_session` válida, emite un token de acceso de invitado nuevo (y renueva la cookie); si no hay ninguna, `401` como hoy. Si llegan las dos, manda la de cuenta.
  - Iniciar sesión o registrarse con éxito **borra** `guest_session` (la cuenta sustituye al invitado).
- **Socket.io.** El handshake (`server/src/realtime/server.ts`) copia `guest` del token a `socket.data.user` (que gana `isGuest`), de modo que la sala sabe quién es invitado también por tiempo real.
- **Una sola sala a la vez.** La regla actual (un usuario no puede estar en dos salas) vale por id, también para invitados: dos pestañas del mismo navegador comparten el invitado, igual que una cuenta.

## 4. Servidor: partidas sin rastro

Hoy la fila de la partida (`games` + `game_players`, estado `waiting`) se crea **al crear la sala** (`GameRepository.createGame`, llamado desde `RoomManager.createRoom`), el segundo jugador se añade al unirse (`addSecondPlayer`) y cada efecto `persist_*` del motor se ejecuta en `GameRoom`. Las tablas tienen clave foránea a `users`, así que un id de invitado **no se puede guardar**.

Regla: **una sala se guarda solo si todos los que han ocupado un asiento son cuentas.**

- `RoomUser` gana `isGuest: boolean`. `GameRoom` gana `persisted: boolean` (verdadero solo mientras todos son cuentas) y `gameId: string | null`.
- **Crea un invitado:** `RoomManager.createRoom` no llama a `createGame`; la sala nace con `persisted = false` y `gameId = null`. La unicidad del código se comprueba solo contra las salas en memoria.
- **Crea una cuenta y se une un invitado:** en el momento en que el invitado ocupa el asiento 2 (donde hoy se ejecuta `persist_seat_taken` / `addSecondPlayer`), la sala llama a un método nuevo del puerto, `GameRepository.discardGame(gameId)`, que borra la fila `waiting` (y sus `game_players`) en una transacción, y marca la sala `persisted = false`. Si el borrado falla se anota el error (sin datos personales) y la sala **sigue sin guardarse igual**: una fila `waiting` huérfana no cuenta para estadísticas ni historial y `abandonUnfinished` la marca como abandonada en el próximo arranque.
- **Es permanente:** una vez `persisted = false`, la sala no vuelve a guardarse aunque el invitado se vaya antes de empezar.
- Con `persisted = false`, `GameRoom` ignora todos los efectos `persist_*` (asiento ocupado o liberado, inicio, rondas y fin). Nada más del motor cambia: el reductor puro, las rondas, el puntaje y la reconexión son los mismos.
- `GET /rooms/current`, la reconexión por Socket.io y el resto del ciclo de vida de la sala **no cambian**: viven en memoria.
- `RoomPlayerView` (en `shared/src/events.ts`) gana `guest?: boolean` (ausente = cuenta); lo rellenan `buildRoomState` y el evento `player-joined` (cuyo payload gana `guest?: boolean`). Un cliente anterior lo ignora.
- **Nombre repetido:** al unirse, `RoomManager.joinRoom` compara el nombre con el del otro jugador (sin distinguir mayúsculas) y lanza `409 NAME_IN_USE` (código nuevo, con su mensaje) si coinciden. Dos cuentas nunca coinciden (los usuarios son únicos); el caso real es invitado contra cuenta o contra invitado.

## 5. Cliente

- `AuthUser` gana `guest?: boolean`. El almacén de sesión gana `loginAsGuest(username)` (llama a `POST /auth/guest`) y el estado `authenticated` pasa a distinguir cuenta e invitado con un ayudante `isGuest(user)`. `bootstrap()` ya intenta `POST /auth/refresh` al cargar: con la cookie de invitado recupera la sesión de invitado.
- Rutas: un componente `RequireAccount` (como `RequireAuth`, pero redirige a un invitado al lobby) protege `/perfil` y `/jugador/:username`; `PublicOnly` deja pasar a un invitado a `/login` y `/registro`.
- Pantalla de acceso, encabezado, sala de espera, panel del rival, resultado y resumen: lo descrito en la sección 2; la etiqueta «Invitado» es un solo componente reutilizable.
- El almacén de tema (`theme-store`) solo llama a `savePreferences` si el usuario es una cuenta.
- Textos nuevos en `i18n/es.ts` (incluidos `ACCOUNT_REQUIRED` y `NAME_IN_USE`).

## 6. Límites contra abuso

Los límites de peticiones viven en memoria y por IP (`server/src/http/limits.ts`; en producción dependen de `TRUST_PROXY`). Se añade uno para `POST /auth/guest`: **20 sesiones de invitado por hora y por IP** (valor del diseño, ajustable) con `429 RATE_LIMITED` y `Retry-After` como los demás. No se necesita más: un invitado no escribe en la base de datos, y el tope de «una sala por usuario» más este límite acotan las salas en memoria que una sola IP puede abrir.

## 7. Pruebas y verificación

- **Servidor (TDD):**
  - `POST /auth/guest`: nombre válido e inválido (formato, longitud, espacios), cookie fijada con los atributos de seguridad, límite por IP.
  - `POST /auth/refresh` con cookie de invitado: emite token de invitado; con cookie caducada o manipulada, `401`; con las dos cookies manda la de cuenta; login y registro borran la cookie de invitado; logout la borra.
  - `requireAccount` rechaza un token de invitado con `403 ACCOUNT_REQUIRED` en `/auth/me`, `/auth/me/preferences`, `/stats`, `/stats/history` y `/users/:username/stats`; `requireIdentity` lo acepta en `/rooms/*` y en el handshake de Socket.io.
  - Un token de invitado manipulado o con otra clave se rechaza; un token de cuenta nunca trae `guest`.
  - **Sin rastro:** con un repositorio falso, una sala creada por un invitado no llama a ninguna operación de persistencia; una sala de cuenta a la que se une un invitado llama a `discardGame` y a nada más después. Con la base de datos real y una partida completa con un invitado (creando él, y uniéndose él), `games`, `game_players`, `rounds` y `round_picks` quedan **sin filas nuevas**; una partida entre dos cuentas sigue guardándose igual que hoy.
  - Si `discardGame` falla, la sala sigue sin guardarse y la partida se juega.
  - `NAME_IN_USE` (mayúsculas distintas, mismo nombre) y que dos nombres distintos pasan.
  - `GET /rooms/current` y la reconexión funcionan para un invitado.
  - Las estadísticas de la cuenta que jugó contra un invitado **no cambian**.
- **Cliente (TDD):** el bloque de invitado en `/login` (validación, errores, entra al lobby); el almacén (`loginAsGuest`, `bootstrap` con cookie de invitado, `logout`); encabezado de invitado (etiqueta, «Crear cuenta», sin «Mi perfil»); redirecciones de `/perfil` y `/jugador/:username`; etiqueta «Invitado» en sala de espera, panel del rival, resultado y resumen; sin «Ver perfil de …» con un invitado; el tema no llama a `savePreferences`; `/login` y `/registro` accesibles siendo invitado y la cuenta sustituye al invitado.
- **E2E en navegador real:** un invitado y una cuenta juegan una partida completa; el invitado recarga en plena ronda y sigue; al terminar, el perfil de la cuenta **no cuenta** la partida y la base de datos de la prueba no tiene filas de esa partida; el invitado ve la etiqueta de su rival y la cuenta ve «Invitado»; a 375 px nada se sale en la pantalla de acceso, el encabezado y las etiquetas (con un nombre de 30 letras).
- **Mutaciones:** romper a propósito (a) la comprobación de `guest` en `requireAccount`, (b) el salto de `createGame` para invitados, (c) el borrado `discardGame`, (d) que `persisted` no se vuelva falso, (e) la comparación de nombres de `NAME_IN_USE`, (f) el límite por IP de `POST /auth/guest`, (g) que login/registro borren la cookie de invitado y (h) que el resumen oculte el perfil con un invitado; comprobar que alguna prueba falla en cada caso.
- **Revisión final independiente**, con foco en: escalada de privilegios (token de invitado como cuenta), filas escritas por una partida con invitado, sesión de invitado tras salir o tras iniciar sesión, y diseño a 375 px.

## 8. Qué se deja al implementador

Duración exacta de la cookie de invitado (24 h de partida), cifra del límite por IP, nombres de los códigos de error y de los eventos nuevos, dónde exactamente va la etiqueta «Invitado» en cada pantalla (debe verse en todas las de la sección 2), el detalle de la transacción de `discardGame`, y cómo se modela en el cliente la unión de cuenta e invitado (un tipo con `guest?` o dos tipos).

## 9. Riesgos

- **Fuga de filas:** cualquier camino nuevo del motor o de la sala que persista sin pasar por `persisted`. Se cubre con la prueba de base de datos real («sin rastro») y la mutación (d).
- **Escalada de privilegios:** un endpoint de cuentas que se quede con `requireIdentity`. Se cubre con la prueba que recorre todas las rutas de cuentas con un token de invitado.
- **Nombre falso:** un invitado que imita a una cuenta; mitigado por la etiqueta y por `NAME_IN_USE`.
- **Memoria:** salas de invitados que nunca terminan. Mitigado por el límite por IP, la regla de una sala por usuario y la caducidad de salas que ya existe.
- **Entre issues:** la revancha (#5) debe heredar `persisted` e `isGuest` de la sala anterior; el avatar (#6) no aplica a invitados (se mantienen las iniciales).

## 10. Entrega

Rama `modo-invitado`, una tarea por área (contrato y sesión, rutas de autenticación, partidas sin rastro, cliente de acceso y encabezado, etiquetas y perfiles, E2E, documentación), revisión final independiente, fusión en `main` y subida con permiso de Marco; Render redespliega solo. El README gana una sección «Modo invitado».
