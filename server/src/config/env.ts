import { z } from "zod";

/** «Nombre <dirección>» o solo la dirección. */
const MAIL_FROM_PATTERN = /^(?:[^<>@\r\n]+<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/;

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
    // Cuentas con código por correo (etapa 7). Apagado, la aplicación se comporta como antes y no pide nada de correo.
    EMAIL_VERIFICATION: z
      .enum(["on", "off"], { error: "debe ser on u off" })
      .default("off")
      .transform((value) => value === "on"),
    // Por defecto: consola en desarrollo y memoria en las pruebas; en producción hay que decirlo (con la verificación activa).
    MAIL_PROVIDER: z.enum(["resend", "console", "memory"], { error: "debe ser resend, console o memory" }).optional(),
    RESEND_API_KEY: z.string().min(1, "no puede estar vacía").optional(),
    MAIL_FROM: z.string().regex(MAIL_FROM_PATTERN, "debe ser «Nombre <dirección>» o solo la dirección").optional(),
    // Solo lo pone el servidor de la prueba E2E: deja usar el buzón en memoria (y su ruta de lectura) en producción.
    ALLOW_MEMORY_MAIL: z
      .enum(["true", "false"], { error: "debe ser true o false" })
      .default("false")
      .transform((value) => value === "true"),
  })
  .refine((env) => env.COOKIE_SAME_SITE !== "none" || env.COOKIE_SECURE, {
    message: "COOKIE_SAME_SITE=none exige COOKIE_SECURE=true",
    path: ["COOKIE_SAME_SITE"],
  })
  .refine((env) => env.MAIL_PROVIDER !== "resend" || env.RESEND_API_KEY !== undefined, {
    message: "es obligatoria con MAIL_PROVIDER=resend",
    path: ["RESEND_API_KEY"],
  })
  .refine((env) => env.MAIL_PROVIDER !== "resend" || env.MAIL_FROM !== undefined, {
    message: "es obligatorio con MAIL_PROVIDER=resend",
    path: ["MAIL_FROM"],
  })
  .transform((env) => ({
    ...env,
    CORS_ORIGIN: env.CORS_ORIGIN ?? (env.NODE_ENV === "production" ? undefined : "http://localhost:5173"),
    TRUST_PROXY: env.TRUST_PROXY ?? 0,
    MAIL_PROVIDER: env.MAIL_PROVIDER ?? (env.NODE_ENV === "development" ? ("console" as const) : env.NODE_ENV === "test" ? ("memory" as const) : undefined),
  }));

export type Env = z.infer<typeof envSchema>;

type Source = Record<string, string | undefined>;

/**
 * Una variable del correo que queda en blanco en el panel de Render (la clave que aún no se pegó, por ejemplo) cuenta como no
 * definida: de otro modo el servicio no arrancaría por algo que, con el correo apagado, nadie usa. Solo se perdonan las del
 * correo; cualquier otra variable en blanco sigue siendo un error.
 */
const MAIL_VARIABLES = ["EMAIL_VERIFICATION", "MAIL_PROVIDER", "RESEND_API_KEY", "MAIL_FROM", "ALLOW_MEMORY_MAIL"] as const;

function withoutBlankMailSettings(source: Source): Source {
  const kept = { ...source };
  for (const name of MAIL_VARIABLES) if (kept[name]?.trim() === "") delete kept[name];
  return kept;
}

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
  if (source.EMAIL_VERIFICATION === "on") {
    const provider = source.MAIL_PROVIDER;
    // La consola escribiría los códigos en el registro; la memoria solo la usa el servidor de la prueba E2E. (Un valor desconocido ya lo señala el esquema.)
    if (provider === undefined || provider === "" || provider === "console") {
      problems.push("MAIL_PROVIDER: con EMAIL_VERIFICATION=on en producción debe ser resend");
    } else if (provider === "memory" && source.ALLOW_MEMORY_MAIL !== "true") {
      problems.push("MAIL_PROVIDER: memory solo se admite en producción con ALLOW_MEMORY_MAIL=true (la prueba E2E); en el servicio real debe ser resend");
    }
  }
  return problems;
}

export function loadEnv(rawSource: Source = process.env): Env {
  const source = withoutBlankMailSettings(rawSource);
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
