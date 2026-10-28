import type { PrismaClient } from "../generated/prisma/client.js";

export interface FoundAccount {
  id: string;
  username: string;
  email: string;
  createdAt: Date;
}

/**
 * Busca una cuenta por su nombre sin distinguir mayúsculas (el índice único de los nombres tampoco las distingue, así
 * que hay como mucho una). La usa el script de moderación.
 */
export function findAccountByUsername(prisma: PrismaClient, username: string): Promise<FoundAccount | null> {
  return prisma.user.findFirst({
    where: { username: { equals: username, mode: "insensitive" } },
    select: { id: true, username: true, email: true, createdAt: true },
  });
}
