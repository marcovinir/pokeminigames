import type { HistoryEntry, Stats } from "@pokemon-minigames/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { StatTile } from "../../src/components/StatTile";
import { ProfilePage } from "../../src/pages/profile/ProfilePage";
import { event, pokemon } from "../helpers/events";
import { ash, misty, renderRoom } from "../helpers/room";
import { type FakeServices, fakeServices, renderWithServices } from "../helpers/services";

describe("resumen final (etapa 6)", () => {
  const finished = (mySeat: 1 | 2, winnerSeat: 1 | 2 | null) => [
    event.roomState({ phase: "finished", mySeat, players: [ash(), misty()] }),
    event.gameEnded({ winnerSeat }),
  ];
  const hero = (container: HTMLElement) => container.querySelector("[data-verdict]") as HTMLElement;

  it("ganar se celebra con un borde dorado y un halo; empatar o perder, no", () => {
    const won = renderRoom(finished(1, 1));
    expect(hero(won.container)).toHaveAttribute("data-verdict", "won");
    expect(hero(won.container).className).toContain("border-gold");
    expect(hero(won.container).className).toContain("animate-halo");
    won.unmount();

    const lost = renderRoom(finished(2, 1));
    expect(hero(lost.container)).toHaveAttribute("data-verdict", "lost");
    expect(hero(lost.container).className).not.toContain("animate-halo");
    lost.unmount();

    const drawn = renderRoom(finished(1, null));
    expect(hero(drawn.container)).toHaveAttribute("data-verdict", "drawn");
    expect(hero(drawn.container).className).not.toContain("animate-halo");
  });

  it("el veredicto es el encabezado y el marcador va aparte, como siempre", () => {
    renderRoom(finished(1, 1));
    expect(screen.getByRole("heading", { level: 1, name: "Ganaste" })).toBeInTheDocument();
    expect(screen.getByText("800 – 400")).toBeInTheDocument();
  });

  it("de cada equipo, el Pokémon de más puntos va primero con el arte oficial grande y los demás compactos", () => {
    renderRoom(finished(1, 1));
    const mine = screen.getByRole("region", { name: "Equipo de Tú" });
    // Los iconos de tipo también son imágenes (decorativas, aria-hidden): aquí solo cuentan las de los Pokémon.
    const images = [...mine.querySelectorAll("img:not([aria-hidden='true'])")];
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute("src", expect.stringContaining("/official-artwork/1.png")); // 500 puntos
    expect(images[1]).toHaveAttribute("src", "https://example.com/2.png"); // 300 puntos: sprite pequeño
    const names = within(mine).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
    expect(names).toEqual(["Poke1", "Poke2"]);
  });

  it("cada Pokémon muestra sus seis stats como barras", () => {
    renderRoom(finished(1, 1));
    const mine = screen.getByRole("region", { name: "Equipo de Tú" });
    expect(mine.querySelectorAll("[data-stat-bar]")).toHaveLength(12);
  });

  it("el total de cada equipo se ve grande", () => {
    renderRoom(finished(1, 1));
    expect(within(screen.getByRole("region", { name: "Equipo de Tú" })).getByText("800").className).toContain("text-3xl");
  });

  it("«Revancha» es el botón principal y grande", () => {
    renderRoom([...finished(1, 1), event.rematchState({ status: "open" })]);
    const button = screen.getByRole("button", { name: "Revancha" });
    expect(button.className).toContain("bg-accent");
    expect(button.className).toContain("py-3");
  });
});

const STATS: Stats = {
  played: 5,
  wins: 3,
  draws: 1,
  losses: 1,
  winRate: 0.6,
  currentStreak: 2,
  bestStreak: 3,
  averagePower: 512.5,
  bestGameScore: 1534,
  topPokemon: [
    { pokemon: pokemon(6, 534, { names: { es: "Charizard", en: "Charizard" } }), wins: 3 },
    { pokemon: pokemon(25, 320, { names: { es: "Pikachu", en: "Pikachu" } }), wins: 1 },
  ],
};

const game = (overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: "g1",
  endedAt: "2026-09-30T12:00:00.000Z",
  result: "won",
  reason: "completed",
  opponent: { username: "misty" },
  myScore: 1100,
  opponentScore: 0,
  config: { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null },
  ...overrides,
});

function renderProfile(route: string, services: FakeServices = fakeServices()) {
  const utils = renderWithServices(
    <Routes>
      <Route path="/perfil" element={<ProfilePage />} />
      <Route path="/jugador/:username" element={<ProfilePage />} />
    </Routes>,
    { services, route },
  );
  return { ...utils, user: userEvent.setup() };
}

describe("StatTile con anillo", () => {
  it("dibuja un anillo decorativo con el porcentaje y no repite el número como texto", () => {
    const { container } = renderWithServices(
      <dl>
        <StatTile label="Victorias" value="60 %" ring={0.6} />
      </dl>,
    );
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg.querySelectorAll("text")).toHaveLength(0);
    const arc = svg.querySelectorAll("circle")[1]!;
    const circumference = 2 * Math.PI * 40;
    expect(Number(arc.getAttribute("stroke-dashoffset"))).toBeCloseTo(circumference * 0.4, 0);
  });

  it("sin porcentaje no hay anillo", () => {
    const { container } = renderWithServices(
      <dl>
        <StatTile label="Victorias" value="—" ring={null} />
      </dl>,
    );
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("perfil (etapa 6)", () => {
  it("la cabecera lleva un avatar grande decorativo junto al título", async () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn(async () => ({ username: "ash", stats: STATS }));
    renderProfile("/perfil", services);
    expect(await screen.findByRole("heading", { level: 1, name: "Tu perfil" })).toBeInTheDocument();
    expect(screen.getByText("AS")).toHaveAttribute("aria-hidden", "true");
  });

  it("el porcentaje de victorias tiene su anillo", async () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn(async () => ({ username: "ash", stats: STATS }));
    renderProfile("/perfil", services);
    const summary = await screen.findByRole("region", { name: "Resumen" });
    const tile = within(summary).getByText("Victorias").parentElement!;
    expect(tile.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });

  it("los Pokémon más ganados forman un podio con arte oficial y medallas decorativas", async () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn(async () => ({ username: "ash", stats: STATS }));
    renderProfile("/perfil", services);
    const top = await screen.findByRole("region", { name: "Pokémon más ganados" });
    const images = [...top.querySelectorAll("img:not([aria-hidden='true'])")];
    expect(images[0]).toHaveAttribute("src", expect.stringContaining("/official-artwork/6.png"));
    expect(images[1]).toHaveAttribute("src", expect.stringContaining("/official-artwork/25.png"));
    const medals = [...top.querySelectorAll("[data-medal]")];
    expect(medals.map((medal) => medal.textContent)).toEqual(["1", "2"]);
    for (const medal of medals) expect(medal).toHaveAttribute("aria-hidden", "true");
  });

  it("cada partida del historial lleva una insignia de color por resultado y el avatar del rival", async () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn(async () => ({ username: "ash", stats: STATS }));
    services.endpoints.stats.history = vi.fn(async () => ({
      games: [game({ id: "a" }), game({ id: "b", result: "drawn", myScore: 500, opponentScore: 500 }), game({ id: "c", result: "lost", myScore: 0, opponentScore: 400 })],
      nextCursor: null,
    }));
    renderProfile("/perfil", services);
    const list = await screen.findByRole("list", { name: "Historial de partidas" });
    const items = within(list).getAllByRole("listitem");
    expect(within(items[0]!).getByText("Ganaste").className).toContain("bg-success-bg");
    expect(within(items[1]!).getByText("Empate").className).toContain("bg-surface-2");
    expect(within(items[2]!).getByText("Perdiste").className).toContain("bg-danger-bg");
    expect(within(items[0]!).getByText("MI")).toHaveAttribute("aria-hidden", "true");
  });

  it("mientras carga muestra la bola girando y el texto de siempre", () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn(() => new Promise<{ username: string; stats: Stats }>(() => {}));
    renderProfile("/perfil", services);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Cargando perfil…");
    expect(status.querySelector("svg")?.getAttribute("class")).toContain("animate-spin-slow");
  });

  it("un jugador que no existe se explica con una bola apagada y un botón para volver", async () => {
    const services = fakeServices();
    const { ApiError } = await import("../../src/api/client");
    services.endpoints.stats.forUser = vi.fn(async () => {
      throw new ApiError(404, "USER_NOT_FOUND");
    });
    const { container } = renderProfile("/jugador/nadie", services);
    expect(await screen.findByText("No encontramos a ese jugador.")).toBeInTheDocument();
    const lost = container.querySelector("[data-lost]")!;
    expect(lost).toHaveAttribute("aria-hidden", "true");
    expect(lost.querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Volver al lobby" })).toBeInTheDocument();
  });
});
