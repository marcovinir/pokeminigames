import { randomBytes } from "node:crypto";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import { AppError } from "../http/errors.js";
import type { PasswordHasher } from "./password.js";
import type { TokenService } from "./tokens.js";

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  createdAt: Date;
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
}

const INVALID_REFRESH = () =>
  new AppError(401, "INVALID_REFRESH_TOKEN", "Sesión inválida o expirada. Inicia sesión de nuevo.");

function toAuthUser(user: { id: string; email: string; username: string; createdAt: Date }): AuthUser {
  return { id: user.id, email: user.email, username: user.username, createdAt: user.createdAt };
}

export class AuthService {
  private readonly prisma: PrismaClient;
  private readonly hasher: PasswordHasher;
  private readonly tokens: TokenService;
  private readonly refreshTtlMs: number;
  private readonly now: () => Date;
  /** Hash de relleno: se verifica cuando el email no existe para que login tarde igual. */
  private readonly dummyHash: Promise<string>;

  constructor(deps: AuthServiceDeps) {
    this.prisma = deps.prisma;
    this.hasher = deps.hasher;
    this.tokens = deps.tokens;
    this.refreshTtlMs = deps.refreshTtlMs;
    this.now = deps.now ?? (() => new Date());
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

  private async assertAvailable(email: string, username: string): Promise<void> {
    const emailTaken = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (emailTaken) {
      throw new AppError(409, "EMAIL_TAKEN", "Ese email ya está registrado");
    }
    const usernameTaken = await this.prisma.user.findFirst({
      where: { username: { equals: username, mode: "insensitive" } },
      select: { id: true },
    });
    if (usernameTaken) {
      throw new AppError(409, "USERNAME_TAKEN", "Ese nombre de usuario ya está en uso");
    }
  }

  private async issueSession(
    db: Prisma.TransactionClient | PrismaClient,
    user: { id: string; email: string; username: string; createdAt: Date },
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
