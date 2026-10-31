import type { PokedexEntry, TypeName } from "@pokemon-minigames/shared";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/client";
import { PokedexPage } from "../../src/pages/pokedex/PokedexPage";
import { DEX_PAGE_SIZE, filterPokedex, parsePokedexQuery } from "../../src/pages/pokedex/pokedex-filter";
import { AppRoutes } from "../../src/routes";
import { type FakeServices, fakeServices, renderWithServices, signIn } from "../helpers/services";

const entry = (id: number, es: string, en: string, types: TypeName[], total: number, generation = 1): PokedexEntry => ({
  id,
  names: { es, en },
  types,
  total,
  generation,
  spriteUrl: `https://sprite/${id}.png`,
});

const CHARIZARD = entry(6, "Charizard", "Charizard", ["fire", "flying"], 534);
const MOLTRES = entry(146, "Moltres", "Moltres", ["fire", "flying"], 580);
const HOOH = entry(250, "Ho-Oh", "Ho-Oh", ["fire", "flying"], 680, 2);
const ROTOM = entry(479, "Rotom", "Rotom", ["electric", "ghost"], 440, 4);
const MIME = entry(122, "Sr. Mime", "Mr. Mime", ["psychic", "fairy"], 460);
const SAMPLE = [CHARIZARD, MIME, MOLTRES, HOOH, ROTOM];

const query = (text: string) => parsePokedexQuery(new URLSearchParams(text));
const ids = (text: string, entries = SAMPLE) => filterPokedex(entries, query(text)).map((one) => one.id);

describe("filterPokedex", () => {
  it("busca por nombre en español o inglés, sin distinguir tildes ni mayúsculas", () => {
    expect(ids("q=charizard")).toEqual([6]);
    expect(ids("q=CHÁRIZARD")).toEqual([6]);
    expect(ids("q=mr.%20mime")).toEqual([122]);
    expect(ids("q=sr.")).toEqual([122]);
  });

  it("busca por número exacto, con o sin almohadilla o ceros", () => {
    expect(ids("q=6")).toEqual([6]);
    expect(ids("q=006")).toEqual([6]);
    expect(ids("q=%23146")).toEqual([146]);
  });

  it("dos tipos dan lo mismo en cualquier orden; un tipo incluye a quien lo tiene en segundo lugar", () => {
    expect(ids("tipo1=fire&tipo2=flying")).toEqual([6, 146, 250]);
    expect(ids("tipo1=flying&tipo2=fire")).toEqual([6, 146, 250]);
    expect(ids("tipo1=ghost")).toEqual([479]);
    expect(ids("tipo1=fire&tipo2=ghost")).toEqual([]);
  });

  it("filtra por generación", () => {
    expect(ids("gen=2")).toEqual([250]);
    expect(ids("gen=1&tipo1=fire")).toEqual([6, 146]);
  });

  it("ordena por número, nombre o total de mayor a menor, y desempata por número", () => {
    expect(ids("")).toEqual([6, 122, 146, 250, 479]);
    expect(ids("orden=nombre")).toEqual([6, 250, 146, 479, 122]);
    expect(ids("orden=total")).toEqual([250, 146, 6, 122, 479]);
    const tied = [entry(9, "B", "B", ["water"], 500), entry(2, "A", "A", ["water"], 500)];
    expect(ids("orden=total", tied)).toEqual([2, 9]);
  });

  it("los valores inventados se ignoran", () => {
    expect(query("gen=99&orden=x&ver=-3&tipo1=nada")).toEqual({ q: "", types: [], generation: null, sort: "numero", visible: DEX_PAGE_SIZE });
    expect(query("gen=abc&ver=3.5").visible).toBe(DEX_PAGE_SIZE);
    expect(query("ver=120").visible).toBe(120);
  });
});

function Probe() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

const many = Array.from({ length: 130 }, (_, index) => entry(index + 1, `Poké${index + 1}`, `Mon${index + 1}`, ["water"], 300));

function renderList(route = "/pokedex", entries: PokedexEntry[] = SAMPLE, services: FakeServices = fakeServices()) {
  vi.mocked(services.endpoints.catalog.dex).mockResolvedValue(entries);
  return {
    user: userEvent.setup(),
    ...renderWithServices(
      <>
        <Routes>
          <Route path="/pokedex" element={<PokedexPage />} />
          <Route path="/pokedex/:id" element={<p>Ficha</p>} />
        </Routes>
        <Probe />
      </>,
      { route, services },
    ),
  };
}

const where = () => screen.getByTestId("where").textContent;
const tiles = () => within(screen.getByRole("list", { name: "Pokémon" })).getAllByRole("listitem");

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("la lista de la Pokédex", () => {
  it("cada tarjeta muestra número, nombre y tipos, enlaza a su ficha y carga la imagen tarde", async () => {
    renderList();
    const link = await screen.findByRole("link", { name: /Charizard/ });
    expect(link).toHaveAttribute("href", "/pokedex/6");
    expect(within(link).getByText("#006")).toBeInTheDocument();
    expect(within(link).getByText("fuego")).toBeInTheDocument();
    expect(link.querySelector("img")).toHaveAttribute("loading", "lazy");
  });

  it("muestra 60 y «Ver más» añade 60 y lo guarda en la dirección; sin más no hay botón", async () => {
    const { user } = renderList("/pokedex", many);
    await screen.findByRole("link", { name: /Poké1(?!\d)/ });
    expect(tiles()).toHaveLength(60);
    await user.click(screen.getByRole("button", { name: "Ver más" }));
    expect(tiles()).toHaveLength(120);
    expect(where()).toBe("/pokedex?ver=120");
    await user.click(screen.getByRole("button", { name: "Ver más" }));
    expect(tiles()).toHaveLength(130);
    expect(screen.queryByRole("button", { name: "Ver más" })).toBeNull();
  });

  it("los filtros viven en la dirección y al cambiar uno se vuelve a la primera tanda", async () => {
    const { user } = renderList("/pokedex?ver=120", many);
    await screen.findByRole("link", { name: /Poké1(?!\d)/ });
    await user.selectOptions(screen.getByRole("combobox", { name: "Tipo 1" }), "water");
    expect(where()).toBe("/pokedex?tipo1=water");
    expect(tiles()).toHaveLength(60);
  });

  it("escribir busca, y una dirección compartida se respeta", async () => {
    const { user } = renderList("/pokedex?tipo1=fire&tipo2=flying&orden=total");
    await screen.findByRole("link", { name: /Ho-Oh/ });
    expect(tiles()).toHaveLength(3);
    expect(screen.getByRole("combobox", { name: "Ordenar por" })).toHaveValue("total");
    await user.type(screen.getByRole("searchbox", { name: "Buscar" }), "molt");
    expect(tiles()).toHaveLength(1);
    expect(where()).toContain("q=molt");
  });

  it("sin coincidencias lo dice y «Limpiar filtros» vuelve a la lista", async () => {
    const { user } = renderList("/pokedex?q=nadie");
    expect(await screen.findByText("No hay Pokémon con esos filtros.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(where()).toBe("/pokedex");
    expect(tiles()).toHaveLength(5);
  });

  it("si falla la primera carga, muestra el aviso y al reintentar aparece la lista", async () => {
    const services = fakeServices();
    vi.mocked(services.endpoints.catalog.dex).mockRejectedValueOnce(new ApiError(0, "NETWORK")).mockResolvedValue(SAMPLE);
    const user = userEvent.setup();
    renderWithServices(<PokedexPage />, { route: "/pokedex", services });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("link", { name: /Charizard/ })).toBeInTheDocument();
  });

  it("volver de una ficha restaura la posición de esa misma búsqueda", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    sessionStorage.setItem("pokedex-scroll:?tipo1=fire", "840");
    renderList("/pokedex?tipo1=fire");
    await screen.findByRole("link", { name: /Charizard/ });
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 840));
  });

  it("abrir una ficha guarda la posición", async () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    Object.defineProperty(window, "scrollY", { value: 300, configurable: true });
    const { user } = renderList("/pokedex?tipo1=fire");
    await user.click(await screen.findByRole("link", { name: /Charizard/ }));
    expect(sessionStorage.getItem("pokedex-scroll:?tipo1=fire")).toBe("300");
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });
});

describe("/pokedex es pública", () => {
  it.each(["anonymous", "loading"] as const)("con la sesión %s se ve la página, no /login", async (status) => {
    const services = fakeServices();
    vi.mocked(services.endpoints.catalog.dex).mockResolvedValue(SAMPLE);
    services.session.setState({ status, user: null });
    renderWithServices(
      <>
        <AppRoutes />
        <Probe />
      </>,
      { route: "/pokedex", services },
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Pokédex" })).toBeInTheDocument();
    expect(where()).toBe("/pokedex");
  });

  it("sin sesión ofrece «Entrar a jugar»; con sesión, no", async () => {
    const anon = fakeServices();
    anon.session.setState({ status: "anonymous", user: null });
    const first = renderList("/pokedex", SAMPLE, anon);
    expect(await screen.findByRole("link", { name: "Entrar a jugar" })).toHaveAttribute("href", "/login");
    first.unmount();
    const account = fakeServices();
    signIn(account);
    renderList("/pokedex", SAMPLE, account);
    await screen.findByRole("link", { name: /Charizard/ });
    expect(screen.queryByRole("link", { name: "Entrar a jugar" })).toBeNull();
  });
});

describe("la posición guardada solo se aplica al volver", () => {
  function renderWithEntry() {
    const services = fakeServices();
    vi.mocked(services.endpoints.catalog.dex).mockResolvedValue(SAMPLE);
    return renderWithServices(
      <Routes>
        <Route path="/otra" element={<Link to="/pokedex">Ir a la Pokédex</Link>} />
        <Route path="/volver" element={<Link to="/pokedex" state={{ restoreScroll: true }}>Volver</Link>} />
        <Route path="/pokedex" element={<PokedexPage />} />
      </Routes>,
      { route: "/otra", services },
    );
  }

  it("entrar por un enlace normal (el del encabezado) empieza arriba, aunque haya una posición guardada", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    sessionStorage.setItem("pokedex-scroll:", "5864");
    renderWithEntry();
    await userEvent.click(screen.getByRole("link", { name: "Ir a la Pokédex" }));
    await screen.findByRole("link", { name: /Charizard/ });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("volver con el enlace de la ficha sí la restaura", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    sessionStorage.setItem("pokedex-scroll:", "840");
    const services = fakeServices();
    vi.mocked(services.endpoints.catalog.dex).mockResolvedValue(SAMPLE);
    renderWithServices(
      <Routes>
        <Route path="/volver" element={<Link to="/pokedex" state={{ restoreScroll: true }}>Volver</Link>} />
        <Route path="/pokedex" element={<PokedexPage />} />
      </Routes>,
      { route: "/volver", services },
    );
    await userEvent.click(screen.getByRole("link", { name: "Volver" }));
    await screen.findByRole("link", { name: /Charizard/ });
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 840));
  });

  it("cada tarjeta le dice a la ficha de qué búsqueda viene", async () => {
    const { user } = renderList("/pokedex?tipo1=fire");
    const link = await screen.findByRole("link", { name: /Charizard/ });
    await user.click(link);
    expect(where()).toBe("/pokedex/6");
  });
});

describe("las pestañas de generación", () => {
  const tabs = () => screen.getByRole("group", { name: "Generación" });
  const tab = (name: string) => within(tabs()).getByRole("button", { name });

  it("se ven todas de un vistazo, con «Todas» marcada al entrar, y ya no hay lista de generación", async () => {
    renderList();
    await screen.findByRole("link", { name: /Charizard/ });
    expect(within(tabs()).getAllByRole("button").map((button) => button.textContent)).toEqual(["Todas", "1.ª", "2.ª", "3.ª", "4.ª", "5.ª", "6.ª", "7.ª", "8.ª", "9.ª"]);
    expect(tab("Todas")).toHaveAttribute("aria-pressed", "true");
    expect(tab("1.ª")).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("combobox", { name: "Generación" })).toBeNull();
  });

  it("elegir una filtra, la guarda en la dirección y vuelve a la primera tanda", async () => {
    const { user } = renderList("/pokedex?ver=120");
    await screen.findByRole("link", { name: /Charizard/ });
    await user.click(tab("2.ª"));
    expect(where()).toBe("/pokedex?gen=2");
    expect(tab("2.ª")).toHaveAttribute("aria-pressed", "true");
    expect(tiles()).toHaveLength(1);
    await user.click(tab("Todas"));
    expect(where()).toBe("/pokedex");
    expect(tiles()).toHaveLength(5);
  });

  it("una dirección compartida marca su pestaña y conserva los demás filtros al cambiarla", async () => {
    const { user } = renderList("/pokedex?gen=1&tipo1=fire");
    await screen.findByRole("link", { name: /Charizard/ });
    expect(tab("1.ª")).toHaveAttribute("aria-pressed", "true");
    await user.click(tab("2.ª"));
    expect(where()).toBe("/pokedex?tipo1=fire&gen=2");
  });

  it("no ensanchan la página: se reparten en varias filas", async () => {
    renderList();
    await screen.findByRole("link", { name: /Charizard/ });
    expect(tabs().className).toContain("flex-wrap");
  });
});

describe("cambios de filtro muy seguidos", () => {
  const search = () => screen.getByRole("searchbox", { name: "Buscar" });

  it("dos cambios antes de repintar no se pisan: lo borrado no vuelve", async () => {
    renderList("/pokedex?q=charizard");
    await screen.findByRole("link", { name: /Charizard/ });
    act(() => {
      fireEvent.change(search(), { target: { value: "" } });
      fireEvent.change(screen.getByRole("combobox", { name: "Tipo 1" }), { target: { value: "fire" } });
    });
    await waitFor(() => expect(where()).toBe("/pokedex?tipo1=fire"));
    expect(search()).toHaveValue("");
  });

  it("el campo muestra lo escrito aunque la dirección tarde en ponerse al día", async () => {
    renderList();
    await screen.findByRole("link", { name: /Charizard/ });
    act(() => {
      fireEvent.change(search(), { target: { value: "m" } });
      fireEvent.change(search(), { target: { value: "mo" } });
    });
    expect(search()).toHaveValue("mo");
    await waitFor(() => expect(where()).toBe("/pokedex?q=mo"));
  });

  it("«Limpiar filtros» también vacía el campo", async () => {
    const { user } = renderList("/pokedex?q=nadie");
    await user.click(await screen.findByRole("button", { name: "Limpiar filtros" }));
    expect(search()).toHaveValue("");
  });

  it("entrar a /pokedex por un enlace desde una búsqueda la limpia del todo", async () => {
    const services = fakeServices();
    vi.mocked(services.endpoints.catalog.dex).mockResolvedValue(SAMPLE);
    const user = userEvent.setup();
    renderWithServices(
      <>
        <Link to="/pokedex">Enlace del encabezado</Link>
        <Routes>
          <Route path="/pokedex" element={<PokedexPage />} />
        </Routes>
        <Probe />
      </>,
      { route: "/pokedex?q=charizard", services },
    );
    await screen.findByRole("link", { name: /Charizard/ });
    await user.click(screen.getByRole("link", { name: "Enlace del encabezado" }));
    await waitFor(() => expect(search()).toHaveValue(""));
    await user.selectOptions(screen.getByRole("combobox", { name: "Tipo 1" }), "fire");
    expect(where()).toBe("/pokedex?tipo1=fire");
  });
});

describe("filtros plegables en el teléfono", () => {
  const toggle = () => screen.getByRole("button", { name: /^Filtros/ });
  const panel = () => document.getElementById(toggle().getAttribute("aria-controls")!)!;

  it("el buscador se ve siempre; lo demás empieza plegado y el botón lo despliega", async () => {
    const { user } = renderList();
    await screen.findByRole("link", { name: /Charizard/ });
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(toggle().className).toContain("md:hidden");
    expect(panel().className).toContain("hidden");
    expect(panel().className).toContain("md:flex");
    expect(panel()).not.toContainElement(screen.getByRole("searchbox", { name: "Buscar" }));
    expect(panel()).toContainElement(screen.getByRole("combobox", { name: "Tipo 1" }));
    expect(panel()).toContainElement(screen.getByRole("combobox", { name: "Ordenar por" }));
    await user.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(panel().className.split(" ")).not.toContain("hidden");
  });

  it("el botón dice cuántos filtros hay puestos, también con el panel plegado", async () => {
    const first = renderList("/pokedex");
    await screen.findByRole("link", { name: /Charizard/ });
    expect(toggle()).toHaveTextContent(/^Filtros$/);
    first.unmount();
    renderList("/pokedex?tipo1=fire&tipo2=flying&orden=total");
    await screen.findByRole("link", { name: /Charizard/ });
    expect(toggle()).toHaveTextContent("Filtros (3)");
  });
});

describe("el resultado de filtrar", () => {
  it("dice cuántos hay, en una región que se anuncia y existe desde el principio", async () => {
    const { user } = renderList();
    await screen.findByRole("link", { name: /Charizard/ });
    const count = screen.getByText("5 Pokémon");
    expect(count).toHaveAttribute("role", "status");
    await user.selectOptions(screen.getByRole("combobox", { name: "Tipo 1" }), "ghost");
    expect(count).toHaveTextContent("1 Pokémon");
  });

  it("«Limpiar filtros» deja el foco en el buscador", async () => {
    const { user } = renderList("/pokedex?q=nadie");
    await user.click(await screen.findByRole("button", { name: "Limpiar filtros" }));
    expect(screen.getByRole("searchbox", { name: "Buscar" })).toHaveFocus();
  });

  it("buscar algo sin letras ni números no muestra a todos", () => {
    expect(ids("q=!!!")).toEqual([]);
    expect(ids("q=%20%20")).toEqual([6, 122, 146, 250, 479]);
  });

  it("buscar ♀ encuentra a quien lo lleva en el nombre, no a quien tiene una f", () => {
    const nido = entry(29, "Nidoran♀", "Nidoran♀", ["poison"], 275);
    expect(ids("q=%E2%99%80", [...SAMPLE, nido])).toEqual([29]);
    expect(ids("q=nidoran", [...SAMPLE, nido])).toEqual([29]);
  });

  it("un error del servidor no echa la culpa a la conexión", async () => {
    const services = fakeServices();
    vi.mocked(services.endpoints.catalog.dex).mockRejectedValue(new ApiError(429, "RATE_LIMITED"));
    renderWithServices(<PokedexPage />, { route: "/pokedex", services });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Vas muy rápido");
    expect(alert).not.toHaveTextContent("conexión");
  });

  it("cambia el título de la pestaña", async () => {
    renderList();
    await screen.findByRole("link", { name: /Charizard/ });
    expect(document.title).toBe("Pokédex · PokeMiniGames");
  });
});
