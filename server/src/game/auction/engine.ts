import { AUCTION_ITEMS, type AuctionConfig, BID_STEPS, type BidStep, type ErrorCode, type Seat, type ServerEvent } from "@pokemon-minigames/shared";
import {
  RECONNECT_GRACE_SECONDS,
  REMATCH_ROOM_TTL_SECONDS,
  START_COUNTDOWN_SECONDS,
  WAITING_ROOM_TTL_MINUTES,
  minutes,
  seconds,
} from "../constants.js";
import { type Effect, type GameEvent, type GameOutcome, type PlayerState, type SeatOccupant, type TimerId, otherSeat } from "../engine/types.js";
import { toPokemonView } from "../engine/view.js";
import { pickOne } from "../rng.js";
import { BID_TURN_MS, ITEM_PRICES, STARTING_MONEY, TEAM_SIZE, TRAP_ODDS, drawLots, startingPrice } from "./rules.js";
import type { AuctionDeps, AuctionLot, AuctionState } from "./types.js";
import { auctionLimit, buildAuctionGameEnded } from "./view.js";

/*
 * El motor de «Subasta Pokémon»: un reductor puro con el mismo patrón que los otros dos. La sala, las conexiones y la
 * cuenta atrás se comportan igual; lo propio es la subasta abierta por turnos de 6 Pokémon y 3 objetos. Se detiene en la
 * revelación: el combate llega después.
 */

/** Un objeto tras cada 2 Pokémon. */
const ITEM_EVERY = 2;

interface Ctx {
  s: AuctionState;
  fx: Effect[];
  now: number;
  deps: AuctionDeps;
}

export interface AuctionResult {
  state: AuctionState;
  effects: Effect[];
}

function newPlayer(seat: Seat, { userId, username, guest, avatarId }: SeatOccupant): PlayerState {
  return { seat, userId, username, ...(guest ? { guest: true } : {}), ...(avatarId ? { avatarId } : {}), connected: false, totalStats: 0, team: [] };
}

const inGame = (s: AuctionState): boolean => s.phase === "auction" || s.phase === "reveal";

function emit(c: Ctx, to: Seat | "all", event: ServerEvent): void {
  c.fx.push({ kind: "emit", to, event });
}

function schedule(c: Ctx, at: number, timer: TimerId): void {
  c.fx.push({ kind: "schedule", at, timer });
}

function reject(c: Ctx, seat: Seat, code: ErrorCode, message: string): void {
  emit(c, seat, { name: "error", payload: { code, message } });
}

function sendStates(c: Ctx): void {
  c.fx.push({ kind: "send_state", to: 1 }, { kind: "send_state", to: 2 });
}

export function createAuctionGame(config: AuctionConfig, creator: SeatOccupant, now: number, options: { rematch?: boolean } = {}): AuctionResult {
  const state: AuctionState = {
    phase: "waiting",
    config,
    players: { 1: newPlayer(1, creator) },
    lots: [],
    lotIndex: 0,
    nextStarter: 1,
    bidding: null,
    money: { 1: STARTING_MONEY, 2: STARTING_MONEY },
    teams: { 1: [], 2: [] },
    items: { 1: [], 2: [] },
    reveal: [],
    nextTurnId: 1,
    expiresAt: now + (options.rematch ? seconds(REMATCH_ROOM_TTL_SECONDS) : minutes(WAITING_ROOM_TTL_MINUTES)),
    ...(options.rematch ? { rematch: true as const } : {}),
    startsAt: null,
    graceEndsAt: {},
    outcome: null,
  };
  return { state, effects: [{ kind: "schedule", at: state.expiresAt, timer: { kind: "expire", expiresAt: state.expiresAt } }] };
}

export function reduceAuction(prev: AuctionState, event: GameEvent, now: number, deps: AuctionDeps): AuctionResult {
  if (prev.phase === "finished") return { state: prev, effects: [] };
  const c: Ctx = { s: structuredClone(prev), fx: [], now, deps };
  switch (event.type) {
    case "PLAYER_JOINED":
      onJoined(c, event);
      break;
    case "PLAYER_CONNECTED":
      onConnected(c, event.seat);
      break;
    case "PLAYER_DISCONNECTED":
      onDisconnected(c, event.seat);
      break;
    case "BID":
      onBid(c, event.seat, event.step);
      break;
    case "PASS":
      onPass(c, event.seat);
      break;
    case "LEAVE":
      onLeave(c, event.seat);
      break;
    case "TIMER":
      onTimer(c, event.timer);
      break;
    case "CHOOSE_TYPE":
    case "SUBMIT":
      reject(c, event.seat, "WRONG_PHASE", "En este juego no se hace eso");
      break;
  }
  return { state: c.s, effects: c.fx };
}

// --- Sala y conexiones (como en los otros juegos) ---------------------------------------

function onJoined(c: Ctx, joiner: SeatOccupant): void {
  if (c.s.phase !== "waiting" || c.s.players[2]) return;
  const player = newPlayer(2, joiner);
  c.s.players[2] = player;
  emit(c, 1, {
    name: "player-joined",
    payload: { username: player.username, ...(player.guest ? { guest: true } : {}), ...(player.avatarId ? { avatarId: player.avatarId } : {}) },
  });
}

function onConnected(c: Ctx, seat: Seat): void {
  const player = c.s.players[seat];
  if (!player) return;
  const wasAway = !player.connected;
  player.connected = true;
  if (inGame(c.s) && wasAway) {
    delete c.s.graceEndsAt[seat];
    emit(c, otherSeat(seat), { name: "opponent-reconnected", payload: undefined });
  }
  tryStart(c);
  c.fx.push({ kind: "send_state", to: seat });
  if (!inGame(c.s) && c.s.players[otherSeat(seat)]) c.fx.push({ kind: "send_state", to: otherSeat(seat) });
}

function tryStart(c: Ctx): void {
  const { s } = c;
  if (s.phase !== "waiting") return;
  const [a, b] = [s.players[1], s.players[2]];
  if (!a || !b || !a.connected || !b.connected) return;
  s.phase = "starting";
  s.startsAt = c.now + seconds(START_COUNTDOWN_SECONDS);
  emit(c, "all", { name: "game-starting", payload: { startsAt: s.startsAt, serverNow: c.now } });
  schedule(c, s.startsAt, { kind: "start", startsAt: s.startsAt });
  if (s.rematch && s.expiresAt - c.now <= seconds(REMATCH_ROOM_TTL_SECONDS)) {
    s.expiresAt = c.now + minutes(WAITING_ROOM_TTL_MINUTES);
    schedule(c, s.expiresAt, { kind: "expire", expiresAt: s.expiresAt });
  }
}

function backToWaiting(c: Ctx): void {
  c.s.phase = "waiting";
  c.s.startsAt = null;
  if (c.now >= c.s.expiresAt) finish(c, "expired", null);
}

function onDisconnected(c: Ctx, seat: Seat): void {
  const { s } = c;
  const player = s.players[seat];
  if (!player || !player.connected) return;
  player.connected = false;
  if (s.phase === "starting" || s.phase === "waiting") {
    if (s.phase === "starting") backToWaiting(c);
    if (s.phase === "waiting" && s.players[otherSeat(seat)]) c.fx.push({ kind: "send_state", to: otherSeat(seat) });
    return;
  }
  if (inGame(s)) {
    const graceEndsAt = c.now + seconds(RECONNECT_GRACE_SECONDS);
    s.graceEndsAt[seat] = graceEndsAt;
    emit(c, otherSeat(seat), { name: "opponent-disconnected", payload: { graceEndsAt, serverNow: c.now } });
    schedule(c, graceEndsAt, { kind: "grace", seat, graceEndsAt });
  }
}

function onLeave(c: Ctx, seat: Seat): void {
  const { s } = c;
  if (s.phase === "waiting" || s.phase === "starting") {
    if (seat === 1) {
      finish(c, "cancelled", null);
    } else if (s.players[2]) {
      delete s.players[2];
      backToWaiting(c);
      if (s.phase === "waiting") c.fx.push({ kind: "send_state", to: 1 });
    }
    return;
  }
  if (inGame(s)) finish(c, "forfeit", otherSeat(seat));
}

function onTimer(c: Ctx, timer: TimerId): void {
  const { s } = c;
  switch (timer.kind) {
    case "expire":
      if (s.phase === "waiting" && s.expiresAt === timer.expiresAt) finish(c, "expired", null);
      break;
    case "start":
      if (s.phase === "starting" && s.startsAt === timer.startsAt) beginAuction(c);
      break;
    case "bid":
      // Un temporizador de un turno anterior ya no vale: se pujó a tiempo.
      if (s.phase === "auction" && s.bidding?.turnId === timer.turn) passTurn(c);
      break;
    case "grace": {
      const player = s.players[timer.seat];
      if (inGame(s) && player && !player.connected && s.graceEndsAt[timer.seat] === timer.graceEndsAt) {
        const other = otherSeat(timer.seat);
        if (s.players[other]?.connected) finish(c, "disconnect", other);
        else finish(c, "abandoned", null);
      }
      break;
    }
    case "choose":
    case "round":
    case "result":
      break;
  }
}

// --- La subasta -------------------------------------------------------------------------

/** Sortea los lotes. Una trampa muestra otro Pokémon cualquiera, y de él salen la silueta y el precio. */
function drawAllLots(c: Ctx): AuctionLot[] {
  const { rng, catalog } = c.deps;
  const pool = catalog.all().map((pokemon) => ({ ...pokemon, total: pokemon.totalStats }));
  const lots: AuctionLot[] = [];
  const reals = drawLots(pool, rng);
  const shownIds = new Set(reals.map((real) => real.id));
  reals.forEach((real, index) => {
    // Nunca la silueta de otro lote: verla dos veces delataría la trampa.
    const decoys = pool.filter((pokemon) => !shownIds.has(pokemon.id));
    const shown = c.s.config.traps && rng.int(TRAP_ODDS) === 0 ? pickOne(rng, decoys) : real;
    shownIds.add(shown.id);
    lots.push({ kind: "pokemon", realId: real.id, shownId: shown.id, price: startingPrice(shown.total, rng), token: null });
    if ((index + 1) % ITEM_EVERY === 0) {
      const item = pickOne(rng, AUCTION_ITEMS);
      lots.push({ kind: "item", item, price: ITEM_PRICES[item] });
    }
  });
  return lots;
}

function beginAuction(c: Ctx): void {
  const { s } = c;
  s.phase = "auction";
  s.startsAt = null;
  s.lots = drawAllLots(c);
  s.nextStarter = (c.deps.rng.int(2) + 1) as Seat;
  s.lotIndex = 0;
  openLot(c);
}

/** Abre el lote actual. Si alguien ya tiene 3 Pokémon, los que queden van al otro sin pujar. */
function openLot(c: Ctx): void {
  const { s } = c;
  for (;;) {
    const lot = s.lots[s.lotIndex];
    if (!lot) {
      revealAll(c);
      return;
    }
    const full = (seat: Seat) => s.teams[seat].length >= TEAM_SIZE;
    if (lot.kind === "pokemon" && (full(1) || full(2))) {
      award(c, full(1) ? 2 : 1, lot.price);
      s.lotIndex++;
      continue;
    }
    if (lot.kind === "pokemon") {
      // Solo ahora existe su silueta: antes de abrir el lote no hay nada que pedir al servidor.
      lot.token = c.deps.newToken();
      c.fx.push({ kind: "register_silhouette", token: lot.token, pokemonId: lot.shownId });
    }
    const starter = s.nextStarter;
    s.nextStarter = otherSeat(starter);
    s.bidding = { starter, turn: starter, currentBid: null, leader: null, firstPassed: false, deadline: 0, turnId: 0 };
    startTurn(c);
    sendStates(c);
    return;
  }
}

function startTurn(c: Ctx): void {
  const bidding = c.s.bidding!;
  bidding.turnId = c.s.nextTurnId++;
  bidding.deadline = c.now + BID_TURN_MS;
  schedule(c, bidding.deadline, { kind: "bid", turn: bidding.turnId });
}

function onBid(c: Ctx, seat: Seat, step: BidStep | null): void {
  const { s } = c;
  const bidding = s.bidding;
  if (s.phase !== "auction" || !bidding) return reject(c, seat, "WRONG_PHASE", "Ahora no se puede pujar");
  if (bidding.turn !== seat) return reject(c, seat, "NOT_YOUR_TURN", "Aún no es tu turno");
  const lot = s.lots[s.lotIndex]!;
  const opening = bidding.currentBid === null;
  // La primera puja es el precio inicial; las demás suben uno de los saltos.
  if (opening ? step !== null : step === null || !BID_STEPS.includes(step)) return reject(c, seat, "INVALID_BID", "Esa puja no es válida");
  const amount = opening ? lot.price : bidding.currentBid! + step!;
  if (amount > auctionLimit(s, seat)) return reject(c, seat, "INVALID_BID", "No te alcanza para esa puja");
  bidding.currentBid = amount;
  bidding.leader = seat;
  bidding.turn = otherSeat(seat);
  startTurn(c);
  sendStates(c);
}

function onPass(c: Ctx, seat: Seat): void {
  const { s } = c;
  if (s.phase !== "auction" || !s.bidding) return reject(c, seat, "WRONG_PHASE", "Ahora no se puede pasar");
  if (s.bidding.turn !== seat) return reject(c, seat, "NOT_YOUR_TURN", "Aún no es tu turno");
  passTurn(c);
}

/** Quien tiene el turno pasa (o se le acabó el tiempo). */
function passTurn(c: Ctx): void {
  const { s } = c;
  const bidding = s.bidding!;
  const lot = s.lots[s.lotIndex]!;
  if (bidding.leader !== null) {
    award(c, bidding.leader, bidding.currentBid!);
    return nextLot(c);
  }
  if (!bidding.firstPassed) {
    bidding.firstPassed = true;
    bidding.turn = otherSeat(bidding.turn);
    startTurn(c);
    sendStates(c);
    return;
  }
  // Los dos pasaron. Un objeto se queda sin dueño; un Pokémon va a quien tiene menos, para que todos terminen con 3.
  if (lot.kind === "item") {
    emit(c, "all", { name: "auction-sale", payload: { lot: s.lotIndex + 1, kind: "item", winner: null, paid: 0, item: lot.item } });
    return nextLot(c);
  }
  const [a, b] = [s.teams[1].length, s.teams[2].length];
  award(c, a === b ? bidding.starter : a < b ? 1 : 2, lot.price);
  nextLot(c);
}

/** Entrega el lote actual. Si no le alcanza, se lo lleva gratis: todos terminan con su equipo completo. */
function award(c: Ctx, seat: Seat, price: number): void {
  const { s } = c;
  const lot = s.lots[s.lotIndex]!;
  const paid = s.money[seat] >= price ? price : 0;
  s.money[seat] -= paid;
  if (lot.kind === "pokemon") s.teams[seat].push(lot.realId);
  else s.items[seat].push(lot.item);
  emit(c, "all", {
    name: "auction-sale",
    payload: { lot: s.lotIndex + 1, kind: lot.kind, winner: seat, paid, ...(lot.kind === "item" ? { item: lot.item } : {}) },
  });
}

function nextLot(c: Ctx): void {
  c.s.lotIndex++;
  c.s.bidding = null;
  openLot(c);
}

function revealAll(c: Ctx): void {
  const { s } = c;
  s.phase = "reveal";
  s.bidding = null;
  const ownerOf = (id: number): Seat => (s.teams[1].includes(id) ? 1 : 2);
  s.reveal = s.lots.flatMap((lot) =>
    lot.kind === "pokemon" ? [{ owner: ownerOf(lot.realId), pokemon: toPokemonView(c.deps.catalog.get(lot.realId)!), wasTrap: lot.token !== null && lot.shownId !== lot.realId }] : [],
  );
  emit(c, "all", { name: "auction-reveal", payload: { reveal: structuredClone(s.reveal) } });
  sendStates(c);
  // Hasta que llegue el combate, la partida termina aquí, sin ganador.
  finish(c, "completed", null);
}

function finish(c: Ctx, reason: GameOutcome["reason"], winnerSeat: Seat | null): void {
  const { s } = c;
  s.phase = "finished";
  s.bidding = null;
  s.outcome = { winnerSeat, reason };
  emit(c, "all", { name: "game-ended", payload: buildAuctionGameEnded(s, c.deps.catalog) });
}
