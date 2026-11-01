import type { AuctionLotView, BattleFighterView, BattleMoveView, BattleView, GameEndedPayload, PokemonView, RoomPlayerView, RoomStateView, Seat } from "@pokemon-minigames/shared";
import type { PokemonCatalog } from "../../catalog/pokemon-catalog.js";
import { SEATS, otherSeat } from "../engine/types.js";
import { toPokemonView } from "../engine/view.js";
import { ABILITY_TEXT } from "./abilities.js";
import { type Fighter, STRUGGLE, availableMoves, moveData, moveEffectiveness } from "./combat.js";
import { getMoveBook } from "./move-book.js";
import { bidCap } from "./rules.js";
import type { AuctionState } from "./types.js";

function limitOf(state: AuctionState, seat: Seat): number {
  return Math.min(state.money[seat], bidCap(state.money[seat], state.teams[seat].length));
}

/** Lo máximo que puede pujar un jugador por el lote abierto. */
export const auctionLimit = limitOf;

function abilityView(id: string | null): BattleFighterView["ability"] {
  if (!id) return null;
  const description = ABILITY_TEXT[id];
  return { id, name: getMoveBook().abilities[id]?.es ?? id, description: description ?? "Sin efecto en este juego.", active: description !== undefined };
}

/** Qué hace además de su daño, en palabras. */
function effectText(id: string): string | null {
  const effect = moveData(id)?.effect;
  if (!effect) return null;
  if (effect.healing) return `Cura el ${effect.healing} % de sus PS`;
  if (effect.ailment) return { burn: "Puede quemar", paralysis: "Puede paralizar", poison: "Puede envenenar", sleep: "Duerme al rival" }[effect.ailment];
  if (effect.stats?.length) return effect.stats.every((one) => one.target === "user") ? (effect.stats.every((one) => one.change > 0) ? "Sube sus stats" : "Baja sus stats") : "Baja los stats del rival";
  return null;
}

function moveViews(mine: Fighter, rival: Fighter | undefined): BattleMoveView[] {
  const available = availableMoves(mine);
  const slots = available[0] === STRUGGLE ? [{ id: STRUGGLE, pp: 1 }] : mine.moves;
  return slots.map(({ id, pp }) => {
    const move = moveData(id)!;
    return {
      move: id,
      name: move.names.es,
      type: id === STRUGGLE ? null : move.type,
      category: move.category,
      power: move.power,
      accuracy: move.accuracy,
      pp,
      maxPp: move.pp,
      effectiveness: rival && move.category !== "status" ? moveEffectiveness(id, rival) : null,
      effect: effectText(id),
    };
  });
}

function fighterView(fighter: Fighter, catalog: PokemonCatalog): BattleFighterView {
  const stages = Object.fromEntries(Object.entries(fighter.stages).filter(([, stage]) => stage !== 0));
  return { pokemon: toPokemonView(catalog.get(fighter.pokemon.id)!), hp: fighter.hp, maxHp: fighter.maxHp, ability: abilityView(fighter.ability), status: fighter.status, stages };
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
  const chosen = battle.moves[seat] !== undefined || battle.switches[seat] !== undefined;
  const confirmed = state.phase === "reveal" ? state.readyForBattle.includes(seat) : state.phase === "lineup" ? battle.lineups[seat] !== undefined : state.phase === "battle_pause" ? battle.pauses[seat] !== undefined : chosen;
  return {
    round: battle.round,
    turn: battle.turn,
    scene: battle.scene,
    // Elegir movimiento no tiene reloj: su plazo es solo cuándo se avisa.
    deadline: inFight ? null : battle.deadline,
    choosing: inFight && battle.choosing,
    stepId: battle.step,
    warningUntil: inFight && battle.choosing ? battle.idle[seat].warningUntil : null,
    // Solo a quien ya eligió: a los demás les diría si el rival eligió.
    rivalIdle: inFight && battle.choosing && chosen && battle.idle[rival].warningUntil !== null,
    confirmed,
    myLineup: state.phase === "lineup" ? structuredClone(battle.lineups[seat] ?? null) : null,
    myMove: battle.moves[seat] ?? null,
    mySwitch: battle.switches[seat] ?? null,
    myPause: state.phase === "battle_pause" ? structuredClone(battle.pauses[seat] ?? null) : null,
    myTeam: battle.fighters[seat].map((fighter) => fighterView(fighter, catalog)),
    // En orden de compra: su alineación diría quién es su reserva.
    rivalTeam: state.teams[rival].map((id) => fighterView(battle.fighters[rival].find((fighter) => fighter.pokemon.id === id)!, catalog)),
    myTitular: mineId,
    rivalTitular: rivalFighter?.pokemon.id ?? null,
    moves:
      mine && inFight && battle.choosing
        ? moveViews(mine, rivalFighter)
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
