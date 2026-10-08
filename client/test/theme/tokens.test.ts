import { TYPE_NAMES } from "@pokemon-minigames/shared";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, readableOn, relativeLuminance } from "../../src/theme/contrast";
import { TYPE_STYLES } from "../../src/theme/type-styles";

const css = readFileSync(join(import.meta.dirname, "../../src/theme/tokens.css"), "utf8");

/** Lee los bloques `:root[data-theme="x"][data-mode="y"] { --token: valor; }` del CSS. */
function parseTokens(): Map<string, Record<string, string>> {
  const blocks = new Map<string, Record<string, string>>();
  for (const match of css.matchAll(/:root\[data-theme="(\w+)"\]\[data-mode="(\w+)"\]\s*\{([^}]*)\}/g)) {
    const tokens: Record<string, string> = {};
    for (const declaration of match[3]!.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
      tokens[declaration[1]!] = declaration[2]!.trim();
    }
    blocks.set(`${match[1]}/${match[2]}`, tokens);
  }
  return blocks;
}

const themes = parseTokens();
const REQUIRED = [
  "bg", "surface", "surface-2", "fg", "fg-muted", "line", "accent", "accent-fg", "danger", "danger-bg",
  "success", "success-bg", "header-bg", "header-fg", "radius", "radius-lg", "frame", "font-ui", "font-num",
  // Etapa 6: fondo con degradado, segundo acento, dorado, forma y tipografía de títulos.
  "art-1", "art-2", "mark", "accent-edge", "accent-2", "accent-2-fg", "gold", "gold-fg", "pill", "depth",
  "elev-card", "elev-pop", "font-display",
  // Revisión final: el aro de foco (--ring, de la spec) y el borde de los campos con contraste de componente.
  "ring", "field-edge",
];

describe("tokens de los temas", () => {
  it("hay cuatro combinaciones: Clásico y Pokédex, claro y oscuro", () => {
    expect([...themes.keys()].sort()).toEqual(["clasico/claro", "clasico/oscuro", "pokedex/claro", "pokedex/oscuro"]);
  });

  it.each([...themes.keys()])("%s define todos los tokens", (name) => {
    expect(Object.keys(themes.get(name)!).sort()).toEqual([...REQUIRED].sort());
  });

  // Pares texto/fondo que se usan juntos en la interfaz: todos deben superar el 4,5:1 de WCAG AA.
  const PAIRS: [string, string][] = [
    ["fg", "bg"],
    ["fg", "surface"],
    ["fg", "surface-2"],
    ["fg-muted", "bg"],
    ["fg-muted", "surface"],
    ["fg-muted", "surface-2"],
    ["danger", "surface"],
    ["success", "surface"],
    ["accent", "bg"],
    ["accent-fg", "accent"],
    ["accent", "surface"],
    ["danger", "danger-bg"],
    ["success", "success-bg"],
    ["header-fg", "header-bg"],
    // El fondo con degradado: el texto se lee sobre sus dos extremos.
    ["fg", "art-1"],
    ["fg", "art-2"],
    ["fg-muted", "art-1"],
    ["fg-muted", "art-2"],
    ["accent", "art-1"],
    ["accent", "art-2"],
    ["accent-2", "art-1"],
    ["accent-2", "surface"],
    // Los rellenos de color y su texto.
    ["accent-2-fg", "accent-2"],
    ["gold-fg", "gold"],
  ];

  it.each([...themes.keys()])("%s: todos los pares de texto cumplen contraste AA", (name) => {
    const tokens = themes.get(name)!;
    for (const [foreground, background] of PAIRS) {
      const ratio = contrastRatio(tokens[foreground]!, tokens[background]!);
      expect(ratio, `${name}: ${foreground} sobre ${background} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  // Componentes (no texto): WCAG 1.4.11 pide 3:1 al aro de foco y al borde que delimita un campo.
  const COMPONENT_PAIRS: [string, string][] = [
    ["ring", "surface"],
    ["ring", "surface-2"],
    ["ring", "bg"],
    ["ring", "art-1"],
    ["ring", "art-2"],
    ["field-edge", "surface"],
    ["field-edge", "surface-2"],
    // Dentro del encabezado el aro es del color de su texto, porque el del tema puede ser del mismo color que el fondo.
    ["header-fg", "header-bg"],
  ];

  it.each([...themes.keys()])("%s: el aro de foco y el borde de los campos cumplen 3:1", (name) => {
    const tokens = themes.get(name)!;
    for (const [foreground, background] of COMPONENT_PAIRS) {
      const ratio = contrastRatio(tokens[foreground]!, tokens[background]!);
      expect(ratio, `${name}: ${foreground} sobre ${background} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3);
    }
  });

  // Sin esto, en los modos oscuros el navegador sigue pintando claros las barras de desplazamiento y los controles nativos.
  it.each([...themes.keys()])("%s: declara su modo al navegador (color-scheme) para las barras de desplazamiento y los controles nativos", (name) => {
    const [theme, mode] = name.split("/");
    const block = new RegExp(`:root\\[data-theme="${theme}"\\]\\[data-mode="${mode}"\\]\\s*\\{([^}]*)\\}`).exec(css)![1]!;
    expect(block).toContain(`color-scheme: ${mode === "oscuro" ? "dark" : "light"};`);
  });

  it("el tema Pokédex tiene bordes más rectos y marcados y números en monoespaciada", () => {
    const classic = themes.get("clasico/claro")!;
    const pokedex = themes.get("pokedex/claro")!;
    expect(Number.parseInt(pokedex.radius!)).toBeLessThan(Number.parseInt(classic.radius!));
    expect(Number.parseInt(pokedex.frame!)).toBeGreaterThan(Number.parseInt(classic.frame!));
    expect(pokedex["font-num"]).toContain("monospace");
    expect(classic["font-num"]).not.toContain("monospace");
  });

  it("los dos modos de cada tema comparten la forma (radios, bordes y tipografías)", () => {
    for (const theme of ["clasico", "pokedex"]) {
      const light = themes.get(`${theme}/claro`)!;
      const dark = themes.get(`${theme}/oscuro`)!;
      for (const token of ["radius", "radius-lg", "frame", "font-ui", "font-num", "font-display", "pill", "depth"]) {
        expect(dark[token]).toBe(light[token]);
      }
    }
  });
});

describe("forma y tipografía de cada tema (etapa 6)", () => {
  it("Clásico es redondeado, con relieve y con la fuente redondeada para títulos y números", () => {
    const classic = themes.get("clasico/claro")!;
    expect(Number.parseInt(classic.radius!)).toBeGreaterThanOrEqual(14);
    expect(Number.parseInt(classic["radius-lg"]!)).toBeGreaterThanOrEqual(24);
    expect(Number.parseInt(classic.depth!)).toBeGreaterThan(0);
    expect(classic["font-display"]).toContain("Fredoka Variable");
    expect(classic["font-num"]).toContain("Fredoka Variable");
    expect(classic["font-ui"]).toContain("Nunito Variable");
  });

  it("Pokédex es plano y marcado, sin relieve ni sombras difusas, y monoespaciado", () => {
    const pokedex = themes.get("pokedex/claro")!;
    expect(Number.parseInt(pokedex.radius!)).toBeLessThanOrEqual(4);
    expect(Number.parseInt(pokedex.pill!)).toBeLessThanOrEqual(4);
    expect(Number.parseInt(pokedex.depth!)).toBe(0);
    expect(pokedex["elev-card"]).toBe("none");
    expect(pokedex["font-display"]).toContain("JetBrains Mono Variable");
    expect(pokedex["font-num"]).toContain("JetBrains Mono Variable");
    expect(pokedex["font-ui"]).toContain("Nunito Variable");
  });

  it.each([...themes.keys()])("%s: el acento tiene su propio color de borde de relieve", (name) => {
    const tokens = themes.get(name)!;
    expect(tokens["accent-edge"]).not.toBe(tokens.accent);
    expect(tokens["accent-edge"]).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("colores de tipo", () => {
  it("los 18 tipos tienen color y su texto supera 4,5:1 sobre él", () => {
    expect(Object.keys(TYPE_STYLES).sort()).toEqual([...TYPE_NAMES].sort());
    for (const type of TYPE_NAMES) {
      const { background, color } = TYPE_STYLES[type];
      expect(contrastRatio(color, background), type).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("los 18 colores de fondo son distintos entre sí", () => {
    expect(new Set(TYPE_NAMES.map((t) => TYPE_STYLES[t].background)).size).toBe(18);
  });
});

describe("contraste", () => {
  it("blanco sobre negro es 21:1 y un color sobre sí mismo 1:1", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#a8a77a", "#a8a77a")).toBeCloseTo(1, 5);
  });

  it("readableOn elige blanco sobre fondos oscuros y casi negro sobre claros", () => {
    expect(readableOn("#26215c")).toBe("#ffffff");
    expect(readableOn("#f7d02c")).toBe("#111111");
  });

  it("rechaza colores que no son #rrggbb", () => {
    expect(() => relativeLuminance("rojo")).toThrow(/inválido/);
    expect(() => relativeLuminance("#fff")).toThrow(/inválido/);
  });
});
