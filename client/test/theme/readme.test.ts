import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../../..");
const readme = readFileSync(join(root, "README.md"), "utf8");
const images = [...readme.matchAll(/!\[([^\]]+)\]\((docs\/img\/[^)]+)\)/g)].map((match) => ({ alt: match[1]!, path: match[2]! }));

describe("README (etapa 6)", () => {
  it("dice que el rediseño está hecho y no que falta algo", () => {
    expect(readme).toContain("etapa 6");
    expect(readme).not.toMatch(/etapa 5 de 5/);
  });

  it("lleva el nombre del proyecto (PokeMiniGames) como título y no el anterior", () => {
    expect(readme.split("\n")[0]).toBe("# PokeMiniGames");
    expect(readme).not.toMatch(/Pokémon Minigames/);
  });

  it("muestra las pantallas principales: acceso, lobby, ronda, resultado, resumen, perfil y el tema Pokédex", () => {
    expect(images.map((image) => image.path.split("/").pop())).toEqual([
      "login.jpg",
      "lobby.jpg",
      "ronda.jpg",
      "resultado.jpg",
      "resumen.jpg",
      "perfil.jpg",
      "pokedex.jpg",
    ]);
  });

  it("cada imagen existe, es ligera y tiene un texto alternativo que la describe", () => {
    for (const { alt, path } of images) {
      const file = join(root, path);
      expect(existsSync(file), path).toBe(true);
      expect(statSync(file).size, `${path} pesa demasiado`).toBeLessThan(250_000);
      expect(alt.length, path).toBeGreaterThan(15);
    }
  });

  it("explica las fuentes empaquetadas, el movimiento y la regla de «reducir movimiento»", () => {
    expect(readme).toMatch(/Fredoka/);
    expect(readme).toMatch(/reducir movimiento/);
  });

  it("incluye el aviso de que es un proyecto de fans", () => {
    expect(readme).toMatch(/proyecto de fans/i);
  });
});
