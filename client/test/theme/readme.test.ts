import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../../..");
const read = (path: string): string => readFileSync(join(root, path), "utf8");

/** Las imágenes de un documento Markdown, con la ruta resuelta desde la raíz del repositorio. */
function imagesOf(path: string): { alt: string; file: string }[] {
  return [...read(path).matchAll(/!\[([^\]]+)\]\(([^)]+\.(?:jpg|png|gif|webp))\)/g)].map((match) => ({
    alt: match[1]!,
    file: join(root, dirname(path), match[2]!),
  }));
}

/** Los enlaces relativos (no web ni anclas) de un documento, resueltos desde la raíz. */
function relativeLinksOf(path: string): string[] {
  return [...read(path).matchAll(/\]\(([^)]+)\)/g)]
    .map((match) => match[1]!.split("#")[0]!)
    .filter((link) => link !== "" && !/^(https?:|mailto:)/.test(link))
    .map((link) => join(root, dirname(path), link));
}

const SHOTS = ["menu.jpg", "ronda.jpg", "silueta.jpg", "resumen.jpg", "login.jpg", "perfil.jpg"];

describe.each([
  ["README.md", "README.es.md", /fan project/i],
  ["README.es.md", "README.md", /proyecto de fans/i],
])("%s", (path, other, disclaimer) => {
  const text = read(path);

  it("lleva el nombre del proyecto como título y enlaza a la otra versión", () => {
    expect(text.split("\n")[0]).toBe("# PokeMiniGames");
    expect(text).not.toMatch(/Pokémon Minigames/);
    expect(text).toContain(`](${other})`);
  });

  it("enlaza al juego en vivo, a la CI y a la guía técnica y la de despliegue", () => {
    expect(text).toContain("https://pokemon-minigames.onrender.com");
    expect(text).toContain("actions/workflows/ci.yml");
    expect(text).toContain("docs/guia-tecnica.md");
    expect(text).toContain("docs/despliegue.md");
  });

  it("muestra las pantallas principales, cada una existe, es ligera y tiene un texto alternativo que la describe", () => {
    const images = imagesOf(path);
    expect(images.map((image) => image.file.split(/[\\/]/).pop())).toEqual(SHOTS);
    for (const { alt, file } of images) {
      expect(existsSync(file), file).toBe(true);
      expect(statSync(file).size, `${file} pesa demasiado`).toBeLessThan(250_000);
      expect(alt.length, file).toBeGreaterThan(15);
    }
  });

  it("todos sus enlaces relativos apuntan a archivos que existen", () => {
    for (const file of relativeLinksOf(path)) expect(existsSync(file), file).toBe(true);
  });

  it("incluye el aviso de que es un proyecto de fans y la licencia", () => {
    expect(text).toMatch(disclaimer);
    expect(text).toContain("Nintendo");
    expect(text).toContain("](LICENSE)");
  });
});

describe("guía técnica (docs/guia-tecnica.md)", () => {
  it("conserva el detalle: fuentes, reducir movimiento, la API y los enlaces que funcionan", () => {
    const guide = read("docs/guia-tecnica.md");
    expect(guide.split("\n")[0]).toBe("# PokeMiniGames: guía técnica");
    expect(guide).toMatch(/Fredoka/);
    expect(guide).toMatch(/reducir movimiento/);
    expect(guide).toContain("DELETE /auth/me");
    for (const file of relativeLinksOf("docs/guia-tecnica.md")) expect(existsSync(file), file).toBe(true);
    for (const { file } of imagesOf("docs/guia-tecnica.md")) expect(existsSync(file), file).toBe(true);
  });
});

describe("licencia", () => {
  it("es MIT y deja claro que no cubre lo de Pokémon", () => {
    const license = read("LICENSE");
    expect(license).toMatch(/^MIT License/);
    expect(license).toContain("Nintendo");
    expect(license).toMatch(/music/i);
  });
});
