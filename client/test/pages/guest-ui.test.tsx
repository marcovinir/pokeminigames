import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Header } from "../../src/components/Header";
import { event } from "../helpers/events";
import { ash, misty, renderRoom, roundState } from "../helpers/room";
import { ASH, GUEST, fakeServices, renderWithServices, signIn } from "../helpers/services";

const tags = () => screen.queryAllByText("Invitado");

describe("encabezado", () => {
  it("el de un invitado muestra «Invitado» con su nombre y «Crear cuenta» (a /registro), sin «Mi perfil», y conserva «Cerrar sesión» y «Apariencia»", () => {
    const services = fakeServices();
    signIn(services, GUEST);
    renderWithServices(<Header />, { services });
    expect(screen.getByText("Invitado")).toBeInTheDocument();
    expect(screen.getByText("inv_1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Crear cuenta" })).toHaveAttribute("href", "/registro");
    expect(screen.queryByRole("link", { name: "Mi perfil" })).toBeNull();
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apariencia" })).toBeInTheDocument();
  });

  it("«Cerrar sesión» de un invitado termina su sesión", async () => {
    const services = fakeServices();
    signIn(services, GUEST);
    renderWithServices(<Header />, { services });
    screen.getByRole("button", { name: "Cerrar sesión" }).click();
    await Promise.resolve();
    expect(services.endpoints.auth.logout).toHaveBeenCalledTimes(1);
  });

  it("el de una cuenta no cambia: sin etiqueta y con «Mi perfil»", () => {
    const services = fakeServices();
    signIn(services, ASH);
    renderWithServices(<Header />, { services });
    expect(tags()).toHaveLength(0);
    expect(screen.getByRole("link", { name: "Mi perfil" })).toHaveAttribute("href", "/perfil");
    expect(screen.queryByRole("link", { name: "Crear cuenta" })).toBeNull();
  });

  it("sin sesión no muestra nada de usuario", () => {
    renderWithServices(<Header />, { services: fakeServices() });
    expect(tags()).toHaveLength(0);
    expect(screen.queryByRole("link", { name: "Crear cuenta" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Mi perfil" })).toBeNull();
  });
});

describe("etiqueta «Invitado» junto al jugador invitado", () => {
  it("sala de espera: junto al jugador invitado, sea el rival o yo", () => {
    const rival = renderRoom([event.roomState({ phase: "waiting", players: [ash(), misty({ guest: true })] })]);
    const list = screen.getByRole("list", { name: "Jugadores" });
    const [first, second] = within(list).getAllByRole("listitem");
    expect(within(first!).queryByText("Invitado")).toBeNull();
    expect(within(second!).getByText("Invitado")).toBeInTheDocument();
    expect(tags()).toHaveLength(1);
    rival.unmount();

    renderRoom([event.roomState({ phase: "waiting", players: [ash({ guest: true }), misty({ guest: true })] })]);
    expect(tags()).toHaveLength(2);
  });

  it("cuenta atrás: junto a «Partida contra …» cuando el rival es invitado", () => {
    const starting = (rival: object) => [event.roomState({ phase: "starting", mySeat: 1, players: [ash(), misty(rival)] })];
    const guest = renderRoom(starting({ guest: true }));
    expect(screen.getByRole("heading", { name: /Partida contra misty/ })).toBeInTheDocument();
    expect(tags()).toHaveLength(1);
    guest.unmount();

    renderRoom(starting({}));
    expect(tags()).toHaveLength(0);
  });

  it("ronda: en la barra «Marcador» y en el panel del rival", () => {
    renderRoom([
      event.roomState({
        phase: "round_active",
        players: [ash({ totalStats: 500, teamSize: 1 }), misty({ guest: true, totalStats: 400, teamSize: 1 })],
        round: roundState(),
      }),
    ]);
    expect(within(screen.getByLabelText("Marcador")).getByText("Invitado")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Tu rival" })).getByText("Invitado")).toBeInTheDocument();
    expect(tags()).toHaveLength(2);
  });

  it("resultado de la ronda: en la tarjeta del invitado, y el nombre accesible de la tarjeta sigue siendo «Resultado de {nombre}»", () => {
    renderRoom([
      event.roomState({ phase: "round_result", mySeat: 1, roundsPlayed: 1, players: [ash(), misty({ guest: true })] }),
      event.roundResult(),
    ]);
    const theirs = screen.getByRole("region", { name: "Resultado de misty" });
    expect(within(theirs).getByText("Invitado")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Resultado de Tú" })).queryByText("Invitado")).toBeNull();
    expect(tags()).toHaveLength(1);
  });

  it("resumen final: en la columna del invitado, con el nombre accesible de siempre", () => {
    renderRoom([
      event.roomState({ phase: "finished", mySeat: 1, players: [ash(), misty({ guest: true })] }),
      event.gameEnded({ winnerSeat: 1 }),
    ]);
    expect(within(screen.getByRole("region", { name: "Equipo de misty" })).getByText("Invitado")).toBeInTheDocument();
    expect(tags()).toHaveLength(1);
  });

  it("con dos cuentas no aparece en ninguna pantalla", () => {
    const screens = [
      [event.roomState({ phase: "waiting", players: [ash(), misty()] })],
      [event.roomState({ phase: "round_active", players: [ash(), misty()], round: roundState() })],
      [event.roomState({ phase: "round_result", mySeat: 1, roundsPlayed: 1, players: [ash(), misty()] }), event.roundResult()],
      [event.roomState({ phase: "finished", mySeat: 1, players: [ash(), misty()] }), event.gameEnded({ winnerSeat: 1 })],
    ];
    for (const events of screens) {
      const { unmount } = renderRoom(events);
      expect(tags()).toHaveLength(0);
      unmount();
    }
  });
});

describe("resumen final: «Ver perfil de …»", () => {
  const finished = (players: object[]) => [event.roomState({ phase: "finished", mySeat: 1, players: players as never }), event.gameEnded({ winnerSeat: 1 })];

  it("no se ofrece si el rival es invitado", () => {
    renderRoom(finished([ash(), misty({ guest: true })]));
    expect(screen.queryByRole("button", { name: /Ver perfil de/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Jugar de nuevo" })).toBeInTheDocument();
  });

  it("no se ofrece si quien mira es invitado (sesión de invitado), aunque el rival tenga cuenta", () => {
    const services = fakeServices();
    signIn(services, GUEST);
    renderRoom(finished([ash({ guest: true }), misty()]), services);
    expect(screen.queryByRole("button", { name: /Ver perfil de/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Volver al lobby" })).toBeInTheDocument();
  });

  it("con dos cuentas sigue ofreciéndose", () => {
    const services = fakeServices();
    signIn(services, ASH);
    renderRoom(finished([ash(), misty()]), services);
    expect(screen.getByRole("button", { name: "Ver perfil de misty" })).toBeInTheDocument();
  });
});
