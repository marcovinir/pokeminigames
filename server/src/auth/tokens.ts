import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { AppError } from "../http/errors.js";

export interface AccessTokenPayload {
  /** Id del usuario (o el `guest_…` de un invitado). */
  sub: string;
  username: string;
  /** Solo está (y vale `true`) en los tokens de invitado: los de cuenta nunca lo llevan. */
  guest?: true;
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
    signAccessToken({ sub, username, guest }) {
      return jwt.sign({ username, ...(guest ? { guest: true } : {}) }, secret, {
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
        // Un `aud` es de la cookie de invitado (`guest-session`): ese token no es un token de acceso.
        if (decoded.aud !== undefined) throw new Error("no es un token de acceso");
        return { sub: decoded.sub, username: decoded.username, ...(decoded.guest === true ? { guest: true as const } : {}) };
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
