# PokeMiniGames: guía técnica

La portada del proyecto está en el [README](../README.md) (en inglés) y en [README.es.md](../README.es.md). Esta guía reúne el detalle: estructura, puesta en marcha, comandos, cada función, la API REST y los eventos de Socket.io.

Colección de minijuegos de Pokémon para 2 jugadores en tiempo real. **Doble tipo:** en cada ronda se enfrenta un par de tipos y cada jugador tiene 15 s para nombrar un Pokémon que tenga ambos; gana quien acumule más stats base. **¿Quién es ese Pokémon?:** los dos ven la misma silueta y tienen un solo intento; cuanto antes aciertes, más puntos. El diseño completo está en [`docs/superpowers/specs/`](superpowers/specs/).


**Para quien trabaje en el código (persona o agente):** la guía está en [`AGENTS.md`](../AGENTS.md) y el trabajo pendiente, en las [issues de GitHub](https://github.com/marcovinir/pokeminigames/issues) (la que lleva la etiqueta `hoja-de-ruta` da el orden).

## Capturas

Tema Clásico oscuro, en un navegador de 1280 × 720 (las genera la prueba `e2e/tests/screenshots.spec.ts`).

![Pantalla de acceso: «Minijuegos Pokémon para jugar 1 vs 1 con tus amigos», un dibujo por minijuego y el formulario](img/login.jpg)

![Menú principal: «¿A qué jugamos?» con las tarjetas de Doble tipo y de ¿Quién es ese Pokémon?](img/menu.jpg)

![Lobby con las tarjetas para crear una sala y para unirse con un código](img/lobby.jpg)

![Ronda en juego: el par de tipos, el anillo del cronómetro y el campo de respuesta con sugerencias](img/ronda.jpg)

![Resultado de la ronda con el arte oficial del Pokémon ganado y las insignias de cada jugador](img/resultado.jpg)

![Resumen de la partida: Ganaste, el marcador y el equipo con sus seis stats](img/resumen.jpg)

![Perfil con las fichas de estadísticas, el anillo de victorias y los Pokémon más ganados](img/perfil.jpg)

![El tema Pokédex en claro: encabezado rojo con luces, bordes marcados y letra monoespaciada](img/pokedex.jpg)

![«¿Quién es ese Pokémon?»: la silueta negra sobre rayos amarillos, el cronómetro y el campo de respuesta](img/silueta.jpg)

## Estructura

| Carpeta | Contenido |
|---|---|
| `server/` | API REST (Express) y tiempo real (Socket.io), motor de juego, Prisma y PostgreSQL |
| `client/` | Cliente web: React 19, Vite, Tailwind, Zustand y React Router |
| `shared/` | Tipos de eventos, payloads, códigos de error y `normalizeName`, compartidos por servidor y cliente |
| `e2e/` | Prueba de extremo a extremo con Playwright: dos navegadores reales juegan contra la construcción de producción |

## Requisitos

- Node 24 o superior
- PostgreSQL 18 (local, sin Docker)

## Puesta en marcha

```bash
npm install
```

1. Crea dos bases de datos: `pokemon_minigames` y `pokemon_minigames_test`.
2. Copia `server/.env.example` a `server/.env` y `server/.env.test.example` a `server/.env.test`; completa las credenciales de PostgreSQL y `JWT_ACCESS_SECRET` (mínimo 32 caracteres).
3. Aplica las migraciones y carga el catálogo:

```bash
npm run db:migrate -w server
npm run db:seed -w server
```

4. Arranca el servidor del juego (`http://localhost:3000`) y, en otra terminal, el cliente (`http://localhost:5173`):

```bash
npm run dev
npm run dev:client
```

En desarrollo el servidor de Vite hace de proxy de `/auth`, `/rooms`, `/pokemon`, `/stats`, `/users` y `/socket.io` al servidor del juego, de modo que cliente y API comparten origen y la cookie de sesión funciona. Abre `http://localhost:5173`, crea una cuenta y una sala; para jugar necesitas un segundo jugador (otro navegador o una ventana privada, con otra cuenta).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor del juego en modo desarrollo con recarga |
| `npm run dev:client` | Cliente web con recarga en caliente |
| `npm run build` | Construye el cliente (`client/dist`) y empaqueta el servidor (`server/dist/index.js`) |
| `npm start` | Arranca la construcción de producción (necesita las variables de `NODE_ENV=production`, ver la guía de despliegue) |
| `npm run e2e` | Construye y ejecuta las pruebas E2E (una partida completa, recargar en plena ronda, el modo invitado, la revancha, el límite de login, el tema y, en un navegador real, el diseño en móvil, el foco del teclado, el movimiento, las tipografías y el pulido de la partida: iconos de tipo, sugerencias con y sin pistas, el ejemplo tras la ronda y el equipo del rival): crea su propia base de datos, la borra al terminar |
| `npm test` | Todas las pruebas: servidor (usan la base `pokemon_minigames_test`) y cliente |
| `npm run typecheck` | Verifica los tipos con `tsc` en todos los paquetes |
| `npm run db:migrate -w server` | Crea/aplica migraciones en desarrollo |
| `npm run db:seed -w server` | Carga el catálogo desde `server/data/catalog.snapshot.json` |
| `npm run catalog:fetch -w server` | Vuelve a descargar el catálogo de PokéAPI al snapshot |
| `npm run smoke -w server` | Juega una partida real de una ronda contra el servidor en marcha |
| `npm run smoke:deployed -- URL` | Comprueba un despliegue en internet sin escribir nada (despierta el servicio si hace falta) |

Variable opcional del cliente: `VITE_API_URL` (URL base del servidor; vacía = el mismo origen).

## Producción y pruebas E2E

El servidor sirve el cliente construido, la API y Socket.io desde un solo origen, así que en producción no hay CORS y la cookie de sesión es `Secure` + `SameSite=Lax`. Las peticiones que cambian algo se rechazan si vienen de otro origen (403 `FORBIDDEN`) y, solo en producción (en desarrollo y en las pruebas están apagados), hay límites por IP en memoria: 5 intentos de login fallidos cada 15 minutos por IP y correo (y 30 por IP sumando todos los correos), 5 registros por hora, 20 sesiones de invitado por hora y 300 peticiones por minuto a la API (429 `RATE_LIMITED` con `Retry-After`). Cómo desplegarlo, qué esperar de la capa gratuita y cómo comprobarlo: [`docs/despliegue.md`](despliegue.md).

`npm run e2e` necesita Chromium: `npx playwright install chromium` desde `e2e/`, o define `E2E_CHANNEL=msedge` (o `chrome`) para usar el navegador ya instalado. Las imágenes de PokeAPI (iconos, sprites y arte) se sirven falsas durante la E2E para no depender de la red; con `E2E_REAL_IMAGES=1` se usan las de verdad (y una prueba comprueba que los 18 iconos reales siguen siendo píldoras de 200 × 40). Con `E2E_ADMIN_DATABASE_URL` (o tu `server/.env`) crea la base `pokemon_minigames_e2e`. En GitHub, [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) corre tipos, pruebas, construcción y E2E en cada push a `main` y en cada pull request.

## Cuentas

Registrarse pide correo, nombre de usuario y contraseña y abre la sesión en el acto: **no hay verificación del correo ni códigos por correo** (se descartaron a propósito). Consecuencia: **no hay recuperación de contraseña**; quien la olvida no puede recuperar esa cuenta. Para jugar sin cuenta está el [modo invitado](#modo-invitado). Los intentos de acceso están limitados por IP (ver abajo).

## Modo invitado

En `/login`, bajo el formulario, «¿Sin cuenta? Juega como invitado» pide solo un nombre (de 3 a 30 letras, números o guion bajo; no puede empezar por `borrada_`) y entra al lobby. Si ya juegas como invitado, esa pantalla lo dice y ofrece «Seguir jugando». Un invitado juega **igual que una cuenta**: crea salas, se une con un código y, si recarga la página en plena partida, vuelve a su asiento. Lo que **no** tiene: perfil, historial, estadísticas, preferencias guardadas ni Pokémon de avatar (en su lugar se ven sus iniciales). Su tema se queda en el navegador.

- **No guarda nada.** Un invitado no existe en la base de datos (su id es `guest_` + 16 bytes aleatorios) y **una partida en la que juega un invitado no deja ninguna fila** (ni `games`, ni `game_players`, ni rondas ni respuestas) y no cuenta para las estadísticas de la cuenta rival. Si una cuenta creó la sala y se une un invitado, la partida que ya estaba guardada en espera se descarta en ese momento; una vez descartada, la sala no vuelve a guardarse aunque el invitado se vaya antes de empezar.
- **Sesión.** La cookie `guest_session` (HttpOnly, solo viaja a `/auth`) dura 24 horas y se renueva cada vez que se recupera la sesión; es un JWT firmado, sin nada en el servidor. Iniciar sesión o registrarse la borra: la cuenta sustituye al invitado. «Cerrar sesión» borra todas las cookies de sesión. Quien se registra después empieza de cero.
- **Se nota.** Donde aparece el nombre de un invitado (sala de espera, cuenta atrás, panel del rival y barra «Marcador», resultado de la ronda y resumen final) lleva la etiqueta «Invitado», y su encabezado muestra «Invitado» y «Crear cuenta» en lugar de «Mi perfil». En una sala no puede haber dos jugadores con el mismo nombre (sin distinguir mayúsculas): quien se une con uno repetido recibe `409 NAME_IN_USE`, y la pantalla le dice qué hacer: un invitado puede cerrar sesión y volver con otro nombre; una cuenta no puede unirse a esa sala. El resumen no ofrece «Ver perfil de …» si alguno de los dos es invitado, y `/perfil` y `/jugador/:username` llevan a un invitado al lobby.
- **Límite.** En producción, hasta 20 sesiones de invitado por hora y por IP (429 `RATE_LIMITED`).

## Página de inicio y pie

La entrada (`/login` y `/registro`) presenta la colección: «Minijuegos Pokémon para jugar **1 vs 1** con tus amigos» y, en pantallas anchas, cada minijuego con su dibujo, su nombre y su frase (salen de `GAME_KINDS` y `GAME_CARDS`: un juego nuevo aparece solo). En el teléfono queda solo el lema, para que el formulario esté a la vista.

Todas las pantallas llevan un pie con **Acerca de, Contacto, FAQ, Privacidad, Términos, Aviso legal y Apoya el proyecto** (`/acerca`, `/contacto`, `/faq`, `/privacidad`, `/terminos`, `/aviso-legal`, `/apoya`): páginas públicas (se ven con sesión, sin ella y como invitado) cuyos textos están en [`client/src/i18n/info.tsx`](../client/src/i18n/info.tsx) y describen lo que el juego hace de verdad con los datos. El contacto es el repositorio público [pokeminigames-comentarios](https://github.com/marcovinir/pokeminigames-comentarios), con plantillas de «Idea» y «Error». No hay donaciones: el apoyo es compartir el juego, proponer ideas y avisar de errores.

## Borrar la cuenta

Al final de **Mi perfil**, «Borrar mi cuenta» pide la contraseña y **anonimiza** la cuenta: el correo, el nombre (pasa a uno de relleno, `borrada_` + 12 caracteres del id, y el original queda libre), la contraseña, el avatar y el tema; además cierra todas sus sesiones. Sus partidas se quedan porque también son de sus rivales: en su historial aparece como «Cuenta borrada», sin enlace. Nadie puede registrarse ni entrar como invitado con un nombre que empiece por `borrada_`. Una contraseña equivocada responde `403 WRONG_PASSWORD` y cuenta en el mismo límite de fallos por IP que el inicio de sesión. Para moderación (un nombre ofensivo) está `npm run account:delete -w server -- <nombre>`, explicado en [`docs/despliegue.md`](despliegue.md).

## Menú y juegos

Al entrar se llega al **menú principal** («¿A qué jugamos?»), con una tarjeta por juego. «Jugar» lleva a su lobby: `/jugar/doble-tipo` o `/jugar/silueta` (crear sala con las opciones de ese juego, unirse con código y la sala activa). Un código de sala lleva a la sala de su juego desde cualquier lobby, y «Volver al lobby» del resumen vuelve al lobby del juego de esa sala.

## «¿Quién es ese Pokémon?»

- **Opciones:** 5, **10** o 15 rondas, y las generaciones de las que salen los Pokémon (de la 1.ª, Kanto, a la 9.ª, Paldea; por defecto solo Kanto; al menos una).
- **Ronda:** el servidor sortea un Pokémon sin repetir y los dos ven su **silueta** sobre rayos amarillos, con 15 s. **Un solo intento**: el campo sugiere nombres (sin imagen ni tipos, solo de las generaciones elegidas) y, al enviar, «Respondiste en 3,2 s».
- **Puntos:** acertar al instante da 1000 y en el último segundo 100, en línea recta (`round(1000 − 900 × t / 15000)`, con el tiempo que mide el servidor); fallar o no responder, 0. Gana quien sume más; puede haber empate.
- **Revelación:** «¡Es Gengar!» a todo color, con lo que respondió cada uno, en cuántos segundos y sus puntos. El resumen final lista los Pokémon de la partida y quién acertó cada uno. Revancha, avatares e invitados, como en «Doble tipo».
- **Sin trampas:** antes de la revelación ni los eventos ni el estado de la sala llevan el número, el nombre o el arte del Pokémon (ni la respuesta del rival). La silueta la pinta de negro el servidor y la sirve en `/silhouettes/:token`, con un token aleatorio que no dice nada.
- **Por ahora no se guarda:** las partidas de silueta no cuentan en el perfil, el historial ni las estadísticas, y su revancha no muestra récord.

## Revancha

Al terminar una partida con normalidad, el resumen ofrece **«Revancha»**. Si las dos personas aceptan, el servidor abre una **sala nueva** con los mismos jugadores en los mismos asientos y **la misma configuración** (entera: también «Pistas de tipos» y cualquier opción futura), las dos pasan solas a ella por una pantalla corta, «¡Revancha!», y empieza la cuenta atrás de siempre. Ya no hay «Jugar de nuevo»; para jugar con otra persona, «Volver al lobby».

- **Relojes.** Hay **5 minutos** desde el final de la partida para pedirla; quien la pide espera, y el rival tiene **60 s** desde esa petición para aceptar o rechazar. Si alguien se desconecta tiene **10 s** para volver (una recarga no cuenta como irse: el resumen y el estado de la revancha vuelven solos). Si en la sala nueva el rival no entra en **30 s**, la sala se cancela («… no llegó.»); en la pantalla «¡Revancha!» quien espera puede irse con «Volver al lobby». Una vez dentro los dos, si alguien se cae en la cuenta atrás la sala espera como una normal (10 min).
- **Cuándo no hay.** Si la partida terminó por abandono, desconexión, cancelación o caducidad no se ofrece. Si se cierra sin revancha, quien se queda ve por qué: «… ya no quiere la revancha.» (canceló o rechazó), «… se fue.» (volvió al lobby, cerró la pestaña o no volvió en 10 s), «Se acabó el tiempo.», «La revancha ya no está disponible.» o «No se pudo crear la sala.».
- **Mientras se espera.** Arriba, el **récord** entre las dos cuentas (todas las partidas completadas entre ellas, con las últimas 5 como G/P/E; en la primera, «Es su primera partida juntos»); debajo, el plazo y un **dato curioso** de Pokémon que cambia cada 6 s, calculado del catálogo (nunca hay cifras escritas a mano).
- **Invitados.** La revancha funciona igual con invitados, pero sin récord, y la sala nueva tampoco se guarda (una partida con un invitado no deja filas). Entre dos cuentas cada revancha es una partida más en las estadísticas.

## Pokédex

`/pokedex` lista los 1025 Pokémon en tarjetas, de 60 en 60, con buscador por nombre (español o inglés) o número, pestañas de generación, filtro por dos tipos y orden por número, nombre o total de stats. `/pokedex/:id` es la ficha: stats, daño recibido, cadena de evolución con sus ramas, habilidades y una descripción. Las dos son públicas, se abren desde el encabezado (en la barra en el escritorio, en el botón «Menú» en pantallas estrechas) y el acceso se oculta durante una partida. Los filtros viven en la dirección (`/pokedex?tipo1=fire&tipo2=flying&gen=1&orden=total`).

Los datos están en `server/data/pokedex.snapshot.json`, generado desde PokeAPI con `npm run pokedex:fetch -w server`, y el servidor los lee al arrancar: no usa la base de datos ni depende de PokeAPI en vivo (las imágenes sí se cargan de allí). Las descripciones son textos oficiales, con su crédito. Donde PokeAPI no tiene texto en español (toda la generación 9 y parte de las habilidades recientes) se muestra el inglés con «(en inglés)». Las evoluciones que no se pueden decir en pocas palabras salen como «condición especial».

## Matriz de Tipos

`/tipos` es una página pública (con cuenta, como invitado o sin sesión) a la que se llega desde el encabezado (en la barra en el escritorio; en el botón «Menú» en pantallas estrechas); el acceso se oculta durante una partida, porque salir de la página cierra la conexión. Arriba, un selector de uno o dos tipos muestra el daño que recibe esa combinación; debajo está la tabla completa de 18 × 18, que en el teléfono se desplaza dentro de su caja. La selección vive en la dirección (`/tipos?tipo1=fire&tipo2=flying`), así que se puede compartir, y los valores desconocidos se ignoran.

La regla está en [`shared/src/type-chart.ts`](../shared/src/type-chart.ts) (`typeEffectiveness`, `damageTaken`). Una prueba compara los 324 valores con `server/test/shared/fixtures/type-chart.pokeapi.json`, que se regenera con `npx tsx scripts/type-chart-fixture.ts` desde `server/`.

## Avatares

En **Mi perfil**, «Cambiar avatar» abre una ventana con **24 Pokémon populares** (Pikachu, los tres iniciales de Kanto, Gengar, Eevee, Lucario, Greninja, Mimikyu…; la lista está en [`shared/src/avatars.ts`](../shared/src/avatars.ts)). Tocar uno lo guarda en la cuenta y se ve al instante; «Usar mis iniciales» lo quita. El avatar es el **arte oficial** del Pokémon dentro del círculo, sobre el mismo color que tenían las iniciales, y aparece en todo el juego: el encabezado, la sala de espera, la cuenta atrás, el panel del rival, el récord y la pantalla de la revancha, los perfiles y el historial.

- **En una sala** se ve el avatar que cada uno tenía al entrar (cambiarlo a mitad de partida se nota en la siguiente sala; la revancha copia el de la anterior). El historial y el perfil de otra persona muestran el que tiene hoy.
- **Sin avatar**, si la imagen no carga, o para un **invitado**: las iniciales de siempre. Un fallo de la base al leer el avatar nunca impide crear una sala ni unirse.
- **Otra pestaña u otro dispositivo** lo ven al recargar.

## Pulido de la partida

En **Elegir tipo** y en todos los chips de tipo se ve el símbolo oficial de cada tipo (el de PokeAPI, recortado de su imagen; es decorativo: el nombre sigue siendo el texto). En el campo de respuesta, cada sugerencia lleva el sprite del Pokémon, su número de Pokédex y los nombres en español e inglés. La opción de la sala **Pistas de tipos** (apagada por defecto, la elige quien crea la sala y vale para los dos) añade a cada sugerencia sus tipos, lo que vuelve la ronda mucho más fácil; sin ella los tipos ni viajan al navegador (`GET /pokemon/names` sin `?types=1`). Si en una ronda acierta 0 o 1 jugador, el servidor sortea entre los Pokémon de ese par que nadie tiene y lo muestra como «Un Pokémon que servía»; si aciertan los dos o no queda ninguno libre, no aparece. El panel del rival lista los Pokémon que ya ganó (nada que no se haya revelado antes en `round-result`), también tras recargar o reconectar.

## Estadísticas y perfil

En **Mi perfil** (`/perfil`) cada persona ve sus partidas jugadas, ganadas, empatadas y perdidas, el porcentaje de victorias, la racha actual y la mejor, sus 3 Pokémon más ganados, el poder promedio de los Pokémon que ganó, su mejor partida y el historial de sus partidas (con el motivo del fin: abandono, desconexión, etc.). Al terminar una partida se puede abrir el perfil del rival (`/jugador/:username`), que solo muestra estadísticas. Solo cuentan las partidas completadas; las abandonadas no. Todo se calcula al pedirlo a partir de las partidas guardadas (no hay tablas de estadísticas aparte).

## Música y sonido

El juego suena desde el principio; el botón «Menú» del encabezado tiene **Música** y **Efectos** (interruptor y volumen), que se guarda en el navegador (`pokeminigames:sonido`). El código está en [`client/src/sound/`](../client/src/sound/).

- **Música** (temas libres de OpenGameArt, en MP3 en [`client/public/audio/`](../client/public/audio/), con sus créditos en `CREDITOS.md`): en el menú, los lobbies y la espera suena un tema de sala al azar; desde la cuenta atrás hasta la última ronda, uno de combate (*Porkymon Battle Theme* toca su entrada y después el bucle); en el resumen, *Menu* si ganas o empatas una partida completa y *Game Over* si pierdes, una sola vez y después del efecto de final. Una partida que no se completó y no tiene ganador vuelve a la música de sala. Fuera de esas pantallas, silencio. Al cambiar de zona hay un fundido corto y se elige otro tema sin repetir el último; con la pestaña oculta se pausa. Qué música toca lo decide `musicCueFor` (`cues.ts`) y la zona queda en `<html data-music>` para la E2E.
- **Efectos de 8 bits**, generados con Web Audio (`synth.ts`), sin archivos: acierto, fallo, ganar, perder, empieza la ronda, últimos segundos (una vez por ronda, al quedar 5 s si no respondiste), botón, Pokémon revelado (silueta) y el rival respondió. Qué efectos dispara cada evento lo decide `effectsForEvent` (`cues.ts`); un `room-state` (entrar, recargar o reconectar) nunca suena.
- **El rival respondió:** al aceptar una respuesta, el servidor envía `opponent-answered` `{ round }` solo al otro jugador (en los dos juegos, sin decir qué respondió); el estado de la sala lleva `opponentAnswered` para recuperarlo al reconectar, y la ronda muestra «Tu rival ya respondió».
- El navegador no deja sonar nada hasta la primera interacción: el servicio lo reintenta con el primer clic o tecla.

**Limitación conocida (iOS):** Safari en iPhone y iPad no deja cambiar por código el volumen de un elemento `<audio>`, así que ahí el control de volumen de la música y su fundido no surten efecto (el interruptor y los efectos sí funcionan). Arreglarlo exigiría pasar la música por Web Audio; se deja así mientras no sea un problema real.

## Temas y accesibilidad

Cada jugador elige entre dos temas, **Clásico** (moderno y colorido: esquinas muy redondeadas, relieve, fondo con degradado y tipografía Fredoka) y **Pokédex** (la piel retro del mismo diseño: bordes marcados, sin sombras difusas y letra monoespaciada JetBrains Mono), y entre modo automático, claro u oscuro desde el botón «Apariencia» del encabezado; la preferencia se guarda en el navegador y, con la sesión iniciada, también en tu perfil (al entrar en otro navegador se aplica la del perfil). Los colores de todos los temas y de los 18 tipos cumplen el contraste AA de WCAG (lo comprueban las pruebas). Para revisar lo que realmente se ve, pega [`client/scripts/contrast-audit.js`](../client/scripts/contrast-audit.js) en la consola del navegador y ejecuta `__contrastAuditAll()`.

Las tipografías (Fredoka, Nunito y JetBrains Mono) se empaquetan con el proyecto (`@fontsource-variable`, solo los subconjuntos latino y latino extendido), sin pedir nada a servicios externos. Las animaciones son CSS puro y los números de los marcadores cuentan hasta su valor nuevo; si el sistema pide **reducir movimiento**, una sola regla apaga todas las animaciones y sus retardos y los números saltan directo al valor final. El diseño en pantallas estrechas se mide en un navegador de verdad (`e2e/tests/layout.spec.ts`: de 360 a 1280 px, con nombres de usuario de 30 letras), y el aro del foco del teclado se mide en los cuatro temas (`e2e/tests/focus.spec.ts`). El arte de cada Pokémon es el oficial de [PokeAPI](https://pokeapi.co) (solo donde hay pocas imágenes a la vez; en las listas, el sprite pequeño), con un esqueleto mientras carga y una bola neutra si falla. Este es un proyecto de fans sin fines de lucro: Pokémon y sus personajes son marcas de Nintendo, Game Freak y The Pokémon Company, y no hay relación con ellos.

Para regenerar las capturas de arriba: `E2E_SCREENSHOTS=1 npm run e2e -w e2e -- screenshots` (con `E2E_CHANNEL=msedge` si no instalaste Chromium); sin esa variable la prueba se omite.

## API REST

| Método y ruta | Descripción |
|---|---|
| `GET /health` | Estado del servidor |
| `POST /auth/register` | Crea la cuenta; devuelve `user` (con su `preferences` de tema, nulas al principio, y su `avatarId`, nulo = iniciales) y `accessToken` y fija la cookie de refresco |
| `POST /auth/login` | Inicia sesión; devuelve lo mismo que el registro |
| `POST /auth/guest` | Entra como invitado: `{ username }` (3 a 30 letras, números o guion bajo); devuelve `user` (`{ id, username, guest: true }`, sin correo) y `accessToken`, y fija la cookie `guest_session` de 24 h. No escribe nada en la base de datos. 20 por hora y por IP |
| `POST /auth/refresh` | Renueva la sesión con la cookie de cuenta (rota el refresh token) o, si no hay, con la de invitado (misma identidad, cookie renovada). Con las dos manda la de cuenta; una cookie de cuenta caducada no esconde una de invitado válida |
| `POST /auth/logout` | Cierra la sesión y borra las cookies (de cuenta y de invitado) |
| `GET /auth/me` | Usuario actual |
| `PUT /auth/me/preferences` | Guarda el tema: `{ theme: "clasico" \| "pokedex", themeMode: "auto" \| "claro" \| "oscuro" }` |
| `DELETE /auth/me` | Borra (anonimiza) la cuenta: `{ password }`. 204 y borra las cookies de sesión; contraseña equivocada: `403 WRONG_PASSWORD` (cuenta en el límite de fallos de login por IP); un invitado: `403 ACCOUNT_REQUIRED` |
| `PUT /auth/me/avatar` | Guarda el avatar: `{ avatarId }`, el número de Pokédex de uno de los 24 de `shared/src/avatars.ts` o `null` para volver a las iniciales; devuelve `{ avatarId }`. Cualquier otro valor: `400 VALIDATION_ERROR` |
| `POST /rooms` | Crea una sala de «Doble tipo»: `{ game?: "doble_tipo", typeMode: "random" \| "chosen", lengthMode: "fixed_rounds" \| "custom", roundsLimit?, statsGoal?, typeHints? }`, o de silueta: `{ game: "silueta", rounds?: 5 \| 10 \| 15, generations?: number[] }` (por defecto 10 y `[1]`); devuelve `{ code }`. Sin `game` es «Doble tipo». Una clave que no corresponde al juego elegido se rechaza con `400 VALIDATION_ERROR` (no se ignora en silencio). `typeHints` (booleano, `false` por omisión) activa las «Pistas de tipos»: las sugerencias muestran los tipos de cada Pokémon |
| `GET /rooms/current` | La sala activa del usuario: `{ room: { code, phase } }` o `{ room: null }` |
| `GET /rooms/:code` | Información pública de la sala |
| `POST /rooms/:code/join` | Reserva el asiento 2 |
| `GET /silhouettes/:token` | Pública. La silueta (PNG negro sobre transparente) de la ronda de ese token; `404 SILHOUETTE_NOT_FOUND` si no existe, `502 SILHOUETTE_UNAVAILABLE` si no se pudo obtener el arte. El servidor saca el arte de `SILHOUETTE_ART_URL` (plantilla con `{id}`; por defecto, el arte oficial de PokeAPI) |
| `GET /pokemon/dex` | Público. Lo ligero de todos los Pokémon, para la lista: `{ pokemon }` con id, nombres, tipos, total, generación y sprite |
| `GET /pokemon/dex/:id` | Público. La ficha completa de un Pokémon; si no existe, `404 POKEMON_NOT_FOUND` |
| `GET /pokemon/facts` | Público. Los datos curiosos de la pantalla de espera de la revancha: `{ facts }`, cada uno estructurado (`kind` y sus datos, p. ej. el Pokémon con más defensa base o cuántos Pokémon hay de un tipo); el cliente los redacta en español |
| `GET /pokemon/names` | Público. Lista de `{ id, es, en }` de todos los Pokémon, para el autocompletado; con `?types=1` cada elemento lleva además `types` (el cliente solo lo pide en salas con «Pistas de tipos») |
| `GET /stats` | Tus estadísticas: `{ username, avatarId, stats }` |
| `GET /stats/history?limit=&before=` | Tus partidas completadas, de la más reciente a la más antigua (`limit` de 1 a 50, por defecto 20); `before` es el `nextCursor` de la página anterior. Devuelve `{ games, nextCursor }`; cada partida trae al rival como `{ username, avatarId }` (su avatar de hoy) |
| `GET /users/:username/stats` | Las estadísticas de otra persona con su avatar (`{ username, avatarId, stats }`; nunca su correo ni su historial); `404 USER_NOT_FOUND` si no existe |

Las rutas de `/auth/me`, `/rooms`, `/stats` y `/users` exigen `Authorization: Bearer <accessToken>`. `/rooms` y Socket.io aceptan el token de una cuenta **o de un invitado**; `/auth/me`, `/auth/me/preferences`, `/auth/me/avatar`, `/stats`, `/stats/history` y `/users/:username/stats` solo el de una cuenta (a un invitado le responden `403 ACCOUNT_REQUIRED`). Los errores tienen la forma `{ "error": { "code", "message", "details"? } }`.

## Tiempo real (Socket.io)

Se conecta a `http://localhost:3000` con `auth: { token: <accessToken> }`. Un token inválido rechaza el handshake con `UNAUTHORIZED`. Los nombres y cargas exactos están tipados en [`shared/src/events.ts`](../shared/src/events.ts). Los eventos que marcan un plazo (`game-starting`, `choose-types`, `round-started`, `opponent-disconnected` y `room-state`) traen `serverNow`, la hora del servidor, para que el cliente corrija el desfase de su reloj.

| Cliente → servidor | Carga |
|---|---|
| `join-room` | `{ code }` (también sirve para reconectar; una segunda pestaña reemplaza a la primera) |
| `choose-type` | `{ type }` (modo elegido) |
| `submit-pokemon` | `{ text }` (un intento por ronda, máximo 100 caracteres) |
| `leave-room` | — (también cuenta como salir de una oferta de revancha: el rival ve «se fue») |
| `rematch-request` | — (pedir la revancha o aceptar la del rival) |
| `rematch-cancel` | — (cancelar la propia o rechazar la del rival) |

| Servidor → cliente | Cuándo |
|---|---|
| `room-state` | Al entrar o reconectar: estado completo de la partida, con tu equipo y el del rival (solo lo ya revelado). Cada jugador lleva `avatarId` solo si eligió uno |
| `player-joined`, `game-starting`, `choose-types`, `round-started` | Avance de la partida (`player-joined` trae el nombre del rival y, si los tiene, `guest` y `avatarId`) |
| `type-received`, `answer-received` | Confirman la recepción, sin decir si acertaste |
| `opponent-answered` | Al otro jugador: su rival ya respondió en la ronda abierta, `{ round }`, sin decir qué (en los dos juegos) |
| `round-result` | Resultado de ambos jugadores al cerrar la ronda, con `nextRoundAt` y, si acertaron 0 o 1 jugadores y la partida sigue, un `example`: un Pokémon libre de ese par que servía (en la última ronda no, porque el resumen sale al instante) |
| `game-ended` | Ganador, motivo, equipos y totales |
| `opponent-disconnected`, `opponent-reconnected` | Caída y vuelta del rival |
| `rematch-state` | Tras una partida terminada con normalidad: el estado de la oferta (`open`, `mine`, `theirs`, `starting` o `closed` con su `closedReason`), su `deadline` con `serverNow` y, entre dos cuentas, el `record` |
| `silhouette-round-started` | Silueta: empieza una ronda: `{ round, totalRounds, deadline, silhouetteUrl, serverNow }` (nunca dice qué Pokémon es) |
| `silhouette-answer-received` | Silueta: solo a quien respondió, `{ ms }` |
| `silhouette-round-result` | Silueta: la revelación (`reveal` con el Pokémon y la respuesta, el acierto, los ms y los puntos de cada uno), `totals` y `nextRoundAt` |
| `rematch-room` | Los dos aceptaron: `{ code }` de la sala nueva (que trae `rematch: true` en su `room-state`) |
| `error` | `{ code, message }` |
