import { type StoreApi, createStore } from "zustand";
import type { Credentials, Endpoints, Registration } from "../api/endpoints";
import type { SessionUser } from "../api/types";

export type SessionStatus = "loading" | "authenticated" | "anonymous";

export interface SessionState {
  status: SessionStatus;
  user: SessionUser | null;
  /** Al cargar la aplicación: intenta recuperar la sesión con la cookie de refresco. Solo corre una vez. */
  bootstrap(): Promise<void>;
  login(credentials: Credentials): Promise<void>;
  register(registration: Registration): Promise<void>;
  /** Entra como invitado, solo con un nombre: juega igual que una cuenta pero no guarda nada. */
  loginAsGuest(username: string): Promise<void>;
  logout(): Promise<void>;
  /** La sesión se perdió (no se pudo renovar): hay que volver a iniciar sesión. */
  expire(): void;
}

export function createSessionStore(endpoints: Endpoints): StoreApi<SessionState> {
  let booting: Promise<void> | null = null;

  return createStore<SessionState>((set) => ({
    status: "loading",
    user: null,

    bootstrap() {
      booting ??= endpoints.auth.refresh().then(
        (session) => set(session ? { status: "authenticated", user: session.user } : { status: "anonymous", user: null }),
        () => set({ status: "anonymous", user: null }),
      );
      return booting;
    },

    async login(credentials) {
      const session = await endpoints.auth.login(credentials);
      set({ status: "authenticated", user: session.user });
    },

    async register(registration) {
      const session = await endpoints.auth.register(registration);
      set({ status: "authenticated", user: session.user });
    },

    async loginAsGuest(username) {
      const session = await endpoints.auth.guest(username);
      set({ status: "authenticated", user: session.user });
    },

    async logout() {
      try {
        await endpoints.auth.logout();
      } finally {
        set({ status: "anonymous", user: null });
      }
    },

    expire() {
      set({ status: "anonymous", user: null });
    },
  }));
}
