import { THEME_MODES, THEME_NAMES } from "@pokemon-minigames/shared";
import { z } from "zod";
import { MAX_PASSWORD_BYTES } from "./password.js";

const email = z.string().trim().toLowerCase().pipe(z.email("Email inválido").max(255, "Email demasiado largo"));

/** El nombre de una persona, con cuenta o de invitado: de 3 a 30 letras, números o guion bajo. */
const usernameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_]{3,30}$/, "Usa de 3 a 30 letras, números o guion bajo");

export const registerSchema = z.object({
  email,
  username: usernameSchema,
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .refine((value) => Buffer.byteLength(value, "utf8") <= MAX_PASSWORD_BYTES, {
      message: `La contraseña no puede superar ${MAX_PASSWORD_BYTES} bytes`,
    }),
});

/** Entrar como invitado: solo un nombre, sin correo ni contraseña. */
export const guestSchema = z.object({ username: usernameSchema });

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "La contraseña es obligatoria").max(1024),
});

export const preferencesSchema = z.object({
  theme: z.enum(THEME_NAMES),
  themeMode: z.enum(THEME_MODES),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
