import { isDeletedUsername } from "@pokemon-minigames/shared";
import type { ApiError } from "../api/client";

export interface FieldErrors {
  email?: string;
  username?: string;
  password?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME = /^[A-Za-z0-9_]{3,30}$/;
const MAX_PASSWORD_BYTES = 72;
const USERNAME_ERROR = "Usa de 3 a 30 letras, números o guion bajo.";

function emailError(email: string): string | undefined {
  return EMAIL.test(email.trim()) ? undefined : "Escribe un email válido.";
}

/** Las mismas reglas que aplica el servidor, para avisar antes de enviar. */
export function validateLogin(input: { email: string; password: string }): FieldErrors {
  const errors: FieldErrors = {};
  const email = emailError(input.email);
  if (email) errors.email = email;
  if (!input.password) errors.password = "Escribe tu contraseña.";
  return errors;
}

/** El nombre de usuario (de una cuenta o de un invitado): la misma regla que el servidor, incluido el prefijo reservado. */
export function validateUsername(name: string): string | undefined {
  const clean = name.trim();
  if (!USERNAME.test(clean)) return USERNAME_ERROR;
  return isDeletedUsername(clean) ? "Ese nombre está reservado." : undefined;
}

export function validateRegistration(input: { email: string; username: string; password: string }): FieldErrors {
  const errors: FieldErrors = {};
  const email = emailError(input.email);
  if (email) errors.email = email;
  const username = validateUsername(input.username);
  if (username) errors.username = username;
  if (input.password.length < 8) {
    errors.password = "La contraseña debe tener al menos 8 caracteres.";
  } else if (new TextEncoder().encode(input.password).length > MAX_PASSWORD_BYTES) {
    errors.password = `La contraseña no puede superar ${MAX_PASSWORD_BYTES} bytes (las tildes y los emoji ocupan más de uno).`;
  }
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
