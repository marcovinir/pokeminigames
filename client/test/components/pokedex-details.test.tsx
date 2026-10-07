import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Header } from "../../src/components/Header";
import { fakeServices, renderWithServices, signIn } from "../helpers/services";

describe("detalles del tema Pokédex", () => {
  it("el encabezado lleva unas luces decorativas que solo se ven en Pokédex", () => {
    const { container } = renderWithServices(<Header />);
    const leds = container.querySelector("[data-leds]")!;
    expect(leds).toHaveAttribute("aria-hidden", "true");
    expect(leds.className).toContain("hidden");
    expect(leds.className).toContain("in-data-[theme=pokedex]:flex");
    expect(leds.children).toHaveLength(4);
  });

  it("las luces no cambian el nombre accesible del enlace al lobby ni añaden texto", () => {
    const { container } = renderWithServices(<Header />);
    expect(screen.getByRole("link", { name: "Pokémon Minigames" })).toBeInTheDocument();
    expect(container.querySelector("[data-leds]")!.textContent).toBe("");
  });

  it("con la sesión iniciada también están", () => {
    const services = fakeServices();
    signIn(services);
    const { container } = renderWithServices(<Header />, { services });
    expect(container.querySelector("[data-leds]")).not.toBeNull();
  });
});
