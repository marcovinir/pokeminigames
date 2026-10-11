import type {
  GameEndedPayload,
  PokemonView,
  RoomPlayerView,
  RoomStateView,
  Seat,
} from "@pokemon-minigames/shared";
import type { CatalogPokemon, PokemonCatalog } from "../../catalog/pokemon-catalog.js";
import { type GameState, SEATS, otherSeat } from "./types.js";

export function toPokemonView(pokemon: CatalogPokemon): PokemonView {
  return {
    id: pokemon.id,
    names: { ...pokemon.names },
    spriteUrl: pokemon.spriteUrl,
    types: [...pokemon.types],
    stats: { ...pokemon.stats },
    totalStats: pokemon.totalStats,
  };
}

export function teamViews(state: GameState, seat: Seat, catalog: PokemonCatalog): PokemonView[] {
  const team = state.players[seat]?.team ?? [];
  return team.flatMap((id) => {
    const pokemon = catalog.get(id);
    return pokemon ? [toPokemonView(pokemon)] : [];
  });
}

/**
 * Estado de la partida para un jugador. Del rival revela su equipo tal como lo conoce quien juega: los Pokémon que ya
 * se mostraron en `round-result`. Lo que escribió en la ronda abierta no está en el estado hasta que se cierra.
 */
export function buildRoomState(
  state: GameState,
  seat: Seat,
  code: string,
  catalog: PokemonCatalog,
  now: number,
): RoomStateView {
  const players: RoomPlayerView[] = SEATS.flatMap((s) => {
    const player = state.players[s];
    return player
      ? [
          {
            seat: s,
            username: player.username,
            connected: player.connected,
            totalStats: player.totalStats,
            teamSize: player.team.length,
          },
        ]
      : [];
  });

  const activeRound = state.phase === "choosing_types" || state.phase === "round_active" || state.phase === "round_result";
  const round: RoomStateView["round"] =
    activeRound && state.round
      ? {
          number: state.round.number,
          pair: state.round.pair ? [state.round.pair[0], state.round.pair[1]] : null,
          deadline: state.round.deadline,
          answered: state.round.picks[seat] !== undefined,
          typeChosen: state.round.typeChoices[seat] !== undefined,
        }
      : null;

  return {
    serverNow: now,
    code,
    phase: state.phase,
    config: { ...state.config },
    mySeat: seat,
    players,
    myTeam: teamViews(state, seat, catalog),
    opponentTeam: teamViews(state, otherSeat(seat), catalog),
    roundsPlayed: state.roundsPlayed,
    startsAt: state.phase === "starting" ? state.startsAt : null,
    opponentGraceEndsAt: state.graceEndsAt[otherSeat(seat)] ?? null,
    round,
  };
}

export function buildGameEnded(state: GameState, catalog: PokemonCatalog): GameEndedPayload {
  return {
    winnerSeat: state.outcome?.winnerSeat ?? null,
    reason: state.outcome?.reason ?? "abandoned",
    teams: { 1: teamViews(state, 1, catalog), 2: teamViews(state, 2, catalog) },
    totals: { 1: state.players[1]?.totalStats ?? 0, 2: state.players[2]?.totalStats ?? 0 },
  };
}
