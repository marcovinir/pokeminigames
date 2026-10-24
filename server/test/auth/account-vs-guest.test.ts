import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestContext } from "../helpers/app.js";
import { prisma, resetDatabase } from "../helpers/db.js";
import { registerUser } from "../helpers/users.js";

const { app, tokens } = buildTestContext();
const guestToken = tokens.signAccessToken({ sub: "guest_abc", username: "inv_1", guest: true });
const bearer = (token: string): [string, string] => ["Authorization", `Bearer ${token}`];

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

/** Rutas que son solo de cuentas (con el cuerpo que necesitan para no fallar por validación). */
const ACCOUNT_ROUTES: [string, string, object?][] = [
  ["get", "/auth/me"],
  ["put", "/auth/me/preferences", { theme: "clasico", themeMode: "auto" }],
  ["put", "/auth/me/avatar", { avatarId: 94 }],
  ["get", "/stats"],
  ["get", "/stats/history"],
  ["get", "/users/ash/stats"],
];

function send(method: string, path: string, token: string | null, body?: object) {
  const call = (request(app) as unknown as Record<string, (path: string) => request.Test>)[method]!(path);
  if (token) call.set(...bearer(token));
  return body ? call.send(body) : call;
}

describe("un invitado y las rutas de cuentas", () => {
  it.each(ACCOUNT_ROUTES)("%s %s con un token de invitado: 403 ACCOUNT_REQUIRED", async (method, path, body) => {
    const response = await send(method, path, guestToken, body);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ACCOUNT_REQUIRED");
    expect(response.body.error.message).toBe("Necesitas una cuenta para esto.");
  });

  it("las mismas rutas con el token de una cuenta siguen funcionando", async () => {
    const ash = await registerUser(app, "ash");
    for (const [method, path, body] of ACCOUNT_ROUTES) {
      const response = await send(method, path, ash.token, body);
      expect(response.status, `${method} ${path}`).toBe(200);
    }
  });

  it("sin token o con uno inválido siguen dando 401 UNAUTHORIZED", async () => {
    for (const token of [null, "no-es-un-token"]) {
      for (const [method, path, body] of ACCOUNT_ROUTES) {
        const response = await send(method, path, token, body);
        expect(response.status, `${method} ${path}`).toBe(401);
        expect(response.body.error.code).toBe("UNAUTHORIZED");
      }
    }
  });
});

describe("un invitado y las rutas de salas", () => {
  it("GET /rooms/current da { room: null } y GET /rooms/:code da 404 ROOM_NOT_FOUND (ni 401 ni 403)", async () => {
    const current = await send("get", "/rooms/current", guestToken);
    expect(current.status).toBe(200);
    expect(current.body).toEqual({ room: null });

    const missing = await send("get", "/rooms/ABCDEF", guestToken);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("ROOM_NOT_FOUND");
  });

  it("sin token las rutas de salas siguen dando 401", async () => {
    const response = await send("get", "/rooms/current", null);
    expect(response.status).toBe(401);
  });
});
