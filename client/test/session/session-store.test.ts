import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/client";
import { ASH, fakeServices } from "../helpers/services";

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

    it("register deja al usuario autenticado y no pide verificar nada", async () => {
      const { store, endpoints } = setup();
      await expect(store.getState().register({ email: "ash@example.com", username: "ash", password: "pikachu-123" })).resolves.toBeNull();
      expect(endpoints.auth.register).toHaveBeenCalledTimes(1);
      expect(store.getState().user).toEqual(ASH);
    });

    it("con la verificación activa register deja la cuenta pendiente: devuelve el correo y no abre la sesión", async () => {
      const { store, endpoints } = setup();
      vi.mocked(endpoints.auth.register).mockResolvedValueOnce({ verification: "required", email: "ash@example.com" });
      await expect(store.getState().register({ email: "ash@example.com", username: "ash", password: "pikachu-123" })).resolves.toEqual({
        verification: "required",
        email: "ash@example.com",
      });
      expect(store.getState()).toMatchObject({ status: "loading", user: null });
    });

    it("verifyEmail abre la sesión con el código", async () => {
      const { store, endpoints } = setup();
      await store.getState().verifyEmail({ email: "ash@example.com", code: "123456" });
      expect(endpoints.auth.verifyEmail).toHaveBeenCalledWith({ email: "ash@example.com", code: "123456" });
      expect(store.getState()).toMatchObject({ status: "authenticated", user: ASH });
    });

    it("un código incorrecto lanza el error y no cambia el estado", async () => {
      const { store, endpoints } = setup();
      vi.mocked(endpoints.auth.verifyEmail).mockRejectedValueOnce(new ApiError(400, "INVALID_CODE"));
      await expect(store.getState().verifyEmail({ email: "ash@example.com", code: "000000" })).rejects.toMatchObject({ code: "INVALID_CODE" });
      expect(store.getState()).toMatchObject({ status: "loading", user: null });
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
