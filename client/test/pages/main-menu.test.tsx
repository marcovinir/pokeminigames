import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppRoutes } from "../../src/routes";
import { event } from "../helpers/events";
import { renderRoom } from "../helpers/room";
import { LocationProbe, fakeServices, renderWithServices, signIn } from "../helpers/services";

function renderApp(route: string, services = fakeServices()) {
  signIn(services);
  const utils = renderWithServices(
    <>
      <AppRoutes />
      <LocationProbe />
    </>,
    { services, route },
  );
  return { ...utils, services, user: userEvent.setup() };
}

const location = () => screen.getByTestId("location");

describe("el menú principal", () => {
  it("muestra los dos juegos en orden, con sus textos, y «Jugar» lleva a su lobby", () => {
    renderApp("/");
    expect(screen.getByRole("heading", { level: 1, name: "¿A qué jugamos?" })).toBeInTheDocument();
    expect(screen.getByText("Elige un minijuego para dos.")).toBeInTheDocument();
    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(2);
    const [dobleTipo, silueta] = cards as [HTMLElement, HTMLElement];
    expect(within(dobleTipo).getByRole("heading", { name: "Doble tipo" })).toBeInTheDocument();
    expect(within(dobleTipo).getByText("Nombra un Pokémon con los dos tipos. Gana quien sume más stats.")).toBeInTheDocument();
    expect(within(dobleTipo).queryByText("NUEVO")).not.toBeInTheDocument();
    expect(within(dobleTipo).getByRole("link", { name: /Jugar/ })).toHaveAttribute("href", "/jugar/doble-tipo");
    expect(within(silueta).getByRole("heading", { name: /¿Quién es ese Pokémon\?/ })).toBeInTheDocument();
    expect(within(silueta).getByText("Adivina la silueta. Cuanto más rápido, más puntos.")).toBeInTheDocument();
    expect(within(silueta).getByText("NUEVO")).toBeInTheDocument();
    expect(within(silueta).getByRole("link", { name: /Jugar/ })).toHaveAttribute("href", "/jugar/silueta");
  });

  it("un lobby de un juego que no existe vuelve al menú", async () => {
    renderApp("/jugar/xyz");
    await waitFor(() => expect(location()).toHaveTextContent(/^\/$/));
    expect(screen.getByRole("heading", { name: "¿A qué jugamos?" })).toBeInTheDocument();
  });

  it("cada lobby lleva el nombre de su juego y «Volver al menú»", async () => {
    const silueta = renderApp("/jugar/silueta");
    expect(screen.getByRole("heading", { level: 1, name: "¿Quién es ese Pokémon?" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver al menú" })).toHaveAttribute("href", "/");
    silueta.unmount();
    renderApp("/jugar/doble-tipo");
    expect(screen.getByRole("heading", { level: 1, name: "Doble tipo" })).toBeInTheDocument();
    expect(screen.getByLabelText("Largo de la partida")).toBeInTheDocument();
  });
});

describe("crear una sala de silueta", () => {
  it("por defecto: 10 rondas y solo Kanto", async () => {
    const { services, user } = renderApp("/jugar/silueta");
    expect(screen.getByLabelText("Rondas")).toHaveValue("10");
    const gens = within(screen.getByRole("group", { name: "Generaciones" })).getAllByRole("checkbox");
    expect(gens.map((box) => box.closest("label")?.textContent?.trim())).toEqual([
      "1.ª (Kanto)",
      "2.ª (Johto)",
      "3.ª (Hoenn)",
      "4.ª (Sinnoh)",
      "5.ª (Teselia)",
      "6.ª (Kalos)",
      "7.ª (Alola)",
      "8.ª (Galar)",
      "9.ª (Paldea)",
    ]);
    expect(gens.map((box) => (box as HTMLInputElement).checked)).toEqual([true, false, false, false, false, false, false, false, false]);
    await user.click(screen.getByRole("button", { name: "Crear sala" }));
    expect(services.endpoints.rooms.create).toHaveBeenCalledWith({ game: "silueta", rounds: 10, generations: [1] });
    await waitFor(() => expect(location()).toHaveTextContent("/sala/ABC234"));
  });

  it("elige 15 rondas y añade Johto", async () => {
    const { services, user } = renderApp("/jugar/silueta");
    await user.selectOptions(screen.getByLabelText("Rondas"), "15");
    await user.click(screen.getByLabelText("2.ª (Johto)"));
    await user.click(screen.getByRole("button", { name: "Crear sala" }));
    expect(services.endpoints.rooms.create).toHaveBeenCalledWith({ game: "silueta", rounds: 15, generations: [1, 2] });
  });

  it("sin ninguna generación avisa y no crea nada", async () => {
    const { services, user } = renderApp("/jugar/silueta");
    await user.click(screen.getByLabelText("1.ª (Kanto)"));
    await user.click(screen.getByRole("button", { name: "Crear sala" }));
    expect(screen.getByText("Elige al menos una generación")).toBeInTheDocument();
    expect(services.endpoints.rooms.create).not.toHaveBeenCalled();
  });

  it("unirse con código funciona igual en el lobby de la silueta", async () => {
    const { services, user } = renderApp("/jugar/silueta");
    await user.type(screen.getByLabelText("Código de sala"), "xyz234");
    await user.click(screen.getByRole("button", { name: "Unirse" }));
    expect(services.endpoints.rooms.join).toHaveBeenCalledWith("XYZ234");
  });
});

describe("volver al lobby desde una sala", () => {
  it.each([
    [{ game: "silueta" as const, rounds: 5 as const, generations: [1] }, "/jugar/silueta"],
    [{ typeMode: "random" as const, lengthMode: "fixed_rounds" as const, roundsLimit: 3, statsGoal: null }, "/jugar/doble-tipo"],
  ])("el resumen lleva al lobby de su juego (%#)", async (config, path) => {
    const { user } = renderRoom([event.roomState({ phase: "finished", config }), event.gameEnded({ winnerSeat: 1 })]);
    await user.click(screen.getByRole("button", { name: "Volver al lobby" }));
    expect(location()).toHaveTextContent(path);
  });
});
