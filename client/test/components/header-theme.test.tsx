import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Header } from "../../src/components/Header";
import { ThemeSwitcher } from "../../src/components/ThemeSwitcher";
import { ASH, fakeServices, renderWithServices, signIn } from "../helpers/services";

describe("ThemeSwitcher", () => {
  it("muestra el tema y el modo actuales", () => {
    renderWithServices(<ThemeSwitcher />);
    expect(screen.getByRole("combobox", { name: "Tema" })).toHaveValue("clasico");
    expect(screen.getByRole("combobox", { name: "Modo" })).toHaveValue("auto");
  });

  it("ofrece los dos temas y los tres modos en español", () => {
    renderWithServices(<ThemeSwitcher />);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Clásico",
      "Pokédex",
      "Automático",
      "Claro",
      "Oscuro",
    ]);
  });

  it("al elegir otro tema lo aplica al documento", async () => {
    const services = fakeServices();
    renderWithServices(<ThemeSwitcher />, { services });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Tema" }), "pokedex");
    expect(services.themeRoot.dataset.theme).toBe("pokedex");
    expect(services.theme.getState().preference.theme).toBe("pokedex");
  });

  it("al elegir otro modo lo aplica al documento", async () => {
    const services = fakeServices();
    renderWithServices(<ThemeSwitcher />, { services });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Modo" }), "oscuro");
    expect(services.themeRoot.dataset.mode).toBe("oscuro");
  });

  it("refleja un cambio de tema hecho desde fuera", () => {
    const services = fakeServices();
    renderWithServices(<ThemeSwitcher />, { services });
    services.theme.getState().setTheme("pokedex");
    // zustand notifica de forma síncrona; React vuelve a pintar en el siguiente ciclo
    return screen.findByDisplayValue("Pokédex");
  });
});

describe("Header", () => {
  it("con sesión muestra el usuario y permite cerrar sesión", async () => {
    const services = fakeServices();
    signIn(services);
    renderWithServices(<Header />, { services });
    expect(screen.getByText(ASH.username)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(services.endpoints.auth.logout).toHaveBeenCalledTimes(1);
    expect(services.session.getState().status).toBe("anonymous");
  });

  it("el botón de cerrar sesión usa el color de texto del encabezado (se lee sobre su fondo en todos los temas)", () => {
    const services = fakeServices();
    signIn(services);
    renderWithServices(<Header />, { services });
    expect(screen.getByRole("button", { name: "Cerrar sesión" }).className).toContain("text-header-fg");
  });

  it("sin sesión no muestra usuario ni botón, pero sí el selector de tema", () => {
    renderWithServices(<Header />);
    expect(screen.queryByRole("button", { name: "Cerrar sesión" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Tema" })).toBeInTheDocument();
  });

  it("el título lleva al lobby", () => {
    renderWithServices(<Header />);
    expect(screen.getByRole("link", { name: "Pokémon Minigames" })).toHaveAttribute("href", "/");
  });
});
