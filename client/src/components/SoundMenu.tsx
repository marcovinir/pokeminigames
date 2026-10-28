import { useEffect, useId, useRef, useState } from "react";
import { useStore } from "zustand";
import { SOUND_TEXT } from "../i18n/es";
import { useServices } from "../services";
import type { SoundSettings } from "../sound/settings-store";
import { Button } from "./Button";

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H3v6h3l5 4z" />
      {muted ? (
        <path d="m22 9-6 6M16 9l6 6" />
      ) : (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        </>
      )}
    </svg>
  );
}

/** Un interruptor (casilla con papel de `switch`) y su volumen, para la música o los efectos. */
function Channel({ label, volumeLabel, on, volume, onToggle, onVolume }: { label: string; volumeLabel: string; on: boolean; volume: number; onToggle(on: boolean): void; onVolume(volume: number): void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold">
        {label}
        <input id={id} type="checkbox" role="switch" checked={on} onChange={(e) => onToggle(e.target.checked)} className="size-5 accent-(--accent)" />
      </label>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(volume * 100)}
        aria-label={volumeLabel}
        disabled={!on}
        onChange={(e) => onVolume(Number(e.target.value) / 100)}
        className="w-full accent-(--accent) disabled:opacity-50"
      />
    </div>
  );
}

/**
 * El control de sonido del encabezado: un altavoz que abre un panel con «Música» y «Efectos» (interruptor y volumen).
 * Solo icono, para no ensanchar el encabezado del teléfono; su nombre accesible dice si todo está silenciado. El panel se
 * coloca como el de Apariencia (respecto del interior del encabezado, para no salirse de la pantalla).
 */
export function SoundMenu() {
  const { soundSettings } = useServices();
  const settings = useStore(soundSettings, (s) => s.settings);
  const update = (changes: Partial<SoundSettings>) => soundSettings.getState().update(changes);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const muted = !settings.musicOn && !settings.effectsOn;

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
        className="shrink-0 px-3"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <SpeakerIcon muted={muted} />
        <span className="sr-only">{muted ? SOUND_TEXT.buttonMuted : SOUND_TEXT.button}</span>
      </Button>
      {open ? (
        <div id={panelId} className="framed absolute right-4 top-full z-30 mt-2 flex w-[min(18rem,calc(100vw-2rem))] flex-col gap-4 rounded-card bg-surface p-4 text-fg shadow-pop">
          <Channel
            label={SOUND_TEXT.music}
            volumeLabel={SOUND_TEXT.musicVolume}
            on={settings.musicOn}
            volume={settings.musicVolume}
            onToggle={(on) => update({ musicOn: on })}
            onVolume={(volume) => update({ musicVolume: volume })}
          />
          <Channel
            label={SOUND_TEXT.effects}
            volumeLabel={SOUND_TEXT.effectsVolume}
            on={settings.effectsOn}
            volume={settings.effectsVolume}
            onToggle={(on) => update({ effectsOn: on })}
            onVolume={(volume) => update({ effectsVolume: volume })}
          />
        </div>
      ) : null}
    </div>
  );
}
