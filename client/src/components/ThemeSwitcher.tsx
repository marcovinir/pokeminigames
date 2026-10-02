import {
  MODE_LABELS,
  THEME_LABELS,
  THEME_MODES,
  THEME_NAMES,
  type ThemeMode,
  type ThemeName,
} from "../theme/theme-store";
import { useServices, useTheme } from "../services";

const SELECT_CLASS = "framed rounded-ui bg-surface px-2 py-1 text-sm text-fg";

/** Elegir el tema visual (Clásico o Pokédex) y el modo (automático, claro u oscuro). */
export function ThemeSwitcher() {
  const { theme: store } = useServices();
  const theme = useTheme((s) => s.preference.theme);
  const mode = useTheme((s) => s.preference.mode);

  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="flex items-center gap-1">
        <span>Tema</span>
        <select
          className={SELECT_CLASS}
          value={theme}
          onChange={(event) => store.getState().setTheme(event.target.value as ThemeName)}
        >
          {THEME_NAMES.map((name) => (
            <option key={name} value={name}>
              {THEME_LABELS[name]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1">
        <span>Modo</span>
        <select
          className={SELECT_CLASS}
          value={mode}
          onChange={(event) => store.getState().setMode(event.target.value as ThemeMode)}
        >
          {THEME_MODES.map((name) => (
            <option key={name} value={name}>
              {MODE_LABELS[name]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
