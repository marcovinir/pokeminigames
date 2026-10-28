import { type StoreApi, createStore } from "zustand";

/** Lo que cada persona elige en el panel de sonido. Los volúmenes van de 0 a 1. */
export interface SoundSettings {
  musicOn: boolean;
  musicVolume: number;
  effectsOn: boolean;
  effectsVolume: number;
}

/** El sonido está activado desde el principio (decisión de Marco); la música, más baja que los efectos. */
export const DEFAULT_SOUND_SETTINGS: SoundSettings = { musicOn: true, musicVolume: 0.5, effectsOn: true, effectsVolume: 0.7 };

export const SOUND_STORAGE_KEY = "pokeminigames:sonido";

export interface SoundSettingsState {
  settings: SoundSettings;
  update(changes: Partial<SoundSettings>): void;
}

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

/** Lo guardado puede venir roto o de otra versión: cada campo inválido toma su valor por defecto. */
function sanitize(raw: Partial<Record<keyof SoundSettings, unknown>>): SoundSettings {
  const flag = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
  const volume = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? clamp(value) : fallback);
  return {
    musicOn: flag(raw.musicOn, DEFAULT_SOUND_SETTINGS.musicOn),
    musicVolume: volume(raw.musicVolume, DEFAULT_SOUND_SETTINGS.musicVolume),
    effectsOn: flag(raw.effectsOn, DEFAULT_SOUND_SETTINGS.effectsOn),
    effectsVolume: volume(raw.effectsVolume, DEFAULT_SOUND_SETTINGS.effectsVolume),
  };
}

/** Los ajustes de sonido, guardados en el navegador. Sin almacenamiento (modo privado, datos bloqueados) valen solo esta visita. */
export function createSoundSettingsStore(env: { storage: Pick<Storage, "getItem" | "setItem"> | null }): StoreApi<SoundSettingsState> {
  const read = (): SoundSettings => {
    try {
      const saved = env.storage?.getItem(SOUND_STORAGE_KEY);
      return saved ? sanitize(JSON.parse(saved) as Record<string, unknown>) : DEFAULT_SOUND_SETTINGS;
    } catch {
      return DEFAULT_SOUND_SETTINGS;
    }
  };
  const write = (settings: SoundSettings): void => {
    try {
      env.storage?.setItem(SOUND_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Sin almacenamiento los ajustes valen solo para esta visita.
    }
  };

  return createStore<SoundSettingsState>((set, get) => ({
    settings: read(),
    update(changes) {
      const settings = sanitize({ ...get().settings, ...changes });
      write(settings);
      set({ settings });
    },
  }));
}
