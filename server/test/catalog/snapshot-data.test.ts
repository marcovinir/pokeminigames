import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizeName } from "../../src/catalog/normalize.js";
import { seedCatalog } from "../../src/catalog/seed.js";
import { type CatalogSnapshot, TYPE_NAMES, totalStats, validateSnapshot } from "../../src/catalog/snapshot.js";
import { prisma, resetCatalog } from "../helpers/db.js";

const snapshot = JSON.parse(
  readFileSync(new URL("../../data/catalog.snapshot.json", import.meta.url), "utf8"),
) as CatalogSnapshot;

describe("snapshot del catálogo (data/catalog.snapshot.json)", () => {
  it("es válido según las reglas del catálogo", () => {
    expect(validateSnapshot(snapshot)).toEqual([]);
  });

  it("contiene las 1025 especies, numeradas de 1 a 1025 sin huecos", () => {
    expect(snapshot.pokemon).toHaveLength(1025);
    expect(snapshot.pokemon.map((p) => p.id)).toEqual(Array.from({ length: 1025 }, (_, i) => i + 1));
  });

  it("usa solo los 18 tipos del juego", () => {
    const used = new Set(snapshot.pokemon.flatMap((p) => p.types));
    expect([...used].sort()).toEqual([...TYPE_NAMES].sort());
  });

  it("tiene Pokémon de un tipo y de doble tipo", () => {
    expect(snapshot.pokemon.some((p) => p.types.length === 1)).toBe(true);
    expect(snapshot.pokemon.filter((p) => p.types.length === 2).length).toBeGreaterThan(400);
  });

  it("Charizard coincide con el ejemplo de la spec (fuego/volador, 534)", () => {
    const charizard = snapshot.pokemon.find((p) => p.id === 6)!;
    expect(charizard.types).toEqual(["fire", "flying"]);
    expect(totalStats(charizard.stats)).toBe(534);
  });

  it("los nombres con signos se normalizan como se espera", () => {
    const byId = (id: number) => snapshot.pokemon.find((p) => p.id === id)!;
    expect(normalizeName(byId(122).names.es)).toBe("mrmime");
    expect(normalizeName(byId(29).names.en)).toBe("nidoranf");
    expect(normalizeName(byId(32).names.en)).toBe("nidoranm");
  });
});

describe("seed del catálogo completo", () => {
  beforeAll(async () => {
    await resetCatalog();
    await seedCatalog(prisma, snapshot);
  }, 120_000);
  afterAll(async () => {
    await resetCatalog();
    await prisma.$disconnect();
  });

  it("carga todas las filas esperadas", async () => {
    expect(await prisma.type.count()).toBe(18);
    expect(await prisma.pokemon.count()).toBe(1025);
    expect(await prisma.pokemonName.count()).toBe(2050);
    const expectedTypeRows = snapshot.pokemon.reduce((sum, p) => sum + p.types.length, 0);
    expect(await prisma.pokemonType.count()).toBe(expectedTypeRows);
  });

  it("encuentra un Pokémon por su nombre normalizado, en español o en inglés", async () => {
    for (const query of ["charizard", "mrmime", "nidoranf"]) {
      const rows = await prisma.pokemonName.findMany({ where: { normalizedName: query } });
      expect(new Set(rows.map((r) => r.pokemonId)).size).toBe(1);
    }
  });

  it("los Pokémon de doble tipo se pueden consultar por el par de tipos", async () => {
    const fire = await prisma.type.findUniqueOrThrow({ where: { name: "fire" } });
    const flying = await prisma.type.findUniqueOrThrow({ where: { name: "flying" } });
    const both = await prisma.pokemon.findMany({
      where: { AND: [{ types: { some: { typeId: fire.id } } }, { types: { some: { typeId: flying.id } } }] },
      select: { id: true },
    });
    expect(both.map((p) => p.id)).toContain(6);
  });
});
