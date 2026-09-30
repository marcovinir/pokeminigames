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
    CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
    COOKIE_SECURE: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  })
  .refine((env) => env.COOKIE_SAME_SITE !== "none" || env.COOKIE_SECURE, {
    message: "COOKIE_SAME_SITE=none exige COOKIE_SECURE=true",
    path: ["COOKIE_SAME_SITE"],
  });

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
