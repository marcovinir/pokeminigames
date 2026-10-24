# «¿Quién es ese Pokémon?» y el menú de juegos — diseño

Issue #7. Diseñado con Marco el 2026-10-24. Maquetas en `2026-10-24-silueta-maquetas/` (`menu-principal.html`: Marco eligió la **A**; `ronda-silueta.html`: ronda y revelación).

## 1. Intención

PokeMiniGames es una colección de minijuegos de Pokémon para dos. Hoy solo tiene uno, el de nombrar un Pokémon con los dos tipos del par. Este diseño añade el **segundo minijuego**, «¿Quién es ese Pokémon?», y con él lo que hace falta para que haya **más de un juego**: un **menú principal** donde se elige a qué jugar.

El juego nuevo es la silueta de la serie, para dos: los dos ven la misma silueta negra, escriben el nombre y, al cerrar la ronda, se revela a todo color. Lo que lo hace divertido es la **carrera**: hay un solo intento por ronda y **los puntos dependen de lo rápido que aciertes**, así que hay que elegir entre rapidez y acierto.

Funciona bien si una persona entra, elige «¿Quién es ese Pokémon?» en el menú, crea una sala, se la pasa a un amigo y juegan 10 rondas sin dudas sobre qué hacer. También tiene que ser imposible saber de antemano qué Pokémon es mirando el navegador.

## 2. Objetivos, no objetivos y antiobjetivos

**Objetivos**
- Un **menú principal** con un juego por tarjeta. Cada tarjeta lleva a su lobby (crear sala y unirse con código).
- El juego **«¿Quién es ese Pokémon?»** completo, para dos, con sus rondas, puntos por tiempo, revelación, resumen final y revancha.
- Que el juego de tipos actual siga funcionando igual, ahora como uno de los juegos del menú.
- Invitados y avatares como en el juego actual.

**No objetivos**
- Más de dos jugadores.
- Pistas que vayan revelando la silueta poco a poco.
- Elegir las rondas fuera de 5, 10 o 15, o cambiar los 15 s.
- Un tercer juego (el menú solo debe admitirlo sin rehacerse).

**Antiobjetivos** (aunque funcione, sería un fracaso)
- Que se pueda saber qué Pokémon es antes de la revelación: por la dirección de la imagen, por la imagen a color, por las sugerencias o por cualquier evento.
- Que el juego de tipos cambie de comportamiento, pierda partidas guardadas o deje de contar en las estadísticas.
- Que una sala de un juego reciba eventos o pantallas del otro.
- Que algo se desborde a 375 px o falle el contraste en alguno de los 4 temas/modos.

## 3. Decisiones de Marco (tal como las tomó)

- **El juego:** la silueta, «¿Quién es ese Pokémon?» (le propuse tres; eligió esta).
- **Puntos por el tiempo de la respuesta:** cuanto antes aciertes, más puntos. Los dos pueden puntuar en la misma ronda.
- **Un solo intento por ronda.**
- **Menú principal** donde se elige el juego, que lleva **al lobby que ya tenemos**. Disposición **A**: tarjetas grandes una debajo de otra, cada una con su dibujo, nombre, una frase y «Jugar».
- **Elegir por generación:** «para que no sean los 1025 Pokémon debe haber una opción para elegir por generación».
- Le pareció bien todo lo propuesto en las reglas: puntos, reloj, rondas, silueta, revelación, final y la protección contra trampas (§5 y §6).

## 4. El menú principal y los lobbies

- **`/`** pasa a ser el **menú principal** («¿A qué jugamos?», con la frase «Elige un minijuego para dos.»). Hay una tarjeta por juego, en este orden:
  1. **«Doble tipo»** (el actual). Dibujo: dos chips de tipo. Frase: «Nombra un Pokémon con los dos tipos. Gana quien sume más stats.»
  2. **«¿Quién es ese Pokémon?»** (nuevo). Dibujo: una silueta. Frase: «Adivina la silueta. Cuanto más rápido, más puntos.» Lleva la etiqueta «NUEVO».
  - *Los nombres «Doble tipo» y las frases son decisión mía. Marco los vio en la maqueta y no los cambió.*
- Cada tarjeta lleva a **su lobby**: `/jugar/doble-tipo` y `/jugar/silueta` *(rutas, decisión mía)*. El lobby es el de hoy (crear sala con las opciones de ese juego, unirse con código, la sala activa) con el nombre del juego arriba y una forma de volver al menú.
- **Unirse con código** funciona desde cualquier lobby: el código lleva a la sala de su juego, sea cual sea *(decisión mía)*.
- Lo que hoy lleva a `/` (el logo, «Volver al lobby» del resumen y del perfil) se repasa. El logo va al menú, y «Volver al lobby» va al lobby **del juego de esa sala** *(decisión mía)*.
- Invitados: ven el mismo menú y juegan a los dos juegos.

## 5. «¿Quién es ese Pokémon?»: reglas

- **Opciones de la sala** (las elige quien la crea):
  - **Rondas:** 5, **10** (por defecto) o 15.
  - **Generaciones:** casillas de la 1.ª a la 9.ª. Por defecto **solo la 1.ª (Kanto)** *(el valor por defecto es decisión mía, por el «que no sean los 1025» de Marco)*. Al menos una tiene que quedar marcada. Rangos de Pokédex: 1.ª 1–151, 2.ª 152–251, 3.ª 252–386, 4.ª 387–493, 5.ª 494–649, 6.ª 650–721, 7.ª 722–809, 8.ª 810–905, 9.ª 906–1025.
- **Ronda:** el servidor sortea un Pokémon de las generaciones elegidas, sin repetir en la partida, y los dos ven a la vez su silueta. Tienen **15 s**.
- **Responder:** **un solo intento**, con el campo de nombre y sus sugerencias. Las sugerencias muestran **solo el nombre**, sin imagen ni tipos, y **solo de las generaciones elegidas** *(lo segundo es decisión mía)*. Al enviar, la respuesta queda guardada («Respondiste en 3,2 s»). No se sabe si fue acierto hasta la revelación.
- **Acierto:** el texto coincide con el nombre en español o en inglés de ese Pokémon, con la misma normalización que el juego de tipos (mayúsculas, tildes, espacios).
- **Puntos:** acertar en el instante 0 da **1000** y acertar en el último instante da **100**, en línea recta: `puntos = round(1000 − 900 × t / 15 000)`, con `t` en milisegundos desde el inicio de la ronda hasta que **el servidor** recibe la respuesta. Fallar o no responder da **0**. Ejemplo: acertar en 3 s da 820.
- **Fin de la ronda:** cuando responden los dos o se acaba el reloj. Llega la **revelación**: «¡Es {nombre}!» a todo color, lo que respondió cada uno (o «sin respuesta»), en cuántos segundos, si acertó y los puntos ganados, más el marcador. Unos segundos después empieza la siguiente ronda (la misma pausa que el juego de tipos).
- **Fin de la partida:** tras la última ronda gana quien sume más puntos. Puede haber **empate**. Resumen final y **revancha** como en el juego de tipos; la revancha copia la configuración entera.
- **Desconexiones, recargas, salir, abandonar, sala que caduca:** igual que en el juego de tipos (mismos plazos y mensajes). Si alguien se desconecta en plena ronda, su reloj sigue y sin respuesta suma 0.

## 6. «¿Quién es ese Pokémon?»: pantallas

- **Ronda** (maqueta, izquierda): el marcador arriba, «Ronda N de M», la **silueta negra del arte oficial sobre un fondo de rayos amarillos** como en la serie, «¿Quién es ese Pokémon?», el reloj de 15 s, el campo con «Enviar» y, al enviar, el aviso de que ya respondiste.
- **Revelación** (maqueta, derecha): el arte a color sobre los mismos rayos, «¡Es Gengar!», una fila por jugador con su avatar, su respuesta, ✓ o ✗, los segundos y «+N», y el marcador actualizado.
- **Sala de espera, cuenta atrás y resumen final:** las de siempre, con lo propio de este juego (las opciones en la sala de espera; en el resumen, puntos en vez de stats y la lista de los Pokémon de la partida con quién acertó cada uno).
- Accesibilidad: la silueta no tiene texto alternativo que delate al Pokémon («Silueta de un Pokémon»). En la revelación, el nombre se anuncia en el registro de la partida, como hoy el resultado de la ronda. Los 4 temas/modos, contraste y 375 px como en todo el juego.

## 7. Que no se pueda hacer trampa

- **El navegador no recibe la identidad del Pokémon hasta la revelación**: ni el número, ni el nombre, ni una URL con el número, en ningún evento ni en el estado de la sala.
- **La silueta la genera el servidor:** una imagen PNG con los píxeles del Pokémon en negro y el fondo transparente. Se sirve en una ruta con un identificador opaco de la ronda (por ejemplo `GET /silhouettes/:token`, con un token aleatorio que no deriva del número). El servidor obtiene el arte de PokeAPI, lo pinta de negro y lo guarda en una caché en memoria. El navegador nunca ve la imagen a color antes de tiempo.
  - *Decisión mía sobre el cómo:* decodificar el PNG y pintar de negro todo píxel con alfa mayor que 0 con una librería de PNG en JS puro (sin dependencias nativas, que complican el despliegue en Render). La URL de origen del arte debe poder cambiarse para la E2E, que no usa la red.
  - Si PokeAPI falla, la silueta no carga. La pantalla muestra un respaldo neutro («No se pudo cargar la silueta»), la ronda sigue y se puede responder igual.
- La revelación sí envía el número y el nombre, y a partir de ahí se usa el arte normal.
- Las sugerencias ya existen para todos (`/pokemon/names`) y no delatan nada por sí solas.

## 8. Diseño técnico (decisiones mías; el implementador puede ajustarlas sin cambiar el comportamiento)

- **Un juego, una configuración:** `RoomConfig` pasa a tener un discriminante `game` (por ejemplo `"doble_tipo" | "silueta"`). Una configuración sin `game` (salas y partidas guardadas de antes) **es «Doble tipo»**. La de la silueta lleva `rounds` (5, 10 o 15) y `generations` (lista de 1 a 9, sin repetir, al menos una). `POST /rooms` valida cada forma con zod.
- **Motor por juego:** el motor actual (`server/src/game/engine/`) sigue siendo el de «Doble tipo». La silueta tiene **su propio reductor puro** con el mismo patrón (`reduce(state, event, now, deps)` → estado y efectos, temporizadores con el `Scheduler`, vista por asiento con `serverNow`). La sala (`GameRoom`), el gestor (`RoomManager`), la revancha y el tiempo real se generalizan lo justo para trabajar con **cualquiera de los dos motores**, elegido por `config.game`: una interfaz común (crear, reducir, vista y resumen final) y los efectos comunes (programar, emitir, enviar estado, guardar). Copiar `room.ts` por juego queda descartado.
- **Eventos:** los propios de la silueta (inicio de ronda con el token de la silueta, respuesta recibida, resultado de la ronda y fin) se tipan en `shared/src/events.ts`. Los comunes (estado de sala, jugador unido, desconexiones, revancha) se reutilizan. El estado de sala (`room-state`) de la silueta es suyo: el cliente elige las pantallas por `config.game`.
- **Persistencia y estadísticas:** **pendiente de decidir con Marco** (§10). Mientras no se decida, el diseño no da por supuesto que las tablas `games/rounds/round_picks` guarden la silueta.
- **Cliente:**
  - Menú principal en `/`, lobbies en `/jugar/:juego`.
  - El formulario de crear sala, por juego.
  - La sala elige las pantallas por `config.game`.
  - Para la silueta, el campo de respuesta con sugerencias solo de nombre (el autocompletado actual con una variante sin imagen ni tipos).

## 9. Pruebas y «terminado»

Lo de `AGENTS.md` §7, más:
- **Motor de la silueta (TDD):**
  - sorteo sin repetir dentro de las generaciones;
  - un solo intento;
  - puntos según la fórmula: 1000 en 0 ms, 100 en 15 000 ms, 820 en 3000 ms; 0 si falla o no responde;
  - fin de ronda cuando responden los dos o al vencer el reloj;
  - empate;
  - desconexión y revancha.
- **Que nada delate al Pokémon antes de la revelación:** una prueba que recorre todos los eventos y estados de sala que recibe un jugador durante una ronda y comprueba que no aparecen ni el número, ni el nombre, ni la URL del arte.
- **La ruta de la silueta:** devuelve un PNG con solo píxeles negros o transparentes, un token desconocido da 404 y un token de una ronda ya revelada sigue funcionando *(decisión mía)*.
- **El juego de tipos:** todas sus pruebas siguen verdes. Una configuración guardada sin `game` se lee como «Doble tipo».
- **Cliente:**
  - menú y lobbies;
  - crear sala de cada juego;
  - la pantalla de ronda y la de revelación;
  - las sugerencias sin imagen.
- **E2E:**
  - dos navegadores juegan una partida de silueta de 5 rondas por el menú;
  - un código de un juego abierto desde el lobby del otro lleva a la sala correcta;
  - una medida a 375 px del menú y de la ronda.
- **README:** el menú, el juego nuevo, sus reglas y la API y los eventos nuevos. Nuevas capturas del menú y de la silueta.

## 10. Pendiente de Marco

- **¿Cuentan las partidas de la silueta?** Las opciones son: **(a)** no se guardan en esta primera versión (como las de un invitado), y el perfil, el historial y el récord de la revancha siguen siendo solo de «Doble tipo»; o **(b)** se guardan, y el historial y el perfil se separan por juego (por ejemplo, con pestañas), con un récord de revancha por juego.

## 11. Lo que se deja al implementador

- Los nombres exactos de los eventos, tipos, rutas internas y archivos (sin cambiar lo que se ve ni la regla anti-trampas).
- La librería de PNG en JS puro y el tamaño de la caché.
- La forma exacta de la interfaz común entre motores.
- Cómo se ven las casillas de generaciones en el formulario, siempre que quepan a 375 px y se distingan con teclado y lector de pantalla.
