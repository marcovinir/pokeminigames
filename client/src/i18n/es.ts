import type {
  BaseStats,
  ErrorCode,
  GameEndReason,
  GameResult,
  PickResult,
  RematchClosedReason,
  RematchRecord,
  RoomConfig,
  TypeName,
} from "@pokemon-minigames/shared";

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
  FORBIDDEN: "Esa petición no está permitida desde este sitio.",
  ACCOUNT_REQUIRED: "Necesitas una cuenta para esto.",
  INVALID_REFRESH_TOKEN: "Tu sesión expiró. Inicia sesión de nuevo.",
  NOT_FOUND: "No encontramos lo que buscas.",
  USER_NOT_FOUND: "No encontramos a ese jugador.",
  INTERNAL_ERROR: "Algo falló en el servidor. Inténtalo de nuevo.",
  ALREADY_IN_GAME: "Ya estás en una partida. Vuelve a ella desde el lobby.",
  ROOM_NOT_FOUND: "Esa sala no existe o ya terminó.",
  ROOM_FULL: "Esa sala ya está llena.",
  ROOM_CLOSED: "Esa sala ya empezó o se cerró.",
  NAME_IN_USE: "Ya hay alguien con ese nombre en la sala. Entra con otro nombre.",
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

/** Los segundos que el servidor pide esperar (`details.retryAfterSeconds` de un 429), si vienen como número. */
export function retryAfterOf(details: unknown): number | undefined {
  if (typeof details !== "object" || details === null) return undefined;
  const value = (details as { retryAfterSeconds?: unknown }).retryAfterSeconds;
  return typeof value === "number" ? value : undefined;
}

/** "Demasiados intentos. Inténtalo de nuevo en 9 min."; sin una espera usable, sin número. */
export function rateLimitMessage(retryAfterSeconds: number | undefined): string {
  if (retryAfterSeconds === undefined || !Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) {
    return "Demasiados intentos. Inténtalo de nuevo más tarde.";
  }
  const wait = retryAfterSeconds < 60 ? `${Math.ceil(retryAfterSeconds)} s` : `${Math.ceil(retryAfterSeconds / 60)} min`;
  return `Demasiados intentos. Inténtalo de nuevo en ${wait}.`;
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

export const RESULT_LABELS: Record<GameResult, string> = { won: "Ganaste", drawn: "Empate", lost: "Perdiste" };

const SAME_FOR_ALL = (text: string): Record<GameResult, string> => ({ won: text, drawn: text, lost: text });

/** El motivo del fin contado desde el lado de quien mira su historial. */
export const HISTORY_REASON_LABELS: Record<GameEndReason, Record<GameResult, string>> = {
  completed: SAME_FOR_ALL("La partida terminó"),
  forfeit: { won: "Tu rival abandonó", drawn: "Un jugador abandonó la partida", lost: "Abandonaste la partida" },
  disconnect: { won: "Tu rival se desconectó", drawn: "Un jugador se desconectó", lost: "Te desconectaste" },
  exhausted: SAME_FOR_ALL("Se agotaron los pares de tipos jugables"),
  cancelled: SAME_FOR_ALL("La sala se canceló"),
  expired: SAME_FOR_ALL("La sala caducó"),
  abandoned: SAME_FOR_ALL("La partida se abandonó"),
};

/** Las partidas anteriores a que se guardara el motivo (nulo) se muestran como una partida normal. */
export function historyReason(reason: GameEndReason | null, result: GameResult): string {
  return HISTORY_REASON_LABELS[reason ?? "completed"][result];
}

/** "Tipos aleatorios · 3 rondas", "Tipos elegidos · hasta 7 rondas", "Tipos aleatorios · meta de 2500 puntos". */
export function describeConfig(config: RoomConfig): string {
  const types = config.typeMode === "random" ? "Tipos aleatorios" : "Tipos elegidos";
  const length =
    config.statsGoal !== null
      ? `meta de ${config.statsGoal} puntos`
      : config.lengthMode === "fixed_rounds"
        ? `${config.roundsLimit} rondas`
        : `hasta ${config.roundsLimit} ${config.roundsLimit === 1 ? "ronda" : "rondas"}`;
  return `${types} · ${length}`;
}

export const STAT_LABELS: Record<keyof BaseStats, string> = {
  hp: "PS",
  attack: "Ataque",
  defense: "Defensa",
  spAttack: "At. esp.",
  spDefense: "Def. esp.",
  speed: "Velocidad",
};

// --- Revancha ------------------------------------------------------------------------------------------------------

/** Los textos fijos de la revancha (botones, títulos y etiquetas). */
export const REMATCH_TEXT = {
  request: "Revancha",
  cancel: "Cancelar",
  accept: "Aceptar",
  decline: "Rechazar",
  backToLobby: "Volver al lobby",
  firstGame: "Es su primera partida juntos",
  factsLabel: "¿Sabías que…?",
  loadingTitle: "¡Revancha!",
  loadingSub: "Preparando la sala…",
  youReady: "✓ Tú, listo",
} as const;

export const rematchWaiting = (name: string): string => `Esperando a ${name}…`;
export const rematchSecondsLeft = (seconds: number): string => `Le quedan ${seconds} s para decidir`;
/** El mismo plazo dicho a quien decide (la petición la hizo el rival). */
export const rematchYourSecondsLeft = (seconds: number): string => `Te quedan ${seconds} s para decidir`;
export const rematchRequested = (name: string): string => `${name} quiere la revancha`;
export const rematchEntering = (name: string): string => `${name} entrando…`;
export const rematchNoShow = (name: string): string => `${name} no llegó.`;
export const rematchReady = (name: string): string => `✓ ${name}, listo`;

/** Las últimas partidas del récord, como fichas: la letra que se ve y el nombre que se lee. */
export const RECENT_RESULT_LABELS: Record<GameResult, { short: string; name: string }> = {
  won: { short: "G", name: "Ganada" },
  lost: { short: "P", name: "Perdida" },
  drawn: { short: "E", name: "Empate" },
};
export const recordTitle = (name: string): string => `Tú contra ${name}`;

/** El aviso de por qué no hubo revancha; `null` si lo canceló quien lo lee (no hace falta decirle nada). */
export function rematchClosedMessage(reason: RematchClosedReason, name: string): string | null {
  switch (reason) {
    case "self":
      return null;
    case "declined":
      return `${name} ya no quiere la revancha.`;
    case "left":
      return `${name} se fue.`;
    case "timeout":
      return "Se acabó el tiempo.";
    case "unavailable":
      return "La revancha ya no está disponible.";
    case "failed":
      return "No se pudo crear la sala.";
  }
}

/** La línea bajo el marcador del récord: «5 partidas jugadas · vas ganando», o «Es su primera partida juntos». */
export function recordHeadline(record: RematchRecord, rivalName: string): string {
  if (record.played === 1) return REMATCH_TEXT.firstGame;
  const verdict = record.mine > record.theirs ? "vas ganando" : record.mine < record.theirs ? `va ganando ${rivalName}` : "van empatados";
  return `${record.played} partidas jugadas · ${verdict}`;
}
