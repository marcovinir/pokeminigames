import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GameArt } from "../../src/components/GameArt";
import { SILHOUETTE_COVERS, pickCovers } from "../../src/pages/menu-art";

const example = { pokemonId: 6, types: ["fire", "flying"] as ["fire", "flying"] };

describe("las portadas de los minijuegos", () => {
  it("hay varias siluetas, sin repetir", () => {
    expect(SILHOUETTE_COVERS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(SILHOUETTE_COVERS).size).toBe(SILHOUETTE_COVERS.length);
  });

  it("el azar decide la silueta", () => {
    const seen = new Set([0, 0.25, 0.5, 0.75, 0.99].map((value) => pickCovers(() => value).silhouette));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("los dos juegos nunca muestran el mismo Pokémon a la vez, ni en los extremos del azar", () => {
    for (const value of [0, 0.5, 0.999]) {
      const covers = pickCovers(() => value);
      expect(covers.auction).not.toBe(covers.silhouette);
      expect(SILHOUETTE_COVERS).toContain(covers.auction);
    }
  });

  it("la silueta muestra el Pokémon que le toca, en negro", () => {
    const { container } = render(<GameArt game="silueta" example={example} covers={{ silhouette: 25, auction: 150 }} />);
    const image = container.querySelector("img")!;
    expect(image.getAttribute("src")).toContain("/25.png");
    expect(image).toHaveClass("brightness-0");
  });

  it("la subasta tiene su propia escena: foco, mazo y precio, sin los rayos de la silueta", () => {
    const { container } = render(<GameArt game="subasta" example={example} covers={{ silhouette: 25, auction: 150 }} />);
    expect(container.querySelector(".silhouette-rays")).toBeNull();
    expect(container.querySelector(".auction-stage")).not.toBeNull();
    expect(container.querySelector("[data-gavel]")).not.toBeNull();
    expect(container.querySelector("[data-price-tag]")).toHaveTextContent("₽");
    expect(container.querySelector("img")!.getAttribute("src")).toContain("/150.png");
  });

  it("las portadas son decorativas", () => {
    const { container } = render(<GameArt game="subasta" example={example} />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
