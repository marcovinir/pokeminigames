export const ERROR_CODES = [
  // Generales y de autenticación
  "VALIDATION_ERROR",
  "EMAIL_TAKEN",
  "USERNAME_TAKEN",
  "INVALID_CREDENTIALS",
  /** Al borrar la cuenta, la contraseña de confirmación no es la suya (403: un 401 haría que el cliente renovara la sesión y repitiera). */
  "WRONG_PASSWORD",
  "UNAUTHORIZED",
  "FORBIDDEN",
  /** Un invitado intentó algo que es solo de cuentas (perfil, estadísticas, preferencias). */
  "ACCOUNT_REQUIRED",
  "INVALID_REFRESH_TOKEN",
  "NOT_FOUND",
  "USER_NOT_FOUND",
  "POKEMON_NOT_FOUND",
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
  "NOT_YOUR_TURN",
  "INVALID_BID",
  "INVALID_CHOICE",
  "ALREADY_ANSWERED",
  "ALREADY_CHOSEN",
  "INVALID_TYPE",
  "RATE_LIMITED",
  // Silueta
  "SILHOUETTE_NOT_FOUND",
  "SILHOUETTE_UNAVAILABLE",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
