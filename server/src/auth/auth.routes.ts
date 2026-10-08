import { type CookieOptions, type Request, type Response, Router } from "express";
import type { Env } from "../config/env.js";
import { AppError } from "../http/errors.js";
import { type KeyedLimiter, tooManyRequests } from "../http/rate-limit.js";
import type { Mailer } from "../mail/mailer.js";
import { MemoryMailer } from "../mail/memory-mailer.js";
import { createRequireAuth, getAuth } from "./auth.middleware.js";
import { loginSchema, preferencesSchema, registerSchema } from "./auth.schemas.js";
import type { AuthResult, AuthService, AuthUser } from "./auth.service.js";
import { type CodeLimits, createCodeLimits } from "./code-limits.js";
import { SEND_LIMIT_MESSAGE, createRecoveryRouter, logBackgroundFailure, rejectWhenBlocked } from "./recovery.routes.js";
import type { TokenService } from "./tokens.js";

export const REFRESH_COOKIE = "refresh_token";

export interface AuthRouterDeps {
  env: Env;
  authService: AuthService;
  tokens: TokenService;
  /** Límites de intentos; sin ellos no se limita nada (las pruebas que no los necesitan). */
  limiters?: { loginFailures?: KeyedLimiter; loginFailuresByIp?: KeyedLimiter; register?: KeyedLimiter; registerFailures?: KeyedLimiter };
  /** Límites de los códigos por correo; sin ellos no se limita nada. */
  codeLimits?: CodeLimits;
  /** Para saber si hay un buzón en memoria (la E2E lee de él los códigos). */
  mailer?: Mailer;
}

const clientIp = (req: Request): string => req.ip ?? "desconocida";

function toUserDto(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    createdAt: user.createdAt.toISOString(),
    preferences: user.preferences,
  };
}

export function createAuthRouter({ env, authService, tokens, limiters = {}, codeLimits = createCodeLimits(), mailer }: AuthRouterDeps): Router {
  const router = Router();
  const requireAuth = createRequireAuth(tokens);

  // La cookie solo viaja a /auth: el resto de la API nunca la recibe.
  const cookieOptions: CookieOptions = {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    path: "/auth",
  };

  function startSession(res: Response, result: AuthResult): void {
    res.cookie(REFRESH_COOKIE, result.refreshToken, { ...cookieOptions, expires: result.refreshExpiresAt });
  }

  function endSession(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
  }

  router.post("/register", async (req, res) => {
    // Dos cuentas por IP: las cuentas creadas (5 por hora) y los intentos que fallan (20 por hora), para que probar unos
    // nombres ya ocupados no deje a nadie sin poder registrarse. El hueco de las cuentas se reserva ANTES de crearla
    // (el hash de la contraseña tarda: contarla al terminar dejaría pasar peticiones en paralelo) y se devuelve si falla.
    const ip = clientIp(req);
    const { register: created, registerFailures: failed } = limiters;
    const waits = [created?.check(ip), failed?.check(ip)].flatMap((status) => (status && !status.allowed ? [status.retryAfterSeconds] : []));
    if (waits.length > 0) {
      const retryAfterSeconds = Math.max(...waits);
      res.set("Retry-After", String(retryAfterSeconds));
      throw tooManyRequests(retryAfterSeconds);
    }
    created?.record(ip);
    let result: AuthResult | null = null;
    let pendingEmail: string | null = null;
    try {
      const input = registerSchema.parse(req.body);
      if (env.EMAIL_VERIFICATION) {
        // Con la verificación activa se crea la cuenta pendiente y se envía un código, sin abrir sesión. Enviar comparte los
        // límites de los envíos; el hueco se devuelve más abajo si el envío no llega a hacerse.
        rejectWhenBlocked(res, codeLimits.reserveSend(ip, input.email), SEND_LIMIT_MESSAGE);
        pendingEmail = input.email;
        await authService.registerPending(input);
      } else {
        result = await authService.register(input);
      }
    } catch (error) {
      const providerDown = error instanceof AppError && error.code === "EMAIL_SEND_FAILED";
      // Con el proveedor caído la cuenta pendiente SÍ se creó (y costó un bcrypt, una transacción y una llamada al proveedor):
      // ese hueco no se devuelve, o se podrían crear cuentas pendientes y repetir ese trabajo sin tope mientras el correo falla.
      if (!providerDown) created?.release(ip);
      // Lo que no es culpa de quien se registra (nuestro límite de envíos o un proveedor caído) no cuenta como intento fallido.
      const ours = error instanceof AppError && (error.code === "RATE_LIMITED" || providerDown);
      if (!ours) failed?.record(ip);
      // Los huecos de los envíos sí se devuelven: no salió ningún correo, y así se puede reintentar enseguida.
      if (pendingEmail !== null) codeLimits.releaseSend(ip, pendingEmail);
      throw error;
    }
    if (result === null) {
      res.status(202).json({ verification: "required", email: pendingEmail });
      return;
    }
    startSession(res, result);
    res.status(201).json({ user: toUserDto(result.user), accessToken: result.accessToken });
  });

  router.post("/login", async (req, res) => {
    const input = loginSchema.parse(req.body);
    // Dos cuentas de fallos: por IP y correo (no es un bloqueo de la cuenta: nadie puede dejar fuera a otra persona
    // escribiendo su correo) y por IP sumando todos los correos (nadie puede probar una contraseña en muchas cuentas ni
    // saturar el servidor con bcrypt). Solo cuentan los intentos fallidos; un inicio de sesión correcto reinicia la cuenta.
    const ip = clientIp(req);
    const attemptKey = `${ip}|${input.email}`;
    const { loginFailures, loginFailuresByIp } = limiters;
    const waits = [loginFailures?.check(attemptKey), loginFailuresByIp?.check(ip)].flatMap((status) =>
      status && !status.allowed ? [status.retryAfterSeconds] : [],
    );
    if (waits.length > 0) {
      const retryAfterSeconds = Math.max(...waits);
      res.set("Retry-After", String(retryAfterSeconds));
      throw tooManyRequests(retryAfterSeconds, "Demasiados intentos de inicio de sesión. Inténtalo de nuevo más tarde.");
    }
    // El hueco se reserva ANTES de comprobar la contraseña (bcrypt tarda): si se contara al terminar, diez peticiones
    // en paralelo pasarían todas la comprobación con la cuenta aún a cero.
    loginFailures?.record(attemptKey);
    loginFailuresByIp?.record(ip);
    let result: AuthResult;
    try {
      result = await authService.login(input);
    } catch (error) {
      if (!(error instanceof AppError && error.code === "INVALID_CREDENTIALS")) {
        // Un fallo nuestro (la base de datos, p. ej.) no es un intento fallido de la persona.
        loginFailures?.release(attemptKey);
        loginFailuresByIp?.release(ip);
      }
      if (error instanceof AppError && error.code === "EMAIL_NOT_VERIFIED" && codeLimits.reserveSend(ip, input.email) === null) {
        // La contraseña era correcta pero falta verificar el correo: se envía un código nuevo, sin esperar al proveedor.
        void authService.resendVerification(input.email).catch(logBackgroundFailure);
      }
      throw error;
    }
    loginFailures?.reset(attemptKey);
    loginFailuresByIp?.release(ip);
    startSession(res, result);
    res.json({ user: toUserDto(result.user), accessToken: result.accessToken });
  });

  router.post("/refresh", async (req, res) => {
    const token: unknown = req.cookies?.[REFRESH_COOKIE];
    if (typeof token !== "string" || token === "") {
      throw new AppError(401, "INVALID_REFRESH_TOKEN", "No hay una sesión activa");
    }
    // Si falla no se borra la cookie: con dos pestañas refrescando a la vez, el 401 del
    // perdedor podría llegar después del 200 del ganador y borrar la cookie ya rotada.
    // Un token inválido es inofensivo; cerrar sesión de verdad es cosa de /auth/logout.
    const result = await authService.refresh(token);
    startSession(res, result);
    res.json({ user: toUserDto(result.user), accessToken: result.accessToken });
  });

  router.post("/logout", async (req, res) => {
    const token: unknown = req.cookies?.[REFRESH_COOKIE];
    if (typeof token === "string" && token !== "") {
      await authService.logout(token);
    }
    endSession(res);
    res.status(204).end();
  });

  router.get("/me", requireAuth, async (_req, res) => {
    const user = await authService.me(getAuth(res).userId);
    res.json({ user: toUserDto(user) });
  });

  router.put("/me/preferences", requireAuth, async (req, res) => {
    const preferences = preferencesSchema.parse(req.body);
    res.json({ preferences: await authService.savePreferences(getAuth(res).userId, preferences) });
  });

  router.get("/options", (_req, res) => {
    res.json({ emailVerification: env.EMAIL_VERIFICATION });
  });

  // Verificar, reenviar y recuperar solo existen con la verificación activa; apagada, la aplicación es la de antes.
  if (env.EMAIL_VERIFICATION) {
    router.use(
      createRecoveryRouter({
        authService,
        codeLimits,
        openSession(res, result) {
          startSession(res, result);
          res.json({ user: toUserDto(result.user), accessToken: result.accessToken });
        },
      }),
    );
  }

  // Solo para la E2E y las pruebas: lee lo que hay en el buzón en memoria. Con otro proveedor, o en producción sin
  // ALLOW_MEMORY_MAIL, la ruta no existe.
  if (mailer instanceof MemoryMailer && env.MAIL_PROVIDER === "memory" && (env.NODE_ENV !== "production" || env.ALLOW_MEMORY_MAIL)) {
    router.get("/test-outbox", (req, res) => {
      const to = typeof req.query.to === "string" ? req.query.to : "";
      if (to === "") throw new AppError(400, "VALIDATION_ERROR", "Falta el correo (to)");
      res.json({ messages: mailer.to(to).map(({ subject, text, to: address }) => ({ to: address, subject, text })) });
    });
  }

  return router;
}
