import { ApiError } from "../../api/client";
import { errorMessage } from "../../i18n/es";

/** Sin red, el aviso habla de la conexión; con un error del servidor, dice el suyo y no culpa a la conexión. */
export function dexErrorMessage(error: unknown, offline: string): string {
  return error instanceof ApiError && error.status !== 0 ? errorMessage(error.code) : offline;
}
