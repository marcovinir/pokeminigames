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
  /** Registros por IP (cuentan todos los intentos, también los que fallan). */
  register: WindowLimit;
  /** Peticiones a toda la API por IP. */
  api: WindowLimit;
  /** Reloj inyectable para las pruebas. */
  now?: () => number;
}

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  loginFailures: { limit: 5, windowMs: 15 * MINUTE },
  loginFailuresByIp: { limit: 30, windowMs: 15 * MINUTE },
  register: { limit: 5, windowMs: HOUR },
  api: { limit: 300, windowMs: MINUTE },
};
