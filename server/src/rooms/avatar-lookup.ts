/** Lee el avatar de una cuenta (`AuthService.avatarOf`). */
export type AvatarReader = (userId: string) => Promise<number | null>;

/**
 * El avatar con el que alguien entra a una sala. Un invitado no tiene (ni se consulta nada), y si la base falla se entra
 * con iniciales: algo cosmético nunca impide crear una sala ni unirse.
 */
export async function avatarForRoom(
  read: AvatarReader,
  user: { userId: string; isGuest: boolean },
  logger: Pick<Console, "warn"> = console,
): Promise<number | null> {
  if (user.isGuest) return null;
  try {
    return await read(user.userId);
  } catch (error) {
    logger.warn(`No se pudo leer el avatar de ${user.userId}; entra con iniciales: ${String(error)}`);
    return null;
  }
}
