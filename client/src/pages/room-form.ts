import type { CreateDobleTipoRoomRequest, TypeMode } from "@pokemon-minigames/shared";
import {
  CUSTOM_ROUNDS_MAX,
  CUSTOM_ROUNDS_MIN,
  CUSTOM_STATS_GOAL_MAX,
  CUSTOM_STATS_GOAL_MIN,
} from "../game/durations";

export type LengthKind = "fixed-3" | "fixed-5" | "custom-rounds" | "custom-stats";

export interface CreateRoomForm {
  typeMode: TypeMode;
  lengthKind: LengthKind;
  customRounds: string;
  statsGoal: string;
  /** «Pistas de tipos»: las sugerencias del campo de respuesta muestran los tipos (apagado por defecto). */
  typeHints: boolean;
}

export const DEFAULT_FORM: CreateRoomForm = {
  typeMode: "random",
  lengthKind: "fixed-3",
  customRounds: "10",
  statsGoal: "2500",
  typeHints: false,
};

export const LENGTH_LABELS: Record<LengthKind, string> = {
  "fixed-3": "3 rondas",
  "fixed-5": "5 rondas",
  "custom-rounds": "Personalizada: máximo de rondas",
  "custom-stats": "Personalizada: meta de stats",
};


function wholeNumber(text: string): number | null {
  return /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
}

export type BuiltRequest =
  | { ok: true; request: CreateDobleTipoRoomRequest }
  | { ok: false; field: "customRounds" | "statsGoal"; error: string };

/** Convierte el formulario en la petición al servidor, con los mismos límites que él valida. */
export function buildRequest(form: CreateRoomForm): BuiltRequest {
  const { typeMode } = form;
  // Solo se manda cuando están encendidas: apagadas es lo que el servidor entiende por omisión.
  const hints = form.typeHints ? { typeHints: true } : {};
  switch (form.lengthKind) {
    case "fixed-3":
      return { ok: true, request: { typeMode, lengthMode: "fixed_rounds", roundsLimit: 3, ...hints } };
    case "fixed-5":
      return { ok: true, request: { typeMode, lengthMode: "fixed_rounds", roundsLimit: 5, ...hints } };
    case "custom-rounds": {
      const rounds = wholeNumber(form.customRounds);
      if (rounds === null || rounds < CUSTOM_ROUNDS_MIN || rounds > CUSTOM_ROUNDS_MAX) {
        return { ok: false, field: "customRounds", error: `El máximo de rondas va de ${CUSTOM_ROUNDS_MIN} a ${CUSTOM_ROUNDS_MAX}.` };
      }
      return { ok: true, request: { typeMode, lengthMode: "custom", roundsLimit: rounds, ...hints } };
    }
    case "custom-stats": {
      const goal = wholeNumber(form.statsGoal);
      if (goal === null || goal < CUSTOM_STATS_GOAL_MIN || goal > CUSTOM_STATS_GOAL_MAX) {
        return { ok: false, field: "statsGoal", error: `La meta de stats va de ${CUSTOM_STATS_GOAL_MIN} a ${CUSTOM_STATS_GOAL_MAX}.` };
      }
      return { ok: true, request: { typeMode, lengthMode: "custom", statsGoal: goal, ...hints } };
    }
  }
}
