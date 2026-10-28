import { type CookieOptions, type Request, type Response, Router } from "express";
import type { Env } from "../config/env.js";
import { AppError } from "../http/errors.js";
import { type KeyedLimiter, tooManyRequests } from "../http/rate-limit.js";
import { createRequireAccount, getAuth } from "./auth.middleware.js";
import { avatarSchema, deleteAccountSchema, guestSchema, loginSchema, preferencesSchema, registerSchema } from "./auth.schemas.js";
import type { AuthResult, AuthService, AuthUser } from "./auth.service.js";
import { GUEST_COOKIE, type GuestSessions, type IssuedGuestSession } from "./guest-sessions.js";
import type { TokenService } from "./tokens.js";

export const REFRESH_COOKIE = "refresh_token";

export interface AuthRouterDeps {
  env: Env;
  authService: AuthService;
  tokens: TokenService;
  /** Las sesiones de invitado (la cookie firmada): los invitados no tienen fila en la base de datos. */
  guests: GuestSessions;
  /** Límites de intentos; sin ellos no se limita nada (las pruebas que no los necesitan). */
  limiters?: {
    loginFailures?: KeyedLimiter;
    loginFailuresByIp?: KeyedLimiter;
    register?: KeyedLimiter;
    registerFailures?: KeyedLimiter;
    guestSessions?: KeyedLimiter;
  };
}

const clientIp = (req: Request): string => req.ip ?? "desconocida";

function toUserDto(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    createdAt: user.createdAt.toISOString(),
    preferences: user.preferences,
    avatarId: user.avatarId,
  };
}

function toGuestDto(guest: { id: string; username: string }) {
  return { id: guest.id, username: guest.username, guest: true as const };
}

export function createAuthRouter({ env, authService, tokens, guests, limiters = {} }: AuthRouterDeps): Router {
  const router = Router();
  const requireAccount = createRequireAccount(tokens);

  // La cookie solo viaja a /auth: el resto de la API nunca la recibe.
  const cookieOptions: CookieOptions = {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    path: "/auth",
  };

  const hasGuestCookie = (req: Request): boolean => req.cookies?.[GUEST_COOKIE] !== undefined;

  /** Una cuenta que entra sustituye al invitado: si la petición traía su cookie, se borra. */
  function startSession(req: Request, res: Response, result: AuthResult): void {
    res.cookie(REFRESH_COOKIE, result.refreshToken, { ...cookieOptions, expires: result.refreshExpiresAt });
    if (hasGuestCookie(req)) res.clearCookie(GUEST_COOKIE, cookieOptions);
  }

  function startGuestSession(res: Response, guest: IssuedGuestSession): void {
    res.cookie(GUEST_COOKIE, guest.cookie, { ...cookieOptions, expires: guest.expiresAt });
    res.json({ user: toGuestDto(guest), accessToken: tokens.signAccessToken({ sub: guest.id, username: guest.username, guest: true }) });
  }

  function endSession(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
    res.clearCookie(GUEST_COOKIE, cookieOptions);
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
    let result: AuthResult;
    try {
      const input = registerSchema.parse(req.body);
      result = await authService.register(input);
    } catch (error) {
      created?.release(ip);
      failed?.record(ip);
      throw error;
    }
    startSession(req, res, result);
    res.status(201).json({ user: toUserDto(result.user), accessToken: result.accessToken });
  });

  router.post("/guest", (req, res) => {
    // Un invitado no cuesta una fila ni un hash, pero sí una sesión: se limitan por IP. Un nombre inválido no gasta hueco.
    const { username } = guestSchema.parse(req.body);
    const ip = clientIp(req);
    const status = limiters.guestSessions?.check(ip);
    if (status && !status.allowed) {
      res.set("Retry-After", String(status.retryAfterSeconds));
      throw tooManyRequests(status.retryAfterSeconds);
    }
    limiters.guestSessions?.record(ip);
    res.status(201);
    startGuestSession(res, guests.issue(username));
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
      throw error;
    }
    loginFailures?.reset(attemptKey);
    loginFailuresByIp?.release(ip);
    startSession(req, res, result);
    res.json({ user: toUserDto(result.user), accessToken: result.accessToken });
  });

  router.post("/refresh", async (req, res) => {
    const token: unknown = req.cookies?.[REFRESH_COOKIE];
    const guest = guests.read(req.cookies?.[GUEST_COOKIE]);
    if (typeof token === "string" && token !== "") {
      // Si falla no se borra la cookie: con dos pestañas refrescando a la vez, el 401 del
      // perdedor podría llegar después del 200 del ganador y borrar la cookie ya rotada.
      // Un token inválido es inofensivo; cerrar sesión de verdad es cosa de /auth/logout.
      try {
        const result = await authService.refresh(token);
        startSession(req, res, result);
        res.json({ user: toUserDto(result.user), accessToken: result.accessToken });
        return;
      } catch (error) {
        // Una cookie de cuenta que ya no vale no debe esconder una sesión de invitado que sí; cualquier otro fallo (la base de datos) se propaga.
        if (!guest || !(error instanceof AppError && error.code === "INVALID_REFRESH_TOKEN")) throw error;
      }
    }
    if (!guest) throw new AppError(401, "INVALID_REFRESH_TOKEN", "No hay una sesión activa");
    // Se renueva la cookie con el mismo id: la partida en curso del invitado sigue siendo suya.
    startGuestSession(res, guests.issue(guest.username, guest.id));
  });

  router.post("/logout", async (req, res) => {
    const token: unknown = req.cookies?.[REFRESH_COOKIE];
    if (typeof token === "string" && token !== "") {
      await authService.logout(token);
    }
    endSession(res);
    res.status(204).end();
  });

  router.get("/me", requireAccount, async (_req, res) => {
    const user = await authService.me(getAuth(res).userId);
    res.json({ user: toUserDto(user) });
  });

  router.put("/me/preferences", requireAccount, async (req, res) => {
    const preferences = preferencesSchema.parse(req.body);
    res.json({ preferences: await authService.savePreferences(getAuth(res).userId, preferences) });
  });

  router.put("/me/avatar", requireAccount, async (req, res) => {
    const { avatarId } = avatarSchema.parse(req.body);
    res.json({ avatarId: await authService.saveAvatar(getAuth(res).userId, avatarId) });
  });

  router.delete("/me", requireAccount, async (req, res) => {
    const { password } = deleteAccountSchema.parse(req.body);
    // Probar contraseñas aquí es lo mismo que probarlas en /login: cuenta en el mismo límite de fallos por IP, con el
    // hueco reservado antes de bcrypt y devuelto si el fallo no es de la persona o si acierta.
    const ip = clientIp(req);
    const { loginFailuresByIp } = limiters;
    const status = loginFailuresByIp?.check(ip);
    if (status && !status.allowed) {
      res.set("Retry-After", String(status.retryAfterSeconds));
      throw tooManyRequests(status.retryAfterSeconds, "Demasiados intentos. Inténtalo de nuevo más tarde.");
    }
    loginFailuresByIp?.record(ip);
    try {
      await authService.deleteAccount(getAuth(res).userId, password);
    } catch (error) {
      if (!(error instanceof AppError && error.code === "INVALID_CREDENTIALS")) loginFailuresByIp?.release(ip);
      throw error;
    }
    loginFailuresByIp?.release(ip);
    endSession(res);
    res.status(204).end();
  });

  return router;
}
