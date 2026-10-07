import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.string({ error: "es obligatoria" }).min(1, "es obligatoria"),
    JWT_ACCESS_SECRET: z.string({ error: "es obligatoria" }).min(32, "debe tener al menos 32 caracteres"),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
    BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
    // Con un solo origen (producción) no hay CORS que configurar; en desarrollo el valor por defecto es Vite.
    CORS_ORIGIN: z.string().min(1).optional(),
    // Cuántos proxies hay delante del servidor (en Render se verifica tras desplegar): sin eso la IP y el protocolo que se leen son los del proxy.
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
  .transform((env) => ({
    ...env,
    CORS_ORIGIN: env.CORS_ORIGIN ?? (env.NODE_ENV === "production" ? undefined : "http://localhost:5173"),
    TRUST_PROXY: env.TRUST_PROXY ?? 0,
  }));

export type Env = z.infer<typeof envSchema>;

type Source = Record<string, string | undefined>;

/**
 * Las reglas de producción se miran sobre los valores crudos, no sobre el resultado de zod: zod no ejecuta las reglas
 * cruzadas si falta una variable obligatoria, y así olvidar DATABASE_URL ocultaría el resto de los problemas.
 */
function productionProblems(source: Source): string[] {
  if (source.NODE_ENV !== "production") return [];
  const problems: string[] = [];
  if (source.COOKIE_SECURE !== "true") problems.push("COOKIE_SECURE: en producción debe ser true");
  if (source.COOKIE_SAME_SITE === "none") problems.push("COOKIE_SAME_SITE: en producción no puede ser none (cliente y API comparten origen)");
  if (source.TRUST_PROXY === undefined || source.TRUST_PROXY === "") {
    problems.push("TRUST_PROXY: en producción es obligatoria (cuántos proxies hay delante; en Render, se verifica según docs/despliegue.md)");
  }
  return problems;
}

export function loadEnv(source: Source = process.env): Env {
  const result = envSchema.safeParse(source);
  const problems = [
    ...(result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)),
    ...productionProblems(source),
  ];
  if (!result.success || problems.length > 0) {
    throw new Error(`Variables de entorno inválidas:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
  }
  return result.data;
}
