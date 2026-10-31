import { AUCTION_SCENES, type AuctionConfig, BID_STEPS, type BattleMove, type BidStep, type ErrorCode, type PauseChoice, type Seat, type ServerEvent } from "@pokemon-minigames/shared";
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
import { type CombatSide, type Fighter, bestMove, movesOf, newFighter, resolveTurn, roundLimitLoser } from "./combat.js";
import { AUTO_LOT_MS, INACTIVITY_MS, INACTIVITY_WARNING_MS, LINEUP_MS, MAX_STILL_HERE, MAX_TURNS_PER_ROUND, MOVE_MS, PAUSE_MS, REVEAL_MS, STARTING_MONEY, TEAM_SIZE, TRAP_ODDS, TURN_ANIMATION_MS, drawLots, startingPrice } from "./rules.js";
import type { AuctionDeps, AuctionLot, AuctionState } from "./types.js";
import { auctionLimit, buildAuctionGameEnded } from "./view.js";

/*
 * El motor de «Subasta Pokémon»: un reductor puro con el mismo patrón que los otros dos. La sala, las conexiones y la
 * cuenta atrás se comportan igual; lo propio es la subasta abierta por turnos de 12 Pokémon, sin reloj, la revelación y el
 * combate por turnos con elección secreta.
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

const inGame = (s: AuctionState): boolean => s.phase === "auction" || s.phase === "reveal" || s.phase === "lineup" || s.phase === "battle" || s.phase === "battle_pause";

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
    autoWinner: null,
    money: { 1: STARTING_MONEY, 2: STARTING_MONEY },
    teams: { 1: [], 2: [] },
    purchases: { 1: [], 2: [] },
    reveal: [],
    readyForBattle: [],
    battle: null,
    spent: { 1: 0, 2: 0 },
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
      onBid(c, event.seat, event.step, event.turnId);
      break;
    case "PASS":
      onPass(c, event.seat, event.turnId);
      break;
    case "STILL_HERE":
      onStillHere(c, event.seat, event.turnId);
      break;
    case "READY":
      onReady(c, event.seat);
      break;
    case "CHOOSE_LINEUP":
      onLineup(c, event.seat, event.order);
      break;
    case "CHOOSE_MOVE":
      onMove(c, event.seat, event.move);
      break;
    case "PAUSE_CONFIRM":
      onPauseConfirm(c, event.seat, event.choice);
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
    // El rival se cayó y se le acabó su tiempo mientras este tampoco estaba: ahora que volvió uno, gana.
    const rivalGrace = c.s.graceEndsAt[otherSeat(seat)];
    if (rivalGrace === undefined || c.now < rivalGrace) lastWarningOnReturn(c, seat);
    if (rivalGrace !== undefined && c.now >= rivalGrace) {
      // Puede venir de recargar: sin su estado, su pantalla no sabría ni qué asiento es.
      c.fx.push({ kind: "send_state", to: seat });
      return finish(c, "disconnect", seat);
    }
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
    case "idle":
      // Un temporizador de un turno anterior, o de antes de «Sigo aquí», ya no vale.
      if (s.phase === "auction" && s.bidding?.turnId === timer.turn && (s.bidding.warningUntil ?? s.bidding.idleAt) === timer.at) onIdle(c);
      break;
    case "auto_lot":
      if (s.phase === "auction" && s.autoWinner !== null && s.lotIndex === timer.lot) {
        const winner = s.autoWinner;
        s.autoWinner = null;
        award(c, winner, s.lots[s.lotIndex]!.price);
        s.lotIndex++;
        openLot(c);
      }
      break;
    case "grace": {
      const player = s.players[timer.seat];
      if (inGame(s) && player && !player.connected && s.graceEndsAt[timer.seat] === timer.graceEndsAt) {
        const other = otherSeat(timer.seat);
        if (s.players[other]?.connected) finish(c, "disconnect", other);
        // Los dos caídos: cada uno tiene sus 30 s. Solo se abandona cuando se le acaban también al otro.
        else if (c.now >= (s.graceEndsAt[other] ?? 0)) finish(c, "abandoned", null);
      }
      break;
    }
    case "battle":
      if (s.battle?.step === timer.step) onBattleTimer(c);
      break;
    case "choose":
    case "round":
    case "result":
      break;
  }
}

// --- La subasta -------------------------------------------------------------------------

/** Sortea los lotes. Una trampa muestra otro Pokémon cualquiera, y de él salen la silueta y el precio. El fondo es puro azar. */
function drawAllLots(c: Ctx): AuctionLot[] {
  const { rng, catalog } = c.deps;
  const pool = catalog.all().map((pokemon) => ({ ...pokemon, total: pokemon.totalStats }));
  const reals = drawLots(pool, rng);
  const shownIds = new Set(reals.map((real) => real.id));
  return reals.map((real) => {
    // Nunca la silueta de otro lote: verla dos veces delataría la trampa.
    const decoys = pool.filter((pokemon) => !shownIds.has(pokemon.id));
    const shown = c.s.config.traps && rng.int(TRAP_ODDS) === 0 ? pickOne(rng, decoys) : real;
    shownIds.add(shown.id);
    return { realId: real.id, shownId: shown.id, price: startingPrice(shown.total, rng), token: null, scene: pickOne(rng, AUCTION_SCENES) };
  });
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

/** Abre el lote actual. Si alguien ya completó su equipo, se muestra un momento y va al otro sin pujar. */
function openLot(c: Ctx): void {
  const { s } = c;
  const lot = s.lots[s.lotIndex];
  if (!lot) return revealAll(c);
  // Solo ahora existe su silueta: antes de abrir el lote no hay nada que pedir al servidor.
  lot.token = c.deps.newToken();
  c.fx.push({ kind: "register_silhouette", token: lot.token, pokemonId: lot.shownId });
  const full = (seat: Seat) => s.teams[seat].length >= TEAM_SIZE;
  if (full(1) || full(2)) {
    s.autoWinner = full(1) ? 2 : 1;
    schedule(c, c.now + AUTO_LOT_MS, { kind: "auto_lot", lot: s.lotIndex });
    sendStates(c);
    return;
  }
  const starter = s.nextStarter;
  s.nextStarter = otherSeat(starter);
  s.bidding = { starter, turn: starter, currentBid: null, leader: null, bids: [], retired: null, turnId: 0, idleAt: 0, warningUntil: null, stillHere: 0, expiredAway: false };
  startTurn(c);
  sendStates(c);
}

function startTurn(c: Ctx): void {
  const bidding = c.s.bidding!;
  bidding.turnId = c.s.nextTurnId++;
  bidding.warningUntil = null;
  bidding.stillHere = 0;
  bidding.expiredAway = false;
  waitForDecision(c);
}

/** Vuelve a contar los 60 s sin decidir. */
function waitForDecision(c: Ctx): void {
  const bidding = c.s.bidding!;
  bidding.idleAt = c.now + INACTIVITY_MS;
  schedule(c, bidding.idleAt, { kind: "idle", turn: bidding.turnId, at: bidding.idleAt });
}

function openWarning(c: Ctx): void {
  const bidding = c.s.bidding!;
  bidding.warningUntil = c.now + INACTIVITY_WARNING_MS;
  schedule(c, bidding.warningUntil, { kind: "idle", turn: bidding.turnId, at: bidding.warningUntil });
  sendStates(c);
}

/** Se cumplió un plazo sin decidir. Caído no se retira a nadie: eso lo deciden los 30 s de gracia. */
function onIdle(c: Ctx): void {
  const bidding = c.s.bidding!;
  if (!c.s.players[bidding.turn]?.connected) {
    bidding.warningUntil = null;
    bidding.expiredAway = true;
    return;
  }
  if (bidding.warningUntil !== null || bidding.stillHere >= MAX_STILL_HERE) return passTurn(c);
  openWarning(c);
}

/** Volvió con el plazo vencido: un último aviso, que no cuenta para el máximo. */
function lastWarningOnReturn(c: Ctx, seat: Seat): void {
  const bidding = c.s.bidding;
  if (c.s.phase !== "auction" || !bidding || bidding.turn !== seat || !bidding.expiredAway) return;
  bidding.expiredAway = false;
  openWarning(c);
}

function onStillHere(c: Ctx, seat: Seat, turnId: number): void {
  const { s } = c;
  const bidding = s.bidding;
  if (s.phase !== "auction" || !bidding) return reject(c, seat, "WRONG_PHASE", "Ahora no hace falta");
  if (bidding.turn !== seat || turnId !== bidding.turnId) return reject(c, seat, "NOT_YOUR_TURN", "Aún no es tu turno");
  if (bidding.warningUntil === null) return;
  bidding.warningUntil = null;
  bidding.stillHere++;
  waitForDecision(c);
  sendStates(c);
}

function onBid(c: Ctx, seat: Seat, step: BidStep | null, turnId?: number): void {
  const { s } = c;
  const bidding = s.bidding;
  if (s.phase !== "auction" || !bidding) return reject(c, seat, "WRONG_PHASE", "Ahora no se puede pujar");
  // Una pulsación de un turno que ya pasó no vale para este: su dueño aún no ha visto el lote.
  if (bidding.turn !== seat || (turnId !== undefined && turnId !== bidding.turnId)) return reject(c, seat, "NOT_YOUR_TURN", "Aún no es tu turno");
  const lot = s.lots[s.lotIndex]!;
  const opening = bidding.currentBid === null;
  // La primera puja es el precio inicial; las demás suben uno de los saltos.
  if (opening ? step !== null : step === null || !BID_STEPS.includes(step)) return reject(c, seat, "INVALID_BID", "Esa puja no es válida");
  const amount = opening ? lot.price : bidding.currentBid! + step!;
  if (amount > auctionLimit(s, seat)) return reject(c, seat, "INVALID_BID", "No te alcanza para esa puja");
  // El otro ya se retiró: abrir es llevárselo.
  if (bidding.retired !== null) {
    award(c, seat, amount);
    return nextLot(c);
  }
  bidding.currentBid = amount;
  bidding.leader = seat;
  bidding.bids.push({ seat, amount });
  bidding.turn = otherSeat(seat);
  startTurn(c);
  sendStates(c);
}

function onPass(c: Ctx, seat: Seat, turnId?: number): void {
  const { s } = c;
  if (s.phase !== "auction" || !s.bidding) return reject(c, seat, "WRONG_PHASE", "Ahora no te puedes retirar");
  if (s.bidding.turn !== seat || (turnId !== undefined && turnId !== s.bidding.turnId)) return reject(c, seat, "NOT_YOUR_TURN", "Aún no es tu turno");
  passTurn(c);
}

/** Quien tiene el turno se retira, y es definitivo en este lote. */
function passTurn(c: Ctx): void {
  const { s } = c;
  const bidding = s.bidding!;
  const lot = s.lots[s.lotIndex]!;
  if (bidding.leader !== null) {
    award(c, bidding.leader, bidding.currentBid!);
    return nextLot(c);
  }
  if (bidding.retired === null) {
    bidding.retired = bidding.turn;
    bidding.turn = otherSeat(bidding.turn);
    startTurn(c);
    sendStates(c);
    return;
  }
  // Los dos se retiraron: va a quien tiene menos, para que todos terminen con su equipo completo.
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
  s.spent[seat] += paid;
  s.teams[seat].push(lot.realId);
  s.purchases[seat].push(`/silhouettes/${lot.token}`);
  emit(c, "all", { name: "auction-sale", payload: { lot: s.lotIndex + 1, winner: seat, paid } });
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
  s.reveal = s.lots.map((lot) => ({ owner: ownerOf(lot.realId), pokemon: toPokemonView(c.deps.catalog.get(lot.realId)!), wasTrap: lot.shownId !== lot.realId }));
  emit(c, "all", { name: "auction-reveal", payload: { reveal: structuredClone(s.reveal) } });
  const fighters = (seat: Seat): Fighter[] => s.teams[seat].map((id) => newFighter(c.deps.catalog.get(id)!));
  s.battle = {
    fighters: { 1: fighters(1), 2: fighters(2) },
    titular: { 1: null, 2: null },
    round: 0,
    turn: 0,
    lineups: {},
    moves: {},
    pauses: {},
    healed: { 1: false, 2: false },
    deadline: null,
    step: 0,
    roundOver: false,
    damage: { 1: 0, 2: 0 },
  };
  startStep(c, REVEAL_MS);
  sendStates(c);
}

// --- El combate -------------------------------------------------------------------------

/** Abre un paso con su plazo. El temporizador de cualquier paso anterior queda obsoleto. */
function startStep(c: Ctx, ms: number): void {
  const battle = c.s.battle!;
  battle.step = c.s.nextTurnId++;
  battle.deadline = c.now + ms;
  schedule(c, battle.deadline, { kind: "battle", step: battle.step });
}

function onBattleTimer(c: Ctx): void {
  const { s } = c;
  const battle = s.battle!;
  if (s.phase === "reveal") return beginLineup(c);
  if (s.phase === "lineup") return beginFirstRound(c);
  if (s.phase === "battle_pause") return closePause(c);
  if (s.phase !== "battle") return;
  // Sin plazo abierto es que acabó la animación; con él, se agotó el tiempo de elegir.
  if (battle.deadline === null) afterAnimation(c);
  else resolveCurrentTurn(c);
}

function onReady(c: Ctx, seat: Seat): void {
  const { s } = c;
  // Un «Listo» doble o justo al acabar la revelación llega tarde: no es un error de nadie.
  if (s.phase === "lineup" || s.phase === "battle" || s.phase === "battle_pause") return;
  if (s.phase !== "reveal") return reject(c, seat, "WRONG_PHASE", "Ahora no hay nada que confirmar");
  if (!s.readyForBattle.includes(seat)) s.readyForBattle.push(seat);
  if (s.readyForBattle.length === 2) beginLineup(c);
  else c.fx.push({ kind: "send_state", to: seat });
}

function beginLineup(c: Ctx): void {
  c.s.phase = "lineup";
  startStep(c, LINEUP_MS);
  sendStates(c);
}

function onLineup(c: Ctx, seat: Seat, order: number[]): void {
  const { s } = c;
  if (s.phase !== "lineup") return reject(c, seat, "WRONG_PHASE", "Ahora no se elige la alineación");
  const team = s.teams[seat];
  const valid = Array.isArray(order) && order.length === team.length && new Set(order).size === team.length && order.every((id) => team.includes(id));
  if (!valid) return reject(c, seat, "INVALID_CHOICE", "Esa alineación no es válida");
  s.battle!.lineups[seat] = [...order];
  c.fx.push({ kind: "send_state", to: seat });
  if (s.battle!.lineups[otherSeat(seat)]) beginFirstRound(c);
}

function beginFirstRound(c: Ctx): void {
  const battle = c.s.battle!;
  for (const seat of [1, 2] as const) {
    const order = battle.lineups[seat] ?? c.s.teams[seat];
    battle.fighters[seat] = order.map((id) => battle.fighters[seat].find((fighter) => fighter.pokemon.id === id)!);
    battle.titular[seat] = order[0]!;
  }
  beginRound(c);
}

function beginRound(c: Ctx): void {
  const { s } = c;
  const battle = s.battle!;
  s.phase = "battle";
  battle.round++;
  battle.turn = 0;
  battle.healed = { 1: false, 2: false };
  battle.roundOver = false;
  beginTurn(c);
}

function beginTurn(c: Ctx): void {
  const battle = c.s.battle!;
  battle.turn++;
  battle.moves = {};
  startStep(c, MOVE_MS);
  sendStates(c);
}

const titularOf = (c: Ctx, seat: Seat): Fighter => {
  const battle = c.s.battle!;
  return battle.fighters[seat].find((fighter) => fighter.pokemon.id === battle.titular[seat])!;
};

function onMove(c: Ctx, seat: Seat, move: BattleMove): void {
  const { s } = c;
  const battle = s.battle;
  // Sin plazo abierto se está animando el turno anterior.
  if (s.phase !== "battle" || !battle || battle.deadline === null) return reject(c, seat, "WRONG_PHASE", "Ahora no se elige movimiento");
  if (!movesOf(titularOf(c, seat)).includes(move)) return reject(c, seat, "INVALID_CHOICE", "Ese movimiento no es válido");
  if (move === "recuperar" && battle.healed[seat]) return reject(c, seat, "INVALID_CHOICE", "Recuperar ya se usó en este asalto");
  battle.moves[seat] = move;
  // Solo a quien eligió: el rival no sabe ni que ya eligió.
  c.fx.push({ kind: "send_state", to: seat });
  if (battle.moves[otherSeat(seat)]) resolveCurrentTurn(c);
}

function resolveCurrentTurn(c: Ctx): void {
  const battle = c.s.battle!;
  const sideOf = (seat: Seat): CombatSide => ({ fighter: titularOf(c, seat), healed: battle.healed[seat] });
  const sides = { 1: sideOf(1), 2: sideOf(2) };
  const choiceOf = (seat: Seat): BattleMove => battle.moves[seat] ?? bestMove(sides[seat].fighter, sides[otherSeat(seat)].fighter);
  const actions = resolveTurn(sides, { 1: choiceOf(1), 2: choiceOf(2) }, c.deps.rng);
  battle.healed = { 1: sides[1].healed, 2: sides[2].healed };
  for (const action of actions) battle.damage[action.actor] += action.damage;
  emit(c, "all", { name: "battle-turn", payload: { round: battle.round, turn: battle.turn, actions } });

  const fallen = ([1, 2] as const).find((seat) => sides[seat].fighter.hp <= 0);
  if (fallen !== undefined || battle.turn >= MAX_TURNS_PER_ROUND) {
    const atLimit = fallen === undefined;
    const loser = fallen ?? roundLimitLoser({ 1: sides[1].fighter, 2: sides[2].fighter }, c.deps.rng);
    sides[loser].fighter.hp = 0;
    battle.roundOver = true;
    emit(c, "all", { name: "battle-round-ended", payload: { round: battle.round, loser, atLimit } });
  }
  // Mientras se anima no hay plazo abierto.
  battle.step = c.s.nextTurnId++;
  battle.deadline = null;
  battle.moves = {};
  schedule(c, c.now + TURN_ANIMATION_MS, { kind: "battle", step: battle.step });
  sendStates(c);
}

/** Terminó la animación: otro turno, o la pausa si cayó alguien. */
function afterAnimation(c: Ctx): void {
  const { s } = c;
  const battle = s.battle!;
  if (battle.roundOver) {
    s.phase = "battle_pause";
    battle.pauses = {};
    for (const seat of [1, 2] as const) if (titularOf(c, seat)?.hp === 0) battle.titular[seat] = null;
    startStep(c, PAUSE_MS);
    sendStates(c);
    return;
  }
  beginTurn(c);
}

function onPauseConfirm(c: Ctx, seat: Seat, choice: PauseChoice): void {
  const { s } = c;
  if (s.phase !== "battle_pause") return reject(c, seat, "WRONG_PHASE", "Ahora no hay pausa");
  if (!validPause(c, seat, choice)) return reject(c, seat, "INVALID_CHOICE", "Esa elección no es válida");
  const battle = s.battle!;
  battle.pauses[seat] = choice;
  // Solo a quien confirmó: hasta cerrar la pausa el rival no ve el titular.
  c.fx.push({ kind: "send_state", to: seat });
  if (battle.pauses[otherSeat(seat)]) closePause(c);
}

/** Un titular propio y vivo. */
function validPause(c: Ctx, seat: Seat, choice: PauseChoice): boolean {
  if (typeof choice !== "object" || choice === null) return false;
  return c.s.battle!.fighters[seat].some((fighter) => fighter.pokemon.id === choice.titular && fighter.hp > 0);
}

function closePause(c: Ctx): void {
  const { s } = c;
  const battle = s.battle!;
  for (const seat of [1, 2] as const) {
    const choice = battle.pauses[seat];
    if (choice) battle.titular[seat] = choice.titular;
    // No decidió: sale el primero vivo, en su orden. Quien ganó el asalto sigue como estaba.
    else if (battle.titular[seat] === null) battle.titular[seat] = battle.fighters[seat].find((fighter) => fighter.hp > 0)?.pokemon.id ?? null;
  }
  const out = ([1, 2] as const).find((seat) => battle.titular[seat] === null);
  if (out !== undefined) return finish(c, "completed", otherSeat(out));
  battle.pauses = {};
  beginRound(c);
}

function finish(c: Ctx, reason: GameOutcome["reason"], winnerSeat: Seat | null): void {
  const { s } = c;
  s.phase = "finished";
  s.bidding = null;
  s.outcome = { winnerSeat, reason };
  emit(c, "all", { name: "game-ended", payload: buildAuctionGameEnded(s, c.deps.catalog) });
}
