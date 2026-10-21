import type { Request, RequestHandler, Response } from "express";
import { AppError } from "../http/errors.js";
import type { TokenService } from "./tokens.js";

export interface AuthContext {
  userId: string;
  username: string;
  /** Es un invitado: sin cuenta en la base de datos, sin estadísticas. */
  isGuest: boolean;
}

/** Lee `Authorization: Bearer <accessToken>`, lo verifica (cuenta o invitado) y deja la identidad en `res.locals.auth`. */
function authenticate(tokens: TokenService, req: Request, res: Response): AuthContext {
  const header = req.headers.authorization;
  const match = header ? /^Bearer (\S+)$/.exec(header) : null;
  if (!match?.[1]) {
    throw new AppError(401, "UNAUTHORIZED", "Falta el token de acceso");
  }
  const payload = tokens.verifyAccessToken(match[1]);
  const context: AuthContext = { userId: payload.sub, username: payload.username, isGuest: payload.guest === true };
  res.locals.auth = context;
  return context;
}

/**
 * Exige el token de acceso de una **cuenta o de un invitado**. Para las rutas de salas y el tiempo real: un invitado juega
 * igual que una cuenta.
 */
export function createRequireIdentity(tokens: TokenService): RequestHandler {
  return (req, res, next) => {
    authenticate(tokens, req, res);
    next();
  };
}

/** Lo mismo, pero solo cuentas: un invitado recibe 403 `ACCOUNT_REQUIRED` (perfil, estadísticas, preferencias). */
export function createRequireAccount(tokens: TokenService): RequestHandler {
  return (req, res, next) => {
    if (authenticate(tokens, req, res).isGuest) {
      throw new AppError(403, "ACCOUNT_REQUIRED", "Necesitas una cuenta para esto.");
    }
    next();
  };
}

export function getAuth(res: Response): AuthContext {
  return res.locals.auth as AuthContext;
}
