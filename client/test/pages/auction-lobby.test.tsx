import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { GameArt } from "../../src/components/GameArt";
import { LobbyRoute } from "../../src/pages/Lobby";
import { event } from "../helpers/events";
import { ash, misty, renderRoom } from "../helpers/room";
import { ASH, fakeServices, renderRoute, signIn } from "../helpers/services";
import { render } from "@testing-library/react";

function renderLobby() {
  const services = fakeServices();
  signIn(services, ASH);
  renderRoute("/jugar/:juego", <LobbyRoute />, { services, route: "/jugar/subasta" });
  return { services, user: userEvent.setup() };
}

describe("crear una sala de subasta", () => {
  it("las siluetas trampa van encendidas por defecto", async () => {
    const { services, user } = renderLobby();
    expect(screen.getByRole("heading", { level: 1, name: "Subasta Pokémon" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Siluetas trampa" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Crear sala" }));
    await waitFor(() => expect(services.endpoints.rooms.create).toHaveBeenCalledWith({ game: "subasta", traps: true }));
  });

  it("el botón muestra que está creando", async () => {
    const { services, user } = renderLobby();
    services.endpoints.rooms.create = (() => new Promise(() => undefined)) as never;
    await user.click(screen.getByRole("button", { name: "Crear sala" }));
    expect(await screen.findByRole("button", { busy: true })).toBeInTheDocument();
  });

  it("se pueden apagar", async () => {
    const { services, user } = renderLobby();
    await user.click(screen.getByRole("switch", { name: "Siluetas trampa" }));
    await user.click(screen.getByRole("button", { name: "Crear sala" }));
    await waitFor(() => expect(services.endpoints.rooms.create).toHaveBeenCalledWith({ game: "subasta", traps: false }));
  });
});

describe("la sala de espera de la subasta", () => {
  const waiting = (traps: boolean) => event.roomState({ phase: "waiting", config: { game: "subasta", traps }, players: [ash(), misty()] });

  it("dice si hay siluetas trampa", () => {
    const { unmount } = renderRoom([waiting(true)]);
    expect(screen.getByText("Con siluetas trampa")).toBeInTheDocument();
    unmount();
    renderRoom([waiting(false)]);
    expect(screen.getByText("Sin siluetas trampa")).toBeInTheDocument();
  });
});

describe("el dibujo de la subasta", () => {
  it("lleva sus paletas de puja, que la silueta no tiene", () => {
    const example = { pokemonId: 6, types: ["fire", "flying"] as ["fire", "flying"] };
    const { container, unmount } = render(<GameArt game="subasta" example={example} />);
    expect(container.querySelector("[data-paddle]")).not.toBeNull();
    unmount();
    const other = render(<GameArt game="silueta" example={example} />);
    expect(other.container.querySelector("[data-paddle]")).toBeNull();
  });
});
