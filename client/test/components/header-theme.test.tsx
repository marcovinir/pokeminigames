import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Header } from "../../src/components/Header";
import { ThemeMenu } from "../../src/components/ThemeMenu";
import { ASH, fakeServices, renderWithServices, signIn } from "../helpers/services";

const openMenu = async () => userEvent.click(screen.getByRole("button", { name: "Apariencia" }));

describe("ThemeMenu", () => {
  it("la opción enfocada dibuja el aro con el color de foco del tema (el de acento ya es el de la opción marcada)", async () => {
    renderWithServices(<ThemeMenu />);
    await openMenu();
    const option = screen.getByRole("radio", { name: "Pokédex" }).nextElementSibling!;
    expect(option.className).toContain("peer-focus-visible:outline-ring");
    expect(option.className).not.toContain("outline-accent");
  });

  it("empieza cerrado: solo se ve el botón de apariencia", () => {
    renderWithServices(<ThemeMenu />);
    const button = screen.getByRole("button", { name: "Apariencia" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("al abrirlo muestra el tema y el modo actuales", async () => {
    renderWithServices(<ThemeMenu />);
    await openMenu();
    expect(screen.getByRole("button", { name: "Apariencia" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("radio", { name: "Clásico" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Automático" })).toBeChecked();
  });

  it("ofrece los dos temas y los tres modos en español, cada grupo con su nombre", async () => {
    renderWithServices(<ThemeMenu />);
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
    renderWithServices(<ThemeMenu />, { services });
    await openMenu();
    await userEvent.click(screen.getByRole("radio", { name: "Pokédex" }));
    expect(services.themeRoot.dataset.theme).toBe("pokedex");
    expect(services.theme.getState().preference.theme).toBe("pokedex");
    expect(screen.getByRole("radio", { name: "Pokédex" })).toBeChecked();
  });

  it("al elegir otro modo lo aplica al documento", async () => {
    const services = fakeServices();
    renderWithServices(<ThemeMenu />, { services });
    await openMenu();
    await userEvent.click(screen.getByRole("radio", { name: "Oscuro" }));
    expect(services.themeRoot.dataset.mode).toBe("oscuro");
  });

  it("refleja un cambio de tema hecho desde fuera", async () => {
    const services = fakeServices();
    renderWithServices(<ThemeMenu />, { services });
    await openMenu();
    services.theme.getState().setTheme("pokedex");
    expect(await screen.findByRole("radio", { name: "Pokédex", checked: true })).toBeInTheDocument();
  });

  it("se puede cambiar con el teclado: las flechas mueven la selección entre los radios", async () => {
    const services = fakeServices();
    renderWithServices(<ThemeMenu />, { services });
    await openMenu();
    screen.getByRole("radio", { name: "Clásico" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(services.theme.getState().preference.theme).toBe("pokedex");
  });

  it("Escape lo cierra y devuelve el foco al botón", async () => {
    renderWithServices(<ThemeMenu />);
    await openMenu();
    screen.getByRole("radio", { name: "Claro" }).focus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apariencia" })).toHaveFocus();
  });

  it("un clic fuera lo cierra", async () => {
    renderWithServices(
      <>
        <ThemeMenu />
        <p>Otra parte de la página</p>
      </>,
    );
    await openMenu();
    await userEvent.click(screen.getByText("Otra parte de la página"));
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("el botón lo abre y lo cierra", async () => {
    renderWithServices(<ThemeMenu />);
    await openMenu();
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    await openMenu();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
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

  it("con sesión ofrece el enlace a tu perfil", () => {
    const services = fakeServices();
    signIn(services);
    renderWithServices(<Header />, { services });
    expect(screen.getByRole("link", { name: "Mi perfil" })).toHaveAttribute("href", "/perfil");
  });

  it("con sesión muestra tu avatar, decorativo, junto al nombre", () => {
    const services = fakeServices();
    signIn(services);
    renderWithServices(<Header />, { services });
    expect(screen.getByText("AS")).toHaveAttribute("aria-hidden", "true");
  });

  it("los botones, el enlace al perfil y el nombre usan la misma fuente de títulos (el encabezado no mezcla dos letras)", () => {
    const services = fakeServices();
    signIn(services);
    renderWithServices(<Header />, { services });
    expect(screen.getByRole("button", { name: "Apariencia" }).className).toContain("font-display");
    expect(screen.getByRole("button", { name: "Cerrar sesión" }).className).toContain("font-display");
    expect(screen.getByRole("link", { name: "Mi perfil" }).className).toContain("font-display");
    expect(screen.getByText(ASH.username).className).toContain("font-display");
  });

  it("sin sesión no hay enlace al perfil", () => {
    renderWithServices(<Header />);
    expect(screen.queryByRole("link", { name: "Mi perfil" })).not.toBeInTheDocument();
  });

  it("sin sesión no muestra usuario ni botón de cerrar sesión, pero sí el de apariencia", () => {
    renderWithServices(<Header />);
    expect(screen.queryByRole("button", { name: "Cerrar sesión" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apariencia" })).toBeInTheDocument();
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
