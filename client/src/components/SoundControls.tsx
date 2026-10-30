import { useId } from "react";
import { useStore } from "zustand";
import { SOUND_TEXT } from "../i18n/es";
import { useServices } from "../services";
import type { SoundSettings } from "../sound/settings-store";

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

/** Música y efectos: interruptor y volumen de cada uno. */
export function SoundControls() {
  const { soundSettings } = useServices();
  const settings = useStore(soundSettings, (s) => s.settings);
  const update = (changes: Partial<SoundSettings>) => soundSettings.getState().update(changes);
  return (
    <>
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
    </>
  );
}
