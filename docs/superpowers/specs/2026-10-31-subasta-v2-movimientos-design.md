# Subasta Pokémon v2, proyecto 3: movimientos y habilidades reales

Issue #52. Depende de #51. Aprobada por Marco el 2026-10-31, con curación y PP.

## Intención

Que el combate se juegue como Showdown: cada Pokémon con 4 movimientos reales y su habilidad. El jugador no los elige, para que la gracia siga siendo pujar y decidir en combate.

## Decisiones de Marco

- 4 movimientos fijos por Pokémon, con nombre, tipo, potencia y precisión reales de PokeAPI, elegidos con una regla automática.
- Efectos solo comunes: quemar, paralizar, envenenar, dormir y subir o bajar stats. Los movimientos con reglas raras no entran.
- Unas 20 o 30 habilidades frecuentes. Los demás Pokémon muestran la suya sin efecto.
- Se quitan Recuperar y Forcejeo como están hoy.
- **Con curación:** los Pokémon que aprenden Recuperación, Respiro o parecidos la tienen.
- **Con PP:** los movimientos se gastan.
- Sin movimiento de apoyo o sin ataque de su tipo: se rellena con su mejor ataque disponible y, si no llega a 4, con ataques normales básicos.
- La habilidad, propia y rival, se ve al poner el cursor sobre el Pokémon; en móvil, al tocarlo. El registro avisa cuando se activa.

## Propuesta: qué movimientos entran

Del aprendizaje real de cada Pokémon (`server/data/moves.snapshot.json`, generado por `scripts/fetch-moves.ts`, sin red al jugar):

- **Ataques válidos:** potencia fija entre 40 y 120, prioridad 0, con daño directo y como mucho un efecto de la lista.
- **Apoyo válido:** sin daño, y solo aplica un estado de la lista, sube o baja stats, o cura un porcentaje fijo de PS al usuario.
- **Fuera:** golpes múltiples, carga o recarga, retroceso, drenaje, daño fijo, K.O. directo, cambio de clima o de terreno, y cambio de Pokémon forzado.
- **Selección, en orden:** sus 2 mejores ataques de su tipo, 1 de otro tipo que cubra más tipos, y 1 de apoyo; si aprende una curación, esa es su apoyo. «Mejor» es potencia × precisión, usando la categoría en la que tenga mejor stat. Los empates se deciden por nombre, para que el resultado sea siempre el mismo.

## Propuesta: reglas

- **Daño:** la fórmula actual, escalando la potencia real para que los combates duren parecido. El factor lo fija el simulador.
- **Categoría:** física o especial, la real del movimiento, en lugar de la regla clásica por tipo.
- **Precisión:** la real. Si falla, el registro lo dice.
- **PP:** los reales de cada movimiento. No se recuperan entre asaltos, se ven en el botón, y un movimiento sin PP no se puede elegir.
- **Sin PP en ninguno:** solo queda Forcejeo, potencia 50 y sin tipo, que le quita al usuario 1/4 de sus PS máximos. No se elige como un movimiento más: aparece solo en ese caso.
- **Curación:** la cantidad real del movimiento, sobre los PS máximos.
- **Inmunes:** si ningún movimiento afecta al rival, el límite de 20 turnos cierra el asalto.
- **Quemado:** pierde 1/16 de PS por turno y su ataque físico baja a la mitad.
- **Paralizado:** su velocidad baja a la mitad y tiene 1 de cada 4 turnos sin actuar.
- **Envenenado:** pierde 1/8 de PS por turno.
- **Dormido:** de 1 a 3 turnos sin actuar.
- **Estados:** un Pokémon solo tiene uno, y lo conserva al cambiar.
- **Stats:** niveles de −6 a +6, como en los juegos. Se pierden al cambiar de Pokémon o al empezar otro asalto.
- **Quién no elige a tiempo:** usa su ataque con PP que más daño hace; sin PP, Forcejeo.

## Propuesta: habilidades

Una por Pokémon: la primera que no es oculta. Con efecto:

- **Al entrar o por tipo:** Intimidación, Levitación, Absorbe Agua, Absorbe Electricidad, Absorbe Fuego e Inmunidad.
- **Con pocos PS:** Mar Llamas, Torrente, Espesura y Enjambre.
- **Por contacto:** Elec. Estática, Cuerpo Llama, Punto Tóxico y Piel Tosca.
- **Otras:** Robustez, Sebo, Agallas, Adaptable, Experto, Potencia, Flexibilidad, Insomnio, Impulso, Cuerpo Puro y Cura Natural.

Son 24. Se revisará su frecuencia real al generar los datos, sin pasar de 30.

## Pantalla

- Movimientos con nombre en español, tipo, potencia, precisión y eficacia en palabras.
- Estado junto a la barra de PS, con una etiqueta de color y su nombre, sin depender solo del color.
- Al poner el cursor sobre el Pokémon, o al tocarlo en móvil: su habilidad y qué hace. También se alcanza con el teclado.

## Contrato

- `BattleMove` pasa a ser el identificador de un movimiento.
- `BattleAction` añade `missed`, `blocked` (no pudo actuar y por qué), `status` y `statChanges`.
- `BattleFighterView` añade `ability`, `status` y `stages`. `BattleMoveView` añade `pp` y `maxPp`, solo de los propios.
- El servidor rechaza un movimiento que el titular no tiene o que no tiene PP.

## No objetivos

Clima, terreno, objetos, elegir movimientos, y los 18 efectos por tipo (#42).

## Criterios de aceptación

- Los 1025 Pokémon tienen 4 movimientos, y una prueba recorre la instantánea entera.
- Ningún combate simulado queda sin terminar, y ninguna estrategia gana siempre.
- El simulador sigue usando las mismas reglas que el motor.
- Cada efecto y habilidad tiene su prueba, y un cliente hecho a mano no puede usar un movimiento que no tiene.
- E2E de partida completa, mutaciones de lo crítico, revisión independiente y documentación al día.
