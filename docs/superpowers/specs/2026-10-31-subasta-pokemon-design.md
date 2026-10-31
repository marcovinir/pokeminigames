# Subasta Pokémon — diseño

Tercer minijuego de PokeMiniGames. Idea de Marco (su documento «PokeAuction Showdown»), ajustada con él el 2026-10-31.

## 1. Intención

Un juego 1 vs 1 de dos partes: primero se puja por Pokémon que solo se ven como silueta, y luego se combate con lo comprado. Une lo que el sitio ya tiene: siluetas, Matriz de Tipos y stats.

Lo que lo hace divertido: reconocer una silueta y pujar fuerte, gastar de más por presionar al rival, llevarse un chasco con una silueta trampa, y elegir el movimiento justo en el combate.

Funciona bien si dos personas juegan una partida completa en unos 5 a 8 minutos, sin dudas sobre qué hacer, y al terminar quieren la revancha.

## 2. Objetivos, no objetivos y antiobjetivos

**Objetivos**
- Subasta abierta por turnos de 6 Pokémon y 3 objetos.
- Combate por turnos con elección secreta de movimiento.
- Sala con invitados, reconexión y revancha, como los otros juegos.
- Un simulador que compruebe el balance antes de construir la interfaz.

**No objetivos**
- Movimientos reales de cada Pokémon, habilidades, estados alterados o naturalezas.
- Más de dos jugadores.
- Tienda fuera de la subasta.
- Gráficas elaboradas en el resumen final.

**Antiobjetivos** (aunque funcione, sería un fracaso)
- Que se pueda saber qué Pokémon es antes de la revelación: por eventos, por la imagen o por la dirección de la silueta.
- Un combate que no termina.
- Que pujar poco y guardar sea siempre lo mejor, o que gastar todo en el primer lote lo sea.
- Que una partida dure tanto que nadie la termine.
- Que cambien los otros dos juegos o sus partidas guardadas.

## 3. Lo que decidió Marco

- **Siluetas trampa:** a veces la silueta no es el Pokémon real, para hacerlo divertido; pasa poco y se puede quitar al crear la sala.
- **Montos altos**, de cientos de miles o millones.
- **Cada Pokémon empieza con un valor aproximado según su silueta.**
- **Se van turnando quién empieza la puja.**
- **Máximo 3 Pokémon por jugador,** así que son 6 por partida.
- **Cada 2 Pokémon se subasta un objeto,** y por eso no hay tienda.
- **Tres movimientos:** uno por cada tipo y uno de soporte. Según el movimiento se usa Ataque o Ataque Especial.
- **Cada jugador elige su movimiento en secreto en cada turno** (opción A).
- **Críticos sí, con baja probabilidad, y esquivar no.**
- Aceptó las demás propuestas de Claude en su conjunto («todo lo demás lo veo muy bien»): las de la sección 4 que llevan número.

## 4. Reglas

Todos los números son **valores de partida**: el simulador puede corregirlos.

### Subasta
- **Dinero:** cada jugador empieza con 1.000.000, propios, no compartidos.
- **Lotes:** 6 Pokémon en orden al azar: 2 débiles, 2 medios y 2 fuertes, por tercios del total de stats del catálogo.
- **Silueta trampa:** encendida por defecto; cada lote tiene 1 probabilidad entre 6. Se muestra la silueta de otro Pokémon cualquiera; el real puede ser mejor o peor.
- **Precio inicial:** unos 300 × el total de stats del Pokémon **mostrado**, con ±20 % al azar y redondeado a miles. Así la trampa también engaña en el precio.
- **Turnos:** en cada lote empieza un jugador distinto; el primero es al azar. Quien tiene el turno sube (+10.000, +50.000 o +100.000) o pasa. La primera puja puede ser el precio inicial. Hay 10 s por turno; sin respuesta, pasa. Cuando uno pasa tras una puja, el otro se lo lleva.
- **Todo es visible:** pujas y dinero de los dos.
- **Tope de puja:** dinero menos 50.000 por cada hueco que te quede después de este lote, para poder completar tu equipo.
- **Máximo 3:** si alguien ya tiene 3, los lotes restantes van al otro a precio inicial.
- **Si los dos pasan:** el Pokémon va a quien tenga menos Pokémon, a precio inicial; si empatan, a quien empezó ese lote. Si no le alcanza, se lo lleva gratis. Todos terminan con 3.
- **Objetos:** tras los lotes 2, 4 y 6 se subasta un objeto al azar con las mismas reglas de turnos, sin tope de hueco. Si los dos pasan, nadie se lo lleva.
  - Poción Máxima (precio inicial 100.000): cura todos los PS.
  - Revivir (150.000): revive con el 50 % de los PS.
  - Cinta (100.000): +25 % de daño durante un asalto.
- **Dinero sobrante:** no vale nada al terminar la subasta.

### Revelación y alineación
- Al terminar la subasta se revelan uno por uno los 6 Pokémon reales, con su momento si eran trampa. Se ven los dos equipos.
- 20 s para elegir titular y orden, con botones. El titular del rival no se ve hasta que los dos confirman. Sin respuesta, queda el orden de compra.

### Combate
- **PS de combate:** PS base + 60, y se conservan entre asaltos.
- **Movimientos:** un ataque por cada tipo del Pokémon, «Forcejeo» y un soporte.
  - Los nombres son genéricos, como «Ataque Fuego».
  - Físico o especial según el tipo, con la regla clásica (físicos: Normal, Lucha, Volador, Veneno, Tierra, Roca, Bicho, Fantasma y Acero; especiales: el resto).
  - **Forcejeo:** sin tipo, siempre ×1, potencia 20 y físico. Evita la inmunidad total.
  - **Soporte:** «Recuperar» cura el 25 % de los PS, una vez por asalto.
- **Daño:** `potencia × √(A / D) × efectividad`, con potencia 30 en los ataques de tipo, `A / D` limitado entre 0,25 y 4, y un mínimo de 5 salvo con ×0.
- **Críticos:** cada ataque que hace daño tiene 1 probabilidad entre 16 de hacer ×1,5, calculada en el servidor. **No hay esquivar** (decisión de Marco, 2026-10-31).
- **Turno:** los dos eligen en secreto, 8 s; sin respuesta, se usa el ataque más efectivo. Se pasa en cuanto los dos eligen. Ataca primero quien tiene más Velocidad; si empatan, al azar del servidor. Un Pokémon debilitado ya no ataca.
- **Límite de 20 turnos por asalto:** cae el Pokémon con menos porcentaje de PS; si empatan, el más lento; si siguen iguales, al azar.
- **Entre asaltos:** pausa de 15 s para los dos. Cada uno puede usar sus objetos y elegir titular: quien perdió el suyo elige el siguiente, y quien ganó puede seguir o cambiar. El rival no ve la elección hasta que los dos confirman.
- **Fin:** pierde quien, al acabar la pausa, no tenga ningún Pokémon vivo. Si se va de la sala, también.

### Resumen
Ganador, los dos equipos, daño hecho por cada uno y dinero gastado en Pokémon y en objetos.

### Reconexión
Como en los otros juegos: 30 s para volver. Mientras tanto, pasa en la subasta y se usa el movimiento por defecto. Recargar devuelve al estado exacto.

La pausa dura lo mismo aunque alguien esté caído: si se cae con su último Pokémon debilitado y un Revivir en la mano, al acabar los 15 s pierde, aunque le quede tiempo de gracia (Marco, 2026-10-31).

### Lo que dijo el simulador (2026-10-31)

`npm run auction:simulate -w server`, con estrategias automáticas simples. Con los valores de arriba no hizo falta ajustar nada: reconocer siluetas gana el 72 % contra las otras estrategias, guardar dinero solo el 27 %, ninguna gana siempre, y ningún asalto llegó al límite de 20 turnos. Mediana de 3 turnos por asalto y 1,3 críticos por partida. Hay que volver a mirarlo con personas: los bots no eligen movimientos para engañar.

### Cómo se ve el combate (Marco, 2026-10-31)

Vista lateral de juego de pelea, tipo Street Fighter, aunque se juega por turnos y no en tiempo real:

- Los dos frente a frente: tú a la izquierda y el rival a la derecha, y se miran (los sprites de Showdown miran a la izquierda, así que se voltea el tuyo).
- Arriba, las barras de vida con el reloj en el centro, bajando hacia el centro. Verde por encima del 50 %, amarilla hasta el 20 % y roja por debajo.
- **Sprites animados de PokeAPI** (`sprites/pokemon/other/showdown/{id}.gif`). Existen 1011 de 1025; los otros 14 (990–995, 1006, 1008, 1010, 1017 y 1022–1025) usan la imagen fija. No se dibujan modelos propios.
- Embestida del atacante (ida y vuelta en 200 ms) y vibración del defensor con un destello rojo que tiñe solo al Pokémon.
- **«K.O.»** en grande al caer un Pokémon.
- Abajo, el registro en letra monoespaciada y los botones de movimientos, con su eficacia a la vista.
- **Una animación de ataque por tipo** (18, con código, originales), en una issue aparte: el combate se puede jugar antes con un efecto genérico.
- Con «reducir movimiento», los efectos se quedan en un destello.

## 5. Protección contra trampas

- La identidad real de un lote nunca sale del servidor antes de la revelación, y el precio tampoco la delata.
- Las siluetas usan los tokens aleatorios de `/silhouettes/:token`, con la imagen del Pokémon **mostrado**.
- Las elecciones de movimiento y de titular no se envían al rival hasta que los dos confirman.

## 6. Lo que se deja al implementador

- Reutilizar `RoomConfig`, la interfaz `GameEngine` y el patrón de `server/src/game/silhouette/`.
- La tercera entrada del menú principal, con su lobby.
- La maquetación, siguiendo los temas y con «reducir movimiento». Animaciones con los colores del tema.
- Los textos, en español.

**Decisiones de Claude, revisables:** el nombre «Subasta Pokémon»; el precio de los objetos y la Cinta; que el soporte sea solo «Recuperar»; las reglas de cuando los dos pasan; la potencia de Forcejeo.

## 7. Orden de trabajo

1. Reglas puras y simulador de balance.
2. Motor de la subasta y de la sala.
3. Motor del combate.
4. Pantallas de subasta y revelación.
5. Pantallas de combate y resumen.
6. Historial y estadísticas, aparte: las partidas no se guardan hasta entonces. Pide ampliar la base de datos.

## 8. Criterios de aceptación generales

- El simulador corre miles de partidas entre estrategias distintas y ninguna gana siempre.
- Ningún combate simulado queda sin terminar.
- Motores con TDD; eventos tipados en `shared`.
- E2E con dos navegadores, incluidas reconexión y revancha.
- Navegador real a 360 y 375 px y escritorio; auditoría de contraste vacía en los 4 temas/modos.
- Una prueba que confirme que ningún evento adelanta la identidad real.
- Revisión final independiente, guía y README al día.
