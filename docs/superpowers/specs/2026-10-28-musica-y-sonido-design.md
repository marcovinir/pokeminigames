# Música y efectos de sonido (versión 1.0) — diseño

Fecha: 2026-10-28 · Estado: borrador para que Marco lo apruebe · Rama: `musica-y-sonido`

## Intención

A Marco le han dicho que el juego necesita **música y efectos de sonido**, y él quiere que suene **como los juegos de Pokémon**: un efecto al acertar, al fallar y al ganar, música durante la partida y música en la sala donde se crea o se espera la partida. Como la música y los efectos de Pokémon son de Nintendo y Game Freak (y es lo que más vigilan), se decidió usar **música original de licencia libre, inspirada en ese estilo**, y **efectos de 8 bits generados por código**. Marco escuchó una playlist de candidatos (https://claude.ai/artifact/3LF9ZF7axdF1ooDhXRgZQE) y eligió.

## Objetivos

1. **Música por momento (selección de Marco)**, con un tema al azar de la lista de cada momento:
   - **Sala de espera** (menú, lobbies y sala de espera antes de empezar): *Town Center*, *Title Screen*, *Bittersweet Story*, *Pavane* y *Dungeon*.
   - **Durante la partida**: *Porkymon Battle Theme* (su entrada corta suena una vez y luego el combate en bucle), *8-Bit Battle Loop* y *Chipped Urgency*.
   - **Final de la partida**: si **ganas**, *Menu*; si **pierdes**, *Game Over*.
2. **Efectos (selección de Marco)**: acierto y fallo de la «versión anterior» de la playlist; ganar, perder, empieza la ronda, últimos segundos, botón, Pokémon revelado y el rival respondió de la «versión nueva». El código exacto de esos sonidos (el de la playlist) está en `docs/superpowers/specs/2026-10-28-musica-y-sonido-efectos.js`, como referencia para el implementador.
3. **Activado desde el principio (decisión de Marco).** Como los navegadores no dejan sonar nada hasta que la persona toca la página, el sonido empieza con su primera interacción.
4. **Control siempre a la vista**: un botón de altavoz en el encabezado abre un panel con **Música** (interruptor y volumen) y **Efectos** (interruptor y volumen). Se recuerda en el navegador.
5. **Igual en los dos minijuegos** (Doble tipo y ¿Quién es ese Pokémon?).
6. **Créditos** de cada tema donde la licencia lo pide, y de cortesía para los CC0.

## No objetivos

- **Nada de música ni efectos de los juegos de Pokémon, ni remixes o mixes de sus canciones** (decisión de Marco tras hablarlo: la melodía sigue siendo de Nintendo; Pokémon Showdown la usa sin licencia y eso no la hace legal).
- Sin música generada por IA ni de pago.
- Sin preferencias de sonido guardadas en la cuenta del servidor (solo en el navegador; mi decisión, se puede ampliar después).
- Sin música en la página de inicio, crear cuenta ni en las páginas de información (mi decisión: la música empieza en el menú, después de entrar).

## Antiobjetivos

- Que el sonido moleste: volumen alto por defecto, efectos encima de efectos, música que se reinicia al moverse entre pantallas de la misma zona o que sigue sonando con la pestaña oculta.
- Que no haya forma rápida de silenciarlo, o que silenciarlo no se recuerde.
- Que la información que da un sonido solo llegue por el sonido (personas sordas o con el sonido apagado): lo que un efecto anuncia también se ve en pantalla.
- Que la página pese más o tarde más en cargar: el audio se carga solo cuando hace falta.
- Que algún tema no suene en un iPhone.

## Restricciones

- Las del repositorio (AGENTS.md): español con tildes, TDD, contraste AA en los 4 temas, 375 px y escritorio, no subir `main` sin permiso, y el trabajo entra por Pull Request con la CI en verde.
- **Formato que suene en todos los navegadores, iPhone incluido:** MP3 (o AAC). Los temas que vienen en OGG o WAV se convierten; el implementador elige cómo (sin dependencias de pago; la conversión es un paso de preparación, no del servidor).
- **Peso:** cada tema en torno a 128 kbps y el total de la música por debajo de ~15 MB (hoy *Town Center* pesa 7,2 MB a 320 kbps: se reconvierte).
- Los efectos **no son archivos**: se generan con Web Audio en el cliente.
- Sin migraciones.

## Los temas (origen y licencia)

Todos de OpenGameArt; se descargan de su página (los nombres de archivo exactos están en cada una).

| Momento | Tema | Autor | Licencia | Página |
|---|---|---|---|---|
| Sala | Town Center | Trevor Lentz | CC-BY-SA 3.0 (citar) | https://opengameart.org/content/town-center |
| Sala | Title Screen, Bittersweet Story, Pavane, Dungeon | Aureolus_Omicron | CC0 | https://opengameart.org/content/15-melodic-rpg-chiptunes |
| Partida | Porkymon Battle Theme (entrada + combate) | Joth | CC0 | https://opengameart.org/node/95339 |
| Partida | 8-Bit Battle Loop | Wolfgang_ | CC0 | https://opengameart.org/content/8-bit-battle-loop |
| Partida | Chipped Urgency | Centurion_of_war | CC0 | https://opengameart.org/content/chipped-urgency |
| Ganar | Menu | SuperGamersGames | CC-BY 4.0 (citar) | https://opengameart.org/content/6-chiptune-loops |
| Perder | Game Over | Aureolus_Omicron | CC0 | https://opengameart.org/content/15-melodic-rpg-chiptunes |

Los créditos van en la página **Acerca de** (los dos que lo exigen, con autor, licencia y enlace; los CC0 como agradecimiento) y en `client/public/audio/CREDITOS.md`. La aclaración de la `LICENSE` sobre lo que no cubre se amplía a la música.

## Cuándo suena qué

**Música** (una sola a la vez; al cambiar de momento, fundido corto):

| Momento | Pantallas / fase | Tema |
|---|---|---|
| Sala | menú principal, lobbies, sala de espera (`waiting`), pantalla «¡Revancha!» | uno al azar de la lista de sala; **sigue sonando** al moverse entre estas pantallas |
| Partida | desde la cuenta atrás hasta la última ronda (`starting`, `choosing_types`, `round_active`, `round_result`) | uno al azar de la lista de partida, en bucle; *Porkymon* empieza por su entrada |
| Final | resumen (`finished`) | ganar → *Menu*; perder → *Game Over*; **empate → *Menu*** (mi decisión: nadie perdió). Suena **una vez**, sin bucle |
| Nada | inicio de sesión, crear cuenta, páginas de información, perfil | silencio (la música se detiene con fundido) |

- Al volver a un momento se elige otro tema al azar, sin repetir el último si hay más (mi decisión).
- **Con la pestaña oculta la música se pausa** y sigue al volver (mi decisión).

**Efectos:**

| Efecto | Cuándo |
|---|---|
| Acierto (versión anterior) | Doble tipo: al llegar el resultado de la ronda, si mi resultado es `VALID`. Silueta: al llegar la revelación, si mi respuesta es correcta |
| Fallo (versión anterior) | lo mismo, si no (incluido no responder) |
| Pokémon revelado | silueta: al llegar la revelación, **antes** del acierto o el fallo (este suena al terminar la revelación, ~0,6 s después; mi decisión) |
| Empieza la ronda | al empezar cada ronda (los dos juegos) |
| Últimos segundos | una vez por ronda, al entrar en los últimos 5 s (cuando el cronómetro se pone en rojo), si aún no respondí |
| Ganar / Perder | al terminar la partida, según el resultado (empate: ganar) |
| Botón | al pulsar los botones principales (`Button`) y los «Jugar» del menú |
| El rival respondió | cuando el rival envía su respuesta en la ronda abierta (ver abajo) |

**«El rival respondió» necesita un aviso nuevo del servidor** (hoy no existe): un evento de Socket.io `opponent-answered` con `{ round }`, que el servidor envía al **otro** jugador cuando uno responde, en los dos juegos. No dice qué respondió. **Decisión mía, que cambia un poco el juego:** saber que el rival ya respondió mete presión (sobre todo en la silueta, donde la rapidez da puntos). Por la regla de accesibilidad, además del sonido aparece en pantalla un aviso discreto «Tu rival ya respondió».

## El control

- Botón de altavoz en el encabezado (con su etiqueta accesible), visible en todas las pantallas, también sin sesión.
- Abre un panel (como el de Apariencia) con: **Música** (interruptor + volumen) y **Efectos** (interruptor + volumen). El icono del botón muestra si está todo silenciado.
- Valores por defecto (mi decisión): todo activado, música al 50 %, efectos al 70 %.
- Se guarda en `localStorage` (con el mismo cuidado que el tema: si el almacenamiento falla, funciona igual con los valores por defecto).
- Contraste AA en los 4 temas y usable con teclado.

## Lo que queda al implementador

La arquitectura del cliente (un servicio de sonido inyectado en `services`, con un doble en las pruebas, es lo natural), cómo se decide qué efecto suena a partir de los cambios de estado de la partida (idealmente una función pura probada a fondo), el fundido, la conversión a MP3 y su herramienta, la forma exacta del panel, y las pruebas E2E que tengan sentido (el audio no se oye en una prueba, pero sí se puede comprobar qué pista se pidió).

## Comprobación

- Pruebas unitarias de: qué música corresponde a cada pantalla/fase y resultado; qué efectos dispara cada cambio de estado (acierto, fallo, revelado, últimos segundos una sola vez, ganar, perder, empate); los ajustes guardados y su lectura cuando el almacenamiento falla; el evento `opponent-answered` en el servidor (al otro jugador, no al que respondió, en los dos juegos).
- Que cada archivo de música publicado existe, es MP3 y respeta el peso.
- A mano: escuchar una partida completa de cada juego, en escritorio y en un teléfono, y comprobar que el silencio se recuerda.
