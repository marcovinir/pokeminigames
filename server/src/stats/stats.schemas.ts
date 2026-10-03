import { HISTORY_DEFAULT_LIMIT, HISTORY_MAX_LIMIT } from "@pokemon-minigames/shared";
import { z } from "zod";

/** Los nombres de usuario válidos (los mismos que acepta el registro); cualquier otro no puede existir. */
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,30}$/;

export const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(HISTORY_MAX_LIMIT).default(HISTORY_DEFAULT_LIMIT),
  before: z.string().min(1).max(200).optional(),
});
