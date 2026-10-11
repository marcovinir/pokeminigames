import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PokemonCatalog, loadCatalog } from "../../src/catalog/pokemon-catalog.js";
import { seedCatalog } from "../../src/catalog/seed.js";
import { fixtureCatalog, fixtureCatalogPokemon, fixtureSnapshot } from "../helpers/fixtures.js";
import { prisma, resetCatalog } from "../helpers/db.js";

const catalog = fixtureCatalog();

describe("PokemonCatalog", () => {
  describe("resolveName", () => {
    it("encuentra por nombre en español o en inglés", () => {
      expect(catalog.resolveName("Alfa")?.id).toBe(1);
      expect(catalog.resolveName("Alpha")?.id).toBe(1);
    });

    it("ignora mayúsculas, tildes, espacios y signos", () => {
      expect(catalog.resolveName("  épsilon ")?.id).toBe(5);
      expect(catalog.resolveName("EPSILON")?.id).toBe(5);
      expect(catalog.resolveName("a-l-f-a")?.id).toBe(1);
    });

    it("devuelve undefined para nombres desconocidos o vacíos", () => {
      expect(catalog.resolveName("Pikachu")).toBeUndefined();
      expect(catalog.resolveName("")).toBeUndefined();
      expect(catalog.resolveName("!!!")).toBeUndefined();
    });
  });

  it("names devuelve id y nombres de todos los Pokémon, ordenados por id y sin otros datos", () => {
    const names = catalog.names();
    expect(names).toHaveLength(10);
    expect(names[0]).toEqual({ id: 1, es: "Alfa", en: "Alpha" });
    expect(names.map((n) => n.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(Object.keys(names[0]!).sort()).toEqual(["en", "es", "id"]);
  });

  it("get devuelve el Pokémon por id", () => {
    expect(catalog.get(6)?.names.en).toBe("Zeta");
    expect(catalog.get(999)).toBeUndefined();
    expect(catalog.size).toBe(10);
  });

  it("orderPair deja el par en el orden canónico sin importar cómo se pida", () => {
    expect(PokemonCatalog.orderPair("fire", "flying")).toEqual(["flying", "fire"]);
    expect(PokemonCatalog.orderPair("flying", "fire")).toEqual(["flying", "fire"]);
  });

  describe("matchesPair", () => {
    it("exige los dos tipos: un Pokémon de un solo tipo nunca sirve", () => {
      const pair = PokemonCatalog.orderPair("fire", "flying");
      expect(catalog.matchesPair(catalog.get(1)!, pair)).toBe(true);
      expect(catalog.matchesPair(catalog.get(9)!, pair)).toBe(false); // solo fuego
      expect(catalog.matchesPair(catalog.get(4)!, pair)).toBe(false); // agua/tierra
    });
  });

  describe("freeMembers", () => {
    const pair = PokemonCatalog.orderPair("fire", "flying");

    it("da los Pokémon de doble tipo de ese par que nadie tiene, en orden estable", () => {
      expect(catalog.freeMembers(pair, new Set()).map((p) => p.id)).toEqual([1, 2, 3]);
      expect(catalog.freeMembers(pair, new Set([2])).map((p) => p.id)).toEqual([1, 3]);
      expect(catalog.freeMembers(pair, new Set([1, 2, 3]))).toEqual([]);
    });

    it("no incluye a los de un solo tipo ni a los de otro par, y un par sin Pokémon da una lista vacía", () => {
      const ids = catalog.freeMembers(pair, new Set()).map((p) => p.id);
      expect(ids).not.toContain(9); // Iota: solo fuego
      expect(catalog.freeMembers(PokemonCatalog.orderPair("ice", "dark"), new Set())).toEqual([]);
    });

    it("coincide con poolSize", () => {
      const claimed = new Set([1]);
      expect(catalog.freeMembers(pair, claimed)).toHaveLength(catalog.poolSize(pair, claimed));
    });
  });

  describe("poolSize y playablePairs", () => {
    const none = new Set<number>();

    it("cuenta los Pokémon de doble tipo sin reclamar", () => {
      const pair = PokemonCatalog.orderPair("fire", "flying");
      expect(catalog.poolSize(pair, none)).toBe(3);
      expect(catalog.poolSize(pair, new Set([1]))).toBe(2);
      expect(catalog.poolSize(PokemonCatalog.orderPair("ice", "dark"), none)).toBe(0);
    });

    it("con mínimo 2 solo son jugables los pares con al menos 2 Pokémon, en orden estable", () => {
      expect(catalog.playablePairs(none, 2)).toEqual([
        ["flying", "fire"],
        ["poison", "grass"],
        ["ground", "water"],
      ]);
    });

    it("al reclamar Pokémon, los pares dejan de ser jugables", () => {
      expect(catalog.playablePairs(new Set([6]), 2)).toEqual([
        ["flying", "fire"],
        ["ground", "water"],
      ]);
      expect(catalog.playablePairs(new Set([1, 2, 4]), 2)).toEqual([["poison", "grass"]]);
      expect(catalog.playablePairs(new Set([1, 2, 4, 6]), 2)).toEqual([]);
    });

    it("con mínimo 1 también entra el par de un solo Pokémon", () => {
      expect(catalog.playablePairs(none, 1)).toContainEqual(["steel", "electric"]);
    });
  });

  it("rechaza un catálogo con dos Pokémon que comparten nombre normalizado", () => {
    const [first, second] = fixtureCatalogPokemon();
    const clash = { ...second!, names: { es: "ALFA", en: "Otro" } };
    expect(() => new PokemonCatalog([first!, clash])).toThrow(/ambiguo/);
  });
});

describe("loadCatalog", () => {
  beforeAll(async () => {
    await resetCatalog();
    await seedCatalog(prisma, fixtureSnapshot());
    // Pokémon incompletos: uno sin nombres ni tipos, otro con nombres pero sin tipos.
    const stats = { baseHp: 10, baseAttack: 10, baseDefense: 10, baseSpAttack: 10, baseSpDefense: 10, baseSpeed: 10, totalStats: 60, spriteUrl: "u" };
    await prisma.pokemon.create({ data: { id: 98, ...stats } });
    await prisma.pokemon.create({
      data: {
        id: 99,
        ...stats,
        names: {
          create: [
            { language: "es", name: "Sin Tipos", normalizedName: "sintipos" },
            { language: "en", name: "No Types", normalizedName: "notypes" },
          ],
        },
      },
    });
  });
  afterAll(async () => {
    await resetCatalog();
    await prisma.$disconnect();
  });

  it("carga los Pokémon completos con tipos en orden de slot, nombres y stats", async () => {
    const loaded = await loadCatalog(prisma);
    expect(loaded.size).toBe(10);
    const charizardLike = loaded.get(1)!;
    expect(charizardLike.types).toEqual(["fire", "flying"]);
    expect(charizardLike.names).toEqual({ es: "Alfa", en: "Alpha" });
    expect(charizardLike.totalStats).toBe(500);
    expect(loaded.resolveName("épsilon")?.id).toBe(5);
  });

  it("ignora los Pokémon sin nombres o sin tipos", async () => {
    const loaded = await loadCatalog(prisma);
    expect(loaded.get(98)).toBeUndefined();
    expect(loaded.get(99)).toBeUndefined();
    expect(loaded.resolveName("Sin Tipos")).toBeUndefined();
  });

  it("los pares jugables coinciden con los del catálogo en memoria", async () => {
    const loaded = await loadCatalog(prisma);
    expect(loaded.playablePairs(new Set(), 2)).toEqual(fixtureCatalog().playablePairs(new Set(), 2));
  });
});
