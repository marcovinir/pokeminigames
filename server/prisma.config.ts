import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Vacío si no hay .env: permite `prisma generate` (p. ej. al instalar) sin base de datos.
  // Los comandos que sí se conectan (migrate, seed) fallan con un error claro.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
