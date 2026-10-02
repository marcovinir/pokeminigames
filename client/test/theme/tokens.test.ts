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
  ];

  it.each([...themes.keys()])("%s: todos los pares de texto cumplen contraste AA", (name) => {
    const tokens = themes.get(name)!;
    for (const [foreground, background] of PAIRS) {
      const ratio = contrastRatio(tokens[foreground]!, tokens[background]!);
      expect(ratio, `${name}: ${foreground} sobre ${background} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
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
      for (const token of ["radius", "radius-lg", "frame", "font-ui", "font-num"]) {
        expect(dark[token]).toBe(light[token]);
      }
    }
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
