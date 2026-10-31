import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { battleState } from "../helpers/battle";
import { renderRoom } from "../helpers/room";
import { fakeServices } from "../helpers/services";

const lineup = (over = {}) => battleState("lineup", { round: 0, turn: 0, myTitular: null, rivalTitular: null, moves: [], ...over });
const rows = () => within(screen.getByRole("list", { name: "Tu alineación" })).getAllByRole("listitem").map((row) => row.textContent);

describe("la alineación", () => {
  it("empieza en orden de compra, y el primero es el titular", () => {
    renderRoom([lineup()]);
    const list = rows();
    expect(list[0]).toContain("Uno");
    expect(list[0]).toContain("Titular");
    expect(list[1]).toContain("Dos");
    expect(list[1]).not.toContain("Titular");
    expect(screen.getByRole("button", { name: "Subir Uno" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bajar Tres" })).toBeDisabled();
  });

  it("se ve el equipo rival, sin titular", () => {
    renderRoom([lineup()]);
    const rival = screen.getByRole("list", { name: "Equipo rival" });
    expect(within(rival).getByText("Cuatro")).toBeInTheDocument();
    expect(within(rival).queryByText("Titular")).toBeNull();
  });

  it("subir cambia el orden, deja el foco en un botón suyo y anuncia la posición", async () => {
    const { user } = renderRoom([lineup()]);
    await user.click(screen.getByRole("button", { name: "Subir Dos" }));
    expect(rows()[0]).toContain("Dos");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Bajar Dos" }));
    expect(screen.getByRole("status")).toHaveTextContent("Dos: posición 1");
  });

  it("confirmar envía el orden elegido", async () => {
    const services = fakeServices();
    const { user } = renderRoom([lineup()], services);
    await user.click(screen.getByRole("button", { name: "Bajar Uno" }));
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(services.game.client.lineup).toHaveBeenCalledWith([2, 1, 3]);
  });

  it("ya confirmada se recupera al recargar, sin poder cambiarla", () => {
    renderRoom([lineup({ confirmed: true, myLineup: [3, 2, 1] })]);
    expect(rows()[0]).toContain("Tres");
    expect(screen.getByRole("button", { name: "Esperando al rival…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bajar Tres" })).toBeDisabled();
  });

});
