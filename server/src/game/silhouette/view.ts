import type { GameEndedPayload, RoomPlayerView, RoomStateView, Seat, SilhouetteStateView } from "@pokemon-minigames/shared";
import type { PokemonCatalog } from "../../catalog/pokemon-catalog.js";
import { SEATS, otherSeat } from "../engine/types.js";
import type { SilhouetteState } from "./types.js";

/**
 * Estado de una sala de silueta para un jugador. De la ronda abierta solo va la URL opaca de la silueta y si ya respondió:
 * ni el Pokémon ni lo que escribió nadie. Las revelaciones ya cerradas sí van enteras.
 */
export function buildSilhouetteRoomState(state: SilhouetteState, seat: Seat, code: string, _catalog: PokemonCatalog, now: number): RoomStateView {
  const players: RoomPlayerView[] = SEATS.flatMap((s) => {
    const player = state.players[s];
    return player
      ? [
          {
            seat: s,
            username: player.username,
            ...(player.guest ? { guest: true } : {}),
            ...(player.avatarId ? { avatarId: player.avatarId } : {}),
            connected: player.connected,
            totalStats: player.totalStats,
            teamSize: 0,
          },
        ]
      : [];
  });

  const open = state.phase === "round_active" && state.round;
  const mine = open ? state.round!.answers[seat] : undefined;
  const silhouette: SilhouetteStateView = {
    totalRounds: state.config.rounds,
    round: open
      ? {
          number: state.round!.number,
          deadline: state.round!.deadline,
          silhouetteUrl: `/silhouettes/${state.round!.token}`,
          answered: mine !== undefined,
          answeredMs: mine ? mine.at - state.round!.startedAt : null,
          opponentAnswered: state.round!.answers[seat === 1 ? 2 : 1] !== undefined,
        }
      : null,
    reveals: structuredClone(state.reveals),
  };

  return {
    serverNow: now,
    code,
    phase: state.phase,
    config: { ...state.config, generations: [...state.config.generations] },
    mySeat: seat,
    players,
    myTeam: [],
    opponentTeam: [],
    roundsPlayed: state.roundsPlayed,
    startsAt: state.phase === "starting" ? state.startsAt : null,
    ...(state.rematch ? { rematch: true as const } : {}),
    opponentGraceEndsAt: state.graceEndsAt[otherSeat(seat)] ?? null,
    round: null,
    silhouette,
  };
}

export function buildSilhouetteGameEnded(state: SilhouetteState, _catalog: PokemonCatalog): GameEndedPayload {
  return {
    winnerSeat: state.outcome?.winnerSeat ?? null,
    reason: state.outcome?.reason ?? "abandoned",
    teams: { 1: [], 2: [] },
    totals: { 1: state.players[1]?.totalStats ?? 0, 2: state.players[2]?.totalStats ?? 0 },
    silhouette: { reveals: structuredClone(state.reveals) },
  };
}
