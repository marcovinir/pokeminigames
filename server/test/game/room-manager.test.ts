import type { RoomConfig } from "@pokemon-minigames/shared";
import { describe, expect, it, vi } from "vitest";
import { Prisma } from "../../src/generated/prisma/client.js";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "../../src/game/constants.js";
import { RoomManager, generateRoomCode } from "../../src/game/room-manager.js";
import { InMemoryRoomStore } from "../../src/game/room-store.js";
import { fixtureCatalog } from "../helpers/fixtures.js";
import { seededRng, sequenceRng } from "../helpers/rng.js";
import { FakeRepository, FakeTime, RecordingBroadcaster } from "./fakes.js";

const config: RoomConfig = { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null };
const ash = { userId: "u1", username: "ash", isGuest: false, avatarId: null };
const misty = { userId: "u2", username: "misty", isGuest: false, avatarId: null };
const brock = { userId: "u3", username: "brock", isGuest: false, avatarId: null };
const inv = { userId: "guest_a", username: "inv", isGuest: true, avatarId: null };

function setup(generateCode?: () => string) {
  const logger = { error: vi.fn() };
  const time = new FakeTime();
  const repository = new FakeRepository();
  const store = new InMemoryRoomStore();
  const broadcaster = new RecordingBroadcaster();
  const manager = new RoomManager({
    clock: time,
    scheduler: time,
    broadcaster,
    repository,
    catalog: fixtureCatalog(),
    rng: seededRng(7),
    store,
    generateCode,
    logger,
    persistRetryDelayMs: 0,
  });
  return { manager, time, repository, store, logger, broadcaster };
}

/** Conecta a los dos asientos, deja pasar la cuenta atrás y juega una ronda hasta el final de la partida. */
function playOneRound(room: NonNullable<ReturnType<InMemoryRoomStore["get"]>>, time: FakeTime): void {
  room.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
  room.dispatch({ type: "PLAYER_CONNECTED", seat: 2 });
  time.advance(5000);
  room.dispatch({ type: "SUBMIT", seat: 1, text: "Alfa" });
  time.advance(15_000);
}

async function rejection(promise: unknown): Promise<{ status: number; code: string }> {
  const error = await Promise.resolve(promise).then(
    () => null,
    (e: unknown) => e,
  );
  return { status: (error as { status: number }).status, code: (error as { code: string }).code };
}

function syncRejection(fn: () => unknown): { status: number; code: string } {
  try {
    fn();
  } catch (e) {
    return { status: (e as { status: number }).status, code: (e as { code: string }).code };
  }
  throw new Error("Se esperaba un error");
}

describe("generateRoomCode", () => {
  it("genera 6 caracteres del alfabeto sin confusiones (sin 0, O, 1, I, L)", () => {
    const rng = seededRng(1);
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode(rng);
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      for (const char of code) expect(ROOM_CODE_ALPHABET).toContain(char);
    }
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });
});

describe("RoomManager.createRoom", () => {
  it("crea la sala: guarda la partida, la registra y deja al creador en el asiento 1", async () => {
    const { manager, repository, store } = setup();
    const { code } = await manager.createRoom(ash, config);
    expect(code).toHaveLength(6);
    expect(repository.calls).toEqual(["createGame"]);
    expect(store.get(code)?.seatOf("u1")).toBe(1);
  });

  it("un usuario no puede crear una segunda sala mientras tenga una activa", async () => {
    const { manager } = setup();
    await manager.createRoom(ash, config);
    expect(await rejection(manager.createRoom(ash, config))).toEqual({ status: 409, code: "ALREADY_IN_GAME" });
  });

  it("dos creaciones simultáneas del mismo usuario: una gana y la otra recibe ALREADY_IN_GAME", async () => {
    const { manager, repository } = setup();
    repository.delays.createGame = 20;
    const results = await Promise.allSettled([manager.createRoom(ash, config), manager.createRoom(ash, config)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected")!;
    expect((failed.reason as { code: string }).code).toBe("ALREADY_IN_GAME");
  });

  it("si el código ya está en uso por otra sala activa, genera otro", async () => {
    const codes = ["AAAAAA", "AAAAAA", "BBBBBB"];
    const { manager, store } = setup(() => codes.shift()!);
    await manager.createRoom(ash, config);
    const second = await manager.createRoom(misty, config);
    expect(second.code).toBe("BBBBBB");
    expect(store.get("AAAAAA")?.seatOf("u1")).toBe(1);
  });

  it("si la base de datos rechaza el código por repetido (partida antigua), reintenta con otro", async () => {
    const codes = ["AAAAAA", "BBBBBB"];
    const { manager, repository } = setup(() => codes.shift()!);
    const original = repository.createGame.bind(repository);
    let first = true;
    repository.createGame = async (input) => {
      if (first) {
        first = false;
        throw new Prisma.PrismaClientKnownRequestError("duplicado", { code: "P2002", clientVersion: "test" });
      }
      return original(input);
    };
    await expect(manager.createRoom(ash, config)).resolves.toEqual({ code: "BBBBBB" });
  });

  it("propaga los errores inesperados de la base de datos y libera al usuario para reintentar", async () => {
    const { manager, repository } = setup();
    repository.failures.createGame = 1;
    await expect(manager.createRoom(ash, config)).rejects.toThrow("fallo simulado");
    await expect(manager.createRoom(ash, config)).resolves.toBeTruthy();
  });

  it("al terminar la partida la sala sale del registro y el usuario puede crear otra", async () => {
    const { manager, store, time } = setup();
    const { code } = await manager.createRoom(ash, config);
    time.advance(10 * 60 * 1000); // caduca sin que nadie se una
    expect(store.get(code)).toBeUndefined();
    await expect(manager.createRoom(ash, config)).resolves.toBeTruthy();
  });
});

describe("RoomManager con invitados", () => {
  const oneRound: RoomConfig = { typeMode: "random", lengthMode: "custom", roundsLimit: 1, statsGoal: null };

  it("una sala creada por un invitado no llama a createGame ni a ninguna escritura durante toda la partida", async () => {
    const { manager, store, repository, time } = setup();
    const { code } = await manager.createRoom(inv, oneRound);
    expect(store.get(code)?.seatOf("guest_a")).toBe(1);
    manager.joinRoom(misty, code);
    const room = store.get(code)!;
    expect(room.persisted).toBe(false);
    playOneRound(room, time);
    expect(room.phase).toBe("finished");
    await room.idle();
    expect(repository.calls).toEqual([]);
    expect(repository.timeline).toEqual([]);
  });

  it("una cuenta crea y se une un invitado: discardGame se llama una vez y, después, ni asiento, inicio, rondas ni final", async () => {
    const { manager, store, repository, time } = setup();
    const { code } = await manager.createRoom(ash, oneRound);
    expect(repository.calls).toEqual(["createGame"]);
    manager.joinRoom(inv, code);
    const room = store.get(code)!;
    playOneRound(room, time);
    expect(room.phase).toBe("finished");
    await room.idle();
    expect(repository.calls).toEqual(["createGame", "discardGame:game-1"]);
  });

  it("si el invitado se va antes de empezar y entra una cuenta, la sala sigue sin guardarse (markNotPersisted es permanente)", async () => {
    const { manager, store, repository } = setup();
    const { code } = await manager.createRoom(ash, oneRound);
    manager.joinRoom(inv, code);
    const room = store.get(code)!;
    room.dispatch({ type: "LEAVE", seat: 2 });
    expect(room.hasSeat(2)).toBe(false);
    manager.joinRoom(misty, code);
    expect(room.seatOf("u2")).toBe(2);
    expect(room.persisted).toBe(false);
    await room.idle();
    expect(repository.calls).toEqual(["createGame", "discardGame:game-1"]);
  });

  it("si discardGame falla, se registra el error y la partida se juega igual sin guardarse", async () => {
    const { manager, store, repository, time, logger } = setup();
    repository.failures.discardGame = 99;
    const { code } = await manager.createRoom(ash, oneRound);
    manager.joinRoom(inv, code);
    const room = store.get(code)!;
    playOneRound(room, time);
    await room.idle();
    expect(room.phase).toBe("finished");
    expect(repository.calls).toEqual(["createGame"]);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("dos cuentas se siguen guardando como siempre: sin descarte", async () => {
    const { manager, store, repository } = setup();
    const { code } = await manager.createRoom(ash, oneRound);
    manager.joinRoom(misty, code);
    await store.get(code)!.idle();
    expect(store.get(code)!.persisted).toBe(true);
    expect(repository.calls).toEqual(["createGame", "addSecondPlayer:u2"]);
  });

  it("NAME_IN_USE (409) al unirse con el mismo nombre que el creador, sin distinguir mayúsculas, sea invitado o cuenta; con otro nombre entra", async () => {
    const { manager, store, repository } = setup();
    const { code } = await manager.createRoom(ash, oneRound);
    for (const joiner of [
      { userId: "u9", username: "ASH", isGuest: false, avatarId: null },
      { userId: "guest_b", username: "Ash", isGuest: true, avatarId: null },
    ]) {
      expect(syncRejection(() => manager.joinRoom(joiner, code))).toEqual({ status: 409, code: "NAME_IN_USE" });
    }
    // Un intento rechazado no cambia nada: la sala sigue libre y guardándose.
    const room = store.get(code)!;
    expect(room.hasSeat(2)).toBe(false);
    expect(room.persisted).toBe(true);
    await room.idle();
    expect(repository.calls).toEqual(["createGame"]);

    expect(manager.joinRoom(inv, code)).toEqual({ code });
    expect(room.seatOf("guest_a")).toBe(2);
  });

  it("NAME_IN_USE también cuando el creador es el invitado y quien llega es una cuenta", async () => {
    const { manager } = setup();
    const { code } = await manager.createRoom(inv, oneRound);
    expect(syncRejection(() => manager.joinRoom({ userId: "u9", username: "INV", isGuest: false, avatarId: null }, code))).toEqual({ status: 409, code: "NAME_IN_USE" });
  });

  it("el creador invitado puede volver a pedir unirse a su sala (idempotente) y no puede crear otra", async () => {
    const { manager } = setup();
    const { code } = await manager.createRoom(inv, oneRound);
    expect(manager.joinRoom(inv, code)).toEqual({ code });
    expect(await rejection(manager.createRoom(inv, oneRound))).toEqual({ status: 409, code: "ALREADY_IN_GAME" });
  });

  it("el código de la sala de un invitado solo se comprueba contra las salas en memoria: si choca, genera otro", async () => {
    const codes = ["AAAAAA", "AAAAAA", "BBBBBB"];
    const { manager, repository } = setup(() => codes.shift()!);
    await manager.createRoom(ash, oneRound);
    const { code } = await manager.createRoom(inv, oneRound);
    expect(code).toBe("BBBBBB");
    expect(repository.calls).toEqual(["createGame"]);
  });
});

describe("RoomManager: la revancha", () => {
  const oneRound: RoomConfig = { typeMode: "random", lengthMode: "custom", roundsLimit: 1, statsGoal: null };
  /** Más larga que la gracia de reconexión (30 s): la partida sigue en marcha cuando esta se agota. */
  const threeRounds: RoomConfig = { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null };
  const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

  /** Una sala de ash y misty ya conectada y con la ronda en marcha. */
  async function startedRoom(ctx: ReturnType<typeof setup>, creator = ash, joiner = misty, config: RoomConfig = oneRound) {
    const { code } = await ctx.manager.createRoom(creator, config);
    ctx.manager.joinRoom(joiner, code);
    const room = ctx.store.get(code)!;
    room.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
    room.dispatch({ type: "PLAYER_CONNECTED", seat: 2 });
    ctx.time.advance(5000);
    return room;
  }
  const finishNormally = (ctx: ReturnType<typeof setup>, room: NonNullable<ReturnType<InMemoryRoomStore["get"]>>) => {
    room.dispatch({ type: "SUBMIT", seat: 1, text: "Alfa" });
    ctx.time.advance(15_000);
  };

  it("al terminar con completed abre una oferta, la sala terminada sigue en el almacén y los dos reciben open", async () => {
    const ctx = setup();
    const room = await startedRoom(ctx);
    finishNormally(ctx, room);
    expect(room.outcome?.reason).toBe("completed");
    expect(ctx.manager.rematch.has(room.code)).toBe(true);
    expect(ctx.store.get(room.code)).toBe(room);
    for (const seat of [1, 2] as const) expect(ctx.broadcaster.payloads("rematch-state", seat).at(-1)).toMatchObject({ status: "open" });
  });

  it.each([
    ["forfeit", async (ctx: ReturnType<typeof setup>) => { const room = await startedRoom(ctx); room.dispatch({ type: "LEAVE", seat: 2 }); return room; }],
    ["cancelled", async (ctx: ReturnType<typeof setup>) => { const { code } = await ctx.manager.createRoom(ash, oneRound); const room = ctx.store.get(code)!; room.dispatch({ type: "LEAVE", seat: 1 }); return room; }],
    ["expired", async (ctx: ReturnType<typeof setup>) => { const { code } = await ctx.manager.createRoom(ash, oneRound); const room = ctx.store.get(code)!; ctx.time.advance(10 * 60 * 1000); return room; }],
    ["disconnect", async (ctx: ReturnType<typeof setup>) => { const room = await startedRoom(ctx, ash, misty, threeRounds); room.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 }); ctx.time.advance(30_000); return room; }],
    ["abandoned", async (ctx: ReturnType<typeof setup>) => { const room = await startedRoom(ctx, ash, misty, threeRounds); room.dispatch({ type: "PLAYER_DISCONNECTED", seat: 1 }); room.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 }); ctx.time.advance(30_000); return room; }],
  ])("con el motivo %s no hay oferta y la sala terminada se quita del almacén al instante", async (reason, finish) => {
    const ctx = setup();
    const room = await finish(ctx);
    expect(room.outcome?.reason).toBe(reason);
    expect(ctx.manager.rematch.has(room.code)).toBe(false);
    expect(ctx.store.get(room.code)).toBeUndefined();
    expect(ctx.broadcaster.payloads("rematch-state")).toEqual([]);
  });

  it("findByUser ignora la sala terminada con oferta: las dos personas pueden crear otra sala", async () => {
    const ctx = setup();
    const room = await startedRoom(ctx);
    finishNormally(ctx, room);
    expect(ctx.manager.rematch.has(room.code)).toBe(true);
    const created = await ctx.manager.createRoom(ash, oneRound);
    expect(created.code).not.toBe(room.code);
    expect(ctx.manager.currentFor("u2")).toBeNull();
  });

  describe("createRematchRoom", () => {
    it("copia la configuración entera (incluido un campo que el motor no conoce) y deja a cada persona en su asiento", async () => {
      const { manager, store } = setup();
      const config = { ...oneRound, typeHints: true, monotype: "agua" } as RoomConfig;
      const { code } = await manager.createRematchRoom({ players: { 1: ash, 2: misty }, config });
      const room = store.get(code)!;
      expect(room.config).toEqual(config);
      expect(room.seatOf("u1")).toBe(1);
      expect(room.seatOf("u2")).toBe(2);
      expect(room.phase).toBe("waiting");
      expect(room.view(1)).toMatchObject({ rematch: true, players: [{ username: "ash" }, { username: "misty" }] });
    });

    it("con dos cuentas llama a createGame y guarda el segundo asiento; con un invitado, de cualquiera de los dos lados, no escribe nada y la sala conserva guest", async () => {
      const accounts = setup();
      const { code } = await accounts.manager.createRematchRoom({ players: { 1: ash, 2: misty }, config: oneRound });
      await accounts.store.get(code)!.idle();
      expect(accounts.repository.calls).toEqual(["createGame", "addSecondPlayer:u2"]);

      for (const [one, two] of [[inv, misty], [ash, inv]] as const) {
        const guests = setup();
        const created = await guests.manager.createRematchRoom({ players: { 1: one, 2: two }, config: oneRound });
        const room = guests.store.get(created.code)!;
        await room.idle();
        expect(guests.repository.calls).toEqual([]);
        expect(room.persisted).toBe(false);
        expect(Object.values(room.players()).some((player) => player?.isGuest)).toBe(true);
      }
    });

    it("ALREADY_IN_GAME con el asiento de quien ya está en otra sala", async () => {
      const { manager } = setup();
      await manager.createRoom(misty, oneRound);
      const error = await manager.createRematchRoom({ players: { 1: ash, 2: misty }, config: oneRound }).catch((e: unknown) => e);
      expect(error).toMatchObject({ status: 409, code: "ALREADY_IN_GAME", details: { seat: 2 } });
    });

    it("cancelRematchRoom cancela la sala de revancha (sin partida) y la saca del almacén", async () => {
      const { manager, store } = setup();
      const { code } = await manager.createRematchRoom({ players: { 1: ash, 2: misty }, config: oneRound });
      const room = store.get(code)!;
      manager.cancelRematchRoom(code);
      expect(room.outcome).toEqual({ winnerSeat: null, reason: "cancelled" });
      expect(store.get(code)).toBeUndefined();
      expect(() => manager.cancelRematchRoom("NOEXISTE")).not.toThrow();
    });

    it("la sala de revancha caduca a los 30 s si el segundo no entra y sale del almacén", async () => {
      const { manager, store, time } = setup();
      const { code } = await manager.createRematchRoom({ players: { 1: ash, 2: misty }, config: oneRound });
      const room = store.get(code)!;
      time.advance(29_999);
      expect(room.phase).toBe("waiting");
      time.advance(1);
      expect(room.outcome).toEqual({ winnerSeat: null, reason: "expired" });
      expect(store.get(code)).toBeUndefined();
    });
  });

  it("con dos cuentas y partida guardada pide el récord después de guardar el final y lo manda a los dos (espejo); con un invitado no lo pide", async () => {
    const accounts = setup();
    accounts.repository.headToHeadResult = { winsA: 1, winsB: 0, draws: 0, recent: ["a"] };
    accounts.repository.delays.finish = 30;
    // Cuando se lee el récord, el final de la partida ya tiene que estar escrito (si no, el récord no la incluiría).
    const finishSavedWhenRead: boolean[] = [];
    const readRecord = accounts.repository.headToHead.bind(accounts.repository);
    accounts.repository.headToHead = (userA, userB, recent) => {
      finishSavedWhenRead.push(accounts.repository.calls.includes("finish:completed"));
      return readRecord(userA, userB, recent);
    };
    const room = await startedRoom(accounts);
    finishNormally(accounts, room);
    await room.idle();
    await flush();
    expect(finishSavedWhenRead).toEqual([true]);
    expect(accounts.repository.headToHeadCalls).toEqual([{ userA: "u1", userB: "u2", recent: 5 }]);
    expect(accounts.broadcaster.payloads("rematch-state", 1).at(-1)).toMatchObject({ record: { mine: 1, theirs: 0, draws: 0, played: 1, recent: ["won"] } });
    expect(accounts.broadcaster.payloads("rematch-state", 2).at(-1)).toMatchObject({ record: { mine: 0, theirs: 1, played: 1, recent: ["lost"] } });

    // Si el final de la partida no llegó a guardarse (played 0), no se manda un récord sin esa partida.
    const unsaved = setup();
    const unsavedRoom = await startedRoom(unsaved);
    finishNormally(unsaved, unsavedRoom);
    await unsavedRoom.idle();
    await flush();
    expect(unsaved.repository.headToHeadCalls).toHaveLength(1);
    expect(unsaved.broadcaster.payloads("rematch-state", 1).every((state) => state.record === undefined)).toBe(true);

    const guests = setup();
    const guestRoom = await startedRoom(guests, inv, misty);
    finishNormally(guests, guestRoom);
    await guestRoom.idle();
    await flush();
    expect(guests.repository.headToHeadCalls).toEqual([]);
    expect(guests.manager.rematch.has(guestRoom.code)).toBe(true);
    expect("record" in guests.broadcaster.payloads("rematch-state", 2).at(-1)!).toBe(false);
  });
});

describe("RoomManager.joinRoom", () => {
  it("reserva el asiento 2", async () => {
    const { manager, store, repository } = setup();
    const { code } = await manager.createRoom(ash, config);
    expect(manager.joinRoom(misty, code)).toEqual({ code });
    expect(store.get(code)?.seatOf("u2")).toBe(2);
    await store.get(code)!.idle();
    expect(repository.calls).toContain("addSecondPlayer:u2");
  });

  it("acepta el código en minúsculas y con espacios", async () => {
    const { manager } = setup(() => "ABC234");
    await manager.createRoom(ash, config);
    expect(manager.joinRoom(misty, "  abc234 ")).toEqual({ code: "ABC234" });
  });

  it("es idempotente para quien ya está en la sala, creador incluido", async () => {
    const { manager } = setup();
    const { code } = await manager.createRoom(ash, config);
    expect(manager.joinRoom(ash, code)).toEqual({ code });
    manager.joinRoom(misty, code);
    expect(manager.joinRoom(misty, code)).toEqual({ code });
  });

  it("ROOM_NOT_FOUND si el código no existe", () => {
    const { manager } = setup();
    expect(syncRejection(() => manager.joinRoom(ash, "ZZZZZZ"))).toEqual({ status: 404, code: "ROOM_NOT_FOUND" });
  });

  it("ROOM_FULL si el asiento 2 ya está ocupado por otra persona", async () => {
    const { manager } = setup();
    const { code } = await manager.createRoom(ash, config);
    manager.joinRoom(misty, code);
    expect(syncRejection(() => manager.joinRoom(brock, code))).toEqual({ status: 409, code: "ROOM_FULL" });
  });

  it("ROOM_CLOSED si la partida ya empezó", async () => {
    const { manager, store } = setup();
    const { code } = await manager.createRoom(ash, config);
    manager.joinRoom(misty, code);
    const room = store.get(code)!;
    room.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
    room.dispatch({ type: "PLAYER_CONNECTED", seat: 2 });
    expect(room.phase).toBe("starting");
    expect(syncRejection(() => manager.joinRoom(brock, code))).toEqual({ status: 409, code: "ROOM_CLOSED" });
  });

  it("ALREADY_IN_GAME si el usuario está creando una sala en ese momento: nunca queda sentado en dos", async () => {
    const { manager, repository } = setup();
    const first = await manager.createRoom(ash, config);
    repository.delays.createGame = 20; // la creación de la sala de brock tarda: queda "en proceso"
    const creating = manager.createRoom(brock, config);
    expect(syncRejection(() => manager.joinRoom(brock, first.code))).toEqual({ status: 409, code: "ALREADY_IN_GAME" });
    await creating;
    expect(manager.getPublicInfo(first.code).playerCount).toBe(1);
  });

  it("ALREADY_IN_GAME si el usuario participa en otra sala activa", async () => {
    const { manager } = setup();
    const first = await manager.createRoom(ash, config);
    const second = await manager.createRoom(misty, config);
    expect(first.code).not.toBe(second.code);
    expect(syncRejection(() => manager.joinRoom(ash, second.code))).toEqual({ status: 409, code: "ALREADY_IN_GAME" });
  });
});

describe("RoomManager.currentFor", () => {
  it("devuelve la sala activa del usuario o null si no tiene ninguna", async () => {
    const { manager, time } = setup(() => "ABC234");
    expect(manager.currentFor(ash.userId)).toBeNull();

    await manager.createRoom(ash, config);
    expect(manager.currentFor(ash.userId)).toEqual({ code: "ABC234", phase: "waiting" });
    expect(manager.currentFor(misty.userId)).toBeNull();

    manager.joinRoom(misty, "ABC234");
    expect(manager.currentFor(misty.userId)).toEqual({ code: "ABC234", phase: "waiting" });

    time.advance(10 * 60 * 1000); // la sala caduca y termina
    expect(manager.currentFor(ash.userId)).toBeNull();
    expect(manager.currentFor(misty.userId)).toBeNull();
  });
});

describe("RoomManager.getPublicInfo y connect", () => {
  it("getPublicInfo describe la sala sin datos privados", async () => {
    const { manager } = setup(() => "ABC234");
    await manager.createRoom(ash, config);
    expect(manager.getPublicInfo("abc234")).toEqual({
      code: "ABC234",
      phase: "waiting",
      config,
      creator: "ash",
      playerCount: 1,
    });
    manager.joinRoom(misty, "ABC234");
    expect(manager.getPublicInfo("ABC234").playerCount).toBe(2);
  });

  it("connect devuelve la sala y el asiento de quien participa", async () => {
    const { manager } = setup();
    const { code } = await manager.createRoom(ash, config);
    manager.joinRoom(misty, code);
    expect(manager.connect(ash, code).seat).toBe(1);
    expect(manager.connect(misty, code).seat).toBe(2);
  });

  it("connect rechaza a quien no participa (NOT_IN_ROOM) y a una sala inexistente", async () => {
    const { manager } = setup();
    const { code } = await manager.createRoom(ash, config);
    expect(syncRejection(() => manager.connect(brock, code))).toEqual({ status: 403, code: "NOT_IN_ROOM" });
    expect(syncRejection(() => manager.connect(ash, "ZZZZZZ"))).toEqual({ status: 404, code: "ROOM_NOT_FOUND" });
  });

  it("el generador usa el azar inyectado de forma determinista", () => {
    const rng = sequenceRng([0, 1, 2, 3, 4, 5]);
    expect(generateRoomCode(rng)).toBe("ABCDEF");
  });
});

describe("RoomManager: el avatar", () => {
  const oneRound: RoomConfig = { typeMode: "random", lengthMode: "custom", roundsLimit: 1, statsGoal: null };

  it("createRoom y joinRoom pasan el avatar de cada uno al motor", async () => {
    const { manager, store } = setup();
    const { code } = await manager.createRoom({ ...ash, avatarId: 94 }, oneRound);
    manager.joinRoom({ ...misty, avatarId: 25 }, code);
    expect(store.get(code)!.view(1).players).toMatchObject([{ username: "ash", avatarId: 94 }, { username: "misty", avatarId: 25 }]);
  });

  it("la sala de una revancha copia el avatar de cada asiento", async () => {
    const { manager, store } = setup();
    const { code } = await manager.createRematchRoom({ players: { 1: { ...ash, avatarId: 94 }, 2: { ...misty, avatarId: 25 } }, config: oneRound });
    expect(store.get(code)!.view(2).players).toMatchObject([{ username: "ash", avatarId: 94 }, { username: "misty", avatarId: 25 }]);
  });

  it("players() devuelve el avatar de cada asiento, null si no tiene", async () => {
    const { manager, store } = setup();
    const { code } = await manager.createRoom({ ...ash, avatarId: 94 }, oneRound);
    manager.joinRoom(misty, code);
    expect(store.get(code)!.players()).toEqual({ 1: { ...ash, avatarId: 94 }, 2: misty });
  });
});

describe("RoomManager: la silueta", () => {
  const silhouette = { game: "silueta" as const, rounds: 5 as const, generations: [1] };

  it("una sala de silueta no se guarda, ni entre dos cuentas", async () => {
    const { manager, store, repository, time } = setup();
    const { code } = await manager.createRoom(ash, silhouette);
    manager.joinRoom(misty, code);
    const room = store.get(code)!;
    expect(room.persisted).toBe(false);
    room.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
    room.dispatch({ type: "PLAYER_CONNECTED", seat: 2 });
    time.advance(5000);
    for (let round = 1; round <= 5; round++) time.advance(15_000 + 6000);
    await room.idle();
    expect(room.phase).toBe("finished");
    expect(repository.calls).toEqual([]);
  });

  it("la revancha de una silueta copia su configuración y no pide récord", async () => {
    const { manager, store, repository } = setup();
    const { code } = await manager.createRematchRoom({ players: { 1: ash, 2: misty }, config: silhouette });
    expect(store.get(code)!.config).toEqual(silhouette);
    expect(store.get(code)!.persisted).toBe(false);
    expect(repository.calls).toEqual([]);
    expect(repository.headToHeadCalls).toEqual([]);
  });
});

describe("una sala de subasta en el RoomManager", () => {
  it("funciona con la sala real: registra siluetas, envía estados y no guarda nada", async () => {
    const { manager, time, store, broadcaster } = setup(() => "SUB234");
    const created = await manager.createRoom(ash, { game: "subasta", traps: false });
    manager.joinRoom(misty, created.code);
    const room = store.get(created.code)!;
    room.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
    room.dispatch({ type: "PLAYER_CONNECTED", seat: 2 });
    time.advance(5000);
    expect(room.view(1).phase).toBe("auction");
    const turn = room.view(1).auction!.lot!.turn;
    room.dispatch({ type: "BID", seat: turn, step: null });
    expect(room.view(1).auction!.lot!.leader).toBe(turn);
    room.dispatch({ type: "PASS", seat: turn === 1 ? 2 : 1 });
    expect(room.view(1).auction!.teamSizes[turn]).toBe(1);
    expect(broadcaster.payloads("auction-sale")).toHaveLength(1);
    // Nadie responde: los turnos se agotan solos y la partida llega al final.
    for (let tick = 0; tick < 40 && room.view(1).phase !== "finished"; tick++) time.advance(10_000);
    expect(room.view(1).phase).toBe("finished");
    expect(room.view(1).auction!.reveal).toHaveLength(6);
  });
});
