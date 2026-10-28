/**
 * Una cuenta borrada no desaparece (sus partidas también son de sus rivales): se anonimiza y su nombre pasa a uno de
 * relleno, único y válido, que empieza por este prefijo. Nadie puede elegir un nombre así, y en pantalla se ve como
 * «Cuenta borrada».
 */
export const DELETED_USERNAME_PREFIX = "borrada_";

/** El nombre de relleno de una cuenta borrada: el prefijo y los 12 primeros caracteres hexadecimales de su id. */
export function deletedUsernameFor(userId: string): string {
  return DELETED_USERNAME_PREFIX + userId.replaceAll("-", "").slice(0, 12);
}

/** Si el nombre es el de una cuenta borrada (sin distinguir mayúsculas, como el índice único de los nombres). */
export function isDeletedUsername(username: string): boolean {
  return username.toLowerCase().startsWith(DELETED_USERNAME_PREFIX);
}
