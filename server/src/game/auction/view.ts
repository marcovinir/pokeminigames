import type { GameEndedPayload, PokemonView, RoomPlayerView, RoomStateView, Seat } from "@pokemon-minigames/shared";
import type { PokemonCatalog } from "../../catalog/pokemon-catalog.js";
import { SEATS, otherSeat } from "../engine/types.js";
import { toPokemonView } from "../engine/view.js";
import { bidCap } from "./rules.js";
import type { AuctionState } from "./types.js";

function limitOf(state: AuctionState, seat: Seat): number {
  const lot = state.lots[state.lotIndex]!;
  return lot.kind === "pokemon" ? Math.min(state.money[seat], bidCap(state.money[seat], state.teams[seat].length)) : state.money[seat];
}

/** Lo máximo que puede pujar un jugador por el lote abierto. */
export const auctionLimit = limitOf;

/**
 * Estado de una sala de subasta para un jugador. Pujas y dinero son públicos, pero del lote solo va la URL opaca de la
 * silueta, y de los equipos solo cuántos llevan: ni el Pokémon real ni el mostrado salen antes de la revelación.
 */
export function buildAuctionRoomState(state: AuctionState, seat: Seat, code: string, _catalog: PokemonCatalog, now: number): RoomStateView {
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
            totalStats: 0,
            teamSize: state.teams[s].length,
          },
        ]
      : [];
  });

  const lot = state.phase === "auction" ? state.lots[state.lotIndex] : undefined;
  const bidding = state.bidding;
  return {
    serverNow: now,
    code,
    phase: state.phase,
    config: { ...state.config },
    mySeat: seat,
    players,
    myTeam: [],
    opponentTeam: [],
    roundsPlayed: state.lotIndex,
    startsAt: state.phase === "starting" ? state.startsAt : null,
    ...(state.rematch ? { rematch: true as const } : {}),
    opponentGraceEndsAt: state.graceEndsAt[otherSeat(seat)] ?? null,
    round: null,
    auction: {
      money: { ...state.money },
      teamSizes: { 1: state.teams[1].length, 2: state.teams[2].length },
      items: { 1: [...state.items[1]], 2: [...state.items[2]] },
      lot:
        lot && bidding
          ? {
              number: state.lotIndex + 1,
              kind: lot.kind,
              ...(lot.kind === "pokemon" ? { silhouetteUrl: `/silhouettes/${lot.token}` } : { item: lot.item }),
              price: lot.price,
              currentBid: bidding.currentBid,
              leader: bidding.leader,
              turn: bidding.turn,
              deadline: bidding.deadline,
              myLimit: limitOf(state, seat),
            }
          : null,
      reveal: structuredClone(state.reveal),
    },
  };
}

export function buildAuctionGameEnded(state: AuctionState, catalog: PokemonCatalog): GameEndedPayload {
  const teamOf = (seat: Seat): PokemonView[] => state.teams[seat].map((id) => toPokemonView(catalog.get(id)!));
  return {
    winnerSeat: state.outcome?.winnerSeat ?? null,
    reason: state.outcome?.reason ?? "abandoned",
    teams: { 1: teamOf(1), 2: teamOf(2) },
    totals: { 1: 0, 2: 0 },
  };
}
