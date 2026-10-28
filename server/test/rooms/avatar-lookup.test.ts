import { describe, expect, it, vi } from "vitest";
import { avatarForRoom } from "../../src/rooms/avatar-lookup.js";

describe("avatarForRoom", () => {
  it("un invitado no consulta nada", async () => {
    const read = vi.fn(async () => 94);
    expect(await avatarForRoom(read, { userId: "guest_a", isGuest: true })).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it("una cuenta devuelve lo que lee", async () => {
    const read = vi.fn(async () => 94);
    expect(await avatarForRoom(read, { userId: "u1", isGuest: false })).toBe(94);
    expect(read).toHaveBeenCalledWith("u1");
    expect(await avatarForRoom(async () => null, { userId: "u1", isGuest: false })).toBeNull();
  });

  it("si la lectura falla, null y un aviso: algo cosmético no impide entrar", async () => {
    const logger = { warn: vi.fn() };
    const read = vi.fn(async () => {
      throw new Error("la base no responde");
    });
    expect(await avatarForRoom(read, { userId: "u1", isGuest: false }, logger)).toBeNull();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});

describe("avatarForRoom con la base lenta", () => {
  it("si la lectura tarda más del límite, entra con iniciales en vez de esperar", async () => {
    vi.useFakeTimers();
    try {
      const never = () => new Promise<number | null>(() => {});
      const logger = { warn: vi.fn() };
      const pending = avatarForRoom(never, { userId: "u1", isGuest: false }, logger, 1500);
      await vi.advanceTimersByTimeAsync(1500);
      await expect(pending).resolves.toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
