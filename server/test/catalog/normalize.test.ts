import { describe, expect, it } from "vitest";
import { normalizeName } from "../../src/catalog/normalize.js";

describe("normalizeName", () => {
  it.each([
    ["Pikachu", "pikachu"],
    ["PIKACHU", "pikachu"],
    ["  Pikachu  ", "pikachu"],
    ["Mr. Mime", "mrmime"],
    ["mr mime", "mrmime"],
    ["mr-mime", "mrmime"],
    ["Flabébé", "flabebe"],
    ["flabebe", "flabebe"],
    ["Farfetch'd", "farfetchd"],
    ["Farfetch’d", "farfetchd"],
    ["Ho-Oh", "hooh"],
    ["Porygon-Z", "porygonz"],
    ["Type: Null", "typenull"],
    ["Ñandú", "nandu"],
  ])("normaliza %s → %s", (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });

  it("distingue Nidoran♀ de Nidoran♂ y acepta la forma escrita en inglés", () => {
    expect(normalizeName("Nidoran♀")).toBe("nidoranf");
    expect(normalizeName("Nidoran♂")).toBe("nidoranm");
    expect(normalizeName("nidoran-f")).toBe("nidoranf");
    expect(normalizeName("Nidoran F")).toBe("nidoranf");
    expect(normalizeName("nidoran-m")).toBe("nidoranm");
  });

  it("devuelve cadena vacía cuando no queda ningún carácter alfanumérico", () => {
    expect(normalizeName("")).toBe("");
    expect(normalizeName("   ")).toBe("");
    expect(normalizeName("!!! ???")).toBe("");
    expect(normalizeName("😀")).toBe("");
  });

  it("es idempotente", () => {
    const once = normalizeName("Flabébé Mr. Mime");
    expect(normalizeName(once)).toBe(once);
  });
});
