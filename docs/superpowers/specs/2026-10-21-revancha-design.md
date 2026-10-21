# PokeMiniGames — Revancha (jugar de nuevo con la misma persona)

**Fecha:** 2026-10-21 · **Issue:** #5 · **Estado:** borrador para aprobación de Marco
**Maquetas aprobadas (opción B en las dos pantallas):** [`2026-10-21-revancha-maquetas/`](2026-10-21-revancha-maquetas/) — `pantalla-de-carga.html` (la pantalla «¡Revancha!» con Poké Ball) y `espera-revancha.html` (récord grande arriba, la espera debajo y el dato curioso más pequeño). Son HTML sueltos que se abren en el navegador; los datos de las maquetas son de ejemplo.

## 1. Intención

Cuando una partida termina, las dos personas suelen querer otra más. Hoy tienen que volver al lobby, que una cree una sala y pase el código y la otra lo escriba. La **revancha** lo reduce a un botón: si los dos aceptan, el servidor abre una sala nueva con los mismos jugadores y la misma configuración, y empieza sola.

Marco quiere además que la espera **no sea un tiempo muerto**: mientras el rival decide se muestra un **dato curioso de Pokémon** (como las pantallas de carga de Fortnite) y el **récord entre los dos jugadores** (la rivalidad), y entre «aceptaron» y «empieza» hay una pantalla corta con personalidad.

## 2. Objetivos, no objetivos y antiobjetivos

**Objetivos**
- Pedir revancha desde el resumen y que, si los dos aceptan dentro del plazo, ambos pasen solos a una sala nueva con la misma configuración (incluida «Pistas de tipos» y **cualquier opción futura**, p. ej. el monotipo de la #13) y empiece la cuenta atrás.
- Que nadie quede atrapado: si no hay revancha, cada quien tiene claro qué pasó y puede volver al lobby.
- Que funcione con invitados (hereda quién es invitado) y con recargas durante el plazo.
- Que la espera enseñe el récord entre los dos (solo entre cuentas) y datos curiosos ciertos.

**No objetivos**
- Marcador de la serie «1 – 0» solo de las revanchas de esta sesión (opción C descartada; lo cubre el récord total).
- Revancha con una tercera persona, cambiar la configuración en la revancha, o revancha pasadas las 60 s.
- Guardar nada nuevo en la base de datos: ni la oferta de revancha ni el récord (se calcula al pedirlo). **No hay migración.**
- Un chat o emojis entre los jugadores.

**Antiobjetivos (lo que sería un fallo aunque «funcione»)**
- Empezar una partida sin que **los dos** hayan aceptado, o abrir **dos** salas para la misma pareja si aceptan a la vez.
- Una oferta o una sala de revancha que **nunca se limpia** (fuga de memoria) o un jugador que se queda esperando para siempre.
- Una partida con un invitado que **escriba filas** en la base de datos o que cuente para las estadísticas (regla del modo invitado, también aquí).
- Mostrar un dato curioso falso, o un récord que no incluya la partida que acaba de terminar.
- Que un invitado vea un récord inventado, o que alguien vea estadísticas privadas del rival (el récord solo cuenta las partidas **entre esas dos cuentas**).

## 3. Lo que ve cada persona

**Resumen final (cuando la partida terminó con normalidad: motivo `completed` o `exhausted`).** El botón principal **«Revancha»** sustituye al «Jugar de nuevo» de hoy (que llevaba al lobby con la configuración rellena); junto a él, «Volver al lobby». Si el rival ya no está (abandonó, se desconectó o la sala se canceló o caducó: motivos `forfeit`, `disconnect`, `cancelled`, `expired`, `abandoned`), **no hay «Revancha»**: solo «Volver al lobby».

**Pedí yo primero — pantalla de espera (maqueta B de `espera-revancha.html`).** El bloque de revancha del resumen pasa a: arriba el **récord** («Tú contra misty · 3 – 2 · 5 partidas jugadas · vas ganando» y las últimas 5 partidas como G/P/E), debajo «Esperando a misty… Le quedan N s para decidir» con una barra de tiempo y el botón «Cancelar», y debajo, más pequeño, el **dato curioso** («¿Sabías que…?»), que cambia cada pocos segundos.
- Primera vez que se enfrentan: en lugar de «0 – 0», «Primera vez que se enfrentan».
- Si alguno es invitado: **no hay récord**; se ve solo la espera y el dato curioso.

**Pidió primero mi rival.** Lo mismo, pero el texto dice «misty quiere la revancha» y los botones son **«Aceptar»** y **«Rechazar»**, con el mismo plazo. El récord y el dato curioso se muestran igual.

**Los dos aceptaron — pantalla «¡Revancha!» (maqueta B de `pantalla-de-carga.html`).** Los dos avatares con una Poké Ball que se mece entre ellos, «Preparando la sala…» y cuántos ya entraron («✓ Tú, listo» / «misty entrando…»). Dura lo que tarden en entrar (casi siempre 1–2 s) y pasa sola a la **cuenta atrás de siempre**, que no cambia.

**Si no hay revancha**, quien se queda en el resumen ve un aviso y solo «Volver al lobby»:
- «misty ya no quiere la revancha» (canceló o rechazó),
- «misty se fue» (se desconectó y no volvió, o salió al lobby),
- «Se acabó el tiempo» (pasaron 60 s sin que los dos aceptaran),
- «No se pudo crear la sala» (el servidor falló; los dos vuelven al lobby).

## 4. Reglas

- **Plazo: 60 s desde la primera petición** (de quien pida primero). No se reinicia.
- **Cancelar o rechazar** es definitivo para esa oferta. Pulsar «Volver al lobby» mientras hay oferta cuenta como cancelar.
- **Recarga durante el plazo:** sigues esperando (o decidiendo) con el tiempo que quedaba; el servidor vuelve a mandar el resumen y el estado de la revancha.
- **Cerrar la pestaña o perder la conexión:** el rival ve «misty se fue» pasado un plazo corto de reconexión (**mi decisión: 10 s**, para no confundir una recarga con una salida). Un jugador desconectado nunca bloquea la oferta.
- **Entrar a la sala nueva:** los dos asientos están ocupados desde el principio; si el rival **no entra en 30 s** (**mi decisión**), la sala se cancela y quien sí entró ve «misty no llegó» y «Volver al lobby».
- Los dos aceptan a la vez: se crea **una sola** sala (el servidor decide el orden de llegada).
- Antes de crear la sala se comprueba que ninguno de los dos esté ya en otra sala activa; si lo está, cuenta como «se fue».
- **Misma configuración, copiada entera** (`RoomConfig` completo, no campo por campo) y los mismos asientos (el que era 1 sigue siendo 1).
- **Invitados:** la sala nueva hereda quién es invitado. Si alguno lo es, la sala nace `persisted = false` (ninguna fila, igual que cualquier partida con un invitado). Con dos cuentas se guarda normal y **cada revancha es una partida más** en las estadísticas.
- Una oferta solo existe para una partida terminada con motivo `completed` o `exhausted`.

## 5. Récord entre los dos jugadores

- Solo cuando **las dos personas tienen cuenta**. Cuenta las partidas **completadas** (`status = completed`, como las estadísticas) en las que participaron **las dos**.
- Lo calcula el servidor al abrir la oferta, **después de que la partida recién terminada ya esté guardada** (espera a que termine la cola de escrituras de la sala: el récord debe incluir esa partida). Se envía a los dos desde su punto de vista: `{ mine, theirs, draws, played, recent }`, con `recent` = el resultado de las últimas 5 (más reciente primero, «won/lost/drawn»).
- Es una consulta de lectura sobre `games` y `game_players` (ya hay índice por `userId`); **no hay tablas nuevas ni migración**. Con un historial largo basta con conteos y un `take: 5`.

## 6. Datos curiosos

- Unos **20 a 30**, en español, **calculados a partir del catálogo** de 1025 Pokémon que ya está en memoria (p. ej. «El Pokémon con más defensa base es Shuckle (230)», «Solo N Pokémon tienen los tipos X y Y», «El tipo con más Pokémon es …»), nunca escritos a mano con cifras: si el catálogo cambia, siguen siendo ciertos. Una prueba comprueba cada dato contra el catálogo.
- El cliente los muestra al azar, **sin repetir hasta agotarlos**, cambiando cada ~6 s (sin animación si el sistema pide reducir movimiento). De dónde los obtiene (dentro del estado de la revancha o una ruta pública de solo lectura) lo decide quien construye.

## 7. Diseño técnico (propuesto; el constructor puede ajustarlo si respeta lo anterior)

- **La oferta vive en `RoomManager`, no en `GameRoom`.** Un objeto `RematchOffer` (código de la sala vieja, los dos jugadores con `userId`, nombre, `isGuest` y asiento, la configuración, el estado de cada lado, el plazo) con un temporizador del puerto `Scheduler` (60 s, y el de 10 s de reconexión). Se crea cuando la sala termina con motivo `completed` o `exhausted`; se destruye al crear la sala, al cancelarse o al agotarse el plazo.
- **La sala terminada debe poder reconectarse durante la oferta.** Hoy se quita del almacén al terminar (`onFinished`), y una recarga da «la sala ya no existe». Mientras la oferta viva, la sala terminada se mantiene en el almacén (ya se excluye de `findByUser`, así que nadie queda «en una partida») y un `join-room` al código viejo devuelve `room-state` (fase `finished`), `game-ended` otra vez y el estado de la revancha. Sin oferta posible se quita al instante, como hoy.
- **Eventos nuevos** en `shared/src/events.ts` (nombres a decidir): cliente → servidor, pedir/aceptar y cancelar/rechazar; servidor → cliente, el estado de la revancha (quién pidió, plazo con `serverNow`, récord, resultado final de la oferta) y «ve a la sala NUEVO». El cliente añade todos a su lista exhaustiva `SERVER_EVENTS` (`game-client.ts`) y al reductor puro `apply-event.ts`.
- **Crear la sala de revancha:** un método del `RoomManager` que genera el código con las reglas de siempre, copia la configuración, sienta a los dos (con `guest` donde toque) y, si ninguno es invitado, guarda la partida (`createGame` y el segundo asiento, igual que una sala normal); si alguno es invitado, `persisted = false` sin `createGame`. Una sala de revancha caduca a los **30 s** si el rival no entra (la caducidad de una sala en espera se hace configurable por sala).
- **`RoomStateView` indica que la sala es una revancha**, para que la pantalla B salga también tras una recarga y no la sala de espera con su código.
- **Cliente:** el almacén gana el estado de la revancha; `SummaryView` pinta los tres estados del bloque; `RoomPage` navega a `/sala/NUEVO` al recibir el evento y muestra la pantalla B mientras la sala sea de revancha y aún no empiece la cuenta atrás. Todos los textos nuevos en `client/src/i18n/es.ts` y con las tildes correctas. Etiqueta «Invitado» donde aparezca el nombre de un invitado, como en el resto del juego.
- **Accesibilidad:** el cambio de estado de la oferta se anuncia a los lectores de pantalla (la cuenta atrás visible va oculta, como en el aviso de desconexión); el dato curioso cambia sin robar el foco; los botones son botones.

## 8. Pruebas

TDD, cada prueba vista fallar primero.
- **Motor/sala/manager (con repositorio y reloj falsos):** oferta solo con motivo `completed`/`exhausted`; pedir primero uno u otro; aceptan a la vez → una sala; cancelar, rechazar, plazo agotado, reconexión de 10 s, cierre y vuelta; el rival ya está en otra sala; sala nueva con configuración idéntica (incluido un campo desconocido); asientos iguales; `persisted` según invitados (cero llamadas de escritura con un invitado, el control con dos cuentas se guarda); la sala de revancha caduca a los 30 s; la sala terminada se limpia al terminar la oferta (sin fugas).
- **Récord:** con base de datos real; incluye la partida recién terminada; solo completadas; solo entre esas dos cuentas; empates; primera vez; con un invitado no hay récord.
- **Datos curiosos:** cada dato verificado contra el catálogo de pruebas.
- **Cliente:** `apply-event` de los eventos nuevos; los estados del resumen; navegación a la sala nueva; pantalla B tras una recarga; textos; accesibilidad.
- **E2E con dos navegadores reales:** aceptan y juegan otra partida entera; uno rechaza; se agota el plazo; recarga durante el plazo; con un invitado (sin récord, sin filas en la base de datos); la partida de revancha entre dos cuentas cuenta en las estadísticas; a 375 px con nombres de 30 letras nada se sale.
- **Mutaciones** de las protecciones críticas (empezar sin los dos, dos salas a la vez, `persisted` con invitados, récord sin la última partida, la oferta que no se limpia).
- Verificación en navegador real con imágenes reales y auditoría de contraste, revisión final independiente, README y `docs/` al día, y la prueba de humo tras desplegar.

## 9. Riesgos y foco de la revisión

1. **Dos salas para la misma pareja** (aceptan a la vez, o aceptan y uno pulsa «Volver al lobby» en el mismo instante).
2. **Fugas:** ofertas, temporizadores y salas terminadas que se quedan en memoria; sala de revancha que nadie ocupa.
3. **Filas escritas con un invitado**, también por el camino nuevo de creación de la sala.
4. **Reconexión** durante la oferta (recarga, otra pestaña, segundo dispositivo) y el reemplazo de socket de siempre.
5. **El récord** sin la última partida (carrera con la cola de escrituras) o contando de más.
6. **El abuso:** pedir y cancelar sin parar (los eventos ya tienen límite por socket; la oferta es una sola por pareja).
7. **Un campo nuevo de la configuración que no viaje** a la sala de revancha.

## 10. Decisiones mías para que las confirmes al leer

- 10 s de reconexión antes de «se fue».
- 30 s para que el rival entre a la sala nueva.
- «Revancha» solo con motivo `completed`/`exhausted`.
- Mantener la sala terminada en el almacén mientras dure la oferta (en vez de guardar el resumen aparte).
- «Jugar de nuevo» (lobby con la configuración rellena) desaparece: lo sustituye «Revancha» (para jugar con otra persona, «Volver al lobby»).
- Datos curiosos: 20–30, sin repetir hasta agotarlos, cada ~6 s.
- Récord: solo partidas completadas, últimas 5 como G/P/E.
