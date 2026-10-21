import type {
  CreateRoomRequest,
  CreateRoomResponse,
  GamePhase,
  HistoryPage,
  PokemonFact,
  PublicRoomInfo,
  StatsResponse,
  ThemePreferences,
} from "@pokemon-minigames/shared";
import type { ApiClient } from "./client";
import type { AuthSession, PokemonName } from "./types";

export interface Credentials {
  email: string;
  password: string;
}

export interface Registration extends Credentials {
  username: string;
}

export interface CurrentRoom {
  code: string;
  phase: GamePhase;
}

/** Todas las llamadas al servidor que usa la interfaz, agrupadas por tema. */
export interface Endpoints {
  auth: {
    register(input: Registration): Promise<AuthSession>;
    login(input: Credentials): Promise<AuthSession>;
    /** Entra como invitado, solo con un nombre: sin cuenta y sin estadísticas. */
    guest(username: string): Promise<AuthSession>;
    /** Renueva la sesión con la cookie de refresco; `null` si no hay sesión. */
    refresh(): Promise<AuthSession | null>;
    logout(): Promise<void>;
    /** Guarda el tema y el modo en el perfil. */
    savePreferences(preferences: ThemePreferences): Promise<void>;
  };
  rooms: {
    create(config: CreateRoomRequest): Promise<CreateRoomResponse>;
    join(code: string): Promise<CreateRoomResponse>;
    get(code: string): Promise<PublicRoomInfo>;
    /** La sala activa del usuario, o `null` si no tiene ninguna. */
    current(): Promise<CurrentRoom | null>;
  };
  catalog: {
    /** La lista de nombres del autocompletado; con `withTypes` trae también los tipos (solo para salas con pistas). */
    names(options?: { withTypes?: boolean }): Promise<PokemonName[]>;
    /** Los datos curiosos que se ven mientras se espera la respuesta a una revancha. */
    facts(): Promise<PokemonFact[]>;
  };
  stats: {
    /** Tus estadísticas. */
    mine(): Promise<StatsResponse>;
    /** Las estadísticas de otra persona (solo lo público: nunca su historial ni su correo). */
    forUser(username: string): Promise<StatsResponse>;
    /** Tus partidas completadas, de la más reciente a la más antigua; `before` es el cursor de la página anterior. */
    history(options?: { before?: string | null; limit?: number }): Promise<HistoryPage>;
  };
}

export function createEndpoints(api: ApiClient): Endpoints {
  const startSession = async (path: string, body: unknown): Promise<AuthSession> => {
    const session = await api.request<AuthSession>("POST", path, { body, auth: false });
    api.setToken(session.accessToken);
    return session;
  };

  return {
    auth: {
      register: (input) => startSession("/auth/register", input),
      login: (input) => startSession("/auth/login", input),
      guest: (username) => startSession("/auth/guest", { username }),
      refresh: () => api.refreshSession(),
      async logout() {
        try {
          await api.request<void>("POST", "/auth/logout", { auth: false });
        } finally {
          // Aunque el servidor no responda, en este navegador la sesión ya terminó.
          api.setToken(null);
        }
      },
      async savePreferences(preferences) {
        await api.request<unknown>("PUT", "/auth/me/preferences", { body: preferences });
      },
    },
    rooms: {
      create: (config) => api.request<CreateRoomResponse>("POST", "/rooms", { body: config }),
      join: (code) => api.request<CreateRoomResponse>("POST", `/rooms/${encodeURIComponent(code)}/join`),
      get: (code) => api.request<PublicRoomInfo>("GET", `/rooms/${encodeURIComponent(code)}`),
      async current() {
        const { room } = await api.request<{ room: CurrentRoom | null }>("GET", "/rooms/current");
        return room;
      },
    },
    catalog: {
      async facts() {
        const { facts } = await api.request<{ facts: PokemonFact[] }>("GET", "/pokemon/facts", { auth: false });
        return facts;
      },
      names: ({ withTypes = false } = {}) =>
        api.request<PokemonName[]>("GET", withTypes ? "/pokemon/names?types=1" : "/pokemon/names", { auth: false }),
    },
    stats: {
      mine: () => api.request<StatsResponse>("GET", "/stats"),
      forUser: (username) => api.request<StatsResponse>("GET", `/users/${encodeURIComponent(username)}/stats`),
      history({ before, limit } = {}) {
        const query = new URLSearchParams();
        if (limit !== undefined) query.set("limit", String(limit));
        if (before) query.set("before", before);
        const text = query.toString();
        return api.request<HistoryPage>("GET", `/stats/history${text ? `?${text}` : ""}`);
      },
    },
  };
}
