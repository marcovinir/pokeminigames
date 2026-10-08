import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MailerError } from "../../src/mail/mailer.js";
import { MemoryMailer } from "../../src/mail/memory-mailer.js";
import { DEFAULT_RATE_LIMITS } from "../../src/http/limits.js";
import { buildTestContext } from "../helpers/app.js";
import { prisma, resetDatabase } from "../helpers/db.js";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const ash = { email: "ash@example.com", username: "ash", password: "pikachu-123" };

beforeEach(resetDatabase);
afterEach(() => vi.restoreAllMocks());
afterAll(() => prisma.$disconnect());

/** La aplicación con la verificación activada y un buzón en memoria que la prueba puede leer. */
function setup(overrides: Record<string, string> = {}, options: Parameters<typeof buildTestContext>[1] = {}) {
  const mailer = new MemoryMailer();
  const ctx = buildTestContext({ EMAIL_VERIFICATION: "on", ...overrides }, { mailer, ...options });
  return { ...ctx, mailer };
}

/** Lo mismo con los límites de producción y el reloj de la prueba. */
function limited(overrides: Record<string, string> = {}) {
  const holder: { now: () => number } = { now: () => 0 };
  const env = setup({ TRUST_PROXY: "1", ...overrides }, { rateLimits: { ...DEFAULT_RATE_LIMITS, now: () => holder.now() } });
  holder.now = () => env.time.now();
  return env;
}

const from = (ip: string) => ({ "X-Forwarded-For": ip });

function codeIn(mailer: MemoryMailer, email: string): string {
  const mail = mailer.to(email).at(-1);
  if (!mail) throw new Error(`No se envió ningún correo a ${email}`);
  return /(\d{6})/.exec(mail.text)![1]!;
}

const wrong = (code: string): string => (code === "000000" ? "000001" : "000000");

function refreshCookie(response: request.Response): string | undefined {
  const cookies = (response.headers["set-cookie"] ?? []) as unknown as string[];
  return cookies.find((c) => c.startsWith("refresh_token="));
}

/** Una cuenta verificada, con su sesión: se registra con el interruptor activo y se verifica con el código del buzón. */
async function verifiedAccount(env: ReturnType<typeof setup>, account = ash) {
  await request(env.app).post("/auth/register").send(account);
  const response = await request(env.app).post("/auth/verify-email").send({ email: account.email, code: codeIn(env.mailer, account.email) });
  expect(response.status).toBe(200);
  return response;
}

const attemptsFor = async (email: string, purpose: "verify_email" | "reset_password" = "verify_email") => {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return (await prisma.emailCode.findUniqueOrThrow({ where: { userId_purpose: { userId: user.id, purpose } } })).attempts;
};

describe("GET /auth/options", () => {
  it("dice si la verificación por correo está activa", async () => {
    expect((await request(setup().app).get("/auth/options")).body).toEqual({ emailVerification: true });
    expect((await request(buildTestContext().app).get("/auth/options")).body).toEqual({ emailVerification: false });
  });
});

describe("con el interruptor apagado todo es como antes", () => {
  const off = () => buildTestContext();

  it("las rutas de los códigos no existen: 404", async () => {
    const { app } = off();
    for (const [method, path] of [
      ["post", "/auth/verify-email"],
      ["post", "/auth/verification/resend"],
      ["post", "/auth/password/forgot"],
      ["post", "/auth/password/reset"],
    ] as const) {
      const response = await request(app)[method](path).send({ email: ash.email, code: "123456", password: "pikachu-123" });
      expect(response.status, path).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    }
  });

  it("registrarse da la sesión en el acto (201) y entrar no pide verificar nada", async () => {
    const { app, mailer } = off();
    const registered = await request(app).post("/auth/register").send(ash);
    expect(registered.status).toBe(201);
    expect(registered.body.accessToken).toEqual(expect.any(String));
    expect(refreshCookie(registered)).toBeDefined();
    expect((await request(app).post("/auth/login").send({ email: ash.email, password: ash.password })).status).toBe(200);
    expect((mailer as MemoryMailer).sent).toHaveLength(0);
  });
});

describe("POST /auth/register con la verificación activa", () => {
  it("crea la cuenta pendiente, envía el código y responde 202 sin sesión", async () => {
    const env = setup();
    const response = await request(env.app).post("/auth/register").send(ash);
    expect(response.status).toBe(202);
    expect(response.body).toEqual({ verification: "required", email: ash.email });
    expect(refreshCookie(response)).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toMatch(/token|password/i);
    expect(env.mailer.to(ash.email)).toHaveLength(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: ash.email } })).emailVerifiedAt).toBeNull();
  });

  it("guarda el correo en minúsculas y responde con él", async () => {
    const env = setup();
    const response = await request(env.app).post("/auth/register").send({ ...ash, email: "ASH@Example.com" });
    expect(response.body.email).toBe("ash@example.com");
    expect(env.mailer.to("ash@example.com")).toHaveLength(1);
  });

  it("datos inválidos: 400 y no se envía nada", async () => {
    const env = setup();
    const response = await request(env.app).post("/auth/register").send({ email: "no-es-email", username: "a", password: "1" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(env.mailer.sent).toHaveLength(0);
  });

  it("un correo de una cuenta verificada: 409 EMAIL_TAKEN; el de una pendiente se reemplaza", async () => {
    const env = setup();
    await verifiedAccount(env);
    const taken = await request(env.app).post("/auth/register").send({ ...ash, username: "otro" });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe("EMAIL_TAKEN");

    const second = { email: "misty@example.com", username: "misty", password: "pikachu-123" };
    expect((await request(env.app).post("/auth/register").send(second)).status).toBe(202);
    expect((await request(env.app).post("/auth/register").send({ ...second, username: "misty2" })).status).toBe(202);
    expect(await prisma.user.count({ where: { email: second.email } })).toBe(1);
    expect(env.mailer.to(second.email)).toHaveLength(2);
  });

  it("si el proveedor falla: 502 EMAIL_SEND_FAILED sin nada del proveedor, y la cuenta queda pendiente", async () => {
    const env = setup();
    env.mailer.failWith = new MailerError(403, "Resend respondió 403 (invalid_api_key) re_clave_secreta");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await request(env.app).post("/auth/register").send(ash);
    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe("EMAIL_SEND_FAILED");
    expect(JSON.stringify(response.body)).not.toMatch(/Resend|403|re_clave/);
    expect(await prisma.user.count()).toBe(1);
  });
});

describe("POST /auth/verify-email", () => {
  it("con el código correcto verifica la cuenta y abre la sesión: 200, usuario, access token y cookie", async () => {
    const env = setup();
    await request(env.app).post("/auth/register").send(ash);
    const response = await request(env.app).post("/auth/verify-email").send({ email: ash.email, code: codeIn(env.mailer, ash.email) });
    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ email: ash.email, username: ash.username });
    expect(response.body.accessToken).toEqual(expect.any(String));
    const cookie = refreshCookie(response);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/auth/);
    expect(JSON.stringify(response.body)).not.toMatch(/password|hash/i);
    expect((await request(env.app).post("/auth/login").send({ email: ash.email, password: ash.password })).status).toBe(200);
  });

  it("un código equivocado, uno ya gastado y un correo que no existe dan el mismo 400 INVALID_CODE con el mismo cuerpo", async () => {
    const env = setup();
    await request(env.app).post("/auth/register").send(ash);
    const code = codeIn(env.mailer, ash.email);
    const bad = await request(env.app).post("/auth/verify-email").send({ email: ash.email, code: wrong(code) });
    const unknown = await request(env.app).post("/auth/verify-email").send({ email: "nadie@example.com", code });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("INVALID_CODE");
    expect(unknown.status).toBe(bad.status);
    expect(unknown.body).toEqual(bad.body);

    await request(env.app).post("/auth/verify-email").send({ email: ash.email, code });
    const spent = await request(env.app).post("/auth/verify-email").send({ email: ash.email, code });
    expect(spent.status).toBe(400);
    expect(spent.body).toEqual(bad.body);
  });

  it("un código con mal formato da 400 VALIDATION_ERROR y no gasta ningún intento", async () => {
    const env = setup();
    await request(env.app).post("/auth/register").send(ash);
    for (const code of ["12345", "1234567", "12a456", "", "abcdef"]) {
      const response = await request(env.app).post("/auth/verify-email").send({ email: ash.email, code });
      expect(response.status, code).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect(await attemptsFor(ash.email)).toBe(0);
  });

  it("antes de verificar, entrar da 403 EMAIL_NOT_VERIFIED y se envía un código nuevo en segundo plano", async () => {
    const env = setup();
    await request(env.app).post("/auth/register").send(ash);
    const login = await request(env.app).post("/auth/login").send({ email: ash.email, password: ash.password });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe("EMAIL_NOT_VERIFIED");
    expect(refreshCookie(login)).toBeUndefined();
    await vi.waitFor(() => expect(env.mailer.to(ash.email)).toHaveLength(2));
    const bad = await request(env.app).post("/auth/login").send({ email: ash.email, password: "mala-clave-1" });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("renovar la sesión de una cuenta sin verificar da 403 EMAIL_NOT_VERIFIED", async () => {
    const off = buildTestContext();
    const registered = await request(off.app).post("/auth/register").send(ash);
    const cookie = refreshCookie(registered)!;
    const on = setup();
    const response = await request(on.app).post("/auth/refresh").set("Cookie", cookie.split(";")[0]!);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("EMAIL_NOT_VERIFIED");
  });
});

describe("POST /auth/verification/resend", () => {
  it("a una cuenta sin verificar le llega un código nuevo; responde 202 { ok: true }", async () => {
    const env = setup();
    await request(env.app).post("/auth/register").send(ash);
    const response = await request(env.app).post("/auth/verification/resend").send({ email: ash.email });
    expect(response.status).toBe(202);
    expect(response.body).toEqual({ ok: true });
    await vi.waitFor(() => expect(env.mailer.to(ash.email)).toHaveLength(2));
  });

  it("contesta lo mismo, con el mismo cuerpo, a una cuenta verificada y a un correo que no existe, y no les envía nada", async () => {
    const env = setup();
    await request(env.app).post("/auth/register").send(ash);
    const pending = await request(env.app).post("/auth/verification/resend").send({ email: ash.email });
    const unknown = await request(env.app).post("/auth/verification/resend").send({ email: "nadie@example.com" });
    expect(unknown.status).toBe(pending.status);
    expect(unknown.body).toEqual(pending.body);
    await vi.waitFor(() => expect(env.mailer.to(ash.email)).toHaveLength(2));
    expect(env.mailer.to("nadie@example.com")).toHaveLength(0);
  });

  it("un correo con mal formato da 400", async () => {
    const response = await request(setup().app).post("/auth/verification/resend").send({ email: "no-es-correo" });
    expect(response.status).toBe(400);
  });
});

describe("recuperar la contraseña", () => {
  it("«olvidé» y «reenviar» contestan antes de buscar la cuenta y de enviar: ni el tiempo delata si el correo existe", async () => {
    const env = setup();
    await request(env.app).post("/auth/register").send(ash);
    const original = env.mailer.send.bind(env.mailer);
    let finished = 0;
    env.mailer.send = async (mail) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await original(mail);
      finished++;
    };
    for (const path of ["/auth/password/forgot", "/auth/verification/resend"]) {
      finished = 0;
      const response = await request(env.app).post(path).send({ email: ash.email });
      expect(response.status, path).toBe(202);
      expect(finished, `${path}: ya había terminado de enviar al contestar`).toBe(0);
      await vi.waitFor(() => expect(finished, path).toBe(1));
    }
  });

  it("«olvidé» contesta 202 { ok: true } y a una cuenta que existe le llega el código en segundo plano", async () => {
    const env = setup();
    await verifiedAccount(env);
    env.mailer.clear();
    const response = await request(env.app).post("/auth/password/forgot").send({ email: ash.email });
    expect(response.status).toBe(202);
    expect(response.body).toEqual({ ok: true });
    await vi.waitFor(() => expect(env.mailer.to(ash.email)).toHaveLength(1));
    expect(env.mailer.to(ash.email)[0]!.subject).toContain("contraseña");
  });

  it("contesta exactamente lo mismo, con el mismo cuerpo y las mismas cabeceras, a un correo que no existe, y no envía nada", async () => {
    const env = setup();
    await verifiedAccount(env);
    env.mailer.clear();
    const unknown = await request(env.app).post("/auth/password/forgot").send({ email: "nadie@example.com" });
    const known = await request(env.app).post("/auth/password/forgot").send({ email: ash.email });
    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    expect(Object.keys(unknown.headers).sort()).toEqual(Object.keys(known.headers).sort());
    await vi.waitFor(() => expect(env.mailer.to(ash.email)).toHaveLength(1));
    expect(env.mailer.to("nadie@example.com")).toHaveLength(0);
  });

  it("cambia la contraseña con el código: 204, la nueva entra, la vieja no y las sesiones abiertas se cierran", async () => {
    const env = setup();
    const verified = await verifiedAccount(env);
    const oldCookie = refreshCookie(verified)!.split(";")[0]!;
    env.mailer.clear();
    await request(env.app).post("/auth/password/forgot").send({ email: ash.email });
    await vi.waitFor(() => expect(env.mailer.to(ash.email)).toHaveLength(1));

    const reset = await request(env.app)
      .post("/auth/password/reset")
      .send({ email: ash.email, code: codeIn(env.mailer, ash.email), password: "nueva-clave-1" });
    expect(reset.status).toBe(204);
    expect(refreshCookie(reset)).toBeUndefined();

    expect((await request(env.app).post("/auth/login").send({ email: ash.email, password: "nueva-clave-1" })).status).toBe(200);
    expect((await request(env.app).post("/auth/login").send({ email: ash.email, password: ash.password })).status).toBe(401);
    expect((await request(env.app).post("/auth/refresh").set("Cookie", oldCookie)).status).toBe(401);
  });

  it("un código equivocado o un correo que no existe dan el mismo 400 INVALID_CODE", async () => {
    const env = setup();
    await verifiedAccount(env);
    env.mailer.clear();
    await request(env.app).post("/auth/password/forgot").send({ email: ash.email });
    await vi.waitFor(() => expect(env.mailer.to(ash.email)).toHaveLength(1));
    const code = codeIn(env.mailer, ash.email);

    const bad = await request(env.app).post("/auth/password/reset").send({ email: ash.email, code: wrong(code), password: "nueva-clave-1" });
    const unknown = await request(env.app).post("/auth/password/reset").send({ email: "nadie@example.com", code, password: "nueva-clave-1" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("INVALID_CODE");
    expect(unknown.body).toEqual(bad.body);
    expect((await request(env.app).post("/auth/login").send({ email: ash.email, password: ash.password })).status).toBe(200);
  });

  it("una contraseña inválida da 400 VALIDATION_ERROR y no gasta ningún intento ni el código", async () => {
    const env = setup();
    await verifiedAccount(env);
    env.mailer.clear();
    await request(env.app).post("/auth/password/forgot").send({ email: ash.email });
    await vi.waitFor(() => expect(env.mailer.to(ash.email)).toHaveLength(1));
    const code = codeIn(env.mailer, ash.email);

    const tooShort = await request(env.app).post("/auth/password/reset").send({ email: ash.email, code, password: "corta" });
    expect(tooShort.status).toBe(400);
    expect(tooShort.body.error.code).toBe("VALIDATION_ERROR");
    const tooLong = await request(env.app).post("/auth/password/reset").send({ email: ash.email, code, password: "x".repeat(73) });
    expect(tooLong.status).toBe(400);
    expect(await attemptsFor(ash.email, "reset_password")).toBe(0);

    expect((await request(env.app).post("/auth/password/reset").send({ email: ash.email, code, password: "nueva-clave-1" })).status).toBe(204);
  });
});

describe("límites con los valores de producción", () => {
  it("«olvidé» dos veces seguidas al mismo correo: la segunda da 429 con la espera, exista o no la cuenta", async () => {
    const env = limited();
    await verifiedAccount(env);
    env.time.advance(MINUTE); // registrarse ya envió un código: la espera de 60 s cuenta desde ahí
    for (const email of [ash.email, "nadie@example.com"]) {
      expect((await request(env.app).post("/auth/password/forgot").set(from("1.1.1.1")).send({ email })).status).toBe(202);
      const blocked = await request(env.app).post("/auth/password/forgot").set(from("1.1.1.1")).send({ email });
      expect(blocked.status, email).toBe(429);
      expect(blocked.body.error.code).toBe("RATE_LIMITED");
      expect(blocked.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
      expect(blocked.headers["retry-after"]).toBe(String(blocked.body.error.details.retryAfterSeconds));
    }
  });

  it("pasados 60 s vuelve a dejar; y como mucho 5 por hora al mismo correo", async () => {
    const env = limited();
    for (let i = 0; i < 5; i++) {
      expect((await request(env.app).post("/auth/password/forgot").set(from("1.1.1.1")).send({ email: ash.email })).status).toBe(202);
      env.time.advance(MINUTE);
    }
    expect((await request(env.app).post("/auth/password/forgot").set(from("1.1.1.1")).send({ email: ash.email })).status).toBe(429);
    env.time.advance(HOUR);
    expect((await request(env.app).post("/auth/password/forgot").set(from("1.1.1.1")).send({ email: ash.email })).status).toBe(202);
  });

  it("10 envíos por hora desde una IP, a cualquier correo; otra IP no se ve afectada", async () => {
    const env = limited();
    for (let i = 0; i < 10; i++) {
      expect((await request(env.app).post("/auth/password/forgot").set(from("1.1.1.1")).send({ email: `persona${i}@example.com` })).status).toBe(202);
    }
    expect((await request(env.app).post("/auth/password/forgot").set(from("1.1.1.1")).send({ email: "otra@example.com" })).status).toBe(429);
    expect((await request(env.app).post("/auth/password/forgot").set(from("2.2.2.2")).send({ email: "otra@example.com" })).status).toBe(202);
  });

  it("5 códigos equivocados por correo: el sexto intento da 429 aunque sea el correcto, y también con un correo que no existe", async () => {
    const env = limited();
    await request(env.app).post("/auth/register").set(from("1.1.1.1")).send(ash);
    const code = codeIn(env.mailer, ash.email);
    for (const email of [ash.email, "nadie@example.com"]) {
      for (let i = 0; i < 5; i++) {
        const response = await request(env.app).post("/auth/verify-email").set(from("3.3.3.3")).send({ email, code: wrong(code) });
        expect(response.status, `${email} ${i}`).toBe(400);
      }
      const blocked = await request(env.app).post("/auth/verify-email").set(from("3.3.3.3")).send({ email, code });
      expect(blocked.status, email).toBe(429);
      expect(blocked.body.error.code).toBe("RATE_LIMITED");
    }
  });

  it("verificar con el código correcto reinicia la cuenta de fallos del correo", async () => {
    const env = limited();
    await request(env.app).post("/auth/register").set(from("1.1.1.1")).send(ash);
    const code = codeIn(env.mailer, ash.email);
    for (let i = 0; i < 4; i++) await request(env.app).post("/auth/verify-email").set(from("1.1.1.1")).send({ email: ash.email, code: wrong(code) });
    expect((await request(env.app).post("/auth/verify-email").set(from("1.1.1.1")).send({ email: ash.email, code })).status).toBe(200);
    // La cuenta de fallos del correo volvió a cero: caben otros cinco antes del bloqueo.
    for (let i = 0; i < 5; i++) {
      const response = await request(env.app).post("/auth/verify-email").set(from("1.1.1.1")).send({ email: ash.email, code: wrong(code) });
      expect(response.status, `${i}`).toBe(400);
    }
  });

  it("restablecer tiene el mismo límite: 5 códigos equivocados y el sexto da 429 aunque sea el correcto, también con un correo que no existe", async () => {
    const env = limited();
    await verifiedAccount(env);
    // El registro acaba de enviar un código al correo: hay que esperar el minuto para pedir el de la contraseña.
    env.time.advance(MINUTE);
    expect((await request(env.app).post("/auth/password/forgot").set(from("3.3.3.3")).send({ email: ash.email })).status).toBe(202);
    await vi.waitFor(() => expect(env.mailer.to(ash.email)).toHaveLength(2));
    const code = codeIn(env.mailer, ash.email);

    for (const email of [ash.email, "nadie@example.com"]) {
      for (let i = 0; i < 5; i++) {
        const response = await request(env.app).post("/auth/password/reset").set(from("3.3.3.3")).send({ email, code: wrong(code), password: "nueva-clave-1" });
        expect(response.status, `${email} ${i}`).toBe(400);
      }
      const blocked = await request(env.app).post("/auth/password/reset").set(from("3.3.3.3")).send({ email, code, password: "nueva-clave-1" });
      expect(blocked.status, email).toBe(429);
      expect(blocked.body.error.code).toBe("RATE_LIMITED");
    }

    // Nada cambió: la contraseña de siempre sigue entrando.
    expect((await request(env.app).post("/auth/login").set(from("4.4.4.4")).send({ email: ash.email, password: ash.password })).status).toBe(200);
  });

  it("si el proveedor falla al registrarse se devuelve el hueco: se puede reintentar enseguida", async () => {
    const env = limited();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    env.mailer.failWith = new MailerError(503, "Resend respondió 503");
    expect((await request(env.app).post("/auth/register").set(from("1.1.1.1")).send(ash)).status).toBe(502);
    env.mailer.failWith = null;
    expect((await request(env.app).post("/auth/register").set(from("1.1.1.1")).send(ash)).status).toBe(202);
  });

  it("con el proveedor caído los registros siguen contando contra el tope de cuentas por IP: el sexto da 429 y nada se envía", async () => {
    const env = limited();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    env.mailer.failWith = new MailerError(503, "Resend respondió 503");
    // Cada intento hace el trabajo (bcrypt, cuenta pendiente, llamada al proveedor): no puede ser gratis para quien lo repite.
    for (let i = 0; i < 5; i++) {
      const response = await request(env.app)
        .post("/auth/register")
        .set(from("1.1.1.1"))
        .send({ email: `persona${i}@example.com`, username: `persona${i}`, password: "pikachu-123" });
      expect(response.status, `intento ${i}`).toBe(502);
    }
    const blocked = await request(env.app)
      .post("/auth/register")
      .set(from("1.1.1.1"))
      .send({ email: "otra@example.com", username: "otra", password: "pikachu-123" });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
    expect(env.mailer.sent).toHaveLength(0);
    expect(await prisma.user.count()).toBe(5);

    // Otra IP no se ve afectada, y los huecos de los envíos sí se devolvieron (no salió ningún correo).
    env.mailer.failWith = null;
    const other = await request(env.app).post("/auth/register").set(from("2.2.2.2")).send({ email: "persona0@example.com", username: "persona0", password: "pikachu-123" });
    expect(other.status).toBe(202);
  });

  it("registrarse también envía código: el mismo correo dos veces seguidas espera 60 s", async () => {
    const env = limited();
    expect((await request(env.app).post("/auth/register").set(from("1.1.1.1")).send(ash)).status).toBe(202);
    const blocked = await request(env.app).post("/auth/register").set(from("1.1.1.1")).send(ash);
    expect(blocked.status).toBe(429);
    env.time.advance(MINUTE);
    expect((await request(env.app).post("/auth/register").set(from("1.1.1.1")).send(ash)).status).toBe(202);
  });

  it("entrar sin verificar respeta la espera: dos intentos seguidos envían un solo código", async () => {
    const env = limited();
    await request(env.app).post("/auth/register").set(from("1.1.1.1")).send(ash);
    env.time.advance(MINUTE);
    env.mailer.clear();
    for (let i = 0; i < 2; i++) {
      expect((await request(env.app).post("/auth/login").set(from("1.1.1.1")).send({ email: ash.email, password: ash.password })).status).toBe(403);
    }
    await vi.waitFor(() => expect(env.mailer.to(ash.email)).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(env.mailer.to(ash.email)).toHaveLength(1);
  });
});

describe("GET /auth/test-outbox (solo para las pruebas)", () => {
  it("devuelve lo enviado a una dirección con el buzón en memoria", async () => {
    const env = setup();
    await request(env.app).post("/auth/register").send(ash);
    const response = await request(env.app).get("/auth/test-outbox").query({ to: ash.email });
    expect(response.status).toBe(200);
    expect(response.body.messages).toHaveLength(1);
    expect(response.body.messages[0]).toMatchObject({ to: ash.email, subject: "Tu código de Pokémon Minigames" });
    expect(response.body.messages[0].text).toMatch(/\d{6}/);
    expect(Object.keys(response.body.messages[0]).sort()).toEqual(["subject", "text", "to"]);
    expect((await request(env.app).get("/auth/test-outbox").query({ to: "nadie@example.com" })).body.messages).toEqual([]);
    expect((await request(env.app).get("/auth/test-outbox")).status).toBe(400);
  });

  it("no existe con otro proveedor de correo", async () => {
    const consola = setup({ MAIL_PROVIDER: "console" });
    expect((await request(consola.app).get("/auth/test-outbox").query({ to: ash.email })).status).toBe(404);
    const resend = setup({ MAIL_PROVIDER: "resend", RESEND_API_KEY: "re_x", MAIL_FROM: "a@ejemplo.me" });
    expect((await request(resend.app).get("/auth/test-outbox").query({ to: ash.email })).status).toBe(404);
  });

  it("en producción solo existe con ALLOW_MEMORY_MAIL=true (el servidor de la prueba E2E)", async () => {
    const production = { NODE_ENV: "production", COOKIE_SECURE: "true", TRUST_PROXY: "1", EMAIL_VERIFICATION: "on", MAIL_PROVIDER: "memory" };
    expect(() => buildTestContext(production)).toThrow(/ALLOW_MEMORY_MAIL/);
    const e2e = setup({ ...production, ALLOW_MEMORY_MAIL: "true" });
    expect((await request(e2e.app).get("/auth/test-outbox").query({ to: ash.email })).status).toBe(200);
    const real = setup({ ...production, MAIL_PROVIDER: "resend", RESEND_API_KEY: "re_x", MAIL_FROM: "a@ejemplo.me" });
    expect((await request(real.app).get("/auth/test-outbox").query({ to: ash.email })).status).toBe(404);
    // Con la verificación apagada la configuración no pide nada de correo, pero el buzón sigue sin existir en producción sin el permiso.
    const off = setup({ ...production, EMAIL_VERIFICATION: "off" });
    expect((await request(off.app).get("/auth/test-outbox").query({ to: ash.email })).status).toBe(404);
  });
});

describe("los códigos no se escriben en ningún registro", () => {
  it("ni en la consola ni en los errores durante un registro, una verificación y una recuperación completos (también con el proveedor caído)", async () => {
    const logs: string[] = [];
    const capture = (...args: unknown[]) => void logs.push(args.map(String).join(" "));
    vi.spyOn(console, "log").mockImplementation(capture);
    vi.spyOn(console, "info").mockImplementation(capture);
    vi.spyOn(console, "warn").mockImplementation(capture);
    vi.spyOn(console, "error").mockImplementation(capture);

    const env = setup();
    const issued: string[] = [];
    await request(env.app).post("/auth/register").send(ash);
    issued.push(codeIn(env.mailer, ash.email));
    await request(env.app).post("/auth/verify-email").send({ email: ash.email, code: issued[0] });
    await request(env.app).post("/auth/password/forgot").send({ email: ash.email });
    await vi.waitFor(() => expect(env.mailer.to(ash.email)).toHaveLength(2));
    issued.push(codeIn(env.mailer, ash.email));
    env.mailer.failWith = new MailerError(500, "Resend respondió 500");
    await request(env.app).post("/auth/verification/resend").send({ email: "otra@example.com" });
    await request(env.app).post("/auth/register").send({ email: "otra@example.com", username: "otra", password: "pikachu-123" });
    await request(env.app).post("/auth/password/reset").send({ email: ash.email, code: issued[1], password: "nueva-clave-1" });
    await new Promise((resolve) => setTimeout(resolve, 100));

    for (const code of issued) expect(logs.join("\n")).not.toContain(code);
    expect(logs.join("\n")).not.toContain(ash.email);
  });
});
