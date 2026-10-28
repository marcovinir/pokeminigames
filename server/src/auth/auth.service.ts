import { randomBytes } from "node:crypto";
import type { ThemeMode, ThemeName, ThemePreferences } from "@pokemon-minigames/shared";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import { AppError } from "../http/errors.js";
import { anonymizeAccount } from "./delete-account.js";
import type { PasswordHasher } from "./password.js";
import type { TokenService } from "./tokens.js";

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  createdAt: Date;
  /** Nulo mientras la persona no haya guardado una preferencia de tema. */
  preferences: ThemePreferences | null;
  /** Número de Pokédex de su avatar; nulo = iniciales. */
  avatarId: number | null;
}

/** Lo que el servicio necesita de una fila de `users`. */
interface UserRow {
  id: string;
  email: string;
  username: string;
  createdAt: Date;
  theme: ThemeName | null;
  themeMode: ThemeMode | null;
  avatarPokemonId: number | null;
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

function toAuthUser(user: UserRow): AuthUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    createdAt: user.createdAt,
    // La base de datos exige que tema y modo vayan juntos, así que basta con mirar uno.
    preferences: user.theme && user.themeMode ? { theme: user.theme, themeMode: user.themeMode } : null,
    avatarId: user.avatarPokemonId,
  };
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

  /**
   * Borra (anonimiza) la cuenta si la contraseña es la suya; si no, lanza el mismo error que un inicio de sesión
   * fallido y no toca nada.
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user) {
      throw new AppError(401, "UNAUTHORIZED", "El usuario ya no existe");
    }
    if (!(await this.hasher.verify(password, user.passwordHash))) {
      throw new AppError(401, "INVALID_CREDENTIALS", "La contraseña no es correcta");
    }
    if (!(await anonymizeAccount(this.prisma, this.hasher, userId))) {
      throw new AppError(401, "UNAUTHORIZED", "El usuario ya no existe");
    }
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

  /** Guarda (o quita, con `null`) el avatar; la validación contra la lista la hace la ruta. */
  async saveAvatar(userId: string, avatarId: number | null): Promise<number | null> {
    try {
      await this.prisma.user.update({ where: { id: userId }, data: { avatarPokemonId: avatarId } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new AppError(401, "UNAUTHORIZED", "El usuario ya no existe");
      }
      throw error;
    }
    return avatarId;
  }

  /** El avatar de una cuenta para mostrarlo en una sala; nulo si no tiene o si la cuenta ya no existe. */
  async avatarOf(userId: string): Promise<number | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarPokemonId: true } });
    return user?.avatarPokemonId ?? null;
  }

  private async assertAvailable(email: string, username: string): Promise<void> {
    const emailTaken = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (emailTaken) {
      throw new AppError(409, "EMAIL_TAKEN", "Ese email ya está registrado");
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
