import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const client = join(import.meta.dirname, "../..");
const read = (path: string): string => readFileSync(join(client, path), "utf8");

describe("tipografías empaquetadas", () => {
  const css = read("src/index.css");
  const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((match) => match[1]!);

  it.each(["fredoka", "nunito", "jetbrains-mono"])("%s se instala con el proyecto (no se pide a un servicio externo)", (font) => {
    expect(pkg.dependencies[`@fontsource-variable/${font}`]).toBeDefined();
    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
  });

  // Spec §3: solo los subconjuntos latino y latino extendido, que cubren el español. Importar el CSS de cada paquete
  // declaraba también cirílico, griego, hebreo y vietnamita (14 reglas): no se descargan, pero engordaban el CSS (estaba
  // en 39 899 de 40 000 B) y copiaban al directorio de salida 8 archivos que nadie usa.
  it("se declaran solo los subconjuntos latino y latino extendido de cada familia, más el latino de la letra de la subasta: siete reglas @font-face", () => {
    expect(faces).toHaveLength(7);
    for (const [family, folder] of [
      ["Fredoka Variable", "fredoka"],
      ["Nunito Variable", "nunito"],
      ["JetBrains Mono Variable", "jetbrains-mono"],
    ] as const) {
      const own = faces.filter((face) => face.includes(`font-family: "${family}"`));
      expect(own, family).toHaveLength(2);
      expect(own.map((face) => /-(latin(?:-ext)?)-wght-normal\.woff2/.exec(face)?.[1]).sort()).toEqual(["latin", "latin-ext"]);
      for (const face of own) {
        expect(face).toContain(`url(@fontsource-variable/${folder}/files/`);
        expect(face).toMatch(/font-display:\s*swap/);
        expect(face).toMatch(/font-weight:\s*\d+ \d+/);
        expect(face).toMatch(/unicode-range:\s*U\+/);
      }
    }
    expect(css).not.toMatch(/cyrillic|greek|vietnamese|hebrew/);
  });

  it("los archivos de fuente que referencia el CSS existen en el paquete instalado", () => {
    const files = [...css.matchAll(/url\(@fontsource-variable\/([\w-]+)\/files\/([\w.-]+)\)/g)];
    expect(files).toHaveLength(7);
    for (const [, folder, file] of files) {
      const found = ["../node_modules", "node_modules"].some((base) => existsSync(join(client, base, "@fontsource-variable", folder!, "files", file!)));
      expect(found, `${folder}/${file}`).toBe(true);
    }
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

  it("el aro de foco usa el color del tema y, dentro del encabezado de la aplicación, el de su texto (el del tema puede ser el del fondo)", () => {
    expect(css).toMatch(/--color-ring:\s*var\(--ring\)/);
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--ring\)/);
    // Solo el encabezado de color de la aplicación: un <header> de una página (el del perfil) lleva el aro del tema.
    expect(css).toMatch(/\[data-app-header\] :focus-visible\s*\{[^}]*outline-color:\s*var\(--header-fg\)/);
    expect(css).not.toMatch(/(^|[\s,}])header :focus-visible/m);
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
    expect(html).toMatch(/<meta property="og:title" content="PokeMiniGames"/);
    expect(html).toContain("<title>PokeMiniGames</title>");
    // El nombre viejo no queda en ninguna parte visible de la página (ni título ni metadatos).
    expect(html).not.toMatch(/Pokémon Minigames/i);
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
