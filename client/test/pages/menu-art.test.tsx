import { readFileSync } from "node:fs";
import { join } from "node:path";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DOBLE_TIPO_EXAMPLES, MENU_BACKGROUNDS, type MenuBackground, pickRandom } from "../../src/pages/menu-art";
import { MainMenu } from "../../src/pages/MainMenu";
import { fakeServices, renderWithServices, signIn } from "../helpers/services";

const snapshot = JSON.parse(readFileSync(join(import.meta.dirname, "../../../server/data/catalog.snapshot.json"), "utf8")) as {
  pokemon: { id: number; types: string[] }[];
};

const BACKGROUNDS: MenuBackground[] = [
  { src: "/menu/uno.webp", title: "Uno", author: "Ana", authorUrl: "https://ejemplo.test/ana" },
  { src: "/menu/dos.webp", title: "Dos", author: "Beto", authorUrl: "https://ejemplo.test/beto" },
];

function renderMenu(props: Parameters<typeof MainMenu>[0] = {}) {
  const services = fakeServices();
  signIn(services);
  return renderWithServices(<MainMenu {...props} />, { services });
}

const dobleTipoCard = () => screen.getAllByRole("article")[0]!;

describe("pickRandom", () => {
  it("elige según el azar y no rompe con una lista vacía", () => {
    expect(pickRandom(["a", "b", "c"], () => 0)).toBe("a");
    expect(pickRandom(["a", "b", "c"], () => 0.99)).toBe("c");
    expect(pickRandom([], () => 0.5)).toBeUndefined();
  });
});

describe("la tarjeta de «Doble tipo»", () => {
  it("cada ejemplo es un Pokémon real con exactamente esos dos tipos", () => {
    expect(DOBLE_TIPO_EXAMPLES.length).toBeGreaterThanOrEqual(8);
    for (const { pokemonId, types } of DOBLE_TIPO_EXAMPLES) {
      expect(snapshot.pokemon.find((p) => p.id === pokemonId)?.types, `n.º ${pokemonId}`).toEqual(types);
    }
  });

  it("enseña el arte oficial del ejemplo elegido y sus dos tipos", () => {
    renderMenu({ random: () => 0 });
    const first = DOBLE_TIPO_EXAMPLES[0]!;
    const card = dobleTipoCard();
    expect(card.querySelector(`img[src$="/official-artwork/${first.pokemonId}.png"]`)).not.toBeNull();
    expect(within(card).getByText("fuego")).toBeInTheDocument();
    expect(within(card).getByText("volador")).toBeInTheDocument();
  });

  it("otro azar, otro ejemplo", () => {
    renderMenu({ random: () => 0.99 });
    const last = DOBLE_TIPO_EXAMPLES.at(-1)!;
    expect(dobleTipoCard().querySelector(`img[src$="/official-artwork/${last.pokemonId}.png"]`)).not.toBeNull();
  });
});

describe("el fondo del menú", () => {
  it("pone uno de los fondos, decorativo, con el crédito y el enlace a su autor", () => {
    const { container } = renderMenu({ random: () => 0.99, backgrounds: BACKGROUNDS });
    const bg = container.querySelector("[data-menu-background] img");
    expect(bg).toHaveAttribute("src", "/menu/dos.webp");
    expect(bg).toHaveAttribute("alt", "");
    expect(screen.getByText(/Fondo:/)).toHaveTextContent("Fondo: «Dos», de Beto");
    expect(screen.getByRole("link", { name: "Beto" })).toHaveAttribute("href", "https://ejemplo.test/beto");
  });

  it("sin fondos (hasta tener permisos) el menú queda como antes, sin crédito", () => {
    const { container } = renderMenu({ backgrounds: [] });
    expect(container.querySelector("[data-menu-background]")).toBeNull();
    expect(screen.queryByText(/Fondo:/)).not.toBeInTheDocument();
  });

  it("la lista publicada solo lleva fondos con autor y enlace", () => {
    for (const background of MENU_BACKGROUNDS) {
      expect(background.author).not.toBe("");
      expect(background.authorUrl).toMatch(/^https:\/\//);
    }
  });
});
