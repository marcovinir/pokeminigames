import type { AuctionLotView, BattleFighterView, BattleView, GameEndedPayload, PokemonView, RoomPlayerView, RoomStateView, Seat } from "@pokemon-minigames/shared";
import type { PokemonCatalog } from "../../catalog/pokemon-catalog.js";
import { SEATS, otherSeat } from "../engine/types.js";
import { toPokemonView } from "../engine/view.js";
import { type Fighter, moveEffectiveness, movesOf } from "./combat.js";
import { bidCap } from "./rules.js";
import type { AuctionState } from "./types.js";

function limitOf(state: AuctionState, seat: Seat): number {
  return Math.min(state.money[seat], bidCap(state.money[seat], state.teams[seat].length));
}

/** Lo máximo que puede pujar un jugador por el lote abierto. */
export const auctionLimit = limitOf;

function fighterView(fighter: Fighter, catalog: PokemonCatalog): BattleFighterView {
  return { pokemon: toPokemonView(catalog.get(fighter.pokemon.id)!), hp: fighter.hp, maxHp: fighter.maxHp };
}

/** El combate para un jugador: de lo que el rival está decidiendo no va nada, ni si ya decidió. */
function battleView(state: AuctionState, seat: Seat, catalog: PokemonCatalog): BattleView | undefined {
  const battle = state.battle;
  if (!battle) return undefined;
  const rival = otherSeat(seat);
  const inFight = state.phase === "battle";
  const mineId = battle.titular[seat];
  const mine = battle.fighters[seat].find((fighter) => fighter.pokemon.id === mineId);
  const rivalFighter = inFight ? battle.fighters[rival].find((fighter) => fighter.pokemon.id === battle.titular[rival]) : undefined;
  const confirmed = state.phase === "reveal" ? state.readyForBattle.includes(seat) : state.phase === "lineup" ? battle.lineups[seat] !== undefined : state.phase === "battle_pause" ? battle.pauses[seat] !== undefined : battle.moves[seat] !== undefined;
  return {
    round: battle.round,
    turn: battle.turn,
    deadline: battle.deadline,
    confirmed,
    myLineup: state.phase === "lineup" ? structuredClone(battle.lineups[seat] ?? null) : null,
    myMove: battle.moves[seat] ?? null,
    myPause: state.phase === "battle_pause" ? structuredClone(battle.pauses[seat] ?? null) : null,
    myTeam: battle.fighters[seat].map((fighter) => fighterView(fighter, catalog)),
    // En orden de compra: su alineación diría quién es su reserva.
    rivalTeam: state.teams[rival].map((id) => fighterView(battle.fighters[rival].find((fighter) => fighter.pokemon.id === id)!, catalog)),
    myTitular: mineId,
    rivalTitular: rivalFighter?.pokemon.id ?? null,
    moves:
      mine && inFight && battle.deadline !== null
        ? movesOf(mine).map((move) => ({
            move,
            effectiveness: rivalFighter ? moveEffectiveness(move, rivalFighter) : null,
            used: move === "recuperar" && battle.healed[seat],
          }))
        : [],
  };
}

/** El lote abierto para un jugador. El aviso de inactividad solo lo recibe quien tiene que responder. */
function lotView(state: AuctionState, seat: Seat): AuctionLotView {
  const lot = state.lots[state.lotIndex]!;
  const base = { number: state.lotIndex + 1, silhouetteUrl: `/silhouettes/${lot.token}`, scene: lot.scene, price: lot.price };
  const bidding = state.bidding;
  if (!bidding) {
    return { ...base, currentBid: null, leader: null, turn: state.autoWinner!, turnId: 0, bids: [], retired: null, warningUntil: null, rivalIdle: false, auto: true, myLimit: 0 };
  }
  const waiting = bidding.warningUntil !== null;
  return {
    ...base,
    currentBid: bidding.currentBid,
    leader: bidding.leader,
    turn: bidding.turn,
    turnId: bidding.turnId,
    bids: structuredClone(bidding.bids),
    retired: bidding.retired,
    warningUntil: bidding.turn === seat ? bidding.warningUntil : null,
    rivalIdle: bidding.turn !== seat && waiting,
    auto: false,
    myLimit: limitOf(state, seat),
  };
}

/**
 * Estado de una sala de subasta para un jugador. Pujas y dinero son públicos, pero del lote solo va la URL opaca de la
 * silueta, y de los equipos solo cuántos llevan: ni el Pokémon real ni el mostrado salen antes de la revelación.
 */
export function buildAuctionRoomState(state: AuctionState, seat: Seat, code: string, catalog: PokemonCatalog, now: number): RoomStateView {
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
      purchases: structuredClone(state.purchases),
      lot: lot && (bidding || state.autoWinner) ? lotView(state, seat) : null,
      reveal: structuredClone(state.reveal),
      ...(state.battle ? { battle: battleView(state, seat, catalog) } : {}),
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
    auction: {
      damage: state.battle ? { ...state.battle.damage } : { 1: 0, 2: 0 },
      spent: structuredClone(state.spent),
      reveal: structuredClone(state.reveal),
    },
  };
}
