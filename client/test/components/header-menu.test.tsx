import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Header } from "../../src/components/Header";
import { ASH, GUEST, type FakeServices, fakeServices, renderWithServices, signIn } from "../helpers/services";

const menuButton = () => screen.getByRole("button", { name: "Menú" });
const panel = () => screen.getByRole("region", { name: "Menú" });

async function open(services: FakeServices = fakeServices(), route = "/") {
  renderWithServices(<Header />, { services, route });
  await userEvent.click(menuButton());
  return services;
}

function withUser(user: typeof ASH | typeof GUEST): FakeServices {
  const services = fakeServices();
  signIn(services, user);
  return services;
}

describe("el menú del encabezado", () => {
  it("empieza cerrado: el botón está y lo demás no", () => {
    const services = withUser(ASH);
    renderWithServices(<Header />, { services });
    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("button", { name: "Cerrar sesión" })).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("dentro están el sonido y la apariencia, cada uno con su nombre", async () => {
    await open();
    expect(menuButton()).toHaveAttribute("aria-expanded", "true");
    expect(within(panel()).getByRole("group", { name: "Sonido" })).toBeInTheDocument();
    expect(within(panel()).getByRole("group", { name: "Apariencia" })).toBeInTheDocument();
    expect(within(panel()).getByRole("switch", { name: "Música" })).toBeInTheDocument();
    expect(within(panel()).getByRole("radio", { name: "Pokédex" })).toBeInTheDocument();
  });

  it("sin sesión ofrece iniciar sesión, sin perfil ni cerrar sesión", async () => {
    await open();
    expect(within(panel()).getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", "/login");
    expect(within(panel()).queryByRole("link", { name: "Mi perfil" })).toBeNull();
    expect(within(panel()).queryByRole("button", { name: "Cerrar sesión" })).toBeNull();
  });

  it("una cuenta tiene «Mi perfil» y «Cerrar sesión», y cerrar sesión va al final", async () => {
    const services = await open(withUser(ASH));
    expect(within(panel()).getByRole("link", { name: "Mi perfil" })).toHaveAttribute("href", "/perfil");
    const logout = within(panel()).getByRole("button", { name: "Cerrar sesión" });
    expect(panel().lastElementChild).toContainElement(logout);
    await userEvent.click(logout);
    expect(services.endpoints.auth.logout).toHaveBeenCalledTimes(1);
    expect(services.session.getState().status).toBe("anonymous");
  });

  it("un invitado tiene «Crear cuenta» en lugar de «Mi perfil»", async () => {
    await open(withUser(GUEST));
    expect(within(panel()).getByRole("link", { name: "Crear cuenta" })).toHaveAttribute("href", "/registro");
    expect(within(panel()).queryByRole("link", { name: "Mi perfil" })).toBeNull();
    expect(within(panel()).getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
  });

  it("elegir un enlace lo cierra", async () => {
    await open(withUser(ASH));
    await userEvent.click(within(panel()).getByRole("link", { name: "Mi perfil" }));
    expect(screen.queryByRole("region", { name: "Menú" })).toBeNull();
  });

  it("Escape lo cierra y devuelve el foco al botón", async () => {
    await open();
    within(panel()).getByRole("radio", { name: "Claro" }).focus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Menú" })).toBeNull();
    expect(menuButton()).toHaveFocus();
  });

  it("Escape con el foco en otro control no le roba el foco", async () => {
    renderWithServices(
      <>
        <Header />
        <input aria-label="Otro campo" />
      </>,
    );
    await userEvent.click(menuButton());
    screen.getByLabelText("Otro campo").focus();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByLabelText("Otro campo")).toHaveFocus();
  });

  it("un clic fuera lo cierra y el botón lo abre y lo cierra", async () => {
    renderWithServices(
      <>
        <Header />
        <p>Otra parte de la página</p>
      </>,
    );
    await userEvent.click(menuButton());
    await userEvent.click(screen.getByText("Otra parte de la página"));
    expect(screen.queryByRole("region", { name: "Menú" })).toBeNull();
    await userEvent.click(menuButton());
    await userEvent.click(menuButton());
    expect(screen.queryByRole("region", { name: "Menú" })).toBeNull();
  });

  it("sacar el foco con Tab lo cierra", async () => {
    renderWithServices(
      <>
        <Header />
        <button type="button">Después</button>
      </>,
    );
    await userEvent.click(menuButton());
    const links = within(panel()).getAllByRole("link");
    links.at(-1)!.focus();
    await userEvent.tab();
    expect(screen.queryByRole("region", { name: "Menú" })).toBeNull();
  });

  it("en una pantalla baja el panel se desplaza en vez de cortarse", async () => {
    await open();
    expect(panel().className).toContain("overflow-y-auto");
    expect(panel().className).toContain("max-h-");
  });
});

describe("los accesos del encabezado", () => {
  const inBar = () => screen.getByRole("navigation", { name: "Secciones" });

  it("en el escritorio Matriz de Tipos va en la barra, como rectángulo con icono; oculta en pantallas estrechas", () => {
    renderWithServices(<Header />);
    const link = within(inBar()).getByRole("link", { name: "Matriz de Tipos" });
    expect(link).toHaveAttribute("href", "/tipos");
    expect(link.querySelector("svg")).not.toBeNull();
    expect(link.className).toContain("rounded-ui");
    expect(inBar().className).toContain("hidden");
    expect(inBar().className).toContain("lg:flex");
  });

  it("en pantallas estrechas está dentro del menú, y no en las anchas", async () => {
    await open();
    const link = within(panel()).getByRole("link", { name: "Matriz de Tipos" });
    expect(link).toHaveAttribute("href", "/tipos");
    expect(link.parentElement!.className).toContain("lg:hidden");
  });

  it("en una sala no aparece ni en la barra ni en el menú: salir cerraría la conexión", async () => {
    await open(fakeServices(), "/sala/ABC234");
    expect(screen.queryByRole("link", { name: "Matriz de Tipos" })).toBeNull();
    expect(within(panel()).getByRole("group", { name: "Sonido" })).toBeInTheDocument();
  });

  it("sigue a la vista el avatar y la etiqueta de invitado", () => {
    renderWithServices(<Header />, { services: withUser(GUEST) });
    const header = screen.getByRole("banner");
    expect(within(header).getByText("Invitado")).toBeInTheDocument();
  });
});

describe("el acceso a la Pokédex", () => {
  it("está en la barra, como rectángulo con su mini logo, antes de la Matriz de Tipos", () => {
    renderWithServices(<Header />);
    const links = within(screen.getByRole("navigation", { name: "Secciones" })).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Pokédex", "Matriz de Tipos"]);
    expect(links[0]).toHaveAttribute("href", "/pokedex");
    expect(links[0]!.querySelector("svg[data-pokedex-logo]")).not.toBeNull();
    expect(links[0]!.className).toContain("rounded-ui");
  });

  it("también en el menú, y no durante una partida", async () => {
    await open();
    expect(within(panel()).getByRole("link", { name: "Pokédex" })).toHaveAttribute("href", "/pokedex");
  });

  it("en una sala no aparece", async () => {
    await open(fakeServices(), "/sala/ABC234");
    expect(screen.queryByRole("link", { name: "Pokédex" })).toBeNull();
  });
});

