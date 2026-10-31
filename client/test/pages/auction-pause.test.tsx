import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { battleState, fighter, RIVAL_TEAM } from "../helpers/battle";
import { renderRoom } from "../helpers/room";
import { fakeServices } from "../helpers/services";

const team = [fighter(1, "Uno", 40), fighter(2, "Dos", 0), fighter(3, "Tres", 100)];
const pause = (over = {}) => battleState("battle_pause", { myTeam: team, myTitular: null, rivalTitular: null, moves: [], deadline: Date.now() + 15_000, ...over });

describe("la pausa", () => {
  it("solo se puede sacar a quien sigue vivo", () => {
    renderRoom([pause()]);
    expect(screen.getByRole("button", { name: "Sacar a Uno" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sacar a Tres" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sacar a Dos" })).toBeNull();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  });

  it("quien ganó el asalto ya tiene a su titular elegido", () => {
    renderRoom([pause({ myTitular: 3 })]);
    expect(screen.getByRole("button", { name: "Sacar a Tres" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled();
  });

  it("si solo hay uno posible, ya está elegido", () => {
    renderRoom([pause({ myTeam: [fighter(1, "Uno", 0), fighter(2, "Dos", 30)] })]);
    expect(screen.getByRole("button", { name: "Sacar a Dos" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled();
  });

  it("sin nadie vivo, lo dice y no hay nada que pulsar", () => {
    renderRoom([pause({ myTeam: [fighter(1, "Uno", 0), fighter(2, "Dos", 0)] })]);
    expect(screen.getByText("No te quedan Pokémon.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar" })).toBeNull();
  });

  it("confirmar envía el titular", async () => {
    const services = fakeServices();
    const { user } = renderRoom([pause()], services);
    await user.click(screen.getByRole("button", { name: "Sacar a Uno" }));
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(services.game.client.pauseConfirm).toHaveBeenCalledWith({ titular: 1 });
  });

  it("ya confirmada se recupera al recargar, sin poder cambiarla", () => {
    renderRoom([pause({ confirmed: true, myPause: { titular: 3 } })]);
    expect(screen.getByRole("button", { name: "Sacar a Tres" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Sacar a Uno" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Esperando al rival…" })).toBeDisabled();
  });

  it("se ven los PS del rival, sin su titular", () => {
    renderRoom([pause()]);
    const rival = screen.getByRole("list", { name: "Equipo rival" });
    expect(within(rival).getByText(RIVAL_TEAM[0]!.pokemon.names.es)).toBeInTheDocument();
    expect(within(rival).queryByText("Titular")).toBeNull();
  });
});
