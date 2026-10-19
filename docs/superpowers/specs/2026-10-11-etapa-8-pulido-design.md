# Pokémon Minigames — Etapa 8: Pulido de la partida (iconos de tipo, sugerencias con imagen, ejemplo tras la ronda y equipo del rival)

Fecha: 2026-10-11 · Estado: pendiente de revisión

Complementa la spec general (`2026-09-30-pokemon-minigames-design.md`) y las de las etapas 2 a 7; donde esta spec es más específica, manda. Las etapas 1 a 7 están en `main` y funcionan en https://pokemon-minigames.onrender.com. Esta etapa toca `shared/`, `server/` y `client/`; no cambia las reglas del juego, el puntaje ni la base de datos.

## 1. Objetivo

Que la partida se lea mejor y enseñe más mientras se juega: ver el icono oficial de cada tipo, reconocer al Pokémon en las sugerencias del campo de respuesta (imagen y número de Pokédex, y sus tipos si la sala lo permite), ver un ejemplo de lo que se podía contestar cuando nadie o solo una persona acertó, y ver el equipo del rival en todo momento.

## 2. Decisiones acordadas

| Tema | Decisión |
|---|---|
| Tipos en las sugerencias | **Opción de la sala «Pistas de tipos», apagada por defecto.** Mostrar los tipos permite buscar un nombre que tenga los dos del par y vuelve la ronda mucho más fácil; por eso es una opción de quien crea la sala y vale para los dos. Imagen y número de Pokédex salen siempre. |
| Iconos de tipo | Los oficiales de PokeAPI (`sprites/types/generation-ix/scarlet-violet/{n}.png`, con *n* = posición del tipo + 1; los 18 existen y pesan de 1,4 a 3 KB), con la misma cadena de respaldo que el arte: si no cargan, se ve el chip de hoy. |
| Ejemplo tras la ronda | Lo sortea el servidor entre los Pokémon de ese par que nadie tiene, solo cuando acertaron 0 o 1 jugadores. Viaja en `round-result`. |
| Equipo del rival | Se ve completo (lo ya revelado) en el panel del rival, también al recargar o reconectar. No revela nada nuevo: cada Pokémon ya se mostraba en `round-result` al ganarse. |
| Persistencia | `typeHints` no se guarda en la base de datos: la sala vive en memoria y el historial no lo usa. Sin migración. |
| Tipos en la lista de nombres | `GET /pokemon/names` sigue sin tipos; con `?types=1` los añade. El cliente solo lo pide en salas con pistas, así que sin pistas los tipos ni viajan. No es una barrera de seguridad (cualquiera puede pedirlos); es no mandar lo que no se usa. |

## 3. Experiencia

- **Elegir tipo.** Cada uno de los 18 botones muestra el icono oficial (28 px, decorativo: `aria-hidden`, `alt=""`) encima del nombre. El nombre sigue siendo el nombre accesible del botón.
- **Chips de tipo** (el par de la ronda, el resultado y las tarjetas): el mismo icono, pequeño (14 px en el tamaño normal, 18 px en el grande), a la izquierda del nombre.
- **Campo de respuesta.** Cada sugerencia (hasta 6, como hoy) es una fila de al menos 44 px con: el sprite pequeño, el número de Pokédex (`#025`) y el nombre en español con el inglés en gris. Con «Pistas de tipos» activas, añade a la derecha los chips con sus tipos. El teclado y las etiquetas ARIA no cambian (patrón combobox).
- **Crear sala.** Un interruptor «Pistas de tipos», apagado, con la aclaración «Muestra los tipos en las sugerencias; hace la ronda más fácil». La sala de espera muestra la insignia «Pistas de tipos» cuando está activo, con el resto de la configuración.
- **Resultado de la ronda.** Si acertaron 0 o 1 jugadores y el servidor encontró un Pokémon libre de ese par, aparece debajo una tarjeta «Un Pokémon que servía: {nombre}» con su arte, sus tipos y su total. Si acertaron los dos, o no queda ninguno libre, no aparece. El texto accesible del resumen para lectores de pantalla incluye el ejemplo.
- **Equipo del rival.** El panel «Tu rival» lista sus Pokémon (sprite, nombre y total) como «Tu equipo» lista los tuyos; mientras no tiene ninguno, dice «Se revelan al cerrar cada ronda.».

## 4. Contrato compartido (`shared`)

- `RoomConfig` gana `typeHints: boolean`. `CreateRoomRequest` gana `typeHints?: boolean` (por defecto `false`).
- `RoomStateView` gana `opponentTeam: PokemonView[]`: el equipo del rival en el orden en que lo reclamó.
- `RoundResultPayload` gana `example?: PokemonView`: ausente salvo que acertaran 0 o 1 jugadores y exista un Pokémon libre de ese par.
- `PokemonName` (cliente) gana `types?: TypeName[]`.

## 5. Servidor

- **`POST /rooms`:** el esquema acepta `typeHints` (booleano opcional) y lo copia a la configuración; con cualquier otro tipo de valor, `VALIDATION_ERROR`. Toda construcción de un `RoomConfig` fuera de ahí (repositorio de partidas, estadísticas, pruebas) lo completa con `false`.
- **Catálogo:** `freeMembers(pair, claimed): CatalogPokemon[]` (los Pokémon de doble tipo de ese par que no están reclamados), en el mismo orden estable que `poolSize`.
- **Motor (`closeRound`):** después de asignar a cada jugador el Pokémon que ganó, si el número de resultados `VALID` es ≤ 1, toma `freeMembers(pair, owners)` y, si no está vacío, sortea uno con el generador inyectable (`pickOne`) y lo incluye como `example`. Nunca coincide con uno ganado en la ronda porque ya están reclamados. El sorteo no se hace cuando acertaron los dos, así que el flujo del generador de las partidas sin ejemplo no cambia.
- **`buildRoomState`:** añade `opponentTeam: teamViews(state, otherSeat(seat), catalog)`.
- **`GET /pokemon/names`:** sin parámetros, igual que hoy (`Cache-Control: public, max-age=86400`); con `?types=1`, cada elemento lleva además `types`. Se arman las dos listas una sola vez al crear el router.

## 6. Cliente

- `catalog/artwork.ts`: `typeIconUrl(type: TypeName): string` y `spriteUrl(id: number): string` (el sprite pequeño por número de Pokédex, con la misma comprobación de entrada que `artworkUrl`).
- `TypeChip`: icono opcional a la izquierda (activo por defecto), que se oculta si la imagen falla. `TypePickerView`: icono encima del nombre en cada botón.
- `Autocomplete`: las filas descritas en la sección 3; recibe `showTypes` y los nombres con `types`. Si la sala tiene pistas pero la lista llegó sin tipos (falló la carga), muestra las filas sin chips.
- `names-store`: `load({ withTypes })`; si ya hay nombres sin tipos y se piden con tipos, vuelve a pedir con `?types=1`.
- Formulario de crear sala: `typeHints` en `CreateRoomForm`, `DEFAULT_FORM` (`false`), `buildRequest` y `formFromConfig`; el interruptor accesible (`role="switch"` o casilla con etiqueta). `WaitingView`: la insignia.
- Estado de la partida (`apply-event`): `opponentTeam` se reemplaza con `room-state` y se amplía con cada `round-result` (sin duplicados por número de Pokédex). `OpponentPanel` recibe la lista; `RoundResultView` muestra la tarjeta del ejemplo con `PokemonCard`.
- Textos nuevos en `i18n/es.ts`.

## 7. Pruebas y verificación

- **Servidor (TDD):** el esquema de `typeHints` (por defecto, verdadero, valor inválido); `freeMembers` (excluye reclamados, solo doble tipo, orden estable); `closeRound` con 0, 1 y 2 aciertos, sin libres, y que el ejemplo nunca es un Pokémon ganado ni de otro par; `buildRoomState` con `opponentTeam` (solo lo ya reclamado); `/pokemon/names` con y sin `?types=1`; la configuración de las rutas de salas y el repositorio completan `typeHints`.
- **Cliente (TDD):** `typeIconUrl` y `spriteUrl`; icono del chip y del selector (y que desaparece al fallar); fila de sugerencia con y sin tipos, y con la lista sin tipos; el almacén de nombres vuelve a pedir con tipos; el formulario y la insignia; `apply-event` con `opponentTeam`; la tarjeta del ejemplo y el panel del rival tras reconectar.
- **E2E en navegador real:** el selector muestra los 18 iconos; una ronda que nadie acierta muestra el ejemplo; una sala con pistas muestra los tipos en las sugerencias y una sin pistas, no.
- **Diseño:** a 360–1280 px sin desplazamiento horizontal con sugerencias, nombres de 30 letras y el panel del rival lleno; la lista de sugerencias cabe en 375 × 667.
- **Mutaciones:** romper a propósito el límite de aciertos del ejemplo, la exclusión de reclamados, la condición de `showTypes` y la lectura de `?types=1`, y comprobar que alguna prueba lo detecta.
- **Revisión final independiente (opus), con foco en:** spoilers de tipos (solo con la opción encendida), privacidad del equipo del rival (nada antes de revelarse), diseño a 375 px y accesibilidad de los controles nuevos.

## 8. Riesgos

- **Imágenes externas:** iconos y sprites vienen de PokeAPI en GitHub, como el arte; si fallan o tardan, las pantallas quedan como hoy y los tamaños fijos evitan saltos de diseño.
- **Lista más alta:** 6 filas con imagen miden más; se limita a 6 y se mide en 375 × 667.
- **Azar fijo en pruebas antiguas:** el sorteo del ejemplo consume el generador solo cuando hay ≤ 1 aciertos y quedan libres; las pruebas del motor con secuencias fijas se ajustan en el plan.
- **Compatibilidad:** un cliente anterior ignora los campos nuevos; uno nuevo ante un servidor anterior ve `typeHints` indefinido y lo trata como `false`.
- **Pistas ≠ seguridad:** quien quiera los tipos puede pedirlos; la opción solo decide qué se muestra.

## 9. Fuera de alcance

«Jugar de nuevo» en la misma sala y la foto de perfil (etapa 9), el siguiente minijuego, sonido, y cambiar las reglas o el puntaje.

## 10. Entrega

Rama `etapa-8-pulido`, una tarea por área (contrato y servidor, nombres con tipos, iconos, sugerencias, formulario e insignia, resultado y equipo del rival, E2E, documentación), revisión final independiente, fusión en `main` y subida con permiso de Marco; Render redespliega solo.

## 11. Ajustes tras la revisión final y el recorrido real (2026-10-18)

Lo que la revisión independiente y las capturas en un navegador real cambiaron respecto de lo escrito arriba (el resto sigue igual):

- **Los iconos de PokeAPI no son iconos cuadrados.** Los 18 de `scarlet-violet` son píldoras de **200 × 40** con el símbolo a la izquierda y el nombre en inglés (no hay ninguna generación con símbolos sueltos). Se muestran **recortados a su símbolo** (`object-fit: cover`, alineados a la izquierda) en una caja cuadrada fija: 14 px en el chip normal, 18 px en el grande y **24 px (no 28)** en «Elegir tipo». El tamaño va en estilo en línea porque el preflight de Tailwind pone `height: auto` y `max-width: 100%` a toda `img`. Una prueba opcional de la E2E (`E2E_REAL_IMAGES=1`) vigila que PokeAPI siga sirviendo las 18 píldoras de 200 × 40.
- **«Un Pokémon que servía» va arriba**, compacto, entre el par de tipos y las dos tarjetas de resultado (la sección 3 decía «debajo»): la pausa dura 6 s y debajo de las tarjetas, en un teléfono, no se llegaba a ver.
- **El panel «Tu rival» se ve también por debajo de 768 px** (debajo de la arena), con lo ya revelado: antes solo existía desde `md`. La arena se apila por encima (`z-5`) para que la lista de sugerencias se despliegue sobre el panel.
- **«Elegir tipo» a 375 px:** cada tesela es una fila baja (icono a la izquierda) hasta `sm` y una columna desde `sm`; así caben los 18 tipos a la vista.
- **El par de tipos del resultado envuelve** (`flex-wrap`) para no desplazar la página en horizontal con los iconos.
- **La E2E no depende de la red:** las imágenes de PokeAPI se sirven falsas (mismo tamaño que las reales) salvo con `E2E_REAL_IMAGES=1` o al generar capturas. Con la red real, una carga lenta de imágenes agotaba plazos de la propia prueba (los 15 s de «Elegir tipo»).
- Menores diferidos (issue de deuda técnica): el ejemplo de la última ronda no se llega a ver (el resumen lo sustituye); en una sala con pistas se descargan dos listas de nombres; la E2E de 375 px mide el ancho de la lista y no si cabe en 667 px de alto; `aria-label` sobre un `<p>` en la configuración de la sala; `typeIconUrl` lanza ante un tipo desconocido (solo se alcanzaría con datos corruptos); el historial no rellena `typeHints`.
