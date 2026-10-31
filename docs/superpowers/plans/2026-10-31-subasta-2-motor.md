# Subasta Pokémon 2/6: motor de la subasta — plan

**Issue:** #36. **Spec:** `docs/superpowers/specs/2026-10-31-subasta-pokemon-design.md`. **Rama:** `feat/subasta-motor`.

**Objetivo:** el motor de la subasta, como reductor puro, desde que los dos entran hasta la revelación. Se detiene ahí: el combate es la #37.

## Global Constraints

- **Nadie puede jugarlo aún.** `POST /rooms` sigue rechazando este juego y el menú no lo muestra: se abre en la #38. Lo que se fusiona no cambia nada de lo que hay en vivo.
- `shared/src/type-chart.ts`, los otros dos motores y sus eventos no cambian de comportamiento.
- Sin migraciones: no se guarda nada (#40).
- Reutilizar `rules.ts` (#35) y el patrón de `server/src/game/silhouette/`. Lo que hoy está solo en `simulation.ts` y lo necesite el motor (`ITEM_PRICES`, probabilidad de trampa) pasa a `rules.ts`, sin duplicarlo.
- TDD; Harness con reloj y azar simulados, como `silhouette-harness.ts`.

## Review Focus

1. Identidad real o token real de un lote filtrados por algún evento o por `room-state`, con trampa y sin ella.
2. Pujar fuera de turno, por encima del tope, con un salto que no existe, por menos que la puja actual, o dos veces seguidas.
3. Temporizador viejo que dispara después de una puja: no debe cerrar el turno nuevo.
4. Reconectar en plena puja, en la subasta de un objeto y en la revelación.
5. Irse a mitad de subasta: abandono, y el rival gana.

---

### Task 1: Contrato en `shared`

**Files:** `shared/src/auction.ts` (nuevo), `shared/src/types.ts`, `shared/src/games.ts`, `shared/src/events.ts`; las pruebas de contrato.

- `AuctionConfig { game: "subasta"; traps: boolean }` en la unión `RoomConfig`; `isAuctionConfig`.
- `GameKind` incluye `subasta`, con su slug. Un `PLAYABLE_GAMES` deja fuera este juego para que el menú, el lobby y `POST /rooms` no cambien.
- `GamePhase` añade `auction` y `reveal`.
- Vistas: `AuctionStateView` con dinero de los dos, equipos ya comprados por cantidad (no identidad), objetos ganados, lote actual (`kind`, `silhouetteUrl` o nombre del objeto, `price`, puja actual, líder, turno, `deadline`, tope propio) y el número de lote.
- Eventos: `auction-sale` y `auction-reveal` (los 6 Pokémon reales con `wasTrap`). El turno y las pujas llegan por `room-state`.

### Task 2: Reparto de lotes y estado inicial

**Files:** `server/src/game/auction/{types,engine}.ts`, `server/test/game/auction-harness.ts`, `server/test/game/auction.engine.test.ts`.

Pruebas que fallan primero: sala de espera y cuenta atrás como la silueta; al empezar hay 6 lotes y 3 objetos en orden L L O L L O L L O; trampa con la probabilidad de la spec, nunca con `traps: false`; el token de un lote trampa da la silueta del Pokémon **mostrado**; el precio sale del mostrado.

### Task 3: Pujas por turnos

**Eventos nuevos en `GameEvent`:** `BID { seat, step }` y `PASS { seat }`; `TimerId` añade `{ kind: "bid"; turn }`.

Pruebas que fallan primero:

- Primera puja al precio inicial; subidas de 10.000, 50.000 y 100.000; el turno cambia y el reloj se reinicia a 10 s.
- Pasar tras una puja da el lote al otro y descuenta el dinero.
- Fuera de turno, por encima del tope o del dinero, con otro salto: `error`, sin cambiar nada.
- Temporizador: sin respuesta cuenta como pasar; uno viejo no hace nada.
- Empieza un jugador distinto en cada lote, y el primero es al azar.
- Si los dos pasan: va a quien tiene menos, a precio inicial; si empatan, a quien empezó; si no le alcanza, gratis.
- Con 3 Pokémon, los lotes restantes van al otro sin pujar.
- Objetos sin tope de hueco; si los dos pasan, nadie se lo lleva.

### Task 4: Vistas, revelación y reconexión

**Files:** `server/src/game/auction/view.ts`, `server/src/game/game-engine.ts`, `server/test/game/auction.view.test.ts`.

- `engineFor` reconoce el juego.
- Prueba central: se serializa **cada** evento y cada `room-state` de una partida completa con trampa, y ninguno contiene el id, el nombre ni el token real de un lote antes de `auction-reveal`.
- Al acabar el último lote, fase `reveal` con los dos equipos y `wasTrap`. Por ahora la partida termina ahí con `outcome` provisional, hasta la #37.
- Reconexión: `room-state` devuelve el estado exacto; desconectado, su turno pasa solo al agotarse el reloj; `LEAVE` en plena subasta es abandono.
- Pasa `tests` de `room.ts` con una sala de subasta creada directamente en el `RoomManager`, sin API.

### Después de las tareas

`npm run typecheck`, `npm test`, E2E completa (nada debe cambiar), mutaciones de las protecciones del Review Focus y revisión final independiente. PR con `Closes #36`.
