import { randomBytes } from "node:crypto";
import { deletedUsernameFor } from "@pokemon-minigames/shared";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { PasswordHasher } from "./password.js";

/**
 * Borra una cuenta anonimizándola: sus partidas también son de sus rivales (historial y estadísticas), así que la fila
 * se queda, pero sin nada que identifique a la persona. Correo y nombre pasan a unos de relleno (los originales quedan
 * libres), la contraseña a un hash de algo que nadie conoce, avatar y tema a nulo, y se borran sus sesiones.
 * Devuelve `false` si la cuenta no existe. La usan `DELETE /auth/me` y el script de moderación.
 */
export async function anonymizeAccount(prisma: PrismaClient, hasher: PasswordHasher, userId: string): Promise<boolean> {
  // El hash se calcula fuera de la transacción: bcrypt tarda y no debe tenerla abierta.
  const passwordHash = await hasher.hash(randomBytes(32).toString("hex"));
  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: userId },
      data: {
        email: `borrada-${userId}@invalid`,
        username: deletedUsernameFor(userId),
        passwordHash,
        avatarPokemonId: null,
        theme: null,
        themeMode: null,
      },
    });
    if (updated.count === 0) return false;
    await tx.refreshToken.deleteMany({ where: { userId } });
    return true;
  });
}
