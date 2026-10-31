import type { EvolutionNode, PokedexDetail } from "@pokemon-minigames/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/client";
import { evolutionConditionText } from "../../src/i18n/es";
import { PokemonPage } from "../../src/pages/pokedex/PokemonPage";
import { type FakeServices, fakeServices, renderWithServices } from "../helpers/services";

const chain: EvolutionNode = {
  id: 4,
  name: "Charmander",
  condition: null,
  next: [{ id: 5, name: "Charmeleon", condition: { kind: "level", level: 16 }, next: [{ id: 6, name: "Charizard", condition: { kind: "level", level: 36 }, next: [] }] }],
};

const charizard: PokedexDetail = {
  id: 6,
  names: { es: "Charizard", en: "Charizard" },
  types: ["fire", "flying"],
  total: 534,
  generation: 1,
  spriteUrl: "https://sprite/6.png",
  stats: { hp: 78, attack: 84, defense: 78, spAttack: 109, spDefense: 85, speed: 100 },
  abilities: [
    { name: "Mar Llamas", hidden: false, description: { text: "Potencia el fuego.", language: "es" } },
    { name: "Poder Solar", hidden: true, description: { text: "Boosts in sun.", language: "en" } },
  ],
  lore: { text: "Escupe fuego.", language: "es", game: "Escudo" },
  evolution: chain,
};

function renderAt(route: string, detail: PokedexDetail | Error = charizard, services: FakeServices = fakeServices()) {
  const dexEntry = vi.mocked(services.endpoints.catalog.dexEntry);
  if (detail instanceof Error) dexEntry.mockRejectedValue(detail);
  else dexEntry.mockResolvedValue(detail);
  return {
    user: userEvent.setup(),
    ...renderWithServices(
      <Routes>
        <Route path="/pokedex" element={<p>La lista</p>} />
        <Route path="/pokedex/:id" element={<PokemonPage />} />
      </Routes>,
      { route, services },
    ),
  };
}

describe("evolutionConditionText", () => {
  it.each([
    [{ kind: "level", level: 16 }, "nivel 16"],
    [{ kind: "level", level: 20, timeOfDay: "night" }, "nivel 20, de noche"],
    [{ kind: "item", item: "Piedra Agua" }, "con Piedra Agua"],
    [{ kind: "trade" }, "por intercambio"],
    [{ kind: "friendship" }, "por amistad"],
    [{ kind: "friendship", timeOfDay: "day" }, "por amistad, de día"],
    [{ kind: "other" }, "condición especial"],
  ] as const)("%j", (condition, text) => expect(evolutionConditionText(condition)).toBe(text));
});

describe("la ficha de un Pokémon", () => {
  it("muestra cabecera, stats, daño recibido, lore y crédito", async () => {
    renderAt("/pokedex/6");
    expect(await screen.findByRole("heading", { level: 1, name: "Charizard" })).toBeInTheDocument();
    expect(screen.getByText("#006")).toBeInTheDocument();
    expect(screen.getByText("1.ª generación")).toBeInTheDocument();
    const stats = screen.getByRole("region", { name: "Estadísticas base" });
    expect(within(stats).getByText("109")).toBeInTheDocument();
    expect(within(stats).getByText("534")).toBeInTheDocument();
    const damage = screen.getByRole("region", { name: "Daño que recibe" });
    expect(within(within(damage).getByRole("group", { name: "×4" })).getByText("roca")).toBeInTheDocument();
    expect(screen.getByText("Escupe fuego.")).toBeInTheDocument();
    expect(screen.getByText(/Escudo/)).toBeInTheDocument();
    expect(screen.getByText("Textos oficiales de los juegos de Pokémon, © Nintendo / Game Freak / Creatures. Datos vía PokeAPI.")).toBeInTheDocument();
  });

  it("las habilidades dicen cuál es oculta y qué texto está en inglés", async () => {
    renderAt("/pokedex/6");
    const abilities = await screen.findByRole("region", { name: "Habilidades" });
    expect(within(abilities).getByText("Potencia el fuego.")).toBeInTheDocument();
    const hidden = within(abilities).getByText("Poder Solar").closest("li")!;
    expect(hidden).toHaveTextContent("(oculta)");
    expect(hidden).toHaveTextContent("Boosts in sun.");
    expect(hidden).toHaveTextContent("(en inglés)");
    expect(within(abilities).getByText("Mar Llamas").closest("li")).not.toHaveTextContent("(en inglés)");
  });

  it("la cadena enlaza a cada etapa, marca la actual y dice cómo se evoluciona", async () => {
    renderAt("/pokedex/6");
    const evolutions = await screen.findByRole("region", { name: "Evoluciones" });
    expect(within(evolutions).getByRole("link", { name: "Charmander" })).toHaveAttribute("href", "/pokedex/4");
    expect(within(evolutions).getByRole("link", { name: "Charmeleon" })).toHaveAttribute("href", "/pokedex/5");
    expect(within(evolutions).queryByRole("link", { name: "Charizard" })).toBeNull();
    expect(within(evolutions).getByText("Charizard")).toHaveAttribute("aria-current", "page");
    expect(within(evolutions).getByText("nivel 16")).toBeInTheDocument();
    expect(within(evolutions).getByText("nivel 36")).toBeInTheDocument();
  });

  it("una cadena con ramas las muestra todas", async () => {
    const eevee: EvolutionNode = {
      id: 133,
      name: "Eevee",
      condition: null,
      next: Array.from({ length: 8 }, (_, index) => ({ id: 134 + index, name: `Rama${index}`, condition: { kind: "other" as const }, next: [] })),
    };
    renderAt("/pokedex/133", { ...charizard, id: 133, evolution: eevee });
    const evolutions = await screen.findByRole("region", { name: "Evoluciones" });
    expect(within(evolutions).getAllByRole("link", { name: /Rama/ })).toHaveLength(8);
    expect(within(evolutions).getAllByText("condición especial")).toHaveLength(8);
  });

  it("sin evolución lo dice", async () => {
    renderAt("/pokedex/6", { ...charizard, evolution: { id: 6, name: "Charizard", condition: null, next: [] } });
    expect(await screen.findByText("No evoluciona.")).toBeInTheDocument();
  });

  it("lore en inglés lleva la marca; sin lore no hay bloque", async () => {
    const english = renderAt("/pokedex/6", { ...charizard, lore: { text: "Spits fire.", language: "en", game: "Scarlet" } });
    expect((await screen.findByText("Spits fire.")).closest("section")).toHaveTextContent("(en inglés)");
    english.unmount();
    renderAt("/pokedex/6", { ...charizard, lore: null });
    await screen.findByRole("heading", { level: 1, name: "Charizard" });
    expect(screen.queryByRole("region", { name: "Descripción" })).toBeNull();
  });

  it.each(["abc", "0", "1026", "6.5"])("/pokedex/%s no existe y ni se pregunta al servidor", async (id) => {
    const services = fakeServices();
    renderAt(`/pokedex/${id}`, charizard, services);
    expect(await screen.findByText("Ese Pokémon no existe.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a la Pokédex" })).toHaveAttribute("href", "/pokedex");
    expect(services.endpoints.catalog.dexEntry).not.toHaveBeenCalled();
  });

  it("un 404 del servidor dice que no existe", async () => {
    renderAt("/pokedex/7", new ApiError(404, "POKEMON_NOT_FOUND"));
    expect(await screen.findByText("Ese Pokémon no existe.")).toBeInTheDocument();
  });

  it("un fallo de red no dice «no existe»: avisa y «Reintentar» vuelve a pedir", async () => {
    const services = fakeServices();
    vi.mocked(services.endpoints.catalog.dexEntry).mockRejectedValueOnce(new ApiError(0, "NETWORK")).mockResolvedValue(charizard);
    const user = userEvent.setup();
    renderWithServices(
      <Routes>
        <Route path="/pokedex/:id" element={<PokemonPage />} />
      </Routes>,
      { route: "/pokedex/6", services },
    );
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("Ese Pokémon no existe.")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Charizard" })).toBeInTheDocument();
  });

  it("anterior y siguiente: el primero no tiene anterior, el último no tiene siguiente", async () => {
    const first = renderAt("/pokedex/1", { ...charizard, id: 1 });
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("link", { name: "Anterior" })).toBeNull();
    expect(screen.getByRole("link", { name: "Siguiente" })).toHaveAttribute("href", "/pokedex/2");
    first.unmount();
    renderAt("/pokedex/1025", { ...charizard, id: 1025 });
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByRole("link", { name: "Anterior" })).toHaveAttribute("href", "/pokedex/1024");
    expect(screen.queryByRole("link", { name: "Siguiente" })).toBeNull();
  });

  it("al pasar a otro Pokémon no quedan los datos del anterior", async () => {
    const services = fakeServices();
    let answer: (detail: PokedexDetail) => void = () => {};
    vi.mocked(services.endpoints.catalog.dexEntry).mockImplementation((id) =>
      id === 6 ? Promise.resolve(charizard) : new Promise((resolve) => (answer = resolve)),
    );
    const user = userEvent.setup();
    renderWithServices(
      <Routes>
        <Route path="/pokedex/:id" element={<PokemonPage />} />
      </Routes>,
      { route: "/pokedex/6", services },
    );
    await screen.findByRole("heading", { level: 1, name: "Charizard" });
    await user.click(screen.getByRole("link", { name: "Siguiente" }));
    await waitFor(() => expect(screen.queryByRole("heading", { level: 1, name: "Charizard" })).toBeNull());
    answer({ ...charizard, id: 7, names: { es: "Squirtle", en: "Squirtle" } });
    expect(await screen.findByRole("heading", { level: 1, name: "Squirtle" })).toBeInTheDocument();
  });
});

describe("la cadena con ramas se entiende en cualquier ancho", () => {
  it("cada etapa queda dentro de la anterior, con sangría, también en el teléfono", async () => {
    const wurmple: EvolutionNode = {
      id: 265,
      name: "Wurmple",
      condition: null,
      next: [
        { id: 266, name: "Silcoon", condition: { kind: "level", level: 7 }, next: [{ id: 267, name: "Beautifly", condition: { kind: "level", level: 10 }, next: [] }] },
        { id: 268, name: "Cascoon", condition: { kind: "level", level: 7 }, next: [{ id: 269, name: "Dustox", condition: { kind: "level", level: 10 }, next: [] }] },
      ],
    };
    renderAt("/pokedex/265", { ...charizard, id: 265, evolution: wurmple });
    const evolutions = await screen.findByRole("region", { name: "Evoluciones" });
    const silcoon = within(evolutions).getByRole("link", { name: "Silcoon" }).closest("li")!;
    expect(within(silcoon).getByRole("link", { name: "Beautifly" })).toBeInTheDocument();
    expect(within(silcoon).queryByRole("link", { name: "Dustox" })).toBeNull();
    const nested = silcoon.querySelector("ul")!;
    expect(nested.className).toContain("border-l-2");
    expect(nested.className).toContain("ml-");
    expect(nested.className).not.toContain("sm:");
  });
});

describe("volver a la lista", () => {
  function renderFrom(state: unknown) {
    const services = fakeServices();
    vi.mocked(services.endpoints.catalog.dexEntry).mockResolvedValue(charizard);
    renderWithServices(
      <Routes>
        <Route path="/pokedex/:id" element={<PokemonPage />} />
      </Routes>,
      { route: { pathname: "/pokedex/6", state }, services },
    );
  }

  it("«Volver a la Pokédex» lleva a la búsqueda de la que se vino", async () => {
    renderFrom({ fromSearch: "?tipo1=fire&ver=120" });
    await screen.findByRole("heading", { level: 1, name: "Charizard" });
    expect(screen.getByRole("link", { name: "Volver a la Pokédex" })).toHaveAttribute("href", "/pokedex?tipo1=fire&ver=120");
  });

  it("sin venir de la lista, va a la lista entera", async () => {
    renderFrom(null);
    await screen.findByRole("heading", { level: 1, name: "Charizard" });
    expect(screen.getByRole("link", { name: "Volver a la Pokédex" })).toHaveAttribute("href", "/pokedex");
  });

  it("la búsqueda se conserva al pasar a otro Pokémon", async () => {
    renderFrom({ fromSearch: "?tipo1=fire" });
    await screen.findByRole("heading", { level: 1, name: "Charizard" });
    await userEvent.click(screen.getByRole("link", { name: "Siguiente" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Volver a la Pokédex" })).toHaveAttribute("href", "/pokedex?tipo1=fire"));
  });
});

describe("detalles de la ficha", () => {
  function renderRoutes(services: FakeServices) {
    return renderWithServices(
      <Routes>
        <Route path="/pokedex/:id" element={<PokemonPage />} />
      </Routes>,
      { route: "/pokedex/6", services },
    );
  }

  it("el título de la pestaña lleva el nombre", async () => {
    renderAt("/pokedex/6");
    await screen.findByRole("heading", { level: 1, name: "Charizard" });
    expect(document.title).toBe("Charizard · PokeMiniGames");
  });

  it("al seguir un enlace de evolución el foco va al nombre del Pokémon nuevo", async () => {
    const services = fakeServices();
    vi.mocked(services.endpoints.catalog.dexEntry).mockImplementation(async (id) => ({ ...charizard, id, names: { es: id === 6 ? "Charizard" : "Charmander", en: "x" } }));
    const user = userEvent.setup();
    renderRoutes(services);
    await screen.findByRole("heading", { level: 1, name: "Charizard" });
    await user.click(screen.getByRole("link", { name: "Charmander" }));
    const heading = await screen.findByRole("heading", { level: 1, name: "Charmander" });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it("con «Siguiente» el foco se queda ahí y el Pokémon nuevo se anuncia", async () => {
    const services = fakeServices();
    vi.mocked(services.endpoints.catalog.dexEntry).mockImplementation(async (id) => ({ ...charizard, id, names: { es: id === 6 ? "Charizard" : "Squirtle", en: "x" } }));
    const user = userEvent.setup();
    renderRoutes(services);
    await screen.findByRole("heading", { level: 1, name: "Charizard" });
    const next = screen.getByRole("link", { name: "Siguiente" });
    const announcer = screen.getByTestId("dex-announcer");
    await user.click(next);
    await screen.findByRole("heading", { level: 1, name: "Squirtle" });
    expect(next).toHaveFocus();
    expect(announcer).toHaveTextContent("Squirtle");
    expect(announcer).toHaveAttribute("role", "status");
  });

  it("los estados de carga y «no existe» también tienen título de página", async () => {
    const services = fakeServices();
    vi.mocked(services.endpoints.catalog.dexEntry).mockImplementation(() => new Promise(() => {}));
    const view = renderRoutes(services);
    expect(screen.getByRole("heading", { level: 1, name: "Pokédex" })).toBeInTheDocument();
    view.unmount();
    renderAt("/pokedex/abc");
    expect(await screen.findByRole("heading", { level: 1, name: "Pokédex" })).toBeInTheDocument();
  });

  it("la lista de stats es HTML válido: dentro de cada fila solo dt y dd", async () => {
    renderAt("/pokedex/6");
    const stats = await screen.findByRole("region", { name: "Estadísticas base" });
    for (const row of stats.querySelectorAll("dl > div")) {
      expect([...row.children].map((child) => child.tagName).every((tag) => tag === "DT" || tag === "DD")).toBe(true);
    }
  });

  it("un error del servidor no echa la culpa a la conexión, y «Reintentar» muestra que carga", async () => {
    const services = fakeServices();
    let answer: (detail: PokedexDetail) => void = () => {};
    vi.mocked(services.endpoints.catalog.dexEntry)
      .mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR"))
      .mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    const user = userEvent.setup();
    renderRoutes(services);
    const alert = await screen.findByRole("alert");
    expect(alert).not.toHaveTextContent("conexión");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Cargando…")).toBeInTheDocument();
    answer(charizard);
    expect(await screen.findByRole("heading", { level: 1, name: "Charizard" })).toBeInTheDocument();
  });
});
