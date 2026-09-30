import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { prisma, resetDatabase } from "../helpers/db.js";

const app = buildTestApp();
const ash = { email: "ash@example.com", username: "ash", password: "pikachu-123" };

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

function refreshCookie(response: request.Response): string {
  const cookies = (response.headers["set-cookie"] ?? []) as unknown as string[];
  const cookie = cookies.find((c) => c.startsWith("refresh_token="));
  if (!cookie) throw new Error("No llegó la cookie refresh_token");
  return cookie;
}

describe("POST /auth/register", () => {
  it("crea la cuenta: 201, usuario, access token y cookie de refresco httpOnly en /auth", async () => {
    const response = await request(app).post("/auth/register").send(ash);
    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({ email: ash.email, username: ash.username });
    expect(typeof response.body.accessToken).toBe("string");

    const cookie = refreshCookie(response);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/auth/);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Expires=/i);
  });

  it("nunca devuelve la contraseña ni su hash", async () => {
    const response = await request(app).post("/auth/register").send(ash);
    const body = JSON.stringify(response.body);
    expect(body).not.toMatch(/password/i);
    expect(body).not.toContain("$2");
  });

  it("guarda el email en minúsculas y detecta duplicados sin importar las mayúsculas", async () => {
    await request(app).post("/auth/register").send({ ...ash, email: "ASH@Example.com" });
    const response = await request(app).post("/auth/register").send({ ...ash, username: "otro" });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("responde 409 USERNAME_TAKEN para un username repetido", async () => {
    await request(app).post("/auth/register").send(ash);
    const response = await request(app)
      .post("/auth/register")
      .send({ email: "otro@example.com", username: "ASH", password: "pikachu-123" });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("USERNAME_TAKEN");
  });

  it("responde 400 con el detalle por campo cuando los datos son inválidos", async () => {
    const response = await request(app).post("/auth/register").send({ email: "no-es-email", username: "a", password: "1" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    const paths = response.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(["email", "username", "password"]));
  });

  it("responde 400 cuando no hay cuerpo", async () => {
    const response = await request(app).post("/auth/register");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("responde 400 cuando la contraseña supera los 72 bytes", async () => {
    const response = await request(app)
      .post("/auth/register")
      .send({ ...ash, password: "ñ".repeat(37) });
    expect(response.status).toBe(400);
  });

  it("acepta contraseñas con caracteres no ASCII", async () => {
    const response = await request(app)
      .post("/auth/register")
      .send({ ...ash, password: "Contraseña-Ñandú-😀" });
    expect(response.status).toBe(201);
    const login = await request(app).post("/auth/login").send({ email: ash.email, password: "Contraseña-Ñandú-😀" });
    expect(login.status).toBe(200);
  });
});

describe("POST /auth/login", () => {
  beforeEach(async () => {
    await request(app).post("/auth/register").send(ash);
  });

  it("inicia sesión con credenciales correctas", async () => {
    const response = await request(app).post("/auth/login").send({ email: ash.email, password: ash.password });
    expect(response.status).toBe(200);
    expect(response.body.user.username).toBe("ash");
    expect(refreshCookie(response)).toMatch(/HttpOnly/i);
  });

  it("acepta el email con mayúsculas y espacios", async () => {
    const response = await request(app).post("/auth/login").send({ email: "  ASH@example.com ", password: ash.password });
    expect(response.status).toBe(200);
  });

  it("responde 401 INVALID_CREDENTIALS igual para contraseña incorrecta y usuario inexistente", async () => {
    const wrong = await request(app).post("/auth/login").send({ email: ash.email, password: "incorrecta" });
    const unknown = await request(app).post("/auth/login").send({ email: "nadie@example.com", password: "incorrecta" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("responde 400 si falta la contraseña", async () => {
    const response = await request(app).post("/auth/login").send({ email: ash.email });
    expect(response.status).toBe(400);
  });
});

describe("GET /auth/me", () => {
  it("devuelve el usuario con un access token válido", async () => {
    const register = await request(app).post("/auth/register").send(ash);
    const response = await request(app).get("/auth/me").set("Authorization", `Bearer ${register.body.accessToken}`);
    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ email: ash.email, username: ash.username });
  });

  it.each([
    ["sin encabezado", undefined],
    ["sin el prefijo Bearer", "abc"],
    ["con un token inválido", "Bearer no-es-un-jwt"],
    ["con esquema incorrecto", "Basic dXNlcjpwdw=="],
  ])("responde 401 %s", async (_name, header) => {
    const req = request(app).get("/auth/me");
    if (header) req.set("Authorization", header);
    const response = await req;
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("responde 401 con un access token expirado", async () => {
    const expiredApp = buildTestApp({ ACCESS_TOKEN_TTL_SECONDS: "1" });
    const register = await request(expiredApp).post("/auth/register").send(ash);
    await new Promise((resolve) => setTimeout(resolve, 2100));
    const response = await request(expiredApp).get("/auth/me").set("Authorization", `Bearer ${register.body.accessToken}`);
    expect(response.status).toBe(401);
  });

  it("responde 401 si la cuenta fue eliminada después de emitir el token", async () => {
    const register = await request(app).post("/auth/register").send(ash);
    await prisma.user.delete({ where: { id: register.body.user.id } });
    const response = await request(app).get("/auth/me").set("Authorization", `Bearer ${register.body.accessToken}`);
    expect(response.status).toBe(401);
  });
});

describe("POST /auth/refresh y /auth/logout", () => {
  it("renueva la sesión con la cookie y rota el refresh token", async () => {
    const agent = request.agent(app);
    const register = await agent.post("/auth/register").send(ash);
    const firstCookie = refreshCookie(register);

    const refreshed = await agent.post("/auth/refresh");
    expect(refreshed.status).toBe(200);
    expect(typeof refreshed.body.accessToken).toBe("string");
    expect(refreshCookie(refreshed)).not.toBe(firstCookie);
  });

  it("rechaza reutilizar un refresh token ya rotado", async () => {
    const register = await request(app).post("/auth/register").send(ash);
    const oldCookie = refreshCookie(register).split(";")[0]!;
    await request(app).post("/auth/refresh").set("Cookie", oldCookie);

    const replay = await request(app).post("/auth/refresh").set("Cookie", oldCookie);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("INVALID_REFRESH_TOKEN");
  });

  it("responde 401 sin cookie", async () => {
    const response = await request(app).post("/auth/refresh");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_REFRESH_TOKEN");
  });

  it("logout responde 204, borra la cookie e invalida el refresh token", async () => {
    const register = await request(app).post("/auth/register").send(ash);
    const cookie = refreshCookie(register).split(";")[0]!;

    const logout = await request(app).post("/auth/logout").set("Cookie", cookie);
    expect(logout.status).toBe(204);
    expect(refreshCookie(logout)).toMatch(/refresh_token=;/);

    const after = await request(app).post("/auth/refresh").set("Cookie", cookie);
    expect(after.status).toBe(401);
  });

  it("logout sin sesión también responde 204", async () => {
    const response = await request(app).post("/auth/logout");
    expect(response.status).toBe(204);
  });
});

describe("CORS y rutas desconocidas", () => {
  it("permite el origen configurado con credenciales", async () => {
    const response = await request(app).get("/health").set("Origin", "http://localhost:5173");
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("no concede CORS a otros orígenes", async () => {
    const response = await request(app).get("/health").set("Origin", "http://malicioso.example");
    expect(response.headers["access-control-allow-origin"]).not.toBe("http://malicioso.example");
  });

  it("devuelve 404 JSON para rutas desconocidas", async () => {
    const response = await request(app).get("/auth/no-existe");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });
});
