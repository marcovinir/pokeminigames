import { useEffect, useId, useRef, useState } from "react";
import { useServices, useTheme } from "../services";
import {
  MODE_LABELS,
  THEME_LABELS,
  THEME_MODES,
  THEME_NAMES,
  type ThemeMode,
  type ThemeName,
} from "../theme/theme-store";
import { Button } from "./Button";

function PaletteIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z" />
      <circle cx="7.5" cy="11" r="1" />
      <circle cx="11" cy="7.5" r="1" />
      <circle cx="16" cy="8" r="1" />
    </svg>
  );
}

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
            <span className="block rounded-pill px-3 py-1.5 text-sm font-semibold peer-checked:bg-accent peer-checked:text-accent-fg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
              {labels[option]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Elegir el tema visual (Clásico o Pokédex) y el modo (automático, claro u oscuro) desde un botón de paleta.
 * El panel es `absolute` respecto del contenedor posicionado más cercano (el interior del encabezado), no del botón: con
 * sesión iniciada el botón queda a media fila y un panel de 20 rem anclado a él se salía de la pantalla por la izquierda.
 * `compact` deja solo el icono hasta pantallas anchas (cuando la fila lleva más botones).
 */
export function ThemeMenu({ compact = false }: { compact?: boolean }) {
  const { theme: store } = useServices();
  const theme = useTheme((s) => s.preference.theme);
  const mode = useTheme((s) => s.preference.mode);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      root.current?.querySelector("button")?.focus();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={root}>
      <Button
        variant="header"
        className={compact ? "shrink-0 max-lg:px-3" : "shrink-0 max-sm:px-3"}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <PaletteIcon />
        <span className={compact ? "sr-only lg:not-sr-only" : "sr-only sm:not-sr-only"}>Apariencia</span>
      </Button>
      {open ? (
        <div id={panelId} className="framed absolute right-4 top-full z-30 mt-2 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-4 rounded-card bg-surface p-4 text-fg shadow-pop">
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
        </div>
      ) : null}
    </div>
  );
}
