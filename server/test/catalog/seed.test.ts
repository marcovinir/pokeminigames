import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { seedCatalog } from "../../src/catalog/seed.js";
import type { CatalogSnapshot } from "../../src/catalog/snapshot.js";
import { prisma, resetCatalog } from "../helpers/db.js";

const snapshot: CatalogSnapshot = {
  generatedAt: "2026-01-01T00:00:00.000Z",
  source: "test",
  pokemon: [
    {
      id: 1,
      types: ["grass", "poison"],
      stats: { hp: 45, attack: 49, defense: 49, spAttack: 65, spDefense: 65, speed: 45 },
      spriteUrl: "https://example.com/1.png",
      names: { es: "Bulbasaur", en: "Bulbasaur" },
    },
    {
      id: 4,
      types: ["fire"],
      stats: { hp: 39, attack: 52, defense: 43, spAttack: 60, spDefense: 50, speed: 65 },
      spriteUrl: "https://example.com/4.png",
      names: { es: "Charmander", en: "Charmander" },
    },
    {
      id: 29,
      types: ["poison"],
      stats: { hp: 55, attack: 47, defense: 52, spAttack: 40, spDefense: 40, speed: 41 },
      spriteUrl: "https://example.com/29.png",
      names: { es: "Nidoran♀", en: "Nidoran♀" },
    },
  ],
};

beforeEach(resetCatalog);
afterAll(() => prisma.$disconnect());

describe("seedCatalog", () => {
  it("carga tipos, Pokémon, tipos por Pokémon y nombres", async () => {
    await expect(seedCatalog(prisma, snapshot)).resolves.toEqual({ pokemon: 3 });

    expect(await prisma.type.count()).toBe(18);
    expect(await prisma.pokemon.count()).toBe(3);
    expect(await prisma.pokemonName.count()).toBe(6);
    expect(await prisma.pokemonType.count()).toBe(4);
  });

  it("calcula total_stats y guarda el orden de los tipos en slot", async () => {
    await seedCatalog(prisma, snapshot);
    const bulbasaur = await prisma.pokemon.findUniqueOrThrow({
      where: { id: 1 },
      include: { types: { orderBy: { slot: "asc" }, include: { type: true } } },
    });
    expect(bulbasaur.totalStats).toBe(318);
    expect(bulbasaur.types.map((t) => [t.slot, t.type.name])).toEqual([
      [1, "grass"],
      [2, "poison"],
    ]);
  });

  it("guarda el nombre normalizado para buscar sin tildes ni mayúsculas", async () => {
    await seedCatalog(prisma, snapshot);
    const rows = await prisma.pokemonName.findMany({ where: { normalizedName: "nidoranf" } });
    expect(rows.map((r) => r.pokemonId)).toEqual([29, 29]);
    expect(rows.map((r) => r.language).sort()).toEqual(["en", "es"]);
  });

  it("es idempotente: ejecutarlo dos veces no duplica filas", async () => {
    await seedCatalog(prisma, snapshot);
    await seedCatalog(prisma, snapshot);
    expect(await prisma.pokemon.count()).toBe(3);
    expect(await prisma.pokemonName.count()).toBe(6);
    expect(await prisma.pokemonType.count()).toBe(4);
  });

  it("actualiza los datos cuando el snapshot cambia", async () => {
    await seedCatalog(prisma, snapshot);
    const changed: CatalogSnapshot = {
      ...snapshot,
      pokemon: snapshot.pokemon.map((p) =>
        p.id === 4
          ? { ...p, types: ["fire", "flying"], stats: { ...p.stats, hp: 100 }, names: { es: "Charmander", en: "Charmandero" } }
          : p,
      ),
    };
    await seedCatalog(prisma, changed);

    const charmander = await prisma.pokemon.findUniqueOrThrow({
      where: { id: 4 },
      include: { types: true, names: true },
    });
    expect(charmander.baseHp).toBe(100);
    expect(charmander.totalStats).toBe(100 + 52 + 43 + 60 + 50 + 65);
    expect(charmander.types).toHaveLength(2);
    expect(charmander.names.find((n) => n.language === "en")?.normalizedName).toBe("charmandero");
  });

  it("rechaza un snapshot inválido sin tocar la base de datos", async () => {
    await seedCatalog(prisma, snapshot);
    const invalid: CatalogSnapshot = { ...snapshot, pokemon: [{ ...snapshot.pokemon[0]!, types: [] }] };
    await expect(seedCatalog(prisma, invalid)).rejects.toThrow(/Snapshot inválido/);
    expect(await prisma.pokemon.count()).toBe(3);
  });
});
