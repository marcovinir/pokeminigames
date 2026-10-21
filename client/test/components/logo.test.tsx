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
    expect(screen.getByText("PokeMiniGames")).toBeInTheDocument();
  });

  it("la bola tiene el tamaño pedido", () => {
    const { container } = render(<LogoMark size={40} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "40");
    expect(svg).toHaveAttribute("height", "40");
  });
});
