import { type StoreApi, createStore } from "zustand";
import type { Credentials, Endpoints, Registration, VerifyEmailInput } from "../api/endpoints";
import type { AuthUser, VerificationRequired } from "../api/types";

export type SessionStatus = "loading" | "authenticated" | "anonymous";

export interface SessionState {
  status: SessionStatus;
  user: AuthUser | null;
  /** Al cargar la aplicación: intenta recuperar la sesión con la cookie de refresco. Solo corre una vez. */
  bootstrap(): Promise<void>;
  login(credentials: Credentials): Promise<void>;
  /** Abre la sesión (y devuelve `null`) o, con la verificación activa, deja la cuenta pendiente y devuelve el correo al que llegó el código. */
  register(registration: Registration): Promise<VerificationRequired | null>;
  /** Verifica el correo con el código que llegó y abre la sesión. */
  verifyEmail(input: VerifyEmailInput): Promise<void>;
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
      const result = await endpoints.auth.register(registration);
      if ("verification" in result) return result;
      set({ status: "authenticated", user: result.user });
      return null;
    },

    async verifyEmail(input) {
      const session = await endpoints.auth.verifyEmail(input);
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
