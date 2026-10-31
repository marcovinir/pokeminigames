/**
 * Duraciones que solo sirven para dibujar las barras de progreso de los cronómetros. Son las del
 * servidor (`server/src/game/constants.ts`); una prueba comprueba que coinciden. Quien decide
 * cuándo termina cada fase es siempre el servidor.
 */
export const ROUND_MS = 15_000;
export const TYPE_CHOICE_MS = 15_000;
export const START_COUNTDOWN_MS = 5_000;
export const RESULT_PAUSE_MS = 6_000;
/** El plazo para responder a una revancha, contado desde la primera petición. */
export const REMATCH_RESPONSE_MS = 60_000;

/** Límites del modo personalizado; el servidor los vuelve a validar. */
export const CUSTOM_ROUNDS_MIN = 1;
export const CUSTOM_ROUNDS_MAX = 20;
export const CUSTOM_STATS_GOAL_MIN = 500;
export const CUSTOM_STATS_GOAL_MAX = 5000;

/** Los mismos plazos que el servidor (`server/src/game/auction/rules.ts`). */
export const AUCTION_TURN_MS = 10_000;
export const AUCTION_REVEAL_MS = 18_000;
/** En la revelación aparece un Pokémon cada 3 s. */
export const AUCTION_REVEAL_STEP_MS = 3000;
