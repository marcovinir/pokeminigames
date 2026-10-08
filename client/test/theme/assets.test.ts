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

  it("con «reducir movimiento» tampoco hay retardos: las tarjetas escalonadas no quedan invisibles esperando su turno", () => {
    const block = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(block).toMatch(/animation-delay:\s*0s\s*!important/);
    expect(block).toMatch(/transition-delay:\s*0s\s*!important/);
  });

  it("define la altura fija del encabezado, de la que cuelga el marcador pegado debajo", () => {
    expect(css).toMatch(/--header-h:\s*calc\(3\.5rem \+ var\(--frame/);
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

describe("foco y bordes de los campos", () => {
  const css = read("src/index.css");

  it("el aro de foco usa el color del tema y, dentro del encabezado, el de su texto (el del tema puede ser el del fondo)", () => {
    expect(css).toMatch(/--color-ring:\s*var\(--ring\)/);
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--ring\)/);
    expect(css).toMatch(/header :focus-visible\s*\{[^}]*outline-color:\s*var\(--header-fg\)/);
  });

  it("los campos tienen su propia clase de borde con el color de contraste", () => {
    expect(css).toMatch(/\.framed-field\s*\{[^}]*border:\s*var\(--frame\) solid var\(--field-edge\)/);
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
