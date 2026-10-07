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
