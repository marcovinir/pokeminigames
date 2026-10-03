import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as shared from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCE,
  THEME_MODES,
  THEME_NAMES,
  THEME_STORAGE_KEY,
  type ThemeEnv,
  createThemeStore,
  parsePreference,
  resolveMode,
} from "../../src/theme/theme-store";

function fakeEnv(options: { saved?: string | null; prefersDark?: boolean; brokenStorage?: boolean } = {}) {
  const data = new Map<string, string>();
  if (options.saved) data.set(THEME_STORAGE_KEY, options.saved);
  const listeners: Array<() => void> = [];
  const media = {
    matches: options.prefersDark ?? false,
    addEventListener: (_type: "change", listener: () => void) => void listeners.push(listener),
  };
  const storage = options.brokenStorage
    ? {
        getItem: () => {
          throw new Error("bloqueado");
        },
        setItem: () => {
          throw new Error("bloqueado");
        },
      }
    : { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
  const root = document.createElement("html");
  const env: ThemeEnv = { storage, root, media };
  return { env, data, root, media, changeSystemTheme: (dark: boolean) => { media.matches = dark; listeners.forEach((l) => l()); } };
}

describe("parsePreference", () => {
  it("lee una preferencia válida", () => {
    expect(parsePreference('{"theme":"pokedex","mode":"oscuro"}')).toEqual({ theme: "pokedex", mode: "oscuro" });
  });

  it.each([
    ["nada guardado", null],
    ["JSON roto", "{no es json"],
    ["un número", "42"],
    ["null", "null"],
    ["valores desconocidos", '{"theme":"neon","mode":"sepia"}'],
  ])("usa los valores por defecto con %s", (_name, raw) => {
    expect(parsePreference(raw)).toEqual(DEFAULT_PREFERENCE);
  });

  it("conserva lo válido y reemplaza solo lo inválido", () => {
    expect(parsePreference('{"theme":"pokedex","mode":"sepia"}')).toEqual({ theme: "pokedex", mode: "auto" });
    expect(parsePreference('{"mode":"claro"}')).toEqual({ theme: "clasico", mode: "claro" });
  });
});

describe("resolveMode", () => {
  it("el modo automático sigue al sistema y los demás son fijos", () => {
    expect(resolveMode("auto", true)).toBe("oscuro");
    expect(resolveMode("auto", false)).toBe("claro");
    expect(resolveMode("claro", true)).toBe("claro");
    expect(resolveMode("oscuro", false)).toBe("oscuro");
  });
});

describe("createThemeStore", () => {
  it("al crearse aplica la preferencia guardada al documento", () => {
    const { env, root } = fakeEnv({ saved: '{"theme":"pokedex","mode":"oscuro"}' });
    const store = createThemeStore(env);
    expect(store.getState().preference).toEqual({ theme: "pokedex", mode: "oscuro" });
    expect(root.dataset.theme).toBe("pokedex");
    expect(root.dataset.mode).toBe("oscuro");
  });

  it("sin nada guardado usa Clásico y el modo del sistema", () => {
    const { env, root } = fakeEnv({ prefersDark: true });
    createThemeStore(env);
    expect(root.dataset.theme).toBe("clasico");
    expect(root.dataset.mode).toBe("oscuro");
  });

  it("cambiar de tema lo aplica y lo guarda, sin tocar el modo", () => {
    const { env, root, data } = fakeEnv();
    const store = createThemeStore(env);
    store.getState().setTheme("pokedex");
    expect(root.dataset.theme).toBe("pokedex");
    expect(JSON.parse(data.get(THEME_STORAGE_KEY)!)).toEqual({ theme: "pokedex", mode: "auto" });
  });

  it("cambiar de modo lo aplica y lo guarda, sin tocar el tema", () => {
    const { env, root, data } = fakeEnv({ saved: '{"theme":"pokedex","mode":"auto"}' });
    const store = createThemeStore(env);
    store.getState().setMode("oscuro");
    expect(root.dataset.mode).toBe("oscuro");
    expect(store.getState().resolvedMode).toBe("oscuro");
    expect(JSON.parse(data.get(THEME_STORAGE_KEY)!)).toEqual({ theme: "pokedex", mode: "oscuro" });
  });

  it("en modo automático sigue los cambios del sistema; en modo fijo los ignora", () => {
    const { env, root, changeSystemTheme } = fakeEnv();
    const store = createThemeStore(env);
    changeSystemTheme(true);
    expect(root.dataset.mode).toBe("oscuro");
    changeSystemTheme(false);
    expect(root.dataset.mode).toBe("claro");

    store.getState().setMode("claro");
    changeSystemTheme(true);
    expect(root.dataset.mode).toBe("claro");
  });

  it("si el almacenamiento falla (modo privado) sigue funcionando con los valores por defecto", () => {
    const { env, root } = fakeEnv({ brokenStorage: true });
    const store = createThemeStore(env);
    expect(store.getState().preference).toEqual(DEFAULT_PREFERENCE);
    expect(() => store.getState().setTheme("pokedex")).not.toThrow();
    expect(root.dataset.theme).toBe("pokedex");
  });

  it("sin almacenamiento (null) tampoco falla", () => {
    const { env } = fakeEnv();
    const store = createThemeStore({ ...env, storage: null });
    expect(() => store.getState().setMode("oscuro")).not.toThrow();
  });
});

describe("setPreference", () => {
  it("aplica tema y modo juntos, los guarda y recalcula el modo resuelto", () => {
    const { env, data, root } = fakeEnv();
    const store = createThemeStore(env);
    store.getState().setPreference({ theme: "pokedex", mode: "oscuro" });
    expect(store.getState()).toMatchObject({ preference: { theme: "pokedex", mode: "oscuro" }, resolvedMode: "oscuro" });
    expect(root.dataset).toMatchObject({ theme: "pokedex", mode: "oscuro" });
    expect(JSON.parse(data.get(THEME_STORAGE_KEY)!)).toEqual({ theme: "pokedex", mode: "oscuro" });
  });

  it("también funciona sin almacenamiento", () => {
    const { env, root } = fakeEnv({ brokenStorage: true });
    const store = createThemeStore(env);
    expect(() => store.getState().setPreference({ theme: "pokedex", mode: "claro" })).not.toThrow();
    expect(root.dataset).toMatchObject({ theme: "pokedex", mode: "claro" });
  });
});

describe("hasChoice", () => {
  it("al principio es falso: todavía no se ha elegido nada", () => {
    expect(createThemeStore(fakeEnv().env).getState().hasChoice).toBe(false);
  });

  it("es verdadero si el navegador ya tenía una preferencia guardada", () => {
    const { env } = fakeEnv({ saved: '{"theme":"pokedex","mode":"oscuro"}' });
    expect(createThemeStore(env).getState().hasChoice).toBe(true);
  });

  it("pasa a verdadero cuando la persona elige tema, modo o aplica una preferencia", () => {
    for (const choose of [
      (s: ReturnType<typeof createThemeStore>) => s.getState().setTheme("pokedex"),
      (s: ReturnType<typeof createThemeStore>) => s.getState().setMode("claro"),
      (s: ReturnType<typeof createThemeStore>) => s.getState().setPreference({ theme: "clasico", mode: "auto" }),
    ]) {
      const store = createThemeStore(fakeEnv().env);
      choose(store);
      expect(store.getState().hasChoice).toBe(true);
    }
  });

  it("un cambio del tema del sistema no cuenta como elegir", () => {
    const { env, changeSystemTheme } = fakeEnv();
    const store = createThemeStore(env);
    changeSystemTheme(true);
    expect(store.getState().hasChoice).toBe(false);
  });
});

describe("opciones de tema", () => {
  it("son exactamente las que acepta el servidor", () => {
    expect(THEME_NAMES).toBe(shared.THEME_NAMES);
    expect(THEME_MODES).toBe(shared.THEME_MODES);
  });
});

describe("script que aplica el tema antes de pintar (index.html)", () => {
  const html = readFileSync(join(import.meta.dirname, "../../index.html"), "utf8");
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1]!;

  function run(saved: string | null, prefersDark: boolean, storageThrows = false) {
    const root = document.createElement("html");
    const fakeDocument = { documentElement: root };
    const localStorage = {
      getItem: () => {
        if (storageThrows) throw new Error("bloqueado");
        return saved;
      },
    };
    const matchMedia = () => ({ matches: prefersDark });
    new Function("document", "localStorage", "matchMedia", script)(fakeDocument, localStorage, matchMedia);
    return { theme: root.dataset.theme, mode: root.dataset.mode };
  }

  it("aplica el tema y el modo guardados", () => {
    expect(run('{"theme":"pokedex","mode":"oscuro"}', false)).toEqual({ theme: "pokedex", mode: "oscuro" });
  });

  it("en modo automático o sin nada guardado usa el modo del sistema", () => {
    expect(run('{"theme":"pokedex","mode":"auto"}', true)).toEqual({ theme: "pokedex", mode: "oscuro" });
    expect(run(null, true)).toEqual({ theme: "clasico", mode: "oscuro" });
    expect(run(null, false)).toEqual({ theme: "clasico", mode: "claro" });
  });

  it("con datos corruptos o sin acceso al almacenamiento cae en Clásico claro", () => {
    expect(run("{roto", true)).toEqual({ theme: "clasico", mode: "claro" });
    expect(run(null, true, true)).toEqual({ theme: "clasico", mode: "claro" });
  });

  it("ignora valores desconocidos", () => {
    expect(run('{"theme":"neon","mode":"sepia"}', false)).toEqual({ theme: "clasico", mode: "claro" });
  });

  it("decide igual que el almacén de React para las mismas entradas", () => {
    for (const saved of [null, '{"theme":"pokedex","mode":"claro"}', '{"mode":"oscuro"}', '{"theme":"x"}']) {
      for (const dark of [true, false]) {
        const fromScript = run(saved, dark);
        const { env, root } = fakeEnv({ saved, prefersDark: dark });
        createThemeStore(env);
        expect({ theme: root.dataset.theme, mode: root.dataset.mode }, `${saved} / oscuro=${dark}`).toEqual(fromScript);
      }
    }
  });
});
