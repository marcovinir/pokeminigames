import { describe, expect, it } from "vitest";
import { type PokeApiChainLink, fetchPokedex, latestLocalized, toEvolutionCondition, toEvolutionNode, toPokedexDetail } from "../../src/catalog/pokedex-snapshot.js";

const entry = (flavor_text: string, language: string, version: number) => ({
  flavor_text,
  language: { name: language },
  version: { name: `v${version}`, url: `https://pokeapi.co/api/v2/version/${version}/` },
});
const none = {} as Record<string, unknown>;
const itemName = (name: string) => (name === "water-stone" ? "Piedra Agua" : name);

describe("latestLocalized", () => {
  it("elige la entrada en español de la versión más reciente, aunque venga antes en la lista", () => {
    expect(latestLocalized([entry("nuevo", "es", 20), entry("viejo", "es", 3), entry("new", "en", 30)])).toEqual({ text: "nuevo", language: "es", version: "v20" });
  });

  it("sin español, usa la inglesa más reciente", () => {
    expect(latestLocalized([entry("old", "en", 1), entry("new", "en", 9), entry("neu", "de", 40)])).toEqual({ text: "new", language: "en", version: "v9" });
  });

  it("sin ninguna de las dos, null", () => {
    expect(latestLocalized([entry("neu", "de", 1)])).toBeNull();
    expect(latestLocalized([])).toBeNull();
  });

  it("limpia saltos de línea, saltos de página y guiones blandos", () => {
    expect(latestLocalized([entry("Una\nllama\f bri­llante", "es", 1)])?.text).toBe("Una llama brillante");
  });

  it("entiende las entradas de habilidades, que van por grupo de versiones", () => {
    const ability = { flavor_text: "Potencia", language: { name: "es" }, version_group: { name: "g1", url: "https://pokeapi.co/api/v2/version-group/5/" } };
    expect(latestLocalized([ability])).toEqual({ text: "Potencia", language: "es", version: "g1" });
  });
});

describe("toEvolutionCondition", () => {
  const trigger = (name: string, extra = none) => ({ trigger: { name }, ...extra });

  it.each([
    [[trigger("use-item", { item: { name: "water-stone" } })], { kind: "item", item: "Piedra Agua" }],
    [[trigger("level-up", { min_level: 16 })], { kind: "level", level: 16 }],
    [[trigger("level-up", { min_level: 20, time_of_day: "night" })], { kind: "level", level: 20, timeOfDay: "night" }],
    [[trigger("level-up", { min_happiness: 160 })], { kind: "friendship" }],
    [[trigger("level-up", { min_happiness: 160, time_of_day: "day" })], { kind: "friendship", timeOfDay: "day" }],
    [[trigger("trade")], { kind: "trade" }],
  ])("%j", (details, expected) => expect(toEvolutionCondition(details, itemName)).toEqual(expected));

  it("la forma de partida o de llegada no es un requisito: Vaporeon sigue evolucionando con Piedra Agua", () => {
    const details = [trigger("use-item", { item: { name: "water-stone" }, required_pokemon_form: { name: "eevee" }, evolved_pokemon_form: { name: "vaporeon" } })];
    expect(toEvolutionCondition(details, itemName)).toEqual({ kind: "item", item: "Piedra Agua" });
  });

  it.each([
    [[trigger("level-up", { known_move: { name: "x" } })]],
    [[trigger("level-up", { location: { name: "x" } })]],
    [[trigger("level-up", { min_level: 20, gender: 1 })]],
    [[trigger("level-up", { min_level: 20, time_of_day: "dusk" })]],
    [[trigger("trade", { held_item: { name: "x" } })]],
    [[trigger("use-item", { item: { name: "x" }, gender: 2 })]],
    [[trigger("shed")]],
    [[trigger("level-up")]],
    [[]],
  ])("condición que no se sabe expresar: %j", (details) => expect(toEvolutionCondition(details, itemName)).toEqual({ kind: "other" }));
});

describe("toEvolutionNode", () => {
  const species = (id: number) => ({ name: `s${id}`, url: `https://pokeapi.co/api/v2/pokemon-species/${id}/` });
  const link = (id: number, evolves_to: PokeApiChainLink[] = [], evolution_details: PokeApiChainLink["evolution_details"] = []): PokeApiChainLink => ({ species: species(id), evolves_to, evolution_details });
  const names = (id: number) => (id <= 1025 ? `Nombre ${id}` : undefined);

  it("conserva las ramas, con la condición en el nodo que evoluciona", () => {
    const stone = [{ trigger: { name: "use-item" }, item: { name: "water-stone" } }];
    const node = toEvolutionNode(link(133, [link(134, [], stone), link(135, [], stone), link(136, [], stone)]), names, itemName);
    expect(node).toMatchObject({ id: 133, name: "Nombre 133", condition: null });
    expect(node.next.map((next) => next.id)).toEqual([134, 135, 136]);
    expect(node.next[0]!.condition).toEqual({ kind: "item", item: "Piedra Agua" });
  });

  it("descarta lo que está fuera de la Pokédex", () => {
    expect(toEvolutionNode(link(1, [link(2000)]), names, itemName).next).toEqual([]);
  });
});

const charizardPokemon = {
  id: 6,
  name: "charizard",
  types: [{ slot: 1, type: { name: "fire" } }, { slot: 2, type: { name: "flying" } }],
  stats: [
    ["hp", 78],
    ["attack", 84],
    ["defense", 78],
    ["special-attack", 109],
    ["special-defense", 85],
    ["speed", 100],
  ].map(([name, base_stat]) => ({ base_stat: base_stat as number, stat: { name: name as string } })),
  sprites: { front_default: "https://sprite/6.png" },
  abilities: [
    { is_hidden: false, slot: 1, ability: { name: "blaze" } },
    { is_hidden: true, slot: 3, ability: { name: "solar-power" } },
  ],
};
const charizardSpecies = {
  names: [{ language: { name: "es" }, name: "Charizard" }, { language: { name: "en" }, name: "Charizard" }],
  generation: { name: "generation-i" },
  evolution_chain: { url: "https://pokeapi.co/api/v2/evolution-chain/2/" },
  flavor_text_entries: [entry("Escupe fuego.", "es", 23)],
};

describe("toPokedexDetail", () => {
  const abilityOf = (name: string) =>
    name === "blaze" ? { name: "Mar Llamas", description: { text: "Potencia el fuego.", language: "es" as const } } : { name: "Poder Solar", description: null };
  const chain = { id: 6, name: "Charizard", condition: null, next: [] };

  it("arma la ficha completa de Charizard", () => {
    expect(toPokedexDetail(charizardPokemon, charizardSpecies, { abilityOf, chain, gameOf: () => "Escudo" })).toEqual({
      id: 6,
      names: { es: "Charizard", en: "Charizard" },
      types: ["fire", "flying"],
      total: 534,
      generation: 1,
      spriteUrl: "https://sprite/6.png",
      stats: { hp: 78, attack: 84, defense: 78, spAttack: 109, spDefense: 85, speed: 100 },
      abilities: [
        { name: "Mar Llamas", hidden: false, description: { text: "Potencia el fuego.", language: "es" } },
        { name: "Poder Solar", hidden: true, description: null },
      ],
      lore: { text: "Escupe fuego.", language: "es", game: "Escudo" },
      evolution: chain,
    });
  });

  it("generation-ix es la 9, y sin textos el lore es null", () => {
    const detail = toPokedexDetail(charizardPokemon, { ...charizardSpecies, generation: { name: "generation-ix" }, flavor_text_entries: [] }, { abilityOf, chain, gameOf: () => "" });
    expect(detail.generation).toBe(9);
    expect(detail.lore).toBeNull();
  });
});

describe("fetchPokedex", () => {
  it("baja una sola vez cada cadena, habilidad y juego, y cada miembro apunta a la misma cadena", async () => {
    const asked: string[] = [];
    const chainSpecies = (id: number) => ({ name: `s${id}`, url: `https://pokeapi.co/api/v2/pokemon-species/${id}/` });
    const responses: Record<string, unknown> = {
      "pokemon-species?limit=1": { count: 2 },
      "pokemon/1": { ...charizardPokemon, id: 1 },
      "pokemon/2": { ...charizardPokemon, id: 2 },
      "pokemon-species/1": { ...charizardSpecies, names: [{ language: { name: "es" }, name: "Uno" }, { language: { name: "en" }, name: "One" }] },
      "pokemon-species/2": { ...charizardSpecies, names: [{ language: { name: "es" }, name: "Dos" }, { language: { name: "en" }, name: "Two" }] },
      "evolution-chain/2": { chain: { species: chainSpecies(1), evolution_details: [], evolves_to: [{ species: chainSpecies(2), evolution_details: [{ trigger: { name: "level-up" }, min_level: 16 }], evolves_to: [] }] } },
      "ability/blaze": { names: [{ language: { name: "es" }, name: "Mar Llamas" }], flavor_text_entries: [entry("Potencia.", "es", 5)] },
      "ability/solar-power": { names: [{ language: { name: "en" }, name: "Solar Power" }], flavor_text_entries: [] },
      "version/v23": { names: [{ language: { name: "es" }, name: "Espada" }] },
    };
    const details = await fetchPokedex({
      fetchJson: async (path) => {
        asked.push(path);
        if (!(path in responses)) throw new Error(`sin respuesta: ${path}`);
        return responses[path];
      },
    });
    expect(details.map((detail) => detail.names.es)).toEqual(["Uno", "Dos"]);
    expect(details[0]!.evolution).toEqual(details[1]!.evolution);
    expect(details[0]!.evolution.next[0]).toMatchObject({ id: 2, name: "Dos", condition: { kind: "level", level: 16 } });
    expect(details[0]!.abilities[1]).toEqual({ name: "Solar Power", hidden: true, description: null });
    expect(details[0]!.lore?.game).toBe("Espada");
    expect(new Set(asked).size).toBe(asked.length);
  });
});
