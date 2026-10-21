import { describe, expect, it, vi } from "vitest";
import { GameClient } from "../../src/game/game-client";
import { createGameStore } from "../../src/game/store";
import { SERVER_NOW, event } from "../helpers/events";
import { FakeSocket } from "../helpers/fake-socket";

function setup(options: { refreshSession?: () => Promise<unknown> } = {}) {
  const onSessionLost = vi.fn();
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
    onSessionLost,
    now: () => SERVER_NOW + 1000,
  });
  return { client, store, sockets, refreshSession, onSessionLost, socket: () => sockets[0]! };
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

  it("entrega los catorce eventos del servidor", () => {
    const { client, store, socket } = setup();
    client.join("ABC234");
    const received: string[] = [];
    const original = store.getState().receive;
    store.setState({ receive: (e, at) => { received.push(e.name); original(e, at); } });
    const all = [
      event.roomState(), event.playerJoined("misty"), event.gameStarting(SERVER_NOW + 5000), event.chooseTypes(1, SERVER_NOW + 15_000),
      event.typeReceived(1), event.roundStarted(1, SERVER_NOW + 15_000), event.answerReceived(1), event.roundResult(),
      event.gameEnded(), event.opponentDisconnected(SERVER_NOW + 30_000), event.opponentReconnected(), event.error("RATE_LIMITED"),
      event.rematchState(), event.rematchRoom("ABC999"),
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

  it("requestRematch y cancelRematch emiten rematch-request y rematch-cancel", () => {
    const { client, socket } = setup();
    client.join("ABC234");
    socket().serverConnects();
    client.requestRematch();
    client.cancelRematch();
    expect(socket().emitted.map((e) => e.event).filter((name) => name.startsWith("rematch"))).toEqual(["rematch-request", "rematch-cancel"]);
  });

  it("antes de entrar a una sala las acciones no hacen nada ni fallan", () => {
    const { client, sockets } = setup();
    expect(() => {
      client.chooseType("fire");
      client.submit("Alfa");
      client.leave();
      client.requestRematch();
      client.cancelRematch();
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

describe("conexión cerrada por el servidor y partida terminada", () => {
  it("si el servidor cierra la conexión (la partida se abrió en otra pestaña) lo marca como reemplazada", () => {
    const { client, store, socket } = setup();
    client.join("ABC234");
    socket().serverConnects();
    socket().serverDrops("io server disconnect");
    expect(store.getState().connection).toBe("replaced");
  });

  it("una caída normal sigue siendo una desconexión que se reintenta sola", () => {
    const { client, store, socket } = setup();
    client.join("ABC234");
    socket().serverConnects();
    socket().serverDrops("transport close");
    expect(store.getState().connection).toBe("disconnected");
  });

  it("jugar aquí otra vez vuelve a conectar y a entrar a la sala", () => {
    const { client, store, socket } = setup();
    client.join("ABC234");
    socket().serverConnects();
    socket().serverDrops("io server disconnect");
    client.join("ABC234");
    expect(store.getState().connection).toBe("connecting");
    expect(socket().connectCalls).toBe(2);
    socket().serverConnects();
    expect(socket().sent("join-room")).toEqual([{ code: "ABC234" }, { code: "ABC234" }]);
  });

  it("una vez terminada la partida, una reconexión no vuelve a entrar a la sala (así no se pierde el resumen)", () => {
    const { client, store, socket } = setup();
    client.join("ABC234");
    socket().serverConnects();
    socket().trigger("room-state", event.roomState({ phase: "round_result" }).payload);
    socket().trigger("game-ended", event.gameEnded().payload);
    expect(store.getState().view.phase).toBe("finished");

    socket().serverDrops();
    socket().serverConnects();
    expect(socket().sent("join-room")).toEqual([{ code: "ABC234" }]);
    expect(store.getState().view.phase).toBe("finished");
  });
});

describe("reconexión con una oferta de revancha", () => {
  function finishedWith(status: "open" | "mine" | "theirs" | "starting" | "closed") {
    const ctx = setup();
    ctx.client.join("ABC234");
    ctx.socket().serverConnects();
    ctx.socket().trigger("room-state", event.roomState({ phase: "round_result" }).payload);
    ctx.socket().trigger("game-ended", event.gameEnded().payload);
    ctx.socket().trigger("rematch-state", event.rematchState({ status }).payload);
    return ctx;
  }

  it.each(["open", "mine", "theirs"] as const)("al reconectar con el resumen visible y la oferta %s vuelve a entrar a la sala", (status) => {
    const { socket } = finishedWith(status);
    socket().serverDrops();
    socket().serverConnects();
    expect(socket().sent("join-room")).toEqual([{ code: "ABC234" }, { code: "ABC234" }]);
  });

  it.each(["starting", "closed"] as const)("con la oferta %s no vuelve a entrar (la sala vieja ya no importa)", (status) => {
    const { socket } = finishedWith(status);
    socket().serverDrops();
    socket().serverConnects();
    expect(socket().sent("join-room")).toEqual([{ code: "ABC234" }]);
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

  it("si no se puede renovar la sesión, avisa de que se perdió para volver a /login", async () => {
    const { client, socket, onSessionLost } = setup({ refreshSession: async () => null });
    client.join("ABC234");
    socket().trigger("connect_error", unauthorized());
    await vi.waitFor(() => expect(onSessionLost).toHaveBeenCalledTimes(1));
  });

  it("si la renovación sí funciona, no avisa de ninguna pérdida", async () => {
    const { client, socket, onSessionLost } = setup();
    client.join("ABC234");
    socket().trigger("connect_error", unauthorized());
    await vi.waitFor(() => expect(socket().connectCalls).toBe(2));
    expect(onSessionLost).not.toHaveBeenCalled();
  });

  it("otros errores de conexión solo marcan la conexión como caída", () => {
    const { client, store, socket, refreshSession } = setup();
    client.join("ABC234");
    socket().trigger("connect_error", new Error("xhr poll error"));
    expect(store.getState().connection).toBe("disconnected");
    expect(refreshSession).not.toHaveBeenCalled();
  });
});
