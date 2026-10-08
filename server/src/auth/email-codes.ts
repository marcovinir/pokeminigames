import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { AppError } from "../http/errors.js";
import { CODE_LENGTH, CODE_TTL_MS, MAX_CODE_ATTEMPTS } from "./code-policy.js";

export type EmailCodePurpose = "verify_email" | "reset_password";

type Db = Prisma.TransactionClient | PrismaClient;

/** El mismo error para un código equivocado, vencido, bloqueado o de una cuenta que no existe: no delata nada. */
const invalidCode = (): AppError => new AppError(400, "INVALID_CODE", "Código incorrecto o vencido");

/** Seis dígitos aleatorios, con ceros a la izquierda. El generador es reemplazable en las pruebas. */
export function generateCode(random: (max: number) => number = (max) => randomInt(0, max)): string {
  return String(random(10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

export type CodeHasher = (userId: string, purpose: EmailCodePurpose, code: string) => string;

/**
 * Hash con clave de un código: lo único que se guarda en la base de datos. Con una clave que no está en ella, quien copiara
 * la base no podría probar el millón de combinaciones por su cuenta. La clave sale del secreto del servidor con una etiqueta
 * propia, para no usar el mismo secreto en dos sitios; la cuenta y el propósito van dentro, así un hash no sirve en otra fila.
 */
export function createCodeHasher(secret: string): CodeHasher {
  const key = createHmac("sha256", secret).update("pokemon-minigames:email-code:v1").digest();
  return (userId, purpose, code) => createHmac("sha256", key).update(`${userId}:${purpose}:${code}`).digest("hex");
}

/** Comparación de tiempo constante entre dos hashes hexadecimales. */
function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Un código ya comprobado y todavía sin gastar: `consume` lo borra, y solo una petición puede hacerlo. */
export interface CodeClaim {
  consume(tx: Prisma.TransactionClient): Promise<void>;
}

export interface EmailCodeStoreDeps {
  prisma: PrismaClient;
  hash: CodeHasher;
  /** Reloj inyectable para probar el vencimiento (también en el SQL, como parámetro). */
  now?: () => Date;
  random?: (max: number) => number;
}

export class EmailCodeStore {
  private readonly prisma: PrismaClient;
  private readonly hash: CodeHasher;
  private readonly now: () => Date;
  private readonly random: ((max: number) => number) | undefined;

  constructor(deps: EmailCodeStoreDeps) {
    this.prisma = deps.prisma;
    this.hash = deps.hash;
    this.now = deps.now ?? (() => new Date());
    this.random = deps.random;
  }

  /**
   * Crea un código nuevo para la cuenta y el propósito y lo devuelve en claro, para enviarlo. Reemplaza la fila anterior, así
   * que el código de antes deja de valer y los intentos vuelven a cero.
   */
  async issue(db: Db, userId: string, purpose: EmailCodePurpose): Promise<string> {
    const code = generateCode(this.random);
    const now = this.now();
    const data = {
      codeHash: this.hash(userId, purpose, code),
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      attempts: 0,
      createdAt: now,
    };
    await db.emailCode.upsert({
      where: { userId_purpose: { userId, purpose } },
      create: { userId, purpose, ...data },
      update: data,
    });
    return code;
  }

  /**
   * Comprueba un código. El intento se **reserva antes de comparar**, con una sola instrucción SQL (como hace el login con sus
   * límites): así 50 peticiones a la vez no consiguen más de 5 intentos, y el quinto, si acierta, vale. Sin fila que reservar
   * (no existe, venció o ya se gastaron los 5) falla igual que un código equivocado.
   */
  async claim(userId: string, purpose: EmailCodePurpose, code: string): Promise<CodeClaim> {
    const now = this.now();
    const rows = await this.prisma.$queryRaw<{ code_hash: string }[]>`
      UPDATE email_codes SET attempts = attempts + 1
      WHERE user_id = ${userId}::uuid AND purpose = ${purpose}::email_code_purpose
        AND attempts < ${MAX_CODE_ATTEMPTS}::smallint AND expires_at > ${now}::timestamptz
      RETURNING code_hash`;
    const stored = rows[0]?.code_hash;
    if (stored === undefined || !sameHash(stored, this.hash(userId, purpose, code))) throw invalidCode();

    return {
      consume: async (tx) => {
        // Borra solo la fila con ese hash: si mientras tanto otra petición lo gastó o se pidió otro código, no hay nada
        // que borrar y falla. Es lo que hace que un código sirva una sola vez aunque dos peticiones acierten a la vez.
        const deleted = await tx.emailCode.deleteMany({ where: { userId, purpose, codeHash: stored } });
        if (deleted.count !== 1) throw invalidCode();
      },
    };
  }

  /**
   * Lo mismo, por el correo de la cuenta. Con un correo que no existe hace la misma consulta con un identificador inventado,
   * así que falla con el mismo error y casi con el mismo trabajo.
   */
  async claimByEmail(email: string, purpose: EmailCodePurpose, code: string): Promise<{ userId: string; claim: CodeClaim }> {
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    const userId = user?.id ?? randomUUID();
    return { userId, claim: await this.claim(userId, purpose, code) };
  }
}
