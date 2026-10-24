import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { LoginPage } from "../../src/pages/AuthPages";
import { LobbyPage } from "../../src/pages/Lobby";
import { ProfilePage } from "../../src/pages/profile/ProfilePage";
import { event, pokemon } from "../helpers/events";
import { ash, misty, renderRoom, roundState } from "../helpers/room";
import { ASH, fakeServices, renderWithServices, signIn } from "../helpers/services";

/**
 * Spec §6: cada pantalla entra con un fundido (`animate-rise`, --dur-base) y las tarjetas de una misma pantalla entran
 * escalonadas, 60 ms una tras otra (`--i` multiplica ese retardo). «Reducir movimiento» lo apaga en el CSS global
 * (assets.test.ts), así que aquí solo se fija qué entra y en qué orden.
 */
function rise(element: Element | null | undefined): { animated: boolean; index: string } {
  const node = element as HTMLElement;
  return { animated: (node.getAttribute("class") ?? "").split(" ").includes("animate-rise"), index: node.style.getPropertyValue("--i") };
}

describe("entrada de cada pantalla", () => {
  it("acceso: el lema, el formulario y el bloque de invitado entran uno tras otro", () => {
    const { container } = renderWithServices(<LoginPage />);
    const [hero, column] = Array.from(container.firstElementChild!.children);
    const [form, guest] = Array.from(column!.children);
    expect(rise(hero)).toEqual({ animated: true, index: "0" });
    expect(rise(form)).toEqual({ animated: true, index: "1" });
    expect(rise(guest)).toEqual({ animated: true, index: "2" });
  });

  it("lobby: el saludo y las dos tarjetas entran escalonados", () => {
    const services = fakeServices();
    signIn(services, ASH);
    renderWithServices(<LobbyPage />, { services });
    expect(rise(screen.getByRole("heading", { level: 1, name: "Lobby" }).parentElement)).toEqual({ animated: true, index: "0" });
    expect(rise(screen.getByRole("heading", { level: 2, name: "Crear sala" }).closest("section"))).toEqual({ animated: true, index: "1" });
    expect(rise(screen.getByRole("heading", { level: 2, name: "Unirse a una sala" }).closest("section"))).toEqual({ animated: true, index: "2" });
  });

  it("sala de espera y cuenta atrás: la tarjeta entra con un fundido", () => {
    const waiting = renderRoom([event.roomState({ phase: "waiting", players: [ash()] })]);
    expect(rise(waiting.container.querySelector("section"))).toEqual({ animated: true, index: "0" });
    waiting.unmount();
    const starting = renderRoom([event.roomState({ phase: "starting", players: [ash(), misty()] })]);
    expect(rise(starting.container.querySelector("section"))).toEqual({ animated: true, index: "0" });
  });

  it("elegir tipo: toda la pantalla entra con un fundido", () => {
    const { container } = renderRoom([event.roomState({ phase: "choosing_types", config: { typeMode: "chosen", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null }, players: [ash(), misty()], round: roundState({ pair: null }) })]);
    expect(rise(container.querySelector("section"))).toEqual({ animated: true, index: "0" });
  });

  it("ronda: tu equipo, la arena y el rival entran escalonados", () => {
    const { container } = renderRoom([
      event.roomState({ phase: "round_active", players: [ash({ totalStats: 500, teamSize: 1 }), misty({ totalStats: 400, teamSize: 1 })], round: roundState({ number: 2 }) }),
    ]);
    const [mine, arena, theirs] = Array.from(container.querySelector("[data-arena]")!.parentElement!.children);
    expect(rise(mine)).toEqual({ animated: true, index: "0" });
    expect(rise(arena)).toEqual({ animated: true, index: "1" });
    expect(rise(theirs)).toEqual({ animated: true, index: "2" });
  });

  it("resultado de la ronda: las dos tarjetas entran una tras otra", () => {
    const { container } = renderRoom([
      event.roomState({ phase: "round_result", roundsPlayed: 1, players: [ash(), misty()] }),
      event.roundResult(),
    ]);
    const [mine, theirs] = Array.from(container.querySelectorAll("section[data-result]"));
    expect(rise(mine)).toEqual({ animated: true, index: "0" });
    expect(rise(theirs)).toEqual({ animated: true, index: "1" });
  });

  it("resumen: la pantalla entra con un fundido y los dos equipos escalonados", () => {
    const { container } = renderRoom([event.roomState({ phase: "finished", players: [ash(), misty()] }), event.gameEnded()]);
    expect(rise(container.querySelector("[data-verdict]")!.parentElement)).toEqual({ animated: true, index: "0" });
    const [mine, theirs] = Array.from(container.querySelectorAll("section[aria-label^='Equipo de']"));
    expect(rise(mine)).toEqual({ animated: true, index: "1" });
    expect(rise(theirs)).toEqual({ animated: true, index: "2" });
  });

  it("perfil: la cabecera y cada bloque de estadísticas entran escalonados", async () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn(async () => ({
      username: "ash",
      avatarId: null,
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
    const header = (await screen.findByRole("heading", { level: 1, name: "Tu perfil" })).closest("header");
    expect(rise(header)).toEqual({ animated: true, index: "0" });
    expect(rise(screen.getByRole("region", { name: "Resumen" }))).toEqual({ animated: true, index: "1" });
    expect(rise(screen.getByRole("region", { name: "Poder" }))).toEqual({ animated: true, index: "2" });
    expect(rise(screen.getByRole("region", { name: "Pokémon más ganados" }))).toEqual({ animated: true, index: "3" });
  });
});
