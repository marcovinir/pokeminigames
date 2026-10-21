import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/client";
import type { PokemonName } from "../../src/api/types";
import { NAMES, fakeServices } from "../helpers/services";

describe("lista de nombres para el autocompletado", () => {
  it("empieza vacía", () => {
    const { names } = fakeServices();
    expect(names.getState()).toMatchObject({ status: "idle", names: [] });
  });

  it("load descarga la lista y queda lista", async () => {
    const { names, endpoints } = fakeServices();
    await names.getState().load();
    expect(names.getState()).toMatchObject({ status: "ready", names: NAMES });
    expect(endpoints.catalog.names).toHaveBeenCalledTimes(1);
  });

  it("solo se descarga una vez, aunque se pida varias veces a la vez o después", async () => {
    const { names, endpoints } = fakeServices();
    await Promise.all([names.getState().load(), names.getState().load()]);
    await names.getState().load();
    expect(endpoints.catalog.names).toHaveBeenCalledTimes(1);
  });

  it("si falla queda en error sin lanzar, y se puede reintentar", async () => {
    const { names, endpoints } = fakeServices();
    vi.mocked(endpoints.catalog.names).mockRejectedValueOnce(new ApiError(0, "NETWORK"));
    await expect(names.getState().load()).resolves.toBeUndefined();
    expect(names.getState().status).toBe("error");
    expect(names.getState().names).toEqual([]);

    await names.getState().load();
    expect(names.getState().status).toBe("ready");
    expect(endpoints.catalog.names).toHaveBeenCalledTimes(2);
  });
});

describe("lista de nombres con tipos (etapa 8)", () => {
  const TYPED: PokemonName[] = NAMES.map((name) => ({ ...name, types: ["fire", "flying"] }));

  it("sin pedirlos, la lista llega sin tipos y así queda marcada", async () => {
    const { names, endpoints } = fakeServices();
    await names.getState().load();
    expect(endpoints.catalog.names).toHaveBeenCalledExactlyOnceWith({ withTypes: false });
    expect(names.getState().withTypes).toBe(false);
  });

  it("con withTypes pide la lista con tipos y queda marcada", async () => {
    const { names, endpoints } = fakeServices();
    vi.mocked(endpoints.catalog.names).mockResolvedValueOnce(TYPED);
    await names.getState().load({ withTypes: true });
    expect(endpoints.catalog.names).toHaveBeenCalledExactlyOnceWith({ withTypes: true });
    expect(names.getState()).toMatchObject({ status: "ready", names: TYPED, withTypes: true });
  });

  it("si ya hay nombres sin tipos y se piden con tipos, vuelve a pedir y mientras tanto conserva los de antes", async () => {
    const { names, endpoints } = fakeServices();
    await names.getState().load();

    let release!: (value: PokemonName[]) => void;
    vi.mocked(endpoints.catalog.names).mockImplementationOnce(
      () =>
        new Promise<PokemonName[]>((resolve) => {
          release = resolve;
        }),
    );
    const pending = names.getState().load({ withTypes: true });
    expect(names.getState()).toMatchObject({ status: "ready", names: NAMES, withTypes: false });

    release(TYPED);
    await pending;
    expect(names.getState()).toMatchObject({ status: "ready", names: TYPED, withTypes: true });
    expect(endpoints.catalog.names).toHaveBeenCalledTimes(2);
  });

  it("con los tipos ya cargados, pedir sin tipos no descarga de nuevo ni los pierde", async () => {
    const { names, endpoints } = fakeServices();
    vi.mocked(endpoints.catalog.names).mockResolvedValueOnce(TYPED);
    await names.getState().load({ withTypes: true });
    await names.getState().load();
    await names.getState().load({ withTypes: true });
    expect(endpoints.catalog.names).toHaveBeenCalledTimes(1);
    expect(names.getState()).toMatchObject({ names: TYPED, withTypes: true });
  });

  it("si la descarga con tipos falla, conserva la lista sin tipos (sigue lista) y se puede reintentar", async () => {
    const { names, endpoints } = fakeServices();
    await names.getState().load();
    vi.mocked(endpoints.catalog.names).mockRejectedValueOnce(new ApiError(0, "NETWORK"));
    await expect(names.getState().load({ withTypes: true })).resolves.toBeUndefined();
    expect(names.getState()).toMatchObject({ status: "ready", names: NAMES, withTypes: false });

    vi.mocked(endpoints.catalog.names).mockResolvedValueOnce(TYPED);
    await names.getState().load({ withTypes: true });
    expect(names.getState()).toMatchObject({ status: "ready", names: TYPED, withTypes: true });
    expect(endpoints.catalog.names).toHaveBeenCalledTimes(3);
  });

  it("si la primera descarga ya es con tipos y falla, queda en error y reintenta con tipos", async () => {
    const { names, endpoints } = fakeServices();
    vi.mocked(endpoints.catalog.names).mockRejectedValueOnce(new ApiError(0, "NETWORK"));
    await names.getState().load({ withTypes: true });
    expect(names.getState()).toMatchObject({ status: "error", names: [] });

    vi.mocked(endpoints.catalog.names).mockResolvedValueOnce(TYPED);
    await names.getState().load({ withTypes: true });
    expect(names.getState()).toMatchObject({ status: "ready", names: TYPED, withTypes: true });
  });

  it("dos pedidos a la vez (sin tipos y con tipos) terminan con la lista con tipos, aunque la otra tarde más", async () => {
    const { names, endpoints } = fakeServices();
    vi.mocked(endpoints.catalog.names).mockImplementation(async (options) => {
      if (options?.withTypes) return TYPED;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return NAMES;
    });
    await Promise.all([names.getState().load(), names.getState().load({ withTypes: true })]);
    expect(names.getState()).toMatchObject({ status: "ready", names: TYPED, withTypes: true });
  });
});
