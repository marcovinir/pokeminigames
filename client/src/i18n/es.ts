import type { BaseStats, ErrorCode, GameEndReason, PickResult, TypeName } from "@pokemon-minigames/shared";

export const TYPE_LABELS: Record<TypeName, string> = {
  normal: "normal",
  fighting: "lucha",
  flying: "volador",
  poison: "veneno",
  ground: "tierra",
  rock: "roca",
  bug: "bicho",
  ghost: "fantasma",
  steel: "acero",
  fire: "fuego",
  water: "agua",
  grass: "planta",
  electric: "eléctrico",
  psychic: "psíquico",
  ice: "hielo",
  dragon: "dragón",
  dark: "siniestro",
  fairy: "hada",
};

export const NETWORK_ERROR = "NETWORK";

const ERROR_MESSAGES: Record<ErrorCode | typeof NETWORK_ERROR, string> = {
  VALIDATION_ERROR: "Revisa los datos: hay algo que no es válido.",
  EMAIL_TAKEN: "Ese email ya está registrado.",
  USERNAME_TAKEN: "Ese nombre de usuario ya está en uso.",
  INVALID_CREDENTIALS: "Email o contraseña incorrectos.",
  UNAUTHORIZED: "Tu sesión expiró. Inicia sesión de nuevo.",
  INVALID_REFRESH_TOKEN: "Tu sesión expiró. Inicia sesión de nuevo.",
  NOT_FOUND: "No encontramos lo que buscas.",
  INTERNAL_ERROR: "Algo falló en el servidor. Inténtalo de nuevo.",
  ALREADY_IN_GAME: "Ya estás en una partida. Vuelve a ella desde el lobby.",
  ROOM_NOT_FOUND: "Esa sala no existe o ya terminó.",
  ROOM_FULL: "Esa sala ya está llena.",
  ROOM_CLOSED: "Esa sala ya empezó o se cerró.",
  NOT_IN_ROOM: "No participas en esa sala.",
  WRONG_PHASE: "Ahora no puedes hacer eso.",
  ALREADY_ANSWERED: "Ya enviaste tu respuesta en esta ronda.",
  ALREADY_CHOSEN: "Ya elegiste tu tipo en esta ronda.",
  INVALID_TYPE: "Ese tipo no existe.",
  RATE_LIMITED: "Vas muy rápido. Espera un momento.",
  NETWORK: "No se pudo conectar con el servidor. Revisa tu conexión.",
};

/** Mensaje en español para un código de error; cualquier código desconocido da uno genérico. */
export function errorMessage(code: string | undefined): string {
  if (code && code in ERROR_MESSAGES) return ERROR_MESSAGES[code as keyof typeof ERROR_MESSAGES];
  return ERROR_MESSAGES.INTERNAL_ERROR;
}

/** Errores tras los que tiene sentido salir de la sala y volver al lobby. */
export const ROOM_GONE_CODES: readonly string[] = ["ROOM_NOT_FOUND", "NOT_IN_ROOM", "ROOM_CLOSED"];

export const PICK_RESULT_LABELS: Record<PickResult, string> = {
  VALID: "Acertó",
  NOT_FOUND: "Ese Pokémon no existe",
  WRONG_TYPES: "No tiene esos dos tipos",
  ALREADY_OWNED: "Ya estaba en su equipo",
  TAKEN: "Otro jugador lo tenía",
  NO_ANSWER: "No respondió",
};

export const END_REASON_LABELS: Record<GameEndReason, string> = {
  completed: "La partida terminó",
  forfeit: "Un jugador abandonó la partida",
  disconnect: "Un jugador se desconectó",
  exhausted: "No quedaron más pares de tipos jugables",
  cancelled: "La sala se canceló",
  expired: "La sala caducó",
  abandoned: "La partida se abandonó",
};

export const STAT_LABELS: Record<keyof BaseStats, string> = {
  hp: "PS",
  attack: "Ataque",
  defense: "Defensa",
  spAttack: "At. esp.",
  spDefense: "Def. esp.",
  speed: "Velocidad",
};
