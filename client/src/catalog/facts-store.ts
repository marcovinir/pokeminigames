import type { PokemonFact } from "@pokemon-minigames/shared";
import { type StoreApi, createStore } from "zustand";
import type { Endpoints } from "../api/endpoints";

export interface FactsState {
  status: "idle" | "loading" | "ready" | "error";
  facts: PokemonFact[];
  /** Descarga los datos curiosos. Solo lo hace una vez (salvo que falle); sin ellos la pantalla de espera sigue igual de útil. */
  load(): Promise<void>;
}

export function createFactsStore(endpoints: Endpoints): StoreApi<FactsState> {
  let inflight: Promise<void> | null = null;

  return createStore<FactsState>((set, get) => ({
    status: "idle",
    facts: [],
    load() {
      if (get().status === "ready") return Promise.resolve();
      if (inflight) return inflight;
      set({ status: "loading" });
      inflight = (async () => {
        try {
          set({ status: "ready", facts: await endpoints.catalog.facts() });
        } catch {
          set({ status: "error" });
        } finally {
          inflight = null;
        }
      })();
      return inflight;
    },
  }));
}
