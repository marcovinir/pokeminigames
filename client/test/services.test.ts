import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServices } from "../src/services";
import { ASH } from "./helpers/services";

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {} }));
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.mode;
});
afterEach(() => vi.unstubAllGlobals());

describe("createServices", () => {
  it("conecta el tema con la sesión: al iniciar sesión se aplica la preferencia guardada en el servidor", () => {
    const services = createServices();
    services.session.setState({
      status: "authenticated",
      user: { ...ASH, preferences: { theme: "pokedex", themeMode: "oscuro" } },
    });
    expect(services.theme.getState().preference).toEqual({ theme: "pokedex", mode: "oscuro" });
    expect(document.documentElement.dataset).toMatchObject({ theme: "pokedex", mode: "oscuro" });
  });
});
