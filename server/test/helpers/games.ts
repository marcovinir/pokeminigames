import type { GameEndReason, DobleTipoConfig } from "@pokemon-minigames/shared";
import { prisma } from "./db.js";

export interface SeedPlayer {
  userId: string;
  /** Puntaje final guardado; nulo si no se guardó. */
  score: number | null;
  /** Pokémon que ganó, uno por ronda. */
  wonPokemon?: number[];
}

export interface SeedGame {
  code: string;
  endedAt: Date;
  players: [SeedPlayer, SeedPlayer];
  /** Índice (0 o 1) de quien ganó; nulo o ausente es un empate. */
  winner?: 0 | 1 | null;
  status?: "completed" | "abandoned" | "in_progress" | "waiting";
  reason?: GameEndReason | null;
  config?: DobleTipoConfig;
}

const DEFAULT_CONFIG: DobleTipoConfig = { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null };

/**
 * Siembra una partida ya guardada en la base de datos, con sus dos jugadores y una ronda por cada
 * Pokémon ganado (el par de tipos es siempre el mismo: aquí no importa). Requiere el catálogo de pruebas.
 */
export async function seedGame(game: SeedGame): Promise<string> {
  const config = game.config ?? DEFAULT_CONFIG;
  const status = game.status ?? "completed";
  const finished = status === "completed" || status === "abandoned";
  const created = await prisma.game.create({
    data: {
      roomCode: game.code,
      typeMode: config.typeMode,
      lengthMode: config.lengthMode,
      roundsLimit: config.roundsLimit,
      statsGoal: config.statsGoal,
      status,
      endReason: game.reason ?? null,
      winnerId: game.winner === undefined || game.winner === null ? null : game.players[game.winner].userId,
      endedAt: finished ? game.endedAt : null,
      players: {
        create: game.players.map((player, i) => ({ userId: player.userId, seat: i + 1, finalStats: player.score })),
      },
    },
    select: { id: true },
  });

  const rounds = Math.max(game.players[0].wonPokemon?.length ?? 0, game.players[1].wonPokemon?.length ?? 0);
  for (let i = 0; i < rounds; i++) {
    const round = await prisma.round.create({
      data: { gameId: created.id, number: i + 1, type1Id: 1, type2Id: 2 },
      select: { id: true },
    });
    for (const player of game.players) {
      const pokemonId = player.wonPokemon?.[i];
      await prisma.roundPick.create({
        data: {
          roundId: round.id,
          userId: player.userId,
          result: pokemonId === undefined ? "NO_ANSWER" : "VALID",
          pokemonId: pokemonId ?? null,
        },
      });
    }
  }
  return created.id;
}
