import { z } from "zod";
import { MAX_PASSWORD_BYTES } from "./password.js";

const email = z.string().trim().toLowerCase().pipe(z.email("Email inválido").max(255, "Email demasiado largo"));

export const registerSchema = z.object({
  email,
  username: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]{3,30}$/, "Usa de 3 a 30 letras, números o guion bajo"),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .refine((value) => Buffer.byteLength(value, "utf8") <= MAX_PASSWORD_BYTES, {
      message: `La contraseña no puede superar ${MAX_PASSWORD_BYTES} bytes`,
    }),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "La contraseña es obligatoria").max(1024),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
