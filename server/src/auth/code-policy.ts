/** Las reglas de los códigos que llegan por correo (spec de la etapa 7, secciones 2 y 4). */

/** Dígitos de un código. */
export const CODE_LENGTH = 6;

/** Cuánto vale un código desde que se envía. */
export const CODE_TTL_MINUTES = 10;
export const CODE_TTL_MS = CODE_TTL_MINUTES * 60 * 1000;

/** Intentos que admite un código antes de bloquearse; la base de datos lo exige también. */
export const MAX_CODE_ATTEMPTS = 5;

/** Una cuenta sin verificar y sin historial más vieja que esto se considera libre al registrarse. */
export const PENDING_ACCOUNT_TTL_MS = 24 * 60 * 60 * 1000;
