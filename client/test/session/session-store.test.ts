import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/client";
import { isGuest } from "../../src/api/types";
import { ASH, GUEST, fakeServices } from "../helpers/services";

function setup() {
  const services = fakeServices();
  return { services, endpoints: services.endpoints, store: services.session };
}

describe("sesión", () => {
  it("empieza cargando, sin usuario", () => {
    const { store } = setup();
    expect(store.getState()).toMatchObject({ status: "loading", user: null });
  });

  describe("bootstrap", () => {
    it("con sesión en el servidor queda autenticado", async () => {
      const { store, endpoints } = setup();
      vi.mocked(endpoints.auth.refresh).mockResolvedValueOnce({ user: ASH, accessToken: "tok" });
      await store.getState().bootstrap();
      expect(store.getState()).toMatchObject({ status: "authenticated", user: ASH });
    });

    it("sin sesión queda como anónimo", async () => {
      const { store } = setup();
      await store.getState().bootstrap();
      expect(store.getState()).toMatchObject({ status: "anonymous", user: null });
    });

    it("si el servidor no responde queda como anónimo, sin lanzar error", async () => {
      const { store, endpoints } = setup();
      vi.mocked(endpoints.auth.refresh).mockRejectedValueOnce(new ApiError(0, "NETWORK"));
      await expect(store.getState().bootstrap()).resolves.toBeUndefined();
      expect(store.getState().status).toBe("anonymous");
    });

    it("solo consulta al servidor una vez aunque se llame varias (React en modo estricto)", async () => {
      const { store, endpoints } = setup();
      await Promise.all([store.getState().bootstrap(), store.getState().bootstrap()]);
      await store.getState().bootstrap();
      expect(endpoints.auth.refresh).toHaveBeenCalledTimes(1);
    });
  });

  describe("login y registro", () => {
    it("login deja al usuario autenticado", async () => {
      const { store, endpoints } = setup();
      await store.getState().login({ email: "ash@example.com", password: "pikachu-123" });
      expect(endpoints.auth.login).toHaveBeenCalledWith({ email: "ash@example.com", password: "pikachu-123" });
      expect(store.getState()).toMatchObject({ status: "authenticated", user: ASH });
    });

    it("un login fallido lanza el error y no cambia el estado", async () => {
      const { store, endpoints } = setup();
      vi.mocked(endpoints.auth.login).mockRejectedValueOnce(new ApiError(401, "INVALID_CREDENTIALS"));
      await expect(store.getState().login({ email: "a@b.co", password: "x" })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
      expect(store.getState().status).toBe("loading");
      expect(store.getState().user).toBeNull();
    });

    it("register deja al usuario autenticado", async () => {
      const { store, endpoints } = setup();
      await store.getState().register({ email: "ash@example.com", username: "ash", password: "pikachu-123" });
      expect(endpoints.auth.register).toHaveBeenCalledTimes(1);
      expect(store.getState().user).toEqual(ASH);
    });
  });

  describe("invitado", () => {
    it("loginAsGuest abre la sesión como invitado: status authenticated y user { guest: true }", async () => {
      const { store, endpoints } = setup();
      await store.getState().loginAsGuest("inv_9");
      expect(endpoints.auth.guest).toHaveBeenCalledWith("inv_9");
      expect(store.getState()).toMatchObject({ status: "authenticated", user: { ...GUEST, username: "inv_9" } });
      expect(isGuest(store.getState().user)).toBe(true);
    });

    it("un nombre rechazado lanza el error y no abre la sesión", async () => {
      const { store, endpoints } = setup();
      vi.mocked(endpoints.auth.guest).mockRejectedValueOnce(new ApiError(429, "RATE_LIMITED"));
      await expect(store.getState().loginAsGuest("inv_9")).rejects.toMatchObject({ code: "RATE_LIMITED" });
      expect(store.getState()).toMatchObject({ status: "loading", user: null });
    });

    it("bootstrap con la cookie de invitado (refresh devuelve un invitado) deja al invitado autenticado", async () => {
      const { store, endpoints } = setup();
      vi.mocked(endpoints.auth.refresh).mockResolvedValueOnce({ user: GUEST, accessToken: "tok" });
      await store.getState().bootstrap();
      expect(store.getState()).toMatchObject({ status: "authenticated", user: GUEST });
      expect(isGuest(store.getState().user)).toBe(true);
    });

    it("iniciar sesión o registrarse siendo invitado sustituye al invitado por la cuenta", async () => {
      const { store } = setup();
      await store.getState().loginAsGuest("inv_9");
      await store.getState().login({ email: "ash@example.com", password: "pikachu-123" });
      expect(store.getState().user).toEqual(ASH);
      expect(isGuest(store.getState().user)).toBe(false);

      await store.getState().logout();
      await store.getState().loginAsGuest("inv_9");
      await store.getState().register({ email: "ash@example.com", username: "ash", password: "pikachu-123" });
      expect(store.getState().user).toEqual(ASH);
    });

    it("isGuest distingue al invitado de una cuenta y de nadie", () => {
      expect(isGuest(GUEST)).toBe(true);
      expect(isGuest(ASH)).toBe(false);
      expect(isGuest(null)).toBe(false);
    });
  });

  describe("logout y expiración", () => {
    it("logout termina la sesión", async () => {
      const { store } = setup();
      await store.getState().login({ email: "ash@example.com", password: "x" });
      await store.getState().logout();
      expect(store.getState()).toMatchObject({ status: "anonymous", user: null });
    });

    it("logout termina la sesión aunque el servidor falle", async () => {
      const { store, endpoints } = setup();
      await store.getState().login({ email: "ash@example.com", password: "x" });
      vi.mocked(endpoints.auth.logout).mockRejectedValueOnce(new ApiError(0, "NETWORK"));
      await store.getState().logout().catch(() => {});
      expect(store.getState().status).toBe("anonymous");
    });

    it("expire (sesión perdida) deja al usuario como anónimo", async () => {
      const { store } = setup();
      await store.getState().login({ email: "ash@example.com", password: "x" });
      store.getState().expire();
      expect(store.getState()).toMatchObject({ status: "anonymous", user: null });
    });
  });
});

describe("sesión: el avatar", () => {
  it("saveAvatar guarda y actualiza el usuario de la sesión", async () => {
    const { store, endpoints } = setup();
    await store.getState().login({ email: "ash@example.com", password: "pikachu-123" });
    await store.getState().saveAvatar(94);
    expect(endpoints.auth.saveAvatar).toHaveBeenCalledWith(94);
    expect(store.getState().user).toEqual({ ...ASH, avatarId: 94 });
    await store.getState().saveAvatar(null);
    expect(store.getState().user).toEqual({ ...ASH, avatarId: null });
  });

  it("si falla, lanza y no cambia nada", async () => {
    const { store, endpoints } = setup();
    await store.getState().login({ email: "ash@example.com", password: "pikachu-123" });
    vi.mocked(endpoints.auth.saveAvatar).mockRejectedValueOnce(new ApiError(0, "NETWORK"));
    await expect(store.getState().saveAvatar(94)).rejects.toMatchObject({ code: "NETWORK" });
    expect(store.getState().user).toEqual(ASH);
  });

  it("a un invitado no se le pone avatar", async () => {
    const { store } = setup();
    await store.getState().loginAsGuest("inv_1");
    await store.getState().saveAvatar(94);
    expect(store.getState().user).toEqual({ ...GUEST, username: "inv_1" });
  });
});
