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
  timeoutMs = AVATAR_TIMEOUT_MS,
): Promise<number | null> {
  if (user.isGuest) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Con la base lenta, esperar al avatar retrasaría la entrada a la sala hasta el tiempo límite de conexión (30 s).
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`tardó más de ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    return await Promise.race([read(user.userId), late]);
  } catch (error) {
    logger.warn(`No se pudo leer el avatar de ${user.userId}; entra con iniciales: ${String(error)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Lo que se espera al avatar antes de entrar con iniciales. */
export const AVATAR_TIMEOUT_MS = 1500;
