import { describe, expect, it } from "vitest";
import { DEFAULT_SOUND_SETTINGS, SOUND_STORAGE_KEY, createSoundSettingsStore } from "../../src/sound/settings-store";

/** Un almacenamiento en memoria, como `localStorage`. */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), data };
}

describe("ajustes de sonido", () => {
  it("sin nada guardado: todo activado, música al 50 % y efectos al 70 %", () => {
    expect(DEFAULT_SOUND_SETTINGS).toEqual({ musicOn: true, musicVolume: 0.5, effectsOn: true, effectsVolume: 0.7 });
    expect(createSoundSettingsStore({ storage: memoryStorage() }).getState().settings).toEqual(DEFAULT_SOUND_SETTINGS);
  });

  it("guarda cada cambio con su clave y se recupera en la siguiente visita", () => {
    const storage = memoryStorage();
    const store = createSoundSettingsStore({ storage });
    store.getState().update({ musicOn: false, effectsVolume: 0.3 });
    expect(store.getState().settings).toEqual({ musicOn: false, musicVolume: 0.5, effectsOn: true, effectsVolume: 0.3 });
    expect(SOUND_STORAGE_KEY).toBe("pokeminigames:sonido");
    expect(storage.data.has(SOUND_STORAGE_KEY)).toBe(true);
    expect(createSoundSettingsStore({ storage }).getState().settings).toEqual({ musicOn: false, musicVolume: 0.5, effectsOn: true, effectsVolume: 0.3 });
  });

  it("lo guardado roto o con tipos raros cae a los valores por defecto, y los volúmenes se acotan entre 0 y 1", () => {
    expect(createSoundSettingsStore({ storage: memoryStorage({ [SOUND_STORAGE_KEY]: "{no es json" }) }).getState().settings).toEqual(DEFAULT_SOUND_SETTINGS);
    const odd = JSON.stringify({ musicOn: "sí", musicVolume: 7, effectsOn: false, effectsVolume: -2 });
    expect(createSoundSettingsStore({ storage: memoryStorage({ [SOUND_STORAGE_KEY]: odd }) }).getState().settings).toEqual({
      musicOn: true,
      musicVolume: 1,
      effectsOn: false,
      effectsVolume: 0,
    });
    const store = createSoundSettingsStore({ storage: memoryStorage() });
    store.getState().update({ musicVolume: 1.5 });
    expect(store.getState().settings.musicVolume).toBe(1);
  });

  it("sin almacenamiento, o si lanza al leer o escribir, funciona en memoria", () => {
    const none = createSoundSettingsStore({ storage: null });
    none.getState().update({ effectsOn: false });
    expect(none.getState().settings.effectsOn).toBe(false);
    const broken = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    };
    const store = createSoundSettingsStore({ storage: broken });
    expect(store.getState().settings).toEqual(DEFAULT_SOUND_SETTINGS);
    expect(() => store.getState().update({ musicOn: false })).not.toThrow();
    expect(store.getState().settings.musicOn).toBe(false);
  });
});
