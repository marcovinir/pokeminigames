import type { PrismaClient } from "../db/prisma.js";
import { typeId } from "../catalog/snapshot.js";
import type { FinishInput, GameRepository } from "./ports.js";
import type { RoundRecord } from "./engine/types.js";

export function createPrismaGameRepository(prisma: PrismaClient): GameRepository {
  return {
    async createGame({ roomCode, config, creatorUserId }) {
      const game = await prisma.game.create({
        data: {
          roomCode,
          typeMode: config.typeMode,
          lengthMode: config.lengthMode,
          roundsLimit: config.roundsLimit,
          statsGoal: config.statsGoal,
          status: "waiting",
          players: { create: { userId: creatorUserId, seat: 1 } },
        },
        select: { id: true },
      });
      return game.id;
    },

    async addSecondPlayer(gameId, userId) {
      await prisma.gamePlayer.create({ data: { gameId, userId, seat: 2 } });
    },

    async removeSecondPlayer(gameId) {
      await prisma.gamePlayer.deleteMany({ where: { gameId, seat: 2 } });
    },

    async markStarted(gameId) {
      await prisma.game.update({ where: { id: gameId }, data: { status: "in_progress" } });
    },

    async saveRound(gameId, round: RoundRecord) {
      await prisma.$transaction(async (tx) => {
        // El par ya llega ordenado y el id de un tipo es su posición + 1, así que type1Id < type2Id.
        const created = await tx.round.create({
          data: { gameId, number: round.number, type1Id: typeId(round.pair[0]), type2Id: typeId(round.pair[1]) },
          select: { id: true },
        });
        await tx.roundPick.createMany({
          data: round.picks.map((pick) => ({
            roundId: created.id,
            userId: pick.userId,
            submittedText: pick.text,
            result: pick.result,
            pokemonId: pick.pokemonId,
            submittedAt: pick.submittedAt === null ? null : new Date(pick.submittedAt),
          })),
        });
      });
    },

    async finish(gameId, input: FinishInput) {
      await prisma.$transaction(async (tx) => {
        await tx.game.update({
          where: { id: gameId },
          data: { status: input.status, endReason: input.reason, winnerId: input.winnerUserId, endedAt: new Date() },
        });
        for (const seat of [1, 2] as const) {
          const finalStats = input.finalStats[seat];
          if (finalStats !== undefined) {
            await tx.gamePlayer.updateMany({ where: { gameId, seat }, data: { finalStats } });
          }
        }
      });
    },

    async discardGame(gameId) {
      // Solo las que esperan: descartar nunca debe llevarse una partida con rondas ni unos stats ya guardados.
      await prisma.$transaction([
        prisma.gamePlayer.deleteMany({ where: { gameId, game: { status: "waiting" } } }),
        prisma.game.deleteMany({ where: { id: gameId, status: "waiting" } }),
      ]);
    },

    async abandonUnfinished() {
      const result = await prisma.game.updateMany({
        where: { status: { in: ["waiting", "in_progress"] } },
        data: { status: "abandoned", endReason: "abandoned", endedAt: new Date() },
      });
      return result.count;
    },
  };
}
