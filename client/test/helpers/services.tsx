import type { PokemonFact, Stats } from "@pokemon-minigames/shared";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { type Mock, vi } from "vitest";
import type { Endpoints } from "../../src/api/endpoints";
import type { AuthUser, GuestUser, PokemonName, SessionUser } from "../../src/api/types";
import { createFactsStore } from "../../src/catalog/facts-store";
import { createNamesStore } from "../../src/catalog/names-store";
import { createGameStore } from "../../src/game/store";
import { soundEffectsListener } from "../../src/sound/play-effects";
import { ServicesProvider, type Services } from "../../src/services";
import { createSessionStore } from "../../src/session/session-store";
import { createSoundSettingsStore } from "../../src/sound/settings-store";
import type { SoundService } from "../../src/sound/sound-service";
import { createThemeStore } from "../../src/theme/theme-store";

export const ASH: AuthUser = {
  id: "u1",
  email: "ash@example.com",
  username: "ash",
  createdAt: "2026-01-01T00:00:00.000Z",
  preferences: null,
  avatarId: null,
};

/** Una persona que entró como invitada: sin cuenta, sin correo, sin estadísticas. */
export const GUEST: GuestUser = { id: "guest_abc", username: "inv_1", guest: true };

/** Estadísticas de una persona que todavía no ha jugado. */
export const NO_STATS: Stats = {
  played: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  winRate: null,
  currentStreak: 0,
  bestStreak: 0,
  averagePower: null,
  bestGameScore: null,
  topPokemon: [],
};

/** Un par de datos curiosos de ejemplo (los de verdad salen del catálogo del servidor). */
export const FACTS: PokemonFact[] = [
  { kind: "top_stat", stat: "defense", pokemon: [{ id: 213, es: "Shuckle" }], value: 230 },
  { kind: "type_extreme", which: "most", type: "water", count: 134 },
  { kind: "pair_count", count: 130 },
];

export const NAMES: PokemonName[] = [
  { id: 1, es: "Alfa", en: "Alpha" },
  { id: 2, es: "Alfil", en: "Bishop" },
  { id: 3, es: "Beto", en: "Beta" },
  { id: 4, es: "Épsilon", en: "Epsilon" },
  { id: 5, es: "Zeta", en: "Zeta" },
];

export interface FakeServices extends Services {
  endpoints: Endpoints;
  /** Acciones del juego como espías. */
  client: {
    join: ReturnType<typeof vi.fn>;
    chooseType: ReturnType<typeof vi.fn>;
    submit: ReturnType<typeof vi.fn>;
    leave: ReturnType<typeof vi.fn>;
    requestRematch: ReturnType<typeof vi.fn>;
    cancelRematch: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  };
  themeRoot: HTMLElement;
  /** El sonido como espías: qué efectos y qué música se pidieron. */
  sound: { [K in keyof SoundService]: Mock<SoundService[K]> };
}

/** Servicios de mentira: los endpoints son espías y el socket no existe. */
export function fakeServices(): FakeServices {
  const endpoints: Endpoints = {
    auth: {
      register: vi.fn(async () => ({ user: ASH, accessToken: "tok" })),
      login: vi.fn(async () => ({ user: ASH, accessToken: "tok" })),
      guest: vi.fn(async (username: string) => ({ user: { ...GUEST, username }, accessToken: "tok" })),
      refresh: vi.fn(async () => null),
      logout: vi.fn(async () => {}),
      savePreferences: vi.fn(async () => {}),
      saveAvatar: vi.fn(async (avatarId: number | null) => avatarId),
      deleteAccount: vi.fn(async () => {}),
    },
    rooms: {
      create: vi.fn(async () => ({ code: "ABC234" })),
      join: vi.fn(async () => ({ code: "ABC234" })),
      get: vi.fn(),
      current: vi.fn(async () => null),
    },
    catalog: { names: vi.fn(async () => NAMES), facts: vi.fn(async () => FACTS), dex: vi.fn(async () => []), dexEntry: vi.fn() },
    stats: {
      mine: vi.fn(async () => ({ username: "ash", avatarId: null, stats: NO_STATS })),
      forUser: vi.fn(async (username: string) => ({ username, avatarId: null, stats: NO_STATS })),
      history: vi.fn(async () => ({ games: [], nextCursor: null })),
    },
  };
  const client = {
    join: vi.fn(),
    chooseType: vi.fn(),
    submit: vi.fn(),
    lineup: vi.fn(),
    move: vi.fn(),
    switchTo: vi.fn(),
    pauseConfirm: vi.fn(),
    stillHere: vi.fn(),
    bid: vi.fn(),
    pass: vi.fn(),
    ready: vi.fn(),
    leave: vi.fn(),
    requestRematch: vi.fn(),
    cancelRematch: vi.fn(),
    dispose: vi.fn(),
  };
  const themeRoot = document.createElement("html");
  const sound = { play: vi.fn<SoundService["play"]>(), setMusic: vi.fn<SoundService["setMusic"]>(), unlock: vi.fn<SoundService["unlock"]>(), dispose: vi.fn<SoundService["dispose"]>() };
  return {
    endpoints,
    client,
    themeRoot,
    session: createSessionStore(endpoints),
    names: createNamesStore(endpoints),
    facts: createFactsStore(endpoints),
    game: { store: createGameStore({ onEvent: soundEffectsListener(sound) }), client },
    sound,
    soundSettings: createSoundSettingsStore({ storage: null }),
    theme: createThemeStore({
      storage: null,
      root: themeRoot,
      media: { matches: false, addEventListener: () => {} },
    }),
  };
}

/** Deja la sesión como iniciada, sin pasar por el arranque. */
export function signIn(services: Services, user: SessionUser = ASH): void {
  services.session.setState({ status: "authenticated", user });
}

/** Muestra en pantalla la ruta actual; sirve para comprobar redirecciones. */
export function LocationProbe() {
  const location = useLocation();
  return (
    <p data-testid="location" data-state={JSON.stringify(location.state ?? null)}>
      {location.pathname}
    </p>
  );
}

export function renderWithServices(
  ui: ReactElement,
  options: { services?: FakeServices; route?: string | { pathname: string; state?: unknown } } = {},
) {
  const services = options.services ?? fakeServices();
  const result = render(
    <ServicesProvider services={services}>
      <MemoryRouter initialEntries={[options.route ?? "/"]}>{ui}</MemoryRouter>
    </ServicesProvider>,
  );
  return { services, ...result };
}

/** Como renderWithServices, pero con rutas: `ui` se monta en `path` y hay una sonda de ubicación. */
export function renderRoute(
  path: string,
  ui: ReactElement,
  options: { services?: FakeServices; route: string | { pathname: string; state?: unknown } },
) {
  return renderWithServices(
    <>
      <Routes>
        <Route path={path} element={ui} />
        <Route path="*" element={<p>Otra pantalla</p>} />
      </Routes>
      <LocationProbe />
    </>,
    options,
  );
}
