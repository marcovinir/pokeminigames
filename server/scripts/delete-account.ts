// Retira una cuenta (moderación, por ejemplo un nombre ofensivo): la anonimiza igual que «Borrar mi cuenta».
// Uso: DATABASE_URL=… npm run account:delete -w server -- <nombre de usuario>
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { anonymizeAccount } from "../src/auth/delete-account.js";
import { findAccountByUsername } from "../src/auth/find-account.js";
import { createPasswordHasher } from "../src/auth/password.js";
import { createPrismaClient } from "../src/db/prisma.js";

const databaseUrl = process.env.DATABASE_URL;
const username = process.argv[2];
if (!databaseUrl) {
  console.error("Falta DATABASE_URL. Pégala solo en la terminal (ver docs/despliegue.md), nunca en un archivo del repositorio.");
  process.exit(1);
}
if (!username) {
  console.error("Uso: npm run account:delete -w server -- <nombre de usuario>");
  process.exit(1);
}

/** «ash@example.com» → «a***@example.com»: lo justo para reconocer la cuenta sin mostrar el correo entero. */
const maskEmail = (email: string): string => email.replace(/^(.)[^@]*/, "$1***");

const prisma = createPrismaClient(databaseUrl);
try {
  const account = await findAccountByUsername(prisma, username);
  if (!account) {
    console.error(`No hay ninguna cuenta llamada «${username}».`);
    process.exitCode = 1;
  } else {
    console.log(`Cuenta: ${account.username} · ${maskEmail(account.email)} · alta ${account.createdAt.toISOString().slice(0, 10)}`);
    const readline = createInterface({ input: stdin, output: stdout });
    const answer = await readline.question("Se anonimizará y no se puede deshacer. Escribe el nombre para confirmar: ");
    readline.close();
    if (answer.trim() !== account.username) {
      console.log("No coincide: no se ha tocado nada.");
      process.exitCode = 1;
    } else {
      await anonymizeAccount(prisma, createPasswordHasher(12), account.id);
      console.log("Cuenta retirada: sus partidas siguen en el historial de sus rivales como «Cuenta borrada».");
    }
  }
} finally {
  await prisma.$disconnect();
}
