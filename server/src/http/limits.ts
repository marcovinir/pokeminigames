const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export interface WindowLimit {
  limit: number;
  windowMs: number;
}

export interface RateLimitConfig {
  /** Intentos de inicio de sesión **fallidos** por combinación de IP y correo; un login correcto reinicia la cuenta. */
  loginFailures: WindowLimit;
  /** Intentos de inicio de sesión **fallidos** por IP sumando todos los correos (contra probar una contraseña en muchas cuentas). */
  loginFailuresByIp: WindowLimit;
  /** Cuentas creadas por IP. El hueco se reserva antes de crear la cuenta y, si falla, se devuelve. */
  register: WindowLimit;
  /** Intentos de registro que fallan (cuenta repetida, datos inválidos) por IP: no gastan las cuentas de arriba. */
  registerFailures: WindowLimit;
  /** Sesiones de invitado creadas por IP (no hay cuenta ni contraseña que proteger, pero sí servidor y memoria). */
  guestSessions: WindowLimit;
  /** Peticiones a toda la API por IP. */
  api: WindowLimit;
  /** Reloj inyectable para las pruebas. */
  now?: () => number;
}

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  loginFailures: { limit: 5, windowMs: 15 * MINUTE },
  loginFailuresByIp: { limit: 30, windowMs: 15 * MINUTE },
  register: { limit: 5, windowMs: HOUR },
  registerFailures: { limit: 20, windowMs: HOUR },
  guestSessions: { limit: 20, windowMs: HOUR },
  api: { limit: 300, windowMs: MINUTE },
};

/**
 * Solo producción usa los límites. En desarrollo todo llega desde la misma IP (el proxy de Vite) y las pruebas del
 * servidor los activan a propósito; así quien desarrolla no recibe un 429 al sexto registro.
 */
export function rateLimitsFor(nodeEnv: "development" | "test" | "production"): RateLimitConfig | "off" {
  return nodeEnv === "production" ? DEFAULT_RATE_LIMITS : "off";
}
