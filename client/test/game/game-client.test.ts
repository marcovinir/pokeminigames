import { describe, expect, it, vi } from "vitest";
import { GameClient } from "../../src/game/game-client";
import { createGameStore } from "../../src/game/store";
import { SERVER_NOW, event } from "../helpers/events";
import { FakeSocket } from "../helpers/fake-socket";

function setup(options: { refreshSession?: () => Promise<unknown> } = {}) {
  const sockets: FakeSocket[] = [];
  const store = createGameStore();
  const refreshSession = vi.fn(options.refreshSession ?? (async () => ({ accessToken: "nuevo" })));
  const client = new GameClient({
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    store,
    refreshSession,
    now: () => SERVER_NOW + 1000,
  });
  return { client, store, sockets, refreshSession, socket: () => sockets[0]! };
}

describe("GameClient.join", () => {
  it("crea el socket, lo conecta y, al conectar, entra a la sala", () => {
    const { client, store, socket } = setup();
    client.join("ABC234");
    expect(store.getState().connection).toBe("connecting");
    expect(socket().connectCalls).toBe(1);
    expect(socket().sent("join-room")).toEqual([]); // todavía no hay conexión

    socket().serverConnects();
    expect(store.getState().connection).toBe("connected");
    expect(socket().sent("join-room")).toEqual([{ code: "ABC234" }]);
  });

  it("al reconectar vuelve a entrar a la sala sin que nadie lo pida", () => {
    const { client, store, socket } = setup();
    client.join("ABC234");
    socket().serverConnects();
    socket().serverDrops();
    expect(store.getState().connection).toBe("disconnected");

    socket().serverConnects();
    expect(socket().sent("join-room")).toEqual([{ code: "ABC234" }, { code: "ABC234" }]);
    expect(store.getState().connection).toBe("connected");
  });

  it("si el socket ya está conectado entra a la otra sala de inmediato y reinicia el estado", () => {
    const { client, store, sockets, socket } = setup();
    client.join("ABC234");
    socket().serverConnects();
    socket().trigger("room-state", event.roomState().payload);
    expect(store.getState().view.code).toBe("ABC234");

    client.join("XYZ789");
    expect(sockets).toHaveLength(1); // reutiliza el mismo socket
    expect(socket().sent("join-room").at(-1)).toEqual({ code: "XYZ789" });
    expect(store.getState().view.code).toBeNull();
  });
});

describe("eventos del servidor", () => {
  it("cada evento llega al almacén con la hora de recepción del navegador", () => {
    const { client, store, socket } = setup();
    client.join("ABC234");
    socket().serverConnects();
    // El navegador "recibe" a SERVER_NOW + 1000; el servidor dice que son SERVER_NOW: desfase -1000.
    socket().trigger("room-state", event.roomState({ phase: "waiting" }).payload);
    expect(store.getState().view).toMatchObject({ phase: "waiting", code: "ABC234", clockOffset: -1000 });
  });

  it("entrega los doce eventos del servidor", () => {
    const { client, store, socket } = setup();
    client.join("ABC234");
    const received: string[] = [];
    const original = store.getState().receive;
    store.setState({ receive: (e, at) => { received.push(e.name); original(e, at); } });
    const all = [
      event.roomState(), event.playerJoined("misty"), event.gameStarting(SERVER_NOW + 5000), event.chooseTypes(1, SERVER_NOW + 15_000),
      event.typeReceived(1), event.roundStarted(1, SERVER_NOW + 15_000), event.answerReceived(1), event.roundResult(),
      event.gameEnded(), event.opponentDisconnected(SERVER_NOW + 30_000), event.opponentReconnected(), event.error("RATE_LIMITED"),
    ];
    for (const e of all) socket().trigger(e.name, e.payload);
    expect(received).toEqual(all.map((e) => e.name));
  });

  it("un socket descartado con dispose ya no actualiza el estado", () => {
    const { client, store, socket } = setup();
    client.join("ABC234");
    const old = socket();
    client.dispose();
    old.trigger("room-state", event.roomState().payload);
    old.serverDrops();
    expect(store.getState().view.code).toBeNull();
    expect(store.getState().connection).toBe("idle");
  });
});

describe("acciones del jugador", () => {
  it("chooseType, submit y leave envían sus eventos", () => {
    const { client, socket } = setup();
    client.join("ABC234");
    socket().serverConnects();
    client.chooseType("fire");
    client.submit("Alfa");
    client.leave();
    expect(socket().sent("choose-type")).toEqual([{ type: "fire" }]);
    expect(socket().sent("submit-pokemon")).toEqual([{ text: "Alfa" }]);
    expect(socket().emitted.some((e) => e.event === "leave-room")).toBe(true);
  });

  it("antes de entrar a una sala las acciones no hacen nada ni fallan", () => {
    const { client, sockets } = setup();
    expect(() => {
      client.chooseType("fire");
      client.submit("Alfa");
      client.leave();
    }).not.toThrow();
    expect(sockets).toHaveLength(0);
  });

  it("dispose desconecta el socket y deja el estado limpio", () => {
    const { client, store, socket } = setup();
    client.join("ABC234");
    socket().serverConnects();
    socket().trigger("room-state", event.roomState().payload);
    client.dispose();
    expect(socket().disconnectCalls).toBe(1);
    expect(store.getState().view.phase).toBeNull();
    // Y una acción posterior ya no sale a ningún socket.
    client.submit("Alfa");
    expect(socket().sent("submit-pokemon")).toEqual([]);
  });
});

describe("token del socket caducado", () => {
  const unauthorized = () => Object.assign(new Error("UNAUTHORIZED"));

  it("renueva la sesión y reintenta conectar una sola vez", async () => {
    const { client, socket, refreshSession } = setup();
    client.join("ABC234");
    expect(socket().connectCalls).toBe(1);
    socket().trigger("connect_error", unauthorized());
    await vi.waitFor(() => expect(socket().connectCalls).toBe(2));
    expect(refreshSession).toHaveBeenCalledTimes(1);

    // Si vuelve a fallar sin haber conectado, no se insiste en bucle.
    socket().trigger("connect_error", unauthorized());
    await Promise.resolve();
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(socket().connectCalls).toBe(2);
  });

  it("tras conectar con éxito, un nuevo rechazo puede volver a intentar la renovación", async () => {
    const { client, socket, refreshSession } = setup();
    client.join("ABC234");
    socket().trigger("connect_error", unauthorized());
    await vi.waitFor(() => expect(socket().connectCalls).toBe(2));
    socket().serverConnects();
    socket().serverDrops();
    socket().trigger("connect_error", unauthorized());
    await vi.waitFor(() => expect(refreshSession).toHaveBeenCalledTimes(2));
  });

  it("si no se puede renovar la sesión no se reconecta", async () => {
    const { client, socket, refreshSession } = setup({ refreshSession: async () => null });
    client.join("ABC234");
    socket().trigger("connect_error", unauthorized());
    await vi.waitFor(() => expect(refreshSession).toHaveBeenCalled());
    await Promise.resolve();
    expect(socket().connectCalls).toBe(1);
  });

  it("otros errores de conexión solo marcan la conexión como caída", () => {
    const { client, store, socket, refreshSession } = setup();
    client.join("ABC234");
    socket().trigger("connect_error", new Error("xhr poll error"));
    expect(store.getState().connection).toBe("disconnected");
    expect(refreshSession).not.toHaveBeenCalled();
  });
});
