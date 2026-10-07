import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArtImage } from "../../src/components/ArtImage";

const SPRITE = "https://example.test/sprite/25.png";
const OFFICIAL = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png";

const setup = (props: Partial<Parameters<typeof ArtImage>[0]> = {}) => {
  const view = render(<ArtImage id={25} spriteUrl={SPRITE} size={120} {...props} />);
  return { ...view, root: view.container.firstElementChild as HTMLElement, img: () => view.container.querySelector("img") };
};

describe("ArtImage", () => {
  it("por defecto muestra el arte oficial, decorativo y con tamaño fijo para que nada salte al cargar", () => {
    const { img } = setup();
    const image = img()!;
    expect(image).toHaveAttribute("src", OFFICIAL);
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveAttribute("width", "120");
    expect(image).toHaveAttribute("height", "120");
    expect(image).toHaveAttribute("decoding", "async");
  });

  it("carga perezosa salvo que se pida lo contrario (el resultado de la ronda la pide)", () => {
    expect(setup().img()).toHaveAttribute("loading", "lazy");
    expect(setup({ eager: true }).img()).toHaveAttribute("loading", "eager");
  });

  it("la variante sprite empieza por el sprite pequeño, sin pedir el arte grande", () => {
    expect(setup({ variant: "sprite" }).img()).toHaveAttribute("src", SPRITE);
  });

  it("muestra un esqueleto hasta que llega la imagen", () => {
    const { root, img } = setup();
    expect(root).toHaveAttribute("data-state", "loading");
    expect(root.className).toContain("skeleton");
    fireEvent.load(img()!);
    expect(root).toHaveAttribute("data-state", "loaded");
    expect(root.className).not.toContain("skeleton");
  });

  it("si falla el arte oficial cae al sprite", () => {
    const { img, root } = setup();
    fireEvent.error(img()!);
    expect(img()).toHaveAttribute("src", SPRITE);
    expect(root).toHaveAttribute("data-state", "loading");
  });

  it("si también falla el sprite muestra la bola neutra y ninguna imagen rota", () => {
    const { img, root } = setup();
    fireEvent.error(img()!);
    fireEvent.error(img()!);
    expect(img()).toBeNull();
    expect(root).toHaveAttribute("data-state", "fallback");
    expect(root.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("desde la variante sprite, un fallo va directo a la bola", () => {
    const { img, root } = setup({ variant: "sprite" });
    fireEvent.error(img()!);
    expect(img()).toBeNull();
    expect(root).toHaveAttribute("data-state", "fallback");
  });

  it("al cambiar de Pokémon vuelve a empezar por el arte oficial", () => {
    const { rerender, img } = setup();
    fireEvent.error(img()!);
    fireEvent.error(img()!);
    rerender(<ArtImage id={26} spriteUrl="https://example.test/sprite/26.png" size={120} />);
    expect(img()).toHaveAttribute("src", expect.stringContaining("/official-artwork/26.png"));
  });
});
