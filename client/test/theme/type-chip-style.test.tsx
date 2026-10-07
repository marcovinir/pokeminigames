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
