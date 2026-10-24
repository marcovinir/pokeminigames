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
