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
const ash = { userId: "u1", username: "ash", isGuest: false };
const misty = { userId: "u2", username: "misty", isGuest: false };
const brock = { userId: "u3", username: "brock", isGuest: false };
const inv = { userId: "guest_a", username: "inv", isGuest: true };

function setup(generateCode?: () => string) {
  const logger = { error: vi.fn() };
  const time = new FakeTime();
  const repository = new FakeRepository();
  const store = new InMemoryRoomStore();
  const manager = new RoomManager({
    clock: time,
    scheduler: time,
    broadcaster: new RecordingBroadcaster(),
    repository,
    catalog: fixtureCatalog(),
    rng: seededRng(7),
    store,
    generateCode,
    logger,
    persistRetryDelayMs: 0,
  });
  return { manager, time, repository, store, logger };
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
      { userId: "u9", username: "ASH", isGuest: false },
      { userId: "guest_b", username: "Ash", isGuest: true },
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
    expect(syncRejection(() => manager.joinRoom({ userId: "u9", username: "INV", isGuest: false }, code))).toEqual({ status: 409, code: "NAME_IN_USE" });
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
