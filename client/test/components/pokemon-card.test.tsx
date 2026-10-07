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
