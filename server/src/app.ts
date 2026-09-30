import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import { createAuthRouter } from "./auth/auth.routes.js";
import { AuthService } from "./auth/auth.service.js";
import { createPasswordHasher } from "./auth/password.js";
import { createTokenService } from "./auth/tokens.js";
import type { Env } from "./config/env.js";
import type { PrismaClient } from "./db/prisma.js";
import { errorHandler, notFoundHandler } from "./http/errors.js";

export interface AppDeps {
  env: Env;
  prisma: PrismaClient;
}

export function createApp({ env, prisma }: AppDeps): Express {
  const tokens = createTokenService({
    secret: env.JWT_ACCESS_SECRET,
    accessTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
  });
  const authService = new AuthService({
    prisma,
    hasher: createPasswordHasher(env.BCRYPT_COST),
    tokens,
    refreshTtlMs: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });

  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "10kb" }));
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use("/auth", createAuthRouter({ env, authService, tokens }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
