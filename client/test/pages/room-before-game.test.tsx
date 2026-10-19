import { TYPE_NAMES } from "@pokemon-minigames/shared";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { typeIconUrl } from "../../src/catalog/artwork";
import { TYPE_LABELS } from "../../src/i18n/es";
import { SERVER_NOW, event } from "../helpers/events";
import { ash, misty, renderRoom, roundState } from "../helpers/room";

describe("sala de espera (etapa 6)", () => {
  const alone = () => event.roomState({ phase: "waiting", players: [ash()] });

  it("el código va en casillas, una por letra, y sigue leyéndose como un solo código", () => {
    renderRoom([alone()]);
    const code = screen.getByLabelText("Código de la sala");
    const tiles = [...code.children];
    expect(tiles.map((tile) => tile.textContent)).toEqual(["A", "B", "C", "2", "3", "4"]);
    expect(code).toHaveTextContent("ABC234");
  });

  it("está en una tarjeta elevada", () => {
    renderRoom([alone()]);
    const card = screen.getByRole("heading", { name: "Sala de espera" }).closest("section")!;
    expect(card.className).toContain("shadow-pop");
  });

  it("solo, tu avatar y un hueco que palpita (decorativo) esperando al rival", () => {
    const { container } = renderRoom([alone()]);
    const players = screen.getByRole("list", { name: "Jugadores" });
    expect(within(players).getByText("ash")).toBeInTheDocument();
    expect(within(players).getByText("AS")).toHaveAttribute("aria-hidden", "true");
    const empty = container.querySelector("[data-empty-seat]")!;
    expect(empty).toHaveAttribute("aria-hidden", "true");
    expect(empty.querySelector(".animate-beat")).not.toBeNull();
  });

  it("con los dos jugadores no queda hueco y el que no se conectó lo dice", () => {
    const { container } = renderRoom([event.roomState({ phase: "waiting", players: [ash(), misty({ connected: false })] })]);
    expect(container.querySelector("[data-empty-seat]")).toBeNull();
    expect(screen.getByText("(sin conectar)")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Jugadores" })).getAllByRole("listitem")).toHaveLength(2);
  });
});

describe("cuenta atrás de inicio (etapa 6)", () => {
  const starting = () => event.roomState({ phase: "starting", startsAt: SERVER_NOW + 5000 });

  it("muestra a los dos jugadores frente a frente con un «VS» decorativo", () => {
    const { container } = renderRoom([starting()]);
    expect(screen.getByText("AS")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("MI")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("VS")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll("[aria-hidden='true']").length).toBeGreaterThanOrEqual(3);
  });

  it("el anillo es grande y no se pone rojo (la cuenta atrás entera dura 5 s)", () => {
    renderRoom([starting()]);
    const timer = screen.getByRole("timer", { name: "Inicio de la partida" });
    expect(timer.style.width).toBe("160px");
    expect(timer).toHaveAttribute("data-urgent", "false");
  });

  it("conserva el título con el nombre del rival", () => {
    renderRoom([starting()]);
    expect(screen.getByRole("heading", { name: "Partida contra misty" })).toBeInTheDocument();
  });
});

describe("elegir tipo (etapa 6)", () => {
  const choosing = (extra: object = {}) =>
    event.roomState({
      phase: "choosing_types",
      config: { typeMode: "chosen", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null },
      round: roundState({ pair: null, ...extra }),
    });

  it("los 18 tipos son teselas de color con relieve y su nombre", () => {
    renderRoom([choosing()]);
    const tiles = within(screen.getByRole("group", { name: "Tipos" })).getAllByRole("button");
    expect(tiles).toHaveLength(18);
    for (const tile of tiles) {
      expect(tile.style.background).toContain("linear-gradient");
      expect(tile.className).toContain("rounded-card");
      expect(tile).toHaveAttribute("data-type");
    }
  });

  it("cada tesela lleva el icono oficial de su tipo encima del nombre, decorativo", () => {
    renderRoom([choosing()]);
    const tiles = within(screen.getByRole("group", { name: "Tipos" })).getAllByRole("button");
    tiles.forEach((tile, index) => {
      const type = TYPE_NAMES[index]!;
      const icon = tile.querySelector("img")!;
      expect(icon).toHaveAttribute("src", typeIconUrl(type));
      expect(icon).toHaveAttribute("alt", "");
      expect(icon).toHaveAttribute("aria-hidden", "true");
      expect(tile).toHaveAccessibleName(TYPE_LABELS[type]);
    });
  });

  it("el contenido de cada tesela va centrado (si falla un icono el nombre no se queda arriba)", () => {
    renderRoom([choosing()]);
    const tile = within(screen.getByRole("group", { name: "Tipos" })).getByRole("button", { name: "fuego" });
    expect(tile.className.split(" ")).toContain("justify-center");
  });

  it("si un icono no carga, la tesela queda con su nombre como siempre", async () => {
    const { user } = renderRoom([choosing()]);
    const fire = screen.getByRole("button", { name: "fuego" });
    fireEvent.error(fire.querySelector("img")!);
    expect(fire.querySelector("img")).toBeNull();
    await user.click(fire);
    expect(screen.getByRole("button", { name: "fuego" })).toHaveAttribute("aria-pressed", "true");
  });

  it("el cronómetro es un anillo con su nombre de siempre", () => {
    renderRoom([choosing()]);
    expect(screen.getByRole("timer", { name: "Tiempo para elegir" })).toBeInTheDocument();
  });

  it("al tocar una tesela queda marcada (aria-pressed y data-chosen) y las demás no", async () => {
    const { user } = renderRoom([choosing()]);
    await user.click(screen.getByRole("button", { name: "fuego" }));
    const fire = screen.getByRole("button", { name: "fuego" });
    expect(fire).toHaveAttribute("aria-pressed", "true");
    expect(fire).toHaveAttribute("data-chosen", "true");
    expect(screen.getByRole("button", { name: "agua" })).not.toHaveAttribute("data-chosen");
  });
});

describe("sala de espera: configuración y pistas de tipos (etapa 8)", () => {
  const withConfig = (config: object) =>
    event.roomState({
      phase: "waiting",
      players: [ash()],
      config: { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null, ...config },
    });

  it("muestra la configuración de la sala, para que quien se une sepa cómo se va a jugar", () => {
    renderRoom([withConfig({})]);
    expect(screen.getByLabelText("Configuración de la sala")).toHaveTextContent("Tipos aleatorios · 3 rondas");
  });

  it("con pistas muestra la insignia «Pistas de tipos»", () => {
    renderRoom([withConfig({ typeHints: true })]);
    const settings = screen.getByLabelText("Configuración de la sala");
    expect(within(settings).getByText("Pistas de tipos")).toBeInTheDocument();
  });

  it("sin pistas (apagadas o sin el campo) no hay insignia", () => {
    for (const config of [{ typeHints: false }, {}]) {
      const { unmount } = renderRoom([withConfig(config)]);
      expect(screen.queryByText("Pistas de tipos")).not.toBeInTheDocument();
      unmount();
    }
  });
});
