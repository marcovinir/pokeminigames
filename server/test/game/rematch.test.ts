import type { RematchRecord, RematchState, RoomConfig, Seat } from "@pokemon-minigames/shared";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../src/http/errors.js";
import { type RematchDeps, type RematchPlayer, RematchCoordinator } from "../../src/game/rematch.js";
import { FakeTime, RecordingBroadcaster } from "./fakes.js";

const START = 1_000_000;
const MINUTE = 60_000;
const players: Record<Seat, RematchPlayer> = {
  1: { userId: "u1", username: "ash", isGuest: false, avatarId: null },
  2: { userId: "u2", username: "misty", isGuest: false, avatarId: null },
};
const config: RoomConfig = { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null, typeHints: true };
const record: RematchRecord = { mine: 3, theirs: 2, draws: 0, played: 5, recent: ["won", "lost", "won"] };

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function setup(options: { record?: Promise<RematchRecord | null> | null; createRoom?: RematchDeps["createRoom"] } = {}) {
  const time = new FakeTime(START);
  const broadcaster = new RecordingBroadcaster();
  const released: string[] = [];
  const createRoom = vi.fn(options.createRoom ?? (async () => ({ code: "NEW111" })));
  const cancelRoom = vi.fn();
  const logger = { error: vi.fn() };
  const coordinator = new RematchCoordinator({ clock: time, scheduler: time, broadcaster, release: (code) => released.push(code), createRoom, cancelRoom, logger });
  coordinator.open({ code: "OLD111", players, config, record: options.record ?? null });
  const states = (seat: Seat): RematchState[] => broadcaster.sent.filter((s) => s.to === seat && s.event.name === "rematch-state").map((s) => s.event.payload as RematchState);
  const last = (seat: Seat): RematchState => states(seat).at(-1)!;
  const rooms = (seat: Seat): string[] => broadcaster.sent.filter((s) => s.to === seat && s.event.name === "rematch-room").map((s) => (s.event.payload as { code: string }).code);
  return { time, broadcaster, released, createRoom, cancelRoom, logger, coordinator, states, last, rooms };
}

describe("RematchCoordinator: abrir y pedir", () => {
  it("open envía open a los dos asientos con el tope de 5 min y sin récord", () => {
    const { last, coordinator } = setup();
    for (const seat of [1, 2] as const) {
      expect(last(seat)).toEqual({ serverNow: START, status: "open", deadline: START + 5 * MINUTE });
    }
    expect(coordinator.has("OLD111")).toBe(true);
  });

  it("pide el asiento 1: ve mine y el 2 ve theirs, con plazo de 60 s desde esa petición", () => {
    const { time, coordinator, last } = setup();
    time.advance(3000);
    coordinator.request("OLD111", 1);
    expect(last(1)).toMatchObject({ status: "mine", deadline: START + 3000 + 60_000 });
    expect(last(2)).toMatchObject({ status: "theirs", deadline: START + 3000 + 60_000 });
  });

  it("los dos piden: createRoom se llama una vez con los jugadores y la configuración, los dos reciben rematch-room y la oferta se cierra y libera la sala", async () => {
    const { time, coordinator, createRoom, last, rooms, released } = setup();
    coordinator.request("OLD111", 1);
    coordinator.request("OLD111", 2);
    expect(last(1).status).toBe("starting");
    expect(last(2).status).toBe("starting");
    await flush();
    expect(createRoom).toHaveBeenCalledTimes(1);
    expect(createRoom).toHaveBeenCalledWith({ players, config });
    expect(rooms(1)).toEqual(["NEW111"]);
    expect(rooms(2)).toEqual(["NEW111"]);
    expect(released).toEqual(["OLD111"]);
    expect(coordinator.has("OLD111")).toBe(false);
    // Solo queda el aviso de redirección de la sala vieja (30 s): luego no queda nada.
    expect(time.pendingCount).toBe(1);
    time.advance(30_000);
    expect(time.pendingCount).toBe(0);
  });

  it("tras crear la sala, forwardFor(código viejo) da el código nuevo a esas dos personas durante 30 s, y a nadie más", async () => {
    const { time, coordinator } = setup();
    coordinator.request("OLD111", 1);
    coordinator.request("OLD111", 2);
    await flush();
    expect(coordinator.forwardFor("OLD111", "u1")).toBe("NEW111");
    expect(coordinator.forwardFor(" old111 ", "u2")).toBe("NEW111");
    expect(coordinator.forwardFor("OLD111", "u9")).toBeNull();
    expect(coordinator.forwardFor("OTRA", "u1")).toBeNull();
    time.advance(30_000);
    expect(coordinator.forwardFor("OLD111", "u1")).toBeNull();
  });

  it("salir mientras se crea la sala: la sala nueva se cancela, nadie recibe rematch-room y el otro ve «se fue»", async () => {
    let resolve!: (value: { code: string }) => void;
    const pending = new Promise<{ code: string }>((r) => (resolve = r));
    const { coordinator, cancelRoom, last, rooms, released, time } = setup({ createRoom: () => pending });
    coordinator.request("OLD111", 1);
    coordinator.request("OLD111", 2);
    coordinator.leave("OLD111", 1);
    resolve({ code: "NEW111" });
    await flush();
    expect(cancelRoom).toHaveBeenCalledWith("NEW111");
    expect(rooms(1)).toEqual([]);
    expect(rooms(2)).toEqual([]);
    expect(last(2)).toMatchObject({ status: "closed", closedReason: "left" });
    expect(released).toEqual(["OLD111"]);
    expect(coordinator.forwardFor("OLD111", "u2")).toBeNull();
    expect(time.pendingCount).toBe(0);
  });

  it("dos request del mismo asiento no crean nada ni repiten el aviso", () => {
    const { coordinator, createRoom, states } = setup();
    coordinator.request("OLD111", 1);
    const before = states(2).length;
    coordinator.request("OLD111", 1);
    expect(createRoom).not.toHaveBeenCalled();
    expect(states(2)).toHaveLength(before);
  });

  it("dos request de asientos distintos antes de que createRoom responda crean una sola sala", async () => {
    let resolve!: (value: { code: string }) => void;
    const pending = new Promise<{ code: string }>((r) => (resolve = r));
    const { coordinator, createRoom, rooms } = setup({ createRoom: () => pending });
    coordinator.request("OLD111", 1);
    coordinator.request("OLD111", 2);
    coordinator.request("OLD111", 2);
    coordinator.request("OLD111", 1);
    coordinator.cancel("OLD111", 1); // en plena creación ya no se cancela (salir sí: ver «salir mientras se crea la sala»)
    expect(createRoom).toHaveBeenCalledTimes(1);
    resolve({ code: "NEW111" });
    await flush();
    expect(rooms(1)).toEqual(["NEW111"]);
    expect(rooms(2)).toEqual(["NEW111"]);
  });
});

describe("RematchCoordinator: cancelar, salir y los relojes", () => {
  it("cancelar quien pidió: el otro ve closed/declined y quien canceló closed/self; rechazar quien recibió, igual", () => {
    const first = setup();
    first.coordinator.request("OLD111", 1);
    first.coordinator.cancel("OLD111", 1);
    expect(first.last(2)).toMatchObject({ status: "closed", closedReason: "declined", deadline: null });
    expect(first.last(1)).toMatchObject({ status: "closed", closedReason: "self" });
    expect(first.released).toEqual(["OLD111"]);

    const second = setup();
    second.coordinator.request("OLD111", 1);
    second.coordinator.cancel("OLD111", 2);
    expect(second.last(1)).toMatchObject({ status: "closed", closedReason: "declined" });
    expect(second.last(2)).toMatchObject({ status: "closed", closedReason: "self" });
  });

  it("cancelar sin petición no hace nada", () => {
    const { coordinator, states, released } = setup();
    coordinator.cancel("OLD111", 1);
    expect(states(1)).toHaveLength(1);
    expect(states(2)).toHaveLength(1);
    expect(released).toEqual([]);
    expect(coordinator.has("OLD111")).toBe(true);
  });

  it("salir con o sin petición: el otro ve closed/left y quien se va no recibe nada más", () => {
    const quiet = setup();
    quiet.coordinator.leave("OLD111", 2);
    expect(quiet.last(1)).toMatchObject({ status: "closed", closedReason: "left" });
    expect(quiet.states(2)).toHaveLength(1);
    expect(quiet.released).toEqual(["OLD111"]);

    const asked = setup();
    asked.coordinator.request("OLD111", 1);
    asked.coordinator.leave("OLD111", 1);
    expect(asked.last(2)).toMatchObject({ status: "closed", closedReason: "left" });
    expect(asked.states(1).at(-1)!.status).toBe("mine");
  });

  it("a los 60 s de la primera petición se cierra con timeout para los dos; a los 59,999 s sigue abierta", () => {
    const { time, coordinator, last, released } = setup();
    coordinator.request("OLD111", 1);
    time.advance(59_999);
    expect(last(2).status).toBe("theirs");
    time.advance(1);
    for (const seat of [1, 2] as const) expect(last(seat)).toMatchObject({ status: "closed", closedReason: "timeout" });
    expect(released).toEqual(["OLD111"]);
    expect(time.pendingCount).toBe(0);
  });

  it("a los 5 min sin petición se cierra con unavailable y se libera la sala; pedir antes del tope deja de contar el tope", () => {
    const expired = setup();
    expired.time.advance(5 * MINUTE - 1);
    expect(expired.last(1).status).toBe("open");
    expired.time.advance(1);
    for (const seat of [1, 2] as const) expect(expired.last(seat)).toMatchObject({ status: "closed", closedReason: "unavailable" });
    expect(expired.released).toEqual(["OLD111"]);
    expect(expired.time.pendingCount).toBe(0);

    const late = setup();
    late.time.advance(4 * MINUTE + 59_000);
    late.coordinator.request("OLD111", 1);
    late.time.advance(2000); // ya pasó el minuto 5: el tope no manda, el plazo de responder sí
    expect(late.last(2).status).toBe("theirs");
    late.time.advance(58_000);
    expect(late.last(2)).toMatchObject({ status: "closed", closedReason: "timeout" });
  });
});

describe("RematchCoordinator: reconexión", () => {
  it("una desconexión que vuelve antes de 10 s no cambia nada y a los 10 s sin volver cuenta como salir", () => {
    const back = setup();
    back.coordinator.disconnected("OLD111", 1);
    back.time.advance(9_999);
    back.coordinator.reconnected("OLD111", 1);
    back.time.advance(60_000);
    expect(back.last(2).status).toBe("open");
    expect(back.coordinator.has("OLD111")).toBe(true);

    const gone = setup();
    gone.coordinator.disconnected("OLD111", 1);
    gone.time.advance(10_000);
    expect(gone.last(2)).toMatchObject({ status: "closed", closedReason: "left" });
    expect(gone.released).toEqual(["OLD111"]);
  });

  it("reconnected reenvía el estado vigente a ese asiento y stateFor lo devuelve", () => {
    const { coordinator, states, last } = setup();
    coordinator.request("OLD111", 2);
    const before = states(1).length;
    coordinator.disconnected("OLD111", 1);
    coordinator.reconnected("OLD111", 1);
    expect(states(1)).toHaveLength(before + 1);
    expect(last(1)).toMatchObject({ status: "theirs" });
    expect(coordinator.stateFor("OLD111", 1)).toMatchObject({ status: "theirs" });
    expect(coordinator.stateFor("OTRA", 1)).toBeNull();
  });
});

describe("RematchCoordinator: la sala nueva falla", () => {
  it("ALREADY_IN_GAME de un asiento cierra con left para el otro; quien ya estaba en otra sala recibe unavailable (su pestaña vieja no se queda en «¡Revancha!»)", async () => {
    const { coordinator, last, states, released, time } = setup({
      createRoom: async () => {
        throw new AppError(409, "ALREADY_IN_GAME", "Ya estás en una partida activa", { seat: 2 });
      },
    });
    coordinator.request("OLD111", 1);
    coordinator.request("OLD111", 2);
    await flush();
    expect(last(1)).toMatchObject({ status: "closed", closedReason: "left" });
    expect(states(2).at(-1)).toMatchObject({ status: "closed", closedReason: "unavailable" });
    expect(released).toEqual(["OLD111"]);
    expect(time.pendingCount).toBe(0);
  });

  it("cualquier otro error cierra con failed para los dos, lo registra y libera la sala", async () => {
    const { coordinator, last, logger, released } = setup({
      createRoom: async () => {
        throw new Error("base de datos caída");
      },
    });
    coordinator.request("OLD111", 1);
    coordinator.request("OLD111", 2);
    await flush();
    for (const seat of [1, 2] as const) expect(last(seat)).toMatchObject({ status: "closed", closedReason: "failed" });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(released).toEqual(["OLD111"]);
  });
});

describe("RematchCoordinator: el récord", () => {
  it("el récord llega después: el estado se reenvía con el récord visto desde cada asiento", async () => {
    let resolve!: (value: RematchRecord | null) => void;
    const { last, states } = setup({ record: new Promise<RematchRecord | null>((r) => (resolve = r)) });
    expect("record" in last(1)).toBe(false);
    resolve(record);
    await flush();
    expect(states(1)).toHaveLength(2);
    expect(last(1).record).toEqual(record);
    expect(last(2).record).toEqual({ mine: 2, theirs: 3, draws: 0, played: 5, recent: ["lost", "won", "lost"] });
  });

  it("si la promesa del récord rechaza o da null se sigue sin él (y el rechazo se registra)", async () => {
    const failing = setup({ record: Promise.reject(new Error("sin base de datos")) });
    await flush();
    expect("record" in failing.last(1)).toBe(false);
    expect(failing.states(1)).toHaveLength(1);
    expect(failing.logger.error).toHaveBeenCalledTimes(1);

    const none = setup({ record: Promise.resolve(null) });
    await flush();
    expect(none.states(1)).toHaveLength(1);
  });

  it("un récord que llega cuando la oferta ya se cerró no envía nada", async () => {
    let resolve!: (value: RematchRecord | null) => void;
    const { coordinator, states } = setup({ record: new Promise<RematchRecord | null>((r) => (resolve = r)) });
    coordinator.leave("OLD111", 2);
    const before = states(1).length;
    resolve(record);
    await flush();
    expect(states(1)).toHaveLength(before);
  });
});

describe("RematchCoordinator: limpieza", () => {
  it("tras cualquier cierre no queda ningún temporizador y request, cancel, leave y disconnected no hacen nada", () => {
    const { coordinator, time, createRoom, broadcaster } = setup();
    coordinator.disconnected("OLD111", 1);
    coordinator.request("OLD111", 2);
    coordinator.cancel("OLD111", 2);
    expect(time.pendingCount).toBe(0);
    const sent = broadcaster.sent.length;
    coordinator.request("OLD111", 1);
    coordinator.request("OLD111", 2);
    coordinator.cancel("OLD111", 1);
    coordinator.leave("OLD111", 1);
    coordinator.disconnected("OLD111", 2);
    coordinator.reconnected("OLD111", 2);
    expect(broadcaster.sent).toHaveLength(sent);
    expect(createRoom).not.toHaveBeenCalled();
    expect(coordinator.has("OLD111")).toBe(false);
    expect(coordinator.stateFor("OLD111", 1)).toBeNull();
  });
});
