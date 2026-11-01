# Movimientos y habilidades reales: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (método preferido por Marco en #11) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que cada Pokémon combata con 4 movimientos reales fijos, con PP y curación, estados, cambios de stats y 24 habilidades.

**Architecture:** una instantánea generada guarda el catálogo de movimientos y el conjunto ya elegido de cada Pokémon, de modo que jugar no necesita red. `combat.ts` sigue siendo la única implementación de las reglas, compartida por el motor y el simulador; las habilidades se resuelven en un módulo propio al que llama. El cliente solo muestra lo que el servidor le manda.

**Tech Stack:** TypeScript, Express 5, Socket.io, React 19, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-31-subasta-v2-movimientos-design.md`

## Global Constraints

- Sin migraciones: nada de esto toca la base de datos.
- Textos en español con tildes, con los nombres oficiales en español de PokeAPI. Identificadores en inglés.
- Sin red al jugar: todo sale de la instantánea del repositorio.
- Lo que el rival decide sigue en secreto. De él solo se ven habilidad, estado y niveles de stats, nunca sus PP.
- En la letra pixel el 5 parece un 8: PP, potencia y PS en la letra normal (`font-num`).
- Medir a 360 × 760 con el peor texto: los botones se alcanzan sin desplazar.
- Rama `feat/subasta-movimientos`, a partir de `main` con la #51 ya fusionada.

## Review Focus

1. Un Pokémon sin PP en ninguno de sus 4 movimientos: solo se le ofrece Forcejeo, y el turno automático también lo usa.
2. Dormido o paralizado que eligió cambiar: el cambio se hace igual, porque estos estados solo impiden atacar.
3. Daño de estado que debilita a los dos en el mismo turno: el asalto se cierra sin colgarse y con un único perdedor.
4. Pokémon con habilidad que no se implementó: se muestra sin efecto y sin romper la vista, y uno sin habilidad en la instantánea no revienta.
5. Recargar a mitad de combate conserva PP, estado y niveles de stats, y el rival no recibe los PP.

---

### Task 1: Instantánea de movimientos y selección

**Files:**
- Create: `server/src/game/auction/move-selection.ts`, `server/scripts/fetch-moves.ts`, `server/data/moves.snapshot.json`
- Test: `server/test/game/auction-move-selection.test.ts`
- Modify: `server/package.json` (script `moves:fetch`)

**Interfaces:**
- Produces, en `shared/src/auction.ts`:
  - `MoveEffect = { ailment?: "burn" | "paralysis" | "poison" | "sleep"; ailmentChance?: number; stats?: { stat: StatName; change: number; target: "user" | "rival"; chance: number }[]; healing?: number }`
  - `MoveData = { id: string; names: { es: string; en: string }; type: TypeName; category: "physical" | "special" | "status"; power: number | null; accuracy: number | null; pp: number; effect: MoveEffect }`
- Produces, en `move-selection.ts`: `isUsableMove(raw: RawMove): boolean`, `selectMoves(pokemon: { types: TypeName[]; stats: BaseStats }, learnable: MoveData[]): string[]`.
- Formato de la instantánea: `{ generatedAt, source, moves: Record<string, MoveData>, sets: Record<number, { moves: string[]; ability: string | null }> }`.

- [ ] **Step 1: Escribir las pruebas que fallan**, con movimientos de ejemplo escritos a mano:
  - `isUsableMove` acepta Lanzallamas, Onda Trueno y Recuperación.
  - `isUsableMove` rechaza potencia 150, prioridad distinta de 0, golpes múltiples, retroceso, drenaje, daño fijo, K.O. directo y clima.
  - `selectMoves` devuelve 2 de su tipo, 1 de otro y 1 de apoyo, siempre en el mismo orden.
  - Si aprende una curación, esa es su apoyo.
  - Sin apoyo o sin ataque de su tipo, rellena con su mejor ataque, y hasta 4 con los ataques normales básicos `tackle`, `scratch`, `pound` y `quick-hit` si hiciera falta.
  - La categoría preferida para «mejor» es la de su stat más alto.
- [ ] **Step 2: Ejecutar** `cd server && npx vitest run test/game/auction-move-selection.test.ts`. Esperado: falla porque el módulo no existe.
- [ ] **Step 3: Programar `move-selection.ts`.** Curación válida: `meta.category` es `heal`, objetivo `user` y `meta.healing` mayor que 0. Si ningún básico de la lista existe en la instantánea, `selectMoves` usa `tackle`.
- [ ] **Step 4: Programar `fetch-moves.ts`** copiando el patrón de reintentos de `scripts/fetch-pokedex.ts`. La habilidad es la primera con `is_hidden: false`. Ejecutar `npm run moves:fetch -w server`. Esperado: 1025 conjuntos en el informe.
- [ ] **Step 5: Añadir la prueba de la instantánea real:** los 1025 tienen 4 movimientos distintos, todos en `moves`, con nombre en español o, si falta, en inglés.
- [ ] **Step 6: Ejecutar las pruebas.** Esperado: pasan. Commit `feat: instantánea de movimientos y selección automática (#52)`.

### Task 2: Reglas del combate con movimientos, PP y curación

**Files:**
- Modify: `shared/src/auction.ts`, `server/src/game/auction/combat.ts`, `server/src/game/auction/rules.ts`, `server/src/game/auction/simulation.ts`
- Test: `server/test/game/auction-combat.test.ts`, `server/test/game/auction-rules.test.ts`

**Interfaces:**
- Consumes: `MoveData` y la instantánea de la tarea 1.
- Produces:
  - `BattleMove = string`, con `STRUGGLE = "forcejeo"`.
  - `Fighter` añade `moves: { id: string; pp: number }[]`, `status: Status | null`, `sleepTurns: number`, `stages: Record<BoostStat, number>`, `ability: string | null`.
  - `newFighter(pokemon: CombatPokemon, set: { moves: string[]; ability: string | null }, moves: MoveBook): Fighter`.
  - `availableMoves(fighter: Fighter): BattleMove[]` devuelve los que tienen PP, o `[STRUGGLE]`.
  - `resolveTurn(sides, choices, rng, book, options)`.
  - `BattleAction` añade `missed: boolean`, `blocked: "sleep" | "paralysis" | null`, `recoil: number`, `status: Status | null` y `statChanges: { seat: Seat; stat: BoostStat; change: number }[]`.

- [ ] **Step 1: Escribir las pruebas que fallan:**
  - Daño con la categoría real del movimiento.
  - Precisión: con azar que falla, `missed: true`, 0 de daño y gasta 1 PP.
  - Un movimiento baja 1 PP y sin PP no está en `availableMoves`.
  - Sin PP solo queda Forcejeo: potencia 50, sin tipo, retroceso de 1/4 de los PS máximos.
  - Curación: Recuperación cura el 50 % y no pasa del máximo.
  - `bestMove` nunca devuelve uno sin PP.
- [ ] **Step 2: Ejecutar** `cd server && npx vitest run test/game/auction-combat.test.ts`. Esperado: fallan.
- [ ] **Step 3: Programar.** Se quitan `recuperar`, `healed` y `TYPE_MOVE_POWER`. Añadir `POWER_SCALE` en `rules.ts`, con valor inicial `0.35`: `damage` multiplica `power` por él.
- [ ] **Step 4: Adaptar `simulation.ts`** para usar las mismas reglas, con la curación por debajo de `HEAL_BELOW` si el Pokémon la tiene, y la prueba en la que el simulador termina.
- [ ] **Step 5: Ejecutar pruebas y `npm run typecheck -w server`.** El motor y la vista se adaptan lo justo para compilar: `movesOf` pasa a `availableMoves`. Commit `feat: movimientos reales con precisión, PP y curación (#52)`.

### Task 3: Estados y niveles de stats

**Files:**
- Modify: `server/src/game/auction/combat.ts`, `server/src/game/auction/engine.ts`
- Test: `server/test/game/auction-combat.test.ts`, `server/test/game/auction.battle.test.ts`

**Interfaces:**
- Produces: `Status = "burn" | "paralysis" | "poison" | "sleep"`, `BoostStat = "attack" | "defense" | "spAttack" | "spDefense" | "speed"`, `stageMultiplier(stage: number): number`, `endOfTurn(sides, rng): BattleAction[]`, `clearStages(fighter: Fighter): void`.

- [ ] **Step 1: Escribir las pruebas que fallan,** con los valores de la spec:
  - Quemado: pierde 1/16 por turno y su daño físico baja a la mitad.
  - Paralizado: velocidad a la mitad y `blocked: "paralysis"` en 1 de cada 4.
  - Envenenado: pierde 1/8 por turno.
  - Dormido: de 1 a 3 turnos con `blocked: "sleep"`.
  - Un solo estado por Pokémon; se conserva al cambiar.
  - Niveles de −6 a +6, con el multiplicador `(2 + n) / 2` si n ≥ 0 y `2 / (2 − n)` si n < 0.
  - Se pierden al cambiar de Pokémon y al empezar otro asalto.
  - Foco 2: dormido que elige cambiar sí cambia.
  - Foco 3: si el estado debilita a los dos, un único perdedor, el más lento; a igual velocidad, al azar.
- [ ] **Step 2: Ejecutar y ver que fallan.**
- [ ] **Step 3: Programar.** El daño de estado se aplica al final del turno a los dos titulares vivos, y sale en el registro como su propia línea. `resolveCurrentTurn` comprueba quién cayó después de `endOfTurn`.
- [ ] **Step 4: Ejecutar** `cd server && npx vitest run test/game/auction`. Esperado: pasan. Commit `feat: estados y niveles de stats en el combate (#52)`.

### Task 4: Las 24 habilidades

**Files:**
- Create: `server/src/game/auction/abilities.ts`
- Modify: `server/src/game/auction/combat.ts`, `server/src/game/auction/engine.ts`
- Test: `server/test/game/auction-abilities.test.ts`

**Interfaces:**
- Produces, en `abilities.ts`:
  - `onEnter(self, rival)`: Intimidación.
  - `damageModifiers(attacker, defender, move, hpShare): number`: Mar Llamas, Torrente, Espesura, Enjambre, Sebo, Adaptable, Experto, Potencia y Agallas.
  - `immuneTo(defender, move): "levitate" | "water-absorb" | "volt-absorb" | "flash-fire" | null`.
  - `onContact(attacker, defender, rng)`: Elec. Estática, Cuerpo Llama, Punto Tóxico y Piel Tosca.
  - `blocksStatus(fighter, status)`: Inmunidad, Flexibilidad e Insomnio.
  - `blocksStatDrop(fighter)`: Cuerpo Puro.
  - `surviveHit(fighter, damage)`: Robustez.
  - `onEndOfTurn(fighter)`: Impulso.
  - `onSwitchOut(fighter)`: Cura Natural.
- `BattleAction` añade `ability: string | null`, para el aviso del registro.

- [ ] **Step 1: Escribir una prueba por habilidad** con su efecto real, más: Intimidación al entrar por cambio y al empezar un asalto; Absorbe Agua cura 1/4 en lugar de recibir daño; Robustez deja en 1 PS solo si estaba con los PS llenos; foco 4: habilidad desconocida o `null` no hace nada.
- [ ] **Step 2: Ejecutar y ver que fallan.**
- [ ] **Step 3: Programar** `abilities.ts` y llamarlo desde `combat.ts`. Al generar los datos, comprobar la frecuencia real de las 24; cambiar una rara por otra frecuente solo si es igual de simple, sin pasar de 30, y anotarlo en la spec.
- [ ] **Step 4: Ejecutar pruebas.** Commit `feat: 24 habilidades con efecto (#52)`.

### Task 5: Vista y contrato

**Files:**
- Modify: `shared/src/auction.ts`, `server/src/game/auction/view.ts`, `server/src/game/auction/engine.ts`, `server/src/realtime/server.ts`
- Test: `server/test/game/auction.view.test.ts`, `server/test/game/auction.battle.test.ts`, `server/test/rooms/auction.test.ts`

**Interfaces:**
- Produces:
  - `BattleMoveView = { move: string; name: string; type: TypeName | null; category: "physical" | "special" | "status"; power: number | null; accuracy: number | null; pp: number; maxPp: number; effectiveness: number | null }`.
  - `BattleFighterView` añade `ability: { id: string; name: string; description: string; active: boolean } | null`, `status: Status | null`, `stages: Partial<Record<BoostStat, number>>`.

- [ ] **Step 1: Escribir las pruebas que fallan:**
  - Un cliente hecho a mano no puede usar un movimiento que no tiene o sin PP: `INVALID_CHOICE`.
  - `moveSchema` acepta texto corto y rechaza lo demás.
  - La vista del rival nunca lleva `pp` ni `moves` (foco 5), comprobado buscando en el JSON.
  - Recargar conserva PP, estado y niveles.
- [ ] **Step 2: Ejecutar y ver que fallan.**
- [ ] **Step 3: Programar.** El servidor carga la instantánea igual que el catálogo. Descripción de cada habilidad en `abilities.ts`, en español y en una frase; con `active: false` si no tiene efecto.
- [ ] **Step 4: Ejecutar pruebas.** Commit `feat: la vista lleva movimientos, PP, estados y habilidad (#52)`.

### Task 6: Pantalla

**Files:**
- Modify: `client/src/pages/room/auction/BattleScreen.tsx`, `BattleSprite.tsx`, `HpBar.tsx`, `client/src/game/battle.ts`, `client/src/i18n/es.ts`, `client/src/index.css`
- Test: `client/test/pages/auction-battle.test.tsx`, `client/test/game/battle.test.ts`

**Interfaces:** consume las vistas de la tarea 5. `MOVE_COLORS` pasa a indexarse por tipo; Forcejeo usa el color actual.

- [ ] **Step 1: Escribir las pruebas que fallan:**
  - El botón muestra nombre, tipo, potencia, precisión, PP y eficacia; sin PP queda desactivado.
  - Sin PP en ninguno, solo Forcejeo.
  - Etiqueta de estado con su nombre junto a la barra.
  - Al poner el cursor sobre el Pokémon, y también con foco o toque, sale un `role="tooltip"` con nombre y descripción, propio y rival; sin efecto lo dice.
  - El registro dice falló, no pudo moverse, el estado, los cambios de stats y la habilidad activada.
  - Sin habilidad, no sale nada (foco 4).
- [ ] **Step 2: Ejecutar y ver que fallan.**
- [ ] **Step 3: Programar.** El sprite pasa a ser un `<button>` que abre la ficha al tocarlo, con su nombre como etiqueta accesible, sin tapar el recuadro de PS.
- [ ] **Step 4: Ejecutar pruebas.** Commit `feat: pantalla con movimientos reales, estados y habilidades (#52)`.

### Task 7: Equilibrio, cierre y documentación

**Files:**
- Modify: `server/src/game/auction/rules.ts`, `e2e/tests/auction.spec.ts`, `docs/guia-tecnica.md`, los dos README si cambia lo que se ve desde fuera.

- [ ] **Step 1: Ajustar `POWER_SCALE`** con `npm run auction:simulate -w server -- 1000`, hasta que los asaltos duren parecido a los de hoy, ninguna estrategia gane siempre y ningún combate quede sin terminar.
- [ ] **Step 2: Ampliar la E2E:** el botón muestra PP, baja al usarlo, y la ficha de habilidad sale al poner el cursor. Con imágenes reales, medir a 360 y 375 con el movimiento de nombre más largo, y pasar la auditoría de contraste en los 4 temas/modos.
- [ ] **Step 3: Mutaciones** de lo crítico: PP sin bajar, movimiento ajeno aceptado, PP del rival en la vista, inmunidad ignorada, estado doble y niveles sin borrar al cambiar. Esperado: todas detectadas.
- [ ] **Step 4: Suite completa:** `npm test`, `npm run typecheck`, `npm run build`, `E2E_CHANNEL=msedge npm run e2e`.
- [ ] **Step 5: Revisión final independiente** de toda la rama con foco en la lista de arriba. Arreglar lo importante con TDD.
- [ ] **Step 6: Documentación y PR** con `Closes #52`. Marcar #48, #51 y #52 en la hoja de ruta (#11). Fusionar solo con permiso de Marco.
