import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { LoginPage } from "../../src/pages/AuthPages";
import { LobbyPage } from "../../src/pages/Lobby";
import { ProfilePage } from "../../src/pages/profile/ProfilePage";
import { event, pokemon } from "../helpers/events";
import { ash, misty, renderRoom, roundState } from "../helpers/room";
import { fakeServices, renderWithServices } from "../helpers/services";

/**
 * Una columna de cuadrícula sin `grid-cols-1` mide lo que mide su contenido (`min-width: auto`): un campo de texto o un
 * aviso largo ensanchan toda la pantalla y en el móvil aparece un desplazamiento horizontal. Estas pruebas fijan la
 * regla que lo evita; el recorrido real en un móvil de 375 px (Task 14) comprueba que no hay desbordes.
 */
const classesOf = (element: Element | null): string => element?.getAttribute("class") ?? "";

describe("sin desbordes en pantallas estrechas", () => {
  it("ronda: las columnas se pueden encoger (minmax(0, …)) y la arena también", () => {
    const { container } = renderRoom([
      event.roomState({
        phase: "round_active",
        players: [ash({ totalStats: 500, teamSize: 1 }), misty({ totalStats: 400, teamSize: 1 })],
        round: roundState({ number: 2 }),
      }),
    ]);
    const arena = container.querySelector("[data-arena]")!;
    expect(classesOf(arena)).toContain("min-w-0");
    const grid = arena.parentElement!;
    expect(classesOf(grid)).toContain("grid-cols-1");
    expect(classesOf(grid)).toContain("md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)]");
  });

  it("resultado de la ronda: una columna en móvil", () => {
    const { container } = renderRoom([
      event.roomState({ phase: "round_result", roundsPlayed: 1, players: [ash(), misty()] }),
      event.roundResult(),
    ]);
    const grid = container.querySelector("section[data-result]")!.parentElement!;
    expect(classesOf(grid)).toContain("grid-cols-1");
  });

  it("resumen: los dos equipos van en una columna en móvil", () => {
    const { container } = renderRoom([event.roomState({ phase: "finished", players: [ash(), misty()] }), event.gameEnded()]);
    const grid = container.querySelector("section[aria-label^='Equipo de']")!.parentElement!;
    expect(classesOf(grid)).toContain("grid-cols-1");
  });

  it("lobby: las dos tarjetas van en una columna en móvil", () => {
    renderWithServices(<LobbyPage />);
    const grid = screen.getByRole("heading", { level: 2, name: "Crear sala" }).closest("section")!.parentElement!;
    expect(classesOf(grid)).toContain("grid-cols-1");
  });

  it("acceso: el lema y el formulario van en una columna en móvil", () => {
    const { container } = renderWithServices(<LoginPage />);
    expect(classesOf(container.firstElementChild)).toContain("grid-cols-1");
  });

  it("perfil: el podio de Pokémon va en una columna en móvil", async () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn(async () => ({
      username: "ash",
      stats: {
        played: 2,
        wins: 1,
        draws: 0,
        losses: 1,
        winRate: 0.5,
        currentStreak: 1,
        bestStreak: 1,
        averagePower: 300,
        bestGameScore: 300,
        topPokemon: [{ pokemon: pokemon(6, 534), wins: 1 }],
      },
    }));
    renderWithServices(
      <Routes>
        <Route path="/perfil" element={<ProfilePage />} />
      </Routes>,
      { services, route: "/perfil" },
    );
    const top = await screen.findByRole("region", { name: "Pokémon más ganados" });
    expect(classesOf(top.querySelector("ul"))).toContain("grid-cols-1");
  });
});
