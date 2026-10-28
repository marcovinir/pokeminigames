import { isDeletedUsername } from "@pokemon-minigames/shared";
import { Router } from "express";
import { createRequireAccount, getAuth } from "../auth/auth.middleware.js";
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
  const requireAccount = createRequireAccount(tokens);

  router.get("/stats", requireAccount, async (_req, res) => {
    res.json(await service.getStats(getAuth(res).userId));
  });

  router.get("/stats/history", requireAccount, async (req, res) => {
    const { limit, before } = historyQuerySchema.parse(req.query);
    res.json(await service.getHistory(getAuth(res).userId, { limit, before }));
  });

  // Bajo /users y no bajo /stats/:username: "history" es un nombre de usuario válido y chocaría.
  router.get("/users/:username/stats", requireAccount, async (req, res) => {
    const username = String(req.params.username);
    // Una cuenta borrada no tiene perfil: su nombre de relleno sale en el historial del rival, pero no se puede abrir.
    const valid = USERNAME_PATTERN.test(username) && !isDeletedUsername(username);
    const user = valid ? await service.findUserByUsername(username) : null;
    if (!user) throw new AppError(404, "USER_NOT_FOUND", "No existe ese jugador");
    res.json(await service.getStats(user.id));
  });

  return router;
}
