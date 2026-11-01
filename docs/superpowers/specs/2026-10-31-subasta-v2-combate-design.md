# Subasta Pokémon v2, proyecto 2: combate con aspecto de Showdown

Issue #51. Boceto aprobado por Marco el 2026-10-31: https://claude.ai/artifact/TevzLhAqCAEbjjpe1yLfzh (privado).

## Intención

Tras jugarlo con un amigo, Marco quiere que el combate se vea y se sienta como Pokémon Showdown, con escenarios bonitos y coloridos y sin prisas. Los movimientos y habilidades reales son el proyecto 3 (#52): aquí siguen los actuales.

## Decisiones de Marco

- Tu Pokémon de espaldas abajo a la izquierda y el rival de frente arriba a la derecha, con sprites reales.
- Escenarios 2D en pixel art clásico, originales.
- Sin tiempo para elegir movimiento.
- Se puede cambiar de Pokémon a mitad de asalto.
- El escenario se escoge por combate: uno por partida.

## Decisiones aprobadas con el boceto

- Cambiar gasta el turno: el cambio va antes que los ataques y quien entra recibe el golpe de ese turno.
- Sin reloj, con el aviso «¿Sigues ahí?» de la puja: a los 60 s avisa a quien no eligió, con 15 s para responder y 2 respuestas por turno como mucho. Si se agota, juega su mejor ataque, y solo él: cada uno tiene su propio aviso, porque uno común delataría si el rival ya eligió.
- Los 14 Pokémon sin GIF usan el PNG clásico. Los PS del rival van en porcentaje y los propios en números.

## Reglas que se mantienen

- La elección es secreta: el rival no sabe si ya elegiste ni qué. Solo quien ya eligió se entera de que el otro tarda (`rivalIdle`).
- Límite de 20 turnos por asalto: cambiar sin parar no alarga la partida. En pantalla se ve «Turno N/20». Cambiar en el último turno para que el que entra compare mejor es una jugada válida.
- El reloj del aviso no se detiene por caerse ni se reinicia al recargar: recargar no da más tiempo. A quien sigue caído lo resuelven los 30 s de gracia.
- La revelación, la alineación y la pausa conservan sus plazos: Marco solo quitó el de elegir movimiento.

## No objetivos

Efectos por tipo (#42), movimientos y habilidades reales (#52), historial (#40) y cambiar el simulador: no juega cambios porque el equilibrio se revisa en #52.

## Contrato

- `auction-switch` `{ pokemonId }` del cliente al servidor; evento de motor `CHOOSE_SWITCH`.
- `battle-turn` añade `switches: { seat, pokemonId }[]`.
- `BattleView` añade `scene`, `choosing`, `stepId`, `warningUntil`, `rivalIdle` y `mySwitch`. `deadline` siempre es nula durante la elección.
- `auction-still-here` también vale en el combate, con `stepId` como `turnId`.

## Lo que quedó a criterio del implementador

Colores de los movimientos por tipo, tamaños de los sprites y el reparto móvil, siguiendo el boceto. Los sprites muy altos se reducen para caber en el escenario.
