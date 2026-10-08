import { randomBytes } from "node:crypto";
import type { ThemeMode, ThemeName, ThemePreferences } from "@pokemon-minigames/shared";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import { AppError } from "../http/errors.js";
import { type Mailer, MailerError } from "../mail/mailer.js";
import { passwordResetMail, verificationMail } from "../mail/templates.js";
import { PENDING_ACCOUNT_TTL_MS } from "./code-policy.js";
import type { EmailCodeStore } from "./email-codes.js";
import type { PasswordHasher } from "./password.js";
import type { TokenService } from "./tokens.js";

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  createdAt: Date;
  /** Nulo mientras la persona no haya guardado una preferencia de tema. */
  preferences: ThemePreferences | null;
}

/** Lo que el servicio necesita de una fila de `users`. */
interface UserRow {
  id: string;
  email: string;
  username: string;
  createdAt: Date;
  theme: ThemeName | null;
  themeMode: ThemeMode | null;
  emailVerifiedAt: Date | null;
}

export interface AuthResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface AuthServiceDeps {
  prisma: PrismaClient;
  hasher: PasswordHasher;
  tokens: TokenService;
  refreshTtlMs: number;
  /** Reloj inyectable para poder probar la expiración. */
  now?: () => Date;
  /** Con la verificación por correo activa, quien no verificó su correo no entra. Apagado (por defecto), todo es como antes. */
  emailVerification?: boolean;
  /** Los códigos y el envío de correos; sin esto el servicio no puede registrar con verificación ni recuperar contraseñas. */
  email?: { codes: EmailCodeStore; mailer: Mailer };
  /** Dónde se anotan los fallos de envío (por defecto, la consola de errores). */
  log?: (message: string) => void;
}

const emailTakenError = () => new AppError(409, "EMAIL_TAKEN", "Ese email ya está registrado");
const usernameTakenError = () => new AppError(409, "USERNAME_TAKEN", "Ese nombre de usuario ya está en uso");

const INVALID_REFRESH = () =>
  new AppError(401, "INVALID_REFRESH_TOKEN", "Sesión inválida o expirada. Inicia sesión de nuevo.");

function toAuthUser(user: UserRow): AuthUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    createdAt: user.createdAt,
    // La base de datos exige que tema y modo vayan juntos, así que basta con mirar uno.
    preferences: user.theme && user.themeMode ? { theme: user.theme, themeMode: user.themeMode } : null,
  };
}

export class AuthService {
  private readonly prisma: PrismaClient;
  private readonly hasher: PasswordHasher;
  private readonly tokens: TokenService;
  private readonly refreshTtlMs: number;
  private readonly now: () => Date;
  private readonly emailVerification: boolean;
  private readonly email: AuthServiceDeps["email"];
  private readonly log: (message: string) => void;
  /** Hash de relleno: se verifica cuando el email no existe para que login tarde igual. */
  private readonly dummyHash: Promise<string>;

  constructor(deps: AuthServiceDeps) {
    this.prisma = deps.prisma;
    this.hasher = deps.hasher;
    this.tokens = deps.tokens;
    this.refreshTtlMs = deps.refreshTtlMs;
    this.now = deps.now ?? (() => new Date());
    this.emailVerification = deps.emailVerification ?? false;
    this.email = deps.email;
    this.log = deps.log ?? ((message) => console.error(message));
    this.dummyHash = deps.hasher.hash(randomBytes(16).toString("hex"));
  }

  /** `email` debe llegar ya normalizado (minúsculas y sin espacios). */
  async register(input: { email: string; username: string; password: string }): Promise<AuthResult> {
    await this.assertAvailable(input.email, input.username);
    const passwordHash = await this.hasher.hash(input.password);

    let user;
    try {
      user = await this.prisma.user.create({
        data: { email: input.email, username: input.username, passwordHash },
      });
    } catch (error) {
      // Dos registros simultáneos pueden pasar la comprobación previa; la base de datos decide.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        await this.assertAvailable(input.email, input.username);
      }
      throw error;
    }
    return this.issueSession(this.prisma, user);
  }

  async login(input: { email: string; password: string }): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      await this.hasher.verify(input.password, await this.dummyHash);
      throw new AppError(401, "INVALID_CREDENTIALS", "Email o contraseña incorrectos");
    }
    const ok = await this.hasher.verify(input.password, user.passwordHash);
    if (!ok) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Email o contraseña incorrectos");
    }
    // Solo tras acertar la contraseña: así no se delata a quien no la sabe que la cuenta existe sin verificar.
    this.assertVerified(user);
    return this.issueSession(this.prisma, user);
  }

  /** Rota el refresh token: el usado queda revocado y se entrega uno nuevo. */
  async refresh(refreshToken: string): Promise<AuthResult> {
    const tokenHash = this.tokens.hashRefreshToken(refreshToken);
    const now = this.now();

    return this.prisma.$transaction(async (tx) => {
      const record = await tx.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
      if (!record || record.revokedAt !== null || record.expiresAt <= now) {
        throw INVALID_REFRESH();
      }
      this.assertVerified(record.user);
      // La condición revokedAt = null hace que solo una petición concurrente gane.
      const revoked = await tx.refreshToken.updateMany({
        where: { id: record.id, revokedAt: null },
        data: { revokedAt: now },
      });
      if (revoked.count !== 1) {
        throw INVALID_REFRESH();
      }
      return this.issueSession(tx, record.user);
    });
  }

  /** Es idempotente: cerrar una sesión desconocida o ya cerrada no es un error. */
  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.tokens.hashRefreshToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: this.now() },
    });
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError(401, "UNAUTHORIZED", "El usuario ya no existe");
    }
    return toAuthUser(user);
  }

  /** Guarda la preferencia de tema; si la cuenta ya no existe es lo mismo que una sesión inválida. */
  async savePreferences(userId: string, preferences: ThemePreferences): Promise<ThemePreferences> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { theme: preferences.theme, themeMode: preferences.themeMode },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new AppError(401, "UNAUTHORIZED", "El usuario ya no existe");
      }
      throw error;
    }
    return { theme: preferences.theme, themeMode: preferences.themeMode };
  }

  /**
   * Registro con la verificación por correo activa: crea la cuenta sin verificar (o reemplaza la pendiente del mismo correo),
   * genera un código y lo envía. No abre ninguna sesión: la abre `verifyEmail`. Si el proveedor falla, la cuenta queda
   * pendiente y quien se registra puede volver a intentarlo con los mismos datos.
   */
  async registerPending(input: { email: string; username: string; password: string }): Promise<void> {
    const { codes, mailer } = this.requireEmail();
    const passwordHash = await this.hasher.hash(input.password);
    const now = this.now();

    let code: string;
    try {
      code = await this.prisma.$transaction(async (tx) => {
        await this.purgeStalePending(tx, input, now);
        const existing = await tx.user.findUnique({ where: { email: input.email }, select: { id: true, emailVerifiedAt: true } });
        let userId: string;
        if (existing) {
          // Solo se reemplaza una cuenta pendiente: una verificada, o una sin verificar que ya tiene historial, no se toca.
          if (!(await this.isPending(tx, existing))) throw emailTakenError();
          await this.assertUsernameFree(tx, input.username, existing.id);
          // La condición va en el propio UPDATE: si entre mirar y escribir la dueña del correo verificó (o restableció la
          // contraseña), la cuenta ya no es pendiente y no se pisa (Postgres vuelve a evaluar la condición tras esperar el bloqueo).
          const replaced = await tx.user.updateMany({
            where: { id: existing.id, emailVerifiedAt: null },
            data: { username: input.username, passwordHash, createdAt: now },
          });
          if (replaced.count !== 1) throw emailTakenError();
          userId = existing.id;
        } else {
          await this.assertUsernameFree(tx, input.username, null);
          // La fecha va explícita (la del reloj del servicio, no la de la base de datos) porque de ella depende cuándo caduca.
          const created = await tx.user.create({
            data: { email: input.email, username: input.username, passwordHash, createdAt: now },
            select: { id: true },
          });
          userId = created.id;
        }
        return codes.issue(tx, userId, "verify_email");
      });
    } catch (error) {
      // Dos registros simultáneos pueden pasar las comprobaciones; la base de datos decide.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        await this.assertAvailable(input.email, input.username);
      }
      throw error;
    }

    try {
      await mailer.send(verificationMail(input.email, code));
    } catch (error) {
      this.logMailFailure(error);
      throw new AppError(502, "EMAIL_SEND_FAILED", "No pudimos enviar el correo. Inténtalo de nuevo en un momento.");
    }
  }

  /** Verifica el correo con el código que llegó y abre la sesión. Cualquier fallo del código es INVALID_CODE. */
  async verifyEmail(input: { email: string; code: string }): Promise<AuthResult> {
    const { codes } = this.requireEmail();
    const { userId, claim } = await codes.claimByEmail(input.email, "verify_email", input.code);
    const now = this.now();
    const user = await this.prisma.$transaction(async (tx) => {
      await claim.consume(tx);
      const row = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      // La primera verificación manda: no se cambia la fecha de una cuenta que ya estaba verificada.
      return row.emailVerifiedAt === null ? tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: now } }) : row;
    });
    return this.issueSession(this.prisma, user);
  }

  /**
   * Reenvía el código de verificación a una cuenta que existe y no está verificada; con cualquier otro correo no hace nada.
   * Nadie espera su respuesta (la ruta contesta antes de llamarlo), así que un fallo del proveedor solo se anota.
   */
  async resendVerification(email: string): Promise<void> {
    const { codes, mailer } = this.requireEmail();
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, emailVerifiedAt: true } });
    if (!user || user.emailVerifiedAt !== null) return;
    const code = await codes.issue(this.prisma, user.id, "verify_email");
    await this.sendQuietly(mailer, verificationMail(email, code));
  }

  /** Envía el código para cambiar la contraseña a una cuenta que existe (también a una sin verificar); con otro correo no hace nada. */
  async requestPasswordReset(email: string): Promise<void> {
    const { codes, mailer } = this.requireEmail();
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) return;
    const code = await codes.issue(this.prisma, user.id, "reset_password");
    await this.sendQuietly(mailer, passwordResetMail(email, code));
  }

  /**
   * Cambia la contraseña con el código que llegó. Revoca todas las sesiones abiertas de la cuenta y no abre ninguna. Recibir
   * el código ya demuestra el correo, así que también lo da por verificado. Cualquier fallo del código es INVALID_CODE.
   */
  async resetPassword(input: { email: string; code: string; password: string }): Promise<void> {
    const { codes } = this.requireEmail();
    const { userId, claim } = await codes.claimByEmail(input.email, "reset_password", input.code);
    // El hash (que tarda) va después de comprobar el código: con uno inválido no se gasta ese trabajo.
    const passwordHash = await this.hasher.hash(input.password);
    const now = this.now();
    await this.prisma.$transaction(async (tx) => {
      await claim.consume(tx);
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { emailVerifiedAt: true } });
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, ...(user.emailVerifiedAt === null ? { emailVerifiedAt: now } : {}) },
      });
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
      // Un código de verificar que siguiera pendiente ya no hace falta.
      await tx.emailCode.deleteMany({ where: { userId, purpose: "verify_email" } });
    });
  }

  /** Envía un correo del que nadie espera respuesta: si falla, solo se anota. */
  private async sendQuietly(mailer: Mailer, mail: Parameters<Mailer["send"]>[0]): Promise<void> {
    try {
      await mailer.send(mail);
    } catch (error) {
      this.logMailFailure(error);
    }
  }

  private requireEmail(): { codes: EmailCodeStore; mailer: Mailer } {
    if (!this.email) throw new Error("El servicio de cuentas no tiene configurado el correo");
    return this.email;
  }

  /** Con la verificación activa, una cuenta sin verificar no entra ni renueva su sesión. */
  private assertVerified(user: { emailVerifiedAt: Date | null }): void {
    if (this.emailVerification && user.emailVerifiedAt === null) {
      throw new AppError(403, "EMAIL_NOT_VERIFIED", "Verifica tu correo para entrar");
    }
  }

  /** Pendiente: sin verificar y sin historial (ni sesiones ni partidas), así que nadie pierde nada si se reemplaza o se borra. */
  private async isPending(db: Prisma.TransactionClient, user: { id: string; emailVerifiedAt: Date | null }): Promise<boolean> {
    if (user.emailVerifiedAt !== null) return false;
    const games = await db.gamePlayer.count({ where: { userId: user.id } });
    if (games > 0) return false;
    return (await db.refreshToken.count({ where: { userId: user.id } })) === 0;
  }

  /** Borra las cuentas pendientes de más de 24 h que chocan por correo o usuario con un registro nuevo (sin temporizadores). */
  private async purgeStalePending(tx: Prisma.TransactionClient, input: { email: string; username: string }, now: Date): Promise<void> {
    const cutoff = new Date(now.getTime() - PENDING_ACCOUNT_TTL_MS);
    await tx.$executeRaw`
      DELETE FROM users u
      WHERE u.email_verified_at IS NULL AND u.created_at < ${cutoff}::timestamptz
        AND (u.email = ${input.email} OR lower(u.username) = lower(${input.username}))
        AND NOT EXISTS (SELECT 1 FROM game_players g WHERE g.user_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM refresh_tokens r WHERE r.user_id = u.id)`;
  }

  /** El usuario no lo tiene otra cuenta (sin distinguir mayúsculas); `exceptUserId` es la cuenta que se está reemplazando. */
  private async assertUsernameFree(db: Prisma.TransactionClient, username: string, exceptUserId: string | null): Promise<void> {
    const taken = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM users
      WHERE lower(username) = lower(${username}) AND (${exceptUserId}::uuid IS NULL OR id <> ${exceptUserId}::uuid) LIMIT 1`;
    if (taken.length > 0) throw usernameTakenError();
  }

  /** Anota un fallo de envío sin la dirección ni el código: solo lo que dice el proveedor. */
  private logMailFailure(error: unknown): void {
    const reason = error instanceof MailerError ? error.message : error instanceof Error ? error.name : "error desconocido";
    this.log(`[correo] No se pudo enviar un código: ${reason}`);
  }

  private async assertAvailable(email: string, username: string): Promise<void> {
    const existingEmail = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existingEmail) {
      throw emailTakenError();
    }
    // Misma comparación que el índice único lower(username). No se usa `mode: "insensitive"`
    // porque Prisma lo traduce a ILIKE y el guion bajo del username actuaría como comodín.
    const usernameTaken = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM users WHERE lower(username) = lower(${username}) LIMIT 1`;
    if (usernameTaken.length > 0) {
      throw new AppError(409, "USERNAME_TAKEN", "Ese nombre de usuario ya está en uso");
    }
  }

  private async issueSession(
    db: Prisma.TransactionClient | PrismaClient,
    user: UserRow,
  ): Promise<AuthResult> {
    const refreshToken = this.tokens.generateRefreshToken();
    const refreshExpiresAt = new Date(this.now().getTime() + this.refreshTtlMs);
    await db.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.tokens.hashRefreshToken(refreshToken),
        expiresAt: refreshExpiresAt,
      },
    });
    return {
      user: toAuthUser(user),
      accessToken: this.tokens.signAccessToken({ sub: user.id, username: user.username }),
      refreshToken,
      refreshExpiresAt,
    };
  }
}
