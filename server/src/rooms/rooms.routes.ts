import { Router } from "express";
import { createRequireIdentity, getAuth } from "../auth/auth.middleware.js";
import type { TokenService } from "../auth/tokens.js";
import type { RoomManager } from "../game/room-manager.js";
import { type AvatarReader, avatarForRoom } from "./avatar-lookup.js";
import { createRoomSchema } from "./rooms.schemas.js";

export interface RoomsRouterDeps {
  manager: RoomManager;
  tokens: TokenService;
  /** El avatar de una cuenta, que se fija en la sala al crearla o unirse. */
  readAvatar: AvatarReader;
}

/** Todas las rutas de salas exigen `Authorization: Bearer <accessToken>` de una cuenta o de un invitado. */
export function createRoomsRouter({ manager, tokens, readAvatar }: RoomsRouterDeps): Router {
  const router = Router();
  router.use(createRequireIdentity(tokens));

  router.post("/", async (req, res) => {
    const config = createRoomSchema.parse(req.body);
    const { userId, username, isGuest } = getAuth(res);
    const avatarId = await avatarForRoom(readAvatar, { userId, isGuest });
    const { code } = await manager.createRoom({ userId, username, isGuest, avatarId }, config);
    res.status(201).json({ code });
  });

  // Antes de "/:code": si no, "current" se tomaría por un código de sala.
  router.get("/current", (_req, res) => {
    res.json({ room: manager.currentFor(getAuth(res).userId) });
  });

  router.get("/:code", (req, res) => {
    res.json(manager.getPublicInfo(req.params.code));
  });

  router.post("/:code/join", async (req, res) => {
    const { userId, username, isGuest } = getAuth(res);
    // joinRoom es síncrono (en memoria): el avatar se lee antes.
    const avatarId = await avatarForRoom(readAvatar, { userId, isGuest });
    res.json(manager.joinRoom({ userId, username, isGuest, avatarId }, req.params.code));
  });

  return router;
}
