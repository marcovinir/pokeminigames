import {
  type DobleTipoConfig,
  GENERATIONS,
  type RoomConfig,
  SILHOUETTE_DEFAULT_GENERATIONS,
  SILHOUETTE_DEFAULT_ROUNDS,
  SILHOUETTE_ROUNDS,
  type SilhouetteConfig,
} from "@pokemon-minigames/shared";
import { z } from "zod";
import {
  CUSTOM_ROUNDS_MAX,
  CUSTOM_ROUNDS_MIN,
  CUSTOM_STATS_GOAL_MAX,
  CUSTOM_STATS_GOAL_MIN,
  FIXED_ROUNDS_OPTIONS,
} from "../game/constants.js";

/** Cuerpo de `POST /rooms` para «Doble tipo». Las mismas reglas que el CHECK de la tabla `games`, con sus rangos. */
const dobleTipoSchema = z
  .strictObject({
    game: z.literal("doble_tipo").optional(),
    typeMode: z.enum(["random", "chosen"]),
    lengthMode: z.enum(["fixed_rounds", "custom"]),
    roundsLimit: z.number().int().optional(),
    statsGoal: z.number().int().optional(),
    typeHints: z.boolean().optional(),
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
    (value): DobleTipoConfig => ({
      typeMode: value.typeMode,
      lengthMode: value.lengthMode,
      roundsLimit: value.roundsLimit ?? null,
      statsGoal: value.statsGoal ?? null,
      typeHints: value.typeHints ?? false,
    }),
  );

/** Cuerpo de `POST /rooms` para la silueta: sin rondas, 10; sin generaciones, Kanto. */
const silhouetteSchema = z
  .strictObject({
    game: z.literal("silueta"),
    rounds: z.union(SILHOUETTE_ROUNDS.map((n) => z.literal(n))).default(SILHOUETTE_DEFAULT_ROUNDS),
    generations: z
      .array(z.number().int().min(1).max(GENERATIONS.length))
      .min(1, "Elige al menos una generación")
      .refine((list) => new Set(list).size === list.length, "Cada generación va una sola vez")
      .default([...SILHOUETTE_DEFAULT_GENERATIONS]),
  })
  .transform((value): SilhouetteConfig => ({ game: "silueta", rounds: value.rounds, generations: [...value.generations].sort((a, b) => a - b) }));

/** Cuerpo de `POST /rooms`: el juego lo dice `game` (sin él es «Doble tipo», como antes de que hubiera varios). */
export const createRoomSchema = z.unknown().pipe(
  z.custom<unknown>().transform((value, ctx): RoomConfig => {
    const game = typeof value === "object" && value !== null ? (value as { game?: unknown }).game : undefined;
    const schema = game === "silueta" ? silhouetteSchema : dobleTipoSchema;
    const result = schema.safeParse(value);
    if (result.success) return result.data;
    for (const issue of result.error.issues) ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
    return z.NEVER;
  }),
);

