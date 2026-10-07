import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LobbyPage } from "../../src/pages/Lobby";
import { ASH, fakeServices, renderWithServices, signIn } from "../helpers/services";

function renderSignedIn() {
  const services = fakeServices();
  signIn(services);
  return renderWithServices(<LobbyPage />, { services });
}

describe("lobby (etapa 6)", () => {
  it("saluda a la persona por su nombre y conserva el título «Lobby»", () => {
    renderSignedIn();
    expect(screen.getByText(`Hola, ${ASH.username}`)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Lobby" })).toBeInTheDocument();
  });

  it("sin sesión (no debería pasar) no saluda a nadie", () => {
    renderWithServices(<LobbyPage />);
    expect(screen.queryByText(/^Hola,/)).not.toBeInTheDocument();
  });

  it("«Crear sala» y «Unirse a una sala» son dos tarjetas con su icono decorativo", () => {
    renderSignedIn();
    for (const name of ["Crear sala", "Unirse a una sala"]) {
      const section = screen.getByRole("heading", { level: 2, name }).closest("section")!;
      expect(section.className).toContain("shadow-card");
      expect(section.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    }
  });

  it("los modos de tipos son tarjetas seleccionables: radios de verdad con su marca de selección", async () => {
    renderSignedIn();
    const random = screen.getByRole("radio", { name: /Aleatorio/ });
    const chosen = screen.getByRole("radio", { name: /Elegido/ });
    expect(random).toBeChecked();
    expect(random.className).toContain("peer");
    expect(random.className).toContain("sr-only");
    expect(random.closest("label")!.querySelector("[data-check]")).not.toBeNull();
    await userEvent.click(chosen);
    expect(chosen).toBeChecked();
    expect(random).not.toBeChecked();
  });

  it("el largo de la partida sigue siendo un selector con su etiqueta, ahora con una flecha decorativa", () => {
    renderSignedIn();
    const select = screen.getByLabelText("Largo de la partida");
    expect(select.tagName).toBe("SELECT");
    expect(select.className).toContain("appearance-none");
    expect(select.parentElement!.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });

  it("el código de sala es un campo grande, monoespaciado, centrado y en mayúsculas", () => {
    renderSignedIn();
    const className = screen.getByLabelText("Código de sala").className;
    expect(className).toContain("font-num");
    expect(className).toContain("uppercase");
    expect(className).toContain("tracking-");
    expect(className).toContain("text-center");
  });

  it("los dos botones de acción son grandes", () => {
    renderSignedIn();
    expect(screen.getByRole("button", { name: "Crear sala" }).className).toContain("py-3");
    expect(screen.getByRole("button", { name: "Unirse" }).className).toContain("py-3");
  });

  it("las dos tarjetas conviven en la misma cuadrícula", () => {
    renderSignedIn();
    const grid = screen.getByRole("heading", { level: 2, name: "Crear sala" }).closest("section")!.parentElement!;
    expect(within(grid).getAllByRole("heading", { level: 2 })).toHaveLength(2);
    expect(grid.className).toContain("md:grid-cols-2");
  });
});
