import type { HistoryEntry } from "@pokemon-minigames/shared";
import { screen, waitFor, within } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { Header } from "../../src/components/Header";
import { ProfilePage } from "../../src/pages/profile/ProfilePage";
import { SERVER_NOW, event } from "../helpers/events";
import { ash, misty, renderRoom, roundState } from "../helpers/room";
import { ASH, GUEST, NO_STATS, type FakeServices, fakeServices, renderWithServices, signIn } from "../helpers/services";

/** Las imágenes de avatar (arte oficial) de ese Pokémon dentro de un contenedor. */
const avatarImgs = (root: ParentNode, id: number) => root.querySelectorAll(`img[src$="/official-artwork/${id}.png"]`);

const withAvatars = () => [ash({ avatarId: 94 }), misty({ avatarId: 25 })];

function renderProfile(route: string, services: FakeServices) {
  return renderWithServices(
    <Routes>
      <Route path="/perfil" element={<ProfilePage />} />
      <Route path="/jugador/:username" element={<ProfilePage />} />
    </Routes>,
    { services, route },
  );
}

const entry = (overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: "g1",
  endedAt: "2026-09-30T12:00:00.000Z",
  result: "won",
  reason: "completed",
  opponent: { username: "misty", avatarId: null },
  myScore: 1100,
  opponentScore: 0,
  config: { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null },
  ...overrides,
});

describe("el avatar en cada pantalla", () => {
  it("encabezado: el tuyo", () => {
    const services = fakeServices();
    signIn(services, { ...ASH, avatarId: 94 });
    const { container } = renderWithServices(<Header />, { services });
    expect(avatarImgs(container, 94)).toHaveLength(1);
  });

  it("sala de espera: los dos", () => {
    const { container } = renderRoom([event.roomState({ phase: "waiting", players: withAvatars() })]);
    expect(avatarImgs(container, 94)).toHaveLength(1);
    expect(avatarImgs(container, 25)).toHaveLength(1);
  });

  it("cuenta atrás: los dos", () => {
    const { container } = renderRoom([event.roomState({ phase: "starting", startsAt: SERVER_NOW + 5000, players: withAvatars() })]);
    expect(avatarImgs(container, 94).length).toBeGreaterThan(0);
    expect(avatarImgs(container, 25).length).toBeGreaterThan(0);
  });

  it("partida: el panel del rival", () => {
    const { container } = renderRoom([event.roomState({ phase: "round_active", round: roundState(), players: withAvatars() })]);
    expect(avatarImgs(container, 25).length).toBeGreaterThan(0);
  });

  it("récord de la revancha: los dos", () => {
    renderRoom([
      event.roomState({ phase: "finished", players: withAvatars() }),
      event.gameEnded({ winnerSeat: 1 }),
      event.rematchState({ status: "mine", deadline: SERVER_NOW + 60_000, record: { mine: 1, theirs: 0, draws: 0, played: 1, recent: ["won"] } }),
    ]);
    const card = screen.getByRole("region", { name: "Récord contra misty" });
    expect(avatarImgs(card, 94)).toHaveLength(1);
    expect(avatarImgs(card, 25)).toHaveLength(1);
  });

  it("«¡Revancha!»: los dos", () => {
    const { container } = renderRoom([
      event.roomState({ phase: "finished", players: withAvatars() }),
      event.gameEnded({ winnerSeat: 1 }),
      event.rematchState({ status: "starting", deadline: null }),
    ]);
    expect(screen.getByRole("heading", { name: "¡Revancha!" })).toBeInTheDocument();
    expect(avatarImgs(container, 94)).toHaveLength(1);
    expect(avatarImgs(container, 25)).toHaveLength(1);
  });

  it("perfil propio: el de la sesión (no el de GET /stats), con su nombre para el lector de pantalla", async () => {
    const services = fakeServices();
    signIn(services, { ...ASH, avatarId: 94 });
    services.endpoints.stats.mine = vi.fn(async () => ({ username: "ash", avatarId: null, stats: NO_STATS }));
    renderProfile("/perfil", services);
    const avatar = await screen.findByRole("img", { name: "Avatar: Gengar" });
    expect(avatarImgs(avatar, 94)).toHaveLength(1);
  });

  it("perfil ajeno: el de sus estadísticas", async () => {
    const services = fakeServices();
    signIn(services);
    services.endpoints.stats.forUser = vi.fn(async (username: string) => ({ username, avatarId: 25, stats: NO_STATS }));
    renderProfile("/jugador/misty", services);
    const avatar = await screen.findByRole("img", { name: "Avatar: Pikachu" });
    expect(avatarImgs(avatar, 25)).toHaveLength(1);
  });

  it("perfil ajeno de un servidor anterior (sin avatarId): iniciales, nunca «n.º undefined»", async () => {
    const services = fakeServices();
    signIn(services);
    services.endpoints.stats.forUser = vi.fn(async (username: string) => ({ username, stats: NO_STATS }) as never);
    renderProfile("/jugador/misty", services);
    await screen.findByRole("heading", { name: "misty" });
    expect(document.body.textContent).not.toContain("undefined");
    expect(screen.queryByRole("img", { name: /Avatar:/ })).toBeNull();
  });

  it("historial: cada rival", async () => {
    const services = fakeServices();
    signIn(services);
    services.endpoints.stats.history = vi.fn(async () => ({ games: [entry({ opponent: { username: "misty", avatarId: 25 } })], nextCursor: null }));
    const { container } = renderProfile("/perfil", services);
    await waitFor(() => expect(avatarImgs(container, 25)).toHaveLength(1));
  });

  it("un invitado y quien no eligió siguen con iniciales", async () => {
    const services = fakeServices();
    signIn(services, GUEST);
    const header = renderWithServices(<Header />, { services });
    expect(header.container.querySelector("img[src*='/official-artwork/']")).toBeNull();
    header.unmount();

    const { container } = renderRoom([event.roomState({ phase: "waiting", players: [ash(), misty({ guest: true })] })]);
    expect(container.querySelector("img[src*='/official-artwork/']")).toBeNull();
    expect(within(container).getByText("AS")).toBeInTheDocument();
  });
});
