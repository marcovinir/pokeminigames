import { THEME_MODES, THEME_NAMES, type ThemeMode, type ThemeName } from "@pokemon-minigames/shared";
import { type StoreApi, createStore } from "zustand";

// Las opciones son las mismas que acepta el servidor al guardar la preferencia en el perfil.
export { THEME_MODES, THEME_NAMES };
export type { ThemeMode, ThemeName };
export type ResolvedMode = "claro" | "oscuro";

export interface ThemePreference {
  theme: ThemeName;
  mode: ThemeMode;
}

export const THEME_LABELS: Record<ThemeName, string> = { clasico: "Clásico", pokedex: "Pokédex" };
export const MODE_LABELS: Record<ThemeMode, string> = { auto: "Automático", claro: "Claro", oscuro: "Oscuro" };

export const THEME_STORAGE_KEY = "pokemon-minigames:theme";
export const DEFAULT_PREFERENCE: ThemePreference = { theme: "clasico", mode: "auto" };

/** Lee una preferencia guardada; cualquier dato ausente o inválido se reemplaza por el valor por defecto. */
export function parsePreference(raw: string | null): ThemePreference {
  try {
    const data: unknown = raw === null ? null : JSON.parse(raw);
    const { theme, mode } = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
    return {
      theme: THEME_NAMES.includes(theme as ThemeName) ? (theme as ThemeName) : DEFAULT_PREFERENCE.theme,
      mode: THEME_MODES.includes(mode as ThemeMode) ? (mode as ThemeMode) : DEFAULT_PREFERENCE.mode,
    };
  } catch {
    return { ...DEFAULT_PREFERENCE };
  }
}

export function resolveMode(mode: ThemeMode, prefersDark: boolean): ResolvedMode {
  if (mode === "auto") return prefersDark ? "oscuro" : "claro";
  return mode;
}

export interface ThemeState {
  preference: ThemePreference;
  resolvedMode: ResolvedMode;
  /** La persona ya eligió (ahora o en una visita anterior): lo que tiene no es solo el valor por defecto. */
  hasChoice: boolean;
  setTheme(theme: ThemeName): void;
  setMode(mode: ThemeMode): void;
  /** Aplica tema y modo juntos (p. ej. la preferencia guardada en el perfil). */
  setPreference(preference: ThemePreference): void;
}

/** Lo que el almacén necesita de `matchMedia("(prefers-color-scheme: dark)")`. */
export interface MediaLike {
  matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
}

export interface ThemeEnv {
  /** Almacenamiento del navegador; puede faltar o fallar (modo privado, datos bloqueados). */
  storage: Pick<Storage, "getItem" | "setItem"> | null;
  root: HTMLElement;
  /** Consulta `(prefers-color-scheme: dark)`. */
  media: MediaLike;
}

export function createThemeStore(env: ThemeEnv): StoreApi<ThemeState> {
  const read = (): string | null => {
    try {
      return env.storage?.getItem(THEME_STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  };
  const write = (preference: ThemePreference): void => {
    try {
      env.storage?.setItem(THEME_STORAGE_KEY, JSON.stringify(preference));
    } catch {
      // Sin almacenamiento la preferencia vale solo para esta visita.
    }
  };
  const apply = (preference: ThemePreference): ResolvedMode => {
    const resolvedMode = resolveMode(preference.mode, env.media.matches);
    env.root.dataset.theme = preference.theme;
    env.root.dataset.mode = resolvedMode;
    return resolvedMode;
  };

  const saved = read();
  const initial = parsePreference(saved);
  const store = createStore<ThemeState>((set, get) => {
    const choose = (preference: ThemePreference): void => {
      write(preference);
      set({ preference, resolvedMode: apply(preference), hasChoice: true });
    };
    return {
      preference: initial,
      resolvedMode: apply(initial),
      hasChoice: saved !== null,
      setTheme: (theme) => choose({ ...get().preference, theme }),
      setMode: (mode) => choose({ ...get().preference, mode }),
      setPreference: (preference) => choose({ theme: preference.theme, mode: preference.mode }),
    };
  });

  // En modo automático, seguir los cambios del sistema mientras la página está abierta.
  env.media.addEventListener("change", () => {
    const { preference } = store.getState();
    if (preference.mode === "auto") store.setState({ resolvedMode: apply(preference) });
  });

  return store;
}
