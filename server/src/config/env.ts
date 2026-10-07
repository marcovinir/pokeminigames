import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.string().min(1, "es obligatoria"),
    JWT_ACCESS_SECRET: z.string().min(32, "debe tener al menos 32 caracteres"),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
    BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
    // Con un solo origen (producción) no hay CORS que configurar; en desarrollo el valor por defecto es Vite.
    CORS_ORIGIN: z.string().min(1).optional(),
    // Cuántos proxies hay delante del servidor (en Render, 1): sin eso la IP y el protocolo que se leen son los del proxy.
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).optional(),
    COOKIE_SECURE: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  })
  .refine((env) => env.COOKIE_SAME_SITE !== "none" || env.COOKIE_SECURE, {
    message: "COOKIE_SAME_SITE=none exige COOKIE_SECURE=true",
    path: ["COOKIE_SAME_SITE"],
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV !== "production") return;
    const problem = (path: string, message: string) => context.addIssue({ code: "custom", path: [path], message });
    if (!env.COOKIE_SECURE) problem("COOKIE_SECURE", "en producción debe ser true");
    if (env.COOKIE_SAME_SITE === "none") problem("COOKIE_SAME_SITE", "en producción no puede ser none (cliente y API comparten origen)");
    if (env.TRUST_PROXY === undefined) problem("TRUST_PROXY", "en producción es obligatoria (cuántos proxies hay delante; en Render, 1)");
  })
  .transform((env) => ({
    ...env,
    CORS_ORIGIN: env.CORS_ORIGIN ?? (env.NODE_ENV === "production" ? undefined : "http://localhost:5173"),
    TRUST_PROXY: env.TRUST_PROXY ?? 0,
  }));

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Variables de entorno inválidas:\n${details}`);
  }
  return result.data;
}
