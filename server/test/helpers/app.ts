import type { Express } from "express";
import { createApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { prisma } from "./db.js";

/** Crea la app con la configuración de .env.test y la base de datos de pruebas. */
export function buildTestApp(overrides: Record<string, string> = {}): Express {
  const env = loadEnv({ ...process.env, ...overrides });
  return createApp({ env, prisma });
}
