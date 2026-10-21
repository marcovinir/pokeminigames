import type { GameEndReason } from "@pokemon-minigames/shared";

/** Tiempos y límites de la partida. Son constantes, no variables de entorno. */

export const ROUND_SECONDS = 15;
export const TYPE_CHOICE_SECONDS = 15;
export const RESULT_PAUSE_SECONDS = 6;
export const START_COUNTDOWN_SECONDS = 5;
export const RECONNECT_GRACE_SECONDS = 30;
export const WAITING_ROOM_TTL_MINUTES = 10;

/** Dos respuestas al mismo Pokémon con menos diferencia que esto cuentan como simultáneas. */
export const SIMULTANEOUS_WINDOW_MS = 500;

/** Un par de tipos es jugable si quedan al menos tantos Pokémon sin reclamar. */
export const MIN_POOL_PER_PAIR = 2;

export const CUSTOM_ROUNDS_MIN = 1;
export const CUSTOM_ROUNDS_MAX = 20;
export const CUSTOM_STATS_GOAL_MIN = 500;
export const CUSTOM_STATS_GOAL_MAX = 5000;
export const FIXED_ROUNDS_OPTIONS = [3, 5] as const;

/** Eventos del cliente por segundo y por socket antes de responder RATE_LIMITED. */
export const SOCKET_EVENTS_PER_SECOND = 5;

/** Largo máximo del texto de una respuesta. */
export const MAX_ANSWER_LENGTH = 100;

export const ROOM_CODE_LENGTH = 6;
/** Sin 0, O, 1, I ni L para que el código se lea sin confusión. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const seconds = (n: number): number => n * 1000;
export const minutes = (n: number): number => n * 60 * 1000;

// --- Revancha ------------------------------------------------------------------------------------------------------

/** Cuánto tiempo desde el final de la partida se puede pedir la revancha; pasado ese tiempo la oferta se cierra sola. */
export const REMATCH_ASK_WINDOW_MS = minutes(5);
/** Plazo para responder, contado desde la primera petición (no se reinicia). */
export const REMATCH_RESPONSE_MS = seconds(60);
/** Cuánto puede estar desconectado alguien durante la oferta antes de contar como «se fue» (una recarga no cuenta). */
export const REMATCH_RECONNECT_GRACE_MS = seconds(10);
/** Una sala de revancha caduca a los 30 s si el rival no entra. */
export const REMATCH_ROOM_TTL_SECONDS = 30;
/** Cuántas partidas recientes se muestran en el récord. */
export const REMATCH_RECENT_GAMES = 5;
/** Solo una partida que terminó con normalidad abre una oferta de revancha. */
export const REMATCH_END_REASONS: readonly GameEndReason[] = ["completed", "exhausted"];
