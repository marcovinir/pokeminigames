import type { ApiError } from "../api/client";

export interface FieldErrors {
  email?: string;
  username?: string;
  password?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME = /^[A-Za-z0-9_]{3,30}$/;
const MAX_PASSWORD_BYTES = 72;

function emailError(email: string): string | undefined {
  return EMAIL.test(email.trim()) ? undefined : "Escribe un email válido.";
}

/** La regla de la contraseña: de 8 caracteres a 72 bytes (bcrypt solo mira los 72 primeros). */
function passwordError(password: string): string | undefined {
  if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    return `La contraseña no puede superar ${MAX_PASSWORD_BYTES} bytes (las tildes y los emoji ocupan más de uno).`;
  }
  return undefined;
}

/** Las mismas reglas que aplica el servidor, para avisar antes de enviar. */
export function validateLogin(input: { email: string; password: string }): FieldErrors {
  const errors: FieldErrors = {};
  const email = emailError(input.email);
  if (email) errors.email = email;
  if (!input.password) errors.password = "Escribe tu contraseña.";
  return errors;
}

/** Solo el correo (para pedir un código). */
export function validateEmail(email: string): { email?: string } {
  const message = emailError(email);
  return message ? { email: message } : {};
}

/** El correo y el código de seis dígitos que llegó. */
export function validateVerification(input: { email: string; code: string }): { email?: string; code?: string } {
  const errors: { email?: string; code?: string } = { ...validateEmail(input.email) };
  if (!/^\d{6}$/.test(input.code)) errors.code = "El código son 6 dígitos.";
  return errors;
}

export function validateRegistration(input: { email: string; username: string; password: string }): FieldErrors {
  const errors: FieldErrors = {};
  const email = emailError(input.email);
  if (email) errors.email = email;
  if (!USERNAME.test(input.username.trim())) errors.username = "Usa de 3 a 30 letras, números o guion bajo.";
  const password = passwordError(input.password);
  if (password) errors.password = password;
  return errors;
}

/** El correo, el código de seis dígitos y la contraseña nueva. */
export function validateReset(input: { email: string; code: string; password: string }): { email?: string; code?: string; password?: string } {
  const errors: { email?: string; code?: string; password?: string } = { ...validateVerification(input) };
  const password = passwordError(input.password);
  if (password) errors.password = password;
  return errors;
}

/** Errores de campo que devuelve el servidor en un 400 (`details: [{ path, message }]`). */
export function serverFieldErrors(error: ApiError): FieldErrors {
  if (error.code !== "VALIDATION_ERROR" || !Array.isArray(error.details)) return {};
  const errors: FieldErrors = {};
  for (const detail of error.details as { path?: string; message?: string }[]) {
    if ((detail.path === "email" || detail.path === "username" || detail.path === "password") && detail.message) {
      errors[detail.path] ??= detail.message;
    }
  }
  return errors;
}
