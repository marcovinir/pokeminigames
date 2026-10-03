import type { StoreApi } from "zustand";
import type { Endpoints } from "../api/endpoints";
import type { SessionState } from "../session/session-store";
import type { ThemePreference, ThemeState } from "./theme-store";

export interface ThemeSyncDeps {
  session: StoreApi<SessionState>;
  theme: StoreApi<ThemeState>;
  endpoints: Pick<Endpoints, "auth">;
}

const same = (a: ThemePreference, b: ThemePreference): boolean => a.theme === b.theme && a.mode === b.mode;

/**
 * Mantiene la preferencia de tema del perfil y la del navegador de acuerdo:
 * - Al iniciar sesión (o recuperarla al cargar) manda la del servidor. Si el servidor no tiene ninguna pero la
 *   persona ya había elegido en este navegador, se sube esa; los valores por defecto no se suben.
 * - Con la sesión iniciada, cada cambio se guarda en el servidor sin bloquear nada: si falla, la preferencia
 *   local sigue valiendo. Aplicar la que vino del servidor no la vuelve a guardar (sin eco).
 * - Sin sesión, todo queda en el navegador. Cerrar sesión conserva el tema actual.
 * Devuelve la función que detiene la sincronización.
 */
export function syncThemeWithSession({ session, theme, endpoints }: ThemeSyncDeps): () => void {
  /** Lo último que se sabe que tiene el servidor (o que se le acaba de mandar). */
  let known: ThemePreference | null = null;

  const save = (preference: ThemePreference): void => {
    known = preference;
    void endpoints.auth.savePreferences({ theme: preference.theme, themeMode: preference.mode }).catch(() => {});
  };

  const onSession = (state: SessionState, previous?: SessionState): void => {
    if (state.status === "anonymous") known = null;
    if (state.status !== "authenticated") return;
    // Otra actualización de la misma sesión (p. ej. al renovarla) no debe pisar lo que la persona eligió.
    if (previous?.status === "authenticated" && previous.user?.id === state.user?.id) return;

    const stored = state.user?.preferences ?? null;
    if (stored) {
      const preference = { theme: stored.theme, mode: stored.themeMode };
      known = preference;
      theme.getState().setPreference(preference);
    } else if (theme.getState().hasChoice) {
      save(theme.getState().preference);
    }
  };

  onSession(session.getState());
  const stopSession = session.subscribe(onSession);
  const stopTheme = theme.subscribe((state, previous) => {
    // Solo importan los cambios de la preferencia, no los del modo resuelto cuando cambia el tema del sistema.
    if (state.preference === previous.preference) return;
    if (session.getState().status !== "authenticated") return;
    if (known && same(state.preference, known)) return;
    save(state.preference);
  });

  return () => {
    stopSession();
    stopTheme();
  };
}
