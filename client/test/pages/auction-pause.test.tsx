import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { battleState, fighter, RIVAL_TEAM } from "../helpers/battle";
import { renderRoom } from "../helpers/room";
import { fakeServices } from "../helpers/services";

const team = [fighter(1, "Uno", 40), fighter(2, "Dos", 0), fighter(3, "Tres", 100)];
const pause = (over = {}, items: ("pocion" | "revivir" | "cinta")[] = []) => battleState("battle_pause", { myTeam: team, myTitular: null, rivalTitular: null, moves: [], deadline: Date.now() + 15_000, ...over }, items);
const options = (name: string) => within(screen.getByRole("combobox", { name })).getAllByRole("option").map((one) => one.textContent);

describe("la pausa", () => {
  it("cada objeto ofrece solo sus objetivos válidos", () => {
    renderRoom([pause({}, ["pocion", "revivir"])]);
    expect(options("Poción Máxima")).toEqual(["No usar", "Uno"]);
    expect(options("Revivir")).toEqual(["No usar", "Dos"]);
  });

  it("dos Revivir no pueden ir al mismo", async () => {
    const down = [fighter(1, "Uno", 0), fighter(2, "Dos", 0), fighter(3, "Tres", 50)];
    const { user } = renderRoom([pause({ myTeam: down }, ["revivir", "revivir"])]);
    const [first, second] = screen.getAllByRole("combobox", { name: "Revivir" }) as [HTMLSelectElement, HTMLSelectElement];
    await user.selectOptions(first, "Uno");
    expect(within(second).getAllByRole("option").map((one) => one.textContent)).toEqual(["No usar", "Dos"]);
  });

  it("revivir lo ofrece como titular; al quitarlo se deselecciona", async () => {
    const { user } = renderRoom([pause({}, ["revivir"])]);
    expect(screen.queryByRole("button", { name: "Sacar a Dos" })).toBeNull();
    await user.selectOptions(screen.getByRole("combobox", { name: "Revivir" }), "Dos");
    await user.click(screen.getByRole("button", { name: "Sacar a Dos" }));
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled();
    await user.selectOptions(screen.getByRole("combobox", { name: "Revivir" }), "No usar");
    expect(screen.queryByRole("button", { name: "Sacar a Dos" })).toBeNull();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  });

  it("quien ganó el asalto ya tiene a su titular elegido", () => {
    renderRoom([pause({ myTitular: 3 })]);
    expect(screen.getByRole("button", { name: "Sacar a Tres" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled();
  });

  it("sin nadie vivo y con Revivir, lo explica", () => {
    const down = [fighter(1, "Uno", 0), fighter(2, "Dos", 0), fighter(3, "Tres", 0)];
    renderRoom([pause({ myTeam: down }, ["revivir"])]);
    expect(screen.getByText("Usa Revivir o perderás al acabar el tiempo.")).toBeInTheDocument();
  });

  it("sin nadie vivo ni objetos, lo dice y no hay nada que pulsar", () => {
    const down = [fighter(1, "Uno", 0), fighter(2, "Dos", 0), fighter(3, "Tres", 0)];
    renderRoom([pause({ myTeam: down })]);
    expect(screen.getByText("No te quedan Pokémon.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar" })).toBeNull();
  });

  it("confirmar envía objetos y titular", async () => {
    const services = fakeServices();
    const { user } = renderRoom([pause({}, ["pocion", "cinta"])], services);
    await user.selectOptions(screen.getByRole("combobox", { name: "Poción Máxima" }), "Uno");
    await user.click(screen.getByRole("switch", { name: "Cinta" }));
    await user.click(screen.getByRole("button", { name: "Sacar a Uno" }));
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(services.game.client.pauseConfirm).toHaveBeenCalledWith({ items: [{ item: "pocion", target: 1 }, { item: "cinta", target: null }], titular: 1 });
  });

  it("ya confirmada se recupera al recargar, sin poder cambiarla", () => {
    renderRoom([pause({ confirmed: true, myPause: { items: [{ item: "pocion", target: 1 }], titular: 3 } }, ["pocion"])]);
    expect(screen.getByRole("combobox", { name: "Poción Máxima" })).toHaveValue("1");
    expect(screen.getByRole("combobox", { name: "Poción Máxima" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sacar a Tres" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Esperando al rival…" })).toBeDisabled();
  });

  it("se ven los PS del rival, sin su titular", () => {
    renderRoom([pause()]);
    const rival = screen.getByRole("list", { name: "Equipo rival" });
    expect(within(rival).getByText(RIVAL_TEAM[0]!.pokemon.names.es)).toBeInTheDocument();
    expect(within(rival).queryByText("Titular")).toBeNull();
  });
});
