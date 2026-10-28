import { readFileSync } from "node:fs";
import type { BaseStats, PokemonFact, TypeName } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import { PokemonCatalog, type CatalogPokemon } from "../../src/catalog/pokemon-catalog.js";
import { buildFacts } from "../../src/catalog/facts.js";
import { type CatalogSnapshot, totalStats } from "../../src/catalog/snapshot.js";
import { fixtureCatalog, fixtureCatalogPokemon, statsFor } from "../helpers/fixtures.js";

const STATS = ["hp", "attack", "defense", "spAttack", "spDefense", "speed"] as const;

const find = <K extends PokemonFact["kind"]>(facts: PokemonFact[], kind: K, match: (fact: Extract<PokemonFact, { kind: K }>) => boolean = () => true) =>
  facts.find((fact): fact is Extract<PokemonFact, { kind: K }> => fact.kind === kind && match(fact as Extract<PokemonFact, { kind: K }>));

describe("buildFacts con el catálogo de pruebas", () => {
  const facts = buildFacts(fixtureCatalog());

  it("el que más stats totales tiene es Zeta (600) y el que menos Eta (200)", () => {
    expect(find(facts, "top_stat", (f) => f.stat === "total")).toEqual({ kind: "top_stat", stat: "total", pokemon: [{ id: 6, es: "Zeta" }], value: 600 });
    expect(find(facts, "lowest_total")).toEqual({ kind: "lowest_total", pokemon: [{ id: 7, es: "Eta" }], value: 200 });
  });

  it("Zeta gana las seis stats", () => {
    for (const stat of STATS) {
      expect(find(facts, "top_stat", (f) => f.stat === stat), stat).toMatchObject({ pokemon: [{ id: 6, es: "Zeta" }], value: 100 });
    }
  });

  it("da el tipo con más Pokémon (fuego, 4) y omite el más raro si hay empate (eléctrico y acero, 1); ya no un dato por tipo", () => {
    const extremes = facts.filter((f) => f.kind === "type_extreme");
    expect(extremes).toEqual([{ kind: "type_extreme", which: "most", type: "fire", count: 4 }]);
    expect(facts.some((f) => (f.kind as string) === "type_count")).toBe(false);
  });

  it("dual_type_count 8 de 10, pair_count 4 y common_pair flying+fire (orden canónico de los tipos) con 3", () => {
    expect(find(facts, "dual_type_count")).toEqual({ kind: "dual_type_count", count: 8, total: 10 });
    expect(find(facts, "pair_count")).toEqual({ kind: "pair_count", count: 4 });
    expect(find(facts, "common_pair")).toEqual({ kind: "common_pair", pair: ["flying", "fire"], count: 3 });
  });

  it("es determinista: dos llamadas dan lo mismo", () => {
    expect(buildFacts(fixtureCatalog())).toEqual(facts);
  });
});

describe("buildFacts con empates", () => {
  /** El catálogo de pruebas con estos Pokémon empatados en el máximo de stats totales (600, como Zeta). */
  function withTiedTop(ids: number[]): PokemonCatalog {
    const list: CatalogPokemon[] = fixtureCatalogPokemon().map((p) => {
      if (!ids.includes(p.id)) return p;
      const stats: BaseStats = statsFor(600);
      return { ...p, stats, totalStats: totalStats(stats) };
    });
    return new PokemonCatalog(list);
  }

  it("con un empate de dos Pokémon en el máximo lista los dos, por id", () => {
    const fact = find(buildFacts(withTiedTop([1, 6])), "top_stat", (f) => f.stat === "total");
    expect(fact?.pokemon).toEqual([
      { id: 1, es: "Alfa" },
      { id: 6, es: "Zeta" },
    ]);
  });

  it("con cuatro Pokémon empatados omite el dato", () => {
    const facts = buildFacts(withTiedTop([1, 2, 3, 6]));
    expect(find(facts, "top_stat", (f) => f.stat === "total")).toBeUndefined();
  });

  it("si dos pares empatan como los más comunes omite common_pair", () => {
    const list = fixtureCatalogPokemon().filter((p) => p.id !== 3); // fire+flying baja a 2, igual que water+ground
    expect(find(buildFacts(new PokemonCatalog(list)), "common_pair")).toBeUndefined();
  });
});

describe("buildFacts con el catálogo real (data/catalog.snapshot.json)", () => {
  const snapshot = JSON.parse(readFileSync(new URL("../../data/catalog.snapshot.json", import.meta.url), "utf8")) as CatalogSnapshot;
  const pokemon: CatalogPokemon[] = snapshot.pokemon.map((p) => ({
    id: p.id,
    names: p.names,
    spriteUrl: p.spriteUrl,
    types: p.types as TypeName[],
    stats: p.stats,
    totalStats: totalStats(p.stats),
  }));
  const catalog = new PokemonCatalog(pokemon);
  const facts = buildFacts(catalog);

  it("hay entre 8 y 20 datos (uno por tipo ya no), sin NaN ni nombres vacíos, y cada Pokémon citado existe en el catálogo con ese nombre", () => {
    expect(facts.length).toBeGreaterThanOrEqual(8);
    expect(facts.length).toBeLessThanOrEqual(20);
    expect(JSON.stringify(facts)).not.toMatch(/NaN|null|undefined/);
    for (const fact of facts) {
      if (fact.kind !== "top_stat" && fact.kind !== "lowest_total") continue;
      expect(fact.pokemon.length).toBeGreaterThan(0);
      expect(fact.pokemon.length).toBeLessThanOrEqual(3);
      for (const named of fact.pokemon) {
        expect(named.es).not.toBe("");
        expect(catalog.get(named.id)?.names.es).toBe(named.es);
      }
    }
  });

  it("cada dato coincide con un cálculo independiente de la prueba", () => {
    // Máximos y mínimos de stats, recalculados aquí a su manera.
    const best = (value: (p: CatalogPokemon) => number, sign: 1 | -1) => {
      const top = Math.max(...pokemon.map((p) => sign * value(p)));
      return { value: sign * top, ids: pokemon.filter((p) => sign * value(p) === top).map((p) => p.id).sort((a, b) => a - b) };
    };
    for (const stat of STATS) {
      const expected = best((p) => p.stats[stat], 1);
      const fact = find(facts, "top_stat", (f) => f.stat === stat);
      if (expected.ids.length > 3) expect(fact, stat).toBeUndefined();
      else expect(fact, stat).toMatchObject({ value: expected.value, pokemon: expected.ids.map((id) => ({ id })) });
    }
    const total = best((p) => p.totalStats, 1);
    expect(find(facts, "top_stat", (f) => f.stat === "total")).toMatchObject({ value: total.value, pokemon: total.ids.map((id) => ({ id })) });
    const lowest = best((p) => p.totalStats, -1);
    expect(find(facts, "lowest_total")).toMatchObject({ value: lowest.value, pokemon: lowest.ids.map((id) => ({ id })) });

    // Conteos de tipos y de combinaciones.
    const typeCounts = new Map<string, number>();
    const pairCounts = new Map<string, number>();
    for (const p of pokemon) {
      for (const type of p.types) typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
      if (p.types.length === 2) {
        const key = [...p.types].sort().join("+");
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
    const reported = facts.filter((f): f is Extract<PokemonFact, { kind: "type_extreme" }> => f.kind === "type_extreme");
    const most = Math.max(...typeCounts.values());
    const least = Math.min(...typeCounts.values());
    const unique = (n: number) => [...typeCounts.values()].filter((count) => count === n).length === 1;
    expect(reported.length).toBe(Number(unique(most)) + Number(unique(least)));
    for (const fact of reported) {
      expect(fact.count, fact.type).toBe(typeCounts.get(fact.type));
      expect(fact.count).toBe(fact.which === "most" ? most : least);
    }
    expect(find(facts, "dual_type_count")).toEqual({ kind: "dual_type_count", count: pokemon.filter((p) => p.types.length === 2).length, total: pokemon.length });
    expect(find(facts, "pair_count")?.count).toBe(pairCounts.size);
    const topPair = Math.max(...pairCounts.values());
    const common = find(facts, "common_pair");
    if ([...pairCounts.values()].filter((n) => n === topPair).length === 1) {
      expect(common?.count).toBe(topPair);
      expect(pairCounts.get([...(common?.pair ?? [])].sort().join("+"))).toBe(topPair);
    } else {
      expect(common).toBeUndefined();
    }
  });
});
