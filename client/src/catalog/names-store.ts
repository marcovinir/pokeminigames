import { type StoreApi, createStore } from "zustand";
import type { Endpoints } from "../api/endpoints";
import type { PokemonName } from "../api/types";

export interface NamesState {
  status: "idle" | "loading" | "ready" | "error";
  names: PokemonName[];
  /** Descarga la lista de nombres para el autocompletado. Solo lo hace una vez (salvo que falle). */
  load(): Promise<void>;
}

export function createNamesStore(endpoints: Endpoints): StoreApi<NamesState> {
  let loading: Promise<void> | null = null;

  return createStore<NamesState>((set, get) => ({
    status: "idle",
    names: [],
    load() {
      if (get().status === "ready") return Promise.resolve();
      loading ??= (async () => {
        set({ status: "loading" });
        try {
          set({ status: "ready", names: await endpoints.catalog.names() });
        } catch {
          // Sin la lista el campo sigue funcionando, solo que sin sugerencias; se puede reintentar.
          set({ status: "error" });
        } finally {
          loading = null;
        }
      })();
      return loading;
    },
  }));
}
