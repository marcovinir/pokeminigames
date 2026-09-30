import type { RoomConfig } from "@pokemon-minigames/shared";
import { z } from "zod";
import {
  CUSTOM_ROUNDS_MAX,
  CUSTOM_ROUNDS_MIN,
  CUSTOM_STATS_GOAL_MAX,
  CUSTOM_STATS_GOAL_MIN,
  FIXED_ROUNDS_OPTIONS,
} from "../game/constants.js";

/** Cuerpo de `POST /rooms`. Las mismas reglas que el CHECK de la tabla `games`, con sus rangos. */
export const createRoomSchema = z
  .object({
    typeMode: z.enum(["random", "chosen"]),
    lengthMode: z.enum(["fixed_rounds", "custom"]),
    roundsLimit: z.number().int().optional(),
    statsGoal: z.number().int().optional(),
  })
  .superRefine((value, ctx) => {
    const { lengthMode, roundsLimit, statsGoal } = value;
    const fail = (path: "roundsLimit" | "statsGoal", message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });

    if (lengthMode === "fixed_rounds") {
      if (roundsLimit === undefined || !(FIXED_ROUNDS_OPTIONS as readonly number[]).includes(roundsLimit)) {
        fail("roundsLimit", `Las rondas fijas son ${FIXED_ROUNDS_OPTIONS.join(" o ")}`);
      }
      if (statsGoal !== undefined) fail("statsGoal", "Las rondas fijas no admiten una meta de stats");
      return;
    }

    if ((roundsLimit === undefined) === (statsGoal === undefined)) {
      fail("roundsLimit", "El modo personalizado necesita exactamente una condición de fin: roundsLimit o statsGoal");
      return;
    }
    if (roundsLimit !== undefined && (roundsLimit < CUSTOM_ROUNDS_MIN || roundsLimit > CUSTOM_ROUNDS_MAX)) {
      fail("roundsLimit", `El máximo de rondas va de ${CUSTOM_ROUNDS_MIN} a ${CUSTOM_ROUNDS_MAX}`);
    }
    if (statsGoal !== undefined && (statsGoal < CUSTOM_STATS_GOAL_MIN || statsGoal > CUSTOM_STATS_GOAL_MAX)) {
      fail("statsGoal", `La meta de stats va de ${CUSTOM_STATS_GOAL_MIN} a ${CUSTOM_STATS_GOAL_MAX}`);
    }
  })
  .transform(
    (value): RoomConfig => ({
      typeMode: value.typeMode,
      lengthMode: value.lengthMode,
      roundsLimit: value.roundsLimit ?? null,
      statsGoal: value.statsGoal ?? null,
    }),
  );
