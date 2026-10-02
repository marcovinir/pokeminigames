import { type StoreApi, createStore } from "zustand";

export type ThemeName = "clasico" | "pokedex";
export type ThemeMode = "auto" | "claro" | "oscuro";
export type ResolvedMode = "claro" | "oscuro";

export interface ThemePreference {
  theme: ThemeName;
  mode: ThemeMode;
}

export const THEME_LABELS: Record<ThemeName, string> = { clasico: "Clásico", pokedex: "Pokédex" };
export const MODE_LABELS: Record<ThemeMode, string> = { auto: "Automático", claro: "Claro", oscuro: "Oscuro" };
export const THEME_NAMES = Object.keys(THEME_LABELS) as ThemeName[];
export const THEME_MODES = Object.keys(MODE_LABELS) as ThemeMode[];

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
  setTheme(theme: ThemeName): void;
  setMode(mode: ThemeMode): void;
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

  const initial = parsePreference(read());
  const store = createStore<ThemeState>((set, get) => ({
    preference: initial,
    resolvedMode: apply(initial),
    setTheme(theme) {
      const preference = { ...get().preference, theme };
      write(preference);
      set({ preference, resolvedMode: apply(preference) });
    },
    setMode(mode) {
      const preference = { ...get().preference, mode };
      write(preference);
      set({ preference, resolvedMode: apply(preference) });
    },
  }));

  // En modo automático, seguir los cambios del sistema mientras la página está abierta.
  env.media.addEventListener("change", () => {
    const { preference } = store.getState();
    if (preference.mode === "auto") store.setState({ resolvedMode: apply(preference) });
  });

  return store;
}
