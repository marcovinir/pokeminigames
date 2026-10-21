export const ERROR_CODES = [
  // Generales y de autenticación
  "VALIDATION_ERROR",
  "EMAIL_TAKEN",
  "USERNAME_TAKEN",
  "INVALID_CREDENTIALS",
  "UNAUTHORIZED",
  "FORBIDDEN",
  /** Un invitado intentó algo que es solo de cuentas (perfil, estadísticas, preferencias). */
  "ACCOUNT_REQUIRED",
  "INVALID_REFRESH_TOKEN",
  "NOT_FOUND",
  "USER_NOT_FOUND",
  "INTERNAL_ERROR",
  // Salas (REST)
  "ALREADY_IN_GAME",
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  "ROOM_CLOSED",
  /** Quien se une tiene el mismo nombre que la otra persona de la sala. */
  "NAME_IN_USE",
  // Partida (Socket.io)
  "NOT_IN_ROOM",
  "WRONG_PHASE",
  "ALREADY_ANSWERED",
  "ALREADY_CHOSEN",
  "INVALID_TYPE",
  "RATE_LIMITED",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
