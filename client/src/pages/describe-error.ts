import { ApiError } from "../api/client";
import { errorMessage } from "../i18n/es";

/** El mensaje en español de un error de una llamada (el 429 ya dice cuánto esperar); cualquier otro fallo, uno genérico. */
export function describeError(error: unknown): string {
  return error instanceof ApiError ? error.message : errorMessage(undefined);
}
