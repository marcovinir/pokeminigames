import { type ReactNode, createContext, useContext } from "react";
import { io } from "socket.io-client";
import { type StoreApi, useStore } from "zustand";
import { ApiClient } from "./api/client";
import { type Endpoints, createEndpoints } from "./api/endpoints";
import { type NamesState, createNamesStore } from "./catalog/names-store";
import { GameClient, type GameClientApi, type SocketLike } from "./game/game-client";
import { type GameStoreState, createGameStore } from "./game/store";
import { type SessionState, createSessionStore } from "./session/session-store";
import { type ThemeState, createThemeStore } from "./theme/theme-store";

/** Todo lo que la interfaz necesita del exterior. En las pruebas se reemplaza por dobles. */
export interface Services {
  endpoints: Endpoints;
  session: StoreApi<SessionState>;
  theme: StoreApi<ThemeState>;
  names: StoreApi<NamesState>;
  game: { store: StoreApi<GameStoreState>; client: GameClientApi };
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error("Falta el ServicesProvider");
  return services;
}

export const useSession = <T,>(selector: (state: SessionState) => T): T => useStore(useServices().session, selector);
export const useTheme = <T,>(selector: (state: ThemeState) => T): T => useStore(useServices().theme, selector);
export const useNames = <T,>(selector: (state: NamesState) => T): T => useStore(useServices().names, selector);
export const useGame = <T,>(selector: (state: GameStoreState) => T): T => useStore(useServices().game.store, selector);

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    // Algunos navegadores lanzan al acceder al almacenamiento (datos bloqueados).
    return null;
  }
}

/** Crea los servicios reales: API, sesión, socket, tema y catálogo. */
export function createServices(options: { baseUrl?: string } = {}): Services {
  const baseUrl = options.baseUrl ?? "";

  const sessionHolder: { store?: StoreApi<SessionState> } = {};
  const api = new ApiClient({ baseUrl, onSessionLost: () => sessionHolder.store?.getState().expire() });
  const endpoints = createEndpoints(api);
  const session = createSessionStore(endpoints);
  sessionHolder.store = session;

  const gameStore = createGameStore();
  const client = new GameClient({
    store: gameStore,
    refreshSession: () => endpoints.auth.refresh(),
    onSessionLost: () => sessionHolder.store?.getState().expire(),
    // `auth` como función: cada (re)conexión usa el access token vigente.
    createSocket: () =>
      io(baseUrl || undefined, { autoConnect: false, auth: (cb) => cb({ token: api.getToken() }) }) as unknown as SocketLike,
  });

  return {
    endpoints,
    session,
    names: createNamesStore(endpoints),
    game: { store: gameStore, client },
    theme: createThemeStore({
      storage: safeStorage(),
      root: document.documentElement,
      media: window.matchMedia("(prefers-color-scheme: dark)"),
    }),
  };
}
