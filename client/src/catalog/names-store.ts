import { type StoreApi, createStore } from "zustand";
import type { Endpoints } from "../api/endpoints";
import type { PokemonName } from "../api/types";

export interface LoadNamesOptions {
  /** Pide también los tipos de cada Pokémon: solo lo necesitan las salas con «Pistas de tipos». */
  withTypes?: boolean;
}

export interface NamesState {
  status: "idle" | "loading" | "ready" | "error";
  names: PokemonName[];
  /** La lista que hay ya trae los tipos de cada Pokémon. */
  withTypes: boolean;
  /**
   * Descarga la lista de nombres para el autocompletado. Solo lo hace una vez (salvo que falle), con una excepción: si ya
   * hay una lista sin tipos y ahora se piden con tipos, vuelve a descargarla (la de antes sigue sirviendo mientras tanto).
   */
  load(options?: LoadNamesOptions): Promise<void>;
}

export function createNamesStore(endpoints: Endpoints): StoreApi<NamesState> {
  // La descarga en curso y si pide tipos: permite unir pedidos iguales (o ya cubiertos) en una sola.
  let inflight: { withTypes: boolean; promise: Promise<void> } | null = null;

  return createStore<NamesState>((set, get) => ({
    status: "idle",
    names: [],
    withTypes: false,
    load({ withTypes = false } = {}) {
      const state = get();
      if (state.status === "ready" && (state.withTypes || !withTypes)) return Promise.resolve();
      if (inflight && (inflight.withTypes || !withTypes)) return inflight.promise;

      // Con una lista ya cargada se sigue usando (y el estado sigue «listo») mientras llegan los tipos.
      if (state.status !== "ready") set({ status: "loading" });
      const entry = { withTypes, promise: Promise.resolve() };
      inflight = entry;
      entry.promise = (async () => {
        try {
          const names = await endpoints.catalog.names({ withTypes });
          // Una respuesta sin tipos que llega tarde nunca pisa una lista que ya los trae.
          if (withTypes || !get().withTypes) set({ status: "ready", names, withTypes });
        } catch {
          // Sin la lista el campo sigue funcionando, solo que sin sugerencias; se puede reintentar.
          if (get().status !== "ready") set({ status: "error" });
        } finally {
          if (inflight === entry) inflight = null;
        }
      })();
      return entry.promise;
    },
  }));
}
