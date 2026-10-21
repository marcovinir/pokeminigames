import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";

/** Nombre de la cookie (HttpOnly, solo viaja a /auth) que guarda la sesión de un invitado. */
export const GUEST_COOKIE = "guest_session";

/** Cuánto dura una sesión de invitado: 24 horas, renovadas cada vez que se recupera la sesión. */
export const GUEST_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** Distingue la cookie de un token de acceso firmado con la misma clave: el token de acceso nunca lleva `aud`. */
const AUDIENCE = "guest-session";
const NAME_PATTERN = /^[A-Za-z0-9_]{3,30}$/;

export interface GuestSession {
  /** `guest_` + 16 bytes aleatorios en base64url: nunca choca con el id de una cuenta (un uuid). */
  id: string;
  username: string;
}

export interface IssuedGuestSession extends GuestSession {
  /** El JWT firmado que va en la cookie. */
  cookie: string;
  expiresAt: Date;
}

export interface GuestSessions {
  /** Crea la sesión de un invitado; con `existingId` renueva la cookie conservando la identidad. */
  issue(username: string, existingId?: string): IssuedGuestSession;
  /** La sesión de una cookie, o `null` si falta, no es un texto, está manipulada, es de otra clave o caducó. Nunca lanza. */
  read(cookie: unknown): GuestSession | null;
}

export interface GuestSessionsOptions {
  secret: string;
  ttlMs: number;
  /** Reloj inyectable para las pruebas. */
  now?: () => number;
}

/**
 * Los invitados no existen en la base de datos: su sesión es la propia cookie, un JWT HS256 firmado con el secreto de los
 * tokens de acceso (de ahí el `aud`, que hace que uno no valga como el otro).
 */
export function createGuestSessions({ secret, ttlMs, now = Date.now }: GuestSessionsOptions): GuestSessions {
  return {
    issue(username, existingId) {
      const id = existingId ?? `guest_${randomBytes(16).toString("base64url")}`;
      const issuedAt = now();
      const expiresAt = new Date(issuedAt + ttlMs);
      const cookie = jwt.sign(
        { username, aud: AUDIENCE, iat: Math.floor(issuedAt / 1000), exp: Math.floor(expiresAt.getTime() / 1000) },
        secret,
        { algorithm: "HS256", subject: id },
      );
      return { id, username, cookie, expiresAt };
    },

    read(cookie) {
      if (typeof cookie !== "string" || cookie === "") return null;
      try {
        const decoded = jwt.verify(cookie, secret, {
          algorithms: ["HS256"],
          audience: AUDIENCE,
          clockTimestamp: Math.floor(now() / 1000),
        });
        if (typeof decoded === "string" || typeof decoded.sub !== "string" || typeof decoded.username !== "string") return null;
        if (!decoded.sub.startsWith("guest_") || !NAME_PATTERN.test(decoded.username)) return null;
        return { id: decoded.sub, username: decoded.username };
      } catch {
        return null;
      }
    },
  };
}
