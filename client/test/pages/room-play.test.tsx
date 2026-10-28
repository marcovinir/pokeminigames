import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PokemonCard } from "../../src/components/PokemonCard";
import { SERVER_NOW, event, pokemon } from "../helpers/events";
import { ash, misty, renderRoom, roundState, serverSends } from "../helpers/room";
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

  it("dice «Tu rival ya respondió» solo cuando es cierto", () => {
    const { unmount } = renderRoom([playing()]);
    expect(screen.queryByText("Tu rival ya respondió")).not.toBeInTheDocument();
    unmount();
    renderRoom([playing({ opponentAnswered: true })]);
    expect(screen.getByText("Tu rival ya respondió").closest("[role='status']")).not.toBeNull();
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

describe("equipo del rival en la ronda (etapa 8)", () => {
  const playing = (stateExtra: object = {}) =>
    event.roomState({
      phase: "round_active",
      myTeam: [pokemon(1, 500)],
      players: [ash({ totalStats: 500, teamSize: 1 }), misty({ totalStats: 400, teamSize: 1 })],
      round: roundState({ number: 2 }),
      ...stateExtra,
    });

  it("el panel del rival lista lo ya revelado, incluso tras recargar (viene en room-state)", () => {
    renderRoom([playing({ opponentTeam: [pokemon(7, 400)] })]);
    const rival = screen.getByRole("region", { name: "Tu rival" });
    expect(within(rival).getByText("Poke7")).toBeInTheDocument();
    expect(rival).toHaveTextContent("1 Pokémon");
    expect(rival.querySelector("img")).toHaveAttribute("src", "https://example.com/7.png");
  });

  it("el panel del rival se ve también en pantallas estrechas (no se oculta por debajo de md)", () => {
    renderRoom([playing({ opponentTeam: [pokemon(7, 400)] })]);
    const wrapper = screen.getByRole("region", { name: "Tu rival" }).parentElement!;
    expect(wrapper.className.split(" ")).not.toContain("hidden");
  });

  it("la arena se apila por encima del panel del rival: la lista de sugerencias se despliega sobre él en un teléfono", () => {
    const { container } = renderRoom([playing()]);
    const arena = container.querySelector("[data-arena]")!;
    expect(arena.className.split(" ")).toEqual(expect.arrayContaining(["relative", "z-5"]));
  });

  it("sin Pokémon revelados dice que se revelan al cerrar cada ronda y no lista ninguno", () => {
    renderRoom([playing({ players: [ash(), misty()], myTeam: [] })]);
    const rival = screen.getByRole("region", { name: "Tu rival" });
    expect(rival).toHaveTextContent("Se revelan al cerrar cada ronda.");
    expect(within(rival).queryAllByRole("listitem")).toHaveLength(0);
  });

  it("al cerrarse una ronda, el Pokémon que ganó el rival entra a su panel en la ronda siguiente", () => {
    const { services } = renderRoom([playing({ players: [ash(), misty()], myTeam: [] })]);
    serverSends(
      services,
      event.roundResult({
        round: 2,
        results: {
          1: { seat: 1, result: "NOT_FOUND", text: "zzz", pokemon: null, totalStats: 0, teamSize: 0 },
          2: { seat: 2, result: "VALID", text: "b", pokemon: pokemon(2, 300), totalStats: 300, teamSize: 1 },
        },
      }),
    );
    serverSends(services, event.roundStarted(3, SERVER_NOW + 15_000));
    const rival = screen.getByRole("region", { name: "Tu rival" });
    expect(within(rival).getByText("Poke2")).toBeInTheDocument();
  });
});

describe("ejemplo tras la ronda (etapa 8)", () => {
  const afterRound = (result = event.roundResult()) => [
    event.roomState({ phase: "round_result", mySeat: 1, roundsPlayed: 1, players: [ash(), misty()] }),
    result,
  ];
  const withExample = () => event.roundResult({ example: pokemon(25, 480, { types: ["fire", "flying"] }) });

  it("con ejemplo aparece una tarjeta «Un Pokémon que servía» con su arte, sus tipos y su total", () => {
    renderRoom(afterRound(withExample()));
    const card = screen.getByRole("region", { name: "Un Pokémon que servía: Poke25" });
    expect(within(card).getByRole("heading", { level: 2, name: "Un Pokémon que servía" })).toBeInTheDocument();
    expect(within(card).getByText("Poke25")).toBeInTheDocument();
    expect(card.querySelector("img")).toHaveAttribute("src", "https://example.com/25.png");
    expect([...card.querySelectorAll("[data-type]")].map((chip) => chip.getAttribute("data-type"))).toEqual(["fire", "flying"]);
    expect(within(card).getByLabelText("480 puntos en total")).toBeInTheDocument();
  });

  it("el resumen para lectores de pantalla también lo dice", () => {
    renderRoom(afterRound(withExample()));
    expect(screen.getByText(/Un Pokémon que servía: Poke25\./)).toBeInTheDocument();
  });

  it("sin ejemplo (acertaron los dos o no quedaba ninguno) no aparece nada", () => {
    renderRoom(afterRound());
    expect(screen.queryByRole("region", { name: /Un Pokémon que servía/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Un Pokémon que servía/)).not.toBeInTheDocument();
  });

  it("va antes que las tarjetas de resultado: la pausa dura 6 s y en un teléfono lo de abajo no se llegaría a ver", () => {
    renderRoom(afterRound(withExample()));
    const example = screen.getByRole("region", { name: /Un Pokémon que servía/ });
    const mine = screen.getByRole("region", { name: "Resultado de Tú" });
    expect(example.compareDocumentPosition(mine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("el par de tipos del resultado envuelve en pantallas estrechas (con los iconos son más anchos)", () => {
    renderRoom(afterRound(withExample()));
    expect(screen.getByLabelText("Par de tipos").className.split(" ")).toContain("flex-wrap");
  });

  it("no cambia las dos tarjetas de resultado", () => {
    renderRoom(afterRound(withExample()));
    expect(screen.getAllByRole("region", { name: /^Resultado de/ })).toHaveLength(2);
  });

  it("desaparece al empezar la ronda siguiente", () => {
    const { services } = renderRoom(afterRound(withExample()));
    expect(screen.getByRole("region", { name: /Un Pokémon que servía/ })).toBeInTheDocument();
    serverSends(services, event.roundStarted(2, SERVER_NOW + 15_000));
    expect(screen.queryByRole("region", { name: /Un Pokémon que servía/ })).not.toBeInTheDocument();
  });
});
