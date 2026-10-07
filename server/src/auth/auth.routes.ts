import { type CookieOptions, type Request, type RequestHandler, type Response, Router } from "express";
import type { Env } from "../config/env.js";
import { AppError } from "../http/errors.js";
import { type KeyedLimiter, rateLimitMiddleware, tooManyRequests } from "../http/rate-limit.js";
import { createRequireAuth, getAuth } from "./auth.middleware.js";
import { loginSchema, preferencesSchema, registerSchema } from "./auth.schemas.js";
import type { AuthResult, AuthService, AuthUser } from "./auth.service.js";
import type { TokenService } from "./tokens.js";

export const REFRESH_COOKIE = "refresh_token";

export interface AuthRouterDeps {
  env: Env;
  authService: AuthService;
  tokens: TokenService;
  /** Límites de intentos; sin ellos no se limita nada (las pruebas que no los necesitan). */
  limiters?: { loginFailures?: KeyedLimiter; register?: KeyedLimiter };
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

export function createAuthRouter({ env, authService, tokens, limiters = {} }: AuthRouterDeps): Router {
  const router = Router();
  const limitRegistrations: RequestHandler = limiters.register
    ? rateLimitMiddleware({ limiter: limiters.register, keyOf: clientIp })
    : (_req, _res, next) => next();
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

  router.post("/register", limitRegistrations, async (req, res) => {
    const input = registerSchema.parse(req.body);
    const result = await authService.register(input);
    startSession(res, result);
    res.status(201).json({ user: toUserDto(result.user), accessToken: result.accessToken });
  });

  router.post("/login", async (req, res) => {
    const input = loginSchema.parse(req.body);
    // La clave lleva la IP y el correo: no es un bloqueo de la cuenta, así que nadie puede dejar fuera a otra persona
    // escribiendo su correo. Solo cuentan los intentos fallidos; un inicio de sesión correcto reinicia la cuenta.
    const attemptKey = `${clientIp(req)}|${input.email}`;
    const status = limiters.loginFailures?.check(attemptKey);
    if (status && !status.allowed) {
      res.set("Retry-After", String(status.retryAfterSeconds));
      throw tooManyRequests(status.retryAfterSeconds, "Demasiados intentos de inicio de sesión. Inténtalo de nuevo más tarde.");
    }
    let result: AuthResult;
    try {
      result = await authService.login(input);
    } catch (error) {
      if (error instanceof AppError && error.code === "INVALID_CREDENTIALS") limiters.loginFailures?.record(attemptKey);
      throw error;
    }
    limiters.loginFailures?.reset(attemptKey);
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

  return router;
}
