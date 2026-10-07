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
