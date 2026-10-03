import type { HistoryEntry, Stats, StatsResponse } from "@pokemon-minigames/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/client";
import { ProfilePage } from "../../src/pages/profile/ProfilePage";
import { pokemon } from "../helpers/events";
import { LocationProbe, NO_STATS, type FakeServices, fakeServices, renderWithServices } from "../helpers/services";

const FULL: Stats = {
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

const entry = (overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
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

function renderAt(route: string, services: FakeServices = fakeServices()) {
  const utils = renderWithServices(
    <>
      <Routes>
        <Route path="/perfil" element={<ProfilePage />} />
        <Route path="/jugador/:username" element={<ProfilePage />} />
        <Route path="*" element={<p>Otra pantalla</p>} />
      </Routes>
      <LocationProbe />
    </>,
    { services, route },
  );
  return { ...utils, user: userEvent.setup() };
}

/** Las partidas de la lista del historial (la lista de Pokémon más ganados también tiene elementos). */
const historyItems = () => within(screen.getByRole("list", { name: "Historial de partidas" })).getAllByRole("listitem");

/** El valor que acompaña a una etiqueta de la lista de datos. */
const valueOf = (label: string) => screen.getByText(label).nextElementSibling as HTMLElement;

describe("perfil propio", () => {
  it("mientras llega la respuesta dice que está cargando", () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn((): Promise<StatsResponse> => new Promise(() => {}));
    renderAt("/perfil", services);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando perfil…");
  });

  it("pide las estadísticas propias y no las de otra persona", async () => {
    const services = fakeServices();
    renderAt("/perfil", services);
    expect(await screen.findByRole("heading", { name: "Tu perfil" })).toBeInTheDocument();
    expect(services.endpoints.stats.mine).toHaveBeenCalledTimes(1);
    expect(services.endpoints.stats.forUser).not.toHaveBeenCalled();
    expect(screen.getByText("ash")).toBeInTheDocument();
  });

  it("muestra el resumen: partidas, ganadas, empatadas, perdidas, porcentaje y rachas", async () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn(async () => ({ username: "ash", stats: FULL }));
    renderAt("/perfil", services);
    const summary = await screen.findByRole("region", { name: "Resumen" });
    const value = (label: string) => within(summary).getByText(label).nextElementSibling;
    expect(value("Partidas")).toHaveTextContent("5");
    expect(value("Ganadas")).toHaveTextContent("3");
    expect(value("Empatadas")).toHaveTextContent("1");
    expect(value("Perdidas")).toHaveTextContent("1");
    expect(value("Victorias")).toHaveTextContent("60 %");
    expect(value("Racha actual")).toHaveTextContent("2");
    expect(value("Mejor racha")).toHaveTextContent("3");
  });

  it("muestra el poder promedio con coma decimal y la mejor partida", async () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn(async () => ({ username: "ash", stats: FULL }));
    renderAt("/perfil", services);
    const power = await screen.findByRole("region", { name: "Poder" });
    expect(within(power).getByText("Poder promedio").nextElementSibling).toHaveTextContent("512,5");
    expect(within(power).getByText("Mejor partida").nextElementSibling).toHaveTextContent("1534");
  });

  it("muestra los Pokémon más ganados con las veces que los ganó", async () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn(async () => ({ username: "ash", stats: FULL }));
    renderAt("/perfil", services);
    const top = await screen.findByRole("region", { name: "Pokémon más ganados" });
    expect(within(top).getByRole("heading", { name: "Charizard" })).toBeInTheDocument();
    expect(within(top).getByText("Ganado 3 veces")).toBeInTheDocument();
    expect(within(top).getByRole("heading", { name: "Pikachu" })).toBeInTheDocument();
    expect(within(top).getByText("Ganado 1 vez")).toBeInTheDocument();
  });

  it("si todavía no ha jugado, lo dice y no muestra cifras vacías", async () => {
    renderAt("/perfil");
    expect(await screen.findByText("Todavía no has jugado ninguna partida.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Resumen" })).not.toBeInTheDocument();
  });

  it("con partidas pero sin Pokémon ganados ni puntajes, usa un guion y lo explica", async () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn(async () => ({
      username: "ash",
      stats: { ...NO_STATS, played: 2, losses: 2, winRate: 0 },
    }));
    renderAt("/perfil", services);
    const power = await screen.findByRole("region", { name: "Poder" });
    expect(within(power).getByText("Poder promedio").nextElementSibling).toHaveTextContent("—");
    expect(within(power).getByText("Mejor partida").nextElementSibling).toHaveTextContent("—");
    expect(screen.getByText("Todavía no has ganado ningún Pokémon.")).toBeInTheDocument();
    expect(valueOf("Victorias")).toHaveTextContent("0 %");
  });

  it("si falla, lo avisa en español y permite reintentar", async () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR"))
      .mockResolvedValueOnce({ username: "ash", stats: FULL });
    const { user } = renderAt("/perfil", services);
    expect(await screen.findByRole("alert")).toHaveTextContent("Algo falló en el servidor");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("region", { name: "Resumen" })).toBeInTheDocument();
    expect(services.endpoints.stats.mine).toHaveBeenCalledTimes(2);
  });

  it("un error de red también tiene su mensaje", async () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn().mockRejectedValue(new ApiError(0, "NETWORK"));
    renderAt("/perfil", services);
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo conectar con el servidor");
  });
});

describe("perfil de otra persona", () => {
  it("pide las estadísticas de ese nombre y muestra su nombre como título", async () => {
    const services = fakeServices();
    services.endpoints.stats.forUser = vi.fn(async (username: string) => ({ username, stats: FULL }));
    renderAt("/jugador/misty", services);
    expect(await screen.findByRole("heading", { name: "misty" })).toBeInTheDocument();
    expect(services.endpoints.stats.forUser).toHaveBeenCalledExactlyOnceWith("misty");
    expect(services.endpoints.stats.mine).not.toHaveBeenCalled();
    expect(within(screen.getByRole("region", { name: "Resumen" })).getByText("Ganadas")).toBeInTheDocument();
  });

  it("no muestra el historial ni lo pide", async () => {
    const services = fakeServices();
    services.endpoints.stats.forUser = vi.fn(async (username: string) => ({ username, stats: FULL }));
    renderAt("/jugador/misty", services);
    await screen.findByRole("heading", { name: "misty" });
    expect(screen.queryByRole("heading", { name: "Historial" })).not.toBeInTheDocument();
    expect(services.endpoints.stats.history).not.toHaveBeenCalled();
  });

  it("si todavía no ha jugado, lo dice en tercera persona", async () => {
    renderAt("/jugador/misty");
    expect(await screen.findByText("Todavía no ha jugado ninguna partida.")).toBeInTheDocument();
  });

  it("un jugador que no existe se explica y lleva de vuelta al lobby", async () => {
    const services = fakeServices();
    services.endpoints.stats.forUser = vi.fn().mockRejectedValue(new ApiError(404, "USER_NOT_FOUND"));
    const { user } = renderAt("/jugador/nadie", services);
    expect(await screen.findByText("No encontramos a ese jugador.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Volver al lobby" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/");
    expect(screen.getByText("Otra pantalla")).toBeInTheDocument();
  });

  it("los otros errores sí permiten reintentar", async () => {
    const services = fakeServices();
    services.endpoints.stats.forUser = vi.fn().mockRejectedValue(new ApiError(500, "INTERNAL_ERROR"));
    renderAt("/jugador/misty", services);
    expect(await screen.findByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});

describe("historial", () => {
  const withHistory = (...pages: { games: HistoryEntry[]; nextCursor: string | null }[]) => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn(async () => ({ username: "ash", stats: FULL }));
    const history = vi.fn();
    for (const page of pages) history.mockResolvedValueOnce(page);
    services.endpoints.stats.history = history;
    return services;
  };

  it("pide la primera página sin cursor", async () => {
    const services = withHistory({ games: [entry()], nextCursor: null });
    renderAt("/perfil", services);
    await screen.findByRole("list", { name: "Historial de partidas" });
    expect(services.endpoints.stats.history).toHaveBeenCalledExactlyOnceWith({ before: null });
  });

  it("cada partida muestra resultado, rival con enlace a su perfil, marcador, motivo, configuración y fecha", async () => {
    const services = withHistory({
      games: [
        entry({ id: "g1", result: "won", reason: "forfeit" }),
        entry({ id: "g2", result: "drawn", reason: "completed", opponent: { username: "brock" }, myScore: 500, opponentScore: 500 }),
        entry({
          id: "g3",
          result: "lost",
          reason: "disconnect",
          opponent: { username: "gary" },
          myScore: 200,
          opponentScore: 900,
          config: { typeMode: "chosen", lengthMode: "custom", roundsLimit: null, statsGoal: 2500 },
        }),
      ],
      nextCursor: null,
    });
    renderAt("/perfil", services);
    const items = within(await screen.findByRole("list", { name: "Historial de partidas" })).getAllByRole("listitem");
    expect(items).toHaveLength(3);

    expect(within(items[0]!).getByText("Ganaste")).toBeInTheDocument();
    expect(within(items[0]!).getByRole("link", { name: "misty" })).toHaveAttribute("href", "/jugador/misty");
    expect(within(items[0]!).getByText("1100 – 0")).toBeInTheDocument();
    expect(within(items[0]!).getByText("Tu rival abandonó")).toBeInTheDocument();
    expect(within(items[0]!).getByText("Tipos aleatorios · 3 rondas")).toBeInTheDocument();
    expect(within(items[0]!).getByText(/2026/)).toBeInTheDocument();
    expect(items[0]!.querySelector("time")).toHaveAttribute("datetime", "2026-09-30T12:00:00.000Z");

    expect(within(items[1]!).getByText("Empate")).toBeInTheDocument();
    expect(within(items[1]!).getByText("500 – 500")).toBeInTheDocument();
    expect(within(items[2]!).getByText("Perdiste")).toBeInTheDocument();
    expect(within(items[2]!).getByText("Te desconectaste")).toBeInTheDocument();
    expect(within(items[2]!).getByText("Tipos elegidos · meta de 2500 puntos")).toBeInTheDocument();
  });

  it("un puntaje que no se guardó se muestra con un guion", async () => {
    const services = withHistory({ games: [entry({ myScore: null, opponentScore: null })], nextCursor: null });
    renderAt("/perfil", services);
    expect(await screen.findByText("— – —")).toBeInTheDocument();
  });

  it("una partida sin motivo guardado se muestra como una partida normal", async () => {
    const services = withHistory({ games: [entry({ reason: null })], nextCursor: null });
    renderAt("/perfil", services);
    expect(await screen.findByText("La partida terminó")).toBeInTheDocument();
  });

  it("'Cargar más' pide la página siguiente con el cursor y la agrega; al acabar el botón desaparece", async () => {
    const services = withHistory(
      { games: [entry({ id: "g1" })], nextCursor: "cursor-1" },
      { games: [entry({ id: "g2", opponent: { username: "brock" } })], nextCursor: null },
    );
    const { user } = renderAt("/perfil", services);
    await screen.findByRole("list", { name: "Historial de partidas" });
    await user.click(screen.getByRole("button", { name: "Cargar más" }));
    await waitFor(() => expect(historyItems()).toHaveLength(2));
    expect(services.endpoints.stats.history).toHaveBeenLastCalledWith({ before: "cursor-1" });
    expect(screen.getByRole("link", { name: "brock" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cargar más" })).not.toBeInTheDocument();
  });

  it("al llegar la página siguiente el foco pasa a su primera partida y se anuncia (el botón puede desaparecer)", async () => {
    const services = withHistory(
      { games: [entry({ id: "g1" })], nextCursor: "cursor-1" },
      { games: [entry({ id: "g2", opponent: { username: "brock" } }), entry({ id: "g3", opponent: { username: "gary" } })], nextCursor: null },
    );
    const { user } = renderAt("/perfil", services);
    await screen.findByRole("list", { name: "Historial de partidas" });
    await user.click(screen.getByRole("button", { name: "Cargar más" }));
    await waitFor(() => expect(historyItems()).toHaveLength(3));
    expect(screen.queryByRole("button", { name: "Cargar más" })).not.toBeInTheDocument();
    expect(historyItems()[1]).toHaveFocus();
    expect(within(historyItems()[1]!).getByRole("link", { name: "brock" })).toBeInTheDocument();
    expect(screen.getByText("Se cargaron 2 partidas más.")).toBeInTheDocument();
  });

  it("si la página siguiente trae una sola partida, el anuncio va en singular", async () => {
    const services = withHistory(
      { games: [entry({ id: "g1" })], nextCursor: "cursor-1" },
      { games: [entry({ id: "g2", opponent: { username: "brock" } })], nextCursor: "cursor-2" },
    );
    const { user } = renderAt("/perfil", services);
    await screen.findByRole("list", { name: "Historial de partidas" });
    await user.click(screen.getByRole("button", { name: "Cargar más" }));
    expect(await screen.findByText("Se cargó 1 partida más.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cargar más" })).toBeInTheDocument();
  });

  it("no pide la misma página dos veces si se pulsa dos veces seguidas", async () => {
    let finish!: (page: { games: HistoryEntry[]; nextCursor: string | null }) => void;
    const services = withHistory({ games: [entry({ id: "g1" })], nextCursor: "cursor-1" });
    const history = services.endpoints.stats.history as ReturnType<typeof vi.fn>;
    history.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const { user } = renderAt("/perfil", services);
    await screen.findByRole("list", { name: "Historial de partidas" });
    const button = screen.getByRole("button", { name: "Cargar más" });
    await user.click(button);
    await user.click(button);
    expect(history).toHaveBeenCalledTimes(2); // la primera página y una sola vez la siguiente
    expect(button).toBeDisabled();
    finish({ games: [], nextCursor: null });
  });

  it("si falla cargar más, conserva lo que ya se veía y permite reintentar", async () => {
    const services = withHistory({ games: [entry({ id: "g1" })], nextCursor: "cursor-1" });
    const history = services.endpoints.stats.history as ReturnType<typeof vi.fn>;
    history.mockRejectedValueOnce(new ApiError(0, "NETWORK")).mockResolvedValueOnce({ games: [entry({ id: "g2", opponent: { username: "brock" } })], nextCursor: null });
    const { user } = renderAt("/perfil", services);
    await screen.findByRole("list", { name: "Historial de partidas" });
    await user.click(screen.getByRole("button", { name: "Cargar más" }));
    expect(await screen.findByText("No se pudo cargar la siguiente página.")).toBeInTheDocument();
    expect(historyItems()).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Cargar más" }));
    await waitFor(() => expect(historyItems()).toHaveLength(2));
    expect(screen.queryByText("No se pudo cargar la siguiente página.")).not.toBeInTheDocument();
  });

  it("si falla la primera página, lo avisa y permite reintentar sin perder las estadísticas", async () => {
    const services = withHistory();
    const history = services.endpoints.stats.history as ReturnType<typeof vi.fn>;
    history.mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR")).mockResolvedValueOnce({ games: [entry()], nextCursor: null });
    const { user } = renderAt("/perfil", services);
    expect(await screen.findByRole("region", { name: "Resumen" })).toBeInTheDocument();
    const alert = await screen.findByText("No se pudo cargar el historial.");
    expect(alert).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar el historial" }));
    expect(await screen.findByRole("list", { name: "Historial de partidas" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Resumen" })).toBeInTheDocument();
  });

  it("sin partidas explica que aparecerán aquí y ofrece crear una sala", async () => {
    const services = withHistory({ games: [], nextCursor: null });
    const { user } = renderAt("/perfil", services);
    expect(await screen.findByText("Cuando juegues, tus partidas aparecerán aquí.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Crear una sala" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/");
  });
});
