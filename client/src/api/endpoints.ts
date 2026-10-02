import type { CreateRoomRequest, CreateRoomResponse, GamePhase, PublicRoomInfo } from "@pokemon-minigames/shared";
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
    /** Renueva la sesión con la cookie de refresco; `null` si no hay sesión. */
    refresh(): Promise<AuthSession | null>;
    logout(): Promise<void>;
  };
  rooms: {
    create(config: CreateRoomRequest): Promise<CreateRoomResponse>;
    join(code: string): Promise<CreateRoomResponse>;
    get(code: string): Promise<PublicRoomInfo>;
    /** La sala activa del usuario, o `null` si no tiene ninguna. */
    current(): Promise<CurrentRoom | null>;
  };
  catalog: {
    names(): Promise<PokemonName[]>;
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
      refresh: () => api.refreshSession(),
      async logout() {
        try {
          await api.request<void>("POST", "/auth/logout", { auth: false });
        } finally {
          // Aunque el servidor no responda, en este navegador la sesión ya terminó.
          api.setToken(null);
        }
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
      names: () => api.request<PokemonName[]>("GET", "/pokemon/names", { auth: false }),
    },
  };
}
