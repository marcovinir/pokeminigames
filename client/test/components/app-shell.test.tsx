import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../../src/App";
import { Footer } from "../../src/components/Footer";
import { renderWithServices } from "../helpers/services";

describe("Footer", () => {
  it("dice que es un proyecto de fans, de quién son las marcas y de dónde salen el arte y los datos", () => {
    renderWithServices(<Footer />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent("Proyecto de fans sin fines de lucro.");
    expect(footer).toHaveTextContent("Pokémon y sus personajes son marcas de Nintendo, Game Freak y The Pokémon Company; no hay relación con ellos.");
    expect(footer).toHaveTextContent("Arte y datos de PokeAPI.");
  });

  it("enlaza a PokeAPI sin dar al sitio acceso a esta ventana", () => {
    renderWithServices(<Footer />);
    const link = screen.getByRole("link", { name: "PokeAPI" });
    expect(link).toHaveAttribute("href", "https://pokeapi.co");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});

describe("estructura de la aplicación", () => {
  it("tiene encabezado, contenido principal y pie, y el contenido ocupa el espacio que sobra", () => {
    renderWithServices(<App />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(main.className).toContain("flex-1");
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });
});
