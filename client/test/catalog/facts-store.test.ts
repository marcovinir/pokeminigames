import { describe, expect, it, vi } from "vitest";
import type { Endpoints } from "../../src/api/endpoints";
import { createFactsStore } from "../../src/catalog/facts-store";
import { FACTS } from "../helpers/services";

const endpointsWith = (facts: Endpoints["catalog"]["facts"]) => ({ catalog: { facts } }) as unknown as Endpoints;

describe("almacén de datos curiosos", () => {
  it("empieza vacío, carga una sola vez aunque se pida varias y queda listo", async () => {
    const facts = vi.fn(async () => FACTS);
    const store = createFactsStore(endpointsWith(facts));
    expect(store.getState()).toMatchObject({ status: "idle", facts: [] });
    await Promise.all([store.getState().load(), store.getState().load()]);
    await store.getState().load();
    expect(facts).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({ status: "ready", facts: FACTS });
  });

  it("si falla queda en error (sin datos curiosos, sin romper nada) y se puede reintentar", async () => {
    const facts = vi.fn<Endpoints["catalog"]["facts"]>().mockRejectedValueOnce(new Error("sin red")).mockResolvedValue(FACTS);
    const store = createFactsStore(endpointsWith(facts));
    await expect(store.getState().load()).resolves.toBeUndefined();
    expect(store.getState()).toMatchObject({ status: "error", facts: [] });
    await store.getState().load();
    expect(store.getState()).toMatchObject({ status: "ready", facts: FACTS });
    expect(facts).toHaveBeenCalledTimes(2);
  });
});
