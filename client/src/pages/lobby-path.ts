import { GAME_SLUGS, type GameKind } from "@pokemon-minigames/shared";

/** El lobby de un juego (`/jugar/:slug`). */
export function lobbyPath(game: GameKind): string {
  return `/jugar/${GAME_SLUGS[game]}`;
}
