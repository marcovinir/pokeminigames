import { Router } from "express";
import { createRequireAuth, getAuth } from "../auth/auth.middleware.js";
import type { TokenService } from "../auth/tokens.js";
import type { RoomManager } from "../game/room-manager.js";
import { createRoomSchema } from "./rooms.schemas.js";

export interface RoomsRouterDeps {
  manager: RoomManager;
  tokens: TokenService;
}

/** Todas las rutas de salas exigen `Authorization: Bearer <accessToken>`. */
export function createRoomsRouter({ manager, tokens }: RoomsRouterDeps): Router {
  const router = Router();
  router.use(createRequireAuth(tokens));

  router.post("/", async (req, res) => {
    const config = createRoomSchema.parse(req.body);
    const { userId, username } = getAuth(res);
    const { code } = await manager.createRoom({ userId, username }, config);
    res.status(201).json({ code });
  });

  // Antes de "/:code": si no, "current" se tomaría por un código de sala.
  router.get("/current", (_req, res) => {
    res.json({ room: manager.currentFor(getAuth(res).userId) });
  });

  router.get("/:code", (req, res) => {
    res.json(manager.getPublicInfo(req.params.code));
  });

  router.post("/:code/join", (req, res) => {
    const { userId, username } = getAuth(res);
    res.json(manager.joinRoom({ userId, username }, req.params.code));
  });

  return router;
}
