import { describe, expect, it } from "vitest";
import { initialGameView } from "../../src/game/apply-event";
import { createGameStore } from "../../src/game/store";
import { SERVER_NOW, event } from "../helpers/events";

describe("createGameStore", () => {
  it("empieza vacío y sin conexión", () => {
    const state = createGameStore().getState();
    expect(state.view).toEqual(initialGameView);
    expect(state.connection).toBe("idle");
  });

  it("receive aplica el evento al estado", () => {
    const store = createGameStore();
    store.getState().receive(event.roomState({ phase: "waiting" }), SERVER_NOW);
    expect(store.getState().view.phase).toBe("waiting");
  });

  it("notifica a quien se suscribe cuando cambia el estado", () => {
    const store = createGameStore();
    const seen: Array<string | null> = [];
    store.subscribe((state) => seen.push(state.view.phase));
    store.getState().receive(event.roomState({ phase: "waiting" }), SERVER_NOW);
    store.getState().receive(event.gameStarting(SERVER_NOW + 5000), SERVER_NOW);
    expect(seen).toEqual(["waiting", "starting"]);
  });

  it("setConnection cambia solo la conexión", () => {
    const store = createGameStore();
    store.getState().receive(event.roomState(), SERVER_NOW);
    store.getState().setConnection("connected");
    expect(store.getState().connection).toBe("connected");
    expect(store.getState().view.code).toBe("ABC234");
  });

  it("clearError borra solo el último error", () => {
    const store = createGameStore();
    store.getState().receive(event.roomState(), SERVER_NOW);
    store.getState().receive(event.error("RATE_LIMITED"), SERVER_NOW);
    expect(store.getState().view.lastError?.code).toBe("RATE_LIMITED");
    store.getState().clearError();
    expect(store.getState().view.lastError).toBeNull();
    expect(store.getState().view.code).toBe("ABC234");
  });

  it("reset vuelve al estado inicial", () => {
    const store = createGameStore();
    store.getState().receive(event.roomState(), SERVER_NOW);
    store.getState().setConnection("connected");
    store.getState().reset();
    expect(store.getState().view).toEqual(initialGameView);
    expect(store.getState().connection).toBe("idle");
  });
});
