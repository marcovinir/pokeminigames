# Pokémon Minigames — Etapa 6: Rediseño visual del cliente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la interfaz se vea como un juego moderno y pulido, con identidad propia, apto para un portafolio, sin cambiar las reglas, el tiempo real, las estadísticas, el servidor ni el despliegue.

**Architecture:** El sistema de tokens de los dos temas (Clásico y Pokédex, cada uno en claro y oscuro) se amplía con una capa nueva (fondo con degradado, segundo acento, dorado, relieve, sombras, tipografías, duraciones) sin renombrar nada de lo que ya existe. Encima se rehace un kit de componentes pequeños (`Card`, `Button`, `Badge`, `Avatar`, `Timer` en anillo, `ArtImage`…) que conserva los roles y nombres accesibles de siempre, y con él se rehacen las pantallas, de abajo arriba. El movimiento es CSS puro más dos ayudantes (`useReducedMotion`, `useCountUp`) y se apaga con «reducir movimiento».

**Tech Stack:** Sin cambios: React 19, Vite 8, Tailwind 4, Zustand 5, React Router 8, Vitest 5, Testing Library. Nuevas dependencias de cliente (solo tipografías, empaquetadas): `@fontsource-variable/fredoka`, `@fontsource-variable/nunito`, `@fontsource-variable/jetbrains-mono`.

**Spec:** `docs/superpowers/specs/2026-10-07-etapa-6-rediseno-design.md` (complementa la general y las de las etapas 2 a 5; donde la de la etapa 6 es más específica, manda).

## Global Constraints

- Solo cambia `client/` (más el README, `docs/img/` y la prueba E2E del tema). Ni `server/` ni `shared/`: ni una línea.
- Los componentes usan solo variables CSS (tokens) a través de utilidades de Tailwind; no hay colores literales en los componentes, salvo los 18 colores de tipo y los 8 colores de los avatares. Los tokens actuales (`--bg`, `--surface`, `--fg`, `--accent`, `--line`, `--radius`, `--frame`…) conservan su nombre y su papel.
- Contraste AA en los 4 temas y modos: 4,5:1 para texto y 3:1 para componentes y texto grande. El texto sobre un degradado se lee sobre **los dos extremos**. Sin texto con opacidad. Foco visible en todo lo interactivo.
- Los textos, roles y nombres accesibles que ya fijan las pruebas no cambian. Las únicas pruebas que se actualizan porque cambia el control son `header-theme.test.tsx` y la E2E `theme.spec.ts` (el menú de apariencia reemplaza a los dos `<select>`).
- Tamaños: 375 px de ancho como mínimo sin desplazamiento horizontal; escritorio desde 768 px, ancho máximo 1024 px. Presupuesto: JavaScript comprimido +40 KB como mucho (partía de 109 KB), CSS sin comprimir de 40 KB como mucho, tipografías descargadas de 130 KB como mucho (solo subconjuntos latinos).
- Movimiento: duraciones `--dur-fast` 120 ms, `--dur-base` 220 ms y `--dur-slow` 420 ms; entrada escalonada de 60 ms; cuentas animadas de 500 ms. Con `prefers-reduced-motion: reduce` una sola regla global apaga animaciones y transiciones, y las cuentas saltan al valor final.
- Arte oficial grande solo donde hay pocas imágenes a la vez (resultado de ronda: 2, podio del perfil: 3, mejor Pokémon de cada equipo en el resumen: 1 por equipo); en listas, el sprite de 96 px. Las imágenes son decorativas (`alt=""`) y el nombre sigue en texto.
- Mensajes al usuario en español; identificadores de código en inglés. Se sigue TDD.
- Versiones: `prisma`, `@prisma/client` y `@prisma/adapter-pg` siguen fijadas en **7.10.0**. No ejecutes `npm audit fix --force`. Las credenciales y los secretos nunca se versionan.

## Review Focus

Condiciones que la spec no detalla pero que muerden a una persona real; cada una tiene su prueba en la tarea indicada (y su comprobación real en la Task 14).

1. **Contraste de lo que realmente se ve, no solo de los tokens.** Texto sobre los dos extremos del degradado de la página y de cada chip de tipo, avatares de ocho colores, insignias, el borde dorado de «Ganaste», los textos sobre tarjetas elevadas, en los 4 temas y modos. → Task 1 (`tokens.test.ts`), Task 2 (colores de avatar), Task 4 (degradado de tipos) y Task 14 (auditoría real en el navegador).
2. **Movimiento y «reducir movimiento».** Las animaciones que nunca terminan (bola que gira, latido, halo) y las que mueven números deben apagarse con la preferencia del sistema; el cronómetro no debe anunciar cada segundo a los lectores de pantalla y el rojo de los últimos 5 s no debe aparecer en la cuenta atrás de inicio. → Task 1, Task 2 (`useCountUp`, `useReducedMotion`), Task 5 y Task 10.
3. **Imágenes que fallan o tardan.** Arte oficial → sprite → bola neutra sin mostrar nunca una imagen rota, tamaño fijo sin saltos de diseño, carga perezosa salvo en el resultado de ronda, un esqueleto mientras carga, y un máximo de tres imágenes grandes por pantalla. → Task 2, Task 7, Task 11 y Task 12.
4. **Controles nuevos accesibles con teclado y lector de pantalla.** El menú de apariencia (abrir, flechas entre radios, Escape devuelve el foco, un clic fuera cierra), las tarjetas de modo (radios reales ocultos con foco visible), los iconos decorativos (`aria-hidden`), los nombres accesibles que en móvil solo se ven como texto para lectores (`sr-only`), y que ningún adorno duplique texto que las pruebas buscan. → Task 3, Task 6, Task 9 y Task 10.
5. **Móvil.** Una columna de cuadrícula sin `grid-cols-1` mide lo que mide su contenido y ensancha toda la pantalla (un campo de texto o un aviso largo bastan): se encontró al recorrer la ronda en 375 px y se fija con una prueba. → Task 14.

---

## File Structure

```
pokemon-minigames/
├── README.md  docs/img/*.jpg                           # capturas y descripción (Task 13)
├── e2e/tests/ theme.spec.ts (actualizada)  screenshots.spec.ts (nueva, solo con E2E_SCREENSHOTS=1)
└── client/
    ├── index.html  public/favicon.svg                   # icono, theme-color, etiquetas para compartir
    ├── scripts/contrast-audit.js                         # ahora entiende los degradados (Task 14)
    ├── src/
    │   ├── index.css  theme/ tokens.css  contrast.ts  type-styles.ts   # tokens, tipografías, movimiento, fondo
    │   ├── catalog/artwork.ts  game/motion.ts                           # NUEVOS: arte oficial; reducir movimiento y cuentas animadas
    │   ├── components/ Logo  Avatar  ArtImage  Card  Badge  StatTile  AnimatedNumber  ThemeMenu  Footer   # NUEVOS
    │   │              Button  TextField  Notice  TypeChip  Timer  LoadingScreen  Header  Panels  PokemonCard  Autocomplete  # rehechos
    │   ├── App.tsx  pages/ AuthForm  AuthHero  AuthPages  Lobby                                         # acceso y lobby
    │   └── pages/room/ WaitingView  CountdownView  TypePickerView  RoundView  RoundResultView  SummaryView
    │       pages/profile/ ProfilePage  StatsView  HistoryList
    └── test/ theme/  components/  game/  catalog/  pages/  helpers/room.tsx   # pruebas nuevas por componente y pantalla
```

Las piezas se construyen de abajo arriba: tokens y movimiento, fundamentos (logo, avatar, arte), controles, tipos, cronómetro, estructura, tarjetas y, al final, cada pantalla. Cada componente conserva su API anterior (las propiedades nuevas son opcionales), de modo que las pantallas que aún no se han rehecho siguen funcionando entre una tarea y la siguiente.

## Notas de entorno (leer antes de empezar)

- Se parte de `main` con las etapas 1 a 5 completas (426 pruebas de cliente y 629 de servidor). Trabaja en una rama `etapa-6-rediseno`. Las pruebas del servidor no cambian: esta etapa solo ejecuta las del cliente (desde `client/`) y la E2E.
- Todo el código de este plan se ejecutó antes de incluirlo, tarea por tarea, en un clon limpio de `main`: 637 pruebas de cliente en verde, `tsc` sin errores en todos los paquetes, la E2E con navegador real (4 pruebas más la de las capturas) y el recorrido manual de todas las pantallas en el navegador (escritorio y 375 px) contra el servidor real con un bot.
- Si el equipo va justo de CPU, las pruebas de interfaz pueden agotar los 5 s por defecto: ejecútalas con `npx vitest run --testTimeout=30000 --maxWorkers=2` desde `client/` (no hace falta cambiar nada en el repositorio).
- La E2E necesita un navegador: `npx playwright install chromium` desde `e2e/`, o `E2E_CHANNEL=msedge` / `chrome` para usar el que ya tienes. Entre la Task 6 y la Task 13 la prueba `theme.spec.ts` no se ejecuta (el menú de apariencia cambia en la Task 6 y la E2E se actualiza y vuelve a correr en la Task 13); si subes la rama a mitad de camino, el CI fallará en esa prueba.
- Para la verificación manual (Tasks 13 y 14) hacen falta el servidor y Vite: `npm run dev` y `npm run dev:client` en dos terminales, una cuenta de prueba y `node client/scripts/dev-bot.mjs CODIGO` para el segundo jugador (usa `PORT=3000`).
- npm 12 bloquea los scripts de instalación de algunas dependencias y lo avisa: es normal.

---

### Task 1: Tokens, tipografías, fondo y cabecera del documento

**Files:**
- Modify: `client/src/theme/tokens.css`, `client/src/index.css`, `client/index.html`, `client/package.json`
- Create: `client/public/favicon.svg`, `client/test/theme/assets.test.ts`
- Test (modificar): `client/test/theme/tokens.test.ts`

**Interfaces:**
- Produces (tokens nuevos, en los 4 bloques de `tokens.css`): `--art-1` y `--art-2` (extremos del degradado de la página), `--mark` (la marca de agua), `--accent-edge` (borde de relieve del acento), `--accent-2` y `--accent-2-fg`, `--gold` y `--gold-fg`, `--pill` (radio de las píldoras), `--depth` (alto del relieve de los botones: 4 px en Clásico, 0 en Pokédex), `--elev-card` y `--elev-pop` (sombras), `--font-display`. Los demás conservan su nombre.
- Produces (utilidades de Tailwind, vía `@theme inline` en `index.css`): `bg-/text-/border-/fill-/stroke-` de `accent-edge`, `accent-2`, `accent-2-fg`, `gold`, `gold-fg`; `rounded-pill`; `shadow-card` y `shadow-pop`; `font-display`. Animaciones: `animate-rise` (con `--i` para escalonar), `animate-spin-slow`, `animate-beat`, `animate-halo` y la clase `skeleton`. Variables `--dur-fast`, `--dur-base`, `--dur-slow` y `--ease-out`, y la regla de `prefers-reduced-motion`.
- Las tipografías se importan desde los paquetes `@fontsource-variable/*` (sin servicios externos); cada tema elige las suyas con `--font-ui`, `--font-display` y `--font-num` (Clásico: Nunito, Fredoka, Fredoka; Pokédex: Nunito, JetBrains Mono, JetBrains Mono).

- [ ] **Step 1: Escribir las pruebas que fallan**

`client/test/theme/tokens.test.ts` (los tokens nuevos en los 4 temas, los pares de contraste del fondo con degradado y de los rellenos de color, y la forma de cada tema):

```diff
diff --git a/client/test/theme/tokens.test.ts b/client/test/theme/tokens.test.ts
index 28e34d8..17d2318 100644
--- a/client/test/theme/tokens.test.ts
+++ b/client/test/theme/tokens.test.ts
@@ -24,6 +24,9 @@ const themes = parseTokens();
 const REQUIRED = [
   "bg", "surface", "surface-2", "fg", "fg-muted", "line", "accent", "accent-fg", "danger", "danger-bg",
   "success", "success-bg", "header-bg", "header-fg", "radius", "radius-lg", "frame", "font-ui", "font-num",
+  // Etapa 6: fondo con degradado, segundo acento, dorado, forma y tipografía de títulos.
+  "art-1", "art-2", "mark", "accent-edge", "accent-2", "accent-2-fg", "gold", "gold-fg", "pill", "depth",
+  "elev-card", "elev-pop", "font-display",
 ];
 
 describe("tokens de los temas", () => {
@@ -51,6 +54,18 @@ describe("tokens de los temas", () => {
     ["danger", "danger-bg"],
     ["success", "success-bg"],
     ["header-fg", "header-bg"],
+    // El fondo con degradado: el texto se lee sobre sus dos extremos.
+    ["fg", "art-1"],
+    ["fg", "art-2"],
+    ["fg-muted", "art-1"],
+    ["fg-muted", "art-2"],
+    ["accent", "art-1"],
+    ["accent", "art-2"],
+    ["accent-2", "art-1"],
+    ["accent-2", "surface"],
+    // Los rellenos de color y su texto.
+    ["accent-2-fg", "accent-2"],
+    ["gold-fg", "gold"],
   ];
 
   it.each([...themes.keys()])("%s: todos los pares de texto cumplen contraste AA", (name) => {
@@ -74,13 +89,42 @@ describe("tokens de los temas", () => {
     for (const theme of ["clasico", "pokedex"]) {
       const light = themes.get(`${theme}/claro`)!;
       const dark = themes.get(`${theme}/oscuro`)!;
-      for (const token of ["radius", "radius-lg", "frame", "font-ui", "font-num"]) {
+      for (const token of ["radius", "radius-lg", "frame", "font-ui", "font-num", "font-display", "pill", "depth"]) {
         expect(dark[token]).toBe(light[token]);
       }
     }
   });
 });
 
+describe("forma y tipografía de cada tema (etapa 6)", () => {
+  it("Clásico es redondeado, con relieve y con la fuente redondeada para títulos y números", () => {
+    const classic = themes.get("clasico/claro")!;
+    expect(Number.parseInt(classic.radius!)).toBeGreaterThanOrEqual(14);
+    expect(Number.parseInt(classic["radius-lg"]!)).toBeGreaterThanOrEqual(24);
+    expect(Number.parseInt(classic.depth!)).toBeGreaterThan(0);
+    expect(classic["font-display"]).toContain("Fredoka Variable");
+    expect(classic["font-num"]).toContain("Fredoka Variable");
+    expect(classic["font-ui"]).toContain("Nunito Variable");
+  });
+
+  it("Pokédex es plano y marcado, sin relieve ni sombras difusas, y monoespaciado", () => {
+    const pokedex = themes.get("pokedex/claro")!;
+    expect(Number.parseInt(pokedex.radius!)).toBeLessThanOrEqual(4);
+    expect(Number.parseInt(pokedex.pill!)).toBeLessThanOrEqual(4);
+    expect(Number.parseInt(pokedex.depth!)).toBe(0);
+    expect(pokedex["elev-card"]).toBe("none");
+    expect(pokedex["font-display"]).toContain("JetBrains Mono Variable");
+    expect(pokedex["font-num"]).toContain("JetBrains Mono Variable");
+    expect(pokedex["font-ui"]).toContain("Nunito Variable");
+  });
+
+  it.each([...themes.keys()])("%s: el acento tiene su propio color de borde de relieve", (name) => {
+    const tokens = themes.get(name)!;
+    expect(tokens["accent-edge"]).not.toBe(tokens.accent);
+    expect(tokens["accent-edge"]).toMatch(/^#[0-9a-f]{6}$/i);
+  });
+});
+
 describe("colores de tipo", () => {
   it("los 18 tipos tienen color y su texto supera 4,5:1 sobre él", () => {
     expect(Object.keys(TYPE_STYLES).sort()).toEqual([...TYPE_NAMES].sort());
```

`client/test/theme/assets.test.ts` (tipografías empaquetadas, regla de «reducir movimiento», duraciones, fondo con degradado y cabecera del documento):

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const client = join(import.meta.dirname, "../..");
const read = (path: string): string => readFileSync(join(client, path), "utf8");

describe("tipografías empaquetadas", () => {
  const css = read("src/index.css");
  const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };

  it.each(["fredoka", "nunito", "jetbrains-mono"])("%s se instala y se importa desde el CSS (no se pide a un servicio externo)", (font) => {
    expect(pkg.dependencies[`@fontsource-variable/${font}`]).toBeDefined();
    expect(css).toContain(`@import "@fontsource-variable/${font}`);
    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
  });
});

describe("movimiento", () => {
  const css = read("src/index.css");

  it("una sola regla apaga animaciones y transiciones con «reducir movimiento»", () => {
    const block = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(block).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(block).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
  });

  it("define las duraciones y la curva comunes", () => {
    for (const token of ["--dur-fast: 120ms", "--dur-base: 220ms", "--dur-slow: 420ms", "--ease-out:"]) {
      expect(css).toContain(token);
    }
  });

  it("el fondo de la página usa el degradado del tema", () => {
    expect(css).toMatch(/background:\s*linear-gradient\([^)]*var\(--art-1\)[^)]*var\(--art-2\)/);
  });
});

describe("cabecera del documento", () => {
  const html = read("index.html");

  it("declara el icono, el color del navegador y las etiquetas para compartir el enlace", () => {
    expect(html).toMatch(/<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg"/);
    expect(html).toMatch(/<meta name="theme-color"/);
    expect(html).toMatch(/<meta property="og:title" content="Pokémon Minigames"/);
    expect(html).toMatch(/<meta property="og:description" content="[^"]{20,}"/);
  });

  it("el icono existe y es un SVG con la bola partida en dos colores", () => {
    const svg = read("public/favicon.svg");
    expect(svg).toContain("<svg");
    expect(svg.match(/fill="#[0-9a-f]{6}"/gi)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("conserva el script que aplica el tema antes de pintar", () => {
    expect(html).toContain("pokemon-minigames:theme");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
git switch -c etapa-6-rediseno
cd client && npx vitest run test/theme
```

Expected: FAIL — faltan los tokens nuevos, los paquetes de tipografías, la regla de movimiento, el icono y las etiquetas del documento.

- [ ] **Step 3: Implementar**

Instalar las tres tipografías (variables, con solo el eje de peso):

```bash
npm install -w client @fontsource-variable/fredoka @fontsource-variable/nunito @fontsource-variable/jetbrains-mono
```

`client/package.json` (las dependencias quedan así; `npm install` actualiza también `package-lock.json`, que se incluye en el commit):

```diff
diff --git a/client/package.json b/client/package.json
index 246caa0..807a59c 100644
--- a/client/package.json
+++ b/client/package.json
@@ -11,6 +11,9 @@
     "typecheck": "tsc --noEmit"
   },
   "dependencies": {
+    "@fontsource-variable/fredoka": "^5.3.0",
+    "@fontsource-variable/jetbrains-mono": "^5.3.0",
+    "@fontsource-variable/nunito": "^5.3.0",
     "@pokemon-minigames/shared": "*",
     "react": "^19.3.0",
     "react-dom": "^19.3.0",
```

`client/src/theme/tokens.css` (las paletas se probaron con las pruebas de contraste: los textos superan 4,5:1 sobre los dos extremos del degradado):

```diff
diff --git a/client/src/theme/tokens.css b/client/src/theme/tokens.css
index 0c0ff6d..bb5bef3 100644
--- a/client/src/theme/tokens.css
+++ b/client/src/theme/tokens.css
@@ -2,54 +2,87 @@
  * Tokens de los dos temas (Clásico y Pokédex), cada uno en modo claro y oscuro.
  * Los componentes solo usan estas variables (a través de las utilidades de Tailwind definidas
  * en index.css), nunca colores literales; los 18 colores de tipo son la única excepción.
+ *
+ * Etapa 6: Clásico es el estilo moderno y colorido (esquinas muy redondeadas, relieve, degradados suaves, fuente
+ * redondeada); Pokédex es la piel retro del mismo diseño (bordes marcados, sin sombras difusas, monoespaciada).
+ * `art-1` y `art-2` son los extremos del degradado de la página: el texto debe leerse sobre los dos.
  */
 
 :root[data-theme="clasico"][data-mode="claro"] {
-  --bg: #f6f5f1;
+  --bg: #e8f3ff;
+  --art-1: #cfe6ff;
+  --art-2: #f5faff;
+  --mark: rgb(255 255 255 / 0.6);
   --surface: #ffffff;
-  --surface-2: #f1efe8;
-  --fg: #2c2c2a;
-  --fg-muted: #5f5e5a;
-  --line: #d3d1c7;
-  --accent: #185fa5;
+  --surface-2: #eaf2fb;
+  --fg: #14263f;
+  --fg-muted: #40536e;
+  --line: #bcd0e6;
+  --accent: #bd2a26;
   --accent-fg: #ffffff;
-  --danger: #a32d2d;
-  --danger-bg: #fcebeb;
-  --success: #3b6d11;
-  --success-bg: #eaf3de;
+  --accent-edge: #85191a;
+  --accent-2: #1f5fbf;
+  --accent-2-fg: #ffffff;
+  --gold: #ffcb05;
+  --gold-fg: #1c2a40;
+  --danger: #b3261e;
+  --danger-bg: #fde7e5;
+  --success: #1b7332;
+  --success-bg: #e1f4e6;
   --header-bg: #ffffff;
-  --header-fg: #2c2c2a;
-  --radius: 8px;
-  --radius-lg: 12px;
+  --header-fg: #14263f;
+  --radius: 14px;
+  --radius-lg: 24px;
+  --pill: 999px;
   --frame: 1px;
-  --font-ui: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
-  --font-num: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
+  --depth: 4px;
+  --elev-card: 0 1px 2px rgb(20 38 63 / 0.08), 0 10px 28px rgb(20 38 63 / 0.1);
+  --elev-pop: 0 2px 6px rgb(20 38 63 / 0.12), 0 18px 40px rgb(20 38 63 / 0.18);
+  --font-ui: "Nunito Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
+  --font-display: "Fredoka Variable", "Nunito Variable", ui-sans-serif, system-ui, sans-serif;
+  --font-num: "Fredoka Variable", "Nunito Variable", ui-sans-serif, system-ui, sans-serif;
 }
 
 :root[data-theme="clasico"][data-mode="oscuro"] {
-  --bg: #1d1d1b;
-  --surface: #2a2a28;
-  --surface-2: #353533;
-  --fg: #f1efe8;
-  --fg-muted: #b4b2a9;
-  --line: #4d4d4a;
-  --accent: #85b7eb;
-  --accent-fg: #042c53;
-  --danger: #f09595;
-  --danger-bg: #501313;
-  --success: #97c459;
-  --success-bg: #173404;
-  --header-bg: #2a2a28;
-  --header-fg: #f1efe8;
-  --radius: 8px;
-  --radius-lg: 12px;
+  --bg: #0b1730;
+  --art-1: #13284f;
+  --art-2: #08122a;
+  --mark: rgb(255 255 255 / 0.05);
+  --surface: #132548;
+  --surface-2: #1b3361;
+  --fg: #eaf1ff;
+  --fg-muted: #a9bad6;
+  --line: #2d4878;
+  --accent: #ff6f61;
+  --accent-fg: #240604;
+  --accent-edge: #b23a2e;
+  --accent-2: #6fa8ff;
+  --accent-2-fg: #041a3d;
+  --gold: #ffd84d;
+  --gold-fg: #1c1500;
+  --danger: #ff9d95;
+  --danger-bg: #4a1713;
+  --success: #7fe392;
+  --success-bg: #12361d;
+  --header-bg: #0f1f40;
+  --header-fg: #eaf1ff;
+  --radius: 14px;
+  --radius-lg: 24px;
+  --pill: 999px;
   --frame: 1px;
-  --font-ui: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
-  --font-num: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
+  --depth: 4px;
+  --elev-card: 0 1px 2px rgb(0 0 0 / 0.4), 0 12px 32px rgb(0 0 0 / 0.35);
+  --elev-pop: 0 2px 8px rgb(0 0 0 / 0.5), 0 20px 44px rgb(0 0 0 / 0.5);
+  --font-ui: "Nunito Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
+  --font-display: "Fredoka Variable", "Nunito Variable", ui-sans-serif, system-ui, sans-serif;
+  --font-num: "Fredoka Variable", "Nunito Variable", ui-sans-serif, system-ui, sans-serif;
 }
 
 :root[data-theme="pokedex"][data-mode="claro"] {
   --bg: #e9e4d4;
+  --art-1: #efeadb;
+  --art-2: #ddd6c0;
+  --mark: rgb(44 44 42 / 0.08);
   --surface: #f7f3e6;
   --surface-2: #ddd6c0;
   --fg: #2c2c2a;
@@ -57,6 +90,11 @@
   --line: #2c2c2a;
   --accent: #a32d2d;
   --accent-fg: #fcebeb;
+  --accent-edge: #701e1e;
+  --accent-2: #1d5aa0;
+  --accent-2-fg: #ffffff;
+  --gold: #f2c230;
+  --gold-fg: #2c2c2a;
   --danger: #791f1f;
   --danger-bg: #f7c1c1;
   --success: #27500a;
@@ -65,13 +103,21 @@
   --header-fg: #fcebeb;
   --radius: 2px;
   --radius-lg: 4px;
+  --pill: 2px;
   --frame: 2px;
-  --font-ui: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
-  --font-num: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
+  --depth: 0px;
+  --elev-card: none;
+  --elev-pop: 4px 4px 0 #2c2c2a;
+  --font-ui: "Nunito Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
+  --font-display: "JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
+  --font-num: "JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
 }
 
 :root[data-theme="pokedex"][data-mode="oscuro"] {
   --bg: #1c1a17;
+  --art-1: #24211d;
+  --art-2: #161411;
+  --mark: rgb(241 239 232 / 0.06);
   --surface: #2a2723;
   --surface-2: #38342e;
   --fg: #f1efe8;
@@ -79,6 +125,11 @@
   --line: #9a968a;
   --accent: #f09595;
   --accent-fg: #501313;
+  --accent-edge: #a85a5a;
+  --accent-2: #85b7eb;
+  --accent-2-fg: #042c53;
+  --gold: #f2c230;
+  --gold-fg: #2c2c2a;
   --danger: #f09595;
   --danger-bg: #501313;
   --success: #97c459;
@@ -87,7 +138,12 @@
   --header-fg: #fcebeb;
   --radius: 2px;
   --radius-lg: 4px;
+  --pill: 2px;
   --frame: 2px;
-  --font-ui: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
-  --font-num: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
+  --depth: 0px;
+  --elev-card: none;
+  --elev-pop: 4px 4px 0 #9a968a;
+  --font-ui: "Nunito Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
+  --font-display: "JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
+  --font-num: "JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
 }
```

`client/src/index.css`:

```diff
diff --git a/client/src/index.css b/client/src/index.css
index b516ac1..a16b2a5 100644
--- a/client/src/index.css
+++ b/client/src/index.css
@@ -1,4 +1,7 @@
 @import "tailwindcss";
+@import "@fontsource-variable/fredoka/wght.css";
+@import "@fontsource-variable/nunito/wght.css";
+@import "@fontsource-variable/jetbrains-mono/wght.css";
 @import "./theme/tokens.css";
 
 @theme inline {
@@ -10,6 +13,11 @@
   --color-line: var(--line);
   --color-accent: var(--accent);
   --color-accent-fg: var(--accent-fg);
+  --color-accent-edge: var(--accent-edge);
+  --color-accent-2: var(--accent-2);
+  --color-accent-2-fg: var(--accent-2-fg);
+  --color-gold: var(--gold);
+  --color-gold-fg: var(--gold-fg);
   --color-danger: var(--danger);
   --color-danger-bg: var(--danger-bg);
   --color-success: var(--success);
@@ -18,17 +26,59 @@
   --color-header-fg: var(--header-fg);
   --radius-ui: var(--radius);
   --radius-card: var(--radius-lg);
+  --radius-pill: var(--pill);
+  --shadow-card: var(--elev-card);
+  --shadow-pop: var(--elev-pop);
   --font-sans: var(--font-ui);
   --font-num: var(--font-num);
+  --font-display: var(--font-display);
+}
+
+/* Duraciones y curva comunes de todo el movimiento de la interfaz. */
+:root {
+  --dur-fast: 120ms;
+  --dur-base: 220ms;
+  --dur-slow: 420ms;
+  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
 }
 
 body {
   margin: 0;
-  background: var(--bg);
+  min-height: 100vh;
+  background: linear-gradient(180deg, var(--art-1) 0%, var(--art-2) 100%) fixed;
   color: var(--fg);
   font-family: var(--font-ui);
 }
 
+/*
+ * Marca de agua de la página: una bola grande en la esquina (Clásico) o una cuadrícula tipo pantalla (Pokédex).
+ * Es decorativa: no recibe clics y queda detrás de todo.
+ */
+body::before {
+  content: "";
+  position: fixed;
+  right: -14vmin;
+  bottom: -14vmin;
+  width: 64vmin;
+  height: 64vmin;
+  background: var(--mark);
+  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='44' fill='none' stroke='black' stroke-width='8'/%3E%3Crect x='6' y='46' width='88' height='8' fill='black'/%3E%3Ccircle cx='50' cy='50' r='14' fill='none' stroke='black' stroke-width='7'/%3E%3C/svg%3E") center / contain no-repeat;
+  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='44' fill='none' stroke='black' stroke-width='8'/%3E%3Crect x='6' y='46' width='88' height='8' fill='black'/%3E%3Ccircle cx='50' cy='50' r='14' fill='none' stroke='black' stroke-width='7'/%3E%3C/svg%3E") center / contain no-repeat;
+  pointer-events: none;
+  z-index: -1;
+}
+
+:root[data-theme="pokedex"] body::before {
+  inset: 0;
+  width: auto;
+  height: auto;
+  background-color: transparent;
+  background-image: linear-gradient(var(--mark) 1px, transparent 1px), linear-gradient(90deg, var(--mark) 1px, transparent 1px);
+  background-size: 32px 32px;
+  -webkit-mask: none;
+  mask: none;
+}
+
 /*
  * El grosor del borde de los recuadros lo decide el tema (1px en Clásico, 2px en Pokédex).
  * Va en la capa `components` para que las utilidades de Tailwind (p. ej. `border-danger`) puedan ajustarlo.
@@ -43,3 +93,86 @@ body {
   outline: 2px solid var(--accent);
   outline-offset: 2px;
 }
+
+/* Animaciones comunes. Las usan los componentes con las clases `animate-*` de más abajo. */
+@keyframes rise {
+  from {
+    opacity: 0;
+    transform: translateY(10px);
+  }
+  to {
+    opacity: 1;
+    transform: none;
+  }
+}
+
+@keyframes spin {
+  to {
+    transform: rotate(360deg);
+  }
+}
+
+@keyframes shimmer {
+  from {
+    background-position: 200% 0;
+  }
+  to {
+    background-position: -200% 0;
+  }
+}
+
+@keyframes beat {
+  0%,
+  100% {
+    transform: scale(1);
+    opacity: 1;
+  }
+  50% {
+    transform: scale(1.06);
+    opacity: 0.75;
+  }
+}
+
+@keyframes halo {
+  0%,
+  100% {
+    box-shadow: 0 0 0 0 color-mix(in srgb, var(--gold) 55%, transparent);
+  }
+  50% {
+    box-shadow: 0 0 0 14px color-mix(in srgb, var(--gold) 0%, transparent);
+  }
+}
+
+@layer utilities {
+  /* Entrada con fundido y un pequeño desplazamiento; `--i` escalona las tarjetas (60 ms entre una y otra). */
+  .animate-rise {
+    animation: rise var(--dur-base) var(--ease-out) both;
+    animation-delay: calc(var(--i, 0) * 60ms);
+  }
+  .animate-spin-slow {
+    animation: spin 1.2s linear infinite;
+  }
+  .animate-beat {
+    animation: beat 1.6s ease-in-out infinite;
+  }
+  .animate-halo {
+    animation: halo 2s ease-in-out infinite;
+  }
+  .skeleton {
+    background: linear-gradient(90deg, var(--surface-2) 25%, var(--surface) 50%, var(--surface-2) 75%);
+    background-size: 200% 100%;
+    animation: shimmer 1.4s linear infinite;
+  }
+}
+
+/* Con «reducir movimiento» en el sistema se apaga todo: las animaciones y transiciones duran un instante. */
+@media (prefers-reduced-motion: reduce) {
+  *,
+  *::before,
+  *::after {
+    animation-duration: 0.01ms !important;
+    animation-iteration-count: 1 !important;
+    transition-duration: 0.01ms !important;
+    scroll-behavior: auto !important;
+  }
+}
```

`client/index.html`:

```diff
diff --git a/client/index.html b/client/index.html
index 4189bf3..83eec01 100644
--- a/client/index.html
+++ b/client/index.html
@@ -4,6 +4,12 @@
     <meta charset="UTF-8" />
     <meta name="viewport" content="width=device-width, initial-scale=1.0" />
     <title>Pokémon Minigames</title>
+    <meta name="description" content="Duelo en tiempo real: nombra un Pokémon que tenga los dos tipos y gana más stats que tu rival." />
+    <meta name="theme-color" content="#bd2a26" />
+    <meta property="og:type" content="website" />
+    <meta property="og:title" content="Pokémon Minigames" />
+    <meta property="og:description" content="Duelo en tiempo real: nombra un Pokémon que tenga los dos tipos y gana más stats que tu rival." />
+    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
     <script>
       // Aplica el tema guardado antes de pintar, para que no se vea un destello del tema equivocado.
       (function () {
```

`client/public/favicon.svg` (la bola partida en dos colores; usa colores literales porque un icono no tiene acceso a los tokens):

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="30" fill="#14263f"/>
  <path d="M32 6a26 26 0 0 1 26 26H6A26 26 0 0 1 32 6z" fill="#bd2a26"/>
  <path d="M6 32h52a26 26 0 0 1-52 0z" fill="#ffffff"/>
  <circle cx="32" cy="32" r="9" fill="#14263f"/>
  <circle cx="32" cy="32" r="5" fill="#ffffff"/>
</svg>
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
cd client && npx vitest run test/theme
npx vitest run --testTimeout=30000 --maxWorkers=2
cd .. && npm run typecheck
cd client && npx vite build
```

Expected: PASS (todo el cliente: **441 pruebas**), `tsc` sin errores y `vite build` correcto (el CSS ronda los 29 KB sin comprimir; las tipografías latinas pesan unos 30, 39 y 40 KB y solo se descargan las que usa el tema activo).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): tokens del rediseño, tipografías empaquetadas, fondo con degradado y movimiento" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Fundamentos: logo, avatar, arte y movimiento

**Files:**
- Create: `client/src/components/Logo.tsx`, `client/src/components/Avatar.tsx`, `client/src/components/ArtImage.tsx`, `client/src/catalog/artwork.ts`, `client/src/game/motion.ts`
- Test: `client/test/components/logo.test.tsx`, `client/test/components/avatar.test.tsx`, `client/test/components/art-image.test.tsx`, `client/test/catalog/artwork.test.ts`, `client/test/game/motion.test.tsx`

**Interfaces:**
- Produces: `LogoMark({ size?, className? })` (bola decorativa: `aria-hidden`, `focusable="false"`) y `Logo({ size?, hideNameOnMobile? })` (la bola con «Pokémon Minigames» como texto); `AVATAR_COLORS` (8 colores que superan 4,5:1 con blanco), `avatarColor(name)` (siempre el mismo para el mismo nombre, sin importar mayúsculas), `initials(name)` (`"ash"` → `AS`, `"ash_ketchum"` → `AK`, vacío → `?`) y `Avatar({ name, size?: "sm" | "md" | "lg" | "xl" })` (decorativo: `aria-hidden`); `artworkUrl(id)` (arte oficial de PokeAPI; lanza `RangeError` si `id` no es un entero de 1 o más) y `ArtImage({ id, spriteUrl, size, variant?: "official" | "sprite", eager? })` (arte oficial → sprite → bola neutra, con esqueleto mientras carga y `data-state` `loading | loaded | fallback`); `useReducedMotion()` (lee `prefers-reduced-motion`; sin `matchMedia` asume que el movimiento está permitido) y `useCountUp(target, { durationMs = 500, now? })` (sube o baja hasta el valor nuevo, continúa desde donde iba y salta directo con «reducir movimiento»).

- [ ] **Step 1: Escribir las pruebas que fallan**

`client/test/components/logo.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Logo, LogoMark } from "../../src/components/Logo";

describe("Logo", () => {
  it("la bola es decorativa: no la leen los lectores de pantalla ni recibe el foco", () => {
    const { container } = render(<LogoMark />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(svg.querySelector("title")).toBeNull();
  });

  it("el logo dice el nombre del juego como texto (es lo que da nombre accesible al enlace del encabezado)", () => {
    render(<Logo />);
    expect(screen.getByText("Pokémon Minigames")).toBeInTheDocument();
  });

  it("la bola tiene el tamaño pedido", () => {
    const { container } = render(<LogoMark size={40} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "40");
    expect(svg).toHaveAttribute("height", "40");
  });
});
```

`client/test/components/avatar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AVATAR_COLORS, Avatar, avatarColor, initials } from "../../src/components/Avatar";
import { contrastRatio } from "../../src/theme/contrast";

describe("initials", () => {
  it.each([
    ["ash", "AS"],
    ["ash_ketchum", "AK"],
    ["Misty_99", "M9"],
    ["x", "X"],
    ["ñandú", "ÑA"],
    ["  brock  ", "BR"],
  ])("%s → %s", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });

  it("sin nombre usa un signo de interrogación", () => {
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
    expect(initials("___")).toBe("?");
  });
});

describe("avatarColor", () => {
  it("es siempre el mismo para el mismo nombre, sin importar las mayúsculas", () => {
    expect(avatarColor("ash")).toEqual(avatarColor("ash"));
    expect(avatarColor("ASH")).toEqual(avatarColor("ash"));
  });

  it("reparte los nombres entre varios colores", () => {
    const used = new Set(Array.from({ length: 60 }, (_, i) => avatarColor(`jugador${i}`).background));
    expect(used.size).toBeGreaterThanOrEqual(6);
  });

  it("los 8 colores superan 4,5:1 con su texto", () => {
    expect(AVATAR_COLORS).toHaveLength(8);
    for (const { background, color } of AVATAR_COLORS) {
      expect(contrastRatio(color, background), background).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("Avatar", () => {
  it("muestra las iniciales sobre el color del nombre y no lo lee dos veces un lector de pantalla", () => {
    render(<Avatar name="ash" />);
    const avatar = screen.getByText("AS");
    expect(avatar).toHaveAttribute("aria-hidden", "true");
    expect(avatar.style.background).not.toBe("");
  });

  it("no repite el nombre completo como texto (el nombre ya está al lado)", () => {
    render(<Avatar name="ash" />);
    expect(screen.queryByText("ash")).not.toBeInTheDocument();
  });

  it("tiene cuatro tamaños", () => {
    const sizes = (["sm", "md", "lg", "xl"] as const).map((size) => {
      const { container, unmount } = render(<Avatar name="ash" size={size} />);
      const width = (container.firstElementChild as HTMLElement).style.width;
      unmount();
      return Number.parseInt(width);
    });
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
    expect(new Set(sizes).size).toBe(4);
  });
});
```

`client/test/catalog/artwork.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { artworkUrl } from "../../src/catalog/artwork";

describe("artworkUrl", () => {
  it("apunta al arte oficial de PokeAPI de ese Pokémon", () => {
    expect(artworkUrl(25)).toBe(
      "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png",
    );
    expect(artworkUrl(1025)).toMatch(/\/official-artwork\/1025\.png$/);
  });

  it.each([0, -3, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rechaza el id %s (no es un número de Pokédex)", (id) => {
    expect(() => artworkUrl(id)).toThrow(RangeError);
  });
});
```

`client/test/components/art-image.test.tsx` (la cadena de respaldo, el esqueleto y la carga perezosa):

```tsx
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArtImage } from "../../src/components/ArtImage";

const SPRITE = "https://example.test/sprite/25.png";
const OFFICIAL = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png";

const setup = (props: Partial<Parameters<typeof ArtImage>[0]> = {}) => {
  const view = render(<ArtImage id={25} spriteUrl={SPRITE} size={120} {...props} />);
  return { ...view, root: view.container.firstElementChild as HTMLElement, img: () => view.container.querySelector("img") };
};

describe("ArtImage", () => {
  it("por defecto muestra el arte oficial, decorativo y con tamaño fijo para que nada salte al cargar", () => {
    const { img } = setup();
    const image = img()!;
    expect(image).toHaveAttribute("src", OFFICIAL);
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveAttribute("width", "120");
    expect(image).toHaveAttribute("height", "120");
    expect(image).toHaveAttribute("decoding", "async");
  });

  it("carga perezosa salvo que se pida lo contrario (el resultado de la ronda la pide)", () => {
    expect(setup().img()).toHaveAttribute("loading", "lazy");
    expect(setup({ eager: true }).img()).toHaveAttribute("loading", "eager");
  });

  it("la variante sprite empieza por el sprite pequeño, sin pedir el arte grande", () => {
    expect(setup({ variant: "sprite" }).img()).toHaveAttribute("src", SPRITE);
  });

  it("muestra un esqueleto hasta que llega la imagen", () => {
    const { root, img } = setup();
    expect(root).toHaveAttribute("data-state", "loading");
    expect(root.className).toContain("skeleton");
    fireEvent.load(img()!);
    expect(root).toHaveAttribute("data-state", "loaded");
    expect(root.className).not.toContain("skeleton");
  });

  it("si falla el arte oficial cae al sprite", () => {
    const { img, root } = setup();
    fireEvent.error(img()!);
    expect(img()).toHaveAttribute("src", SPRITE);
    expect(root).toHaveAttribute("data-state", "loading");
  });

  it("si también falla el sprite muestra la bola neutra y ninguna imagen rota", () => {
    const { img, root } = setup();
    fireEvent.error(img()!);
    fireEvent.error(img()!);
    expect(img()).toBeNull();
    expect(root).toHaveAttribute("data-state", "fallback");
    expect(root.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("desde la variante sprite, un fallo va directo a la bola", () => {
    const { img, root } = setup({ variant: "sprite" });
    fireEvent.error(img()!);
    expect(img()).toBeNull();
    expect(root).toHaveAttribute("data-state", "fallback");
  });

  it("al cambiar de Pokémon vuelve a empezar por el arte oficial", () => {
    const { rerender, img } = setup();
    fireEvent.error(img()!);
    fireEvent.error(img()!);
    rerender(<ArtImage id={26} spriteUrl="https://example.test/sprite/26.png" size={120} />);
    expect(img()).toHaveAttribute("src", expect.stringContaining("/official-artwork/26.png"));
  });
});
```

`client/test/game/motion.test.tsx` (la preferencia del sistema y la cuenta animada, con reloj falso):

```tsx
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCountUp, useReducedMotion } from "../../src/game/motion";

type Listener = () => void;

/** Un matchMedia de mentira que deja cambiar la preferencia y avisa a quien escucha. */
function mockMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<Listener>();
  const media = {
    get matches() {
      return matches;
    },
    addEventListener: (_: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_: string, listener: Listener) => listeners.delete(listener),
  };
  vi.stubGlobal("matchMedia", () => media);
  return {
    set(value: boolean) {
      matches = value;
      for (const listener of listeners) listener();
    },
    listeners,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("useReducedMotion", () => {
  it("lee la preferencia del sistema", () => {
    mockMedia(true);
    expect(renderHook(() => useReducedMotion()).result.current).toBe(true);
  });

  it("sin matchMedia (pruebas, navegadores viejos) asume que el movimiento está permitido", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(renderHook(() => useReducedMotion()).result.current).toBe(false);
  });

  it("reacciona cuando la preferencia cambia y deja de escuchar al desmontar", () => {
    const media = mockMedia(false);
    const { result, unmount } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    act(() => media.set(true));
    expect(result.current).toBe(true);
    unmount();
    expect(media.listeners.size).toBe(0);
  });
});

describe("useCountUp", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("empieza en el valor inicial, sin animar", () => {
    mockMedia(false);
    expect(renderHook(() => useCountUp(300)).result.current).toBe(300);
  });

  it("al cambiar el valor sube poco a poco y termina exactamente en el nuevo", () => {
    mockMedia(false);
    let t = 0;
    const now = () => t;
    const { result, rerender } = renderHook(({ target }) => useCountUp(target, { durationMs: 500, now }), { initialProps: { target: 0 } });
    rerender({ target: 100 });

    t = 250;
    act(() => void vi.advanceTimersByTime(16));
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(100);

    t = 500;
    act(() => void vi.advanceTimersByTime(16));
    expect(result.current).toBe(100);
  });

  it("si el valor cambia a mitad de camino sigue desde donde iba, no desde el principio", () => {
    mockMedia(false);
    let t = 0;
    const now = () => t;
    const { result, rerender } = renderHook(({ target }) => useCountUp(target, { durationMs: 500, now }), { initialProps: { target: 0 } });
    rerender({ target: 100 });
    t = 250;
    act(() => void vi.advanceTimersByTime(16));
    const halfway = result.current;
    expect(halfway).toBeGreaterThan(0);
    rerender({ target: 200 });
    t = 260;
    act(() => void vi.advanceTimersByTime(16));
    expect(result.current).toBeGreaterThanOrEqual(halfway);
    t = 760;
    act(() => void vi.advanceTimersByTime(16));
    expect(result.current).toBe(200);
  });

  it("con «reducir movimiento» salta directo al valor final", () => {
    mockMedia(true);
    const { result, rerender } = renderHook(({ target }) => useCountUp(target, { durationMs: 500 }), { initialProps: { target: 0 } });
    rerender({ target: 100 });
    expect(result.current).toBe(100);
  });

  it("no deja temporizadores vivos al desmontar", () => {
    mockMedia(false);
    let t = 0;
    const { rerender, unmount } = renderHook(({ target }) => useCountUp(target, { durationMs: 500, now: () => t }), { initialProps: { target: 0 } });
    rerender({ target: 100 });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
cd client && npx vitest run test/components/logo.test.tsx test/components/avatar.test.tsx test/game/motion.test.tsx test/catalog/artwork.test.ts test/components/art-image.test.tsx
```

Expected: FAIL — no existen los módulos.

- [ ] **Step 3: Implementar**

`client/src/components/Logo.tsx`:

```tsx
/** La bola del juego: dos mitades de color, una banda y un botón. Es decorativa; el nombre va al lado como texto. */
export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false" className={`shrink-0 ${className}`}>
      <circle cx="32" cy="32" r="30" className="fill-fg" />
      <path d="M32 6a26 26 0 0 1 26 26H6A26 26 0 0 1 32 6z" className="fill-accent" />
      <path d="M6 32h52a26 26 0 0 1-52 0z" className="fill-surface" />
      <circle cx="32" cy="32" r="9" className="fill-fg" />
      <circle cx="32" cy="32" r="5" className="fill-surface" />
    </svg>
  );
}

/** La bola con el nombre del juego en la fuente de títulos. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={size} />
      <span className="font-display text-xl font-semibold tracking-tight">Pokémon Minigames</span>
    </span>
  );
}
```

`client/src/components/Avatar.tsx`:

```tsx
export interface AvatarColor {
  background: string;
  color: string;
}

/** Ocho colores que superan 4,5:1 con texto blanco; cada nombre cae siempre en el mismo. */
export const AVATAR_COLORS: readonly AvatarColor[] = [
  { background: "#c2410c", color: "#ffffff" },
  { background: "#1d4ed8", color: "#ffffff" },
  { background: "#15803d", color: "#ffffff" },
  { background: "#7e22ce", color: "#ffffff" },
  { background: "#be185d", color: "#ffffff" },
  { background: "#0e7490", color: "#ffffff" },
  { background: "#854d0e", color: "#ffffff" },
  { background: "#b91c1c", color: "#ffffff" },
];

/** Siempre el mismo color para el mismo nombre (sin importar las mayúsculas): un hash sencillo de la cadena. */
export function avatarColor(name: string): AvatarColor {
  let hash = 5381;
  for (const char of name.toLowerCase()) hash = (hash * 33 + char.codePointAt(0)!) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

/** Las iniciales: la primera letra de las dos primeras partes del nombre, o las dos primeras letras si es una sola. */
export function initials(name: string): string {
  const parts = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.length >= 2 ? [...parts[0]!][0]! + [...parts[1]!][0]! : [...parts[0]!].slice(0, 2).join("");
  return letters.toUpperCase();
}

const SIZES = { sm: 28, md: 36, lg: 56, xl: 88 } as const;

export interface AvatarProps {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}

/** Iniciales sobre un color propio. Es decorativo: el nombre ya está al lado como texto. */
export function Avatar({ name, size = "md", className = "" }: AvatarProps) {
  const px = SIZES[size];
  return (
    <span
      aria-hidden="true"
      style={{ ...avatarColor(name), width: px, height: px, fontSize: Math.round(px * 0.4) }}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-pill font-display font-semibold ${className}`}
    >
      {initials(name)}
    </span>
  );
}
```

`client/src/catalog/artwork.ts`:

```ts
const BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork";

/** El arte oficial grande (475 × 475) de un Pokémon, a partir de su número de Pokédex. */
export function artworkUrl(id: number): string {
  if (!Number.isInteger(id) || id < 1) throw new RangeError(`Número de Pokédex inválido: ${id}`);
  return `${BASE}/${id}.png`;
}
```

`client/src/components/ArtImage.tsx`:

```tsx
import { useState } from "react";
import { artworkUrl } from "../catalog/artwork";
import { LogoMark } from "./Logo";

export interface ArtImageProps {
  id: number;
  /** El sprite pequeño que ya llega con cada Pokémon: respaldo del arte oficial y fuente de la variante `sprite`. */
  spriteUrl: string;
  /** Lado en píxeles (la imagen es cuadrada). */
  size: number;
  /** `official` (por defecto) empieza por el arte grande; `sprite` solo pide el sprite pequeño. */
  variant?: "official" | "sprite";
  /** Sin carga perezosa: para lo que se ve de inmediato (el resultado de la ronda). */
  eager?: boolean;
  className?: string;
}

type Source = "official" | "sprite" | "none";

function Art({ id, spriteUrl, size, variant = "official", eager = false, className = "" }: ArtImageProps) {
  const [source, setSource] = useState<Source>(variant);
  const [loaded, setLoaded] = useState(false);

  const state = source === "none" ? "fallback" : loaded ? "loaded" : "loading";
  const next = (current: Source): Source => (current === "official" ? "sprite" : "none");

  return (
    <span
      data-state={state}
      style={{ width: size, height: size }}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-card ${state === "loading" ? "skeleton" : ""} ${className}`}
    >
      {source === "none" ? (
        <LogoMark size={Math.round(size * 0.5)} className="opacity-40" />
      ) : (
        <img
          key={source}
          src={source === "official" ? artworkUrl(id) : spriteUrl}
          alt=""
          width={size}
          height={size}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setSource(next);
          }}
          className={`h-full w-full object-contain transition-opacity duration-(--dur-base) ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </span>
  );
}

/** La imagen de un Pokémon: arte oficial, o el sprite si falla, o una bola neutra; con esqueleto mientras carga. */
export function ArtImage(props: ArtImageProps) {
  // Con otro Pokémon (u otra variante) se empieza de cero.
  return <Art key={`${props.id}-${props.variant ?? "official"}`} {...props} />;
}
```

`client/src/game/motion.ts`:

```ts
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

const snapshot = (): boolean => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;

/** ¿Pidió la persona «reducir movimiento» en su sistema? Sin `matchMedia` se asume que el movimiento está permitido. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

export interface CountUpOptions {
  /** Cuánto tarda en llegar al valor nuevo. */
  durationMs?: number;
  /** Reloj inyectable para las pruebas. */
  now?: () => number;
}

/**
 * El valor que se muestra: al cambiar `target` sube o baja hasta él en `durationMs` y termina exactamente en él. Si
 * cambia a mitad de camino sigue desde donde iba. Con «reducir movimiento» salta directo al valor final.
 */
export function useCountUp(target: number, { durationMs = 500, now = Date.now }: CountUpOptions = {}): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(target);
  const shown = useRef(target);

  useEffect(() => {
    if (reduced || durationMs <= 0) {
      shown.current = target;
      setValue(target);
      return;
    }
    const from = shown.current;
    if (from === target) return;
    const start = now();
    const timer = setInterval(() => {
      const progress = Math.min(1, (now() - start) / durationMs);
      const eased = 1 - (1 - progress) ** 3;
      shown.current = Math.round(from + (target - from) * eased);
      setValue(shown.current);
      if (progress >= 1) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [target, reduced, durationMs, now]);

  return reduced ? target : value;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
cd client && npx vitest run test/components/logo.test.tsx test/components/avatar.test.tsx test/game/motion.test.tsx test/catalog/artwork.test.ts test/components/art-image.test.tsx
npx vitest run --testTimeout=30000 --maxWorkers=2
cd .. && npm run typecheck
```

Expected: PASS (todo el cliente: **479 pruebas**) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): logo, avatar, arte oficial con respaldo y ayudantes de movimiento" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Controles: botón, campo, aviso, etiqueta, ficha y tarjeta

**Files:**
- Create: `client/src/components/Badge.tsx`, `client/src/components/Card.tsx`, `client/src/components/StatTile.tsx`, `client/test/components/controls.test.tsx`
- Modify: `client/src/components/Button.tsx`, `client/src/components/TextField.tsx`, `client/src/components/Notice.tsx`, `client/src/pages/Lobby.tsx`, `client/src/pages/room/RoomPage.tsx`

**Interfaces:**
- Consumes: los tokens y utilidades de la Task 1.
- Produces: `Button` con `size?: "md" | "lg"` y, al cargar, una ruedita decorativa (`animate-spin-slow`); el principal y el secundario tienen relieve (`--depth`, `--accent-edge`) que se hunde al pulsar, y el hover mueve el botón en vez de bajar la opacidad (con opacidad el texto pierde contraste). `Notice` gana un icono decorativo por tono y la propiedad `action` (un botón a la derecha, fuera del texto): el aviso del lobby «Tienes una partida en curso» y el de «Abriste esta partida en otra pestaña» pasan a usarla. `Badge({ tone?: "neutral" | "success" | "danger" | "gold" | "info" })`, `StatTile({ label, value, hint? })` (va dentro de un `<dl>`) y `Card({ as?: "div" | "section" | "article", tone?: "plain" | "raised" })` (borde del tema, esquinas redondeadas, fondo de superficie y sombra `shadow-card` o `shadow-pop`).

- [ ] **Step 1: Escribir la prueba que falla**

`client/test/components/controls.test.tsx` (las pruebas de `basics.test.tsx` siguen valiendo y no se tocan):

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Badge } from "../../src/components/Badge";
import { Button } from "../../src/components/Button";
import { Card } from "../../src/components/Card";
import { Notice } from "../../src/components/Notice";
import { StatTile } from "../../src/components/StatTile";
import { TextField } from "../../src/components/TextField";

describe("Button (etapa 6)", () => {
  it("el principal tiene relieve: un borde inferior del color de borde del acento que se hunde al pulsar", () => {
    render(<Button variant="primary">Entrar</Button>);
    const { className } = screen.getByRole("button", { name: "Entrar" });
    expect(className).toContain("bg-accent");
    expect(className).toContain("var(--accent-edge)");
    expect(className).toContain("active:translate-y-");
  });

  it("el tamaño grande es más alto que el normal", () => {
    const { rerender } = render(<Button>Aceptar</Button>);
    const normal = screen.getByRole("button").className;
    rerender(<Button size="lg">Aceptar</Button>);
    const large = screen.getByRole("button").className;
    expect(normal).toContain("py-2");
    expect(large).toContain("py-3");
    expect(large).toContain("text-base");
  });

  it("al cargar muestra una ruedita decorativa y su nombre accesible sigue siendo el texto", () => {
    render(<Button loading>Entrar</Button>);
    const button = screen.getByRole("button", { name: "Entrar" });
    const spinner = button.querySelector("svg");
    expect(spinner).toHaveAttribute("aria-hidden", "true");
    expect(spinner?.getAttribute("class")).toContain("animate-spin-slow");
  });

  it("sin cargar no hay ruedita", () => {
    render(<Button>Entrar</Button>);
    expect(screen.getByRole("button").querySelector("svg")).toBeNull();
  });

  it("deshabilitado no ejecuta su acción", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Crear
      </Button>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("TextField (etapa 6)", () => {
  it("es un campo alto y redondeado con el foco visible", () => {
    render(<TextField label="Email" />);
    const className = screen.getByLabelText("Email").className;
    expect(className).toContain("py-3");
    expect(className).toContain("rounded-ui");
    expect(className).toContain("framed");
  });
});

describe("Notice (etapa 6)", () => {
  it("cada tono lleva su icono decorativo y el texto sigue siendo lo único que se lee", () => {
    for (const tone of ["info", "danger", "success"] as const) {
      const { unmount } = render(<Notice tone={tone}>Mensaje</Notice>);
      const notice = screen.getByRole(tone === "danger" ? "alert" : "status");
      expect(notice.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
      expect(notice).toHaveTextContent("Mensaje");
      unmount();
    }
  });

  it("deja un hueco para una acción a la derecha, fuera del texto", async () => {
    const onClick = vi.fn();
    render(
      <Notice tone="success" action={<Button onClick={onClick}>Volver</Button>}>
        Tienes una partida
      </Notice>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Tienes una partida");
    await userEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("el texto con varios fragmentos conserva sus espacios", () => {
    render(
      <Notice>
        <span>Ash se desconectó.</span> <span>Tiene 20 s para volver.</span>
      </Notice>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Ash se desconectó. Tiene 20 s para volver.");
  });
});

describe("Badge", () => {
  it.each([
    ["success", "bg-success-bg", "text-success"],
    ["danger", "bg-danger-bg", "text-danger"],
    ["gold", "bg-gold", "text-gold-fg"],
    ["info", "bg-accent-2", "text-accent-2-fg"],
    ["neutral", "bg-surface-2", "text-fg"],
  ] as const)("el tono %s usa %s con %s", (tone, background, color) => {
    render(<Badge tone={tone}>Ganaste</Badge>);
    const { className } = screen.getByText("Ganaste");
    expect(className).toContain(background);
    expect(className).toContain(color);
  });

  it("por defecto es neutra", () => {
    render(<Badge>Empate</Badge>);
    expect(screen.getByText("Empate").className).toContain("bg-surface-2");
  });
});

describe("StatTile", () => {
  it("es una ficha con su etiqueta y su valor, dentro de una lista de definiciones", () => {
    render(
      <dl>
        <StatTile label="Partidas" value="12" />
      </dl>,
    );
    expect(screen.getByText("Partidas").tagName).toBe("DT");
    expect(screen.getByText("12").tagName).toBe("DD");
  });

  it("puede llevar una ayuda debajo", () => {
    render(
      <dl>
        <StatTile label="Racha actual" value="3" hint="partidas seguidas" />
      </dl>,
    );
    expect(screen.getByText("partidas seguidas")).toBeInTheDocument();
  });
});

describe("Card", () => {
  it("por defecto es un recuadro con relieve", () => {
    render(<Card data-testid="card">Contenido</Card>);
    const { className } = screen.getByTestId("card");
    expect(className).toContain("framed");
    expect(className).toContain("rounded-card");
    expect(className).toContain("bg-surface");
    expect(className).toContain("shadow-card");
  });

  it("puede ser una sección con nombre accesible (una región)", () => {
    render(
      <Card as="section" aria-label="Tu equipo">
        Contenido
      </Card>,
    );
    expect(screen.getByRole("region", { name: "Tu equipo" })).toBeInTheDocument();
  });

  it("puede ser un artículo y deja pasar clases propias", () => {
    render(
      <Card as="article" className="p-6">
        Contenido
      </Card>,
    );
    expect(screen.getByRole("article").className).toContain("p-6");
  });

  it("la variante elevada usa la sombra más marcada", () => {
    render(
      <Card tone="raised" data-testid="card">
        Contenido
      </Card>,
    );
    expect(screen.getByTestId("card").className).toContain("shadow-pop");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
cd client && npx vitest run test/components/controls.test.tsx
```

Expected: FAIL — no existen `Badge`, `Card` ni `StatTile`.

- [ ] **Step 3: Implementar**

`client/src/components/Button.tsx`:

```diff
diff --git a/client/src/components/Button.tsx b/client/src/components/Button.tsx
index f0b1a13..a3334e4 100644
--- a/client/src/components/Button.tsx
+++ b/client/src/components/Button.tsx
@@ -1,30 +1,63 @@
 import type { ButtonHTMLAttributes } from "react";
 
 type Variant = "primary" | "secondary" | "ghost" | "header";
+type Size = "md" | "lg";
 
+/*
+ * El principal y el secundario tienen relieve: un borde inferior (`--depth`, 4 px en Clásico y 0 en Pokédex) que se
+ * hunde a la mitad al pulsar. El hover mueve el botón en vez de bajar la opacidad: con opacidad el texto pierde contraste.
+ */
 const VARIANTS: Record<Variant, string> = {
-  // El hover subraya en vez de bajar la opacidad: con opacidad el texto pierde contraste (en Pokédex quedaba por debajo de 4,5:1).
-  primary: "bg-accent text-accent-fg border-transparent hover:underline",
-  secondary: "bg-surface text-fg border-line hover:bg-surface-2",
+  primary:
+    "bg-accent text-accent-fg border-accent-edge shadow-[0_var(--depth)_0_0_var(--accent-edge)] hover:-translate-y-px active:translate-y-[calc(var(--depth)/2)] active:shadow-[0_calc(var(--depth)/2)_0_0_var(--accent-edge)]",
+  secondary:
+    "bg-surface text-fg border-line shadow-[0_var(--depth)_0_0_var(--line)] hover:bg-surface-2 active:translate-y-[calc(var(--depth)/2)] active:shadow-[0_calc(var(--depth)/2)_0_0_var(--line)]",
   ghost: "bg-transparent text-fg border-transparent hover:bg-surface-2",
   // Sobre el encabezado, que tiene su propio fondo y su propio color de texto según el tema.
   header: "bg-transparent text-header-fg border-transparent hover:bg-header-fg/15",
 };
 
+const SIZES: Record<Size, string> = {
+  md: "px-5 py-2 text-sm",
+  lg: "px-7 py-3 text-base",
+};
+
 export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
   variant?: Variant;
-  /** Mientras carga queda deshabilitado y lo indica a los lectores de pantalla. */
+  size?: Size;
+  /** Mientras carga queda deshabilitado, muestra una ruedita y lo indica a los lectores de pantalla. */
   loading?: boolean;
 }
 
-export function Button({ variant = "secondary", loading = false, disabled, className = "", type = "button", ...props }: ButtonProps) {
+function Spinner() {
+  return (
+    <svg viewBox="0 0 24 24" className="size-4 animate-spin-slow" aria-hidden="true" focusable="false">
+      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.25" />
+      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
+    </svg>
+  );
+}
+
+export function Button({
+  variant = "secondary",
+  size = "md",
+  loading = false,
+  disabled,
+  className = "",
+  type = "button",
+  children,
+  ...props
+}: ButtonProps) {
   return (
     <button
       type={type}
       disabled={disabled || loading}
       aria-busy={loading || undefined}
-      className={`inline-flex items-center justify-center gap-2 rounded-ui border-(length:--frame) px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
+      className={`inline-flex items-center justify-center gap-2 rounded-pill border-(length:--frame) font-display font-semibold transition-[transform,box-shadow,background-color] duration-(--dur-fast) ease-(--ease-out) disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
       {...props}
-    />
+    >
+      {loading ? <Spinner /> : null}
+      {children}
+    </button>
   );
 }
```

`client/src/components/TextField.tsx`:

```diff
diff --git a/client/src/components/TextField.tsx b/client/src/components/TextField.tsx
index 8354df6..cea417b 100644
--- a/client/src/components/TextField.tsx
+++ b/client/src/components/TextField.tsx
@@ -15,23 +15,23 @@ export function TextField({ label, error, hint, id, ...input }: TextFieldProps)
 
   return (
     <div>
-      <label htmlFor={fieldId} className="mb-1 block text-sm font-medium">
+      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-semibold">
         {label}
       </label>
       <input
         id={fieldId}
         aria-invalid={error ? true : undefined}
         aria-describedby={[error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined}
-        className="framed w-full rounded-ui bg-surface px-3 py-2 text-fg placeholder:text-muted"
+        className="framed w-full rounded-ui bg-surface px-4 py-3 text-fg transition-shadow duration-(--dur-fast) placeholder:text-muted focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_25%,transparent)]"
         {...input}
       />
       {hint ? (
-        <p id={hintId} className="mt-1 text-xs text-muted">
+        <p id={hintId} className="mt-1.5 text-xs text-muted">
           {hint}
         </p>
       ) : null}
       {error ? (
-        <p id={errorId} role="alert" className="mt-1 text-sm text-danger">
+        <p id={errorId} role="alert" className="mt-1.5 text-sm font-semibold text-danger">
           {error}
         </p>
       ) : null}
```

`client/src/components/Notice.tsx`:

```diff
diff --git a/client/src/components/Notice.tsx b/client/src/components/Notice.tsx
index 135d868..7ba7191 100644
--- a/client/src/components/Notice.tsx
+++ b/client/src/components/Notice.tsx
@@ -8,21 +8,49 @@ const TONES: Record<Tone, string> = {
   success: "bg-success-bg text-success border-success",
 };
 
+/** Un icono sencillo por tono, decorativo: el texto del aviso es lo que se lee. */
+function NoticeIcon({ tone }: { tone: Tone }) {
+  return (
+    <svg viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
+      {tone === "danger" ? (
+        <>
+          <path d="M12 4 3 20h18L12 4z" />
+          <path d="M12 10v4M12 17h.01" />
+        </>
+      ) : tone === "success" ? (
+        <>
+          <circle cx="12" cy="12" r="9" />
+          <path d="m8 12.5 2.8 2.8L16 9.6" />
+        </>
+      ) : (
+        <>
+          <circle cx="12" cy="12" r="9" />
+          <path d="M12 11v5M12 8h.01" />
+        </>
+      )}
+    </svg>
+  );
+}
+
 export interface NoticeProps {
   tone?: Tone;
   children: ReactNode;
+  /** Un botón o enlace a la derecha del texto (p. ej. «Volver a tu partida»). */
+  action?: ReactNode;
   /** Los errores se anuncian de inmediato (`alert`); lo demás, con calma (`status`). */
   urgent?: boolean;
   className?: string;
 }
 
-export function Notice({ tone = "info", urgent = tone === "danger", children, className = "" }: NoticeProps) {
+export function Notice({ tone = "info", urgent = tone === "danger", children, action, className = "" }: NoticeProps) {
   return (
     <div
       role={urgent ? "alert" : "status"}
-      className={`rounded-ui border-(length:--frame) px-3 py-2 text-sm ${TONES[tone]} ${className}`}
+      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-ui border-(length:--frame) px-4 py-3 text-sm ${TONES[tone]} ${className}`}
     >
-      {children}
+      <NoticeIcon tone={tone} />
+      <div className="min-w-0 flex-1">{children}</div>
+      {action ? <div className="shrink-0">{action}</div> : null}
     </div>
   );
 }
```

`client/src/components/Badge.tsx`:

```tsx
import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "danger" | "gold" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-fg",
  success: "bg-success-bg text-success",
  danger: "bg-danger-bg text-danger",
  gold: "bg-gold text-gold-fg",
  info: "bg-accent-2 text-accent-2-fg",
};

/** Una etiqueta corta de color (Ganaste, Empate, Perdiste…). El color nunca es lo único que dice algo: lleva texto. */
export function Badge({ tone = "neutral", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-pill px-3 py-0.5 text-xs font-semibold ${TONES[tone]} ${className}`}>{children}</span>
  );
}
```

`client/src/components/StatTile.tsx`:

```tsx
/** Una ficha de estadística (etiqueta y valor). Va dentro de un `<dl>`. */
export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="framed rounded-card bg-surface px-4 py-3 shadow-card">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-num text-3xl font-semibold tabular-nums">{value}</dd>
      {hint ? <dd className="text-xs text-muted">{hint}</dd> : null}
    </div>
  );
}
```

`client/src/components/Card.tsx`:

```tsx
import type { HTMLAttributes } from "react";

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "className"> {
  /** El elemento HTML: una `section` con `aria-label` es una región; un `article`, un contenido independiente. */
  as?: "div" | "section" | "article";
  /** `raised` usa la sombra más marcada, para lo que debe destacar. */
  tone?: "plain" | "raised";
  className?: string;
}

/** El recuadro común de la interfaz: borde del tema, esquinas redondeadas, fondo de superficie y sombra. */
export function Card({ as: Tag = "div", tone = "plain", className = "", ...props }: CardProps) {
  return <Tag className={`framed rounded-card bg-surface ${tone === "raised" ? "shadow-pop" : "shadow-card"} ${className}`} {...props} />;
}
```

Los dos avisos que llevaban un botón dentro del texto pasan a la propiedad `action`: `client/src/pages/Lobby.tsx` y `client/src/pages/room/RoomPage.tsx`:

```diff
diff --git a/client/src/pages/Lobby.tsx b/client/src/pages/Lobby.tsx
index f71d395..422a905 100644
--- a/client/src/pages/Lobby.tsx
+++ b/client/src/pages/Lobby.tsx
@@ -38,11 +38,15 @@ function ResumeBanner() {
 
   if (!room) return null;
   return (
-    <Notice tone="success" className="flex flex-wrap items-center justify-between gap-2">
+    <Notice
+      tone="success"
+      action={
+        <Button variant="primary" onClick={() => navigate(`/sala/${room.code}`)}>
+          Volver a tu partida
+        </Button>
+      }
+    >
       <span>Tienes una partida en curso (sala {room.code}).</span>
-      <Button variant="primary" onClick={() => navigate(`/sala/${room.code}`)}>
-        Volver a tu partida
-      </Button>
     </Notice>
   );
 }
```

```diff
diff --git a/client/src/pages/room/RoomPage.tsx b/client/src/pages/room/RoomPage.tsx
index 74b55ed..2daa122 100644
--- a/client/src/pages/room/RoomPage.tsx
+++ b/client/src/pages/room/RoomPage.tsx
@@ -110,11 +110,14 @@ export function RoomPage() {
       </p>
       {connection === "disconnected" && phase !== "finished" ? <Notice>Conexión perdida. Reconectando…</Notice> : null}
       {connection === "replaced" && phase !== "finished" ? (
-        <Notice className="flex flex-wrap items-center justify-between gap-2">
+        <Notice
+          action={
+            <Button variant="primary" onClick={() => game.client.join(code)}>
+              Jugar aquí
+            </Button>
+          }
+        >
           <span>Abriste esta partida en otra pestaña.</span>
-          <Button variant="primary" onClick={() => game.client.join(code)}>
-            Jugar aquí
-          </Button>
         </Notice>
       ) : null}
       <OpponentAwayNotice />
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
cd client && npx vitest run --testTimeout=30000 --maxWorkers=2
cd .. && npm run typecheck
```

Expected: PASS (todo el cliente: **500 pruebas**) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): controles rehechos (botón con relieve, campo, aviso con icono, etiqueta, ficha y tarjeta)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Chips de tipo con relieve

**Files:**
- Modify: `client/src/theme/contrast.ts`, `client/src/theme/type-styles.ts`, `client/src/components/TypeChip.tsx`
- Create: `client/test/theme/type-chip-style.test.tsx`

**Interfaces:**
- Produces: `mixHex(from, to, amount)` (mezcla dos colores `#rrggbb`; lanza si no lo son); `typeGradient(type): { top, bottom, color }` — con texto claro el color del tipo queda arriba y se oscurece hacia abajo; con texto oscuro queda abajo y se aclara hacia arriba, de modo que el texto se lee sobre los dos extremos igual de bien o mejor que sobre el color del tipo; `typeChipStyle(type)` (el estilo en línea: `background` con el degradado y `color`). `TYPE_STYLES` no cambia (fondo sólido y texto), así que las pruebas de colores de tipo siguen valiendo. `TypeChip({ type, size?: "md" | "lg", className? })` es una píldora con degradado, un filo oscuro abajo y `font-display`; conserva `data-type` y el nombre del tipo.

- [ ] **Step 1: Escribir la prueba que falla**

`client/test/theme/type-chip-style.test.tsx` (los 18 tipos × los dos extremos del degradado, y que el color del tipo sea uno de ellos):

```tsx
import { TYPE_NAMES } from "@pokemon-minigames/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TypeChip } from "../../src/components/TypeChip";
import { contrastRatio, mixHex } from "../../src/theme/contrast";
import { TYPE_STYLES, typeChipStyle, typeGradient } from "../../src/theme/type-styles";

describe("mixHex", () => {
  it("mezcla dos colores en la proporción pedida", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#102030", "#ffffff", 0)).toBe("#102030");
    expect(mixHex("#102030", "#ffffff", 1)).toBe("#ffffff");
  });

  it("rechaza colores que no son #rrggbb", () => {
    expect(() => mixHex("rojo", "#ffffff", 0.5)).toThrow(/inválido/);
  });
});

describe("degradado de los chips de tipo", () => {
  it.each(TYPE_NAMES)("%s: el texto supera 4,5:1 sobre los dos extremos del degradado", (type) => {
    const { top, bottom, color } = typeGradient(type);
    expect(contrastRatio(color, top), `${type} arriba`).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(color, bottom), `${type} abajo`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(TYPE_NAMES)("%s: uno de los extremos es el color del tipo y el otro solo lo aclara o lo oscurece", (type) => {
    const { top, bottom } = typeGradient(type);
    const base = TYPE_STYLES[type].background;
    expect([top, bottom]).toContain(base);
    expect(top).not.toBe(bottom);
  });

  it("con texto claro el degradado oscurece hacia abajo; con texto oscuro aclara hacia arriba", () => {
    const light = typeGradient("dragon"); // morado oscuro: texto blanco
    expect(light.color).toBe("#ffffff");
    expect(light.top).toBe(TYPE_STYLES.dragon.background);
    const dark = typeGradient("electric"); // amarillo: texto casi negro
    expect(dark.color).toBe("#111111");
    expect(dark.bottom).toBe(TYPE_STYLES.electric.background);
  });

  it("el estilo del chip trae el degradado y el color de texto", () => {
    const style = typeChipStyle("fire");
    expect(style.background).toMatch(/^linear-gradient\(180deg, #[0-9a-f]{6}, #[0-9a-f]{6}\)$/);
    expect(style.color).toBe(typeGradient("fire").color);
  });
});

describe("TypeChip (etapa 6)", () => {
  it("es una píldora con relieve y la fuente de títulos, y conserva su tipo y su nombre", () => {
    render(<TypeChip type="water" />);
    const chip = screen.getByText("agua");
    expect(chip).toHaveAttribute("data-type", "water");
    expect(chip.className).toContain("rounded-pill");
    expect(chip.className).toContain("font-display");
    expect(chip.className).toContain("shadow-[inset_0_-2px_0");
    expect(chip.style.background).toContain("linear-gradient");
  });

  it("el tamaño grande es más alto que el normal", () => {
    const { rerender } = render(<TypeChip type="water" />);
    const normal = screen.getByText("agua").className;
    rerender(<TypeChip type="water" size="lg" />);
    const large = screen.getByText("agua").className;
    expect(normal).toContain("text-sm");
    expect(large).toContain("text-lg");
    expect(large).toContain("py-1.5");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
cd client && npx vitest run test/theme/type-chip-style.test.tsx
```

Expected: FAIL — `mixHex` y `typeGradient` no existen.

- [ ] **Step 3: Implementar**

`client/src/theme/contrast.ts`:

```diff
diff --git a/client/src/theme/contrast.ts b/client/src/theme/contrast.ts
index f5f06b5..7ec7287 100644
--- a/client/src/theme/contrast.ts
+++ b/client/src/theme/contrast.ts
@@ -23,3 +23,17 @@ const DARK_TEXT = "#111111";
 export function readableOn(background: string): string {
   return contrastRatio(LIGHT_TEXT, background) >= contrastRatio(DARK_TEXT, background) ? LIGHT_TEXT : DARK_TEXT;
 }
+
+/** Mezcla dos colores `#rrggbb`: `amount` 0 deja el primero, 1 el segundo. */
+export function mixHex(from: string, to: string, amount: number): string {
+  const channels = (hex: string): number[] => {
+    const match = /^#([0-9a-f]{6})$/i.exec(hex);
+    if (!match) throw new Error(`Color inválido: ${hex}`);
+    const value = Number.parseInt(match[1]!, 16);
+    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
+  };
+  const a = channels(from);
+  const b = channels(to);
+  const mixed = a.map((channel, i) => Math.round(channel + (b[i]! - channel) * amount));
+  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
+}
```

`client/src/theme/type-styles.ts`:

```diff
diff --git a/client/src/theme/type-styles.ts b/client/src/theme/type-styles.ts
index 8bf6bd0..74450d9 100644
--- a/client/src/theme/type-styles.ts
+++ b/client/src/theme/type-styles.ts
@@ -1,5 +1,6 @@
 import type { TypeName } from "@pokemon-minigames/shared";
-import { readableOn } from "./contrast";
+import type { CSSProperties } from "react";
+import { mixHex, readableOn } from "./contrast";
 
 const TYPE_BACKGROUNDS: Record<TypeName, string> = {
   normal: "#a8a77a",
@@ -31,3 +32,27 @@ export interface TypeStyle {
 export const TYPE_STYLES: Record<TypeName, TypeStyle> = Object.fromEntries(
   Object.entries(TYPE_BACKGROUNDS).map(([type, background]) => [type, { background, color: readableOn(background) }]),
 ) as Record<TypeName, TypeStyle>;
+
+export interface TypeGradient {
+  top: string;
+  bottom: string;
+  color: string;
+}
+
+/**
+ * El degradado de relieve de un chip: con texto claro el color del tipo queda arriba y se oscurece hacia abajo; con
+ * texto oscuro el color queda abajo y se aclara hacia arriba. Así el texto se lee sobre los dos extremos igual de bien
+ * (o mejor) que sobre el color del tipo.
+ */
+export function typeGradient(type: TypeName): TypeGradient {
+  const { background, color } = TYPE_STYLES[type];
+  return color === "#ffffff"
+    ? { top: background, bottom: mixHex(background, "#000000", 0.28), color }
+    : { top: mixHex(background, "#ffffff", 0.3), bottom: background, color };
+}
+
+/** El estilo en línea de un chip o tesela de tipo. */
+export function typeChipStyle(type: TypeName): CSSProperties {
+  const { top, bottom, color } = typeGradient(type);
+  return { background: `linear-gradient(180deg, ${top}, ${bottom})`, color };
+}
```

`client/src/components/TypeChip.tsx`:

```diff
diff --git a/client/src/components/TypeChip.tsx b/client/src/components/TypeChip.tsx
index b321c1a..b2fb216 100644
--- a/client/src/components/TypeChip.tsx
+++ b/client/src/components/TypeChip.tsx
@@ -1,12 +1,18 @@
 import type { TypeName } from "@pokemon-minigames/shared";
 import { TYPE_LABELS } from "../i18n/es";
-import { TYPE_STYLES } from "../theme/type-styles";
+import { typeChipStyle } from "../theme/type-styles";
 
-export function TypeChip({ type, className = "" }: { type: TypeName; className?: string }) {
+const SIZES = {
+  md: "px-3 py-0.5 text-sm",
+  lg: "px-5 py-1.5 text-lg",
+} as const;
+
+/** El nombre de un tipo sobre su color, con relieve (un degradado y un filo oscuro abajo). */
+export function TypeChip({ type, size = "md", className = "" }: { type: TypeName; size?: keyof typeof SIZES; className?: string }) {
   return (
     <span
-      style={TYPE_STYLES[type]}
-      className={`inline-block rounded-ui px-3 py-0.5 text-sm font-medium ${className}`}
+      style={typeChipStyle(type)}
+      className={`inline-block rounded-pill font-display font-semibold shadow-[inset_0_-2px_0_rgb(0_0_0/0.18)] ${SIZES[size]} ${className}`}
       data-type={type}
     >
       {TYPE_LABELS[type]}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
cd client && npx vitest run --testTimeout=30000 --maxWorkers=2
cd .. && npm run typecheck
```

Expected: PASS (todo el cliente: **542 pruebas**) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): chips de tipo con relieve y texto legible sobre los dos extremos del degradado" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Cronómetro en anillo y pantalla de carga

**Files:**
- Modify: `client/src/components/Timer.tsx`, `client/src/components/LoadingScreen.tsx`
- Create: `client/test/components/timer-ring.test.tsx`

**Interfaces:**
- Consumes: `useCountdown`, `secondsLeft` (`game/clock.ts`) y `LogoMark` (Task 2).
- Produces: `Timer({ deadline, offset, totalMs, label, size = 120, urgentAtMs = 5000, now? })` — un anillo SVG decorativo (radio 44, trazo 8) que se vacía y el número dentro; `role="timer"`, el nombre accesible y la regla de no anunciar cada segundo se conservan; en los últimos `urgentAtMs` el anillo y el número pasan a rojo y el contenedor lleva `data-urgent="true"`; `urgentAtMs={0}` lo apaga. `LoadingScreen` muestra la bola girando (`animate-spin-slow`) además del texto de siempre y del aviso de arranque lento a los 5 s.

- [ ] **Step 1: Escribir la prueba que falla**

`client/test/components/timer-ring.test.tsx`:

```tsx
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoadingScreen } from "../../src/components/LoadingScreen";
import { Timer } from "../../src/components/Timer";

const CIRCUMFERENCE = 2 * Math.PI * 44;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** El círculo que se vacía: el segundo trazo del anillo. */
const progress = (container: HTMLElement) => container.querySelectorAll("circle")[1]!;
const dashoffset = (container: HTMLElement) => Number(progress(container).getAttribute("stroke-dashoffset"));

describe("Timer como anillo", () => {
  it("al empezar el anillo está lleno y a la mitad queda medio vacío", () => {
    let now = 0;
    const { container } = render(<Timer deadline={15_000} offset={0} totalMs={15_000} label="Tiempo" now={() => now} />);
    expect(dashoffset(container)).toBeCloseTo(0, 1);

    now = 7_500;
    act(() => void vi.advanceTimersByTime(250));
    expect(dashoffset(container)).toBeCloseTo(CIRCUMFERENCE * 0.5, 0);
  });

  it("al llegar a cero el anillo queda vacío", () => {
    let now = 0;
    const { container } = render(<Timer deadline={1_000} offset={0} totalMs={15_000} label="Tiempo" now={() => now} />);
    now = 60_000;
    act(() => void vi.advanceTimersByTime(250));
    expect(dashoffset(container)).toBeCloseTo(CIRCUMFERENCE, 1);
  });

  it("los números van dentro del anillo y el anillo no añade texto", () => {
    render(<Timer deadline={12_000} offset={0} totalMs={15_000} label="Tiempo de la ronda" now={() => 0} />);
    const timer = screen.getByRole("timer", { name: "Tiempo de la ronda" });
    expect(timer).toHaveTextContent(/^12$/);
    expect(timer.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("no anuncia cada segundo a los lectores de pantalla", () => {
    render(<Timer deadline={12_000} offset={0} totalMs={15_000} label="Tiempo" now={() => 0} />);
    expect(screen.getByRole("timer")).not.toHaveAttribute("aria-live");
  });

  it("en los últimos 5 segundos pasa a rojo y lo marca", () => {
    let now = 0;
    const { container } = render(<Timer deadline={15_000} offset={0} totalMs={15_000} label="Tiempo" now={() => now} />);
    const timer = screen.getByRole("timer");
    expect(timer).toHaveAttribute("data-urgent", "false");
    expect(progress(container).getAttribute("class")).toContain("stroke-accent");

    now = 10_001;
    act(() => void vi.advanceTimersByTime(250));
    expect(timer).toHaveAttribute("data-urgent", "true");
    expect(progress(container).getAttribute("class")).toContain("stroke-danger");
  });

  it("con 0 segundos ya no está urgente: terminó", () => {
    let now = 0;
    render(<Timer deadline={1_000} offset={0} totalMs={15_000} label="Tiempo" now={() => now} />);
    now = 5_000;
    act(() => void vi.advanceTimersByTime(250));
    expect(screen.getByRole("timer")).toHaveAttribute("data-urgent", "false");
  });

  it("se puede apagar el aviso rojo (la cuenta atrás de 5 s del inicio no debe estar roja todo el rato)", () => {
    render(<Timer deadline={4_000} offset={0} totalMs={5_000} urgentAtMs={0} label="Inicio" now={() => 0} />);
    expect(screen.getByRole("timer")).toHaveAttribute("data-urgent", "false");
  });

  it("el tamaño se puede elegir", () => {
    render(<Timer deadline={4_000} offset={0} totalMs={5_000} size={160} label="Inicio" now={() => 0} />);
    const timer = screen.getByRole("timer");
    expect(timer.style.width).toBe("160px");
    expect(timer.style.height).toBe("160px");
  });
});

describe("LoadingScreen (etapa 6)", () => {
  it("muestra la bola girando, decorativa, además del texto de siempre", () => {
    render(<LoadingScreen />);
    const svg = screen.getByRole("status").querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg.getAttribute("class")).toContain("animate-spin-slow");
    expect(screen.getByRole("status")).toHaveTextContent("Cargando…");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
cd client && npx vitest run test/components/timer-ring.test.tsx
```

Expected: FAIL — el cronómetro todavía es una barra: no hay anillo, ni `data-urgent`, ni tamaño.

- [ ] **Step 3: Implementar**

`client/src/components/Timer.tsx`:

```diff
diff --git a/client/src/components/Timer.tsx b/client/src/components/Timer.tsx
index 09f7a75..afa32ba 100644
--- a/client/src/components/Timer.tsx
+++ b/client/src/components/Timer.tsx
@@ -5,24 +5,51 @@ export interface TimerProps {
   deadline: number | null;
   /** Desfase entre el reloj del servidor y el del navegador. */
   offset: number;
-  /** Duración total, para dibujar la barra de progreso. */
+  /** Duración total, para dibujar cuánto del anillo queda. */
   totalMs: number;
   /** Nombre accesible del cronómetro, p. ej. "Tiempo de la ronda". */
   label: string;
+  /** Lado del anillo en píxeles. */
+  size?: number;
+  /** Cuando quedan menos de estos milisegundos el anillo pasa a rojo; 0 lo apaga (p. ej. la cuenta atrás de inicio). */
+  urgentAtMs?: number;
   now?: () => number;
 }
 
-/** Cuenta atrás en segundos con barra de progreso. No anuncia cada segundo a los lectores de pantalla. */
-export function Timer({ deadline, offset, totalMs, label, now }: TimerProps) {
+const RADIUS = 44;
+const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
+
+/**
+ * Cuenta atrás en segundos dentro de un anillo que se vacía. No anuncia cada segundo a los lectores de pantalla
+ * (`role="timer"` no es una región viva), y el anillo es decorativo.
+ */
+export function Timer({ deadline, offset, totalMs, label, size = 120, urgentAtMs = 5000, now }: TimerProps) {
   const remaining = useCountdown(deadline, offset, { now });
-  const percent = totalMs > 0 ? Math.min(100, (remaining / totalMs) * 100) : 0;
+  const fraction = totalMs > 0 ? Math.min(1, Math.max(0, remaining / totalMs)) : 0;
+  const urgent = urgentAtMs > 0 && remaining > 0 && remaining <= urgentAtMs;
 
   return (
-    <div role="timer" aria-label={label} className="text-center">
-      <span className="font-num text-4xl font-medium tabular-nums">{secondsLeft(remaining)}</span>
-      <div className="mt-2 h-1 overflow-hidden rounded-ui bg-surface-2" aria-hidden="true">
-        <div className="h-1 bg-accent" style={{ width: `${percent}%` }} />
-      </div>
+    <div role="timer" aria-label={label} data-urgent={urgent} style={{ width: size, height: size }} className="relative mx-auto">
+      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true" focusable="false">
+        <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="8" className="stroke-surface-2" />
+        <circle
+          cx="50"
+          cy="50"
+          r={RADIUS}
+          fill="none"
+          strokeWidth="8"
+          strokeLinecap="round"
+          strokeDasharray={CIRCUMFERENCE}
+          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
+          className={urgent ? "stroke-danger" : "stroke-accent"}
+          style={{ transition: "stroke-dashoffset 250ms linear, stroke 250ms" }}
+        />
+      </svg>
+      <span
+        className={`absolute inset-0 flex items-center justify-center font-num text-4xl font-semibold tabular-nums ${urgent ? "text-danger" : ""}`}
+      >
+        {secondsLeft(remaining)}
+      </span>
     </div>
   );
 }
```

`client/src/components/LoadingScreen.tsx`:

```diff
diff --git a/client/src/components/LoadingScreen.tsx b/client/src/components/LoadingScreen.tsx
index 9fe0592..cd01bd7 100644
--- a/client/src/components/LoadingScreen.tsx
+++ b/client/src/components/LoadingScreen.tsx
@@ -1,4 +1,5 @@
 import { useEffect, useState } from "react";
+import { LogoMark } from "./Logo";
 
 /** Si la sesión tarda más que esto en recuperarse, el servidor probablemente se estaba durmiendo (capa gratuita). */
 export const SLOW_START_MS = 5000;
@@ -12,9 +13,10 @@ export function LoadingScreen() {
   }, []);
 
   return (
-    <div role="status" className="text-center text-muted">
-      <p>Cargando…</p>
-      {slow ? <p className="mt-2 text-sm">El servidor se está despertando, puede tardar hasta un minuto…</p> : null}
+    <div role="status" className="flex flex-col items-center gap-4 py-16 text-center text-muted">
+      <LogoMark size={56} className="animate-spin-slow" />
+      <p className="font-display text-lg font-medium">Cargando…</p>
+      {slow ? <p className="text-sm">El servidor se está despertando, puede tardar hasta un minuto…</p> : null}
     </div>
   );
 }
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
cd client && npx vitest run --testTimeout=30000 --maxWorkers=2
cd .. && npm run typecheck
```

Expected: PASS (todo el cliente: **551 pruebas**) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): cronómetro en anillo que se pone rojo al final y pantalla de carga con la bola girando" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Estructura de la aplicación: encabezado, menú de apariencia y pie

**Files:**
- Create: `client/src/components/ThemeMenu.tsx`, `client/src/components/Footer.tsx`, `client/test/components/app-shell.test.tsx`
- Modify: `client/src/components/Header.tsx`, `client/src/components/Logo.tsx`, `client/src/App.tsx`
- Delete: `client/src/components/ThemeSwitcher.tsx`
- Test (modificar): `client/test/components/header-theme.test.tsx`

**Interfaces:**
- Consumes: `useServices().theme` y `useTheme` (ya existen), `Avatar`, `Logo`, `Button`.
- Produces: `ThemeMenu()` — un botón «Apariencia» (`aria-expanded`) que abre un panel con dos grupos de radios reales, **Tema** (Clásico, Pokédex) y **Modo** (Automático, Claro, Oscuro), con aspecto de botones segmentados; las flechas del teclado los recorren, Escape lo cierra y devuelve el foco al botón y un clic fuera lo cierra. `Footer()` — el aviso de proyecto de fans con el enlace a PokeAPI (`target="_blank"` y `rel="noopener noreferrer"`). `Header()` — banner con el logo (enlace al lobby; la bola es decorativa y el nombre accesible es el del juego), el menú de apariencia y, con sesión, «Mi perfil», el avatar con el nombre y «Cerrar sesión»; en móvil los textos de «Mi perfil», «Cerrar sesión» y «Apariencia» quedan solo para lectores de pantalla (`sr-only sm:not-sr-only`). `App` pasa a ser encabezado + `main` (`flex-1`) + pie. `Logo` gana `hideNameOnMobile`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`client/test/components/header-theme.test.tsx` (el menú reemplaza a los dos `<select>`; las pruebas del encabezado siguen y suman las del avatar y el banner):

```diff
diff --git a/client/test/components/header-theme.test.tsx b/client/test/components/header-theme.test.tsx
index 3a5b101..4e68a2c 100644
--- a/client/test/components/header-theme.test.tsx
+++ b/client/test/components/header-theme.test.tsx
@@ -2,19 +2,33 @@ import { screen } from "@testing-library/react";
 import userEvent from "@testing-library/user-event";
 import { describe, expect, it } from "vitest";
 import { Header } from "../../src/components/Header";
-import { ThemeSwitcher } from "../../src/components/ThemeSwitcher";
+import { ThemeMenu } from "../../src/components/ThemeMenu";
 import { ASH, fakeServices, renderWithServices, signIn } from "../helpers/services";
 
-describe("ThemeSwitcher", () => {
-  it("muestra el tema y el modo actuales", () => {
-    renderWithServices(<ThemeSwitcher />);
-    expect(screen.getByRole("combobox", { name: "Tema" })).toHaveValue("clasico");
-    expect(screen.getByRole("combobox", { name: "Modo" })).toHaveValue("auto");
+const openMenu = async () => userEvent.click(screen.getByRole("button", { name: "Apariencia" }));
+
+describe("ThemeMenu", () => {
+  it("empieza cerrado: solo se ve el botón de apariencia", () => {
+    renderWithServices(<ThemeMenu />);
+    const button = screen.getByRole("button", { name: "Apariencia" });
+    expect(button).toHaveAttribute("aria-expanded", "false");
+    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
+  });
+
+  it("al abrirlo muestra el tema y el modo actuales", async () => {
+    renderWithServices(<ThemeMenu />);
+    await openMenu();
+    expect(screen.getByRole("button", { name: "Apariencia" })).toHaveAttribute("aria-expanded", "true");
+    expect(screen.getByRole("radio", { name: "Clásico" })).toBeChecked();
+    expect(screen.getByRole("radio", { name: "Automático" })).toBeChecked();
   });
 
-  it("ofrece los dos temas y los tres modos en español", () => {
-    renderWithServices(<ThemeSwitcher />);
-    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
+  it("ofrece los dos temas y los tres modos en español, cada grupo con su nombre", async () => {
+    renderWithServices(<ThemeMenu />);
+    await openMenu();
+    expect(screen.getByRole("group", { name: "Tema" })).toBeInTheDocument();
+    expect(screen.getByRole("group", { name: "Modo" })).toBeInTheDocument();
+    expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("aria-label") ?? radio.closest("label")?.textContent)).toEqual([
       "Clásico",
       "Pokédex",
       "Automático",
@@ -25,25 +39,66 @@ describe("ThemeSwitcher", () => {
 
   it("al elegir otro tema lo aplica al documento", async () => {
     const services = fakeServices();
-    renderWithServices(<ThemeSwitcher />, { services });
-    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Tema" }), "pokedex");
+    renderWithServices(<ThemeMenu />, { services });
+    await openMenu();
+    await userEvent.click(screen.getByRole("radio", { name: "Pokédex" }));
     expect(services.themeRoot.dataset.theme).toBe("pokedex");
     expect(services.theme.getState().preference.theme).toBe("pokedex");
+    expect(screen.getByRole("radio", { name: "Pokédex" })).toBeChecked();
   });
 
   it("al elegir otro modo lo aplica al documento", async () => {
     const services = fakeServices();
-    renderWithServices(<ThemeSwitcher />, { services });
-    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Modo" }), "oscuro");
+    renderWithServices(<ThemeMenu />, { services });
+    await openMenu();
+    await userEvent.click(screen.getByRole("radio", { name: "Oscuro" }));
     expect(services.themeRoot.dataset.mode).toBe("oscuro");
   });
 
-  it("refleja un cambio de tema hecho desde fuera", () => {
+  it("refleja un cambio de tema hecho desde fuera", async () => {
     const services = fakeServices();
-    renderWithServices(<ThemeSwitcher />, { services });
+    renderWithServices(<ThemeMenu />, { services });
+    await openMenu();
     services.theme.getState().setTheme("pokedex");
-    // zustand notifica de forma síncrona; React vuelve a pintar en el siguiente ciclo
-    return screen.findByDisplayValue("Pokédex");
+    expect(await screen.findByRole("radio", { name: "Pokédex", checked: true })).toBeInTheDocument();
+  });
+
+  it("se puede cambiar con el teclado: las flechas mueven la selección entre los radios", async () => {
+    const services = fakeServices();
+    renderWithServices(<ThemeMenu />, { services });
+    await openMenu();
+    screen.getByRole("radio", { name: "Clásico" }).focus();
+    await userEvent.keyboard("{ArrowRight}");
+    expect(services.theme.getState().preference.theme).toBe("pokedex");
+  });
+
+  it("Escape lo cierra y devuelve el foco al botón", async () => {
+    renderWithServices(<ThemeMenu />);
+    await openMenu();
+    screen.getByRole("radio", { name: "Claro" }).focus();
+    await userEvent.keyboard("{Escape}");
+    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
+    expect(screen.getByRole("button", { name: "Apariencia" })).toHaveFocus();
+  });
+
+  it("un clic fuera lo cierra", async () => {
+    renderWithServices(
+      <>
+        <ThemeMenu />
+        <p>Otra parte de la página</p>
+      </>,
+    );
+    await openMenu();
+    await userEvent.click(screen.getByText("Otra parte de la página"));
+    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
+  });
+
+  it("el botón lo abre y lo cierra", async () => {
+    renderWithServices(<ThemeMenu />);
+    await openMenu();
+    expect(screen.getAllByRole("radio")).toHaveLength(5);
+    await openMenu();
+    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
   });
 });
 
@@ -72,19 +127,31 @@ describe("Header", () => {
     expect(screen.getByRole("link", { name: "Mi perfil" })).toHaveAttribute("href", "/perfil");
   });
 
+  it("con sesión muestra tu avatar, decorativo, junto al nombre", () => {
+    const services = fakeServices();
+    signIn(services);
+    renderWithServices(<Header />, { services });
+    expect(screen.getByText("AS")).toHaveAttribute("aria-hidden", "true");
+  });
+
   it("sin sesión no hay enlace al perfil", () => {
     renderWithServices(<Header />);
     expect(screen.queryByRole("link", { name: "Mi perfil" })).not.toBeInTheDocument();
   });
 
-  it("sin sesión no muestra usuario ni botón, pero sí el selector de tema", () => {
+  it("sin sesión no muestra usuario ni botón de cerrar sesión, pero sí el de apariencia", () => {
     renderWithServices(<Header />);
     expect(screen.queryByRole("button", { name: "Cerrar sesión" })).not.toBeInTheDocument();
-    expect(screen.getByRole("combobox", { name: "Tema" })).toBeInTheDocument();
+    expect(screen.getByRole("button", { name: "Apariencia" })).toBeInTheDocument();
   });
 
-  it("el título lleva al lobby", () => {
+  it("el logo lleva al lobby y su nombre accesible es el del juego (la bola es decorativa)", () => {
     renderWithServices(<Header />);
     expect(screen.getByRole("link", { name: "Pokémon Minigames" })).toHaveAttribute("href", "/");
   });
+
+  it("es un encabezado de la página (banner)", () => {
+    renderWithServices(<Header />);
+    expect(screen.getByRole("banner")).toBeInTheDocument();
+  });
 });
```

`client/test/components/app-shell.test.tsx` (el pie y la estructura de la aplicación):

```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../../src/App";
import { Footer } from "../../src/components/Footer";
import { renderWithServices } from "../helpers/services";

describe("Footer", () => {
  it("dice que es un proyecto de fans, de quién son las marcas y de dónde salen el arte y los datos", () => {
    renderWithServices(<Footer />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent("Proyecto de fans sin fines de lucro.");
    expect(footer).toHaveTextContent("Pokémon y sus personajes son marcas de Nintendo, Game Freak y The Pokémon Company; no hay relación con ellos.");
    expect(footer).toHaveTextContent("Arte y datos de PokeAPI.");
  });

  it("enlaza a PokeAPI sin dar al sitio acceso a esta ventana", () => {
    renderWithServices(<Footer />);
    const link = screen.getByRole("link", { name: "PokeAPI" });
    expect(link).toHaveAttribute("href", "https://pokeapi.co");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});

describe("estructura de la aplicación", () => {
  it("tiene encabezado, contenido principal y pie, y el contenido ocupa el espacio que sobra", () => {
    renderWithServices(<App />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(main.className).toContain("flex-1");
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
cd client && npx vitest run test/components/header-theme.test.tsx test/components/app-shell.test.tsx
```

Expected: FAIL — no existen `ThemeMenu` ni `Footer`.

- [ ] **Step 3: Implementar**

`client/src/components/ThemeMenu.tsx`:

```tsx
import { useEffect, useId, useRef, useState } from "react";
import { useServices, useTheme } from "../services";
import {
  MODE_LABELS,
  THEME_LABELS,
  THEME_MODES,
  THEME_NAMES,
  type ThemeMode,
  type ThemeName,
} from "../theme/theme-store";
import { Button } from "./Button";

function PaletteIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z" />
      <circle cx="7.5" cy="11" r="1" />
      <circle cx="11" cy="7.5" r="1" />
      <circle cx="16" cy="8" r="1" />
    </svg>
  );
}

interface SegmentedProps<T extends string> {
  legend: string;
  name: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange(value: T): void;
}

/** Opciones en una fila de botones: son radios de verdad, así que las flechas del teclado los recorren. */
function Segmented<T extends string>({ legend, name, options, labels, value, onChange }: SegmentedProps<T>) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-1 rounded-pill bg-surface-2 p-1">
        {options.map((option) => (
          <label key={option} className="cursor-pointer">
            <input type="radio" name={name} value={option} checked={value === option} onChange={() => onChange(option)} className="peer sr-only" />
            <span className="block rounded-pill px-3 py-1.5 text-sm font-semibold peer-checked:bg-accent peer-checked:text-accent-fg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
              {labels[option]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Elegir el tema visual (Clásico o Pokédex) y el modo (automático, claro u oscuro) desde un botón de paleta. */
export function ThemeMenu() {
  const { theme: store } = useServices();
  const theme = useTheme((s) => s.preference.theme);
  const mode = useTheme((s) => s.preference.mode);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      root.current?.querySelector("button")?.focus();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <Button variant="header" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen((current) => !current)}>
        <PaletteIcon />
        <span className="sr-only sm:not-sr-only">Apariencia</span>
      </Button>
      {open ? (
        <div id={panelId} className="framed absolute right-0 top-full z-30 mt-2 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-4 rounded-card bg-surface p-4 text-fg shadow-pop">
          <Segmented<ThemeName>
            legend="Tema"
            name="theme"
            options={THEME_NAMES}
            labels={THEME_LABELS}
            value={theme}
            onChange={(value) => store.getState().setTheme(value)}
          />
          <Segmented<ThemeMode>
            legend="Modo"
            name="mode"
            options={THEME_MODES}
            labels={MODE_LABELS}
            value={mode}
            onChange={(value) => store.getState().setMode(value)}
          />
        </div>
      ) : null}
    </div>
  );
}
```

`client/src/components/Footer.tsx`:

```tsx
/** Aviso de que es un proyecto de fans: el arte y las marcas son de sus dueños. */
export function Footer() {
  return (
    <footer className="mx-auto w-full max-w-5xl px-4 py-8 text-center text-xs text-muted">
      <p>
        Proyecto de fans sin fines de lucro. Pokémon y sus personajes son marcas de Nintendo, Game Freak y The Pokémon Company; no hay
        relación con ellos. Arte y datos de{" "}
        <a href="https://pokeapi.co" target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
          PokeAPI
        </a>
        .
      </p>
    </footer>
  );
}
```

`client/src/components/Header.tsx`:

```diff
diff --git a/client/src/components/Header.tsx b/client/src/components/Header.tsx
index 4c21305..9f3f0d6 100644
--- a/client/src/components/Header.tsx
+++ b/client/src/components/Header.tsx
@@ -1,28 +1,53 @@
 import { Link } from "react-router";
 import { useServices, useSession } from "../services";
+import { Avatar } from "./Avatar";
 import { Button } from "./Button";
-import { ThemeSwitcher } from "./ThemeSwitcher";
+import { Logo } from "./Logo";
+import { ThemeMenu } from "./ThemeMenu";
+
+function UserIcon() {
+  return (
+    <svg viewBox="0 0 24 24" className="size-5 sm:hidden" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
+      <circle cx="12" cy="8" r="4" />
+      <path d="M4 21a8 8 0 0 1 16 0" />
+    </svg>
+  );
+}
+
+function ExitIcon() {
+  return (
+    <svg viewBox="0 0 24 24" className="size-5 sm:hidden" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
+      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
+      <path d="m16 17 5-5-5-5M21 12H9" />
+    </svg>
+  );
+}
 
 export function Header() {
   const user = useSession((s) => s.user);
   const { session } = useServices();
 
   return (
-    <header className="border-b-(length:--frame) border-line bg-header text-header-fg">
-      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
-        <Link to="/" className="font-num text-lg font-medium">
-          Pokémon Minigames
+    <header className="sticky top-0 z-20 border-b-(length:--frame) border-line bg-header text-header-fg">
+      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2.5 sm:gap-3">
+        <Link to="/" className="rounded-ui">
+          <Logo hideNameOnMobile={Boolean(user)} />
         </Link>
-        <div className="ml-auto flex flex-wrap items-center gap-3">
-          <ThemeSwitcher />
+        <div className="ml-auto flex items-center gap-1 sm:gap-3">
+          <ThemeMenu />
           {user ? (
             <>
-              <Link to="/perfil" className="text-sm underline-offset-2 hover:underline">
-                Mi perfil
+              <Link to="/perfil" className="inline-flex items-center gap-2 rounded-pill px-2 py-1.5 text-sm font-semibold hover:bg-header-fg/15">
+                <UserIcon />
+                <span className="sr-only sm:not-sr-only">Mi perfil</span>
               </Link>
-              <span className="text-sm">{user.username}</span>
+              <span className="flex items-center gap-2">
+                <Avatar name={user.username} size="sm" />
+                <span className="hidden text-sm font-semibold sm:inline">{user.username}</span>
+              </span>
               <Button variant="header" onClick={() => void session.getState().logout()}>
-                Cerrar sesión
+                <ExitIcon />
+                <span className="sr-only sm:not-sr-only">Cerrar sesión</span>
               </Button>
             </>
           ) : null}
```

`client/src/components/Logo.tsx` (el nombre puede quedar solo para lectores de pantalla en móvil):

```diff
diff --git a/client/src/components/Logo.tsx b/client/src/components/Logo.tsx
index 42293cf..fbb2777 100644
--- a/client/src/components/Logo.tsx
+++ b/client/src/components/Logo.tsx
@@ -11,12 +11,15 @@ export function LogoMark({ size = 28, className = "" }: { size?: number; classNa
   );
 }
 
-/** La bola con el nombre del juego en la fuente de títulos. */
-export function Logo({ size = 30 }: { size?: number }) {
+/**
+ * La bola con el nombre del juego en la fuente de títulos. En pantallas estrechas el nombre puede quedar solo para los
+ * lectores de pantalla (`hideNameOnMobile`), para que quepan los botones.
+ */
+export function Logo({ size = 30, hideNameOnMobile = false }: { size?: number; hideNameOnMobile?: boolean }) {
   return (
     <span className="inline-flex items-center gap-2">
       <LogoMark size={size} />
-      <span className="font-display text-xl font-semibold tracking-tight">Pokémon Minigames</span>
+      <span className={`font-display text-xl font-semibold tracking-tight ${hideNameOnMobile ? "max-sm:sr-only" : ""}`}>Pokémon Minigames</span>
     </span>
   );
 }
```

`client/src/App.tsx`:

```diff
diff --git a/client/src/App.tsx b/client/src/App.tsx
index b767268..0f81f12 100644
--- a/client/src/App.tsx
+++ b/client/src/App.tsx
@@ -1,4 +1,5 @@
 import { useEffect } from "react";
+import { Footer } from "./components/Footer";
 import { Header } from "./components/Header";
 import { AppRoutes } from "./routes";
 import { useServices } from "./services";
@@ -12,11 +13,12 @@ export function App() {
   }, [session]);
 
   return (
-    <>
+    <div className="flex min-h-screen flex-col">
       <Header />
-      <main className="mx-auto max-w-5xl px-4 py-6">
+      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
         <AppRoutes />
       </main>
-    </>
+      <Footer />
+    </div>
   );
 }
```

Borrar el selector antiguo, que ya nadie usa:

```bash
git rm client/src/components/ThemeSwitcher.tsx
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
cd client && npx vitest run --testTimeout=30000 --maxWorkers=2
cd .. && npm run typecheck
```

Expected: PASS (todo el cliente: **561 pruebas**) y `tsc` sin errores. Con `npm run dev` y `npm run dev:client` ya puedes abrir `http://localhost:5173/login` y ver el encabezado, el fondo, el pie y el menú de apariencia en los dos temas.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): encabezado con avatar, menú de apariencia accesible y pie de proyecto de fans" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Tarjeta de Pokémon, marcadores y números animados

**Files:**
- Create: `client/src/components/AnimatedNumber.tsx`, `client/test/components/pokemon-card.test.tsx`
- Modify: `client/src/components/PokemonCard.tsx`, `client/src/components/Panels.tsx`

**Interfaces:**
- Consumes: `ArtImage`, `Avatar`, `Badge`, `Card`, `TypeChip`, `typeGradient`, `useCountUp`.
- Produces: `AnimatedNumber({ value })`; `PokemonCard({ pokemon, showStats?, size?: "sm" | "lg" })` — compacta (sprite de 96 px sobre un círculo con el color del primer tipo) o grande (arte oficial); las seis stats son barras decorativas (`data-stat-bar`, `aria-hidden`) proporcionales al valor con tope en 180 puntos, y los números siguen en `<dd>`; el nombre es un `h3` y `aria-label="N puntos en total"` se conserva. `TeamPanel` (región «Tu equipo») con el total grande animado y una miniatura por Pokémon; `OpponentPanel` (región «Tu rival») con avatar, total animado, cantidad de Pokémon y la etiqueta de peligro «Desconectado». Ningún marcador muestra nombres de los Pokémon del rival.

- [ ] **Step 1: Escribir la prueba que falla**

`client/test/components/pokemon-card.test.tsx`:

```tsx
import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimatedNumber } from "../../src/components/AnimatedNumber";
import { OpponentPanel, TeamPanel } from "../../src/components/Panels";
import { PokemonCard } from "../../src/components/PokemonCard";
import { typeGradient } from "../../src/theme/type-styles";
import { pokemon } from "../helpers/events";

/** jsdom normaliza los colores de los estilos en línea a rgb(): se compara en ese formato. */
const rgb = (hex: string): string => {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
};

describe("PokemonCard (etapa 6)", () => {
  it("la versión compacta usa el sprite pequeño, sin pedir el arte grande", () => {
    const { container } = render(<PokemonCard pokemon={pokemon(6, 534)} />);
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("src", "https://example.com/6.png");
    expect(img).toHaveAttribute("alt", "");
  });

  it("la versión grande usa el arte oficial", () => {
    const { container } = render(<PokemonCard pokemon={pokemon(6, 534)} size="lg" />);
    expect(container.querySelector("img")).toHaveAttribute("src", expect.stringContaining("/official-artwork/6.png"));
  });

  it("la imagen va sobre un círculo con el color del primer tipo", () => {
    const { container } = render(<PokemonCard pokemon={pokemon(6, 534)} />);
    const backdrop = container.querySelector("[data-backdrop]") as HTMLElement;
    expect(backdrop.style.background).toContain(rgb(typeGradient("fire").top));
  });

  it("es un artículo con el nombre como encabezado y los tipos como chips", () => {
    render(<PokemonCard pokemon={pokemon(6, 534, { names: { es: "Charizard", en: "Charizard" } })} />);
    const card = screen.getByRole("article");
    expect(within(card).getByRole("heading", { name: "Charizard" })).toBeInTheDocument();
    expect(card.querySelectorAll("[data-type]")).toHaveLength(2);
  });

  it("las seis stats son barras decorativas más el número, proporcionales al valor y con tope", () => {
    const { container } = render(
      <PokemonCard
        pokemon={pokemon(1, 600, { stats: { hp: 90, attack: 180, defense: 255, spAttack: 45, spDefense: 0, speed: 100 } })}
        showStats
      />,
    );
    const bars = [...container.querySelectorAll("[data-stat-bar]")] as HTMLElement[];
    expect(bars).toHaveLength(6);
    for (const bar of bars) expect(bar).toHaveAttribute("aria-hidden", "true");
    const widths = bars.map((bar) => Number.parseFloat(bar.style.width));
    expect(widths[0]).toBeCloseTo(50, 0); // 90 / 180
    expect(widths[1]).toBeCloseTo(100, 0); // 180 / 180
    expect(widths[2]).toBe(100); // 255: con tope
    expect(widths[4]).toBe(0);
    expect(screen.getByText("255")).toBeInTheDocument();
  });

  it("sin stats no hay barras", () => {
    const { container } = render(<PokemonCard pokemon={pokemon(1, 300)} />);
    expect(container.querySelector("[data-stat-bar]")).toBeNull();
  });
});

describe("AnimatedNumber", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("muestra el valor inicial sin animar y, al cambiar, llega exactamente al nuevo", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { rerender } = render(<AnimatedNumber value={0} />);
    expect(screen.getByText("0")).toBeInTheDocument();
    rerender(<AnimatedNumber value={400} />);
    act(() => void vi.advanceTimersByTime(700));
    expect(screen.getByText("400")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});

describe("marcadores (etapa 6)", () => {
  it("TeamPanel muestra el total grande, una miniatura de cada Pokémon y su nombre", () => {
    const { container } = render(<TeamPanel team={[pokemon(1, 500), pokemon(2, 300)]} total={800} />);
    const region = screen.getByRole("region", { name: "Tu equipo" });
    expect(region).toHaveTextContent("800");
    expect(container.querySelectorAll("img")).toHaveLength(2);
    expect(screen.getByText("Poke1")).toBeInTheDocument();
  });

  it("OpponentPanel lleva el avatar del rival, su total y nunca nombres de Pokémon", () => {
    render(<OpponentPanel name="misty" total={400} teamSize={2} connected />);
    const panel = screen.getByRole("region", { name: "Tu rival" });
    expect(panel).toHaveTextContent("misty");
    expect(panel).toHaveTextContent("400");
    expect(panel.querySelector("[aria-hidden='true']")).not.toBeNull();
    expect(panel.querySelectorAll("img")).toHaveLength(0);
  });

  it("el rival desconectado se marca con una etiqueta de peligro", () => {
    render(<OpponentPanel name="misty" total={300} teamSize={1} connected={false} />);
    expect(screen.getByText("Desconectado").className).toContain("bg-danger-bg");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
cd client && npx vitest run test/components/pokemon-card.test.tsx
```

Expected: FAIL — no existe `AnimatedNumber` y la tarjeta no tiene variante grande ni barras.

- [ ] **Step 3: Implementar**

`client/src/components/AnimatedNumber.tsx`:

```tsx
import { useCountUp } from "../game/motion";

/** Un número que sube o baja hasta su valor nuevo (y salta directo si la persona pidió «reducir movimiento»). */
export function AnimatedNumber({ value }: { value: number }) {
  return <>{useCountUp(value)}</>;
}
```

`client/src/components/PokemonCard.tsx`:

```diff
diff --git a/client/src/components/PokemonCard.tsx b/client/src/components/PokemonCard.tsx
index 8641218..c29a92f 100644
--- a/client/src/components/PokemonCard.tsx
+++ b/client/src/components/PokemonCard.tsx
@@ -1,41 +1,71 @@
 import type { BaseStats, PokemonView } from "@pokemon-minigames/shared";
 import { STAT_LABELS } from "../i18n/es";
+import { typeGradient } from "../theme/type-styles";
+import { ArtImage } from "./ArtImage";
+import { Card } from "./Card";
 import { TypeChip } from "./TypeChip";
 
+/** Las barras de las stats llegan al 100 % con 180 puntos (las de los Pokémon más fuertes); más no cabe. */
+const STAT_BAR_CAP = 180;
+
 export interface PokemonCardProps {
   pokemon: PokemonView;
-  /** Muestra las seis stats base (en el resumen final). */
+  /** Muestra las seis stats base como barras (en el resumen final). */
   showStats?: boolean;
+  /** `lg` usa el arte oficial grande; solo donde hay pocas tarjetas a la vez. */
+  size?: "sm" | "lg";
 }
 
-export function PokemonCard({ pokemon, showStats = false }: PokemonCardProps) {
+export function PokemonCard({ pokemon, showStats = false, size = "sm" }: PokemonCardProps) {
+  const large = size === "lg";
+  const { top, bottom } = typeGradient(pokemon.types[0]!);
+
   return (
-    <article className="framed rounded-card bg-surface p-3">
-      <div className="flex items-center gap-3">
-        <img src={pokemon.spriteUrl} alt="" width={56} height={56} loading="lazy" className="h-14 w-14 shrink-0" />
-        <div className="min-w-0">
-          <h3 className="truncate font-medium">{pokemon.names.es}</h3>
+    <Card as="article" className={large ? "p-5" : "p-3"}>
+      <div className={large ? "flex flex-col items-center gap-3 text-center" : "flex items-center gap-3"}>
+        <span
+          data-backdrop
+          style={{ background: `radial-gradient(circle at 30% 25%, ${top}, ${bottom})` }}
+          className={`inline-flex shrink-0 items-center justify-center rounded-full ${large ? "size-44" : "size-[72px]"}`}
+        >
+          <ArtImage id={pokemon.id} spriteUrl={pokemon.spriteUrl} size={large ? 144 : 64} variant={large ? "official" : "sprite"} className="rounded-full" />
+        </span>
+        <div className={large ? "min-w-0" : "min-w-0 flex-1"}>
+          <h3 className={`truncate font-display font-semibold ${large ? "text-xl" : "text-lg"}`}>{pokemon.names.es}</h3>
           <p className="truncate text-xs text-muted">{pokemon.names.en}</p>
-          <div className="mt-1 flex flex-wrap gap-1">
+          <div className={`mt-1.5 flex flex-wrap gap-1 ${large ? "justify-center" : ""}`}>
             {pokemon.types.map((type) => (
               <TypeChip key={type} type={type} />
             ))}
           </div>
         </div>
-        <p className="ml-auto font-num text-lg tabular-nums" aria-label={`${pokemon.totalStats} puntos en total`}>
+        <p
+          className={`font-num font-semibold tabular-nums ${large ? "text-3xl" : "ml-auto text-2xl"}`}
+          aria-label={`${pokemon.totalStats} puntos en total`}
+        >
           {pokemon.totalStats}
         </p>
       </div>
       {showStats ? (
-        <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
+        <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
           {(Object.keys(STAT_LABELS) as (keyof BaseStats)[]).map((stat) => (
-            <div key={stat} className="flex justify-between gap-1">
-              <dt className="text-muted">{STAT_LABELS[stat]}</dt>
-              <dd className="font-num tabular-nums">{pokemon.stats[stat]}</dd>
+            <div key={stat}>
+              <div className="flex justify-between gap-1">
+                <dt className="text-muted">{STAT_LABELS[stat]}</dt>
+                <dd className="font-num font-semibold tabular-nums">{pokemon.stats[stat]}</dd>
+              </div>
+              <div aria-hidden="true" className="mt-0.5 h-1.5 overflow-hidden rounded-pill bg-surface-2">
+                <div
+                  data-stat-bar
+                  aria-hidden="true"
+                  style={{ width: `${Math.min(100, (pokemon.stats[stat] / STAT_BAR_CAP) * 100)}%` }}
+                  className="h-full rounded-pill bg-accent-2"
+                />
+              </div>
             </div>
           ))}
         </dl>
       ) : null}
-    </article>
+    </Card>
   );
 }
```

`client/src/components/Panels.tsx`:

```diff
diff --git a/client/src/components/Panels.tsx b/client/src/components/Panels.tsx
index 95e8d8e..6e24528 100644
--- a/client/src/components/Panels.tsx
+++ b/client/src/components/Panels.tsx
@@ -1,24 +1,32 @@
 import type { PokemonView } from "@pokemon-minigames/shared";
+import { AnimatedNumber } from "./AnimatedNumber";
+import { ArtImage } from "./ArtImage";
+import { Avatar } from "./Avatar";
+import { Badge } from "./Badge";
+import { Card } from "./Card";
 
 /** Tu equipo: lo que has ganado hasta ahora y su total. */
 export function TeamPanel({ team, total }: { team: PokemonView[]; total: number }) {
   return (
-    <section aria-label="Tu equipo" className="framed rounded-card bg-surface p-3">
-      <h2 className="text-xs text-muted">Tu equipo</h2>
-      <p className="font-num text-2xl font-medium tabular-nums">{total}</p>
+    <Card as="section" aria-label="Tu equipo" className="p-4">
+      <h2 className="text-sm font-semibold text-muted">Tu equipo</h2>
+      <p className="font-num text-4xl font-semibold tabular-nums">
+        <AnimatedNumber value={total} />
+      </p>
       {team.length === 0 ? (
         <p className="mt-2 text-sm text-muted">Todavía no tienes Pokémon.</p>
       ) : (
-        <ul className="mt-2 flex flex-col gap-1 text-sm">
+        <ul className="mt-3 flex flex-col gap-1.5 text-sm">
           {team.map((pokemon) => (
-            <li key={pokemon.id} className="flex items-center justify-between gap-2">
-              <span className="truncate">{pokemon.names.es}</span>
+            <li key={pokemon.id} className="flex items-center gap-2">
+              <ArtImage id={pokemon.id} spriteUrl={pokemon.spriteUrl} size={32} variant="sprite" />
+              <span className="min-w-0 flex-1 truncate font-semibold">{pokemon.names.es}</span>
               <span className="font-num tabular-nums text-muted">{pokemon.totalStats}</span>
             </li>
           ))}
         </ul>
       )}
-    </section>
+    </Card>
   );
 }
 
@@ -35,14 +43,21 @@ export function OpponentPanel({
   connected: boolean;
 }) {
   return (
-    <section aria-label="Tu rival" className="framed rounded-card bg-surface p-3">
-      <h2 className="truncate text-xs text-muted">{name}</h2>
-      <p className="font-num text-2xl font-medium tabular-nums">{total}</p>
-      <p className="mt-2 text-sm">
-        {teamSize === 1 ? "1 Pokémon" : `${teamSize} Pokémon`}
+    <Card as="section" aria-label="Tu rival" className="p-4">
+      <div className="flex items-center gap-2">
+        <Avatar name={name} size="sm" />
+        <h2 className="truncate text-sm font-semibold text-muted">{name}</h2>
+      </div>
+      <p className="mt-2 font-num text-4xl font-semibold tabular-nums">
+        <AnimatedNumber value={total} />
       </p>
+      <p className="mt-2 text-sm font-semibold">{teamSize === 1 ? "1 Pokémon" : `${teamSize} Pokémon`}</p>
       <p className="mt-1 text-xs text-muted">Sus nombres se revelan al cerrar la ronda.</p>
-      {connected ? null : <p className="mt-1 text-xs text-danger">Desconectado</p>}
-    </section>
+      {connected ? null : (
+        <Badge tone="danger" className="mt-2">
+          Desconectado
+        </Badge>
+      )}
+    </Card>
   );
 }
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
cd client && npx vitest run --testTimeout=30000 --maxWorkers=2
cd .. && npm run typecheck
```

Expected: PASS (todo el cliente: **571 pruebas**) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): tarjeta de Pokémon con arte y barras de stats, y marcadores con números animados" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Pantallas de acceso y registro

**Files:**
- Create: `client/src/pages/AuthHero.tsx`, `client/test/pages/auth-hero.test.tsx`
- Modify: `client/src/pages/AuthForm.tsx`, `client/src/pages/AuthPages.tsx`

**Interfaces:**
- Consumes: `Card`, `Button`, `LogoMark`, `TypeChip`.
- Produces: `AuthHero()` — el lema «Nombra el Pokémon, gana más stats.», la lista «Cómo se juega» (3 pasos; solo en pantallas anchas) y una tarjeta de ejemplo decorativa (`data-preview`, `aria-hidden`, con dos chips de tipo); `AuthLayout` (dentro de `AuthPages.tsx`) pone el lema a un lado y el formulario al otro (uno encima del otro en móvil, donde solo queda el lema). `AuthForm` pasa a una tarjeta elevada con el botón grande; sus campos, mensajes de error, límites de intentos y textos no cambian.

- [ ] **Step 1: Escribir la prueba que falla**

`client/test/pages/auth-hero.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoginPage, RegisterPage } from "../../src/pages/AuthPages";
import { renderWithServices } from "../helpers/services";

describe("pantallas de acceso (etapa 6)", () => {
  it.each([
    ["inicio de sesión", <LoginPage key="l" />, "Iniciar sesión"],
    ["registro", <RegisterPage key="r" />, "Crear cuenta"],
  ])("%s: junto al formulario hay un lema y una explicación breve de cómo se juega", (_name, page, heading) => {
    renderWithServices(page);
    expect(screen.getByText(/Nombra el Pokémon,/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    const steps = screen.getByRole("list", { name: "Cómo se juega" });
    expect(within(steps).getAllByRole("listitem")).toHaveLength(3);
    expect(steps).toHaveTextContent("15 segundos");
    expect(steps).toHaveTextContent("más stats");
  });

  it("la tarjeta de ejemplo es decorativa: la ocultan los lectores de pantalla y lleva dos tipos de muestra", () => {
    const { container } = renderWithServices(<LoginPage />);
    const preview = container.querySelector("[data-preview]")!;
    expect(preview).toHaveAttribute("aria-hidden", "true");
    expect(preview.querySelectorAll("[data-type]")).toHaveLength(2);
  });

  it("el formulario está en una tarjeta elevada y conserva sus campos y su botón", () => {
    renderWithServices(<LoginPage />);
    const card = screen.getByRole("heading", { name: "Iniciar sesión" }).closest("section")!;
    expect(card.className).toContain("shadow-pop");
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Crea una" })).toHaveAttribute("href", "/registro");
  });

  it("la explicación larga se oculta en pantallas estrechas; el lema se queda", () => {
    renderWithServices(<LoginPage />);
    const steps = screen.getByRole("list", { name: "Cómo se juega" });
    expect(steps.parentElement!.className).toContain("hidden");
    expect(steps.parentElement!.className).toContain("md:block");
    expect(screen.getByText(/Nombra el Pokémon,/).closest("[class*='hidden']")).toBeNull();
  });

  it("no añade avisos de estado que se mezclen con los del formulario", () => {
    renderWithServices(<LoginPage />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
cd client && npx vitest run test/pages/auth-hero.test.tsx
```

Expected: FAIL — las pantallas de acceso todavía no tienen el lema ni la explicación.

- [ ] **Step 3: Implementar**

`client/src/pages/AuthHero.tsx`:

```tsx
import { Card } from "../components/Card";
import { LogoMark } from "../components/Logo";
import { TypeChip } from "../components/TypeChip";

const STEPS = [
  "Aparece un par de tipos, por ejemplo veneno y acero.",
  "Tienes 15 segundos para nombrar un Pokémon que tenga los dos.",
  "Gana quien sume más stats al final de la partida.",
] as const;

/**
 * La parte de la izquierda de las pantallas de acceso: el lema, cómo se juega y una tarjeta de ejemplo. En pantallas
 * estrechas solo queda el lema, para que el formulario esté a la vista.
 */
export function AuthHero() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <LogoMark size={64} className="animate-beat" />
        <p className="font-display text-3xl font-semibold leading-tight sm:text-4xl">
          Nombra el Pokémon, <span className="text-accent">gana más stats.</span>
        </p>
      </div>

      <div className="hidden md:block">
        <ol aria-label="Cómo se juega" role="list" className="flex flex-col gap-3">
          {STEPS.map((text, index) => (
            <li key={text} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent font-display text-sm font-semibold text-accent-fg"
              >
                {index + 1}
              </span>
              <span className="pt-0.5">{text}</span>
            </li>
          ))}
        </ol>
      </div>

      <div data-preview aria-hidden="true" className="hidden md:block">
        <Card tone="raised" className="max-w-sm p-5 md:-rotate-1">
          <p className="text-xs font-semibold text-muted">Ronda 2 de 3</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <TypeChip type="poison" size="lg" />
            <span className="font-display text-xl font-semibold text-muted">+</span>
            <TypeChip type="steel" size="lg" />
          </div>
          <div className="framed mt-4 rounded-ui bg-surface-2 px-4 py-3 text-muted">Escribe un Pokémon…</div>
        </Card>
      </div>
    </div>
  );
}
```

`client/src/pages/AuthPages.tsx`:

```diff
diff --git a/client/src/pages/AuthPages.tsx b/client/src/pages/AuthPages.tsx
index bce68a3..fb00cdf 100644
--- a/client/src/pages/AuthPages.tsx
+++ b/client/src/pages/AuthPages.tsx
@@ -1,6 +1,8 @@
+import type { ReactNode } from "react";
 import { Link, useLocation, useNavigate } from "react-router";
 import { useServices } from "../services";
 import { AuthForm } from "./AuthForm";
+import { AuthHero } from "./AuthHero";
 import { validateLogin, validateRegistration } from "./auth-validation";
 
 /** A dónde volver tras iniciar sesión: la pantalla que se intentó abrir, o el lobby. */
@@ -9,29 +11,41 @@ function useReturnPath(): string {
   return state?.from?.pathname ?? "/";
 }
 
+/** El lema y la explicación a un lado y el formulario al otro (uno encima del otro en pantallas estrechas). */
+function AuthLayout({ children }: { children: ReactNode }) {
+  return (
+    <div className="mx-auto grid max-w-4xl items-center gap-8 md:grid-cols-2 md:gap-12">
+      <AuthHero />
+      {children}
+    </div>
+  );
+}
+
 export function LoginPage() {
   const { session } = useServices();
   const navigate = useNavigate();
   const returnTo = useReturnPath();
 
   return (
-    <AuthForm
-      title="Iniciar sesión"
-      submitLabel="Entrar"
-      validate={validateLogin}
-      onSubmit={async ({ email, password }) => {
-        await session.getState().login({ email, password });
-        navigate(returnTo, { replace: true });
-      }}
-      footer={
-        <>
-          ¿No tienes cuenta?{" "}
-          <Link to="/registro" className="text-accent underline">
-            Crea una
-          </Link>
-        </>
-      }
-    />
+    <AuthLayout>
+      <AuthForm
+        title="Iniciar sesión"
+        submitLabel="Entrar"
+        validate={validateLogin}
+        onSubmit={async ({ email, password }) => {
+          await session.getState().login({ email, password });
+          navigate(returnTo, { replace: true });
+        }}
+        footer={
+          <>
+            ¿No tienes cuenta?{" "}
+            <Link to="/registro" className="font-semibold text-accent underline">
+              Crea una
+            </Link>
+          </>
+        }
+      />
+    </AuthLayout>
   );
 }
 
@@ -40,23 +54,25 @@ export function RegisterPage() {
   const navigate = useNavigate();
 
   return (
-    <AuthForm
-      title="Crear cuenta"
-      submitLabel="Crear cuenta"
-      withUsername
-      validate={validateRegistration}
-      onSubmit={async ({ email, username, password }) => {
-        await session.getState().register({ email, username, password });
-        navigate("/", { replace: true });
-      }}
-      footer={
-        <>
-          ¿Ya tienes cuenta?{" "}
-          <Link to="/login" className="text-accent underline">
-            Inicia sesión
-          </Link>
-        </>
-      }
-    />
+    <AuthLayout>
+      <AuthForm
+        title="Crear cuenta"
+        submitLabel="Crear cuenta"
+        withUsername
+        validate={validateRegistration}
+        onSubmit={async ({ email, username, password }) => {
+          await session.getState().register({ email, username, password });
+          navigate("/", { replace: true });
+        }}
+        footer={
+          <>
+            ¿Ya tienes cuenta?{" "}
+            <Link to="/login" className="font-semibold text-accent underline">
+              Inicia sesión
+            </Link>
+          </>
+        }
+      />
+    </AuthLayout>
   );
 }
```

`client/src/pages/AuthForm.tsx`:

```diff
diff --git a/client/src/pages/AuthForm.tsx b/client/src/pages/AuthForm.tsx
index 18386ec..26b20d4 100644
--- a/client/src/pages/AuthForm.tsx
+++ b/client/src/pages/AuthForm.tsx
@@ -1,6 +1,7 @@
 import { type FormEvent, type ReactNode, useState } from "react";
 import { ApiError } from "../api/client";
 import { Button } from "../components/Button";
+import { Card } from "../components/Card";
 import { Notice } from "../components/Notice";
 import { TextField } from "../components/TextField";
 import { errorMessage, rateLimitMessage, retryAfterOf } from "../i18n/es";
@@ -54,9 +55,9 @@ export function AuthForm({ title, submitLabel, withUsername = false, validate, o
   }
 
   return (
-    <section className="mx-auto max-w-sm">
-      <h1 className="mb-4 text-xl font-medium">{title}</h1>
-      <form onSubmit={handleSubmit} noValidate className="framed flex flex-col gap-4 rounded-card bg-surface p-4">
+    <Card as="section" tone="raised" className="mx-auto w-full max-w-sm p-6">
+      <h1 className="mb-5 font-display text-2xl font-semibold">{title}</h1>
+      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
         {formError ? <Notice tone="danger">{formError}</Notice> : null}
         <TextField
           label="Email"
@@ -85,11 +86,11 @@ export function AuthForm({ title, submitLabel, withUsername = false, validate, o
           error={errors.password}
           hint={withUsername ? "Mínimo 8 caracteres." : undefined}
         />
-        <Button type="submit" variant="primary" loading={submitting}>
+        <Button type="submit" variant="primary" size="lg" loading={submitting}>
           {submitLabel}
         </Button>
       </form>
-      <p className="mt-4 text-sm text-muted">{footer}</p>
-    </section>
+      <p className="mt-5 border-t-(length:--frame) border-line pt-4 text-sm text-muted">{footer}</p>
+    </Card>
   );
 }
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
cd client && npx vitest run --testTimeout=30000 --maxWorkers=2
cd .. && npm run typecheck
```

Expected: PASS (todo el cliente: **577 pruebas**) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): pantallas de acceso con lema, cómo se juega y tarjeta de ejemplo" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Lobby

**Files:**
- Create: `client/test/pages/lobby-design.test.tsx`
- Modify: `client/src/pages/Lobby.tsx`, `client/src/components/TextField.tsx`

**Interfaces:**
- Consumes: `Card`, `Button`, `Notice` (con `action`), `TextField`, `useSession`.
- Produces: `TextField` gana `inputClassName?` (clases extra para el campo). El lobby saluda con «Hola, {usuario}» y conserva el título «Lobby»; «Crear sala» y «Unirse a una sala» son dos tarjetas con su icono decorativo; los modos de tipos son tarjetas seleccionables (`input type="radio"` real con `peer sr-only`, borde y marca de selección `[data-check]`); el largo de la partida sigue siendo un `<select>` con su etiqueta, ahora con una flecha propia (`appearance-none`); el código de sala es un campo grande, monoespaciado, centrado y en mayúsculas; los dos botones de acción son grandes.

- [ ] **Step 1: Escribir la prueba que falla**

`client/test/pages/lobby-design.test.tsx` (las pruebas de `lobby.test.tsx` siguen valiendo y no se tocan):

```tsx
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LobbyPage } from "../../src/pages/Lobby";
import { ASH, fakeServices, renderWithServices, signIn } from "../helpers/services";

function renderSignedIn() {
  const services = fakeServices();
  signIn(services);
  return renderWithServices(<LobbyPage />, { services });
}

describe("lobby (etapa 6)", () => {
  it("saluda a la persona por su nombre y conserva el título «Lobby»", () => {
    renderSignedIn();
    expect(screen.getByText(`Hola, ${ASH.username}`)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Lobby" })).toBeInTheDocument();
  });

  it("sin sesión (no debería pasar) no saluda a nadie", () => {
    renderWithServices(<LobbyPage />);
    expect(screen.queryByText(/^Hola,/)).not.toBeInTheDocument();
  });

  it("«Crear sala» y «Unirse a una sala» son dos tarjetas con su icono decorativo", () => {
    renderSignedIn();
    for (const name of ["Crear sala", "Unirse a una sala"]) {
      const section = screen.getByRole("heading", { level: 2, name }).closest("section")!;
      expect(section.className).toContain("shadow-card");
      expect(section.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    }
  });

  it("los modos de tipos son tarjetas seleccionables: radios de verdad con su marca de selección", async () => {
    renderSignedIn();
    const random = screen.getByRole("radio", { name: /Aleatorio/ });
    const chosen = screen.getByRole("radio", { name: /Elegido/ });
    expect(random).toBeChecked();
    expect(random.className).toContain("peer");
    expect(random.className).toContain("sr-only");
    expect(random.closest("label")!.querySelector("[data-check]")).not.toBeNull();
    await userEvent.click(chosen);
    expect(chosen).toBeChecked();
    expect(random).not.toBeChecked();
  });

  it("el largo de la partida sigue siendo un selector con su etiqueta, ahora con una flecha decorativa", () => {
    renderSignedIn();
    const select = screen.getByLabelText("Largo de la partida");
    expect(select.tagName).toBe("SELECT");
    expect(select.className).toContain("appearance-none");
    expect(select.parentElement!.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });

  it("el código de sala es un campo grande, monoespaciado, centrado y en mayúsculas", () => {
    renderSignedIn();
    const className = screen.getByLabelText("Código de sala").className;
    expect(className).toContain("font-num");
    expect(className).toContain("uppercase");
    expect(className).toContain("tracking-");
    expect(className).toContain("text-center");
  });

  it("los dos botones de acción son grandes", () => {
    renderSignedIn();
    expect(screen.getByRole("button", { name: "Crear sala" }).className).toContain("py-3");
    expect(screen.getByRole("button", { name: "Unirse" }).className).toContain("py-3");
  });

  it("las dos tarjetas conviven en la misma cuadrícula", () => {
    renderSignedIn();
    const grid = screen.getByRole("heading", { level: 2, name: "Crear sala" }).closest("section")!.parentElement!;
    expect(within(grid).getAllByRole("heading", { level: 2 })).toHaveLength(2);
    expect(grid.className).toContain("md:grid-cols-2");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
cd client && npx vitest run test/pages/lobby-design.test.tsx
```

Expected: FAIL — no hay saludo, ni marca de selección, ni flecha, ni estilo del código.

- [ ] **Step 3: Implementar**

`client/src/components/TextField.tsx`:

```diff
diff --git a/client/src/components/TextField.tsx b/client/src/components/TextField.tsx
index cea417b..4b13dc5 100644
--- a/client/src/components/TextField.tsx
+++ b/client/src/components/TextField.tsx
@@ -2,12 +2,14 @@ import { type InputHTMLAttributes, type ReactNode, useId } from "react";
 
 export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
   label: string;
+  /** Clases extra para el campo (p. ej. el código de sala, grande y espaciado). */
+  inputClassName?: string;
   error?: string | null;
   hint?: ReactNode;
 }
 
 /** Campo con su etiqueta y su mensaje de error, bien asociados para lectores de pantalla. */
-export function TextField({ label, error, hint, id, ...input }: TextFieldProps) {
+export function TextField({ label, error, hint, id, inputClassName = "", ...input }: TextFieldProps) {
   const autoId = useId();
   const fieldId = id ?? autoId;
   const errorId = `${fieldId}-error`;
@@ -22,7 +24,7 @@ export function TextField({ label, error, hint, id, ...input }: TextFieldProps)
         id={fieldId}
         aria-invalid={error ? true : undefined}
         aria-describedby={[error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined}
-        className="framed w-full rounded-ui bg-surface px-4 py-3 text-fg transition-shadow duration-(--dur-fast) placeholder:text-muted focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_25%,transparent)]"
+        className={`framed w-full rounded-ui bg-surface px-4 py-3 text-fg transition-shadow duration-(--dur-fast) placeholder:text-muted focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_25%,transparent)] ${inputClassName}`}
         {...input}
       />
       {hint ? (
```

`client/src/pages/Lobby.tsx`:

```diff
diff --git a/client/src/pages/Lobby.tsx b/client/src/pages/Lobby.tsx
index 422a905..72974ee 100644
--- a/client/src/pages/Lobby.tsx
+++ b/client/src/pages/Lobby.tsx
@@ -1,13 +1,14 @@
 import type { RoomConfig, TypeMode } from "@pokemon-minigames/shared";
-import { type FormEvent, useEffect, useState } from "react";
+import { type FormEvent, type ReactNode, useEffect, useState } from "react";
 import { useLocation, useNavigate } from "react-router";
 import { ApiError } from "../api/client";
 import type { CurrentRoom } from "../api/endpoints";
 import { Button } from "../components/Button";
+import { Card } from "../components/Card";
 import { Notice } from "../components/Notice";
 import { TextField } from "../components/TextField";
 import { errorMessage } from "../i18n/es";
-import { useServices } from "../services";
+import { useServices, useSession } from "../services";
 import {
   type CreateRoomForm,
   DEFAULT_FORM,
@@ -19,6 +20,54 @@ import {
 
 const shownError = (error: unknown): string => (error instanceof ApiError ? error.message : errorMessage(undefined));
 
+const ICON = "size-5";
+const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
+
+function PlusIcon() {
+  return (
+    <svg viewBox="0 0 24 24" className={ICON} aria-hidden="true" focusable="false" {...STROKE}>
+      <path d="M12 5v14M5 12h14" />
+    </svg>
+  );
+}
+
+function EnterIcon() {
+  return (
+    <svg viewBox="0 0 24 24" className={ICON} aria-hidden="true" focusable="false" {...STROKE}>
+      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
+    </svg>
+  );
+}
+
+function ChevronIcon() {
+  return (
+    <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden="true" focusable="false" {...STROKE}>
+      <path d="m6 9 6 6 6-6" />
+    </svg>
+  );
+}
+
+function CheckIcon() {
+  return (
+    <svg data-check viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0 text-accent opacity-0 transition-opacity duration-(--dur-fast)" aria-hidden="true" focusable="false" {...STROKE}>
+      <circle cx="12" cy="12" r="9" />
+      <path d="m8 12.5 2.8 2.8L16 9.6" />
+    </svg>
+  );
+}
+
+/** El título de una tarjeta del lobby, con su icono en un círculo de color. */
+function CardTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
+  return (
+    <div className="mb-5 flex items-center gap-3">
+      <span aria-hidden="true" className="inline-flex size-10 items-center justify-center rounded-pill bg-accent text-accent-fg">
+        {icon}
+      </span>
+      <h2 className="font-display text-xl font-semibold">{children}</h2>
+    </div>
+  );
+}
+
 /** Si el usuario ya está en una partida (o dejó una sala abierta), ofrece volver a ella. */
 function ResumeBanner() {
   const { endpoints } = useServices();
@@ -85,50 +134,56 @@ function CreateRoomCard({ initial }: { initial?: RoomConfig }) {
   }
 
   return (
-    <section className="framed rounded-card bg-surface p-4">
-      <h2 className="mb-3 text-lg font-medium">Crear sala</h2>
-      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
+    <Card as="section" className="p-6">
+      <CardTitle icon={<PlusIcon />}>Crear sala</CardTitle>
+      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
         {formError ? <Notice tone="danger">{formError}</Notice> : null}
 
         <fieldset className="flex flex-col gap-2">
-          <legend className="mb-1 text-sm font-medium">Modo de tipos</legend>
+          <legend className="mb-1.5 text-sm font-semibold">Modo de tipos</legend>
           {TYPE_MODE_OPTIONS.map((option) => (
-            <label key={option.value} className="flex items-start gap-2 text-sm">
+            <label key={option.value} className="block cursor-pointer">
               <input
                 type="radio"
                 name="typeMode"
                 value={option.value}
                 checked={form.typeMode === option.value}
                 onChange={() => setForm({ ...form, typeMode: option.value })}
-                className="mt-1"
+                className="peer sr-only"
               />
-              <span>
-                <span className="font-medium">{option.label}</span>
-                <span className="block text-muted">{option.hint}</span>
+              <span className="framed flex items-start gap-3 rounded-ui bg-surface px-4 py-3 transition-shadow duration-(--dur-fast) peer-checked:border-accent peer-checked:shadow-[0_0_0_3px_var(--accent)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-checked:[&_[data-check]]:opacity-100">
+                <span className="min-w-0 flex-1">
+                  <span className="font-display font-semibold">{option.label}</span>
+                  <span className="block text-sm text-muted">{option.hint}</span>
+                </span>
+                <CheckIcon />
               </span>
             </label>
           ))}
         </fieldset>
 
         <div>
-          <label htmlFor="length" className="mb-1 block text-sm font-medium">
+          <label htmlFor="length" className="mb-1.5 block text-sm font-semibold">
             Largo de la partida
           </label>
-          <select
-            id="length"
-            value={form.lengthKind}
-            onChange={(event) => {
-              setForm({ ...form, lengthKind: event.target.value as LengthKind });
-              setFieldError(null);
-            }}
-            className="framed w-full rounded-ui bg-surface px-3 py-2 text-fg"
-          >
-            {(Object.keys(LENGTH_LABELS) as LengthKind[]).map((kind) => (
-              <option key={kind} value={kind}>
-                {LENGTH_LABELS[kind]}
-              </option>
-            ))}
-          </select>
+          <div className="relative">
+            <select
+              id="length"
+              value={form.lengthKind}
+              onChange={(event) => {
+                setForm({ ...form, lengthKind: event.target.value as LengthKind });
+                setFieldError(null);
+              }}
+              className="framed w-full appearance-none rounded-ui bg-surface px-4 py-3 pr-10 text-fg"
+            >
+              {(Object.keys(LENGTH_LABELS) as LengthKind[]).map((kind) => (
+                <option key={kind} value={kind}>
+                  {LENGTH_LABELS[kind]}
+                </option>
+              ))}
+            </select>
+            <ChevronIcon />
+          </div>
         </div>
 
         {form.lengthKind === "custom-rounds" ? (
@@ -152,11 +207,11 @@ function CreateRoomCard({ initial }: { initial?: RoomConfig }) {
           />
         ) : null}
 
-        <Button type="submit" variant="primary" loading={submitting}>
+        <Button type="submit" variant="primary" size="lg" loading={submitting}>
           Crear sala
         </Button>
       </form>
-    </section>
+    </Card>
   );
 }
 
@@ -189,9 +244,9 @@ function JoinRoomCard() {
   }
 
   return (
-    <section className="framed rounded-card bg-surface p-4">
-      <h2 className="mb-3 text-lg font-medium">Unirse a una sala</h2>
-      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
+    <Card as="section" className="p-6">
+      <CardTitle icon={<EnterIcon />}>Unirse a una sala</CardTitle>
+      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
         {formError ? <Notice tone="danger">{formError}</Notice> : null}
         <TextField
           label="Código de sala"
@@ -199,6 +254,7 @@ function JoinRoomCard() {
           maxLength={10}
           autoComplete="off"
           autoCapitalize="characters"
+          inputClassName="font-num text-center text-2xl uppercase tracking-[0.3em]"
           onChange={(event) => {
             setCode(event.target.value);
             setError(null);
@@ -206,20 +262,24 @@ function JoinRoomCard() {
           error={error}
           hint="Te lo da quien creó la sala."
         />
-        <Button type="submit" loading={submitting}>
+        <Button type="submit" size="lg" loading={submitting}>
           Unirse
         </Button>
       </form>
-    </section>
+    </Card>
   );
 }
 
 export function LobbyPage() {
   const state = useLocation().state as { config?: RoomConfig } | null;
+  const user = useSession((s) => s.user);
 
   return (
     <div className="flex flex-col gap-6">
-      <h1 className="text-xl font-medium">Lobby</h1>
+      <div>
+        {user ? <p className="text-sm font-semibold text-muted">Hola, {user.username}</p> : null}
+        <h1 className="font-display text-3xl font-semibold">Lobby</h1>
+      </div>
       <ResumeBanner />
       <div className="grid gap-6 md:grid-cols-2">
         <CreateRoomCard initial={state?.config} />
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
cd client && npx vitest run --testTimeout=30000 --maxWorkers=2
cd .. && npm run typecheck
```

Expected: PASS (todo el cliente: **585 pruebas**) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): lobby con tarjetas, modos seleccionables y código de sala grande" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Sala de espera, cuenta atrás y elegir tipo

**Files:**
- Create: `client/test/helpers/room.tsx`, `client/test/pages/room-before-game.test.tsx`
- Modify: `client/src/pages/room/WaitingView.tsx`, `client/src/pages/room/CountdownView.tsx`, `client/src/pages/room/TypePickerView.tsx`

**Interfaces:**
- Consumes: `Card`, `Avatar`, `Button`, `Timer` (con `size` y `urgentAtMs`), `typeChipStyle`.
- Produces (ayudantes de prueba, `client/test/helpers/room.tsx`, que usan también las Tasks 11, 12 y 14): `ash()`, `misty()`, `roundState()`, `renderRoom(events, services?)` y `serverSends(services, event)`. Sala de espera: el código en casillas (una por letra; el contenedor conserva `aria-label="Código de la sala"` y su texto), los jugadores con avatar y, mientras falta el rival, un hueco que palpita (`data-empty-seat`, decorativo). Cuenta atrás: los dos avatares con un «VS» decorativo y el anillo de 160 px sin el rojo final. Elegir tipo: los 18 tipos como teselas con relieve (`data-type`, `data-chosen` en la elegida).

- [ ] **Step 1: Escribir las pruebas que fallan**

`client/test/helpers/room.tsx` (los ayudantes que repetían las pruebas de la sala):

```tsx
import type { ServerEvent } from "@pokemon-minigames/shared";
import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RoomPage } from "../../src/pages/room/RoomPage";
import { SERVER_NOW } from "./events";
import { type FakeServices, fakeServices, renderRoute } from "./services";

export const ash = (extra: object = {}) => ({ seat: 1 as const, username: "ash", connected: true, totalStats: 0, teamSize: 0, ...extra });
export const misty = (extra: object = {}) => ({ seat: 2 as const, username: "misty", connected: true, totalStats: 0, teamSize: 0, ...extra });

export const roundState = (overrides: object = {}) => ({
  number: 1,
  pair: ["flying", "fire"] as ["flying", "fire"],
  deadline: SERVER_NOW + 15_000,
  answered: false,
  typeChosen: false,
  ...overrides,
});

/** La pantalla de la sala con los eventos del servidor ya recibidos. */
export function renderRoom(events: ServerEvent[] = [], services: FakeServices = fakeServices()) {
  for (const e of events) services.game.store.getState().receive(e, SERVER_NOW);
  const utils = renderRoute("/sala/:code", <RoomPage />, { services, route: "/sala/ABC234" });
  return { user: userEvent.setup(), ...utils };
}

/** Recibir un evento del servidor con la pantalla ya abierta. */
export const serverSends = (services: FakeServices, e: ServerEvent) => act(() => services.game.store.getState().receive(e, SERVER_NOW));
```

`client/test/pages/room-before-game.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SERVER_NOW, event } from "../helpers/events";
import { ash, misty, renderRoom, roundState } from "../helpers/room";

describe("sala de espera (etapa 6)", () => {
  const alone = () => event.roomState({ phase: "waiting", players: [ash()] });

  it("el código va en casillas, una por letra, y sigue leyéndose como un solo código", () => {
    renderRoom([alone()]);
    const code = screen.getByLabelText("Código de la sala");
    const tiles = [...code.children];
    expect(tiles.map((tile) => tile.textContent)).toEqual(["A", "B", "C", "2", "3", "4"]);
    expect(code).toHaveTextContent("ABC234");
  });

  it("está en una tarjeta elevada", () => {
    renderRoom([alone()]);
    const card = screen.getByRole("heading", { name: "Sala de espera" }).closest("section")!;
    expect(card.className).toContain("shadow-pop");
  });

  it("solo, tu avatar y un hueco que palpita (decorativo) esperando al rival", () => {
    const { container } = renderRoom([alone()]);
    const players = screen.getByRole("list", { name: "Jugadores" });
    expect(within(players).getByText("ash")).toBeInTheDocument();
    expect(within(players).getByText("AS")).toHaveAttribute("aria-hidden", "true");
    const empty = container.querySelector("[data-empty-seat]")!;
    expect(empty).toHaveAttribute("aria-hidden", "true");
    expect(empty.querySelector(".animate-beat")).not.toBeNull();
  });

  it("con los dos jugadores no queda hueco y el que no se conectó lo dice", () => {
    const { container } = renderRoom([event.roomState({ phase: "waiting", players: [ash(), misty({ connected: false })] })]);
    expect(container.querySelector("[data-empty-seat]")).toBeNull();
    expect(screen.getByText("(sin conectar)")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Jugadores" })).getAllByRole("listitem")).toHaveLength(2);
  });
});

describe("cuenta atrás de inicio (etapa 6)", () => {
  const starting = () => event.roomState({ phase: "starting", startsAt: SERVER_NOW + 5000 });

  it("muestra a los dos jugadores frente a frente con un «VS» decorativo", () => {
    const { container } = renderRoom([starting()]);
    expect(screen.getByText("AS")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("MI")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("VS")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll("[aria-hidden='true']").length).toBeGreaterThanOrEqual(3);
  });

  it("el anillo es grande y no se pone rojo (la cuenta atrás entera dura 5 s)", () => {
    renderRoom([starting()]);
    const timer = screen.getByRole("timer", { name: "Inicio de la partida" });
    expect(timer.style.width).toBe("160px");
    expect(timer).toHaveAttribute("data-urgent", "false");
  });

  it("conserva el título con el nombre del rival", () => {
    renderRoom([starting()]);
    expect(screen.getByRole("heading", { name: "Partida contra misty" })).toBeInTheDocument();
  });
});

describe("elegir tipo (etapa 6)", () => {
  const choosing = (extra: object = {}) =>
    event.roomState({
      phase: "choosing_types",
      config: { typeMode: "chosen", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null },
      round: roundState({ pair: null, ...extra }),
    });

  it("los 18 tipos son teselas de color con relieve y su nombre", () => {
    renderRoom([choosing()]);
    const tiles = within(screen.getByRole("group", { name: "Tipos" })).getAllByRole("button");
    expect(tiles).toHaveLength(18);
    for (const tile of tiles) {
      expect(tile.style.background).toContain("linear-gradient");
      expect(tile.className).toContain("rounded-card");
      expect(tile).toHaveAttribute("data-type");
    }
  });

  it("el cronómetro es un anillo con su nombre de siempre", () => {
    renderRoom([choosing()]);
    expect(screen.getByRole("timer", { name: "Tiempo para elegir" })).toBeInTheDocument();
  });

  it("al tocar una tesela queda marcada (aria-pressed y data-chosen) y las demás no", async () => {
    const { user } = renderRoom([choosing()]);
    await user.click(screen.getByRole("button", { name: "fuego" }));
    const fire = screen.getByRole("button", { name: "fuego" });
    expect(fire).toHaveAttribute("aria-pressed", "true");
    expect(fire).toHaveAttribute("data-chosen", "true");
    expect(screen.getByRole("button", { name: "agua" })).not.toHaveAttribute("data-chosen");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
cd client && npx vitest run test/pages/room-before-game.test.tsx
```

Expected: FAIL — el código no va en casillas, no hay hueco ni «VS» ni teselas con degradado.

- [ ] **Step 3: Implementar**

`client/src/pages/room/WaitingView.tsx`:

```diff
diff --git a/client/src/pages/room/WaitingView.tsx b/client/src/pages/room/WaitingView.tsx
index 9d8a55e..0532a7a 100644
--- a/client/src/pages/room/WaitingView.tsx
+++ b/client/src/pages/room/WaitingView.tsx
@@ -1,6 +1,8 @@
 import { useEffect, useState } from "react";
 import { useNavigate } from "react-router";
+import { Avatar } from "../../components/Avatar";
 import { Button } from "../../components/Button";
+import { Card } from "../../components/Card";
 import { useRoom } from "./use-room";
 
 /** Copia el código de la sala al portapapeles; si el navegador no lo permite, lo dice. */
@@ -35,22 +37,40 @@ export function WaitingView() {
   const code = view.code ?? "";
 
   return (
-    <section className="framed mx-auto max-w-md rounded-card bg-surface p-6 text-center">
-      <h1 className="text-xl font-medium">Sala de espera</h1>
+    <Card as="section" tone="raised" className="mx-auto max-w-md p-8 text-center">
+      <h1 className="font-display text-2xl font-semibold">Sala de espera</h1>
       <p className="mt-3 text-sm text-muted">Comparte este código con tu oponente:</p>
-      <p aria-label="Código de la sala" className="my-2 font-num text-4xl font-medium tracking-widest">
-        {code}
+      <p aria-label="Código de la sala" className="my-4 flex justify-center gap-2">
+        {[...code].map((letter, index) => (
+          <span
+            key={index}
+            style={{ "--i": index } as React.CSSProperties}
+            className="animate-rise inline-flex h-14 w-11 items-center justify-center rounded-ui bg-surface-2 font-num text-3xl font-semibold"
+          >
+            {letter}
+          </span>
+        ))}
       </p>
       <CopyCodeButton code={code} />
 
-      <ul className="mt-5 flex flex-col gap-1 text-sm" aria-label="Jugadores">
+      <ul className="mt-7 flex justify-center gap-8" aria-label="Jugadores">
         {view.players.map((player) => (
-          <li key={player.seat}>
-            {player.username} {player.connected ? "" : <span className="text-muted">(sin conectar)</span>}
+          <li key={player.seat} className="flex flex-col items-center gap-2">
+            <Avatar name={player.username} size="lg" />
+            <span className="text-sm font-semibold">{player.username}</span>
+            {player.connected ? null : <span className="text-xs text-muted">(sin conectar)</span>}
           </li>
         ))}
+        {view.players.length < 2 ? (
+          <li data-empty-seat aria-hidden="true" className="flex flex-col items-center gap-2">
+            <span className="animate-beat inline-flex size-14 items-center justify-center rounded-pill border-2 border-dashed border-line font-display text-2xl text-muted">
+              ?
+            </span>
+            <span className="text-sm text-muted">Tu rival</span>
+          </li>
+        ) : null}
       </ul>
-      <p role="status" className="mt-4 text-sm text-muted">
+      <p role="status" className="mt-5 text-sm text-muted">
         {opponent ? "Tu oponente ya se unió. Esperando a que se conecte…" : "Esperando a tu oponente…"}
       </p>
 
@@ -65,6 +85,6 @@ export function WaitingView() {
           {opponent ? "Salir de la sala" : "Cancelar sala"}
         </Button>
       </div>
-    </section>
+    </Card>
   );
 }
```

`client/src/pages/room/CountdownView.tsx`:

```diff
diff --git a/client/src/pages/room/CountdownView.tsx b/client/src/pages/room/CountdownView.tsx
index 3c90674..3d905fb 100644
--- a/client/src/pages/room/CountdownView.tsx
+++ b/client/src/pages/room/CountdownView.tsx
@@ -1,17 +1,28 @@
+import { Avatar } from "../../components/Avatar";
+import { Card } from "../../components/Card";
 import { Timer } from "../../components/Timer";
 import { START_COUNTDOWN_MS } from "../../game/durations";
 import { useRoom } from "./use-room";
 
 export function CountdownView() {
-  const { view, opponent } = useRoom();
+  const { view, me, opponent } = useRoom();
 
   return (
-    <section className="framed mx-auto max-w-md rounded-card bg-surface p-6 text-center">
-      <h1 className="text-xl font-medium">{opponent ? `Partida contra ${opponent.username}` : "Preparando la partida"}</h1>
-      <p className="mt-2 text-sm text-muted">La partida empieza en…</p>
+    <Card as="section" tone="raised" className="mx-auto max-w-lg p-8 text-center">
+      <h1 className="font-display text-2xl font-semibold">{opponent ? `Partida contra ${opponent.username}` : "Preparando la partida"}</h1>
+      {me && opponent ? (
+        <div className="mt-6 flex items-center justify-center gap-6">
+          <Avatar name={me.username} size="xl" />
+          <span aria-hidden="true" className="font-display text-2xl font-semibold text-muted">
+            VS
+          </span>
+          <Avatar name={opponent.username} size="xl" />
+        </div>
+      ) : null}
+      <p className="mt-6 text-sm text-muted">La partida empieza en…</p>
       <div className="mt-3">
-        <Timer deadline={view.startsAt} offset={view.clockOffset} totalMs={START_COUNTDOWN_MS} label="Inicio de la partida" />
+        <Timer deadline={view.startsAt} offset={view.clockOffset} totalMs={START_COUNTDOWN_MS} label="Inicio de la partida" size={160} urgentAtMs={0} />
       </div>
-    </section>
+    </Card>
   );
 }
```

`client/src/pages/room/TypePickerView.tsx`:

```diff
diff --git a/client/src/pages/room/TypePickerView.tsx b/client/src/pages/room/TypePickerView.tsx
index f1117a6..537000a 100644
--- a/client/src/pages/room/TypePickerView.tsx
+++ b/client/src/pages/room/TypePickerView.tsx
@@ -3,7 +3,7 @@ import { useState } from "react";
 import { Timer } from "../../components/Timer";
 import { TYPE_CHOICE_MS } from "../../game/durations";
 import { TYPE_LABELS } from "../../i18n/es";
-import { TYPE_STYLES } from "../../theme/type-styles";
+import { typeChipStyle } from "../../theme/type-styles";
 import { LeaveButton } from "./LeaveButton";
 import { useRoom } from "./use-room";
 
@@ -18,26 +18,28 @@ export function TypePickerView() {
   const waiting = chosen !== null && !view.lastError;
 
   return (
-    <section className="flex flex-col gap-4">
+    <section className="flex flex-col gap-5">
       <div className="text-center">
-        <h1 className="text-xl font-medium">Elige un tipo</h1>
+        <h1 className="font-display text-2xl font-semibold">Elige un tipo</h1>
         <p className="mt-1 text-sm text-muted">Tú y tu rival eligen uno; con los dos se forma el par de la ronda {round?.number}.</p>
       </div>
       <Timer deadline={round?.deadline ?? null} offset={view.clockOffset} totalMs={TYPE_CHOICE_MS} label="Tiempo para elegir" />
 
-      <div role="group" aria-label="Tipos" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
-        {TYPE_NAMES.map((type) => (
+      <div role="group" aria-label="Tipos" className="grid grid-cols-3 gap-3 sm:grid-cols-6">
+        {TYPE_NAMES.map((type, index) => (
           <button
             key={type}
             type="button"
             disabled={locked || waiting}
             aria-pressed={chosen === type}
+            data-type={type}
+            data-chosen={chosen === type ? "true" : undefined}
             onClick={() => {
               setChosen(type);
               client.chooseType(type);
             }}
-            style={TYPE_STYLES[type]}
-            className={`rounded-ui px-2 py-3 text-sm font-medium transition-opacity disabled:cursor-not-allowed ${
+            style={{ ...typeChipStyle(type), "--i": index } as React.CSSProperties}
+            className={`animate-rise rounded-card px-2 py-4 font-display text-base font-semibold shadow-[inset_0_-3px_0_rgb(0_0_0/0.18)] transition-transform duration-(--dur-fast) hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${
               locked && chosen !== type ? "opacity-40" : ""
             } ${chosen === type ? "outline-4 outline-offset-2 outline-fg" : ""}`}
           >
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
cd client && npx vitest run --testTimeout=30000 --maxWorkers=2
cd .. && npm run typecheck
```

Expected: PASS (todo el cliente: **595 pruebas**) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): sala de espera con casillas, cuenta atrás con avatares y teselas de tipo" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: La ronda y el resultado de la ronda

**Files:**
- Create: `client/test/pages/room-play.test.tsx`
- Modify: `client/src/pages/room/RoundView.tsx`, `client/src/pages/room/RoundResultView.tsx`, `client/src/components/Autocomplete.tsx`, `client/src/components/PokemonCard.tsx`

**Interfaces:**
- Consumes: `Card`, `TypeChip` (`size="lg"`), `Timer`, `Badge`, `PokemonCard`, `TeamPanel`, `OpponentPanel`, `RESULT_PAUSE_MS`.
- Produces: `PokemonCard` gana `eager?` (sin carga perezosa de la imagen). La ronda: una «arena» elevada (`data-arena`) con el encabezado «Ronda N de M» (o la meta de stats), puntos de progreso decorativos solo con rondas fijas (`data-progress`, cada punto `data-dot="done | current | todo"`), el par de tipos como dos chips grandes unidos por un «+» decorativo, el anillo de tiempo y el campo de respuesta grande; el marcador de pantallas estrechas (`aria-label="Marcador"`) es una píldora que lee igual que antes («Tú 500 · misty 400»). El resultado: dos tarjetas (`data-result`) con insignia de acierto (verde) o fallo (rojo), la ganadora con borde verde, el arte oficial grande y sin carga perezosa o una casilla vacía decorativa (`data-empty-art`), y una barra fina (`data-next-bar`) con lo que falta para la siguiente ronda.

- [ ] **Step 1: Escribir la prueba que falla**

`client/test/pages/room-play.test.tsx` (las pruebas de `room.test.tsx` siguen valiendo y no se tocan):

```tsx
import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PokemonCard } from "../../src/components/PokemonCard";
import { SERVER_NOW, event, pokemon } from "../helpers/events";
import { ash, misty, renderRoom, roundState } from "../helpers/room";
import { render } from "@testing-library/react";

afterEach(() => vi.useRealTimers());

describe("ronda (etapa 6)", () => {
  const playing = (extra: object = {}, stateExtra: object = {}) =>
    event.roomState({
      phase: "round_active",
      myTeam: [pokemon(1, 500)],
      players: [ash({ totalStats: 500, teamSize: 1 }), misty({ totalStats: 400, teamSize: 1 })],
      round: roundState({ number: 2, ...extra }),
      ...stateExtra,
    });

  it("la zona central es una «arena» elevada", () => {
    const { container } = renderRoom([playing()]);
    const arena = container.querySelector("[data-arena]")!;
    expect(arena.className).toContain("shadow-pop");
    expect(within(arena as HTMLElement).getByRole("heading", { name: "Ronda 2 de 3" })).toBeInTheDocument();
  });

  it("el par de tipos son dos chips grandes unidos por un «+» decorativo", () => {
    renderRoom([playing()]);
    const pair = screen.getByLabelText("Par de tipos");
    const chips = pair.querySelectorAll("[data-type]");
    expect(chips).toHaveLength(2);
    for (const chip of chips) expect(chip.className).toContain("text-lg");
    expect(within(pair).getByText("+")).toHaveAttribute("aria-hidden", "true");
  });

  it("los puntos de progreso marcan la ronda actual en las partidas de rondas fijas", () => {
    const { container } = renderRoom([playing()]);
    const dots = [...container.querySelectorAll("[data-progress] [data-dot]")];
    expect(dots.map((dot) => dot.getAttribute("data-dot"))).toEqual(["done", "current", "todo"]);
    expect(container.querySelector("[data-progress]")).toHaveAttribute("aria-hidden", "true");
  });

  it("en una partida por meta de stats no hay puntos de progreso", () => {
    const { container } = renderRoom([playing({}, { config: { typeMode: "random", lengthMode: "custom", roundsLimit: null, statsGoal: 2500 } })]);
    expect(container.querySelector("[data-progress]")).toBeNull();
  });

  it("la barra de marcador para pantallas estrechas es una píldora y lee igual que antes", () => {
    renderRoom([playing()]);
    const bar = screen.getByLabelText("Marcador");
    expect(bar).toHaveTextContent("Tú 500 · misty 400");
    expect(bar.className).toContain("rounded-pill");
    expect(bar.className).toContain("md:hidden");
  });

  it("el campo de respuesta es grande y el botón de enviar también", () => {
    renderRoom([playing()]);
    expect(screen.getByRole("combobox").className).toContain("py-3");
    expect(screen.getByRole("combobox").className).toContain("text-lg");
    expect(screen.getByRole("button", { name: "Enviar" }).className).toContain("py-3");
  });
});

describe("resultado de la ronda (etapa 6)", () => {
  const afterRound = (mySeat: 1 | 2 = 1, result = event.roundResult()) => [
    event.roomState({ phase: "round_result", mySeat, roundsPlayed: 1, players: [ash(), misty()] }),
    result,
  ];

  it("cada jugador tiene su insignia: acierto en verde, fallo en rojo", () => {
    renderRoom(afterRound());
    const mine = screen.getByRole("region", { name: "Resultado de Tú" });
    expect(within(mine).getByText("Acertó").className).toContain("bg-success-bg");
    const theirs = screen.getByRole("region", { name: "Resultado de misty" });
    expect(within(theirs).getByText("Ese Pokémon no existe").className).toContain("bg-danger-bg");
  });

  it("la tarjeta de quien acertó se resalta y la del que falló no", () => {
    renderRoom(afterRound());
    expect(screen.getByRole("region", { name: "Resultado de Tú" })).toHaveAttribute("data-result", "VALID");
    expect(screen.getByRole("region", { name: "Resultado de Tú" }).className).toContain("border-success");
    expect(screen.getByRole("region", { name: "Resultado de misty" }).className).not.toContain("border-success");
  });

  it("el Pokémon ganado se ve con el arte oficial grande, sin carga perezosa", () => {
    renderRoom(afterRound());
    const mine = screen.getByRole("region", { name: "Resultado de Tú" });
    const img = mine.querySelector("img")!;
    expect(img).toHaveAttribute("src", expect.stringContaining("/official-artwork/1.png"));
    expect(img).toHaveAttribute("loading", "eager");
  });

  it("quien no ganó nada ve una casilla vacía decorativa, no una imagen rota", () => {
    renderRoom(afterRound());
    const theirs = screen.getByRole("region", { name: "Resultado de misty" });
    expect(theirs.querySelector("img")).toBeNull();
    expect(theirs.querySelector("[data-empty-art]")).toHaveAttribute("aria-hidden", "true");
  });

  it("una barra fina muestra cuánto falta para la siguiente ronda", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(SERVER_NOW);
    const { container } = renderRoom(afterRound());
    const bar = container.querySelector("[data-next-bar]") as HTMLElement;
    expect(bar).toHaveAttribute("aria-hidden", "true");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("100%");
    expect(screen.getByText("Siguiente ronda en 6 s")).toBeInTheDocument();
  });

  it("si era la última ronda la barra está vacía y dice que calcula el resultado", () => {
    const { container } = renderRoom(afterRound(1, event.roundResult({ nextRoundAt: null })));
    const bar = container.querySelector("[data-next-bar]") as HTMLElement;
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("0%");
    expect(screen.getByText("Calculando el resultado final…")).toBeInTheDocument();
  });
});

describe("PokemonCard con carga inmediata", () => {
  it("la variante grande puede pedir su imagen sin carga perezosa", () => {
    const { container } = render(<PokemonCard pokemon={pokemon(6, 534)} size="lg" eager />);
    expect(container.querySelector("img")).toHaveAttribute("loading", "eager");
  });

  it("por defecto es perezosa", () => {
    const { container } = render(<PokemonCard pokemon={pokemon(6, 534)} size="lg" />);
    expect(container.querySelector("img")).toHaveAttribute("loading", "lazy");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
cd client && npx vitest run test/pages/room-play.test.tsx
```

Expected: FAIL — no hay arena, puntos de progreso, insignias ni barra de la siguiente ronda.

- [ ] **Step 3: Implementar**

`client/src/pages/room/RoundView.tsx`:

```diff
diff --git a/client/src/pages/room/RoundView.tsx b/client/src/pages/room/RoundView.tsx
index 87c80f3..f290353 100644
--- a/client/src/pages/room/RoundView.tsx
+++ b/client/src/pages/room/RoundView.tsx
@@ -1,4 +1,5 @@
 import { Autocomplete } from "../../components/Autocomplete";
+import { Card } from "../../components/Card";
 import { Notice } from "../../components/Notice";
 import { OpponentPanel, TeamPanel } from "../../components/Panels";
 import { Timer } from "../../components/Timer";
@@ -8,6 +9,27 @@ import { useNames } from "../../services";
 import { LeaveButton } from "./LeaveButton";
 import { useRoom } from "./use-room";
 
+const DOT_STATE = (index: number, current: number): "done" | "current" | "todo" =>
+  index + 1 < current ? "done" : index + 1 === current ? "current" : "todo";
+
+/** Un punto por ronda de la partida (solo cuando las rondas son fijas): las jugadas, la actual y las que faltan. */
+function RoundDots({ total, current }: { total: number; current: number }) {
+  return (
+    <div data-progress aria-hidden="true" className="mt-2 flex flex-wrap justify-center gap-1.5">
+      {Array.from({ length: total }, (_, index) => {
+        const state = DOT_STATE(index, current);
+        return (
+          <span
+            key={index}
+            data-dot={state}
+            className={`size-2.5 rounded-full ${state === "todo" ? "bg-surface-2" : "bg-accent"} ${state === "current" ? "animate-beat ring-2 ring-accent/40" : ""}`}
+          />
+        );
+      })}
+    </div>
+  );
+}
+
 /** La pantalla central: tu equipo, el par de tipos con su cronómetro y el rival. */
 export function RoundView() {
   const { view, client, me, opponent } = useRoom();
@@ -24,9 +46,9 @@ export function RoundView() {
   return (
     <section className="flex flex-col gap-4">
       {/* En pantallas estrechas los paneles de equipo se resumen en una sola barra. */}
-      <p className="framed rounded-card bg-surface px-3 py-2 text-center text-sm md:hidden" aria-label="Marcador">
-        Tú <span className="font-num font-medium tabular-nums">{me?.totalStats ?? 0}</span> ·{" "}
-        {opponent?.username ?? "Rival"} <span className="font-num font-medium tabular-nums">{opponent?.totalStats ?? 0}</span>
+      <p aria-label="Marcador" className="framed rounded-pill bg-surface px-4 py-2 text-center text-sm shadow-card md:hidden">
+        Tú <span className="font-num font-semibold tabular-nums">{me?.totalStats ?? 0}</span> ·{" "}
+        {opponent?.username ?? "Rival"} <span className="font-num font-semibold tabular-nums">{opponent?.totalStats ?? 0}</span>
       </p>
 
       <div className="grid gap-4 md:grid-cols-[1fr_1.6fr_1fr]">
@@ -34,14 +56,18 @@ export function RoundView() {
           <TeamPanel team={view.myTeam} total={me?.totalStats ?? 0} />
         </div>
 
-        <div className="framed flex flex-col gap-4 rounded-card bg-surface p-4">
+        <Card data-arena tone="raised" className="flex flex-col gap-5 p-6">
           <div className="text-center">
-            <h1 className="text-sm text-muted">{goal}</h1>
-            <div className="mt-2 flex flex-wrap justify-center gap-2" aria-label="Par de tipos">
-              <TypeChip type={round.pair[0]} className="text-base" />
-              <TypeChip type={round.pair[1]} className="text-base" />
+            <h1 className="font-display text-sm font-semibold text-muted">{goal}</h1>
+            {config?.roundsLimit != null ? <RoundDots total={config.roundsLimit} current={round.number} /> : null}
+            <div className="mt-4 flex flex-wrap items-center justify-center gap-3" aria-label="Par de tipos">
+              <TypeChip type={round.pair[0]} size="lg" />
+              <span aria-hidden="true" className="font-display text-2xl font-semibold text-muted">
+                +
+              </span>
+              <TypeChip type={round.pair[1]} size="lg" />
             </div>
-            <p className="mt-2 text-sm">Nombra un Pokémon que tenga los dos tipos.</p>
+            <p className="mt-3 text-sm">Nombra un Pokémon que tenga los dos tipos.</p>
           </div>
 
           <Timer deadline={round.deadline} offset={view.clockOffset} totalMs={ROUND_MS} label="Tiempo de la ronda" />
@@ -51,7 +77,7 @@ export function RoundView() {
           ) : null}
 
           <Autocomplete names={names} submitted={round.answered} autoFocus onSubmit={(text) => client.submit(text)} />
-        </div>
+        </Card>
 
         <div className="hidden md:block">
           <OpponentPanel
```

`client/src/pages/room/RoundResultView.tsx`:

```diff
diff --git a/client/src/pages/room/RoundResultView.tsx b/client/src/pages/room/RoundResultView.tsx
index 646f995..842fcf6 100644
--- a/client/src/pages/room/RoundResultView.tsx
+++ b/client/src/pages/room/RoundResultView.tsx
@@ -1,22 +1,35 @@
 import type { RoundPlayerResult, Seat } from "@pokemon-minigames/shared";
+import { Badge } from "../../components/Badge";
+import { Card } from "../../components/Card";
 import { PokemonCard } from "../../components/PokemonCard";
 import { TypeChip } from "../../components/TypeChip";
 import { secondsLeft, useCountdown } from "../../game/clock";
+import { RESULT_PAUSE_MS } from "../../game/durations";
 import { PICK_RESULT_LABELS } from "../../i18n/es";
 import { useRoom } from "./use-room";
 
 function ResultCard({ title, result }: { title: string; result: RoundPlayerResult }) {
   const won = result.result === "VALID";
   return (
-    <section aria-label={`Resultado de ${title}`} className="framed rounded-card bg-surface p-4">
-      <h2 className="text-sm text-muted">{title}</h2>
-      <p className={`mt-1 font-medium ${won ? "text-success" : "text-danger"}`}>{PICK_RESULT_LABELS[result.result]}</p>
-      {result.text ? <p className="mt-1 text-sm text-muted">Escribió: «{result.text}»</p> : null}
-      <div className="mt-3">{result.pokemon ? <PokemonCard pokemon={result.pokemon} /> : null}</div>
-      <p className="mt-3 text-sm">
-        Total: <span className="font-num font-medium tabular-nums">{result.totalStats}</span> · {result.teamSize} Pokémon
+    <Card as="section" aria-label={`Resultado de ${title}`} data-result={result.result} className={`p-5 ${won ? "border-success" : ""}`}>
+      <div className="flex items-center justify-between gap-2">
+        <h2 className="truncate font-display text-lg font-semibold">{title}</h2>
+        <Badge tone={won ? "success" : "danger"}>{PICK_RESULT_LABELS[result.result]}</Badge>
+      </div>
+      {result.text ? <p className="mt-2 text-sm text-muted">Escribió: «{result.text}»</p> : null}
+      <div className="mt-4">
+        {result.pokemon ? (
+          <PokemonCard pokemon={result.pokemon} size="lg" eager />
+        ) : (
+          <div data-empty-art aria-hidden="true" className="flex h-64 items-center justify-center rounded-card bg-surface-2 font-display text-6xl text-muted">
+            ?
+          </div>
+        )}
+      </div>
+      <p className="mt-4 text-sm">
+        Total: <span className="font-num font-semibold tabular-nums">{result.totalStats}</span> · {result.teamSize} Pokémon
       </p>
-    </section>
+    </Card>
   );
 }
 
@@ -36,14 +49,15 @@ export function RoundResultView() {
   const mine = result.results[view.mySeat];
   const rivalSeat: Seat = view.mySeat === 1 ? 2 : 1;
   const theirs = result.results[rivalSeat];
+  const remaining = result.nextRoundAt === null ? 0 : Math.min(100, (untilNext / RESULT_PAUSE_MS) * 100);
 
   return (
-    <section className="flex flex-col gap-4">
+    <section className="flex flex-col gap-5">
       <div className="text-center">
-        <h1 className="text-xl font-medium">Resultado de la ronda {result.round}</h1>
-        <div className="mt-2 flex justify-center gap-2" aria-label="Par de tipos">
-          <TypeChip type={result.type1} />
-          <TypeChip type={result.type2} />
+        <h1 className="font-display text-2xl font-semibold">Resultado de la ronda {result.round}</h1>
+        <div className="mt-3 flex justify-center gap-3" aria-label="Par de tipos">
+          <TypeChip type={result.type1} size="lg" />
+          <TypeChip type={result.type2} size="lg" />
         </div>
       </div>
 
@@ -54,16 +68,19 @@ export function RoundResultView() {
         {theirs.pokemon ? `, ${theirs.pokemon.names.es}` : ""}.
       </p>
 
-      <div className="grid gap-4 md:grid-cols-2">
+      <div className="grid gap-5 md:grid-cols-2">
         <ResultCard title="Tú" result={mine} />
         <ResultCard title={opponent?.username ?? "Tu rival"} result={theirs} />
       </div>
 
-      <p className="text-center text-sm text-muted">
-        {result.nextRoundAt === null
-          ? "Calculando el resultado final…"
-          : `Siguiente ronda en ${secondsLeft(untilNext)} s`}
-      </p>
+      <div className="mx-auto w-64 text-center">
+        <p className="text-sm text-muted">
+          {result.nextRoundAt === null ? "Calculando el resultado final…" : `Siguiente ronda en ${secondsLeft(untilNext)} s`}
+        </p>
+        <div data-next-bar aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-pill bg-surface-2">
+          <div style={{ width: `${remaining}%` }} className="h-full rounded-pill bg-accent transition-[width] duration-300 ease-linear" />
+        </div>
+      </div>
     </section>
   );
 }
```

`client/src/components/Autocomplete.tsx` (el campo y su lista de sugerencias, más grandes):

```diff
diff --git a/client/src/components/Autocomplete.tsx b/client/src/components/Autocomplete.tsx
index ecc0837..ab37516 100644
--- a/client/src/components/Autocomplete.tsx
+++ b/client/src/components/Autocomplete.tsx
@@ -102,7 +102,7 @@ export function Autocomplete({ names, onSubmit, submitted = false, disabled = fa
       }}
       className="relative"
     >
-      <label htmlFor={inputId} className="mb-1 block text-sm font-medium">
+      <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold">
         Nombre del Pokémon
       </label>
       <div className="flex gap-2">
@@ -131,9 +131,9 @@ export function Autocomplete({ names, onSubmit, submitted = false, disabled = fa
           }}
           onKeyDown={onKeyDown}
           onBlur={() => setOpen(false)}
-          className="framed min-w-0 flex-1 rounded-ui bg-surface px-3 py-2 text-fg placeholder:text-muted"
+          className="framed min-w-0 flex-1 rounded-ui bg-surface px-4 py-3 text-lg text-fg transition-shadow duration-(--dur-fast) placeholder:text-muted focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_25%,transparent)]"
         />
-        <Button type="submit" variant="primary" disabled={locked}>
+        <Button type="submit" variant="primary" size="lg" disabled={locked}>
           Enviar
         </Button>
       </div>
@@ -143,7 +143,7 @@ export function Autocomplete({ names, onSubmit, submitted = false, disabled = fa
           id={listId}
           role="listbox"
           aria-label="Sugerencias"
-          className="framed absolute left-0 right-0 z-10 mt-1 overflow-hidden rounded-ui bg-surface shadow-md"
+          className="framed absolute left-0 right-0 z-10 mt-1 overflow-hidden rounded-ui bg-surface shadow-pop"
         >
           {suggestions.map((name, i) => (
             <li
@@ -159,7 +159,7 @@ export function Autocomplete({ names, onSubmit, submitted = false, disabled = fa
                 setActive(-1);
                 inputRef.current?.focus();
               }}
-              className={`cursor-pointer px-3 py-2 text-sm ${i === active ? "bg-accent text-accent-fg" : "hover:bg-surface-2"}`}
+              className={`cursor-pointer px-4 py-2.5 text-sm ${i === active ? "bg-accent text-accent-fg" : "hover:bg-surface-2"}`}
             >
               {name.es}
               {name.en !== name.es ? <span className={i === active ? "ml-2" : "ml-2 text-muted"}>{name.en}</span> : null}
```

`client/src/components/PokemonCard.tsx` (la propiedad `eager`):

```diff
diff --git a/client/src/components/PokemonCard.tsx b/client/src/components/PokemonCard.tsx
index c29a92f..99c7374 100644
--- a/client/src/components/PokemonCard.tsx
+++ b/client/src/components/PokemonCard.tsx
@@ -14,9 +14,11 @@ export interface PokemonCardProps {
   showStats?: boolean;
   /** `lg` usa el arte oficial grande; solo donde hay pocas tarjetas a la vez. */
   size?: "sm" | "lg";
+  /** Sin carga perezosa de la imagen: para lo que se ve de inmediato (el resultado de la ronda). */
+  eager?: boolean;
 }
 
-export function PokemonCard({ pokemon, showStats = false, size = "sm" }: PokemonCardProps) {
+export function PokemonCard({ pokemon, showStats = false, size = "sm", eager = false }: PokemonCardProps) {
   const large = size === "lg";
   const { top, bottom } = typeGradient(pokemon.types[0]!);
 
@@ -28,7 +30,7 @@ export function PokemonCard({ pokemon, showStats = false, size = "sm" }: Pokemon
           style={{ background: `radial-gradient(circle at 30% 25%, ${top}, ${bottom})` }}
           className={`inline-flex shrink-0 items-center justify-center rounded-full ${large ? "size-44" : "size-[72px]"}`}
         >
-          <ArtImage id={pokemon.id} spriteUrl={pokemon.spriteUrl} size={large ? 144 : 64} variant={large ? "official" : "sprite"} className="rounded-full" />
+          <ArtImage id={pokemon.id} spriteUrl={pokemon.spriteUrl} size={large ? 144 : 64} variant={large ? "official" : "sprite"} eager={eager} className="rounded-full" />
         </span>
         <div className={large ? "min-w-0" : "min-w-0 flex-1"}>
           <h3 className={`truncate font-display font-semibold ${large ? "text-xl" : "text-lg"}`}>{pokemon.names.es}</h3>
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
cd client && npx vitest run --testTimeout=30000 --maxWorkers=2
cd .. && npm run typecheck
```

Expected: PASS (todo el cliente: **609 pruebas**) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): arena de la ronda con progreso y resultado con arte oficial e insignias" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Resumen de la partida y perfil

**Files:**
- Create: `client/test/pages/summary-profile.test.tsx`
- Modify: `client/src/components/StatTile.tsx`, `client/src/pages/room/SummaryView.tsx`, `client/src/pages/profile/ProfilePage.tsx`, `client/src/pages/profile/StatsView.tsx`, `client/src/pages/profile/HistoryList.tsx`

**Interfaces:**
- Consumes: `Card`, `Badge`, `Avatar`, `PokemonCard`, `LogoMark`, `StatTile`.
- Produces: `StatTile` gana `ring?: number | null` (un anillo decorativo y sin texto, de 0 a 1). Resumen: una cabecera elevada (`data-verdict="won | drawn | lost"`) con el veredicto como `h1`, el motivo y el marcador; si ganaste lleva borde dorado, un trofeo y el halo (`animate-halo`); cada equipo muestra su total grande y, primero, el Pokémon de más puntos con el arte oficial grande, y después los demás compactos, todos con las seis barras; los tres botones de siempre (el principal, grande). Perfil: cabecera con avatar grande y título, fichas con el anillo de victorias, el podio de los más ganados (arte grande y medallas decorativas `data-medal`), el historial con una insignia de color por resultado y el avatar del rival, la carga con la bola girando y el 404 con una bola apagada (`data-lost`).

- [ ] **Step 1: Escribir la prueba que falla**

`client/test/pages/summary-profile.test.tsx` (las pruebas de `room.test.tsx` y `profile.test.tsx` siguen valiendo y no se tocan):

```tsx
import type { HistoryEntry, Stats } from "@pokemon-minigames/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { StatTile } from "../../src/components/StatTile";
import { ProfilePage } from "../../src/pages/profile/ProfilePage";
import { event, pokemon } from "../helpers/events";
import { ash, misty, renderRoom } from "../helpers/room";
import { type FakeServices, fakeServices, renderWithServices } from "../helpers/services";

describe("resumen final (etapa 6)", () => {
  const finished = (mySeat: 1 | 2, winnerSeat: 1 | 2 | null) => [
    event.roomState({ phase: "finished", mySeat, players: [ash(), misty()] }),
    event.gameEnded({ winnerSeat }),
  ];
  const hero = (container: HTMLElement) => container.querySelector("[data-verdict]") as HTMLElement;

  it("ganar se celebra con un borde dorado y un halo; empatar o perder, no", () => {
    const won = renderRoom(finished(1, 1));
    expect(hero(won.container)).toHaveAttribute("data-verdict", "won");
    expect(hero(won.container).className).toContain("border-gold");
    expect(hero(won.container).className).toContain("animate-halo");
    won.unmount();

    const lost = renderRoom(finished(2, 1));
    expect(hero(lost.container)).toHaveAttribute("data-verdict", "lost");
    expect(hero(lost.container).className).not.toContain("animate-halo");
    lost.unmount();

    const drawn = renderRoom(finished(1, null));
    expect(hero(drawn.container)).toHaveAttribute("data-verdict", "drawn");
    expect(hero(drawn.container).className).not.toContain("animate-halo");
  });

  it("el veredicto es el encabezado y el marcador va aparte, como siempre", () => {
    renderRoom(finished(1, 1));
    expect(screen.getByRole("heading", { level: 1, name: "Ganaste" })).toBeInTheDocument();
    expect(screen.getByText("800 – 400")).toBeInTheDocument();
  });

  it("de cada equipo, el Pokémon de más puntos va primero con el arte oficial grande y los demás compactos", () => {
    renderRoom(finished(1, 1));
    const mine = screen.getByRole("region", { name: "Equipo de Tú" });
    const images = [...mine.querySelectorAll("img")];
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute("src", expect.stringContaining("/official-artwork/1.png")); // 500 puntos
    expect(images[1]).toHaveAttribute("src", "https://example.com/2.png"); // 300 puntos: sprite pequeño
    const names = within(mine).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
    expect(names).toEqual(["Poke1", "Poke2"]);
  });

  it("cada Pokémon muestra sus seis stats como barras", () => {
    renderRoom(finished(1, 1));
    const mine = screen.getByRole("region", { name: "Equipo de Tú" });
    expect(mine.querySelectorAll("[data-stat-bar]")).toHaveLength(12);
  });

  it("el total de cada equipo se ve grande", () => {
    renderRoom(finished(1, 1));
    expect(within(screen.getByRole("region", { name: "Equipo de Tú" })).getByText("800").className).toContain("text-3xl");
  });

  it("jugar de nuevo es el botón principal y grande", () => {
    renderRoom(finished(1, 1));
    const button = screen.getByRole("button", { name: "Jugar de nuevo" });
    expect(button.className).toContain("bg-accent");
    expect(button.className).toContain("py-3");
  });
});

const STATS: Stats = {
  played: 5,
  wins: 3,
  draws: 1,
  losses: 1,
  winRate: 0.6,
  currentStreak: 2,
  bestStreak: 3,
  averagePower: 512.5,
  bestGameScore: 1534,
  topPokemon: [
    { pokemon: pokemon(6, 534, { names: { es: "Charizard", en: "Charizard" } }), wins: 3 },
    { pokemon: pokemon(25, 320, { names: { es: "Pikachu", en: "Pikachu" } }), wins: 1 },
  ],
};

const game = (overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: "g1",
  endedAt: "2026-09-30T12:00:00.000Z",
  result: "won",
  reason: "completed",
  opponent: { username: "misty" },
  myScore: 1100,
  opponentScore: 0,
  config: { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null },
  ...overrides,
});

function renderProfile(route: string, services: FakeServices = fakeServices()) {
  const utils = renderWithServices(
    <Routes>
      <Route path="/perfil" element={<ProfilePage />} />
      <Route path="/jugador/:username" element={<ProfilePage />} />
    </Routes>,
    { services, route },
  );
  return { ...utils, user: userEvent.setup() };
}

describe("StatTile con anillo", () => {
  it("dibuja un anillo decorativo con el porcentaje y no repite el número como texto", () => {
    const { container } = renderWithServices(
      <dl>
        <StatTile label="Victorias" value="60 %" ring={0.6} />
      </dl>,
    );
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg.querySelectorAll("text")).toHaveLength(0);
    const arc = svg.querySelectorAll("circle")[1]!;
    const circumference = 2 * Math.PI * 40;
    expect(Number(arc.getAttribute("stroke-dashoffset"))).toBeCloseTo(circumference * 0.4, 0);
  });

  it("sin porcentaje no hay anillo", () => {
    const { container } = renderWithServices(
      <dl>
        <StatTile label="Victorias" value="—" ring={null} />
      </dl>,
    );
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("perfil (etapa 6)", () => {
  it("la cabecera lleva un avatar grande decorativo junto al título", async () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn(async () => ({ username: "ash", stats: STATS }));
    renderProfile("/perfil", services);
    expect(await screen.findByRole("heading", { level: 1, name: "Tu perfil" })).toBeInTheDocument();
    expect(screen.getByText("AS")).toHaveAttribute("aria-hidden", "true");
  });

  it("el porcentaje de victorias tiene su anillo", async () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn(async () => ({ username: "ash", stats: STATS }));
    renderProfile("/perfil", services);
    const summary = await screen.findByRole("region", { name: "Resumen" });
    const tile = within(summary).getByText("Victorias").parentElement!;
    expect(tile.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });

  it("los Pokémon más ganados forman un podio con arte oficial y medallas decorativas", async () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn(async () => ({ username: "ash", stats: STATS }));
    renderProfile("/perfil", services);
    const top = await screen.findByRole("region", { name: "Pokémon más ganados" });
    const images = [...top.querySelectorAll("img")];
    expect(images[0]).toHaveAttribute("src", expect.stringContaining("/official-artwork/6.png"));
    expect(images[1]).toHaveAttribute("src", expect.stringContaining("/official-artwork/25.png"));
    const medals = [...top.querySelectorAll("[data-medal]")];
    expect(medals.map((medal) => medal.textContent)).toEqual(["1", "2"]);
    for (const medal of medals) expect(medal).toHaveAttribute("aria-hidden", "true");
  });

  it("cada partida del historial lleva una insignia de color por resultado y el avatar del rival", async () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn(async () => ({ username: "ash", stats: STATS }));
    services.endpoints.stats.history = vi.fn(async () => ({
      games: [game({ id: "a" }), game({ id: "b", result: "drawn", myScore: 500, opponentScore: 500 }), game({ id: "c", result: "lost", myScore: 0, opponentScore: 400 })],
      nextCursor: null,
    }));
    renderProfile("/perfil", services);
    const list = await screen.findByRole("list", { name: "Historial de partidas" });
    const items = within(list).getAllByRole("listitem");
    expect(within(items[0]!).getByText("Ganaste").className).toContain("bg-success-bg");
    expect(within(items[1]!).getByText("Empate").className).toContain("bg-surface-2");
    expect(within(items[2]!).getByText("Perdiste").className).toContain("bg-danger-bg");
    expect(within(items[0]!).getByText("MI")).toHaveAttribute("aria-hidden", "true");
  });

  it("mientras carga muestra la bola girando y el texto de siempre", () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn(() => new Promise<{ username: string; stats: Stats }>(() => {}));
    renderProfile("/perfil", services);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Cargando perfil…");
    expect(status.querySelector("svg")?.getAttribute("class")).toContain("animate-spin-slow");
  });

  it("un jugador que no existe se explica con una bola apagada y un botón para volver", async () => {
    const services = fakeServices();
    const { ApiError } = await import("../../src/api/client");
    services.endpoints.stats.forUser = vi.fn(async () => {
      throw new ApiError(404, "USER_NOT_FOUND");
    });
    const { container } = renderProfile("/jugador/nadie", services);
    expect(await screen.findByText("No encontramos a ese jugador.")).toBeInTheDocument();
    const lost = container.querySelector("[data-lost]")!;
    expect(lost).toHaveAttribute("aria-hidden", "true");
    expect(lost.querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Volver al lobby" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
cd client && npx vitest run test/pages/summary-profile.test.tsx
```

Expected: FAIL — no hay `data-verdict`, anillo, podio, medallas ni insignias en el historial.

- [ ] **Step 3: Implementar**

`client/src/components/StatTile.tsx`:

```diff
diff --git a/client/src/components/StatTile.tsx b/client/src/components/StatTile.tsx
index 5a77a28..5e8bc29 100644
--- a/client/src/components/StatTile.tsx
+++ b/client/src/components/StatTile.tsx
@@ -1,10 +1,35 @@
-/** Una ficha de estadística (etiqueta y valor). Va dentro de un `<dl>`. */
-export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
+const RADIUS = 40;
+const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
+
+/** Un anillo decorativo que se llena hasta `fraction` (de 0 a 1). Sin texto: el número ya está en la ficha. */
+function Ring({ fraction }: { fraction: number }) {
+  const clamped = Math.min(1, Math.max(0, fraction));
   return (
-    <div className="framed rounded-card bg-surface px-4 py-3 shadow-card">
+    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" className="absolute right-3 top-1/2 size-14 -translate-y-1/2 -rotate-90">
+      <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="12" className="stroke-surface-2" />
+      <circle
+        cx="50"
+        cy="50"
+        r={RADIUS}
+        fill="none"
+        strokeWidth="12"
+        strokeLinecap="round"
+        strokeDasharray={CIRCUMFERENCE}
+        strokeDashoffset={CIRCUMFERENCE * (1 - clamped)}
+        className="stroke-accent-2"
+      />
+    </svg>
+  );
+}
+
+/** Una ficha de estadística (etiqueta y valor), con un anillo opcional. Va dentro de un `<dl>`. */
+export function StatTile({ label, value, hint, ring }: { label: string; value: string; hint?: string; ring?: number | null }) {
+  return (
+    <div className="framed relative rounded-card bg-surface px-4 py-3 shadow-card">
       <dt className="text-sm text-muted">{label}</dt>
       <dd className="font-num text-3xl font-semibold tabular-nums">{value}</dd>
       {hint ? <dd className="text-xs text-muted">{hint}</dd> : null}
+      {ring != null ? <Ring fraction={ring} /> : null}
     </div>
   );
 }
```

`client/src/pages/room/SummaryView.tsx`:

```diff
diff --git a/client/src/pages/room/SummaryView.tsx b/client/src/pages/room/SummaryView.tsx
index d5bcb17..37d895c 100644
--- a/client/src/pages/room/SummaryView.tsx
+++ b/client/src/pages/room/SummaryView.tsx
@@ -1,18 +1,28 @@
 import type { GameEndedPayload, PokemonView, Seat } from "@pokemon-minigames/shared";
 import { useNavigate } from "react-router";
 import { Button } from "../../components/Button";
+import { Card } from "../../components/Card";
 import { PokemonCard } from "../../components/PokemonCard";
 import { END_REASON_LABELS } from "../../i18n/es";
 import { useRoom } from "./use-room";
 
+/** El Pokémon de más puntos va primero (con el arte grande); los demás siguen en el orden en que se ganaron. */
+function bestFirst(team: PokemonView[]): PokemonView[] {
+  if (team.length === 0) return [];
+  const best = team.reduce((top, pokemon, index) => (pokemon.totalStats > team[top]!.totalStats ? index : top), 0);
+  return [team[best]!, ...team.filter((_, index) => index !== best)];
+}
+
 function TeamColumn({ title, team, total }: { title: string; team: PokemonView[]; total: number }) {
   return (
-    <section aria-label={`Equipo de ${title}`} className="flex flex-col gap-2">
-      <h2 className="text-sm text-muted">{title}</h2>
-      <p className="font-num text-2xl font-medium tabular-nums">{total}</p>
+    <section aria-label={`Equipo de ${title}`} className="flex flex-col gap-3">
+      <div className="flex items-baseline justify-between gap-2">
+        <h2 className="truncate font-display text-lg font-semibold">{title}</h2>
+        <p className="font-num text-3xl font-semibold tabular-nums">{total}</p>
+      </div>
       {team.length === 0 ? <p className="text-sm text-muted">No ganó ningún Pokémon.</p> : null}
-      {team.map((pokemon) => (
-        <PokemonCard key={pokemon.id} pokemon={pokemon} showStats />
+      {bestFirst(team).map((pokemon, index) => (
+        <PokemonCard key={pokemon.id} pokemon={pokemon} showStats size={index === 0 ? "lg" : "sm"} />
       ))}
     </section>
   );
@@ -28,6 +38,22 @@ export function scoreLabel(ended: GameEndedPayload, mySeat: Seat): string {
   return `${ended.totals[mySeat]} – ${ended.totals[mySeat === 1 ? 2 : 1]}`;
 }
 
+function TrophyIcon() {
+  return (
+    <svg viewBox="0 0 24 24" className="size-9" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
+      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
+    </svg>
+  );
+}
+
+function BalanceIcon() {
+  return (
+    <svg viewBox="0 0 24 24" className="size-9" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
+      <path d="M5 9h14M5 15h14" />
+    </svg>
+  );
+}
+
 export function SummaryView() {
   const { view, opponent } = useRoom();
   const navigate = useNavigate();
@@ -37,32 +63,38 @@ export function SummaryView() {
   const mySeat = view.mySeat;
   const rivalSeat: Seat = mySeat === 1 ? 2 : 1;
   const verdict = verdictLabel(ended, mySeat);
+  const kind = ended.winnerSeat === null ? "drawn" : ended.winnerSeat === mySeat ? "won" : "lost";
 
   return (
-    <section className="flex flex-col gap-5">
-      <div className="framed rounded-card bg-surface p-5 text-center">
-        <h1 className="text-2xl font-medium">{verdict}</h1>
+    <section className="flex flex-col gap-6">
+      <Card data-verdict={kind} tone="raised" className={`p-8 text-center ${kind === "won" ? "border-gold animate-halo" : ""}`}>
+        {kind === "lost" ? null : (
+          <span aria-hidden="true" className={`mx-auto mb-3 inline-flex size-16 items-center justify-center rounded-full ${kind === "won" ? "bg-gold text-gold-fg" : "bg-surface-2 text-fg"}`}>
+            {kind === "won" ? <TrophyIcon /> : <BalanceIcon />}
+          </span>
+        )}
+        <h1 className="font-display text-4xl font-semibold">{verdict}</h1>
         <p className="mt-1 text-sm text-muted">{END_REASON_LABELS[ended.reason]}</p>
-        <p className="mt-2 font-num text-lg tabular-nums">
-          {scoreLabel(ended, mySeat)}
-        </p>
-      </div>
+        <p className="mt-3 font-num text-3xl tabular-nums">{scoreLabel(ended, mySeat)}</p>
+      </Card>
 
-      <div className="grid gap-5 md:grid-cols-2">
+      <div className="grid gap-6 md:grid-cols-2">
         <TeamColumn title="Tú" team={ended.teams[mySeat]} total={ended.totals[mySeat]} />
         <TeamColumn title={opponent?.username ?? "Tu rival"} team={ended.teams[rivalSeat]} total={ended.totals[rivalSeat]} />
       </div>
 
       <div className="flex flex-wrap justify-center gap-3">
-        <Button variant="primary" onClick={() => navigate("/", { state: { config: view.config } })}>
+        <Button variant="primary" size="lg" onClick={() => navigate("/", { state: { config: view.config } })}>
           Jugar de nuevo
         </Button>
         {opponent ? (
-          <Button onClick={() => navigate(`/jugador/${encodeURIComponent(opponent.username)}`)}>
+          <Button size="lg" onClick={() => navigate(`/jugador/${encodeURIComponent(opponent.username)}`)}>
             Ver perfil de {opponent.username}
           </Button>
         ) : null}
-        <Button onClick={() => navigate("/")}>Volver al lobby</Button>
+        <Button size="lg" variant="ghost" onClick={() => navigate("/")}>
+          Volver al lobby
+        </Button>
       </div>
     </section>
   );
```

`client/src/pages/profile/StatsView.tsx`:

```diff
diff --git a/client/src/pages/profile/StatsView.tsx b/client/src/pages/profile/StatsView.tsx
index dabf3fc..18c2511 100644
--- a/client/src/pages/profile/StatsView.tsx
+++ b/client/src/pages/profile/StatsView.tsx
@@ -1,19 +1,9 @@
 import type { Stats } from "@pokemon-minigames/shared";
 import { Notice } from "../../components/Notice";
 import { PokemonCard } from "../../components/PokemonCard";
+import { StatTile } from "../../components/StatTile";
 import { formatPercent, formatPower, formatScore, winsLabel } from "./format";
 
-const SECTION = "framed rounded-card bg-surface p-4";
-
-function Fact({ label, value }: { label: string; value: string }) {
-  return (
-    <div>
-      <dt className="text-sm text-muted">{label}</dt>
-      <dd className="font-num text-2xl font-medium tabular-nums">{value}</dd>
-    </div>
-  );
-}
-
 /** Las estadísticas de una persona. `own` solo cambia la persona gramatical de los mensajes. */
 export function StatsView({ stats, own }: { stats: Stats; own: boolean }) {
   if (stats.played === 0) {
@@ -21,38 +11,45 @@ export function StatsView({ stats, own }: { stats: Stats; own: boolean }) {
   }
 
   return (
-    <div className="flex flex-col gap-4">
-      <section aria-label="Resumen" className={SECTION}>
-        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
-          <Fact label="Partidas" value={String(stats.played)} />
-          <Fact label="Ganadas" value={String(stats.wins)} />
-          <Fact label="Empatadas" value={String(stats.draws)} />
-          <Fact label="Perdidas" value={String(stats.losses)} />
-          <Fact label="Victorias" value={formatPercent(stats.winRate)} />
-          <Fact label="Racha actual" value={String(stats.currentStreak)} />
-          <Fact label="Mejor racha" value={String(stats.bestStreak)} />
+    <div className="flex flex-col gap-6">
+      <section aria-label="Resumen">
+        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
+          <StatTile label="Partidas" value={String(stats.played)} />
+          <StatTile label="Ganadas" value={String(stats.wins)} />
+          <StatTile label="Empatadas" value={String(stats.draws)} />
+          <StatTile label="Perdidas" value={String(stats.losses)} />
+          <StatTile label="Victorias" value={formatPercent(stats.winRate)} ring={stats.winRate} />
+          <StatTile label="Racha actual" value={String(stats.currentStreak)} />
+          <StatTile label="Mejor racha" value={String(stats.bestStreak)} />
         </dl>
       </section>
 
-      <section aria-label="Poder" className={SECTION}>
-        <dl className="grid grid-cols-2 gap-4">
-          <Fact label="Poder promedio" value={formatPower(stats.averagePower)} />
-          <Fact label="Mejor partida" value={formatScore(stats.bestGameScore)} />
+      <section aria-label="Poder">
+        <dl className="grid grid-cols-2 gap-3">
+          <StatTile label="Poder promedio" value={formatPower(stats.averagePower)} />
+          <StatTile label="Mejor partida" value={formatScore(stats.bestGameScore)} />
         </dl>
       </section>
 
       <section aria-label="Pokémon más ganados">
-        <h2 className="mb-2 text-sm text-muted">Pokémon más ganados</h2>
+        <h2 className="mb-3 font-display text-lg font-semibold">Pokémon más ganados</h2>
         {stats.topPokemon.length === 0 ? (
           <p className="text-sm text-muted">
             {own ? "Todavía no has ganado ningún Pokémon." : "Todavía no ha ganado ningún Pokémon."}
           </p>
         ) : (
-          <ul className="grid gap-3 md:grid-cols-3">
-            {stats.topPokemon.map(({ pokemon, wins }) => (
-              <li key={pokemon.id}>
-                <PokemonCard pokemon={pokemon} />
-                <p className="mt-1 text-center text-sm text-muted">{winsLabel(wins)}</p>
+          <ul className="grid gap-4 md:grid-cols-3">
+            {stats.topPokemon.map(({ pokemon, wins }, index) => (
+              <li key={pokemon.id} className="relative">
+                <span
+                  data-medal
+                  aria-hidden="true"
+                  className="absolute left-3 top-3 z-10 inline-flex size-8 items-center justify-center rounded-full bg-gold font-display font-semibold text-gold-fg"
+                >
+                  {index + 1}
+                </span>
+                <PokemonCard pokemon={pokemon} size="lg" />
+                <p className="mt-2 text-center text-sm text-muted">{winsLabel(wins)}</p>
               </li>
             ))}
           </ul>
```

`client/src/pages/profile/ProfilePage.tsx`:

```diff
diff --git a/client/src/pages/profile/ProfilePage.tsx b/client/src/pages/profile/ProfilePage.tsx
index 98866b0..eeb16d3 100644
--- a/client/src/pages/profile/ProfilePage.tsx
+++ b/client/src/pages/profile/ProfilePage.tsx
@@ -1,6 +1,8 @@
 import { useNavigate, useParams } from "react-router";
 import { ApiError } from "../../api/client";
+import { Avatar } from "../../components/Avatar";
 import { Button } from "../../components/Button";
+import { LogoMark } from "../../components/Logo";
 import { Notice } from "../../components/Notice";
 import { errorMessage } from "../../i18n/es";
 import { useServices } from "../../services";
@@ -24,9 +26,10 @@ export function ProfilePage() {
 
   if (state.status === "loading") {
     return (
-      <p role="status" className="text-center text-muted">
-        Cargando perfil…
-      </p>
+      <div role="status" className="flex flex-col items-center gap-3 py-12 text-muted">
+        <LogoMark size={40} className="animate-spin-slow" />
+        <p>Cargando perfil…</p>
+      </div>
     );
   }
 
@@ -35,6 +38,9 @@ export function ProfilePage() {
     const message = state.error instanceof ApiError ? state.error.message : errorMessage(undefined);
     return (
       <section className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
+        <div data-lost aria-hidden="true">
+          <LogoMark size={72} className="opacity-40" />
+        </div>
         <Notice tone="danger">{message}</Notice>
         {notFound ? (
           <Button variant="primary" onClick={() => navigate("/")}>
@@ -52,9 +58,12 @@ export function ProfilePage() {
   const { username: name, stats } = state.data;
   return (
     <div className="mx-auto flex max-w-3xl flex-col gap-5">
-      <header>
-        <h1 className="text-2xl font-medium">{own ? "Tu perfil" : name}</h1>
-        {own ? <p className="text-muted">{name}</p> : null}
+      <header className="flex items-center gap-4">
+        <Avatar name={name} size="xl" />
+        <div className="min-w-0">
+          <h1 className="truncate font-display text-3xl font-semibold">{own ? "Tu perfil" : name}</h1>
+          {own ? <p className="text-muted">{name}</p> : null}
+        </div>
       </header>
       <StatsView stats={stats} own={own} />
       {own ? <HistoryList /> : null}
```

`client/src/pages/profile/HistoryList.tsx`:

```diff
diff --git a/client/src/pages/profile/HistoryList.tsx b/client/src/pages/profile/HistoryList.tsx
index 509b2f4..2966da9 100644
--- a/client/src/pages/profile/HistoryList.tsx
+++ b/client/src/pages/profile/HistoryList.tsx
@@ -1,6 +1,8 @@
 import type { GameResult, HistoryEntry } from "@pokemon-minigames/shared";
 import { useEffect, useRef, useState } from "react";
 import { Link, useNavigate } from "react-router";
+import { Avatar } from "../../components/Avatar";
+import { Badge } from "../../components/Badge";
 import { Button } from "../../components/Button";
 import { Notice } from "../../components/Notice";
 import { RESULT_LABELS, describeConfig, historyReason } from "../../i18n/es";
@@ -8,28 +10,33 @@ import { useServices } from "../../services";
 import { formatDate, formatScore } from "./format";
 import { useLoad } from "./use-load";
 
-const RESULT_STYLE: Record<GameResult, string> = {
-  won: "text-success",
-  drawn: "text-muted",
-  lost: "text-danger",
+const RESULT_TONE: Record<GameResult, "success" | "neutral" | "danger"> = {
+  won: "success",
+  drawn: "neutral",
+  lost: "danger",
 };
 
 function HistoryRow({ game }: { game: HistoryEntry }) {
   return (
     // tabIndex -1: se puede enfocar por código (al cargar más partidas) sin entrar en el orden de tabulación.
-    <li tabIndex={-1} className="framed rounded-card bg-surface p-3">
-      <div className="flex flex-wrap items-baseline justify-between gap-2">
-        <span className={`font-medium ${RESULT_STYLE[game.result]}`}>{RESULT_LABELS[game.result]}</span>
-        <span className="font-num tabular-nums">{`${formatScore(game.myScore)} – ${formatScore(game.opponentScore)}`}</span>
+    <li tabIndex={-1} className="framed rounded-card bg-surface p-4 shadow-card">
+      <div className="flex items-center gap-3">
+        <Avatar name={game.opponent.username} size="md" />
+        <div className="min-w-0 flex-1">
+          <p className="truncate text-sm">
+            contra{" "}
+            <Link to={`/jugador/${encodeURIComponent(game.opponent.username)}`} className="font-semibold underline">
+              {game.opponent.username}
+            </Link>
+          </p>
+          <p className="text-sm text-muted">{historyReason(game.reason, game.result)}</p>
+        </div>
+        <div className="text-right">
+          <Badge tone={RESULT_TONE[game.result]}>{RESULT_LABELS[game.result]}</Badge>
+          <p className="mt-1 font-num text-lg font-semibold tabular-nums">{`${formatScore(game.myScore)} – ${formatScore(game.opponentScore)}`}</p>
+        </div>
       </div>
-      <p className="mt-1 text-sm">
-        contra{" "}
-        <Link to={`/jugador/${encodeURIComponent(game.opponent.username)}`} className="underline">
-          {game.opponent.username}
-        </Link>
-      </p>
-      <p className="text-sm text-muted">{historyReason(game.reason, game.result)}</p>
-      <p className="text-sm text-muted">{describeConfig(game.config)}</p>
+      <p className="mt-2 text-xs text-muted">{describeConfig(game.config)}</p>
       <p className="text-xs text-muted">
         <time dateTime={game.endedAt}>{formatDate(game.endedAt)}</time>
       </p>
@@ -128,7 +135,7 @@ export function HistoryList() {
 
   return (
     <section className="flex flex-col gap-3">
-      <h2 className="text-lg font-medium">Historial</h2>
+      <h2 className="font-display text-lg font-semibold">Historial</h2>
       {body}
     </section>
   );
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
cd client && npx vitest run --testTimeout=30000 --maxWorkers=2
cd .. && npm run typecheck
```

Expected: PASS (todo el cliente: **623 pruebas**) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): resumen con veredicto y equipos con arte, y perfil con anillo, podio e historial en insignias" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Detalles de Pokédex, capturas y README

**Files:**
- Create: `client/test/components/pokedex-details.test.tsx`, `client/test/theme/readme.test.ts`, `e2e/tests/screenshots.spec.ts`, `docs/img/login.jpg`, `docs/img/lobby.jpg`, `docs/img/ronda.jpg`, `docs/img/resultado.jpg`, `docs/img/resumen.jpg`, `docs/img/perfil.jpg`, `docs/img/pokedex.jpg`
- Modify: `client/src/components/Header.tsx`, `README.md`
- Test (modificar): `e2e/tests/theme.spec.ts`

**Interfaces:**
- Produces: las luces decorativas del encabezado (`data-leds`, `aria-hidden`, cuatro elementos), solo visibles con `in-data-[theme=pokedex]:flex`. La prueba E2E `theme.spec.ts` ahora cambia el tema desde el menú de apariencia y comprueba los radios del menú en el navegador nuevo. `e2e/tests/screenshots.spec.ts` genera las capturas del README (1280 × 720, Clásico oscuro, salvo la de Pokédex en claro): solo corre con `E2E_SCREENSHOTS=1`; si no, se omite. El README gana la sección «Capturas», el estado de la etapa 6 y lo que explica las tipografías, el movimiento y el aviso de proyecto de fans.

- [ ] **Step 1: Escribir las pruebas que fallan**

`client/test/components/pokedex-details.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Header } from "../../src/components/Header";
import { fakeServices, renderWithServices, signIn } from "../helpers/services";

describe("detalles del tema Pokédex", () => {
  it("el encabezado lleva unas luces decorativas que solo se ven en Pokédex", () => {
    const { container } = renderWithServices(<Header />);
    const leds = container.querySelector("[data-leds]")!;
    expect(leds).toHaveAttribute("aria-hidden", "true");
    expect(leds.className).toContain("hidden");
    expect(leds.className).toContain("in-data-[theme=pokedex]:flex");
    expect(leds.children).toHaveLength(4);
  });

  it("las luces no cambian el nombre accesible del enlace al lobby ni añaden texto", () => {
    const { container } = renderWithServices(<Header />);
    expect(screen.getByRole("link", { name: "Pokémon Minigames" })).toBeInTheDocument();
    expect(container.querySelector("[data-leds]")!.textContent).toBe("");
  });

  it("con la sesión iniciada también están", () => {
    const services = fakeServices();
    signIn(services);
    const { container } = renderWithServices(<Header />, { services });
    expect(container.querySelector("[data-leds]")).not.toBeNull();
  });
});
```

`client/test/theme/readme.test.ts` (el README enseña las siete capturas, existen, son ligeras y tienen texto alternativo):

```ts
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../../..");
const readme = readFileSync(join(root, "README.md"), "utf8");
const images = [...readme.matchAll(/!\[([^\]]+)\]\((docs\/img\/[^)]+)\)/g)].map((match) => ({ alt: match[1]!, path: match[2]! }));

describe("README (etapa 6)", () => {
  it("dice que el rediseño está hecho y no que falta algo", () => {
    expect(readme).toContain("etapa 6");
    expect(readme).not.toMatch(/etapa 5 de 5/);
  });

  it("muestra las pantallas principales: acceso, lobby, ronda, resultado, resumen, perfil y el tema Pokédex", () => {
    expect(images.map((image) => image.path.split("/").pop())).toEqual([
      "login.jpg",
      "lobby.jpg",
      "ronda.jpg",
      "resultado.jpg",
      "resumen.jpg",
      "perfil.jpg",
      "pokedex.jpg",
    ]);
  });

  it("cada imagen existe, es ligera y tiene un texto alternativo que la describe", () => {
    for (const { alt, path } of images) {
      const file = join(root, path);
      expect(existsSync(file), path).toBe(true);
      expect(statSync(file).size, `${path} pesa demasiado`).toBeLessThan(250_000);
      expect(alt.length, path).toBeGreaterThan(15);
    }
  });

  it("explica las fuentes empaquetadas, el movimiento y la regla de «reducir movimiento»", () => {
    expect(readme).toMatch(/Fredoka/);
    expect(readme).toMatch(/reducir movimiento/);
  });

  it("incluye el aviso de que es un proyecto de fans", () => {
    expect(readme).toMatch(/proyecto de fans/i);
  });
});
```

`e2e/tests/theme.spec.ts` (el control de tema cambió en la Task 6; la E2E se actualiza aquí, donde vuelve a correr):

```diff
diff --git a/e2e/tests/theme.spec.ts b/e2e/tests/theme.spec.ts
index b4639bc..3b84337 100644
--- a/e2e/tests/theme.spec.ts
+++ b/e2e/tests/theme.spec.ts
@@ -6,11 +6,13 @@ test("el tema guardado en el perfil se aplica en un navegador nuevo tras iniciar
   const second = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": first.ip } });
   try {
     await register(first);
+    // El tema y el modo se eligen desde el menú de apariencia del encabezado (botones segmentados).
+    await first.page.getByRole("button", { name: "Apariencia" }).click();
     const saved = first.page.waitForResponse((r) => r.url().endsWith("/auth/me/preferences") && r.request().method() === "PUT");
-    await first.page.getByRole("combobox", { name: "Tema" }).selectOption("pokedex");
+    await first.page.getByText("Pokédex", { exact: true }).click();
     await saved;
     const savedMode = first.page.waitForResponse((r) => r.url().endsWith("/auth/me/preferences") && r.request().method() === "PUT");
-    await first.page.getByRole("combobox", { name: "Modo" }).selectOption("oscuro");
+    await first.page.getByText("Oscuro", { exact: true }).click();
     expect((await savedMode).status()).toBe(200);
 
     // Otro navegador (sin nada guardado): al iniciar sesión se aplica la preferencia del perfil.
@@ -21,7 +23,9 @@ test("el tema guardado en el perfil se aplica en un navegador nuevo tras iniciar
     await expect(page.getByRole("heading", { name: "Lobby" })).toBeVisible();
     await expect(page.locator("html")).toHaveAttribute("data-theme", "pokedex");
     await expect(page.locator("html")).toHaveAttribute("data-mode", "oscuro");
-    await expect(page.getByRole("combobox", { name: "Tema" })).toHaveValue("pokedex");
+    await page.getByRole("button", { name: "Apariencia" }).click();
+    await expect(page.getByRole("radio", { name: "Pokédex" })).toBeChecked();
+    await expect(page.getByRole("radio", { name: "Oscuro" })).toBeChecked();
   } finally {
     await first.context.close();
     await second.close();
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
cd client && npx vitest run test/components/pokedex-details.test.tsx test/theme/readme.test.ts
```

Expected: FAIL — no hay luces en el encabezado, ni capturas, ni lo nuevo en el README.

- [ ] **Step 3: Implementar**

`client/src/components/Header.tsx` (las luces de adorno del tema Pokédex):

```diff
diff --git a/client/src/components/Header.tsx b/client/src/components/Header.tsx
index 9f3f0d6..975b9fd 100644
--- a/client/src/components/Header.tsx
+++ b/client/src/components/Header.tsx
@@ -30,6 +30,13 @@ export function Header() {
   return (
     <header className="sticky top-0 z-20 border-b-(length:--frame) border-line bg-header text-header-fg">
       <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2.5 sm:gap-3">
+        {/* Luces de adorno: solo en el tema Pokédex (el encabezado rojo tipo consola). */}
+        <span data-leds aria-hidden="true" className="hidden items-center gap-1.5 in-data-[theme=pokedex]:flex">
+          <span className="size-6 rounded-full border-2 border-header-fg bg-accent-2" />
+          <span className="size-2 rounded-full bg-gold" />
+          <span className="size-2 rounded-full bg-success" />
+          <span className="size-2 rounded-full bg-danger" />
+        </span>
         <Link to="/" className="rounded-ui">
           <Logo hideNameOnMobile={Boolean(user)} />
         </Link>
```

`e2e/tests/screenshots.spec.ts` (juega una partida de 3 rondas con dos personas y fotografía cada pantalla; no es una prueba: solo corre si se pide):

```ts
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type BrowserContext, type Page, expect, test } from "@playwright/test";
import { answer, fact, joinRoom, newPlayer, register, roundTypes, validAnswerFor } from "../support/app";

/**
 * Genera las capturas del README (`docs/img/*.jpg`). No es una prueba: solo corre si se pide a propósito,
 *
 *   E2E_SCREENSHOTS=1 npm run e2e -w e2e -- screenshots
 *
 * Juega una partida entera de 3 rondas con dos personas y fotografía cada pantalla (1280 × 720, tema Clásico oscuro,
 * salvo la del tema Pokédex).
 */
test.skip(!process.env.E2E_SCREENSHOTS, "Solo para generar las capturas del README (E2E_SCREENSHOTS=1)");

const OUT = fileURLToPath(new URL("../../docs/img/", import.meta.url));
const VIEWPORT = { width: 1280, height: 720 };

async function useTheme(context: BrowserContext, theme: "clasico" | "pokedex", mode: "claro" | "oscuro"): Promise<void> {
  await context.addInitScript(
    ([value]) => localStorage.setItem("pokemon-minigames:theme", value as string),
    [JSON.stringify({ theme, mode })],
  );
}

/** Espera a que se carguen las tipografías y terminen las animaciones de entrada, y guarda la imagen. */
async function shoot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}${name}.jpg`, type: "jpeg", quality: 82 });
}

test("captura las pantallas principales para el README", async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const ash = await newPlayer(browser, "ash");
  const misty = await newPlayer(browser, "misty");
  const visitor = await newPlayer(browser, "visitante");
  try {
    for (const player of [ash, misty, visitor]) {
      await player.page.setViewportSize(VIEWPORT);
      await useTheme(player.context, "clasico", "oscuro");
    }

    // Acceso: alguien que todavía no ha entrado.
    await visitor.page.goto("/login");
    await expect(visitor.page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await shoot(visitor.page, "login");

    await register(ash);
    await register(misty);
    await shoot(ash.page, "lobby");

    // Una partida de 3 rondas: Ash acierta siempre y Misty responde algo que no existe.
    await ash.page.getByRole("button", { name: "Crear sala" }).click();
    const code = ((await ash.page.getByLabel("Código de la sala").textContent()) ?? "").trim();
    await joinRoom(misty.page, code);

    for (let round = 1; round <= 3; round++) {
      const types = await roundTypes(ash.page);
      expect(await roundTypes(misty.page)).toEqual(types);
      const solution = validAnswerFor(types);

      if (round === 1) {
        // Ronda en juego, con el campo de respuesta a medio escribir y sus sugerencias.
        await ash.page.getByRole("combobox", { name: "Nombre del Pokémon" }).fill(solution.slice(0, 3));
        await expect(ash.page.getByRole("listbox", { name: "Sugerencias" })).toBeVisible();
        await shoot(ash.page, "ronda");
      }

      await answer(ash.page, solution);
      await answer(misty.page, "zzzzzz");

      if (round === 1) {
        // El resultado de la ronda, con el arte oficial del Pokémon ganado.
        await expect(ash.page.getByRole("heading", { name: "Resultado de la ronda 1" })).toBeVisible({ timeout: 30_000 });
        await ash.page.locator("section[data-result='VALID'] img").first().waitFor();
        await ash.page.waitForFunction(() => {
          const image = document.querySelector("section[data-result='VALID'] img") as HTMLImageElement | null;
          return image?.complete && image.naturalWidth > 0;
        });
        await shoot(ash.page, "resultado");
      }
    }

    await expect(ash.page.getByRole("heading", { name: "Ganaste" })).toBeVisible({ timeout: 40_000 });
    await ash.page.waitForFunction(() => [...document.images].every((image) => image.complete));
    await shoot(ash.page, "resumen");

    await ash.page.getByRole("link", { name: "Mi perfil" }).click();
    await expect(ash.page.getByRole("heading", { name: "Tu perfil" })).toBeVisible();
    await expect(fact(ash.page, "Partidas")).toHaveText("1");
    await ash.page.waitForFunction(() => [...document.images].every((image) => image.complete));
    await shoot(ash.page, "perfil");

    // El otro tema: Pokédex (claro), elegido desde el menú de apariencia (el del perfil manda al iniciar sesión).
    await ash.page.goto("/");
    await expect(ash.page.getByRole("heading", { name: "Lobby" })).toBeVisible();
    await ash.page.getByRole("button", { name: "Apariencia" }).click();
    await ash.page.getByText("Pokédex", { exact: true }).click();
    await ash.page.getByText("Claro", { exact: true }).click();
    await ash.page.keyboard.press("Escape");
    await expect(ash.page.locator("html")).toHaveAttribute("data-theme", "pokedex");
    await shoot(ash.page, "pokedex");
  } finally {
    await ash.context.close();
    await misty.context.close();
    await visitor.context.close();
  }
});
```

Construir y generar las siete capturas (en `docs/img/`; el navegador se elige como en la E2E):

```bash
npm run build
E2E_CHANNEL=msedge E2E_SCREENSHOTS=1 npm run e2e -w e2e -- screenshots
```

Mira las siete imágenes (cada una pesa unos 45 a 75 KB): deben mostrar la pantalla de acceso, el lobby, una ronda con sugerencias, el resultado con el arte oficial, el resumen «Ganaste», el perfil y el lobby en Pokédex claro con las luces del encabezado.

`README.md` (estado, capturas, y el párrafo de tipografías, movimiento y aviso de fans en «Temas y accesibilidad»):

```diff
diff --git a/README.md b/README.md
index 884d120..fcf004d 100644
--- a/README.md
+++ b/README.md
@@ -2,7 +2,25 @@
 
 Juego web de 2 jugadores en tiempo real: en cada ronda se enfrenta un par de tipos Pokémon y cada jugador tiene 15 s para nombrar un Pokémon que tenga ambos. Gana quien acumule más stats base. El diseño completo está en [`docs/superpowers/specs/`](docs/superpowers/specs/).
 
-**Estado:** etapa 5 de 5. El juego está completo (servidor, cliente web, estadísticas, perfil y temas) y listo para desplegarse gratis en Render y Neon: la guía está en [`docs/despliegue.md`](docs/despliegue.md).
+**Estado:** etapa 6 (rediseño visual del cliente) completa sobre el juego de las etapas 1 a 5: servidor, cliente web, estadísticas, perfil y temas. Listo para desplegarse gratis en Render y Neon: la guía está en [`docs/despliegue.md`](docs/despliegue.md).
+
+## Capturas
+
+Tema Clásico oscuro, en un navegador de 1280 × 720 (las genera la prueba `e2e/tests/screenshots.spec.ts`).
+
+![Pantalla de acceso con el lema, cómo se juega, una tarjeta de ejemplo y el formulario](docs/img/login.jpg)
+
+![Lobby con las tarjetas para crear una sala y para unirse con un código](docs/img/lobby.jpg)
+
+![Ronda en juego: el par de tipos, el anillo del cronómetro y el campo de respuesta con sugerencias](docs/img/ronda.jpg)
+
+![Resultado de la ronda con el arte oficial del Pokémon ganado y las insignias de cada jugador](docs/img/resultado.jpg)
+
+![Resumen de la partida: Ganaste, el marcador y el equipo con sus seis stats](docs/img/resumen.jpg)
+
+![Perfil con las fichas de estadísticas, el anillo de victorias y los Pokémon más ganados](docs/img/perfil.jpg)
+
+![El tema Pokédex en claro: encabezado rojo con luces, bordes marcados y letra monoespaciada](docs/img/pokedex.jpg)
 
 ## Estructura
 
@@ -73,7 +91,11 @@ En **Mi perfil** (`/perfil`) cada persona ve sus partidas jugadas, ganadas, empa
 
 ## Temas y accesibilidad
 
-Cada jugador elige entre dos temas, **Clásico** y **Pokédex** (retro, con números en monoespaciada y bordes rectos), y entre modo automático, claro u oscuro; la preferencia se guarda en el navegador y, con la sesión iniciada, también en tu perfil (al entrar en otro navegador se aplica la del perfil). Los colores de todos los temas y de los 18 tipos cumplen el contraste AA de WCAG (lo comprueban las pruebas). Para revisar lo que realmente se ve, pega [`client/scripts/contrast-audit.js`](client/scripts/contrast-audit.js) en la consola del navegador y ejecuta `__contrastAuditAll()`.
+Cada jugador elige entre dos temas, **Clásico** (moderno y colorido: esquinas muy redondeadas, relieve, fondo con degradado y tipografía Fredoka) y **Pokédex** (la piel retro del mismo diseño: bordes marcados, sin sombras difusas y letra monoespaciada JetBrains Mono), y entre modo automático, claro u oscuro desde el botón «Apariencia» del encabezado; la preferencia se guarda en el navegador y, con la sesión iniciada, también en tu perfil (al entrar en otro navegador se aplica la del perfil). Los colores de todos los temas y de los 18 tipos cumplen el contraste AA de WCAG (lo comprueban las pruebas). Para revisar lo que realmente se ve, pega [`client/scripts/contrast-audit.js`](client/scripts/contrast-audit.js) en la consola del navegador y ejecuta `__contrastAuditAll()`.
+
+Las tipografías (Fredoka, Nunito y JetBrains Mono) se empaquetan con el proyecto (`@fontsource-variable`), sin pedir nada a servicios externos. Las animaciones son CSS puro y los números de los marcadores cuentan hasta su valor nuevo; si el sistema pide **reducir movimiento**, una sola regla apaga todas las animaciones y los números saltan directo al valor final. El arte de cada Pokémon es el oficial de [PokeAPI](https://pokeapi.co) (solo donde hay pocas imágenes a la vez; en las listas, el sprite pequeño), con un esqueleto mientras carga y una bola neutra si falla. Este es un proyecto de fans sin fines de lucro: Pokémon y sus personajes son marcas de Nintendo, Game Freak y The Pokémon Company, y no hay relación con ellos.
+
+Para regenerar las capturas de arriba: `E2E_SCREENSHOTS=1 npm run e2e -w e2e -- screenshots` (con `E2E_CHANNEL=msedge` si no instalaste Chromium); sin esa variable la prueba se omite.
 
 ## API REST
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
cd client && npx vitest run --testTimeout=30000 --maxWorkers=2
cd .. && npm run typecheck
E2E_CHANNEL=msedge npm run e2e
```

Expected: PASS (todo el cliente: **631 pruebas**), `tsc` sin errores, y la E2E: 4 pruebas pasan y 1 se omite (la de las capturas).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): luces del tema Pokédex, capturas de las pantallas y README del rediseño" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Móvil sin desbordes y auditoría de contraste real

**Files:**
- Create: `client/test/pages/mobile-layout.test.tsx`
- Modify: `client/scripts/contrast-audit.js`, `client/src/pages/room/RoundView.tsx`, `client/src/pages/room/RoundResultView.tsx`, `client/src/pages/room/SummaryView.tsx`, `client/src/pages/Lobby.tsx`, `client/src/pages/AuthPages.tsx`, `client/src/pages/profile/StatsView.tsx`

**Interfaces:**
- Produces: todas las cuadrículas de una columna en móvil llevan `grid-cols-1`; la ronda usa `md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)]` y su arena `min-w-0`. `__contrastAudit()` entiende los degradados: cuando el fondo es un degradado mide el texto contra cada color de su lista y cuenta el peor (antes medía contra blanco el texto que cae sobre el degradado de la página, y daba avisos falsos en los modos oscuros).

- [ ] **Step 1: Escribir la prueba que falla**

Este defecto no se vio hasta recorrer la ronda en un móvil de 375 px: el aviso «El par elegido no tenía suficientes Pokémon…» y el campo de respuesta ensanchaban la tarjeta (407 px de ancho en una pantalla de 375) y aparecía un desplazamiento horizontal. La prueba fija la regla que lo evita:

`client/test/pages/mobile-layout.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { LoginPage } from "../../src/pages/AuthPages";
import { LobbyPage } from "../../src/pages/Lobby";
import { ProfilePage } from "../../src/pages/profile/ProfilePage";
import { event, pokemon } from "../helpers/events";
import { ash, misty, renderRoom, roundState } from "../helpers/room";
import { fakeServices, renderWithServices } from "../helpers/services";

/**
 * Una columna de cuadrícula sin `grid-cols-1` mide lo que mide su contenido (`min-width: auto`): un campo de texto o un
 * aviso largo ensanchan toda la pantalla y en el móvil aparece un desplazamiento horizontal. Estas pruebas fijan la
 * regla que lo evita; el recorrido real en un móvil de 375 px (Task 14) comprueba que no hay desbordes.
 */
const classesOf = (element: Element | null): string => element?.getAttribute("class") ?? "";

describe("sin desbordes en pantallas estrechas", () => {
  it("ronda: las columnas se pueden encoger (minmax(0, …)) y la arena también", () => {
    const { container } = renderRoom([
      event.roomState({
        phase: "round_active",
        players: [ash({ totalStats: 500, teamSize: 1 }), misty({ totalStats: 400, teamSize: 1 })],
        round: roundState({ number: 2 }),
      }),
    ]);
    const arena = container.querySelector("[data-arena]")!;
    expect(classesOf(arena)).toContain("min-w-0");
    const grid = arena.parentElement!;
    expect(classesOf(grid)).toContain("grid-cols-1");
    expect(classesOf(grid)).toContain("md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)]");
  });

  it("resultado de la ronda: una columna en móvil", () => {
    const { container } = renderRoom([
      event.roomState({ phase: "round_result", roundsPlayed: 1, players: [ash(), misty()] }),
      event.roundResult(),
    ]);
    const grid = container.querySelector("section[data-result]")!.parentElement!;
    expect(classesOf(grid)).toContain("grid-cols-1");
  });

  it("resumen: los dos equipos van en una columna en móvil", () => {
    const { container } = renderRoom([event.roomState({ phase: "finished", players: [ash(), misty()] }), event.gameEnded()]);
    const grid = container.querySelector("section[aria-label^='Equipo de']")!.parentElement!;
    expect(classesOf(grid)).toContain("grid-cols-1");
  });

  it("lobby: las dos tarjetas van en una columna en móvil", () => {
    renderWithServices(<LobbyPage />);
    const grid = screen.getByRole("heading", { level: 2, name: "Crear sala" }).closest("section")!.parentElement!;
    expect(classesOf(grid)).toContain("grid-cols-1");
  });

  it("acceso: el lema y el formulario van en una columna en móvil", () => {
    const { container } = renderWithServices(<LoginPage />);
    expect(classesOf(container.firstElementChild)).toContain("grid-cols-1");
  });

  it("perfil: el podio de Pokémon va en una columna en móvil", async () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn(async () => ({
      username: "ash",
      stats: {
        played: 2,
        wins: 1,
        draws: 0,
        losses: 1,
        winRate: 0.5,
        currentStreak: 1,
        bestStreak: 1,
        averagePower: 300,
        bestGameScore: 300,
        topPokemon: [{ pokemon: pokemon(6, 534), wins: 1 }],
      },
    }));
    renderWithServices(
      <Routes>
        <Route path="/perfil" element={<ProfilePage />} />
      </Routes>,
      { services, route: "/perfil" },
    );
    const top = await screen.findByRole("region", { name: "Pokémon más ganados" });
    expect(classesOf(top.querySelector("ul"))).toContain("grid-cols-1");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
cd client && npx vitest run test/pages/mobile-layout.test.tsx
```

Expected: FAIL — las cuadrículas no llevan `grid-cols-1` y la arena no lleva `min-w-0`.

- [ ] **Step 3: Implementar**

`client/src/pages/room/RoundView.tsx`:

```diff
diff --git a/client/src/pages/room/RoundView.tsx b/client/src/pages/room/RoundView.tsx
index f290353..4ecc4e9 100644
--- a/client/src/pages/room/RoundView.tsx
+++ b/client/src/pages/room/RoundView.tsx
@@ -51,12 +51,12 @@ export function RoundView() {
         {opponent?.username ?? "Rival"} <span className="font-num font-semibold tabular-nums">{opponent?.totalStats ?? 0}</span>
       </p>
 
-      <div className="grid gap-4 md:grid-cols-[1fr_1.6fr_1fr]">
+      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)]">
         <div className="hidden md:block">
           <TeamPanel team={view.myTeam} total={me?.totalStats ?? 0} />
         </div>
 
-        <Card data-arena tone="raised" className="flex flex-col gap-5 p-6">
+        <Card data-arena tone="raised" className="flex min-w-0 flex-col gap-5 p-6">
           <div className="text-center">
             <h1 className="font-display text-sm font-semibold text-muted">{goal}</h1>
             {config?.roundsLimit != null ? <RoundDots total={config.roundsLimit} current={round.number} /> : null}
```

`client/src/pages/room/RoundResultView.tsx`:

```diff
diff --git a/client/src/pages/room/RoundResultView.tsx b/client/src/pages/room/RoundResultView.tsx
index 842fcf6..32ea042 100644
--- a/client/src/pages/room/RoundResultView.tsx
+++ b/client/src/pages/room/RoundResultView.tsx
@@ -68,7 +68,7 @@ export function RoundResultView() {
         {theirs.pokemon ? `, ${theirs.pokemon.names.es}` : ""}.
       </p>
 
-      <div className="grid gap-5 md:grid-cols-2">
+      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
         <ResultCard title="Tú" result={mine} />
         <ResultCard title={opponent?.username ?? "Tu rival"} result={theirs} />
       </div>
```

`client/src/pages/room/SummaryView.tsx`:

```diff
diff --git a/client/src/pages/room/SummaryView.tsx b/client/src/pages/room/SummaryView.tsx
index 37d895c..a58ee6e 100644
--- a/client/src/pages/room/SummaryView.tsx
+++ b/client/src/pages/room/SummaryView.tsx
@@ -78,7 +78,7 @@ export function SummaryView() {
         <p className="mt-3 font-num text-3xl tabular-nums">{scoreLabel(ended, mySeat)}</p>
       </Card>
 
-      <div className="grid gap-6 md:grid-cols-2">
+      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
         <TeamColumn title="Tú" team={ended.teams[mySeat]} total={ended.totals[mySeat]} />
         <TeamColumn title={opponent?.username ?? "Tu rival"} team={ended.teams[rivalSeat]} total={ended.totals[rivalSeat]} />
       </div>
```

`client/src/pages/Lobby.tsx`:

```diff
diff --git a/client/src/pages/Lobby.tsx b/client/src/pages/Lobby.tsx
index 72974ee..f319580 100644
--- a/client/src/pages/Lobby.tsx
+++ b/client/src/pages/Lobby.tsx
@@ -281,7 +281,7 @@ export function LobbyPage() {
         <h1 className="font-display text-3xl font-semibold">Lobby</h1>
       </div>
       <ResumeBanner />
-      <div className="grid gap-6 md:grid-cols-2">
+      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
         <CreateRoomCard initial={state?.config} />
         <JoinRoomCard />
       </div>
```

`client/src/pages/AuthPages.tsx`:

```diff
diff --git a/client/src/pages/AuthPages.tsx b/client/src/pages/AuthPages.tsx
index fb00cdf..7ea7802 100644
--- a/client/src/pages/AuthPages.tsx
+++ b/client/src/pages/AuthPages.tsx
@@ -14,7 +14,7 @@ function useReturnPath(): string {
 /** El lema y la explicación a un lado y el formulario al otro (uno encima del otro en pantallas estrechas). */
 function AuthLayout({ children }: { children: ReactNode }) {
   return (
-    <div className="mx-auto grid max-w-4xl items-center gap-8 md:grid-cols-2 md:gap-12">
+    <div className="mx-auto grid max-w-4xl grid-cols-1 items-center gap-8 md:grid-cols-2 md:gap-12">
       <AuthHero />
       {children}
     </div>
```

`client/src/pages/profile/StatsView.tsx`:

```diff
diff --git a/client/src/pages/profile/StatsView.tsx b/client/src/pages/profile/StatsView.tsx
index 18c2511..ff43424 100644
--- a/client/src/pages/profile/StatsView.tsx
+++ b/client/src/pages/profile/StatsView.tsx
@@ -38,7 +38,7 @@ export function StatsView({ stats, own }: { stats: Stats; own: boolean }) {
             {own ? "Todavía no has ganado ningún Pokémon." : "Todavía no ha ganado ningún Pokémon."}
           </p>
         ) : (
-          <ul className="grid gap-4 md:grid-cols-3">
+          <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
             {stats.topPokemon.map(({ pokemon, wins }, index) => (
               <li key={pokemon.id} className="relative">
                 <span
```

La auditoría de contraste del navegador, ahora con degradados:

```diff
diff --git a/client/scripts/contrast-audit.js b/client/scripts/contrast-audit.js
index 7744732..ecadb5e 100644
--- a/client/scripts/contrast-audit.js
+++ b/client/scripts/contrast-audit.js
@@ -7,11 +7,14 @@
  *
  * Las pruebas automáticas comprueban los pares de colores de los tokens; esto comprueba lo que
  * realmente se ve (un componente con el color de texto equivocado sobre un fondo de otro tema).
- * Se desactivan las transiciones mientras se mide: a mitad de una transición los colores
- * intermedios dan falsos avisos. Se tiene en cuenta la `opacity` del elemento y de sus
+ * Se desactivan las transiciones y animaciones mientras se mide: a mitad de una transición los
+ * colores intermedios dan falsos avisos. Se tiene en cuenta la `opacity` del elemento y de sus
  * ancestros (`getComputedStyle().color` no la incluye y un texto atenuado parecería cumplir).
+ * Cuando el fondo de un elemento (o de su ancestro más cercano con fondo) es un degradado, el
+ * texto se mide contra cada color de la lista del degradado y cuenta el peor: así se cubren el
+ * degradado de la página (`--art-1` arriba, `--art-2` abajo) y el de los chips de tipo.
  * Para medir la lista de sugerencias del autocompletado, ábrela (escribe una letra y pulsa
- * la flecha abajo) antes de ejecutar la auditoría.
+ * la flecha abajo) antes de ejecutar la auditoría; para el menú de apariencia, ábrelo.
  */
 (() => {
   const parse = (color) => {
@@ -38,14 +41,27 @@
     }
     return opacity;
   };
-  const backgroundOf = (element) => {
+  /**
+   * Los fondos posibles de un elemento: un degradado da un fondo por cada color opaco de su lista; un color sólido
+   * (o nada, que es blanco) da uno solo. Los colores con transparencia de los ancestros se superponen encima.
+   */
+  const backgroundsOf = (element) => {
     const layers = [];
+    let bases = null;
     for (let node = element; node; node = node.parentElement) {
-      const color = parse(getComputedStyle(node).backgroundColor);
+      const style = getComputedStyle(node);
+      const stops = style.backgroundImage.includes("gradient(")
+        ? [...style.backgroundImage.matchAll(/rgba?([^)]*)/g)].map((match) => parse(match[0])).filter((color) => color.a === 1)
+        : [];
+      if (stops.length > 0) {
+        bases = stops;
+        break;
+      }
+      const color = parse(style.backgroundColor);
       if (color.a > 0) layers.push(color);
       if (color.a === 1) break;
     }
-    return layers.reverse().reduce((base, layer) => over(layer, base), { r: 255, g: 255, b: 255, a: 1 });
+    return (bases ?? [{ r: 255, g: 255, b: 255, a: 1 }]).map((base) => [...layers].reverse().reduce((under, layer) => over(layer, under), base));
   };
 
   window.__contrastAudit = () => {
@@ -55,16 +71,18 @@
       if (!hasText || element.closest(".sr-only")) continue;
       const style = getComputedStyle(element);
       if (style.display === "none" || style.visibility === "hidden" || (element.tagName === "BUTTON" && element.disabled)) continue;
-      const background = backgroundOf(element);
       const color = parse(style.color);
-      const text = over({ ...color, a: color.a * opacityOf(element) }, background);
-      const [lighter, darker] = [luminance(text), luminance(background)].sort((a, b) => b - a);
-      const ratio = (lighter + 0.05) / (darker + 0.05);
       const size = Number.parseFloat(style.fontSize);
       const large = size >= 24 || (size >= 18.66 && Number.parseInt(style.fontWeight) >= 700);
       const required = large ? 3 : 4.5;
-      if (ratio < required) {
-        problems.push(`${element.tagName.toLowerCase()} «${element.textContent.trim().slice(0, 30)}»: ${ratio.toFixed(2)} (mínimo ${required})`);
+      let worst = Number.POSITIVE_INFINITY;
+      for (const background of backgroundsOf(element)) {
+        const text = over({ ...color, a: color.a * opacityOf(element) }, background);
+        const [lighter, darker] = [luminance(text), luminance(background)].sort((a, b) => b - a);
+        worst = Math.min(worst, (lighter + 0.05) / (darker + 0.05));
+      }
+      if (worst < required) {
+        problems.push(`${element.tagName.toLowerCase()} «${element.textContent.trim().slice(0, 30)}»: ${worst.toFixed(2)} (mínimo ${required})`);
       }
     }
     return problems;
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
cd client && npx vitest run --testTimeout=30000 --maxWorkers=2
cd .. && npm run typecheck
```

Expected: PASS (todo el cliente: **637 pruebas**) y `tsc` sin errores.

- [ ] **Step 5: Recorrer todas las pantallas en el navegador, en 375 px y en escritorio**

Con el servidor y Vite en marcha (`npm run dev` y `npm run dev:client`), crea una cuenta de prueba (por ejemplo `disenio_x@example.com` / `disenio_x` / `pikachu-123`) y recorre cada pantalla con el bot (`PORT=3000 node client/scripts/dev-bot.mjs CODIGO random`; otra vez con `chosen` para ver las teselas):

1. Acceso y registro, lobby, sala de espera, cuenta atrás, elegir tipo, ronda, resultado de la ronda, resumen, perfil y el menú de apariencia abierto.
2. En el navegador pon la ventana a 375 px de ancho y comprueba en cada pantalla que no hay desplazamiento horizontal: en la consola, `document.documentElement.scrollWidth` debe ser igual a `document.documentElement.clientWidth`.
3. Auditoría de contraste real, en cada pantalla de la lista (la lista de sugerencias y el menú, con ellos abiertos): pega el contenido de `client/scripts/contrast-audit.js` en la consola y ejecuta `await __contrastAuditAll()` (o, con `npm run dev:client` en marcha, `eval(await (await fetch("/scripts/contrast-audit.js")).text())`).

Expected: `scrollWidth === clientWidth` en todas las pantallas; `__contrastAuditAll()` devuelve una lista **vacía** para los cuatro temas y modos en cada pantalla; sin errores en la consola del navegador (salvo el 401 esperado de `/auth/refresh` cuando no hay sesión). Borra de la base de desarrollo las cuentas y partidas de prueba cuando termines (`bot_*` y la tuya).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix(client): las columnas de una sola pantalla no ensanchan el móvil; la auditoría de contraste entiende degradados" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Verificación final, mutaciones y entrega

**Files:** ninguno nuevo (verificación; si algo falla, se corrige en la tarea que lo introdujo).

- [ ] **Step 1: Verificación completa**

```bash
npm test
npm run typecheck
npm run build
git status
```

Expected: **1266 pruebas pasan** (629 de servidor, una más omitida en Windows, y 637 de cliente); `tsc` sin errores en los cuatro paquetes; el build deja `client/dist` y `server/dist/index.js`; `git status` no muestra nada pendiente (ni `.env`, ni `dist`, ni `e2e/test-results`).

- [ ] **Step 2: Presupuestos de tamaño**

```bash
cd client && npx vite build
```

Expected: el JavaScript comprimido ronda los 116 KB (partía de 109: no pasa de +40 KB), el CSS sin comprimir queda por debajo de 40 KB (unos 39,9 KB, con las reglas `@font-face` de todos los subconjuntos), y las tipografías latinas que descarga el navegador suman unos 109 KB (Fredoka 30 KB, Nunito 39 KB y JetBrains Mono 40 KB; con el tema Clásico solo se descargan las dos primeras).

- [ ] **Step 3: La E2E con navegadores reales**

```bash
E2E_CHANNEL=msedge npm run e2e
```

Expected: 4 pruebas pasan y 1 se omite (la de las capturas); la base `pokemon_minigames_e2e` desaparece al terminar.

- [ ] **Step 4: Comprobar que las pruebas detectan fallos**

Rompe a propósito cada protección crítica, ejecuta la prueba indicada y restaura. Cada fila debe fallar; después de cada una, `git checkout -- <archivo>`.

| # | Archivo y cambio | Prueba que debe fallar |
|---|---|---|
| 1 | `client/src/game/motion.ts`: se ignora «reducir movimiento»: `const reduced = useReducedMotion();` → `const reduced = false;` | `motion.test.tsx` → «con «reducir movimiento» salta directo al valor final» |
| 2 | `client/src/index.css`: la regla de «reducir movimiento» ya no apaga las transiciones: `transition-duration: 0.01ms !important;` → `1s` | `assets.test.ts` → «una sola regla apaga animaciones y transiciones con «reducir movimiento»» |
| 3 | `client/src/index.css`: la duración base cambia a 300 ms: `--dur-base: 220ms;` | `assets.test.ts` → «define las duraciones y la curva comunes» |
| 4 | `client/src/theme/tokens.css`: el rojo del acento en Clásico claro deja de cumplir contraste con el texto blanco: `#bd2a26` → `#ff0000` | `tokens.test.ts` → «clasico/claro: todos los pares de texto cumplen contraste AA» |
| 5 | `client/src/theme/type-styles.ts`: el degradado de un chip con texto claro se aclara hacia abajo en vez de oscurecerse (el texto blanco pierde contraste) | `type-chip-style.test.tsx` → «fighting: el texto supera 4,5:1 sobre los dos extremos del degradado» y «poison: el texto supera 4,5:1 sobre los dos extremos del degradado» |
| 6 | `client/src/theme/contrast.ts`: `mixHex` redondea hacia abajo: `Math.round` → `Math.floor` | `type-chip-style.test.tsx` → «mezcla dos colores en la proporción pedida» |
| 7 | `client/src/components/ArtImage.tsx`: si falla el arte oficial no se prueba el sprite: va directo a la bola | `art-image.test.tsx` → «si falla el arte oficial cae al sprite» y «si también falla el sprite muestra la bola neutra y ninguna imagen rota» |
| 8 | `client/src/components/ArtImage.tsx`: todas las imágenes se piden de forma perezosa, también las del resultado de ronda | `art-image.test.tsx` → «carga perezosa salvo que se pida lo contrario (el resultado de la ronda la pide)» |
| 9 | `client/src/catalog/artwork.ts`: `artworkUrl` acepta cualquier número: se quita la comprobación | `artwork.test.ts` → «rechaza el id 0 (no es un número de Pokédex)» y «rechaza el id -3 (no es un número de Pokédex)» |
| 10 | `client/src/components/Avatar.tsx`: las iniciales ya no se pasan a mayúsculas: se quita `toUpperCase()` | `avatar.test.tsx` → «ash → AS» y «ash_ketchum → AK» |
| 11 | `client/src/components/Timer.tsx`: el cronómetro se pone rojo desde el principio: `remaining <= urgentAtMs` → `remaining <= 15_000` | `timer-ring.test.tsx` → «en los últimos 5 segundos pasa a rojo y lo marca» |
| 12 | `client/src/components/ThemeMenu.tsx`: Escape ya no cierra el menú de apariencia | `header-theme.test.tsx` → «Escape lo cierra y devuelve el foco al botón» |
| 13 | `client/src/components/ThemeMenu.tsx`: un clic fuera ya no cierra el menú de apariencia | `header-theme.test.tsx` → «un clic fuera lo cierra» |
| 14 | `client/src/components/PokemonCard.tsx`: las barras de stats no tienen tope: se quita `Math.min(100, …)` | `pokemon-card.test.tsx` → «las seis stats son barras decorativas más el número, proporcionales al valor y con tope» |
| 15 | `client/src/pages/room/SummaryView.tsx`: perder y empatar también se celebran con el halo dorado | `summary-profile.test.tsx` → «ganar se celebra con un borde dorado y un halo; empatar o perder, no» |
| 16 | `client/src/pages/room/RoundView.tsx`: la arena de la ronda vuelve a ensanchar el móvil: se quita `min-w-0` | `mobile-layout.test.tsx` → «ronda: las columnas se pueden encoger (minmax(0, …)) y la arena también» |
| 17 | `client/src/components/Footer.tsx`: el enlace a PokeAPI deja de proteger la ventana: se quita `rel="noopener noreferrer"` | `app-shell.test.tsx` → «enlaza a PokeAPI sin dar al sitio acceso a esta ventana» |
| 18 | `client/src/components/Notice.tsx`: el icono del aviso se lee en voz alta: se quita `aria-hidden` | `controls.test.tsx` → «cada tono lleva su icono decorativo y el texto sigue siendo lo único que se lee» |
| 19 | `client/src/pages/room/WaitingView.tsx`: el hueco del rival se lee como contenido: se quita `aria-hidden` | `room-before-game.test.tsx` → «solo, tu avatar y un hueco que palpita (decorativo) esperando al rival» |
| 20 | `client/src/components/Header.tsx`: las luces de adorno se ven también en Clásico: `in-data-[theme=pokedex]:flex` → `flex` | `pokedex-details.test.tsx` → «el encabezado lleva unas luces decorativas que solo se ven en Pokédex» |

Al terminar, `git status` no debe mostrar cambios.

- [ ] **Step 5: Publicar la rama**

```bash
git push -u origin etapa-6-rediseno
```

Expected: rama `etapa-6-rediseno` en `https://github.com/marcovinir/pokemon-minigames`; el primer resultado real de GitHub Actions confirma el CI (corre las 4 pruebas de la E2E y omite la de las capturas). La integración a `main` la decide Marco; al subir `main`, Render redespliega solo y el rediseño queda en https://pokemon-minigames.onrender.com.

---

## Self-Review

**Cobertura de la spec de la etapa 6:**

| Requisito | Tarea |
|---|---|
| §3 Tokens nuevos sin renombrar los actuales, paletas de los dos temas, tipografías empaquetadas, presupuestos | 1 (y 15 para los tamaños) |
| §3 Contraste AA en los 4 temas y modos, también sobre los extremos de los degradados | 1, 4 y 14 |
| §4 Cabecera del documento (icono, `theme-color`, etiquetas para compartir) | 1 |
| §4 Logo propio, avatar con color determinista, arte con respaldo, ayudantes de movimiento | 2 |
| §4 `Button`, `TextField`, `Notice`, `Badge`, `StatTile`, `Card` | 3 |
| §4 `TypeChip` con relieve | 4 |
| §4 `Timer` en anillo, `LoadingScreen` con la bola | 5 |
| §4 Barra superior, menú de apariencia, pie de proyecto de fans | 6 |
| §4 `PokemonCard`, marcadores con puntos animados | 7 |
| §5 Acceso y registro | 8 |
| §5 Lobby | 9 |
| §5 Sala de espera, cuenta atrás, elegir tipo | 10 |
| §5 Ronda y resultado de la ronda | 11 |
| §5 Resumen y perfil, estados de carga y error | 12 |
| §3 Pokédex: luces del encabezado; §7 capturas en el README | 13 |
| §6 Arte (cadena de respaldo, tamaños, carga) y movimiento (`reducir movimiento`) | 1, 2, 5, 7, 11 y 12 |
| §7 Verificación real en 4 temas y modos, 375 px y escritorio; contraste real | 14 |
| §7 Mutaciones, E2E, presupuestos | 15 |

**Decisiones tomadas al escribir el plan (la spec ya las recoge o no las contradice):** el largo de la partida sigue siendo un `<select>` (con flecha propia) y no botones segmentados, porque cuatro opciones con textos largos no caben en una fila en móvil y así las pruebas del lobby no cambian; la barra del marcador de móvil no lleva avatares, porque su texto («Tú 500 · misty 400») es lo que leen las pruebas y los lectores de pantalla; `TYPE_STYLES` conserva su forma (fondo sólido) y el degradado va aparte (`typeGradient`), así las pruebas de colores de tipo no cambian; el arte oficial grande se limita a los resultados, el podio y el mejor Pokémon de cada equipo (y no a todas las listas), para no pedir decenas de imágenes pesadas; y la E2E de las capturas es una prueba que solo corre si se pide (`E2E_SCREENSHOTS=1`) para no alargar el CI.

**Lo que encontró la verificación real (ya corregido en el código de este plan):** (1) la auditoría de contraste del navegador medía contra blanco el texto sobre el degradado de la página y daba avisos falsos en los modos oscuros (los chips de tipo «roca» y «acero»), así que ahora entiende los degradados; (2) en un móvil de 375 px la tarjeta de la ronda medía 407 px por culpa de un aviso largo y del campo de respuesta, porque una columna de cuadrícula sin `grid-cols-1` mide lo que mide su contenido (`min-w-0` y `grid-cols-1` en todas las pantallas, con una prueba); (3) `theme.spec.ts` de la E2E seguía usando los `<select>` del tema, y se actualiza con el menú nuevo; y (4) al generar las capturas, el tema Pokédex no se aplicaba porque la preferencia guardada en el perfil gana al iniciar sesión: la captura lo elige desde el menú de apariencia.

**Fuera de esta etapa:** sonido, confeti, funciones nuevas, cambios en `server/` o `shared/`, otros idiomas, modo sin conexión y reemplazar PokeAPI como origen del arte. **Aparte (no es de esta etapa):** el valor de `TRUST_PROXY` en Render (la prueba 1 de la sección 5 de `docs/despliegue.md` sobre el sitio en vivo dio seis `401` en vez de `401 401 401 401 401 429`: el servidor no ve una IP estable por visitante; probablemente haya que subirlo a `2`).

**Consistencia de tipos:** los nombres se reutilizan tal como están en los bloques `Interfaces` de cada tarea. Todo el código se escribió y ejecutó antes de incluirlo: 637 pruebas de cliente en verde, `tsc` sin errores, la E2E con navegador real, 20 mutaciones a propósito detectadas por las pruebas, y el recorrido de todas las pantallas en escritorio y en 375 px con la auditoría de contraste real limpia en los 4 temas y modos.
