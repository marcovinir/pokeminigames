import { Router } from "express";
import { createRequireAuth, getAuth } from "../auth/auth.middleware.js";
import type { TokenService } from "../auth/tokens.js";
import { AppError } from "../http/errors.js";
import { USERNAME_PATTERN, historyQuerySchema } from "./stats.schemas.js";
import type { StatsService } from "./stats.service.js";

export interface StatsRouterDeps {
  service: StatsService;
  tokens: TokenService;
}

/**
 * Se monta en la raíz porque agrupa `/stats` y `/users/:username/stats`. La autenticación va ruta por
 * ruta (no con `router.use`) para que una ruta desconocida siga dando 404 y no 401.
 */
export function createStatsRouter({ service, tokens }: StatsRouterDeps): Router {
  const router = Router();
  const requireAuth = createRequireAuth(tokens);

  router.get("/stats", requireAuth, async (_req, res) => {
    res.json(await service.getStats(getAuth(res).userId));
  });

  router.get("/stats/history", requireAuth, async (req, res) => {
    const { limit, before } = historyQuerySchema.parse(req.query);
    res.json(await service.getHistory(getAuth(res).userId, { limit, before }));
  });

  // Bajo /users y no bajo /stats/:username: "history" es un nombre de usuario válido y chocaría.
  router.get("/users/:username/stats", requireAuth, async (req, res) => {
    const username = String(req.params.username);
    const user = USERNAME_PATTERN.test(username) ? await service.findUserByUsername(username) : null;
    if (!user) throw new AppError(404, "USER_NOT_FOUND", "No existe ese jugador");
    res.json(await service.getStats(user.id));
  });

  return router;
}
