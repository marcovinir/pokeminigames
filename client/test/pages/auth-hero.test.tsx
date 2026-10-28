import { GAME_KINDS } from "@pokemon-minigames/shared";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GAME_CARDS } from "../../src/i18n/es";
import { LoginPage, RegisterPage } from "../../src/pages/AuthPages";
import { renderWithServices } from "../helpers/services";

const PAGES = [
  ["inicio de sesión", <LoginPage key="l" />, "Iniciar sesión"],
  ["registro", <RegisterPage key="r" />, "Crear cuenta"],
] as const;

describe("pantallas de acceso: la presentación de PokeMiniGames", () => {
  it.each(PAGES)("%s: el lema habla de minijuegos 1 vs 1 con amigos, no de un solo juego", (_name, page, heading) => {
    const { container } = renderWithServices(page);
    const lema = screen.getByText(/Minijuegos Pokémon para jugar/);
    expect(lema).toHaveTextContent("1 vs 1");
    expect(lema).toHaveTextContent("amigos");
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    const hero = container.querySelector("[data-hero]")!;
    expect(hero).not.toHaveTextContent(/veneno|15 segundos|Nombra el Pokémon/);
    expect(screen.queryByRole("list", { name: "Cómo se juega" })).not.toBeInTheDocument();
  });

  it.each(PAGES)("%s: hay un elemento por minijuego, con su nombre y su frase", (_name, page) => {
    renderWithServices(page);
    const list = screen.getByRole("list", { name: "Minijuegos" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(GAME_KINDS.length);
    GAME_KINDS.forEach((game, index) => {
      expect(items[index]).toHaveTextContent(GAME_CARDS[game].name);
      expect(items[index]).toHaveTextContent(GAME_CARDS[game].description);
    });
  });

  it("los dibujos de los minijuegos son decorativos", () => {
    renderWithServices(<LoginPage />);
    const list = screen.getByRole("list", { name: "Minijuegos" });
    const arts = list.querySelectorAll("img");
    expect(arts.length).toBeGreaterThanOrEqual(GAME_KINDS.length);
    for (const img of arts) expect(img.closest("[aria-hidden='true']")).not.toBeNull();
  });

  it("el juego nuevo lleva su insignia", () => {
    renderWithServices(<LoginPage />);
    const items = within(screen.getByRole("list", { name: "Minijuegos" })).getAllByRole("listitem");
    GAME_KINDS.forEach((game, index) => {
      if (GAME_CARDS[game].isNew) expect(items[index]).toHaveTextContent("NUEVO");
      else expect(items[index]).not.toHaveTextContent("NUEVO");
    });
  });

  it("la lista se oculta en pantallas estrechas; el lema se queda", () => {
    renderWithServices(<LoginPage />);
    const list = screen.getByRole("list", { name: "Minijuegos" });
    expect(list.closest("[class*='hidden']")!.className).toContain("md:block");
    expect(screen.getByText(/Minijuegos Pokémon para jugar/).closest("[class*='hidden']")).toBeNull();
  });

  it("el formulario está en una tarjeta elevada y conserva sus campos y su botón", () => {
    renderWithServices(<LoginPage />);
    const card = screen.getByRole("heading", { name: "Iniciar sesión" }).closest("section")!;
    expect(card.className).toContain("shadow-pop");
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Crea una" })).toHaveAttribute("href", "/registro");
  });

  it("no añade avisos de estado que se mezclen con los del formulario", () => {
    renderWithServices(<LoginPage />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
