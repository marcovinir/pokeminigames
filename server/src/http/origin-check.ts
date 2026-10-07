import type { RequestHandler } from "express";
import { AppError } from "./errors.js";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface OriginCheckOptions {
  /** Orígenes adicionales aceptados (p. ej. el cliente de desarrollo). El propio servidor siempre se acepta. */
  allowedOrigins: readonly string[];
}

/**
 * Defensa contra CSRF además de `SameSite=Lax`: una petición que cambia algo se rechaza si el navegador dice que viene
 * de otro sitio. Con `Origin` manda ese: tiene que ser el propio servidor (o uno permitido). Sin él (curl, pruebas, el
 * cliente en desarrollo por el proxy de Vite) se mira `Sec-Fetch-Site`. Los `GET` no se tocan.
 * El propio origen se calcula con el protocolo y el `Host` que ve el servidor (con `trust proxy`, el del proxy).
 */
export function createOriginCheck({ allowedOrigins }: OriginCheckOptions): RequestHandler {
  const forbidden = () => new AppError(403, "FORBIDDEN", "Origen no permitido");
  return (req, _res, next) => {
    if (!UNSAFE_METHODS.has(req.method)) return next();

    const origin = req.get("origin");
    if (origin !== undefined) {
      const own = `${req.protocol}://${req.get("host")}`;
      return origin === own || allowedOrigins.includes(origin) ? next() : next(forbidden());
    }

    const site = req.get("sec-fetch-site");
    return site === "cross-site" || site === "same-site" ? next(forbidden()) : next();
  };
}
