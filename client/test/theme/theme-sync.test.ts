import type { ThemePreferences } from "@pokemon-minigames/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type StoreApi, createStore } from "zustand";
import type { Endpoints } from "../../src/api/endpoints";
import type { AuthUser, SessionUser } from "../../src/api/types";
import type { SessionState } from "../../src/session/session-store";
import { syncThemeWithSession } from "../../src/theme/theme-sync";
import { THEME_STORAGE_KEY, createThemeStore } from "../../src/theme/theme-store";
import { ASH, GUEST } from "../helpers/services";

const userWith = (preferences: ThemePreferences | null, id = "u1"): AuthUser => ({ ...ASH, id, preferences });

function setup(options: { saved?: object; savePreferences?: () => Promise<void> } = {}) {
  const data = new Map<string, string>();
  if (options.saved) data.set(THEME_STORAGE_KEY, JSON.stringify(options.saved));
  const listeners: Array<() => void> = [];
  const media = { matches: false, addEventListener: (_t: "change", l: () => void) => void listeners.push(l) };
  const root = document.createElement("html");
  const theme = createThemeStore({
    storage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) },
    root,
    media,
  });
  const session = createStore<SessionState>(() => ({ status: "loading", user: null }) as unknown as SessionState);
  const savePreferences = vi.fn(options.savePreferences ?? (async () => {}));
  const endpoints = { auth: { savePreferences } } as unknown as Endpoints;
  const stop = syncThemeWithSession({ session, theme, endpoints });
  const signIn = (user: SessionUser) => session.setState({ status: "authenticated", user });
  const signOut = () => session.setState({ status: "anonymous", user: null });
  const changeSystemTheme = (dark: boolean) => {
    media.matches = dark;
    listeners.forEach((l) => l());
  };
  return { theme, session: session as StoreApi<SessionState>, savePreferences, signIn, signOut, root, data, stop, changeSystemTheme };
}

afterEach(() => vi.restoreAllMocks());

describe("al iniciar sesión", () => {
  it("la preferencia guardada en el servidor gana y se aplica, sin volver a guardarla", () => {
    const { theme, signIn, savePreferences, root } = setup({ saved: { theme: "clasico", mode: "claro" } });
    signIn(userWith({ theme: "pokedex", themeMode: "oscuro" }));
    expect(theme.getState().preference).toEqual({ theme: "pokedex", mode: "oscuro" });
    expect(root.dataset).toMatchObject({ theme: "pokedex", mode: "oscuro" });
    expect(savePreferences).not.toHaveBeenCalled();
  });

  it("la del servidor también queda en el navegador para el próximo arranque", () => {
    const { signIn, data } = setup();
    signIn(userWith({ theme: "pokedex", themeMode: "oscuro" }));
    expect(JSON.parse(data.get(THEME_STORAGE_KEY)!)).toEqual({ theme: "pokedex", mode: "oscuro" });
  });

  it("si el servidor no tiene ninguna pero el navegador sí, se sube la del navegador", () => {
    const { signIn, savePreferences } = setup({ saved: { theme: "pokedex", mode: "claro" } });
    signIn(userWith(null));
    expect(savePreferences).toHaveBeenCalledExactlyOnceWith({ theme: "pokedex", themeMode: "claro" });
  });

  it("si ninguno de los dos tiene una elección, no se sube nada (los valores por defecto no son una elección)", () => {
    const { signIn, savePreferences, theme } = setup();
    signIn(userWith(null));
    expect(savePreferences).not.toHaveBeenCalled();
    expect(theme.getState().preference).toEqual({ theme: "clasico", mode: "auto" });
  });

  it("si la sesión ya estaba iniciada cuando empieza la sincronización, también aplica la del servidor", () => {
    const theme = createThemeStore({ storage: null, root: document.createElement("html"), media: { matches: false, addEventListener: () => {} } });
    const session = createStore<SessionState>(
      () => ({ status: "authenticated", user: userWith({ theme: "pokedex", themeMode: "oscuro" }) }) as unknown as SessionState,
    );
    syncThemeWithSession({ session, theme, endpoints: { auth: { savePreferences: vi.fn() } } as unknown as Endpoints });
    expect(theme.getState().preference).toEqual({ theme: "pokedex", mode: "oscuro" });
  });

  it("al cambiar a otra cuenta sin cerrar sesión, aplica la preferencia de la nueva", () => {
    const { theme, signIn } = setup();
    signIn(userWith({ theme: "pokedex", themeMode: "oscuro" }, "u1"));
    signIn(userWith({ theme: "clasico", themeMode: "claro" }, "u2"));
    expect(theme.getState().preference).toEqual({ theme: "clasico", mode: "claro" });
  });

  it("otra actualización de la misma sesión (mismo usuario) no pisa lo que la persona acaba de elegir", () => {
    const { theme, signIn } = setup();
    signIn(userWith({ theme: "pokedex", themeMode: "oscuro" }));
    theme.getState().setTheme("clasico");
    signIn(userWith({ theme: "pokedex", themeMode: "oscuro" })); // p. ej. una renovación de la sesión
    expect(theme.getState().preference.theme).toBe("clasico");
  });
});

describe("con un invitado", () => {
  it("entrar como invitado no sube la preferencia del navegador y cambiar el tema nunca llama a savePreferences", () => {
    const { theme, signIn, savePreferences } = setup({ saved: { theme: "pokedex", mode: "oscuro" } });
    signIn(GUEST);
    expect(savePreferences).not.toHaveBeenCalled();
    theme.getState().setTheme("clasico");
    theme.getState().setMode("claro");
    expect(savePreferences).not.toHaveBeenCalled();
    expect(theme.getState().preference).toEqual({ theme: "clasico", mode: "claro" });
  });

  it("un invitado que crea una cuenta sigue el camino de siempre: manda la del servidor, o sube la elegida si no hay ninguna", () => {
    const withStored = setup();
    withStored.signIn(GUEST);
    withStored.signIn(userWith({ theme: "pokedex", themeMode: "oscuro" }));
    expect(withStored.theme.getState().preference).toEqual({ theme: "pokedex", mode: "oscuro" });
    expect(withStored.savePreferences).not.toHaveBeenCalled();

    const without = setup();
    without.signIn(GUEST);
    without.theme.getState().setTheme("pokedex");
    expect(without.savePreferences).not.toHaveBeenCalled();
    without.signIn(userWith(null));
    expect(without.savePreferences).toHaveBeenCalledWith({ theme: "pokedex", themeMode: "auto" });
  });

  it("con una cuenta sigue todo igual: cada cambio se guarda", () => {
    const { theme, signIn, savePreferences } = setup();
    signIn(userWith({ theme: "clasico", themeMode: "auto" }));
    theme.getState().setTheme("pokedex");
    expect(savePreferences).toHaveBeenCalledTimes(1);
  });
});

describe("con la sesión iniciada", () => {
  it("cada cambio de tema o de modo se guarda en el servidor", async () => {
    const { theme, signIn, savePreferences } = setup();
    signIn(userWith({ theme: "clasico", themeMode: "auto" }));
    theme.getState().setTheme("pokedex");
    expect(savePreferences).toHaveBeenLastCalledWith({ theme: "pokedex", themeMode: "auto" });
    await vi.waitFor(() => expect(savePreferences.mock.results[0]).toBeDefined());
    await Promise.resolve();
    theme.getState().setMode("oscuro");
    await vi.waitFor(() => expect(savePreferences).toHaveBeenLastCalledWith({ theme: "pokedex", themeMode: "oscuro" }));
    expect(savePreferences).toHaveBeenCalledTimes(2);
  });

  it("varios cambios seguidos no se cruzan: se espera al guardado en curso y solo se manda el último", async () => {
    const finishes: Array<() => void> = [];
    const { theme, signIn, savePreferences } = setup({ savePreferences: () => new Promise<void>((resolve) => finishes.push(resolve)) });
    signIn(userWith({ theme: "clasico", themeMode: "auto" }));
    theme.getState().setTheme("pokedex");
    theme.getState().setMode("oscuro");
    theme.getState().setMode("claro");
    expect(savePreferences).toHaveBeenCalledTimes(1);
    finishes[0]!();
    await vi.waitFor(() => expect(savePreferences).toHaveBeenCalledTimes(2));
    expect(savePreferences).toHaveBeenLastCalledWith({ theme: "pokedex", themeMode: "claro" });
  });

  it("si un guardado falla, el que esperaba se manda igual", async () => {
    const results = [() => Promise.reject(new Error("sin red")), () => Promise.resolve()];
    const { theme, signIn, savePreferences } = setup({ savePreferences: () => results.shift()!() });
    signIn(userWith({ theme: "clasico", themeMode: "auto" }));
    theme.getState().setTheme("pokedex");
    theme.getState().setMode("oscuro");
    await vi.waitFor(() => expect(savePreferences).toHaveBeenCalledTimes(2));
  });

  it("elegir lo que ya está guardado no vuelve a mandarlo", () => {
    const { theme, signIn, savePreferences } = setup();
    signIn(userWith({ theme: "pokedex", themeMode: "oscuro" }));
    theme.getState().setTheme("pokedex");
    theme.getState().setPreference({ theme: "pokedex", mode: "oscuro" });
    expect(savePreferences).not.toHaveBeenCalled();
  });

  it("el primer cambio de quien no tenía nada guardado también se guarda", () => {
    const { theme, signIn, savePreferences } = setup();
    signIn(userWith(null));
    theme.getState().setTheme("pokedex");
    expect(savePreferences).toHaveBeenCalledExactlyOnceWith({ theme: "pokedex", themeMode: "auto" });
  });

  it("un cambio del tema del sistema (modo automático) no se guarda", () => {
    const { signIn, savePreferences, changeSystemTheme, theme } = setup();
    signIn(userWith(null));
    changeSystemTheme(true);
    expect(theme.getState().resolvedMode).toBe("oscuro");
    expect(savePreferences).not.toHaveBeenCalled();
  });

  it("si guardar falla, no pasa nada: la preferencia local sigue valiendo y el siguiente cambio vuelve a intentarlo", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const { theme, signIn, savePreferences } = setup({ savePreferences: async () => Promise.reject(new Error("sin red")) });
    signIn(userWith({ theme: "clasico", themeMode: "auto" }));
    theme.getState().setTheme("pokedex");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(theme.getState().preference.theme).toBe("pokedex");
    theme.getState().setMode("claro");
    expect(savePreferences).toHaveBeenCalledTimes(2);
    await new Promise((resolve) => setTimeout(resolve, 20));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe("sin sesión", () => {
  it("los cambios de tema solo valen en este navegador", () => {
    const { theme, savePreferences, data } = setup();
    theme.getState().setTheme("pokedex");
    expect(savePreferences).not.toHaveBeenCalled();
    expect(JSON.parse(data.get(THEME_STORAGE_KEY)!).theme).toBe("pokedex");
  });

  it("tras cerrar sesión se conserva el tema actual y los cambios dejan de guardarse", () => {
    const { theme, signIn, signOut, savePreferences } = setup();
    signIn(userWith({ theme: "pokedex", themeMode: "oscuro" }));
    signOut();
    expect(theme.getState().preference).toEqual({ theme: "pokedex", mode: "oscuro" });
    theme.getState().setMode("claro");
    expect(savePreferences).not.toHaveBeenCalled();
  });

  it("al volver a entrar con una cuenta sin preferencia se sube lo que quedó en el navegador", () => {
    const { theme, signIn, signOut, savePreferences } = setup();
    signIn(userWith({ theme: "pokedex", themeMode: "oscuro" }, "u1"));
    signOut();
    theme.getState().setMode("claro");
    signIn(userWith(null, "u2"));
    expect(savePreferences).toHaveBeenCalledExactlyOnceWith({ theme: "pokedex", themeMode: "claro" });
  });
});

describe("al detener la sincronización", () => {
  it("deja de reaccionar a la sesión y al tema", () => {
    const { theme, signIn, stop, savePreferences } = setup();
    stop();
    signIn(userWith({ theme: "pokedex", themeMode: "oscuro" }));
    expect(theme.getState().preference).toEqual({ theme: "clasico", mode: "auto" });
    theme.getState().setTheme("pokedex");
    expect(savePreferences).not.toHaveBeenCalled();
  });
});
