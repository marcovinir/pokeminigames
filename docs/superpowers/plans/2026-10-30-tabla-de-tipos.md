# Tabla de tipos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una página pública `/tipos` con un selector de uno o dos tipos, la tabla completa de 18 × 18 y un enlace en el encabezado (issue #26).

**Architecture:** La regla de efectividad es una tabla pura en `shared`, que luego reutilizará la Pokédex. La página solo usa el cliente: sin servidor ni base de datos, y su estado vive en la dirección. Se carga aparte con `lazy`.

**Tech Stack:** TypeScript, React 19, React Router 8, Tailwind 4, vitest + RTL, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-30-tabla-de-tipos-design.md`

## Global Constraints

- Rama `feat/tabla-de-tipos`; entra en `main` por PR, y fusionar necesita el permiso de Marco.
- Español con tildes en pantallas y commits; identificadores en inglés; prefijos convencionales en los commits.
- TDD: cada prueba se ve fallar antes de escribir el código.
- Sin dependencias nuevas, sin migraciones y sin cambios en las partidas.
- Rutas `/tipos`; parámetros `tipo1` y `tipo2` con los identificadores de `TYPE_NAMES`.
- Grupos del selector en este orden: ×4, ×2, ×½, ×¼, ×0; se omiten los vacíos y el ×1.
- Solo la tabla se desplaza de lado, dentro de su caja; la página nunca.
- El color nunca es la única forma de leer una celda.
- Colores solo de tokens del tema (auditoría de contraste vacía en los 4 temas/modos).

## Review Focus

1. Dirección con `tipo1` igual a `tipo2`, solo `tipo2`, o valores inventados: se comporta como una selección válida, sin romper. Prueba en la Task 2.
2. Quitar el tipo 1 con el tipo 2 elegido: el tipo 2 pasa a ser el tipo 1, sin quedarse sin efecto. Prueba en la Task 2.
3. Abrir `/tipos` directamente sin sesión o recargar con la sesión aún cargando: no redirige a `/login`. Pruebas en las Tasks 2 y 4.
4. Teclado en el teléfono o en el escritorio: la caja desplazable de la tabla se alcanza con Tab y se desplaza con las flechas. Prueba en la Task 2.
5. Atrás y adelante del navegador: cada selección no llena el historial, pero una dirección compartida se respeta. Prueba en la Task 2.

---

### Task 1: La regla de efectividad en `shared`

**Files:**
- Create: `shared/src/type-chart.ts`, `server/scripts/type-chart-fixture.ts`, `server/test/shared/fixtures/type-chart.pokeapi.json`, `server/test/shared/type-chart.test.ts`
- Modify: `shared/src/index.ts`

**Interfaces:**
- Produces (desde `@pokemon-minigames/shared`):
  - `type Effectiveness = 0 | 0.5 | 1 | 2`
  - `typeEffectiveness(attacker: TypeName, defender: TypeName): Effectiveness`
  - `interface DamageGroups { x4: TypeName[]; x2: TypeName[]; x05: TypeName[]; x025: TypeName[]; x0: TypeName[] }`, cada lista en el orden de `TYPE_NAMES`
  - `damageTaken(types: readonly TypeName[]): DamageGroups`

- [ ] **Step 1: Generar la referencia.** `server/scripts/type-chart-fixture.ts` pide `https://pokeapi.co/api/v2/type/{1..18}` y escribe `Record<atacante, Record<defensor, number>>` para los 18 de `TYPE_NAMES`, a partir de `damage_relations` (`double_damage_to`, `half_damage_to`, `no_damage_to`; el resto, 1).

Run: `cd server && npx tsx scripts/type-chart-fixture.ts`
Expected: archivo con 18 claves, cada una con 18 valores.

- [ ] **Step 2: Escribir las pruebas que fallan**

```ts
it("los 324 valores coinciden con PokeAPI", () => {
  for (const attacker of TYPE_NAMES) for (const defender of TYPE_NAMES)
    expect(typeEffectiveness(attacker, defender), `${attacker} → ${defender}`).toBe(reference[attacker][defender]);
});

it("Charizard (fuego y volador): ×4 roca, ×0 tierra, ×¼ planta y bicho", () => {
  expect(damageTaken(["fire", "flying"])).toEqual({
    x4: ["rock"], x2: ["water", "electric"], x05: ["fighting", "steel", "fire", "fairy"], x025: ["bug", "grass"], x0: ["ground"],
  });
});

it("un solo tipo no da ×4 ni ×¼", () => {
  const { x4, x025 } = damageTaken(["normal"]);
  expect([x4, x025]).toEqual([[], []]);
  expect(damageTaken(["normal"]).x0).toEqual(["ghost"]);
});
```

- [ ] **Step 3: Verla fallar**

Run: `cd server && npx vitest run test/shared/type-chart.test.ts`
Expected: FAIL, `typeEffectiveness` no existe.

- [ ] **Step 4: Implementar** `shared/src/type-chart.ts`: guarda solo las excepciones al ×1 por atacante, a mano (no importa la referencia), y `damageTaken` multiplica la efectividad contra cada tipo. Exportarlo en `shared/src/index.ts`.

- [ ] **Step 5: Verla pasar**

Run: `cd server && npx vitest run test/shared/type-chart.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared server/scripts/type-chart-fixture.ts server/test/shared
git commit -m "feat: regla de efectividad de tipos en shared, comparada con PokeAPI (#26)"
```

### Task 2: La página `/tipos`

**Files:**
- Create: `client/src/pages/types/TypesPage.tsx`, `client/src/pages/types/type-selection.ts`, `client/test/pages/types-page.test.tsx`
- Modify: `client/src/routes.tsx`, `client/src/i18n/es.ts`

**Interfaces:**
- Consumes: `typeEffectiveness`, `damageTaken`, `TYPE_NAMES`, `TYPE_LABELS`, `TypeChip`, `typeChipStyle`.
- Produces:
  - `parseTypeSelection(params: URLSearchParams): TypeName[]`: de 0 a 2 tipos válidos y distintos; descarta lo desconocido y el repetido, y sube el segundo si falta el primero.
  - `export function TypesPage()`, ruta `/tipos`.
  - En `es.ts`: `TYPES_TEXT` y `TYPE_ABBREVIATIONS: Record<TypeName, string>` (3 letras).

**Textos exactos** (`TYPES_TEXT`): título «Tabla de tipos»; listas «Tipo 1» y «Tipo 2», con la opción «Ninguno»; título del resultado «Daño que recibe»; título de la tabla «Todos los tipos»; explicación «En cada fila, el tipo que ataca; en cada columna, el que recibe.»; nombre de la caja desplazable «Tabla de efectividad de tipos».

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
describe("parseTypeSelection", () => {
  it.each([
    ["tipo1=fire&tipo2=flying", ["fire", "flying"]],
    ["tipo2=flying", ["flying"]],
    ["tipo1=fire&tipo2=fire", ["fire"]],
    ["tipo1=inventado&tipo2=water", ["water"]],
    ["tipo1=x&tipo2=y", []],
  ])("%s", (query, expected) => expect(parseTypeSelection(new URLSearchParams(query))).toEqual(expected));
});
```

En `types-page.test.tsx`, con `renderRoute` y `/tipos`:
- `«sin sesión se ve la página; no lleva a /login»`: con `services` sin sesión y con la sesión en `loading`, está el título «Tabla de tipos» y `location` sigue en `/tipos`.
- `«sin selección no hay bloque de daño»`: `queryByRole("heading", { name: "Daño que recibe" })` es `null`.
- `«/tipos?tipo1=fire&tipo2=flying muestra ×4 roca y ×0 tierra, sin grupo ×1»`.
- `«elegir en las listas actualiza la dirección sin apilar historial»`: tras elegir, `location` lleva `tipo1=fire`; `navigate` se usa con `replace`. El tipo 2 no ofrece el tipo 1.
- `«quitar el tipo 1 sube el tipo 2»`: desde `tipo1=fire&tipo2=flying`, elegir «Ninguno» en «Tipo 1» deja `tipo1=flying` sin `tipo2`.
- `«la tabla: fila fuego, columna planta dice 2; normal contra fantasma dice 0; la neutra queda vacía»`: la tabla tiene 18 `th[scope=col]` y 18 `th[scope=row]`, cada uno con el nombre completo legible, y `getByRole("cell", ...)` se localiza por fila y columna.
- `«las columnas de los tipos elegidos se marcan»`: `data-selected` en el `th` y en las celdas de esas columnas, y en ninguna otra.
- `«la caja de la tabla se alcanza con el teclado»`: `getByRole("region", { name: "Tabla de efectividad de tipos" })` tiene `tabindex="0"` y la clase `overflow-x-auto`.

- [ ] **Step 2: Verlas fallar**

Run: `cd client && npx vitest run test/pages/types-page.test.tsx`
Expected: FAIL, el módulo no existe.

- [ ] **Step 3: Implementar.** `useSearchParams` con `{ replace: true }`. Selector y resultado en `Card`, con `TypeChip` por grupo. Tabla semántica en una `div role="region"` desplazable; encabezados con `typeChipStyle`, la abreviatura visible y el nombre completo `sr-only`; primera columna `sticky left-0`. Celdas: `2` con `bg-success-bg text-success`, `½` con `bg-danger-bg text-danger`, `0` con `bg-surface-2 text-fg font-bold`, ×1 vacía. La columna marcada lleva un borde con `border-accent` a cada lado. El enlace a la Pokédex no se añade en este plan: lo añade la issue #27.

En `routes.tsx`, `const TypesPage = lazy(...)` dentro de `Suspense` con `LoadingScreen`, y la ruta `/tipos` junto a las páginas de información, fuera de los guardas de sesión.

- [ ] **Step 4: Verlas pasar y correr todo el cliente**

Run: `cd client && npx vitest run test/pages/types-page.test.tsx && npx vitest run`
Expected: PASS, sin regresiones.

- [ ] **Step 5: Commit**

```bash
git add client/src client/test
git commit -m "feat: página /tipos con selector y tabla completa (#26)"
```

### Task 3: Enlace en el encabezado y música

**Files:**
- Modify: `client/src/components/Header.tsx`, `client/src/sound/cues.ts`, `client/test/components/header-theme.test.tsx`, `client/test/sound/cues.test.ts`

**Interfaces:**
- Consumes: la ruta `/tipos` de la Task 2.
- Produces: enlace con nombre accesible «Tipos», oculto en `/sala/:code`. La Pokédex (#27) añadirá el suyo al lado.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
it.each(["sin sesión", "invitado", "cuenta"])("%s: el encabezado enlaza a /tipos", ...);
// getByRole("link", { name: "Tipos" }) tiene href="/tipos"

it("en una sala no hay enlace a Tipos: salir cerraría la conexión", ...);
// renderWithServices(<Header />, { route: "/sala/ABC234" }): queryByRole("link", { name: "Tipos" }) es null

it("/tipos suena como el menú con sesión y en silencio sin ella", () => {
  expect(musicCueFor("/tipos", view, "authenticated")).toEqual({ zone: "lobby" });
  expect(musicCueFor("/tipos", view, "anonymous")).toEqual({ zone: "none" });
});
```

- [ ] **Step 2: Verlas fallar**

Run: `cd client && npx vitest run test/components/header-theme.test.tsx test/sound/cues.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar.** `useLocation` en `Header`; `Link` con icono de cuadrícula y `<span className="sr-only lg:not-sr-only">Tipos</span>`, el mismo patrón de «Mi perfil», antes de `SoundMenu`. En `musicCueFor`, añadir `/tipos` a la zona de sala. Sin sesión sigue en silencio, como todo lo demás (ruling de este plan, por coherencia con la regla de `cues.ts`).

- [ ] **Step 4: Verlas pasar**

Run: `cd client && npx vitest run test/components test/sound`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src client/test
git commit -m "feat: enlace a la tabla de tipos en el encabezado (#26)"
```

### Task 4: E2E, comprobación real y documentación

**Files:**
- Create: `e2e/tests/types.spec.ts`
- Modify: `docs/guia-tecnica.md`, `README.md`, `README.es.md`

**Interfaces:**
- Consumes: `newPlayer`, `register`, `playAsGuest` de `e2e/support/app.ts`.

- [ ] **Step 1: Escribir las E2E**

- `«sin sesión se abre desde el encabezado y se elige una combinación»`: desde `/login`, clic en «Tipos»; elegir Fuego y Volador; se ve «Daño que recibe» y la dirección lleva los dos; recargar conserva la selección.
- `«a 360 y 375 px cabe todo con un nombre de 30 letras, como cuenta y como invitado»`: el encabezado en una fila (misma medida que `expectOneRowHeader` de `layout.spec.ts`), `boundingBox` de encabezado, selector y caja de la tabla dentro del ancho de la ventana, y `document.documentElement.scrollWidth` igual a `clientWidth`; `scrollWidth` de la caja de la tabla mayor que su `clientWidth`.

- [ ] **Step 2: Correrlas**

Run: `cd e2e && E2E_CHANNEL=msedge npx playwright test tests/types.spec.ts tests/layout.spec.ts`
Expected: PASS. **Si el encabezado no cabe a 360 o 375 px, parar y decidirlo con Marco** (lo exige la spec).

- [ ] **Step 3: Navegador real.** A 375 px y 1280 px, capturas de `/tipos` con selección; ejecutar `__contrastAuditAll()` de `client/scripts/contrast-audit.js`.

Expected: lista vacía en los 4 temas/modos y texto legible en las celdas y encabezados.

- [ ] **Step 4: Documentar.** En `docs/guia-tecnica.md`, sección «Tabla de tipos» (ruta, dirección compartible, `shared/src/type-chart.ts`, cómo regenerar la referencia). Una línea en «Highlights» de `README.md` y su equivalente en `README.es.md`.

- [ ] **Step 5: Verificación completa**

Run: `npm run typecheck && npm test && npm run build && E2E_CHANNEL=msedge npm run e2e`
Expected: todo en verde, con el equipo enchufado.

- [ ] **Step 6: Commit**

```bash
git add e2e docs README.md README.es.md
git commit -m "test: E2E de la tabla de tipos; docs: guía y README (#26)"
```

### Después de las tareas

Revisión final independiente de la rama y PR con `Closes #26`. Tras fusionar con permiso de Marco: `npm run smoke:deployed -- https://pokemon-minigames.onrender.com` y marcar la casilla en #11.
