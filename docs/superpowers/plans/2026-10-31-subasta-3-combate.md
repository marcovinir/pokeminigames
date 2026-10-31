# Subasta Pokémon 3/6: motor del combate — plan

**Issue:** #37. **Spec:** `docs/superpowers/specs/2026-10-31-subasta-pokemon-design.md`. **Rama:** `feat/subasta-combate`, sobre el motor de la #36.

**Objetivo:** el combate como reductor puro, desde la revelación hasta el ganador, y que el simulador use exactamente las mismas reglas.

## Global Constraints

- **Sigue sin poder jugarse:** las pantallas y la apertura son la #38 y la #39. Nada cambia para el público.
- Sin migraciones: no se guarda nada (#40).
- Los otros dos juegos no cambian de comportamiento.
- **Una sola implementación de las reglas:** el motor y el simulador usan las mismas funciones. Si no, los números del simulador dejarían de valer.
- TDD; arneses con reloj y azar simulados. Valores de la spec: alineación 20 s, turno 8 s, 20 turnos por asalto, pausa 15 s, crítico 1/16.

## Decisiones de este plan (revisables)

- **Revelación:** dura 3 s por Pokémon (18 s) y se salta si los dos confirman.
- **Animación entre turnos:** 3 s de espera tras resolver un turno, para que la pantalla lo muestre. El reloj de elegir empieza después.
- **Irse en la revelación o la alineación** es abandono, como en plena subasta: el rival gana.
- **Los dos caídos:** cada uno tiene sus 30 s completos, sin copiar el fallo de la silueta. Si caducan los dos, la partida se abandona.
- **Pausa:** el ganador del asalto sigue de titular si quiere, o lo cambia; también puede usar objetos.
- **Si el rival ya eligió, no se dice,** como en el boceto: así no se presiona con el reloj.

## Review Focus

1. Que la elección de un jugador, o su titular, llegue al rival antes de que los dos confirmen: eventos y `room-state`.
2. Mensajes de un cliente hecho a mano: movimiento que no tiene, objeto que no tiene, revivir a quien sigue vivo, curar a un debilitado, titular debilitado, alineación con Pokémon ajenos o repetidos.
3. Temporizadores viejos entre turnos, asaltos y pausas.
4. Quedarse sin Pokémon con un Revivir en la mano: tiene la pausa para usarlo; si no lo usa, pierde.
5. Reconectar en cada fase: alineación, elegir, animación y pausa.

---

### Task 1: Reglas del combate en un solo sitio

**Files:** crear `server/src/game/auction/combat.ts` y `server/test/game/auction-combat.test.ts`; modificar `simulation.ts`.

Funciones puras: `newFighter`, `moveEffectiveness`, `moveDamage`, `movesOf`, `resolveTurn(a, b, choices, rng)`, `applyItem`, `roundLimitLoser`. Pruebas que fallan primero: orden por Velocidad, empate al azar, un debilitado no ataca, crítico, Cinta +25 %, Recuperar una vez por asalto, Poción, Revivir al 50 %, límite de 20 turnos con sus desempates. Inmunidad doble con Forcejeo.

El simulador pasa a usarlas. Comprobar que sus resultados siguen en el mismo rango.

### Task 2: Contrato en `shared`

`GamePhase` añade `lineup`, `battle` y `battle_pause`. `AuctionStateView` añade la vista del combate: mis Pokémon con PS y movimientos con su eficacia, el titular rival cuando ya es público, turno, asalto, `deadline`, si ya elegí y mis objetos. Eventos: `battle-turn` (lo ocurrido en orden, para animarlo) y `battle-round-ended`. `GameEndedPayload` añade para la subasta el daño hecho y el dinero gastado por cada uno, en Pokémon y en objetos. `GameEvent`: `CHOOSE_LINEUP`, `CHOOSE_MOVE`, `PAUSE_CONFIRM`. Quitar el final provisional.

### Task 3: Revelación y alineación

Pruebas que fallan primero: tras la subasta se pasa a `reveal` (ya observable, también al reconectar) y luego a `lineup`; orden válido; titular rival oculto hasta que los dos confirman; sin respuesta, orden de compra; pasa en cuanto confirman los dos.

### Task 4: Turnos y asaltos

Pruebas que fallan primero: elección secreta; movimiento por defecto, el más efectivo, al agotarse los 8 s o al estar desconectado; se resuelve en cuanto eligen los dos; movimiento inválido rechazado; Recuperar repetido rechazado; `battle-turn` en orden; KO y límite de turnos abren la pausa.

### Task 5: Pausa, objetos y final

Pruebas que fallan primero: objetos válidos e inválidos; el titular rival se oculta hasta confirmar; tiempo agotado: se saca al primero vivo por orden; sin nadie vivo al acabar la pausa, pierde; Revivir como última salida; Cinta dura un asalto; `game-ended` con ganador, equipos, daño y gasto; revancha con la misma configuración.

Prueba de fuzz: miles de partidas con elecciones al azar y mensajes inválidos sobre el motor real: siempre terminan, con un ganador o abandono, y sin PS ni dinero negativos.

### Después de las tareas

`npm run typecheck`, `npm test`, E2E completa, mutaciones de las protecciones del Review Focus y revisión final independiente. PR con `Closes #37`.
