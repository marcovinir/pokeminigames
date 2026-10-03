import { type CookieOptions, type Response, Router } from "express";
import type { Env } from "../config/env.js";
import { AppError } from "../http/errors.js";
import { createRequireAuth, getAuth } from "./auth.middleware.js";
import { loginSchema, preferencesSchema, registerSchema } from "./auth.schemas.js";
import type { AuthResult, AuthService, AuthUser } from "./auth.service.js";
import type { TokenService } from "./tokens.js";

export const REFRESH_COOKIE = "refresh_token";

export interface AuthRouterDeps {
  env: Env;
  authService: AuthService;
  tokens: TokenService;
}

function toUserDto(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    createdAt: user.createdAt.toISOString(),
    preferences: user.preferences,
  };
}

export function createAuthRouter({ env, authService, tokens }: AuthRouterDeps): Router {
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
    const input = registerSchema.parse(req.body);
    const result = await authService.register(input);
    startSession(res, result);
    res.status(201).json({ user: toUserDto(result.user), accessToken: result.accessToken });
  });

  router.post("/login", async (req, res) => {
    const input = loginSchema.parse(req.body);
    const result = await authService.login(input);
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
