import { fireEvent, render, screen } from "@testing-library/react";
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

describe("Avatar con Pokémon", () => {
  const imgOf = (container: HTMLElement) => container.querySelector("img");

  it("con avatar pinta el arte oficial sobre el color de esa persona, sin iniciales mientras carga", () => {
    const { container } = render(<Avatar name="ash" avatarId={94} />);
    const img = imgOf(container)!;
    expect(img.getAttribute("src")).toMatch(/\/official-artwork\/94\.png$/);
    expect(img).toHaveAttribute("alt", "");
    expect(screen.queryByText("AS")).not.toBeInTheDocument();
    expect(img.className).toContain("opacity-0");

    const { container: plain } = render(<Avatar name="ash" />);
    expect((container.firstElementChild as HTMLElement).style.background).toBe((plain.firstElementChild as HTMLElement).style.background);
  });

  it("tras cargar se ve la imagen", () => {
    const { container } = render(<Avatar name="ash" avatarId={94} />);
    fireEvent.load(imgOf(container)!);
    expect(imgOf(container)!.className).toContain("opacity-100");
  });

  it("si la imagen falla vuelve a las iniciales", () => {
    const { container } = render(<Avatar name="ash" avatarId={94} />);
    fireEvent.error(imgOf(container)!);
    expect(imgOf(container)).toBeNull();
    expect(screen.getByText("AS")).toBeInTheDocument();
  });

  it.each([undefined, null])("sin avatar (%s), iniciales como hoy", (avatarId) => {
    const { container } = render(<Avatar name="ash" avatarId={avatarId} />);
    expect(imgOf(container)).toBeNull();
    expect(screen.getByText("AS")).toBeInTheDocument();
  });

  it("un avatar fuera de la lista también se pinta", () => {
    const { container } = render(<Avatar name="ash" avatarId={906} />);
    expect(imgOf(container)!.getAttribute("src")).toMatch(/\/official-artwork\/906\.png$/);
  });

  it("es decorativo salvo que lleve label", () => {
    const { container, rerender } = render(<Avatar name="ash" avatarId={94} />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    rerender(<Avatar name="ash" avatarId={94} label="Avatar: Gengar" />);
    expect(screen.getByRole("img", { name: "Avatar: Gengar" })).toBeInTheDocument();
    expect(container.firstElementChild).not.toHaveAttribute("aria-hidden");
  });

  it("cambiar de avatar empieza de cero", () => {
    const { container, rerender } = render(<Avatar name="ash" avatarId={94} />);
    fireEvent.error(imgOf(container)!);
    rerender(<Avatar name="ash" avatarId={25} />);
    expect(imgOf(container)!.getAttribute("src")).toMatch(/\/official-artwork\/25\.png$/);
  });
});
