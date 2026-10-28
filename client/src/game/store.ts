import type { ServerEvent } from "@pokemon-minigames/shared";
import { type StoreApi, createStore } from "zustand";
import { type GameView, applyServerEvent, initialGameView } from "./apply-event";

/** `replaced`: el servidor cerró esta conexión porque la partida se abrió en otra pestaña (no se reconecta sola). */
export type ConnectionStatus = "idle" | "connecting" | "connected" | "disconnected" | "replaced";

export interface GameStoreState {
  view: GameView;
  connection: ConnectionStatus;
  /** Aplica un evento del servidor; `receivedAt` es la hora del navegador al recibirlo. */
  receive(event: ServerEvent, receivedAt: number): void;
  setConnection(connection: ConnectionStatus): void;
  clearError(): void;
  /** Vuelve al estado inicial (al entrar a otra sala o al salir). */
  reset(): void;
}

export interface GameStoreOptions {
  /** Se llama tras aplicar cada evento, con la vista de antes y la de después (así suenan los efectos). */
  onEvent?(before: GameView, event: ServerEvent, after: GameView): void;
}

export function createGameStore(options: GameStoreOptions = {}): StoreApi<GameStoreState> {
  return createStore<GameStoreState>((set, get) => ({
    view: initialGameView,
    connection: "idle",
    receive: (event, receivedAt) => {
      const before = get().view;
      const after = applyServerEvent(before, event, receivedAt);
      set({ view: after });
      options.onEvent?.(before, event, after);
    },
    setConnection: (connection) => set({ connection }),
    clearError: () => set((state) => ({ view: { ...state.view, lastError: null } })),
    reset: () => set({ view: initialGameView, connection: "idle" }),
  }));
}
