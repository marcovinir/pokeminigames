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
