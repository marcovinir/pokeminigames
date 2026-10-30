# Tabla de tipos — diseño

Diseñado con Marco el 2026-10-30. Maqueta en `2026-10-30-pokedex-maquetas/tabla-tipos.html` (Marco eligió **las dos** opciones: selector arriba y tabla debajo).

## 1. Intención

PokeMiniGames tiene minijuegos, pero nada para aprender de Pokémon. Marco quiere una zona complementaria, común en este tipo de páginas, para «buscar datos de un Pokémon y ver sus estadísticas para ganar partidas, aprender de Pokémon». Se compone de esta tabla de tipos y de la Pokédex (`2026-10-30-pokedex-design.md`).

Funciona bien si alguien entra a la página, elige «fuego» y «volador» y entiende en segundos qué le hace daño, o consulta qué tipo le conviene mirando la tabla, sin cuenta y también desde el teléfono.

## 2. Objetivos, no objetivos y antiobjetivos

**Objetivos**
- Una página pública `/tipos`, con cuenta, como invitado o sin sesión.
- Arriba, un **selector** de uno o dos tipos que muestra el daño que recibe esa combinación.
- Debajo, la **tabla completa** de 18 × 18.
- Un enlace en el **encabezado** para llegar.
- La regla de efectividad en `shared`, una sola vez: la Pokédex la reutiliza para las debilidades.

**No objetivos**
- Efectividad ofensiva de una combinación (qué le hace daño *ella* a otros): la tabla ya lo responde fila por fila.
- Habilidades que cambian la efectividad (Levitación, Absorbe Fuego…) y tablas de generaciones antiguas.
- Usar la tabla dentro de los minijuegos.

**Antiobjetivos** (aunque funcione, sería un fracaso)
- Un solo valor de efectividad equivocado: es una página de referencia y su utilidad depende de que sea exacta.
- Que el teléfono ensanche la página entera: solo la tabla se desplaza de lado, dentro de su caja.
- Que el color sea la única forma de leer una celda.
- Que cambie cualquier cosa de las partidas.

## 3. Lo que decidió Marco

- Selector arriba y tabla debajo.
- Se llega desde el **encabezado**, no desde tarjetas del menú principal.
- Filtrar por dos tipos es correcto aunque ayude a buscar respuestas de «Doble tipo» en otra pestaña (decisión tomada para la Pokédex; aquí se aplica al enlace que lleva a ella).

## 4. Comportamiento

**Selector.** Dos listas, «Tipo 1» y «Tipo 2» (esta opcional, sin repetir el tipo 1). Con al menos un tipo muestra el daño recibido agrupado en ×4, ×2, ×½, ×¼ y ×0, omitiendo los grupos vacíos y el ×1. También enlaza «Ver estos Pokémon en la Pokédex», hacia `/pokedex?tipo1=fire&tipo2=flying`. Hasta que exista la Pokédex (si esta se hace antes), el enlace no aparece. La selección vive en la dirección (`/tipos?tipo1=fire&tipo2=flying`): se puede compartir, y un valor desconocido se ignora sin romper la página.

**Tabla.** La fila es el tipo que ataca y la columna, el que recibe (lo dice un texto visible). Celdas ×2, ×½ y ×0 con color **y** con su cifra; las ×1 quedan vacías. Con los tipos elegidos, sus columnas se resaltan. En tablas semánticas (`<th scope>`), con nombres completos para el lector de pantalla aunque se vean abreviados.

**Encabezado.** Un enlace con icono y el texto «Tipos» (solo icono con nombre accesible en pantallas estrechas), junto al de «Pokédex» cuando exista. Se ocultan en `/sala/:code`, porque salir de la página durante una partida cierra la conexión. Tienen que caber a 360 y 375 px con un nombre de 30 letras y como invitado: el encabezado ya va justo, y si no caben se decide con Marco antes de seguir.

**Datos.** En `shared`, `typeEffectiveness(attacker, defender)` y `damageTaken(types)`, con la tabla vigente de 18 tipos (generación 6 en adelante). No hace falta servidor ni base de datos.

**Sonido.** Suena la música de sala, como en el menú.

## 5. Decisiones del implementador (de Claude, revisables por Marco)

- Rutas `/tipos`; parámetros `tipo1` y `tipo2` con los identificadores en inglés que ya usa el código.
- Abreviaturas de tres letras en la cabecera de la tabla.
- La página se carga aparte (`lazy`) para no engordar el arranque del juego.

## 6. Criterios de aceptación

- Prueba de la matriz completa (324 valores) comparada con un archivo de referencia generado una vez desde `pokeapi.co/api/v2/type/{1..18}` y guardado en el repositorio de pruebas; además los casos de Charizard: ×4 roca, ×0 tierra.
- Pruebas de la página: selector con uno y dos tipos, dirección compartible, valores inválidos, enlace del encabezado (sin sesión, invitado, cuenta; oculto en una sala).
- E2E: abrir `/tipos` sin sesión y elegir una combinación; a 360 y 375 px, medir con `boundingBox` que nada se sale salvo el desplazamiento interno de la tabla, con el nombre de 30 letras.
- Navegador real a 375 px y escritorio; auditoría de contraste vacía en los 4 temas/modos.
- `docs/guia-tecnica.md` y los dos README al día; prueba de humo tras desplegar.
- Revisión final independiente de la rama.
