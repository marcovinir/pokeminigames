import { describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError } from "../../src/api/client";
import type { AuthSession } from "../../src/api/types";

const session = (token: string): AuthSession => ({
  user: { id: "u1", email: "ash@example.com", username: "ash", createdAt: "2026-01-01T00:00:00.000Z", preferences: null },
  accessToken: token,
});

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const errorBody = (code: string) => ({ error: { code, message: "mensaje del servidor" } });

type Handler = (url: string, init: RequestInit) => Promise<Response> | Response;

function setup(handler: Handler, options: { onSessionLost?: () => void; baseUrl?: string } = {}) {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => handler(String(input), init ?? {}));
  const api = new ApiClient({ fetch: fetchMock, ...options });
  const calls = (path: string) => fetchMock.mock.calls.filter(([url]) => String(url).endsWith(path));
  return { api, fetchMock, calls };
}

const header = (init: RequestInit | undefined, name: string) => (init?.headers as Record<string, string> | undefined)?.[name];

describe("ApiClient.request", () => {
  it("envía JSON, el access token y las cookies, y devuelve la respuesta", async () => {
    const { api, fetchMock } = setup(() => json(200, { ok: true }));
    api.setToken("abc");
    const result = await api.request<{ ok: boolean }>("POST", "/rooms", { body: { typeMode: "random" } });

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/rooms");
    expect(init).toMatchObject({ method: "POST", credentials: "include", body: '{"typeMode":"random"}' });
    expect(header(init, "Authorization")).toBe("Bearer abc");
    expect(header(init, "Content-Type")).toBe("application/json");
  });

  it("sin cuerpo no manda Content-Type y sin token no manda Authorization", async () => {
    const { api, fetchMock } = setup(() => json(200, {}));
    await api.request("GET", "/rooms/current");
    const init = fetchMock.mock.calls[0]![1];
    expect(header(init, "Content-Type")).toBeUndefined();
    expect(header(init, "Authorization")).toBeUndefined();
  });

  it("antepone la URL base", async () => {
    const { api, fetchMock } = setup(() => json(200, {}), { baseUrl: "https://api.example.com" });
    await api.request("GET", "/health");
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.example.com/health");
  });

  it("una respuesta 204 devuelve undefined", async () => {
    const { api } = setup(() => json(204));
    await expect(api.request("POST", "/auth/logout")).resolves.toBeUndefined();
  });

  it("convierte un error del servidor en ApiError con su código y un mensaje en español", async () => {
    const { api } = setup(() => json(409, errorBody("ROOM_FULL")));
    const error = await api.request("POST", "/rooms/ABC234/join").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "ROOM_FULL", message: "Esa sala ya está llena." });
  });

  it("conserva los detalles de validación", async () => {
    const details = [{ path: "email", message: "Email inválido" }];
    const { api } = setup(() => json(400, { error: { code: "VALIDATION_ERROR", message: "x", details } }));
    const error = (await api.request("POST", "/auth/register", { auth: false }).catch((e: unknown) => e)) as ApiError;
    expect(error.details).toEqual(details);
  });

  it("una respuesta de error que no es JSON da un error genérico", async () => {
    const { api } = setup(() => new Response("<html>502</html>", { status: 502 }));
    const error = (await api.request("GET", "/x").catch((e: unknown) => e)) as ApiError;
    expect(error).toMatchObject({ status: 502, code: "INTERNAL_ERROR" });
  });

  it("si no hay conexión lanza un ApiError de red con mensaje en español", async () => {
    const { api } = setup(() => {
      throw new TypeError("Failed to fetch");
    });
    const error = (await api.request("GET", "/x").catch((e: unknown) => e)) as ApiError;
    expect(error).toMatchObject({ status: 0, code: "NETWORK" });
    expect(error.message).toContain("No se pudo conectar");
  });
});

describe("renovación de la sesión ante un 401", () => {
  /** El servidor acepta solo el token "nuevo"; /auth/refresh lo entrega. */
  function tokenServer(refreshBehaviour: () => Promise<Response> | Response = () => json(200, session("nuevo"))) {
    return (url: string, init: RequestInit) => {
      if (url.endsWith("/auth/refresh")) return refreshBehaviour();
      return header(init, "Authorization") === "Bearer nuevo" ? json(200, { ok: true }) : json(401, errorBody("UNAUTHORIZED"));
    };
  }

  it("renueva la sesión una vez y reintenta con el token nuevo", async () => {
    const { api, calls } = setup(tokenServer());
    api.setToken("viejo");
    await expect(api.request("GET", "/rooms/current")).resolves.toEqual({ ok: true });
    expect(calls("/auth/refresh")).toHaveLength(1);
    expect(calls("/rooms/current")).toHaveLength(2);
    expect(api.getToken()).toBe("nuevo");
  });

  it("varias peticiones que fallan a la vez comparten una sola renovación", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { api, calls } = setup(
      tokenServer(async () => {
        await gate;
        return json(200, session("nuevo"));
      }),
    );
    api.setToken("viejo");
    const pending = Promise.all([api.request("GET", "/a"), api.request("GET", "/b"), api.request("GET", "/c")]);
    await vi.waitFor(() => expect(calls("/auth/refresh").length).toBeGreaterThan(0));
    release();
    await pending;

    expect(calls("/auth/refresh")).toHaveLength(1);
    for (const path of ["/a", "/b", "/c"]) expect(calls(path)).toHaveLength(2);
  });

  it("una renovación posterior, cuando la anterior ya terminó, hace otra petición", async () => {
    const { api, calls } = setup(tokenServer());
    await api.refreshSession();
    await api.refreshSession();
    expect(calls("/auth/refresh")).toHaveLength(2);
  });

  it("si la renovación falla, avisa de que la sesión se perdió, borra el token y lanza el error original", async () => {
    const onSessionLost = vi.fn();
    const { api } = setup(tokenServer(() => json(401, errorBody("INVALID_REFRESH_TOKEN"))), { onSessionLost });
    api.setToken("viejo");
    const error = (await api.request("GET", "/rooms/current").catch((e: unknown) => e)) as ApiError;

    expect(error).toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    expect(onSessionLost).toHaveBeenCalledTimes(1);
    expect(api.getToken()).toBeNull();
  });

  it("si tras renovar el servidor sigue respondiendo 401, no entra en bucle", async () => {
    const { api, calls } = setup((url) =>
      url.endsWith("/auth/refresh") ? json(200, session("nuevo")) : json(401, errorBody("UNAUTHORIZED")),
    );
    api.setToken("viejo");
    const error = (await api.request("GET", "/x").catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe("UNAUTHORIZED");
    expect(calls("/auth/refresh")).toHaveLength(1);
    expect(calls("/x")).toHaveLength(2);
  });

  it("las peticiones sin autenticación (login) no renuevan nada: un 401 es un error normal", async () => {
    const { api, calls } = setup(() => json(401, errorBody("INVALID_CREDENTIALS")));
    const error = (await api.request("POST", "/auth/login", { auth: false, body: {} }).catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe("INVALID_CREDENTIALS");
    expect(calls("/auth/refresh")).toHaveLength(0);
  });

  it("un error de red durante la renovación cuenta como sesión perdida", async () => {
    const onSessionLost = vi.fn();
    const { api } = setup(
      tokenServer(() => {
        throw new TypeError("sin red");
      }),
      { onSessionLost },
    );
    api.setToken("viejo");
    await api.request("GET", "/x").catch(() => {});
    expect(onSessionLost).toHaveBeenCalledTimes(1);
  });
});

describe("ApiClient.refreshSession", () => {
  it("guarda el token nuevo y devuelve la sesión", async () => {
    const { api, fetchMock } = setup(() => json(200, session("recién-emitido")));
    const result = await api.refreshSession();
    expect(result?.user.username).toBe("ash");
    expect(api.getToken()).toBe("recién-emitido");
    const init = fetchMock.mock.calls[0]![1];
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    expect(header(init, "Authorization")).toBeUndefined();
  });

  it("sin sesión (401) devuelve null y deja el token vacío", async () => {
    const { api } = setup(() => json(401, errorBody("INVALID_REFRESH_TOKEN")));
    api.setToken("viejo");
    await expect(api.refreshSession()).resolves.toBeNull();
    expect(api.getToken()).toBeNull();
  });
});

describe("ApiError con un 429", () => {
  it("el mensaje dice cuánto esperar cuando el servidor lo informa", () => {
    expect(new ApiError(429, "RATE_LIMITED", { retryAfterSeconds: 540 }).message).toBe("Demasiados intentos. Inténtalo de nuevo en 9 min.");
    expect(new ApiError(429, "RATE_LIMITED", { retryAfterSeconds: 40 }).message).toBe("Demasiados intentos. Inténtalo de nuevo en 40 s.");
  });

  it("sin una espera usable, no inventa una", () => {
    expect(new ApiError(429, "RATE_LIMITED").message).toBe("Demasiados intentos. Inténtalo de nuevo más tarde.");
    expect(new ApiError(429, "RATE_LIMITED", { retryAfterSeconds: "pronto" }).message).toBe("Demasiados intentos. Inténtalo de nuevo más tarde.");
  });

  it("los demás códigos conservan su mensaje de siempre", () => {
    expect(new ApiError(401, "UNAUTHORIZED").message).toBe("Tu sesión expiró. Inicia sesión de nuevo.");
  });
});
