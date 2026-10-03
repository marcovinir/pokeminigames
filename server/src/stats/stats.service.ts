import type { HistoryEntry, HistoryPage, StatsResponse } from "@pokemon-minigames/shared";
import type { PokemonCatalog } from "../catalog/pokemon-catalog.js";
import type { PrismaClient } from "../db/prisma.js";
import { AppError } from "../http/errors.js";
import { type FinishedGame, buildStats, resultFor } from "./calculate.js";
import { type HistoryCursor, InvalidCursorError, decodeCursor, encodeCursor } from "./cursor.js";

export interface StatsServiceDeps {
  prisma: PrismaClient;
  catalog: PokemonCatalog;
}

export interface HistoryOptions {
  limit: number;
  /** Cursor de la página anterior; ausente o nulo para la primera. */
  before?: string | null;
}

/** Estadísticas e historial, calculados al pedirlos a partir de las partidas completadas. */
export class StatsService {
  private readonly prisma: PrismaClient;
  private readonly catalog: PokemonCatalog;

  constructor(deps: StatsServiceDeps) {
    this.prisma = deps.prisma;
    this.catalog = deps.catalog;
  }

  /** Busca por nombre sin distinguir mayúsculas, con la misma comparación que el índice único lower(username). */
  async findUserByUsername(username: string): Promise<{ id: string; username: string } | null> {
    // No se usa `mode: "insensitive"`: Prisma lo traduce a ILIKE y el guion bajo actuaría como comodín.
    const rows = await this.prisma.$queryRaw<{ id: string; username: string }[]>`
      SELECT id, username FROM users WHERE lower(username) = lower(${username}) LIMIT 1`;
    return rows[0] ?? null;
  }

  async getStats(userId: string): Promise<StatsResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    if (!user) throw new AppError(404, "USER_NOT_FOUND", "No existe ese jugador");

    const rows = await this.prisma.gamePlayer.findMany({
      where: { userId, game: { status: "completed", endedAt: { not: null } } },
      select: { finalStats: true, game: { select: { id: true, endedAt: true, winnerId: true } } },
    });
    const games: FinishedGame[] = rows.map((row) => ({
      id: row.game.id,
      endedAt: row.game.endedAt!,
      result: resultFor(row.game.winnerId, userId),
      score: row.finalStats,
    }));

    const picks = await this.prisma.roundPick.findMany({
      where: { userId, result: "VALID", round: { game: { status: "completed" } } },
      select: { pokemonId: true },
    });
    const wonPokemonIds = picks.flatMap((pick) => (pick.pokemonId === null ? [] : [pick.pokemonId]));

    return { username: user.username, stats: buildStats(games, wonPokemonIds, this.catalog) };
  }

  async getHistory(userId: string, { limit, before }: HistoryOptions): Promise<HistoryPage> {
    let cursor: HistoryCursor | null = null;
    if (before) {
      try {
        cursor = decodeCursor(before);
      } catch (error) {
        if (error instanceof InvalidCursorError) throw new AppError(400, "VALIDATION_ERROR", "El cursor no es válido");
        throw error;
      }
    }

    // Se pide una partida de más para saber si hay página siguiente.
    const rows = await this.prisma.gamePlayer.findMany({
      where: {
        userId,
        game: {
          status: "completed",
          endedAt: { not: null },
          ...(cursor
            ? { OR: [{ endedAt: { lt: cursor.endedAt } }, { endedAt: cursor.endedAt, id: { lt: cursor.id } }] }
            : {}),
        },
      },
      orderBy: [{ game: { endedAt: "desc" } }, { game: { id: "desc" } }],
      take: limit + 1,
      select: {
        finalStats: true,
        game: {
          select: {
            id: true,
            endedAt: true,
            endReason: true,
            winnerId: true,
            typeMode: true,
            lengthMode: true,
            roundsLimit: true,
            statsGoal: true,
            players: { select: { userId: true, finalStats: true, user: { select: { username: true } } } },
          },
        },
      },
    });

    const page = rows.slice(0, limit);
    const games = page.map((row): HistoryEntry => {
      const { game } = row;
      const opponent = game.players.find((player) => player.userId !== userId);
      return {
        id: game.id,
        endedAt: game.endedAt!.toISOString(),
        result: resultFor(game.winnerId, userId),
        reason: game.endReason,
        opponent: { username: opponent?.user.username ?? "?" },
        myScore: row.finalStats,
        opponentScore: opponent?.finalStats ?? null,
        config: {
          typeMode: game.typeMode,
          lengthMode: game.lengthMode,
          roundsLimit: game.roundsLimit,
          statsGoal: game.statsGoal,
        },
      };
    });

    const last = page[page.length - 1];
    const nextCursor =
      rows.length > limit && last ? encodeCursor({ endedAt: last.game.endedAt!, id: last.game.id }) : null;
    return { games, nextCursor };
  }
}
