import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "../../src/api/client";
import { createEndpoints } from "../../src/api/endpoints";

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const session = { user: { id: "u1", email: "ash@example.com", username: "ash", createdAt: "2026-01-01T00:00:00.000Z" }, accessToken: "tok" };

function setup(response: () => Response = () => json(200, {})) {
  const fetchMock = vi.fn<typeof fetch>(async () => response());
  const api = new ApiClient({ fetch: fetchMock });
  return { api, endpoints: createEndpoints(api), fetchMock };
}

const lastCall = (fetchMock: ReturnType<typeof setup>["fetchMock"]) => {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: String(url), method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined };
};

describe("endpoints de autenticación", () => {
  it("register y login envían los datos, guardan el token y devuelven la sesión", async () => {
    const { api, endpoints, fetchMock } = setup(() => json(200, session));
    const registered = await endpoints.auth.register({ email: "ash@example.com", username: "ash", password: "pikachu-123" });
    expect("user" in registered && registered.user.username).toBe("ash");
    expect(lastCall(fetchMock)).toEqual({
      url: "/auth/register",
      method: "POST",
      body: { email: "ash@example.com", username: "ash", password: "pikachu-123" },
    });
    expect(api.getToken()).toBe("tok");

    api.setToken(null);
    await endpoints.auth.login({ email: "ash@example.com", password: "pikachu-123" });
    expect(lastCall(fetchMock).url).toBe("/auth/login");
    expect(api.getToken()).toBe("tok");
  });

  it("un login fallido no deja token", async () => {
    const { api, endpoints } = setup(() => json(401, { error: { code: "INVALID_CREDENTIALS", message: "x" } }));
    await expect(endpoints.auth.login({ email: "a@b.co", password: "x" })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(api.getToken()).toBeNull();
  });

  it("logout borra el token aunque el servidor falle", async () => {
    const { api, endpoints } = setup(() => json(500, { error: { code: "INTERNAL_ERROR", message: "x" } }));
    api.setToken("tok");
    await expect(endpoints.auth.logout()).rejects.toBeTruthy();
    expect(api.getToken()).toBeNull();
  });

  it("refresh usa la renovación del cliente", async () => {
    const { api, endpoints } = setup(() => json(200, session));
    await expect(endpoints.auth.refresh()).resolves.toMatchObject({ accessToken: "tok" });
    expect(api.getToken()).toBe("tok");
  });
});

describe("endpoints de las cuentas con código por correo", () => {
  const headersOf = (fetchMock: ReturnType<typeof setup>["fetchMock"]) => (fetchMock.mock.calls.at(-1)![1]?.headers ?? {}) as Record<string, string>;

  it("register con la verificación activa devuelve «hay que verificar» y no guarda ningún token", async () => {
    const { api, endpoints } = setup(() => json(202, { verification: "required", email: "ash@example.com" }));
    await expect(endpoints.auth.register({ email: "ash@example.com", username: "ash", password: "pikachu-123" })).resolves.toEqual({
      verification: "required",
      email: "ash@example.com",
    });
    expect(api.getToken()).toBeNull();
  });

  it("options pregunta si la verificación está activa, sin token", async () => {
    const { api, endpoints, fetchMock } = setup(() => json(200, { emailVerification: true }));
    api.setToken("tok");
    await expect(endpoints.auth.options()).resolves.toEqual({ emailVerification: true });
    expect(lastCall(fetchMock)).toMatchObject({ url: "/auth/options", method: "GET" });
    expect(headersOf(fetchMock).Authorization).toBeUndefined();
  });

  it("verifyEmail envía el correo y el código, abre la sesión y guarda el token", async () => {
    const { api, endpoints, fetchMock } = setup(() => json(200, session));
    await expect(endpoints.auth.verifyEmail({ email: "ash@example.com", code: "123456" })).resolves.toMatchObject({ accessToken: "tok" });
    expect(lastCall(fetchMock)).toEqual({ url: "/auth/verify-email", method: "POST", body: { email: "ash@example.com", code: "123456" } });
    expect(api.getToken()).toBe("tok");
  });

  it("un código incorrecto lanza el error en español y no deja token", async () => {
    const { api, endpoints } = setup(() => json(400, { error: { code: "INVALID_CODE", message: "x" } }));
    await expect(endpoints.auth.verifyEmail({ email: "a@b.co", code: "000000" })).rejects.toMatchObject({
      code: "INVALID_CODE",
      message: "Código incorrecto o vencido. Revisa tu correo o pide uno nuevo.",
    });
    expect(api.getToken()).toBeNull();
  });

  it("resendCode, forgotPassword y resetPassword envían lo suyo, sin token, y no devuelven nada", async () => {
    const { api, endpoints, fetchMock } = setup(() => json(202, { ok: true }));
    api.setToken("tok");
    await expect(endpoints.auth.resendCode("ash@example.com")).resolves.toBeUndefined();
    expect(lastCall(fetchMock)).toEqual({ url: "/auth/verification/resend", method: "POST", body: { email: "ash@example.com" } });
    expect(headersOf(fetchMock).Authorization).toBeUndefined();

    await expect(endpoints.auth.forgotPassword("ash@example.com")).resolves.toBeUndefined();
    expect(lastCall(fetchMock)).toEqual({ url: "/auth/password/forgot", method: "POST", body: { email: "ash@example.com" } });
    expect(headersOf(fetchMock).Authorization).toBeUndefined();
  });

  it("resetPassword acepta el 204 sin cuerpo", async () => {
    const { endpoints, fetchMock } = setup(() => json(204));
    await expect(endpoints.auth.resetPassword({ email: "ash@example.com", code: "123456", password: "nueva-clave-1" })).resolves.toBeUndefined();
    expect(lastCall(fetchMock)).toEqual({
      url: "/auth/password/reset",
      method: "POST",
      body: { email: "ash@example.com", code: "123456", password: "nueva-clave-1" },
    });
  });

  it("un 429 del reenvío dice cuánto esperar", async () => {
    const { endpoints } = setup(() => json(429, { error: { code: "RATE_LIMITED", message: "x", details: { retryAfterSeconds: 42 } } }));
    await expect(endpoints.auth.resendCode("ash@example.com")).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message: "Demasiados intentos. Inténtalo de nuevo en 42 s.",
    });
  });
});

describe("endpoints de salas", () => {
  it("create envía la configuración y devuelve el código", async () => {
    const { endpoints, fetchMock } = setup(() => json(201, { code: "ABC234" }));
    const config = { typeMode: "random", lengthMode: "custom", statsGoal: 2500 } as const;
    await expect(endpoints.rooms.create(config)).resolves.toEqual({ code: "ABC234" });
    expect(lastCall(fetchMock)).toEqual({ url: "/rooms", method: "POST", body: config });
  });

  it("join y get codifican el código en la ruta", async () => {
    const { endpoints, fetchMock } = setup(() => json(200, { code: "X" }));
    await endpoints.rooms.join("a b/c");
    expect(lastCall(fetchMock)).toMatchObject({ url: "/rooms/a%20b%2Fc/join", method: "POST" });
    await endpoints.rooms.get("ABC234");
    expect(lastCall(fetchMock)).toMatchObject({ url: "/rooms/ABC234", method: "GET" });
  });

  it("current devuelve la sala activa o null", async () => {
    const active = setup(() => json(200, { room: { code: "ABC234", phase: "waiting" } }));
    await expect(active.endpoints.rooms.current()).resolves.toEqual({ code: "ABC234", phase: "waiting" });
    expect(lastCall(active.fetchMock).url).toBe("/rooms/current");

    const none = setup(() => json(200, { room: null }));
    await expect(none.endpoints.rooms.current()).resolves.toBeNull();
  });
});

describe("endpoints de estadísticas", () => {
  const statsResponse = { username: "ash", stats: { played: 0 } };

  it("mine pide tus estadísticas con la sesión", async () => {
    const { api, endpoints, fetchMock } = setup(() => json(200, statsResponse));
    api.setToken("tok");
    await expect(endpoints.stats.mine()).resolves.toEqual(statsResponse);
    expect(lastCall(fetchMock)).toMatchObject({ url: "/stats", method: "GET" });
    expect((fetchMock.mock.calls[0]![1]?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("forUser codifica el nombre en la ruta", async () => {
    const { endpoints, fetchMock } = setup(() => json(200, statsResponse));
    await endpoints.stats.forUser("ash_99");
    expect(lastCall(fetchMock)).toMatchObject({ url: "/users/ash_99/stats", method: "GET" });
    await endpoints.stats.forUser("a b/c?x");
    expect(lastCall(fetchMock).url).toBe("/users/a%20b%2Fc%3Fx/stats");
  });

  it("un jugador que no existe llega como un error con su mensaje en español", async () => {
    const { endpoints } = setup(() => json(404, { error: { code: "USER_NOT_FOUND", message: "x" } }));
    await expect(endpoints.stats.forUser("nadie")).rejects.toMatchObject({
      status: 404,
      code: "USER_NOT_FOUND",
      message: "No encontramos a ese jugador.",
    });
  });

  it("history sin opciones no añade parámetros", async () => {
    const { endpoints, fetchMock } = setup(() => json(200, { games: [], nextCursor: null }));
    await expect(endpoints.stats.history()).resolves.toEqual({ games: [], nextCursor: null });
    expect(lastCall(fetchMock)).toMatchObject({ url: "/stats/history", method: "GET" });
  });

  it("history envía el límite y el cursor, codificado, cuando se piden", async () => {
    const { endpoints, fetchMock } = setup(() => json(200, { games: [], nextCursor: null }));
    await endpoints.stats.history({ limit: 10, before: "a+b/c=" });
    expect(lastCall(fetchMock).url).toBe("/stats/history?limit=10&before=a%2Bb%2Fc%3D");
    await endpoints.stats.history({ before: "abc" });
    expect(lastCall(fetchMock).url).toBe("/stats/history?before=abc");
  });

  it("history ignora un cursor nulo (la primera página)", async () => {
    const { endpoints, fetchMock } = setup(() => json(200, { games: [], nextCursor: null }));
    await endpoints.stats.history({ before: null });
    expect(lastCall(fetchMock).url).toBe("/stats/history");
  });
});

describe("endpoint de preferencias", () => {
  it("savePreferences envía tema y modo con la sesión", async () => {
    const { api, endpoints, fetchMock } = setup(() => json(200, { preferences: { theme: "pokedex", themeMode: "oscuro" } }));
    api.setToken("tok");
    await expect(endpoints.auth.savePreferences({ theme: "pokedex", themeMode: "oscuro" })).resolves.toBeUndefined();
    expect(lastCall(fetchMock)).toEqual({
      url: "/auth/me/preferences",
      method: "PUT",
      body: { theme: "pokedex", themeMode: "oscuro" },
    });
    expect((fetchMock.mock.calls[0]![1]?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("si el servidor la rechaza, el error llega a quien llamó", async () => {
    const { endpoints } = setup(() => json(400, { error: { code: "VALIDATION_ERROR", message: "x" } }));
    await expect(endpoints.auth.savePreferences({ theme: "clasico", themeMode: "auto" })).rejects.toMatchObject({ status: 400 });
  });
});

describe("endpoint del catálogo", () => {
  it("names pide la lista sin enviar credenciales de sesión", async () => {
    const { api, endpoints, fetchMock } = setup(() => json(200, [{ id: 1, es: "Alfa", en: "Alpha" }]));
    api.setToken("tok");
    await expect(endpoints.catalog.names()).resolves.toEqual([{ id: 1, es: "Alfa", en: "Alpha" }]);
    const init = fetchMock.mock.calls[0]![1];
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("names sin tipos pide /pokemon/names y con tipos añade ?types=1", async () => {
    const { endpoints, fetchMock } = setup(() => json(200, []));
    await endpoints.catalog.names();
    expect(lastCall(fetchMock).url).toBe("/pokemon/names");
    await endpoints.catalog.names({ withTypes: false });
    expect(lastCall(fetchMock).url).toBe("/pokemon/names");
    await endpoints.catalog.names({ withTypes: true });
    expect(lastCall(fetchMock).url).toBe("/pokemon/names?types=1");
  });
});
