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

export function createGameStore(): StoreApi<GameStoreState> {
  return createStore<GameStoreState>((set) => ({
    view: initialGameView,
    connection: "idle",
    receive: (event, receivedAt) => set((state) => ({ view: applyServerEvent(state.view, event, receivedAt) })),
    setConnection: (connection) => set({ connection }),
    clearError: () => set((state) => ({ view: { ...state.view, lastError: null } })),
    reset: () => set({ view: initialGameView, connection: "idle" }),
  }));
}
