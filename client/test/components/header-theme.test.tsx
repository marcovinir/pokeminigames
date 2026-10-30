import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Header } from "../../src/components/Header";
import { HeaderMenu } from "../../src/components/HeaderMenu";
import { ASH, fakeServices, renderWithServices, signIn } from "../helpers/services";

const openMenu = async () => userEvent.click(screen.getByRole("button", { name: "Menú" }));

describe("la apariencia en el menú", () => {
  it("la opción enfocada dibuja el aro con el color de foco del tema (el de acento ya es el de la opción marcada)", async () => {
    renderWithServices(<HeaderMenu />);
    await openMenu();
    const option = screen.getByRole("radio", { name: "Pokédex" }).nextElementSibling!;
    expect(option.className).toContain("peer-focus-visible:outline-ring");
    expect(option.className).not.toContain("outline-accent");
  });

  it("al abrirlo muestra el tema y el modo actuales", async () => {
    renderWithServices(<HeaderMenu />);
    await openMenu();
    expect(screen.getByRole("radio", { name: "Clásico" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Automático" })).toBeChecked();
  });

  it("ofrece los dos temas y los tres modos en español, cada grupo con su nombre", async () => {
    renderWithServices(<HeaderMenu />);
    await openMenu();
    expect(screen.getByRole("group", { name: "Tema" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Modo" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("aria-label") ?? radio.closest("label")?.textContent)).toEqual([
      "Clásico",
      "Pokédex",
      "Automático",
      "Claro",
      "Oscuro",
    ]);
  });

  it("al elegir otro tema lo aplica al documento", async () => {
    const services = fakeServices();
    renderWithServices(<HeaderMenu />, { services });
    await openMenu();
    await userEvent.click(screen.getByRole("radio", { name: "Pokédex" }));
    expect(services.themeRoot.dataset.theme).toBe("pokedex");
    expect(services.theme.getState().preference.theme).toBe("pokedex");
    expect(screen.getByRole("radio", { name: "Pokédex" })).toBeChecked();
  });

  it("al elegir otro modo lo aplica al documento", async () => {
    const services = fakeServices();
    renderWithServices(<HeaderMenu />, { services });
    await openMenu();
    await userEvent.click(screen.getByRole("radio", { name: "Oscuro" }));
    expect(services.themeRoot.dataset.mode).toBe("oscuro");
  });

  it("refleja un cambio de tema hecho desde fuera", async () => {
    const services = fakeServices();
    renderWithServices(<HeaderMenu />, { services });
    await openMenu();
    services.theme.getState().setTheme("pokedex");
    expect(await screen.findByRole("radio", { name: "Pokédex", checked: true })).toBeInTheDocument();
  });

  it("se puede cambiar con el teclado: las flechas mueven la selección entre los radios", async () => {
    const services = fakeServices();
    renderWithServices(<HeaderMenu />, { services });
    await openMenu();
    screen.getByRole("radio", { name: "Clásico" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(services.theme.getState().preference.theme).toBe("pokedex");
  });

});

describe("Header", () => {
  it("el botón del menú usa el color de texto del encabezado (se lee sobre su fondo en todos los temas)", () => {
    const services = fakeServices();
    signIn(services);
    renderWithServices(<Header />, { services });
    expect(screen.getByRole("button", { name: "Menú" }).className).toContain("text-header-fg");
  });

  it("con sesión muestra tu avatar, decorativo, junto al nombre", () => {
    const services = fakeServices();
    signIn(services);
    renderWithServices(<Header />, { services });
    expect(screen.getByText("AS")).toHaveAttribute("aria-hidden", "true");
  });

  it("el botón, los accesos y el nombre usan la misma fuente de títulos (el encabezado no mezcla dos letras)", () => {
    const services = fakeServices();
    signIn(services);
    renderWithServices(<Header />, { services });
    expect(screen.getByRole("button", { name: "Menú" }).className).toContain("font-display");
    expect(screen.getByRole("link", { name: "Matriz de Tipos" }).className).toContain("font-display");
    expect(screen.getByText(ASH.username).className).toContain("font-display");
  });

  it("el logo lleva al lobby y su nombre accesible es el del juego (la bola es decorativa)", () => {
    renderWithServices(<Header />);
    expect(screen.getByRole("link", { name: "PokeMiniGames" })).toHaveAttribute("href", "/");
  });

  it("es un encabezado de la página (banner)", () => {
    renderWithServices(<Header />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });
});
