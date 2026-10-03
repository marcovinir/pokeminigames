export const THEME_NAMES = ["clasico", "pokedex"] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

export const THEME_MODES = ["auto", "claro", "oscuro"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

/** Preferencia de tema guardada en el perfil: siempre los dos valores juntos. */
export interface ThemePreferences {
  theme: ThemeName;
  themeMode: ThemeMode;
}
