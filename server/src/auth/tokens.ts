import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { AppError } from "../http/errors.js";

export interface AccessTokenPayload {
  /** Id del usuario. */
  sub: string;
  username: string;
}

export interface TokenService {
  signAccessToken(payload: AccessTokenPayload): string;
  /** Lanza AppError(401, "UNAUTHORIZED") si el token es inválido, está manipulado o expiró. */
  verifyAccessToken(token: string): AccessTokenPayload;
  /** Token opaco aleatorio para la cookie de refresco. */
  generateRefreshToken(): string;
  /** Hash con el que se guarda el refresh token en la base de datos. */
  hashRefreshToken(token: string): string;
}

export interface TokenServiceOptions {
  secret: string;
  accessTtlSeconds: number;
}

const ALGORITHM = "HS256";

export function createTokenService({ secret, accessTtlSeconds }: TokenServiceOptions): TokenService {
  return {
    signAccessToken({ sub, username }) {
      return jwt.sign({ username }, secret, {
        algorithm: ALGORITHM,
        subject: sub,
        expiresIn: accessTtlSeconds,
      });
    },

    verifyAccessToken(token) {
      try {
        const decoded = jwt.verify(token, secret, { algorithms: [ALGORITHM] });
        if (typeof decoded === "string" || typeof decoded.sub !== "string" || typeof decoded.username !== "string") {
          throw new Error("payload inesperado");
        }
        return { sub: decoded.sub, username: decoded.username };
      } catch {
        throw new AppError(401, "UNAUTHORIZED", "Token de acceso inválido o expirado");
      }
    },

    generateRefreshToken() {
      return randomBytes(32).toString("base64url");
    },

    hashRefreshToken(token) {
      return createHash("sha256").update(token).digest("hex");
    },
  };
}
