# Subasta Pokémon 1/6: reglas y simulador — plan

**Issue:** #35. **Spec:** `docs/superpowers/specs/2026-10-31-subasta-pokemon-design.md`.

**Objetivo:** las fórmulas puras del juego y un simulador que juegue miles de partidas entre estrategias, para ajustar los números antes de construir nada más. Rama `feat/subasta-simulador`. Sin interfaz, sin migraciones y sin tocar los juegos existentes.

## Tareas

1. **`server/src/game/auction/rules.ts`** (funciones puras, con pruebas que fallan primero): `combatHp`, `moveCategory`, `movesFor`, `damage` (con crítico ×1,5), `startingPrice`, `bidCap`, `drawLots`. Casos de la spec: Shuckle contra Shuckle da 15, 100 contra Defensa 5 da 60, ×4 con 80 contra 80 da 120, inmunidad da 0 y el mínimo es 5.
2. **`server/src/game/auction/simulation.ts`:** `simulateGame(pokemon, strategies, options, rng)` y `seededRng(seed)`. Sigue las reglas de la spec: lotes y objetos en orden L L O L L O L L O, tope, máximo de 3, si los dos pasan, combate con límite de 20 turnos y críticos de 1 entre 16. Pruebas: siempre termina, siempre quedan 3 y 3, sin dinero negativo, reproducible con la misma semilla, trampas apagadas nunca muestran otro Pokémon.
3. **`server/scripts/simulate-auction.ts`** (`npm run auction:simulate -w server`): enfrenta a tacaña, equilibrada, derrochadora y experta sobre el catálogo real, con y sin trampas y con y sin críticos. Informa porcentaje de victorias, turnos por asalto, asaltos en el límite y duración estimada.
4. **Decidir con el informe:** ajustar valores si una estrategia gana siempre, y anotar el resultado en la issue para Marco. La spec recoge los valores finales.

## Foco de revisión

Las estrategias del simulador son simples: sirven para detectar desequilibrios gordos, no para probar que el juego está equilibrado con personas.
