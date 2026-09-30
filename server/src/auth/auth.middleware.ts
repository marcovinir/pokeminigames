import type { RequestHandler, Response } from "express";
import { AppError } from "../http/errors.js";
import type { AccessTokenPayload, TokenService } from "./tokens.js";

export interface AuthContext {
  userId: string;
  username: string;
}

/** Exige `Authorization: Bearer <accessToken>` y deja el usuario en `res.locals.auth`. */
export function createRequireAuth(tokens: TokenService): RequestHandler {
  return (req, res, next) => {
    const header = req.headers.authorization;
    const match = header ? /^Bearer (\S+)$/.exec(header) : null;
    if (!match?.[1]) {
      throw new AppError(401, "UNAUTHORIZED", "Falta el token de acceso");
    }
    const payload: AccessTokenPayload = tokens.verifyAccessToken(match[1]);
    res.locals.auth = { userId: payload.sub, username: payload.username } satisfies AuthContext;
    next();
  };
}

export function getAuth(res: Response): AuthContext {
  return res.locals.auth as AuthContext;
}
