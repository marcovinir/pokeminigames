import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/client";
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
