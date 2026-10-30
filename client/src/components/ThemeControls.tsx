import { useServices, useTheme } from "../services";
import {
  MODE_LABELS,
  THEME_LABELS,
  THEME_MODES,
  THEME_NAMES,
  type ThemeMode,
  type ThemeName,
} from "../theme/theme-store";

interface SegmentedProps<T extends string> {
  legend: string;
  name: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange(value: T): void;
}

/** Opciones en una fila de botones: son radios de verdad, así que las flechas del teclado los recorren. */
function Segmented<T extends string>({ legend, name, options, labels, value, onChange }: SegmentedProps<T>) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-1 rounded-pill bg-surface-2 p-1">
        {options.map((option) => (
          <label key={option} className="cursor-pointer">
            <input type="radio" name={name} value={option} checked={value === option} onChange={() => onChange(option)} className="peer sr-only" />
            <span className="block rounded-pill px-3 py-1.5 text-sm font-semibold peer-checked:bg-accent peer-checked:text-accent-fg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">
              {labels[option]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Elegir el tema visual (Clásico o Pokédex) y el modo (automático, claro u oscuro). */
export function ThemeControls() {
  const { theme: store } = useServices();
  const theme = useTheme((s) => s.preference.theme);
  const mode = useTheme((s) => s.preference.mode);
  return (
    <>
      <Segmented<ThemeName>
        legend="Tema"
        name="theme"
        options={THEME_NAMES}
        labels={THEME_LABELS}
        value={theme}
        onChange={(value) => store.getState().setTheme(value)}
      />
      <Segmented<ThemeMode>
        legend="Modo"
        name="mode"
        options={THEME_MODES}
        labels={MODE_LABELS}
        value={mode}
        onChange={(value) => store.getState().setMode(value)}
      />
    </>
  );
}
