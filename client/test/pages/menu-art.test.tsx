import { existsSync, readFileSync, statSync } from "node:fs";
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
  { src: "/menu/uno.webp", title: "Uno", shape: "portrait", author: "Ana", authorUrl: "https://ejemplo.test/ana" },
  { src: "/menu/dos.webp", title: "Dos", shape: "portrait", author: "Beto", authorUrl: "https://ejemplo.test/beto" },
  { src: "/menu/tres.webp", title: "Tres", shape: "landscape" },
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
  /** Las capas del fondo: la vertical solo en el teléfono y la horizontal solo en pantallas anchas. */
  const phone = (container: HTMLElement) => container.querySelector<HTMLImageElement>("[data-menu-background] [data-menu-phone] img");
  const wide = (container: HTMLElement) => container.querySelector<HTMLImageElement>("[data-menu-background] [data-menu-wide] img");

  it("pone un dibujo vertical para el teléfono y uno horizontal para pantallas anchas, decorativos", () => {
    const { container } = renderMenu({ random: () => 0.99, backgrounds: BACKGROUNDS });
    expect(phone(container)).toHaveAttribute("src", "/menu/dos.webp");
    expect(phone(container)).toHaveAttribute("alt", "");
    expect(phone(container)!.closest("[data-menu-phone]")!.className).toContain("lg:hidden");
    expect(wide(container)).toHaveAttribute("src", "/menu/tres.webp");
    expect(wide(container)).toHaveAttribute("alt", "");
    const wideLayer = wide(container)!.closest("[data-menu-wide]")!;
    expect(wideLayer.className).toContain("hidden");
    expect(wideLayer.className).toContain("lg:block");
  });

  it("cada versión lleva su crédito, que solo se ve en su tamaño de pantalla", () => {
    renderMenu({ random: () => 0.99, backgrounds: BACKGROUNDS });
    const credits = screen.getAllByText(/Fondo:/);
    expect(credits).toHaveLength(2);
    const [phoneCredit, wideCredit] = credits;
    expect(phoneCredit).toHaveTextContent("Fondo: «Dos», de Beto");
    expect(phoneCredit!.className).toContain("lg:hidden");
    expect(screen.getByRole("link", { name: "Beto" })).toHaveAttribute("href", "https://ejemplo.test/beto");
    expect(wideCredit).toHaveTextContent("Fondo: «Tres», fanart de autor desconocido");
    expect(wideCredit!.className).toContain("lg:block");
    expect(screen.getByRole("link", { name: "¿Es tuyo?" })).toHaveAttribute("href", "/contacto");
  });

  it("sin dibujo horizontal las pantallas anchas se quedan sin fanart (uno vertical se vería ampliado y recortado)", () => {
    const { container } = renderMenu({ random: () => 0, backgrounds: BACKGROUNDS.filter((b) => b.shape === "portrait") });
    expect(phone(container)).toHaveAttribute("src", "/menu/uno.webp");
    expect(wide(container)).toBeNull();
    expect(screen.getAllByText(/Fondo:/)).toHaveLength(1);
  });

  it("sin dibujo vertical el teléfono se queda sin fanart", () => {
    const { container } = renderMenu({ random: () => 0, backgrounds: BACKGROUNDS.filter((b) => b.shape === "landscape") });
    expect(phone(container)).toBeNull();
    expect(wide(container)).toHaveAttribute("src", "/menu/tres.webp");
  });

  it("sin fondos el menú queda como antes, sin crédito", () => {
    const { container } = renderMenu({ backgrounds: [] });
    expect(container.querySelector("[data-menu-background]")).toBeNull();
    expect(screen.queryByText(/Fondo:/)).not.toBeInTheDocument();
  });

  it("la lista publicada: Umbreon y Espeon para el teléfono, Eevee y Lucario para pantallas anchas; cada imagen existe y pesa 200 KB como mucho; el autor va con su enlace o sin ninguno", () => {
    const of = (shape: MenuBackground["shape"]) => MENU_BACKGROUNDS.filter((b) => b.shape === shape).map((b) => b.src);
    expect(of("portrait")).toEqual(["/menu/umbreon.webp", "/menu/espeon.webp"]);
    expect(of("landscape")).toEqual(["/menu/eevee.webp", "/menu/lucario.webp"]);
    for (const background of MENU_BACKGROUNDS) {
      const file = join(import.meta.dirname, "../../public", background.src);
      expect(existsSync(file), background.src).toBe(true);
      expect(statSync(file).size, background.src).toBeLessThanOrEqual(200 * 1024);
      if (background.author !== undefined) {
        expect(background.author).not.toBe("");
        expect(background.authorUrl).toMatch(/^https:\/\//);
      } else {
        expect(background.authorUrl).toBeUndefined();
      }
    }
  });
});
