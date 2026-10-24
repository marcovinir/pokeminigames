import { describe, expect, it } from "vitest";
import { namesInGenerations } from "../../src/catalog/generations";

const names = [1, 151, 152, 251, 906].map((id) => ({ id, es: `P${id}`, en: `P${id}` }));

describe("namesInGenerations", () => {
  it("deja solo los nombres de esas generaciones", () => {
    expect(namesInGenerations(names, [1]).map((n) => n.id)).toEqual([1, 151]);
    expect(namesInGenerations(names, [2, 9]).map((n) => n.id)).toEqual([152, 251, 906]);
    expect(namesInGenerations(names, [3])).toEqual([]);
  });
});
